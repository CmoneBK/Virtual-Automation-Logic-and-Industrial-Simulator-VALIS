// Prüfung: Elektroplan baut sich beim Öffnen aus dem Code auf, wenn er leer ist
// oder seit der letzten Generierung unverändert; Handzeichnung bleibt.
//
//   node pruefungen/elektroplan-auto-pruefung.js
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
    const w = ms => new Promise(r => setTimeout(r, ms)), o = {}, S = () => window._cedState;
    try { closeHub(); } catch (e) {}
    const code = document.getElementById('code').value;
    toggleWorkspaceView('circuit-editor-wrapper'); await w(800);
    o.aufgebaut = S().components.length > 0 && S().wires.length > 0;
    o.codeUnveraendert = document.getElementById('code').value === code;
    const n1 = S().components.length;
    // Nur Kommentar geändert, Plan von Hand verschoben: bleibt
    toggleWorkspaceView('circuit-editor-wrapper'); await w(300);
    S().components[0].x += 20; const xVor = S().components[0].x;
    document.getElementById('code').value = '// Kommentar\n' + code; await w(100);
    toggleWorkspaceView('circuit-editor-wrapper'); await w(800);
    o.kommentarEgal = S().components[0].x === xVor;
    S().components[0].x -= 20;
    // Code ändern, Panel zu und wieder auf: unveränderter Plan wird neu aufgebaut
    toggleWorkspaceView('circuit-editor-wrapper'); await w(300);
    const ta = document.getElementById('code'); ta.value = code + '\nLAMPE_NEU := START'; ta.dispatchEvent(new Event('input')); await w(400);
    toggleWorkspaceView('circuit-editor-wrapper'); await w(800);
    o.neuAufgebaut = S().components.length > n1;
    // Von Hand geändert: nicht überschreiben
    toggleWorkspaceView('circuit-editor-wrapper'); await w(300);
    S().components.push({ id: 'hand1', type: 'lamp', x: 40, y: 40, varName: 'HAND' });
    const n2 = S().components.length;
    ta.value = code; ta.dispatchEvent(new Event('input')); await w(400);
    toggleWorkspaceView('circuit-editor-wrapper'); await w(800);
    o.handBleibt = S().components.length === n2 && S().components.some(c => c.id === 'hand1');
    // Aufgabe sperrt „Aus Code": beim Öffnen passiert nichts
    toggleWorkspaceView('circuit-editor-wrapper'); await w(300);
    S().components.length = 0; S().wires.length = 0;
    const altTask = activeTask; activeTask = { blockAreas: { disableFromCode: true } };
    toggleWorkspaceView('circuit-editor-wrapper'); await w(800);
    o.aufgabeSperrt = S().components.length === 0;
    activeTask = altTask;
    // Alle Beispiele: nach „Aus Code" keine Abweichungsmeldung
    S().components.length = 0; S().wires.length = 0;
    const meld = [];
    for (const k of Object.keys(EXAMPLES)) {
      loadExample(k); await w(250);
      if (!/:=/.test(document.getElementById('code').value)) continue;
      S()._suppressFromCodeConfirm = true; window.cedGenerateFromCode(); S()._suppressFromCodeConfirm = false; await w(100);
      if (document.getElementById('ced-abweichung')) meld.push(k);
    }
    o.keineFalscheMeldung = meld.length === 0 || meld;
    // Echte Abweichung: Hinweis mit Melden-Knopf
    window._cedAbweichungPruefen('ZZ_TEST := START && STOP');
    const box = document.getElementById('ced-abweichung');
    o.meldungDa = !!box && !!box.querySelector('.ced-ab-melden');
    if (box) box.querySelector('.ced-ab-zu').click();
    o.meldungZu = !document.getElementById('ced-abweichung');
    return o;
  });
  for (const [k, v] of Object.entries(r)) ok(v === true, k + ' ' + JSON.stringify(v));
  ok(fehler.length === 0, 'keine Fehler/Dialoge: ' + fehler.join(' | '));
  console.log(`${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
