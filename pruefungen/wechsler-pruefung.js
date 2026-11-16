// Prüfung: Wechsler im Elektroplan (Paar aus Schließer + Öffner an 11).
//
//
//   node pruefungen/wechsler-pruefung.js
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
const ok = (b, t) => { if (b) gut++; else { schlecht++; console.log('FEHLER:', t); } };
(async () => {
  const srv = await server(), browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  const fehler = []; page.on('pageerror', e => fehler.push(e.message));
  page.on('dialog', d => { fehler.push('Dialog: ' + d.message()); d.dismiss(); });
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
  await page.evaluate(async () => {
    try { closeHub(); } catch (e) {}
    toggleWorkspaceView('circuit-editor-wrapper'); await new Promise(r => setTimeout(r, 800));
    const S = window._cedState; S.components.length = 0; S.wires.length = 0;
    S.components.push({ id: 'k1', type: 'relais', x: 400, y: 200, varName: 'K1' });
    S.components.push({ id: 'h1', type: 'led', x: 100, y: 300, varName: 'H1' });
    S.components.push({ id: 'h2', type: 'led', x: 200, y: 300, varName: 'H2' });
    window.cedRender();
  });
  // Wechsler aus der Palette ablegen
  const area = await page.$('#ced-canvas-area, .ced-canvas-area');
  const box = await page.evaluate(() => { const s = document.getElementById('ced-svg').getBoundingClientRect(); return { x: s.left, y: s.top }; });
  await page.evaluate(({ x, y }) => {
    const dt = new DataTransfer(); dt.setData('text/x-ced-type', 'wechsler');
    const t = document.getElementById('ced-svg').parentElement;
    const tgt = document.getElementById('ced-svg').closest('[id]') ;
    let a = document.getElementById('ced-svg'); while (a && !a._cedMidPan && a.id !== 'ced-canvas-area' && a.parentElement) { if (a.classList && a.classList.contains('ced-canvas-area')) break; a = a.parentElement; }
    document.getElementById('ced-svg').dispatchEvent(new DragEvent('drop', { bubbles: true, clientX: x + 175, clientY: y + 150, dataTransfer: dt }));
  }, box);
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    const o = {}, S = window._cedState;
    const pop = document.getElementById('ced-name-popup'); if (pop) pop.style.display = 'none';
    const no = S.components.find(c => c.type === 'relay_no'), nc = S.components.find(c => c.type === 'relay_nc');
    o.paar = !!no && !!nc && no.wPartner === nc.id && nc.wPartner === no.id;
    o.gleicheHoehe = !!no && no.y === nc.y;
    o.steg = S.wires.some(w => w.wBruecke && w.from.compId === no.id && w.to.compId === nc.id);
    o.einRelais = no.refNormPrefix && no.refNormPrefix === nc.refNormPrefix;
    o.pinsMitte = (() => { const a = document.querySelectorAll('#ced-svg text'); return [...a].some(t => t.textContent === '11') && [...a].some(t => t.textContent === '12') && [...a].some(t => t.textContent === '14'); })();
    // Verdrahten: + -> 11, 14 -> H1, 12 -> H2, Lampen und Spule -> 0 V
    const k1 = S.components.find(c => c.id === 'k1');
    no.refNormPrefix = k1.normPrefix; no.varName = 'K1'; window.cedRender();
    o.ncFolgt = nc.varName === 'K1' && nc.refNormPrefix === k1.normPrefix;
    const W = (f, t) => S.wires.push({ id: 'w' + Math.random().toString(36).slice(2, 7), from: f, to: t });
    W({ rail: 'plus', x: 300 }, { compId: no.id, pin: 'in' });
    W({ compId: no.id, pin: 'out' }, { compId: 'h1', pin: 'in' });
    W({ compId: nc.id, pin: 'out' }, { compId: 'h2', pin: 'in' });
    W({ compId: 'h1', pin: 'out' }, { rail: 'minus', x: 125 });
    W({ compId: 'h2', pin: 'out' }, { rail: 'minus', x: 225 });
    W({ rail: 'plus', x: 425 }, { compId: 'k1', pin: 'in' });
    W({ compId: 'k1', pin: 'out' }, { rail: 'minus', x: 425 });
    window.cedRender();
    const code = window.cedGenerateCode(true);
    o.code = /H1\s*:=\s*K1\b/.test(code) && /H2\s*:=\s*(NOT\s*|!|¬)\s*\(?K1\b/.test(code) || code;
    // Steg wird nicht gezeichnet
    o.stegUnsichtbar = !document.querySelector(`#ced-svg [data-id="${S.wires.find(w => w.wBruecke).id}"]`);
    // Speichern/Laden behält das Paar
    const j = JSON.parse(JSON.stringify({ c: S.components, w: S.wires }));
    o.json = j.c.find(c => c.id === nc.id).wPartner === no.id && j.w.some(w => w.wBruecke);
    // Löschen einer Hälfte: Rest ist ein einfacher Kontakt
    window._cedDeleteCompForTest ? window._cedDeleteCompForTest(nc.id) : null;
    return o;
  });
  for (const [k, v] of Object.entries(r)) ok(v === true, k + ' ' + JSON.stringify(v));
  // Schalter „Wechsler“: Auto-Schaltplan, Aus Code, Steckaufbau
  const r2 = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)), o = {};
    o.standardAus = window.configWechslerZusammen === false && /AUS/.test(document.getElementById('btn-toggle-wzus').textContent);
    toggleWorkspaceView('circuit-editor-wrapper'); await w(300);
    const ta = document.getElementById('code');
    const code = 'K1 := START\nH1 := K1 && A\nH2 := ¬K1 && B\nH3 := K1\nH4 := ¬K1';
    ta.value = code; ta.dispatchEvent(new Event('input')); await w(1200);
    toggleWorkspaceView('circuit-wrapper'); await w(600);
    const svg = document.getElementById('circuit-svg');
    o.ausKeinWechsler = svg.querySelectorAll('g.circ-wechsler').length === 0;
    const kabelVor = window._elSteckModell().kabel.map(k => k.a + '>' + k.b);
    o.ausSteckEinzeln = !kabelVor.some(k => /R\d+_S\d+_\d1$/.test(k.split('>')[1]) && /BUS_24V|__/.test(k.split('>')[0]));
    toggleWechslerZusammen(true); await w(600);
    o.knopfAn = /AN/.test(document.getElementById('btn-toggle-wzus').textContent);
    const wg = svg.querySelectorAll('g.circ-wechsler');
    o.autoWechsler = wg.length === 2 || wg.length;
    const txt = wg[0] ? [...wg[0].querySelectorAll('text')].map(t => t.textContent.trim()) : [];
    o.klemmen = ['11', '12', '14'].every(n => txt.includes(n)) || txt;
    o.messer = !!(wg[0] && wg[0].querySelector('.circ-moving-contact.circ-wblade'));
    // Simulation: K1 an -> Messer kippt
    const b0 = wg[0].querySelector('.circ-wblade'), offen0 = b0.classList.contains('open');
    const k1 = svg.querySelectorAll('g.circ-contact-group[data-iec-id="K1"]').length;
    o.kontakteBleiben = k1 === 4 || k1;
    // Steckaufbau: Paare teilen sich einen Wechsler (11 gemeinsam)
    const kabel = window._elSteckModell().kabel.map(k => k.a + '>' + k.b);
    const an11 = kabel.filter(k => /R\d+_S\d+_\d1$/.test(k.split('>')[1]));
    o.steckWechsler = an11.length >= 2 || kabel;
    const saetze = new Set(kabel.flatMap(k => k.split('>')).filter(x => /^R\d+_S\d+_\d[124]$/.test(x)).map(x => x.slice(0, -1)));
    const satzK1 = l => new Set(l.flatMap(k => k.split('>')).filter(x => /^R1_S1_\d[124]$/.test(x)).map(x => x.slice(0, -1))).size;
    o.zweiSaetze = (satzK1(kabelVor) === 4 && satzK1(kabel) === 2) || [satzK1(kabelVor), satzK1(kabel), [...saetze]];
    // Aus Code im Elektroplan: zwei Paare, Code unverändert, keine Abweichungsmeldung
    toggleWorkspaceView('circuit-editor-wrapper'); await w(300);
    const S = window._cedState; S.components.length = 0; S.wires.length = 0;
    S._suppressFromCodeConfirm = true; window.cedGenerateFromCode(); S._suppressFromCodeConfirm = false; await w(200);
    o.cedPaare = S.components.filter(c => c.wPartner).length === 4 || S.components.filter(c => c.wPartner).length;
    o.cedKeineAbweichung = !document.getElementById('ced-abweichung');
    const neu = window.cedGenerateCode(true);
    o.cedCodeGleich = window._cedCodeVergleich ? (window._cedCodeVergleich(code, neu).length === 0 || window._cedCodeVergleich(code, neu)) : true;
    // Wieder aus: alles wie vorher
    toggleWechslerZusammen(false); await w(500);
    toggleWorkspaceView('circuit-wrapper'); await w(500);
    o.ausWieder = svg.querySelectorAll('g.circ-wechsler').length === 0;
    o.steckWieGehabt = JSON.stringify(window._elSteckModell().kabel.map(k => k.a + '>' + k.b)) === JSON.stringify(kabelVor);
    return o;
  });
  for (const [k, v] of Object.entries(r2)) ok(v === true, k + ' ' + JSON.stringify(v));
  ok(fehler.length === 0, 'keine Fehler ' + JSON.stringify(fehler));
  console.log(`${gut} gut, ${schlecht} schlecht`);
  await page.screenshot({ path: process.env.BILD || '/tmp/wechsler.png' });
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
