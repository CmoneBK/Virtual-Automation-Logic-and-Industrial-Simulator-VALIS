// Prüfung: Forcen im Sim-Panel. Sensoren der 2D-Anlage lassen sich übersteuern (F-Chip),
// Taster bleiben normal bedienbar, Freigabe gibt den Sensor zurück.
//
//   node pruefungen/forcen-pruefung.js
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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} const b = [...document.querySelectorAll('button')].find(b => /Simulation starten/.test(b.textContent)); b && b.click(); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)), o = {};
    o.sensorErkannt = window._vonAnlageGesetzt('S_METALL'); o.tasterNicht = !window._vonAnlageGesetzt('START');
    const cb = document.getElementById('sim_in_S_METALL'); cb.click(); await w(600);
    o.bleibt = spsState.S_METALL === true; o.chip = !!document.querySelector('[data-sim-in="S_METALL"] .sim-force-chip');
    o.rahmen = document.querySelector('[data-sim-in="S_METALL"]').classList.contains('sim-forciert'); o.cb = cb.checked;
    document.querySelector('[data-sim-in="S_METALL"] .sim-force-chip').click(); await w(600);
    o.frei = spsState.S_METALL === false && !document.querySelector('[data-sim-in="S_METALL"] .sim-force-chip') && !cb.checked;
    const t = document.getElementById('sim_taster_START'); t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await w(300);
    o.taster = spsState.START === true && !('START' in window._forciert); t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return o;
  });
  for (const [k, v] of Object.entries(r)) ok(v, k);
  console.log(`${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
