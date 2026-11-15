// Prüfung: Öltank der 2D-Hydraulik. Der Tank wird nur innerhalb der Wände gefüllt
// (kein Öl daneben), und ein Zylinder 40/20 × 200 leert ihn auch nach vielen Hüben
// nicht (Tankinhalt ≈ 3 × Förderstrom je Minute, Öl kommt beim Einfahren zurück).
//
//   node pruefungen/oeltank-pruefung.js
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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    const ta = document.getElementById('code'); ta.value = 'Y1 := S1\nY2 := S2'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(400);
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2'; c.pistonD = 40; c.rodD = 20; c.stroke = 200;
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    await warte(1500);
    const t = factoryObjects.find(o => o.type === 'oil_tank'), wt = t.wallThickness || 10;
    const zaehl = () => { let innen = 0, alle = 0;
      for (const [k, z] of fluidGrid) if (z.mat === 'oil') { alle++; const [gx, gy] = k.split(',').map(Number); if (gx * FLUID_CELL >= t.x + wt - 1 && gx * FLUID_CELL <= t.x + t.width - wt && gy * FLUID_CELL >= t.y + wt - 1 && gy * FLUID_CELL <= t.y + t.height - wt) innen++; }
      return { innen, alle }; };
    const v = factoryObjects.find(o => o.type === 'valve_hyd');
    const tankSchl = () => (window.fluidPipeConnections || []).filter(q => q._sys === 'hyd' && !q._broken && ((q.aObjId === v.id && /^T/.test(q.aPortId)) || (q.bObjId === v.id && /^T/.test(q.bPortId)))).length;
    const ports = (window._hydPortDefs ? window._hydPortDefs(v) : []).map(p => p.label).join(',');
    const m = { start: zaehl(), hub: [], ventil: { label: (v.el.querySelector('.f2d-norm-label') || {}).textContent, ports, tank: tankSchl() } };
    toggleSimulation(); await warte(500);
    for (let i = 0; i < 5; i++) {
      setTaster('S1', true); for (let k = 0; k < 120 && c.extension < 99; k++) await warte(50); setTaster('S1', false); await warte(200);
      const aus = c.extension;
      setTaster('S2', true); for (let k = 0; k < 120 && c.extension > 1; k++) await warte(50); setTaster('S2', false); await warte(200);
      m.hub.push([aus, c.extension]);
    }
    m.ende = zaehl(); m.ventil.tankNach = tankSchl();
    toggleSimulation();
    return m;
  });
  ok('Tank gefüllt', r.start.innen > 50, r.start.innen + ' Zellen');
  ok('kein Öl neben dem Tank', r.start.alle === r.start.innen, r.start.alle + ' gesamt');
  ok('5 volle Hübe', r.hub.every(([a, e]) => a > 98 && e < 2), JSON.stringify(r.hub.map(h => h.map(Math.round))));
  ok('Tank nach 5 Hüben nicht leerer', r.ende.innen >= r.start.innen - 1, r.start.innen + ' → ' + r.ende.innen);
  ok('Hydraulikventil ist 4/2 mit P, A, B, T', r.ventil.ports.split(',').sort().join(',') === 'A,B,P,T', JSON.stringify(r.ventil));
  ok('genau ein Tankschlauch am Ventil', r.ventil.tank === 1 && r.ventil.tankNach === 1, r.ventil.tank + ' / ' + r.ventil.tankNach);
  ok('keine Fehler', !fehler.length, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
