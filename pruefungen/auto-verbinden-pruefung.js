const { chromium } = require('playwright');
// Fluidplan öffnen: hat die 2D-Anlage Pneumatik/Hydraulik und ist der Plan leer,
// wird sie automatisch übernommen und verbunden.  node pruefungen/auto-verbinden-pruefung.js
const http = require('http'), fs = require('fs'), path = require('path');
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
  const fehler = [];
  async function seite() {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
    page.on('dialog', d => { fehler.push('Dialog: ' + d.message().slice(0, 80)); d.accept(); });
    await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.setItem('valisFluidplan', '1'); } catch (e) {} });
    await page.goto(`http://localhost:${srv.address().port}/index.html?fluidplan=1`); await page.waitForTimeout(3000);
    await page.evaluate(() => { try { closeHub(); } catch (e) {} });
    return page;
  }
  console.log('Standardanlage mit Zylinder');
  let page = await seite();
  const vor = await page.evaluate(() => ({ zyl: factoryObjects.filter(o => /^zylinder_/.test(o.type) && (o.hasPneumatics || o.hasHydraulics)).length }));
  await page.evaluate(() => toggleWorkspaceView('fluid-wrapper')); await page.waitForTimeout(800);
  let r = await page.evaluate(() => { const z = Fluidplan.zustand ? Fluidplan.zustand() : null; const p = Fluidplan._plan ? Fluidplan._plan() : null; return { z, txt: (document.getElementById('fp-fuss') || {}).textContent, knopf: (document.getElementById('fp-anlage') || {}).textContent }; });
  ok('2D-Anlage hat Zylinder mit Fluidtechnik', vor.zyl > 0, vor.zyl);
  ok('Knopf zeigt „verbunden“', /verbunden/.test(r.knopf || ''), r.knopf);
  ok('Statuszeile meldet die Übernahme', /übernommen/.test(r.txt || ''), r.txt);
  const teile = await page.evaluate(() => Fluidplan._listen().bml.length);
  ok('Plan enthält die Teile der Anlage', teile >= 3, teile);
  // zweites Öffnen ändert nichts
  await page.evaluate(() => { toggleWorkspaceView('fluid-wrapper'); }); await page.waitForTimeout(300);
  await page.evaluate(() => { toggleWorkspaceView('fluid-wrapper'); }); await page.waitForTimeout(600);
  const teile2 = await page.evaluate(() => Fluidplan._listen().bml.length);
  ok('Erneutes Öffnen übernimmt nicht doppelt', teile2 === teile, teile2);
  await page.close();

  console.log('Leere 2D-Anlage');
  page = await seite();
  await page.evaluate(() => { factoryObjects.splice(0); });
  await page.waitForTimeout(300);
  const rest = await page.evaluate(() => factoryObjects.length);
  await page.evaluate(() => toggleWorkspaceView('fluid-wrapper')); await page.waitForTimeout(800);
  r = await page.evaluate(() => (document.getElementById('fp-anlage') || {}).textContent);
  ok('Ohne Fluidteile bleibt der Plan unverbunden', rest === 0 && /aus/.test(r || ''), rest + ' / ' + r);
  await page.close();
  ok('Keine Fehler und keine Rückfragen', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
