// Prüfung: Zylinder an freien Schläuchen (Fluidplan-Ventile) bleibt pneumatisch,
// auch nach Rechtsklick ins Menü; die Schläuche bleiben am Zylinder.
//
//   node pruefungen/zylinder-schlauch-pruefung.js
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
  const r = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)), o = {};
    try { closeHub(); } catch (e) {}
    loadExample('code'); await w(800);
    toggleWorkspaceView('fluid-wrapper'); await w(1500);
    window._fpAlleVentile('schnitt'); await w(1500);
    toggleWorkspaceView('factory-wrapper'); await w(800);
    const cyl = factoryObjects.find(q => q.id === 'cyl1');
    const amZyl = () => (window.pneuConnections || []).filter(c => c._fp && (c.aObjId === 'cyl1' || c.bObjId === 'cyl1')).length;
    const pfade = () => document.querySelectorAll('#pneu-hose-layer path.pneu-hose').length;
    o.vorher = cyl.hasPneumatics === true && amZyl() === 2;
    const n0 = pfade();
    cyl.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })); await w(400);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); await w(200);
    window.drawPneumaticHoses(); await w(200);
    o.bleibtPneumatisch = cyl.hasPneumatics === true;
    o.anschluesse = window._pneuPortDefs(cyl).length === 2;
    o.schlaeucheGezeichnet = pfade() === n0 && n0 >= 5 || [n0, pfade()];
    // Zylinder ohne Schläuche: Menü bietet weiter „Pneumatik erzeugen“ an
    loadExample('code'); await w(800);
    const z2 = factoryObjects.find(q => /zylinder/.test(q.type) && !q.hasPneumatics) || null;
    o.ohneSchlauch = !z2 || (z2.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })), z2.hasPneumatics === false);
    return o;
  });
  for (const [k, v] of Object.entries(r)) ok(v === true, k + ' ' + JSON.stringify(v));
  ok(fehler.length === 0, 'keine Fehler ' + JSON.stringify(fehler));
  console.log(`${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
