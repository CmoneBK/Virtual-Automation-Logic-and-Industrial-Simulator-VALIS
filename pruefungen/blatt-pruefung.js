// Prüfung blatt.js: Maße je Format (A4/A3 quer), Spaltenraster, Aufteilen an Lücken,
// Schriftfeld (mit Änderung und Anlage/Projekt), Blattzählung, Zustand im Anlagenstand,
// Fluidplan-PDF wahlweise auf A3 und auf mehrere Blätter.
//
//   node pruefungen/blatt-pruefung.js
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
let gut = 0, schlecht = 0;
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };
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

// ---------- ohne Browser: Rechnen ----------
console.log('blatt.js (Rechnen)');
const B = require(path.join(WURZEL, 'blatt.js'));
const a4 = B.masse('A4'), a3 = B.masse('A3');
ok('A4 quer 297 × 210 mm, 8 Spalten', a4.b === 297 && a4.h === 210 && a4.spalten === 8);
ok('A3 quer 420 × 297 mm, 10 Spalten', a3.b === 420 && a3.h === 297 && a3.spalten === 10);
ok('Rahmen mit Heftrand 20 mm links, sonst 10 mm', a4.rahmen.x === 20 && a4.rahmen.y === 10 && a4.rahmen.b === 267 && a4.rahmen.h === 190);
ok('Spaltenbreite = Rahmenbreite / Spalten', Math.abs(a4.spaltenB - 267 / 8) < 1e-9 && Math.abs(a3.spaltenB - 39) < 1e-9);
ok('Zeichenfläche zwischen Spaltenleiste und Schriftfeld', a4.zeichnung.y === 15 && Math.abs(a4.zeichnung.h - (190 - 5 - a4.sfH)) < 1e-9);
ok('Voreinstellung A4 quer', B.format() === 'A4');
// Aufteilen: 20 Strompfade à 100 Einheiten, jedes Teil 60 breit → Schnitte nur in Lücken
const belegt = []; for (let i = 0; i < 20; i++) belegt.push([100 + i * 100 - 30, 100 + i * 100 + 30]);
const A = B.aufteilen({ format: 'A4', x0: 20, x1: 2100, hoehe: 600, belegt, spalteSoll: 100 });
ok('breiter Plan → mehrere Blätter', A.blaetter.length >= 3, A.blaetter.length + ' Blätter');
ok('Blätter lückenlos hintereinander', A.blaetter.every((b, i) => !i || Math.abs(b.von - A.blaetter[i - 1].bis) < 1e-9) && A.blaetter[A.blaetter.length - 1].bis === 2100);
ok('kein Schnitt durch ein Teil', A.blaetter.slice(1).every(b => !belegt.some(p => b.von > p[0] && b.von < p[1])), A.blaetter.map(b => Math.round(b.von)).join(','));
ok('kein Blatt breiter als S', A.blaetter.every(b => b.bis - b.von <= A.S + 1e-6));
ok('Spalte 1 … 8 je Blatt', A.spalte(A.blaetter[1].von + 1, 1) === 1 && A.spalte(A.blaetter[1].von + A.S - 1, 1) === 8);
const adr = A.adresse(belegt[9][0] + 30, 1);
ok('Adresse Blatt.Spalte', /^\d+\.\d+$/.test(adr), adr);
const A4f = B.aufteilen({ format: 'A4', x0: 20, x1: 1900, hoehe: 300, belegt, spalteSoll: 100 });
const A3 = B.aufteilen({ format: 'A3', x0: 20, x1: 1900, hoehe: 300, belegt, spalteSoll: 100 });
ok('A3 quer fasst 10 statt 8 Spalten, braucht weniger Blätter', Math.abs(A3.S / A4f.S - 10 / 8) < 1e-6 && A3.blaetter.length < A4f.blaetter.length, A3.blaetter.length + ' gegen ' + A4f.blaetter.length);
const eng = B.aufteilen({ format: 'A4', x0: 0, x1: 3000, hoehe: 100, belegt: [[0, 3000]], spalteSoll: 100 });
ok('Teil breiter als ein Blatt: erzwungener Schnitt, keine Endlosschleife', eng.blaetter.length >= 3 && eng.blaetter.length < 50, eng.blaetter.length);
// Schriftfeld und Zustand
B.importieren({ format: 'A3', schriftfeld: { anlage: 'Bohrvorrichtung', aenderung: 'a: Zylinder 1A1 größer', ersteller: 'M. Muster', titel: 'xx' } });
ok('Zustand: Format und Schriftfeld werden übernommen', B.format() === 'A3' && B.schriftfeld().anlage === 'Bohrvorrichtung');
const ex = B.exportieren();
ok('Zustand: exportieren hält Format und Felder', ex && ex.format === 'A3' && ex.schriftfeld.aenderung === 'a: Zylinder 1A1 größer');
B.importieren(null);
ok('leerer Zustand: A4, nichts gespeichert', B.format() === 'A4' && B.exportieren() === null);
const html = B.dokument({ titel: 'T', format: 'A4', blaetter: B.rendern([{ inhalt: '<svg></svg>', titel: 'Stromlaufplan', art: 'Steuerstromkreis' }, { inhalt: 'x', fluss: true, leiste: false }], { sf: B.schriftfeld({ anlage: 'Presse', aenderung: 'b' }) }) });
ok('Blätter durchgezählt: Blatt 1/2 und 2/2', /Blatt 1\/2/.test(html) && /Blatt 2\/2/.test(html));
ok('Schriftfeld mit Änderung und Anlage/Projekt', /Änderung/.test(html) && /Anlage\/Projekt Presse/.test(html));
ok('Spaltenleiste 1 … 8 auf dem Planblatt, nicht auf dem Listenblatt', (html.match(/class="vb-sp"/g) || []).length === 8);
ok('Druckseite A4 quer ohne Rand', /@page\{size:A4 landscape;margin:0\}/.test(html));
ok('Art des Blatts unter dem Titel', /Stromlaufplan<div class="art">Steuerstromkreis/.test(html));

