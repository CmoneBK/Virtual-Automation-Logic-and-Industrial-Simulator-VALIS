// Prüfung: echte Wartungseinheit in der 2D-Anlage (Fluidplan-Teil 'wartung') vor der
// Verteilerleiste (manifold), Umbau alter Anlagen beim Laden, Fluidplan übernimmt sie.
//   node pruefungen/wartungseinheit-pruefung.js
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

// Gemeinsame Helfer im Browser
const HILFE = `
  window.__w = ms => new Promise(r => setTimeout(r, ms));
  window.__typ = id => (factoryObjects.find(o => o.id === id) || {}).type;
  window.__we = () => factoryObjects.filter(o => o.type === 'pneu_fp' && o.pneu && o.pneu.fp && o.pneu.fp.typ === 'wartung');
  window.__hat = (a, ap, b, bp) => window.pneuConnections.some(c => !c._broken && ((c.aObjId === a.id && String(c.aPortId) === ap && c.bObjId === b.id && String(c.bPortId) === bp) || (c.bObjId === a.id && String(c.bPortId) === ap && c.aObjId === b.id && String(c.aPortId) === bp)));
  window.__leer = () => { try { closeHub(); } catch (e) {} try { Fluidplan._leeren(); Fluidplan.verbinden2D(false); } catch (e) {} factoryObjects.slice().forEach(o => { try { deleteObjRecursive(o); } catch (e) {} }); window.pneuConnections = []; };
  window.__anlage = () => { const z = createFactoryObject('zylinder_double', ''); z.x = 300; z.y = 200; z.linkedVarExt = 'Y1'; z.linkedVarRet = 'Y2'; updateObjTransform(z); window.generatePneumaticSetup(z, 'double'); return z; };
  window.__lage = () => { const comp = factoryObjects.find(o => o.type === 'compressor'), mf = factoryObjects.find(o => o.type === 'manifold'), we = window.__we();
    return { we: we.length, kz: we[0] && we[0].normLabel, mfKz: mf && mf.normLabel || '', kw: !!(we[0] && window.__hat(comp, '1', we[0], '1')), wm: !!(we[0] && mf && window.__hat(we[0], '2', mf, '1')), km: !!(comp && mf && window.__hat(comp, '1', mf, '1')) }; };
  window.__druck = async () => { toggleSimulation(); await window.__w(1500); const m = window._fpDruckKarte() || {}; const z = factoryObjects.find(o => o.type === 'zylinder_double'); const p = Math.max(m[z.id + ':1'] || 0, m[z.id + ':2'] || 0); toggleSimulation(); await window.__w(300); return p; };
  window.__altMachen = () => { const comp = factoryObjects.find(o => o.type === 'compressor'), mf = factoryObjects.find(o => o.type === 'manifold'), we = window.__we()[0];
    window.pneuConnections = window.pneuConnections.filter(c => c.aObjId !== we.id && c.bObjId !== we.id);
    window.pneuConnections.push({ aObjId: comp.id, aPortId: '1', bObjId: mf.id, bPortId: '1', _auto: true });
    deleteObjRecursive(we); mf.normLabel = '-GQ1';
    const st = getFactoryStateObj(); delete st.wartungEinheit; return st; };
`;
const FAELLE = {
  'Neue Anlage: Kompressor → Wartungseinheit → Verteilerleiste': async () => {
    __leer(); __anlage(); await __w(400);
    const r = __lage(); r.p = await __druck();
    const comp = factoryObjects.find(o => o.type === 'compressor'), we = __we()[0];
    window.pneuConnections.filter(c => (c.aObjId === comp.id && c.bObjId === we.id) || (c.bObjId === comp.id && c.aObjId === we.id)).forEach(c => c._broken = true);
    await __w(300); r.pAb = await __druck();
    return r;
  },
  'Alte Anlage (gespeichert, Leiste = Wartungseinheit) wird beim Laden umgebaut': async () => {
    __leer(); __anlage(); await __w(400);
    const st = __altMachen();
    localStorage.setItem('logikFactoryState', JSON.stringify(st)); loadFactoryState(); await __w(800);
    const r = __lage(); r.p = await __druck();
    // nochmal speichern und laden: keine zweite Wartungseinheit
    localStorage.setItem('logikFactoryState', JSON.stringify(getFactoryStateObj())); loadFactoryState(); await __w(800);
    r.we2 = __we().length;
    return r;
  },
  'Alte Anlage mit verbundenem Fluidplan: Plan-Wartungseinheit übernimmt die neue': async () => {
    __leer(); __anlage(); await __w(400);
    window._fpKeinAutoVerbinden = true;
    Fluidplan.ausAnlage(); Fluidplan.verbinden2D(true); await __w(600);
    const st = __altMachen();
    if (st.fluidplan && st.fluidplan.teile) st.fluidplan.teile.forEach(t => { if (t.typ === 'wartung') { delete t.o.anlage; t.o.durch = true; t.o.kurz = true; } });
    st.fluidplan.erzeugt = (st.fluidplan.erzeugt || []).filter(id => st.objects ? st.objects.some(o => o.id === id) : true);
    localStorage.setItem('logikFactoryState', JSON.stringify(st)); loadFactoryState(); await __w(800);
    for (let i = 0; i < 6; i++) { try { window._fpTakt(0.05); } catch (e) {} await __w(80); }
    const r = __lage();
    const wa = Fluidplan.plan().teile.filter(t => t.typ === 'wartung');
    r.planWa = wa.length; r.anlage = wa[0] && wa[0].o.anlage === (__we()[0] || {}).id; r.verbunden = !!Fluidplan.plan().anlage;
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
    await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
    await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
    await page.evaluate(HILFE);
    const r = await page.evaluate(`(${fn.toString()})()`);
    const d = JSON.stringify(r);
    ok('genau eine Wartungseinheit (pneu_fp) mit -GQ1, Leiste ohne Kennzeichen', r.we === 1 && r.kz === '-GQ1' && !r.mfKz, d);
    ok('Schläuche Kompressor 1 → Wartungseinheit 1 und Wartungseinheit 2 → Verteilerleiste 1, kein Kurzschluss Kompressor–Leiste', r.kw && r.wm && !r.km, d);
    if (r.p != null) ok('Druck kommt am Zylinder an', r.p > 4, r.p);
    if (r.pAb != null) ok('Schlauch Kompressor–Wartungseinheit ab: kein Druck mehr', r.pAb < 0.5, r.pAb);
    if (r.we2 != null) ok('Speichern und neu laden: keine zweite Wartungseinheit', r.we2 === 1, r.we2);
    if (r.planWa != null) ok('Plan hat eine Wartungseinheit, sie zeigt auf die neue in 2D', r.verbunden && r.planWa === 1 && r.anlage, d);
    ok('keine Fehler', !fehler.length, fehler.join(' | '));
    await page.close();
  }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
