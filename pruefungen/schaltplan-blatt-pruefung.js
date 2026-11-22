// Prüfung Auto-Schaltplan auf Blättern (schaltplan-blatt.js + blatt.js):
// Jeder Querverweis am Kontakt zeigt auf das Blatt und die Spalte seiner Spule,
// jeder Eintrag im Kontaktspiegel auf Blatt und Spalte seines Kontakts. Nachgerechnet
// wird aus den gedruckten Blättern selbst (viewBox, Ausschnitt, Spaltenzahl), nicht aus
// der Aufteilung. Kein Kontakt und keine Spule liegt auf einer Blattgrenze; Steuer-
// und Laststromkreis stehen auf eigenen Blättern; Schienen tragen Blattverweise.
//
//   node pruefungen/schaltplan-blatt-pruefung.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const WURZEL = path.join(__dirname, '..');
function server() {
  const typen = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(WURZEL) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': typen[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}
let gut = 0, schlecht = 0;
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };
(async () => {
  const srv = await server(), browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.removeItem('valisBlattAnsicht'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
  const faelle = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    toggleWorkspaceView('circuit-wrapper'); await w(500);
    // Gedruckte Blätter nachmessen: je Blatt Band, Nummer, x-Bereich, Spaltenbreite
    const messen = (html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return [...d.querySelectorAll('.vb-blatt')].map(b => {
        const s = b.querySelector('svg[data-schaltplan-blatt]'); if (!s) return null;
        const [vx, , S] = s.getAttribute('viewBox').split(/\s+/).map(Number);
        const clip = s.querySelector('clipPath rect');
        const breite = clip ? +clip.getAttribute('width') : S;
        const spalten = b.querySelectorAll('.vb-sp').length;
        const art = (b.querySelector('.art') || {}).textContent || '';
        return { nr: +b.getAttribute('data-blatt'), vx, S, breite, spalten, band: /Laststromkreis/.test(art) ? 2 : 1, svg: s,
          verweise: [...s.querySelectorAll('.circ-blattverweis')].map(t => t.textContent) };
      }).filter(Boolean);
    };
    const adr = (bl, x, band) => {
      const b = bl.find(q => q.band === band && x >= q.vx - 1e-6 && x < q.vx + q.breite - 1e-6) || bl.filter(q => q.band === band).slice(-1)[0];
      return b ? { a: b.nr + '.' + Math.max(1, Math.min(b.spalten, Math.floor((x - b.vx) / (b.S / b.spalten)) + 1)), rand: Math.min(x - b.vx, b.vx + b.breite - x), b } : { a: '?', rand: 0 };
    };
    const fall = async (name, vorher) => {
      const o = { name };
      if (vorher) await vorher();
      await w(700);
      const html = SchaltplanBlatt.drucken(true);
      const I = SchaltplanBlatt.info;
      if (!html || !I) { o.fehlt = true; return o; }
      const bl = messen(html);
      o.blaetter = bl.length; o.baender = [...new Set(bl.map(b => b.band))];
      o.dual = !!I.last;
      o.falschQv = []; o.falschSp = []; o.amRand = []; o.qv = 0; o.sp = 0; o.kontakte = 0;
      Object.keys(I.relais).forEach(id => {
        const r = I.relais[id];
        if (!r.spule) return;
        const soll = adr(bl, r.spule.x, r.spule.band);
        if (soll.rand < 8) o.amRand.push(r.name + ' Spule');
        r.kontakte.forEach(k => {
          o.kontakte++;
          const ka = adr(bl, k.x, k.band);
          if (ka.rand < 8) o.amRand.push(r.name + ' Kontakt');
          // Querverweis am Kontakt im Blatt des Kontakts
          const qv = [...ka.b.svg.querySelectorAll('text.circ-qv')].filter(t => t.getAttribute('data-relais') === id && Math.abs(+t.getAttribute('x') - (k.x + 6)) < 0.5 && Math.abs(+t.getAttribute('y') - (k.y + 28)) < 0.5);
          if (qv.length !== 1 || qv[0].firstChild.textContent !== '↑ ' + soll.a) o.falschQv.push(`${r.name}@${ka.a}: ${qv.map(t => t.firstChild.textContent).join('/') || '–'} statt ↑ ${soll.a}`); else o.qv++;
        });
        // Spiegel unter der Spule: genau die Adressen der Kontakte
        const g = soll.b.svg.querySelector(`.circ-spiegel[data-relais="${CSS.escape(id)}"]`);
        const ist = g ? [...g.querySelectorAll('.circ-spiegel-nr')].map(t => t.textContent).sort() : [];
        const sollSp = r.kontakte.map(k => adr(bl, k.x, k.band).a).sort();
        if (JSON.stringify(ist) !== JSON.stringify(sollSp)) o.falschSp.push(`${r.name}: ${ist.join(',')} statt ${sollSp.join(',')}`); else o.sp++;
      });
      // Schienenverweise: jedes Blatt außer dem letzten eines Bands zeigt aufs nächste
      o.verweiseOk = bl.every((b, i) => { const n = bl[i + 1]; return !(n && n.band === b.band) || b.verweise.includes(`→ ${n.nr}.1`); });
      o.fluid = I.fluidHoehe > 0; o.fluidBlatt = /Fluid-Schaltplan/.test(html) && (bl[0] || {}).nr === 2;
      o.keinePfadnr = !/class="circ-pfadnr"/.test(html) && !/circ-dropzone/.test(html);
      o.html = name === 'full_demo dual' ? html : '';
      return o;
    };
    const out = [];
    for (const k of ['portal_crane', 'full_demo', 'roboter_handshake', 'mensch_lichtgitter', 'schrittkette_bohrer']) {
      out.push(await fall(k, async () => { loadExample(k); }));
    }
    out.push(await fall('full_demo dual', async () => { loadExample('full_demo'); await w(300); if (!window.configDualCircuit) toggleDualCircuit(); }));
    if (window.configDualCircuit) toggleDualCircuit();
    out.push(await fall('mit Pneumatik der 2D-Anlage', async () => {
      loadExample('portal_crane'); await w(500);
      const F = Fluidplan; F.oeffnen(); await w(300);
      const q = F.setzen('quelle', 0, 300), v = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'KRAN_AUF' }, '1V1'), z = F.setzen('zyl_dw', 0, -100, { d: 32, dStange: 12, hub: 200 }, '1A1');
      F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
      F.verbinden2D(true); await w(300);
      try { F.schliessen && F.schliessen(); } catch (e) {}
      toggleWorkspaceView('circuit-wrapper'); await w(200); if (document.getElementById('circuit-wrapper').style.display === 'none') toggleWorkspaceView('circuit-wrapper');
      drawCircuitPlan(currentGraph, globalInputs, globalOutputs, true);
    }));
    out.push(await fall('full_demo A3', async () => { Blatt.formatSetzen('A3'); drawCircuitPlan(currentGraph, globalInputs, globalOutputs, true); }));
    Blatt.formatSetzen('A4');
    // Ansicht im Bild
    loadExample('full_demo'); await w(700);
    toggleBlattAnsicht(true); await w(200);
    const c = document.getElementById('circuit-content');
    const an = { overlay: c.querySelectorAll('.circ-blatt-overlay').length, spiegel: [...c.querySelectorAll('.circ-spiegel-nr')].every(t => /^\d+\.\d+$/.test(t.textContent) || t.getAttribute('data-x') === ''), knopf: /AN/.test(document.getElementById('btn-toggle-blatt').textContent) };
    drawCircuitPlan(currentGraph, globalInputs, globalOutputs, true); await w(100);
    an.nachNeuzeichnen = c.querySelectorAll('.circ-blatt-overlay').length > 0;
    toggleBlattAnsicht(false); await w(100);
    an.aus = c.querySelectorAll('.circ-blatt-overlay').length === 0 && [...c.querySelectorAll('.circ-spiegel-nr')].every(t => /^\d+$/.test(t.textContent));
    an.gemerkt = localStorage.getItem('valisBlattAnsicht') === '0';
    // Anschlussplan-Ansicht: Druck nimmt trotzdem das Programmbild und stellt die Ansicht zurück
    let anschluss = null;
    if (typeof window._toggleIecAnschlussView === 'function') {
      window._iecAnschlussView = true; drawCircuitPlan(currentGraph, globalInputs, globalOutputs, true); await w(100);
      const h = SchaltplanBlatt.drucken(true);
      anschluss = { druck: !!h && /data-schaltplan-blatt/.test(h), zurueck: window._iecAnschlussView === true };
      window._iecAnschlussView = false; drawCircuitPlan(currentGraph, globalInputs, globalOutputs, true);
    }
    // Dialog im Bild
    SchaltplanBlatt.drucken(); await w(100);
    const dlg = document.querySelector('.vb-dialog');
    const dialog = !!dlg && !!dlg.querySelector('[data-blatt-format]') && !!dlg.querySelector('[data-sf="aenderung"]');
    if (dlg) dlg.querySelector('[data-a="zu"]').click();
    return { out, an, anschluss, dialog };
  });
  for (const f of faelle.out) {
    console.log(f.name);
    if (f.fehlt) { ok('Druck erzeugt', false); continue; }
    ok('Blätter erzeugt', f.blaetter >= 1, f.blaetter + ' Blätter');
    ok(`Querverweise zeigen auf die Spule (${f.qv})`, !f.falschQv.length && f.qv === f.kontakte, f.falschQv.slice(0, 4).join(' | '));
    ok(`Kontaktspiegel zeigen auf die Kontakte (${f.sp})`, !f.falschSp.length, f.falschSp.slice(0, 4).join(' | '));
    ok('kein Kontakt und keine Spule auf einer Blattgrenze', !f.amRand.length, f.amRand.join(', '));
    ok('Schienen tragen Blattverweise', f.verweiseOk);
    ok('ohne Strompfadnummern und Bearbeitungshilfen', f.keinePfadnr);
    if (/Pneumatik/.test(f.name)) ok('Fluid-Schaltplan der 2D-Anlage als eigenes erstes Blatt, Stromlaufplan ab Blatt 2', f.fluid && f.fluidBlatt, JSON.stringify([f.fluid, f.fluidBlatt]));
    if (/dual/.test(f.name)) ok('Steuer- und Laststromkreis auf eigenen Blättern', f.dual && f.baender.length === 2, JSON.stringify(f.baender));
  }
  const a4 = faelle.out.find(f => f.name === 'full_demo'), a3 = faelle.out.find(f => f.name === 'full_demo A3');
  ok('A3 quer braucht nicht mehr Blätter als A4 quer', a3.blaetter <= a4.blaetter, a3.blaetter + ' / ' + a4.blaetter);
  console.log('Ansicht im Bild');
  ok('Blattgrenzen und Spaltennummern eingeblendet', faelle.an.overlay > 0);
  ok('Spiegel zeigt Adressen Blatt.Spalte', faelle.an.spiegel);
  ok('Knopf zeigt AN', faelle.an.knopf);
  ok('bleibt nach dem Neuzeichnen', faelle.an.nachNeuzeichnen);
  ok('aus: Pfadnummern wie vorher', faelle.an.aus);
  ok('Einstellung gemerkt', faelle.an.gemerkt);
  if (faelle.anschluss) ok('aus der Anschlussplan-Ansicht gedruckt, Ansicht bleibt', faelle.anschluss.druck && faelle.anschluss.zurueck);
  ok('Dialog mit Format und Schriftfeld', faelle.dialog);
  if (process.env.SCHALTPLAN_BILD) { const d = faelle.out.find(f => f.html); const p2 = await browser.newPage({ viewport: { width: 1600, height: 1200 } }); await p2.setContent(d.html); await p2.screenshot({ path: process.env.SCHALTPLAN_BILD + '.png', fullPage: true }); }
  ok('keine Fehler', !fehler.length, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
