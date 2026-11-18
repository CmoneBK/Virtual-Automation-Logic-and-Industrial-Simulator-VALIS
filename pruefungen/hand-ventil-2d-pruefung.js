// Prüfung: Handbetätigung (Hebel, Taster) eines verbundenen Planventils per Klick auf das 2D-Wegeventil
// (valve_hyd / valve_pneu), auch in der Gehäuse-Darstellung.
//   node pruefungen/hand-ventil-2d-pruefung.js
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
const FAELLE = {
  hydraulik: async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    const F = Fluidplan, H = { hyd: true }; window._findHydTankForCylinder = () => null;
    factoryObjects.slice().forEach(o => { try { deleteObjRecursive(o); } catch (e) {} });
    const ag = F.setzen('aggregat', 0, 300, Object.assign({ q: 12, p: 90 }, H), '0G1');
    const tk = F.setzen('tank', 200, 320, H, '');
    const v = F.setzen('ventil', 0, 150, Object.assign({ wege: '4/3', mitte: 'gesperrt', links: 'hebel', rechts: 'hebel' }, H), '1Q1');
    const z = F.setzen('zyl_dw', 0, -100, Object.assign({ d: 32, dStange: 16, hub: 150 }, H), '1M1');
    F.verbinden(ag, 'P', v, '1'); F.verbinden(v, '3', tk, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    F.verbinden2D(true); await warte(800);
    const id = F.plan().teile.find(t => t.id === z).o.anlage, o = factoryObjects.find(x => x.id === id);
    const vh = factoryObjects.find(x => x.type === 'valve_hyd' && x.targetCylinderId === id);
    const r = { da: !!(o && vh), hat: !!window._fpHandVentilHat(vh) };
    if (!r.da) return r;
    o.extension = 0;
    toggleSimulation(); await warte(800);
    const klick = (x) => { const rc = vh.el.getBoundingClientRect(); const opt = { bubbles: true, button: 0, clientX: rc.left + rc.width * x, clientY: rc.top + rc.height / 2 };
      vh.el.dispatchEvent(new MouseEvent('mousedown', opt)); document.dispatchEvent(new MouseEvent('mouseup', opt)); window.dispatchEvent(new MouseEvent('mouseup', opt)); };
    await warte(400); r.vorher = o.extension; r.zust = JSON.stringify((F.zustand && F.zustand() || {}).teile ? F.zustand().teile[v] : 'kein');
    const orig = window._fpHandVentil2D; r.aufrufe = []; window._fpHandVentil2D = (a, e) => { const x = orig(a, e); r.aufrufe.push(x); return x; };
    // ohne sichtbare 2D-Ansicht hat das Ventil keine Größe: Lage für den Klick vorgeben
    vh.el.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 40, right: 150, bottom: 140 });
    r.sim = isSimulationActive; r.wenn = ComponentRegistry.valve_hyd.clickSimulateWenn(vh);
    klick(0.2); for (let k = 0; k < 80 && o.extension < 99; k++) await warte(50);
    r.aus = o.extension; r.v2dAus = vh.valveState;
    klick(0.8); for (let k = 0; k < 80 && o.extension > 1; k++) await warte(50);
    r.ein = o.extension; r.v2dEin = vh.valveState;
    klick(0.8); await warte(300); r.v2dMitte = vh.valveState; r.mitte = JSON.parse(JSON.stringify(F.zustand().teile[v].stellung));
    toggleSimulation();
    return r;
  },
  pneumatik: async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    factoryObjects.slice().forEach(o => { try { deleteObjRecursive(o); } catch (e) {} });
    const q = F.setzen('quelle', 100, 400);
    const v = F.setzen('ventil', 260, 120, { wege: '5/2', links: 'taster', rechts: 'feder' }, '1V1');
    const z = F.setzen('zyl_dw', 260, -60, {}, '1A1');
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    F.verbinden2D(true); await warte(800);
    const id = F.plan().teile.find(t => t.id === z).o.anlage, o = factoryObjects.find(x => x.id === id);
    const vf = factoryObjects.find(x => x.type === 'pneu_fp' && x.pneu && x.pneu.fp && x.pneu.fp.typ === 'ventil');
    const vp = factoryObjects.find(x => x.type === 'valve_pneu' && x.targetCylinderId === id) || vf;
    const r = { da: !!(o && vp), hat: !!(vp && (vp.type === 'pneu_fp' || window._fpHandVentilHat(vp))), typ: vp && vp.type };
    if (!r.da) return r;
    o.extension = 0;
    toggleSimulation(); await warte(800);
    vp.el.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 40, right: 150, bottom: 140 });
    const rc = vp.el.getBoundingClientRect(), opt = { bubbles: true, button: 0, clientX: rc.left + rc.width / 2, clientY: rc.top + rc.height / 2 };
    vp.el.dispatchEvent(new MouseEvent('mousedown', opt));
    for (let k = 0; k < 80 && o.extension < 99; k++) await warte(50);
    r.aus = o.extension;
    window.dispatchEvent(new MouseEvent('mouseup', opt)); document.dispatchEvent(new MouseEvent('mouseup', opt));
    for (let k = 0; k < 80 && o.extension > 1; k++) await warte(50);
    r.ein = o.extension;
    toggleSimulation();
    return r;
  }
};
(async () => {
  const srv = await server(), browser = await chromium.launch();
  for (const [name, fn] of Object.entries(FAELLE)) {
    console.log(name);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.setItem('valisFluidplan', '1'); } catch (e) {} });
    await page.goto(`http://localhost:${srv.address().port}/index.html?fluidplan=1`); await page.waitForTimeout(3000);
    const r = await page.evaluate(`(${fn.toString()})()`);
    ok('2D-Zylinder und -Ventil da, Ventil von Hand betätigbar', r.da && r.hat, JSON.stringify(r));
    ok('Klick aufs 2D-Ventil: Zylinder fährt aus', r.aus > 95, Math.round(r.aus));
    ok(name === 'hydraulik' ? 'Hebel zur anderen Seite: fährt ein' : 'Taster losgelassen: fährt ein', r.ein < 5, Math.round(r.ein));
    if (name === 'hydraulik') ok('Hebel nochmal: Mittelstellung', r.mitte === 1, r.mitte);
    if (name === 'hydraulik') ok('2D-Ventil (Gehäuse) zeigt ext / ret / Mitte', r.v2dAus === 'ext' && r.v2dEin === 'ret' && r.v2dMitte === 'center', [r.v2dAus, r.v2dEin, r.v2dMitte].join(' '));
    ok('keine Fehler', !fehler.length, fehler.join(' | '));
    await page.close();
  }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
