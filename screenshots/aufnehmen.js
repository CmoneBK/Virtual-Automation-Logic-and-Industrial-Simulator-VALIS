// Screenshots für die Galerie im README aufnehmen (headless, 1920x1080).
//   node screenshots/aufnehmen.js de [szene …]
//   node screenshots/aufnehmen.js en [szene …]
// Szenen: grundschaltung, epneu, steckaufbau, elektroplan, anlage, schrittkette, lernzentrum.
// VALIS3de.png / VALIS3en.png (SPS-Modus, Bohrstation) stammen nicht von hier.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
const server = () => new Promise(res => {
  const typen = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
  const srv = http.createServer((req, rsp) => {
    const p = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(WURZEL) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
    rsp.writeHead(200, { 'Content-Type': typen[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(rsp);
  }).listen(0, () => res(srv));
});
const lang = process.argv[2] || 'de'; const nur = process.argv.slice(3);
const OUT = process.env.OUT || __dirname;
require('fs').mkdirSync(OUT, { recursive: true });
const PNEU = (cyl) => [
  {"id":"pz","type":"pneumatic_zone","x":20,"y":420,"width":400,"height":300,"rotation":0,"useCollision":false},
  {"id":"komp","type":"compressor","x":40,"y":640,"width":100,"height":60,"rotation":0,"pressure":6,"maxFlow":200,"normLabel":"-GQA1","useCollision":false},
  {"id":"vert","type":"manifold","x":180,"y":685,"width":200,"height":15,"rotation":0,"normLabel":"-GQ1","useCollision":false},
  {"id":"ventil","type":"valve_pneu","x":180,"y":630,"width":50,"height":40,"rotation":0,"targetCylinderId":cyl,"isDouble":true,"normLabel":"-QM1","useCollision":false},
  {"id":"dr1","type":"throttle","x":170,"y":560,"width":40,"height":35,"rotation":0,"opening":8,"targetCylinderId":cyl,"role":"ext","normLabel":"-RN1","useCollision":false},
  {"id":"dr2","type":"throttle","x":215,"y":560,"width":40,"height":35,"rotation":0,"opening":8,"targetCylinderId":cyl,"role":"ret","normLabel":"-RN2","useCollision":false}];
const EX = {
  readme_grund: {
    code: '// Selbsthaltung: START schaltet die Lampe ein, STOP aus\nS1 := START && ¬STOP\nR1 := STOP\n\nLAMPE := Q1',
    types: { START: 'taster', STOP: 'taster', LAMPE: 'led', Q1: 'relais' },
    factory: { globalViewMode: 'side', items: [], objects: [
      {"id":"b1","type":"taster","x":40,"y":40,"width":40,"rotation":0,"linkedVar":"START","color":"green","useCollision":true,"labelPinned":true},
      {"id":"b2","type":"taster","x":110,"y":40,"width":40,"rotation":0,"linkedVar":"STOP","color":"red","useCollision":true,"labelPinned":true},
      {"id":"l1","type":"led","x":185,"y":45,"width":30,"rotation":0,"linkedVar":"LAMPE","color":"green","useCollision":true,"labelPinned":true}] } },
  readme_epneu: {
    code: '// Doppeltwirkender Zylinder: START fährt aus, STOP fährt ein\nS1 := START && ¬STOP\nR1 := STOP\n\nZYL_AUS := Q1\nZYL_EIN := ¬Q1\n\n// Meldeleuchte: Zylinder ist vorn\nLED_VORN := S_VORN',
    types: { START: 'taster', STOP: 'taster', LED_VORN: 'led', S_VORN: 'sensor_reed', ZYL_AUS: 'valve', ZYL_EIN: 'valve', Q1: 'relais' },
    factory: { globalViewMode: 'side', items: [], objects: [
      {"id":"b1","type":"taster","x":40,"y":40,"width":40,"rotation":0,"linkedVar":"START","color":"green","useCollision":true,"labelPinned":true},
      {"id":"b2","type":"taster","x":110,"y":40,"width":40,"rotation":0,"linkedVar":"STOP","color":"red","useCollision":true,"labelPinned":true},
      {"id":"l1","type":"led","x":185,"y":45,"width":30,"rotation":0,"linkedVar":"LED_VORN","color":"yellow","useCollision":true,"labelPinned":true},
      {"id":"cyl1","type":"zylinder_double","x":60,"y":200,"width":200,"height":34,"rotation":0,"extension":0,"linkedVarExt":"ZYL_AUS","linkedVarRet":"ZYL_EIN","color":"green","useCollision":true,"hasPneumatics":true,"pistonD":32,"rodD":12,"stroke":100,"normLabel":"-MM1"},
      {"id":"r2","type":"sensor_reed","x":230,"y":212,"width":20,"rotation":0,"linkedVar":"S_VORN","parentId":"cyl1","color":"green","useCollision":false,"rangeW":10},
      ...PNEU('cyl1')] } },
};
if (lang === 'en') { EX.readme_grund.code = EX.readme_grund.code.replace('// Selbsthaltung: START schaltet die Lampe ein, STOP aus', '// Latch: START switches the lamp on, STOP switches it off');
  EX.readme_epneu.code = EX.readme_epneu.code.replace('// Doppeltwirkender Zylinder: START fährt aus, STOP fährt ein', '// Double-acting cylinder: START extends, STOP retracts').replace('// Meldeleuchte: Zylinder ist vorn', '// Indicator lamp: cylinder is extended'); }
const ALLE = ['fbs-wrapper','circuit-wrapper','circuit-editor-wrapper','factory-wrapper','sk-wrapper','festo-wrapper','fluid-wrapper'];
(async () => {
  const srv = await server(); const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, locale: lang === 'de' ? 'de-DE' : 'en-US' });
  p.on('dialog', d => d.accept()); p.on('pageerror', e => console.log('ERR', String(e).slice(0,150)));
  await p.addInitScript(l => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', l); localStorage.setItem('valisEpneuMode','1'); localStorage.setItem('valis.proMode','1'); } catch (e) {} }, lang);
  await p.goto('http://localhost:' + srv.address().port + '/index.html'); await p.waitForTimeout(3500);
  await p.evaluate(ex => { Object.assign(EXAMPLES, ex); try { closeHub(); } catch (e) {} }, EX);
  const w = ms => p.waitForTimeout(ms);
  const zeige = ids => p.evaluate(([ids, alle]) => {
    for (const id of ids) { const e = document.getElementById(id); if (e && e.style.display === 'none') toggleWorkspaceView(id); }
    for (const id of alle) { const e = document.getElementById(id); if (e && e.style.display !== 'none' && !ids.includes(id)) toggleWorkspaceView(id); }
  }, [ids, ALLE]);
  const seite = an => p.evaluate(an => { const offen = document.getElementById('left-panel').style.display !== 'none'; if (offen !== an) toggleSidebar(); }, an);
  const laden = async k => { await p.evaluate(() => { if (window.valisBruecke) valisBruecke.stoppen(); }); await p.evaluate(k => loadExample(k), k); await w(1500); };
  const fit = (ohne = []) => p.evaluate(ohne => {
    const os = factoryObjects.filter(o => !ohne.includes(o.type)); if (!os.length) return;
    const pad = 40, minX = Math.min(...os.map(o => o.x)) - pad, minY = Math.min(...os.map(o => o.y)) - pad;
    const maxX = Math.max(...os.map(o => o.x + o.width)) + pad, maxY = Math.max(...os.map(o => o.y + (o.height || o.width))) + pad;
    const a = document.getElementById('factory-canvas-area'), c = document.getElementById('factory-content');
    const selW = maxX - minX, selH = maxY - minY, W = a.clientWidth, H = a.clientHeight;
    factoryScale = Math.min(2.2, Math.max(0.2, Math.min(W / selW, H / selH)));
    c.style.transform = `scale(${factoryScale})`;
    a.scrollLeft = minX * factoryScale - (W - selW * factoryScale) / 2; a.scrollTop = minY * factoryScale - (H - selH * factoryScale) / 2;
  }, ohne);
  const planFit = (z = 1) => p.evaluate(z => { for (const i of [panZoomCircuitInstance, panZoomInstance]) if (i) { try { i.resize(); i.fit(); i.center(); if (z !== 1) i.zoomBy(z); } catch (e) {} } }, z);
  const ein = (n, v) => p.evaluate(([n, v]) => valisBruecke.setzeEingang(n, v), [n, v]);
  const sim = () => p.evaluate(() => valisBruecke.starten());
  const shot = async name => { await w(800); await p.screenshot({ path: `${OUT}/${name}-${lang}.png` }); console.log('ok', name); };
  const S = {
    async grundschaltung() { await laden('readme_grund'); await seite(true); await zeige(['fbs-wrapper','circuit-wrapper']); await sim(); await w(800); await planFit();
      await ein('START', true); await w(400); await ein('START', false); await w(800); await shot('grundschaltung'); },
    async epneu() { await laden('readme_epneu'); await seite(false); await zeige(['circuit-wrapper','factory-wrapper']); await sim(); await w(1500); await planFit(); await fit();
      await ein('START', true); await w(300); await ein('START', false); await w(1500); await shot('epneu'); await seite(true); },
    async steckaufbau() { await laden('readme_epneu'); await seite(false); await zeige(['festo-wrapper']); await sim(); await w(1500);
      await ein('START', true); await w(300); await ein('START', false); await w(1500); await shot('steckaufbau'); await seite(true); },
    async elektroplan() { await laden('readme_epneu'); await seite(false); await zeige(['circuit-editor-wrapper','fluid-wrapper']); await sim(); await w(1500);
      await ein('START', true); await w(300); await ein('START', false); await w(1500); await shot('elektroplan'); await seite(true); },
    async anlage() { await laden('full_demo'); await seite(true); await zeige(['factory-wrapper']); await fit(); await sim(); await w(1000);
      await ein('FREIGABE', true); await w(300); await ein('START', true); await w(300); await ein('START', false); await w(6000); await shot('anlage'); },
    async schrittkette() { await laden('schrittkette_bohrer'); await seite(true); await zeige(['sk-wrapper','factory-wrapper']); await sim(); await w(1000);
      await ein('START', true); await w(300); await ein('START', false); await w(2500); await shot('schrittkette'); },
    async lernzentrum() { await laden('readme_grund'); await p.evaluate(() => openHub()); await w(1000); await shot('lernzentrum'); await p.evaluate(() => closeHub()); },
  };
  for (const [k, f] of Object.entries(S)) if (!nur.length || nur.includes(k)) { try { await f(); } catch (e) { console.log('FEHLER', k, String(e).slice(0, 200)); } }
  // Nachher verkleinern (256 Farben): python3 -c "from PIL import Image; import glob; [Image.open(f).convert('RGB').quantize(256, dither=Image.Dither.NONE).save(f, optimize=True) for f in glob.glob('screenshots/*.png')]"
  await b.close(); srv.close();
})();