// ---------- im Browser: Fluidplan auf Blatt, Zustand im Anlagenstand ----------
(async () => {
  const { chromium } = require('playwright');
  const srv = await server(), browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.setItem('valisFluidplan', '1'); localStorage.removeItem('valisSchriftfeld'); } catch (e) {} window._fpKeinAutoVerbinden = true; });
  await page.goto(`http://localhost:${srv.address().port}/index.html?fluidplan=1`); await page.waitForTimeout(3000);
  console.log('Fluidplan auf Blatt');
  const r = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    const F = Fluidplan; F.oeffnen(); await warte(300);
    // breiter Plan: 6 Zylinder mit Ventil nebeneinander, weit auseinander
    F.setzen('quelle', 100, 420, { p: 6 }, '0Z1');
    for (let i = 0; i < 6; i++) {
      F.setzen('ventil', 200 + i * 420, 160, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'Y' + (i + 1) }, (i + 1) + 'V1');
      F.setzen('zyl_dw', 200 + i * 420, 0, { d: 32, dStange: 12, hub: 100 }, (i + 1) + 'A1');
    }
    const out = {};
    out.blatt = !!window.Blatt;
    out.eins = F._pdfHtml(false, { format: 'A4', mehrseitig: false });
    out.mehr = F._pdfHtml(true, { format: 'A4', mehrseitig: true });
    out.mehrA3 = F._pdfHtml(false, { format: 'A3', mehrseitig: true });
    out.bl = F.blaetter({ format: 'A4', mehrseitig: true, erstes: 5 }).map(b => b.art);
    // Dialog: Format A3, Mehrseitig, Anlage/Projekt → Zustand
    let gedruckt = null; const op = window.open;
    window.open = () => { const doc = { _h: '', open() {}, write(x) { this._h += x; }, close() {} }; gedruckt = doc; return { document: doc, focus() {}, print() {} }; };
    F._pdfDialog ? F._pdfDialog() : [...document.querySelectorAll('button')].find(b => b.textContent.includes('PDF') && b.closest('#fluid-wrapper, .fp-fenster, body')).click();
    await warte(200);
    const dlg = document.querySelector('.fp-sf-dialog');
    out.dlg = !!dlg && !!dlg.querySelector('[data-blatt-format]') && !!dlg.querySelector('[data-sf="anlage"]') && !!dlg.querySelector('[data-sf="aenderung"]') && !!dlg.querySelector('[data-sf-mehrseitig]');
    dlg.querySelector('[data-blatt-format]').value = 'A3';
    dlg.querySelector('[data-sf="anlage"]').value = 'Prägestation';
    dlg.querySelector('[data-sf="aenderung"]').value = 'a: Zylinder getauscht';
    dlg.querySelector('[data-sf-mehrseitig]').checked = true;
    dlg.querySelector('[data-a="los"]').click(); await warte(700);
    window.open = op;
    out.dlgHtml = gedruckt ? gedruckt._h : '';
    out.format = Blatt.format();
    out.mehrGemerkt = !!F.plan().blattMehrseitig;
    // Anlagenzustand: blatt reist mit
    const st = getFactoryStateObj();
    out.stBlatt = st.blatt;
    Blatt.importieren(null);
    out.nachReset = Blatt.format();
    Blatt.importieren(st.blatt);
    out.zurueck = Blatt.format() + '|' + Blatt.schriftfeld().anlage;
    return out;
  });
  ok('blatt.js geladen', r.blatt);
  const zahl = (h, re) => (h.match(re) || []).length;
  ok('Fluidplan einseitig: ein Blatt, Plan mittig verkleinert', zahl(r.eins, /class="vb-blatt"/g) === 1 && /vb-zeichnung mitte/.test(r.eins));
  const nMehr = zahl(r.mehr, /class="vb-blatt"/g);
  ok('Fluidplan mehrseitig: mehrere Planblätter plus Listenblatt', nMehr >= 3 && /Stückliste/.test(r.mehr), nMehr + ' Blätter');
  ok('Fortsetzungsvermerke zwischen den Blättern', /Fortsetzung auf Blatt 2/.test(r.mehr) && /Fortsetzung von Blatt 1/.test(r.mehr));
  ok('letztes Blatt trägt die Blattzahl', new RegExp(`Blatt ${nMehr}/${nMehr}`).test(r.mehr));
  ok('A3 braucht für denselben Plan weniger Blätter', zahl(r.mehrA3, /class="vb-blatt"/g) < nMehr - 1 && /size:A3 landscape/.test(r.mehrA3), zahl(r.mehrA3, /class="vb-blatt"/g));
  ok('Plansatz-Blätter: Teil x von y', r.bl.length >= 2 && /Teil 1 von/.test(r.bl[0]), r.bl.join(' | '));
  ok('Dialog: Format, Anlage/Projekt, Änderung, mehrseitig', r.dlg);
  ok('Dialog wirkt: A3, Anlage und Änderung im Schriftfeld', r.format === 'A3' && /size:A3 landscape/.test(r.dlgHtml) && /Prägestation/.test(r.dlgHtml) && /Zylinder getauscht/.test(r.dlgHtml));
  ok('„mehrere Blätter“ merkt sich der Plan', r.mehrGemerkt);
  ok('Anlagenzustand enthält blatt', r.stBlatt && r.stBlatt.format === 'A3' && r.stBlatt.schriftfeld.anlage === 'Prägestation', JSON.stringify(r.stBlatt));
  ok('Laden stellt Format und Schriftfeld wieder her', r.nachReset === 'A4' && r.zurueck === 'A3|Prägestation', r.zurueck);
  if (process.env.BLATT_BILD) { const p2 = await browser.newPage({ viewport: { width: 1600, height: 1200 } }); await p2.setContent(r.mehr); await p2.emulateMedia({ media: 'print' }); await p2.screenshot({ path: process.env.BLATT_BILD + '.png', fullPage: true }); }
  ok('keine Fehler', !fehler.length, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
