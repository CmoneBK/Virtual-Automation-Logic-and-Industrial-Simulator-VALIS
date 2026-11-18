const { chromium } = require('playwright');
// Prüfung des Abkoppel-Knopfs oben rechts in jedem Panel (Multi-Screen).
//
//   node pruefungen/abkoppeln-pruefung.js
//
// Braucht Playwright mit Chromium (require('playwright')).
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
function server() {
  const typen = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2' };
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(WURZEL) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': typen[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}
(async () => {
  const srv = await server();
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } });
  const pg = await ctx.newPage();
  const fehler = []; pg.on('pageerror', e => fehler.push(e.message));
  let gut = 0, schlecht = 0;
  const pruef = (name, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (d !== undefined ? '  (' + d + ')' : '')); ok ? gut++ : schlecht++; };
  await pg.goto('http://localhost:' + srv.address().port + '/index.html?fluidplan=1');
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { try { closeHub(); } catch (e) {} });
  await pg.waitForTimeout(300);
  const alle = ['fbs-wrapper', 'circuit-wrapper', 'circuit-editor-wrapper', 'sk-wrapper', 'factory-wrapper', 'festo-wrapper', 'fluid-wrapper', 'analyzer-modal'];
  const da = await pg.evaluate(() => [...document.querySelectorAll('.panel-abk-btn')].map(x => x.dataset.panel));
  alle.forEach(id => pruef('Knopf in ' + id, da.includes(id)));
  await pg.evaluate(() => ['factory-wrapper', 'fluid-wrapper', 'circuit-editor-wrapper'].forEach(i => toggleWorkspaceView(i)));
  await pg.waitForTimeout(800);
  // Knopf oben rechts und frei: nichts aus der Werkzeugleiste liegt darunter
  for (const id of ['fbs-wrapper', 'factory-wrapper', 'circuit-editor-wrapper', 'fluid-wrapper']) {
    const r = await pg.evaluate(id => {
      const p = document.getElementById(id), k = p.querySelector(':scope > .panel-abk-btn');
      const a = p.getBoundingClientRect(), c = k.getBoundingClientRect();
      const oben = elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      function elementFromPoint(x, y) { return document.elementFromPoint(x, y); }
      return { ecke: Math.abs(a.right - c.right) < 10 && Math.abs(c.top - a.top) < 10, frei: k.contains(oben) };
    }, id);
    pruef(id + ': Knopf oben rechts', r.ecke);
    pruef(id + ': Knopf nicht verdeckt', r.frei);
  }
  for (const id of ['factory-wrapper', 'fluid-wrapper']) {
    const pop = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
    await pg.click(`.panel-abk-btn[data-panel="${id}"]`);
    await pop; await pg.waitForTimeout(1200);
    const r = await pg.evaluate(id => {
      const w = window.popOutWindows[id]; if (!w) return {};
      const p = w.document.getElementById(id), k = p && p.querySelector('.panel-abk-btn');
      return { imFenster: !!p, imHaupt: !!document.getElementById(id), knopf: !!(k && k.offsetParent) };
    }, id);
    pruef(id + ': abgekoppelt ins eigene Fenster', r.imFenster && !r.imHaupt);
    pruef(id + ': im Fenster kein Abkoppel-Knopf', r.knopf === false);
  }
  // „Zurück ins Hauptfenster“ im Kopf der Zelle: Panel ist danach im Hauptfenster aktiv
  await pg.evaluate(() => window._sharedDetachWindow.document.querySelector('.detached-cell[data-panel-id="factory-wrapper"] .detached-cell-reattach-btn').click());
  await pg.waitForTimeout(600);
  const z = await pg.evaluate(() => { const p = document.getElementById('factory-wrapper'); return { da: !!p.querySelector(':scope > .panel-abk-btn'), sichtbar: getComputedStyle(p).display !== 'none' && p.offsetWidth > 50 }; });
  pruef('2D-Anlage zurück im Hauptfenster', z.da);
  pruef('2D-Anlage nach „Zurück“ wieder aktiv', z.sichtbar);
  // Ansichts-Knopf (aus) bei abgekoppeltem Panel holt es ausgeblendet zurück
  await pg.evaluate(() => toggleWorkspaceView('fluid-wrapper'));
  await pg.waitForTimeout(600);
  pruef('Fluidplan über Ansichts-Knopf aus: zurück und ausgeblendet', await pg.evaluate(() => { const p = document.getElementById('fluid-wrapper'); return !!p && getComputedStyle(p).display === 'none'; }));
  // Fenster schließen: alle Panels wieder aktiv im Hauptfenster
  await pg.evaluate(() => detachPanel('circuit-editor-wrapper', 'Editor'));
  await pg.waitForTimeout(800);
  await pg.evaluate(() => window._sharedDetachWindow.close());
  await pg.waitForTimeout(800);
  pruef('Fenster geschlossen: Logikplan und Editor wieder aktiv', await pg.evaluate(() => ['fbs-wrapper', 'circuit-editor-wrapper'].every(id => { const p = document.getElementById(id); return p && getComputedStyle(p).display !== 'none'; })));
  await pg.evaluate(() => openAnalyzerModal());
  const pop = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
  await pg.click('#analyzer-header .panel-abk-btn'); await pop; await pg.waitForTimeout(800);
  pruef('Oszilloskop abgekoppelt', await pg.evaluate(() => { const w = window.popOutWindows['analyzer-modal']; return !!(w && w.document.getElementById('analyzer-modal')); }));
  // Neu laden: abgekoppelte Panels werden gemerkt, alte Fenster geschlossen, neu abgekoppelt
  await pg.evaluate(() => { try { window.popOutWindows['analyzer-modal'].close(); } catch (e) {} });
  await pg.waitForTimeout(400);
  await pg.evaluate(() => { detachPanel('fbs-wrapper', 'Logikplan'); detachPanel('factory-wrapper', '2D-Anlage'); });
  await pg.waitForTimeout(1200);
  await pg.reload(); await pg.waitForTimeout(5000);
  await pg.evaluate(() => { try { closeHub(); } catch (e) {} });
  const n = await pg.evaluate(() => { const w = window._sharedDetachWindow; return { zellen: w && !w.closed ? [...w.document.querySelectorAll('.detached-cell')].map(c => c.dataset.panelId).sort().join(',') : '', leiste: !!document.getElementById('abk-wieder-leiste') }; });
  pruef('Neu laden: Logikplan und 2D-Anlage wieder abgekoppelt', n.zellen === 'factory-wrapper,fbs-wrapper' && !n.leiste, n.zellen);
  pruef('Neu laden: alte Fenster geschlossen', ctx.pages().filter(x => !x.isClosed()).length === 2, ctx.pages().filter(x => !x.isClosed()).length);
  // Browser blockiert Fenster ohne Klick: Leiste mit Knopf
  await pg.addInitScript(() => { const o = window.open; window.open = function () { if (!window.__klick) return null; return o.apply(this, arguments); }; document.addEventListener('click', () => { window.__klick = true; setTimeout(() => { window.__klick = false; }, 0); }, true); });
  await pg.reload(); await pg.waitForTimeout(5000);
  await pg.evaluate(() => { try { closeHub(); } catch (e) {} });
  const l = await pg.evaluate(() => ({ leiste: !!document.getElementById('abk-wieder-leiste'), platzhalter: document.querySelectorAll('[id$="-placeholder"]').length, fbs: getComputedStyle(document.getElementById('fbs-wrapper')).display }));
  pruef('Blockiert: Leiste „Wieder abkoppeln“, Panels bleiben im Hauptfenster', l.leiste && l.platzhalter === 0 && l.fbs !== 'none', JSON.stringify(l));
  await pg.click('#abk-wieder-knopf'); await pg.waitForTimeout(1500);
  pruef('Blockiert: Knopf koppelt beide wieder ab', await pg.evaluate(() => { const w = window._sharedDetachWindow; return !!(w && !w.closed) && w.document.querySelectorAll('.detached-cell').length === 2 && !document.getElementById('abk-wieder-leiste'); }));
  pruef('keine Skriptfehler', fehler.length === 0, fehler.join(' | '));
  console.log('\n' + gut + ' gut, ' + schlecht + ' schlecht');
  await b.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
