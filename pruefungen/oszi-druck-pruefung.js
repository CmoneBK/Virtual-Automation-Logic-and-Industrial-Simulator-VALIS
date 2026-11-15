// Prüfung: Oszilloskop zeigt Druck in den Zylinderkammern A/B, Weg und Kraft über dem Weg
// (Pneumatik und Hydraulik, aus dem Fluidplan-Rechenkern bzw. Schattenplan).
//
//   node pruefungen/oszi-druck-pruefung.js
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
const LAUF = async (hyd) => {
  const warte = ms => new Promise(r => setTimeout(r, ms));
  try { closeHub(); } catch (e) {}
  window._findHydTankForCylinder = window._findHydTankForCylinder || (() => null);
  const ta = document.getElementById('code'); ta.value = 'Y1 := S1\nY2 := S2'; ta.dispatchEvent(new Event('input', { bubbles: true }));
  await warte(400);
  const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2'; c.pistonD = 40; c.rodD = 20; c.stroke = 200;
  const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
  try { hyd ? generateHydraulicSetup(c) : generatePneumaticSetup(c); } finally { window.showValisChoiceDialog = sd; }
  await warte(1500);
  openAnalyzerModal(); window._toggleAnalyzerDruck(); window._toggleAnalyzerFs();
  toggleSimulation(); await warte(1600);
  setTaster('S1', true); for (let k = 0; k < 160 && c.extension < 99; k++) await warte(50); await warte(600);
  const n = (c.normLabel || c.id).trim();
  const H = () => analyzerHistory[analyzerHistory.length - 1] || {};
  const aus = { ...H() }; setTaster('S1', false);
  setTaster('S2', true); await warte(250);
  let maxB = 0; for (let k = 0; k < 160 && c.extension > 1; k++) { await warte(50); maxB = Math.max(maxB, H()[n + ' pB'] || 0); }
  await warte(400); setTaster('S2', false);
  const ein = { ...H() };
  const fs = document.getElementById('analyzer-fs');
  const leg = [...document.querySelectorAll('#analyzer-legend .osz-ana-wert')].map(x => x.getAttribute('data-osz-var'));
  const px = (() => { const d = fs.getContext('2d').getImageData(0, 0, fs.width, fs.height).data; let b = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) b++; return b; })();
  if (!window._oszBild) toggleSimulation();
  return { n, aus: { pA: aus[n + ' pA'], pB: aus[n + ' pB'], s: aus[n + ' s'], F: aus[n + ' F'] }, ein: { pA: ein[n + ' pA'], pB: ein[n + ' pB'], s: ein[n + ' s'], F: ein[n + ' F'] }, maxB,
    leg, fsZyl: fs.getAttribute('data-fs-zylinder'), fsSichtbar: fs.style.display, px, einheit: window._anaZylEinheit[n + ' pA'] };
};
(async () => {
  const srv = await server(), browser = await chromium.launch();
  for (const [name, hyd, pMin] of [['Pneumatik', false, 4], ['Hydraulik', true, 20]]) {
    console.log(name);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); } catch (e) {} });
    await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
    if (process.env.OSZ_BILD) await page.evaluate(() => { window._oszBild = true; });
    const r = await page.evaluate(`(${LAUF.toString()})(${hyd})`);
    // Bild zum Ansehen: OSZ_BILD=/pfad/bild node pruefungen/oszi-druck-pruefung.js
    if (process.env.OSZ_BILD) { await page.waitForTimeout(300); await page.screenshot({ path: process.env.OSZ_BILD + '-' + name + '.png' }); await page.evaluate(() => toggleSimulation()); }
    const j = JSON.stringify(r);
    ok('Ausgefahren: Druck A hoch, B niedrig, Weg ≈ Hub', r.aus.pA > pMin && r.aus.pB < r.aus.pA / 4 && r.aus.s > 190, JSON.stringify(r.aus));
    ok('Kraft F = pA·AK − pB·AS (Ø40/20)', Math.abs(r.aus.F - (r.aus.pA * Math.PI * 400 - r.aus.pB * Math.PI * 300) * 0.1) < 2 && r.aus.F > 0, r.aus.F);
    ok('Einfahren: Druck B steigt, Weg ≈ 0', r.maxB > pMin / 2 && r.ein.s < 10, JSON.stringify([r.maxB, r.ein]));
    ok('Spuren pA, pB, s in der Legende', ['pA', 'pB', 's'].every(k => r.leg.includes(r.n + ' ' + k)), r.leg.join(','));
    ok('Einheit bar', r.einheit === 'bar', r.einheit);
    ok('Kraft-Weg-Diagramm sichtbar und gezeichnet', r.fsSichtbar === 'block' && (r.fsZyl || '').split(',').includes(r.n) && r.px > 200, [r.fsSichtbar, r.fsZyl, r.px].join(' '));
    ok('keine Fehler', !fehler.length, fehler.join(' | '));
    await page.close();
  }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
