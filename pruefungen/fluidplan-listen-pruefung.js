// Prüfung: Betriebsmittel- und Stückliste aus dem Fluidplan, CSV, Plan als PDF (Druckseite) mit Schriftfeld.
// nicht (Tankinhalt ≈ 3 × Förderstrom je Minute, Öl kommt beim Einfahren zurück).
//
//   node pruefungen/fluidplan-listen-pruefung.js
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
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };
(async () => {
  const srv = await server(), browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisFluidplan', '1'); localStorage.removeItem('valisSchriftfeld'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html?fluidplan=1`); await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    const F = Fluidplan; F.oeffnen(); await warte(300);
    const q = F.setzen('quelle', 100, 400, { p: 6 }, '0Z1');
    const w = F.setzen('wartung', 100, 300, { p: 6 }, '0Z2');
    const v = F.setzen('ventil', 260, 120, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'Y1' }, '1V1');
    const d1 = F.setzen('drv', 200, 40, { offen: 30 }, '1V2'), d2 = F.setzen('drv', 320, 40, { offen: 30 }, '1V3');
    const z = F.setzen('zyl_dw', 260, -60, { d: 32, dStange: 12, hub: 200 }, '1A1');
    F.setzen('daempfer', 300, 200, {}, '');
    const L = F._listen(), csv = F._listenCsv();
    const out = { bml: L.bml, stl: L.stl, csv };
    // Listen im Fenster
    const D = (document.getElementById('fluid-wrapper') || document);
    const knopf = t => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t) && b.closest('#fluid-wrapper, .fp-fenster, body'));
    knopf('Listen').click(); await warte(200);
    const box = document.querySelector('.fp-listen');
    out.box = !!box && box.querySelectorAll('table').length === 2 && box.textContent.includes('1A1');
    box.querySelector('[data-a="zu"]').click();
    // PDF: Schriftfeld ausfüllen, Druckfenster abfangen
    let gedruckt = null; const op = window.open;
    window.open = () => { const doc = { _h: '', open() {}, write(x) { this._h += x; }, close() {} }; gedruckt = doc; return { document: doc, focus() {}, print() { gedruckt.gedruckt = true; } }; };
    knopf('PDF').click(); await warte(200);
    const dlg = document.querySelector('.fp-sf-dialog');
    out.dlg = !!dlg;
    dlg.querySelector('[data-sf="titel"]').value = 'Bohrvorrichtung';
    dlg.querySelector('[data-sf="ersteller"]').value = 'M. Muster';
    dlg.querySelector('[data-sf="klasse"]').value = 'IM 11a';
    dlg.querySelector('[data-a="los"]').click(); await warte(700);
    window.open = op;
    out.html = gedruckt ? gedruckt._h : '';
    out.print = !!(gedruckt && gedruckt.gedruckt);
    out.sf = F.plan().schriftfeld;
    out.merk = JSON.parse(localStorage.getItem('valisSchriftfeld') || '{}');
    return out;
  });
  const b = k => r.bml.find(x => x.bmk === k) || {};
  ok('Betriebsmittelliste: Ventil mit Betätigung und Spule', /5\/2-Wegeventil/.test(b('1V1').benennung) && /Magnet \/ Feder/.test(b('1V1').daten) && /Spule Y1/.test(b('1V1').daten), JSON.stringify(b('1V1')));
  ok('Zylinder mit Ø, Stange und Hub', /Ø 32 mm.*Stange Ø 12 mm.*Hub 200 mm/.test(b('1A1').daten), b('1A1').daten);
  ok('nach Kennzeichen sortiert, Schalldämpfer ohne Kennzeichen nicht in der BML', r.bml.map(x => x.bmk).join(',') === '0Z1,0Z2,1A1,1V1,1V2,1V3', r.bml.map(x => x.bmk).join(','));
  const drv = r.stl.find(x => /Drosselrückschlag/.test(x.benennung)) || {};
  ok('Stückliste fasst gleiche Teile zusammen (2 × DRV 30 %)', drv.menge === 2 && drv.bmk === '1V2, 1V3', JSON.stringify(drv));
  ok('Stückliste enthält Schalldämpfer', r.stl.some(x => /Schalldämpfer/.test(x.benennung)), r.stl.map(x => x.benennung).join(' | '));
  ok('CSV mit beiden Listen', /Betriebsmittelliste/.test(r.csv) && /Pos\.;Menge;Benennung/.test(r.csv) && /"1A1"/.test(r.csv));
  ok('Listen-Fenster mit zwei Tabellen', r.box);
  ok('PDF-Dialog mit Schriftfeld', r.dlg);
  ok('Druckseite: A4 quer, Plan-SVG, Schriftfeld mit Titel, Ersteller, Klasse, Blatt 1/2 und 2/2', /size:A4 landscape/.test(r.html) && /<svg/.test(r.html) && /Bohrvorrichtung/.test(r.html) && /M\. Muster/.test(r.html) && /IM 11a/.test(r.html) && /Blatt 1\/2/.test(r.html) && /Blatt 2\/2/.test(r.html) && /Stückliste/.test(r.html));
  ok('Druck ausgelöst', r.print);
  ok('Schriftfeld im Plan gespeichert, Name/Klasse gemerkt', r.sf && r.sf.titel === 'Bohrvorrichtung' && r.merk.ersteller === 'M. Muster' && !r.merk.titel, JSON.stringify([r.sf, r.merk]));
  // Druckseite zum Ansehen: LISTEN_BILD=/pfad/bild node pruefungen/fluidplan-listen-pruefung.js
  if (process.env.LISTEN_BILD) { const p2 = await browser.newPage({ viewport: { width: 1123, height: 1600 } }); await p2.setContent(r.html); await p2.emulateMedia({ media: 'print' }); await p2.screenshot({ path: process.env.LISTEN_BILD + '.png', fullPage: true }); }
  ok('keine Fehler', !fehler.length, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
