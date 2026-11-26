// Prüfung: valisBruecke v18 startet eine .valitask als Aufgabe und meldet,
// ob sie gelöst ist und ob Tipp oder Lösung genutzt wurden (Können in der
// virtuellen Werkstatt, tbk-lernsituationen-uebungen werkstatt3d-valis.js).
//
//   node pruefungen/bruecke-aufgabe-pruefung.js
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)), o = {}, B = window.valisBruecke;
    try { closeHub(); } catch (e) {}
    o.version = B.version >= 18;
    o.ohneAufgabe = B.aufgabe() === null;
    o.keineValitask = B.aufgabeStarten({ type: 'valisave' }) === false;
    const task = { version: '1.0', type: 'valitask', id: 'pruef-aufgabe', name: 'Prüfaufgabe', description: 'Schreibe LAMPE := TASTER;',
      hint: 'Ein Tipp', preset: { code: '// leer', factory: null },
      conditions: [{ type: 'code_contains', pattern: 'LAMPE := TASTER' }, { type: 'component_type', variable: 'TASTER', compType: 'button' }] };
    o.gestartet = B.aufgabeStarten(task) === true;
    await w(400);
    let a = B.aufgabe();
    o.offen = !!a && a.id === 'pruef-aufgabe' && a.geloest === false && a.hilfe === false;
    o.bedingungen = !!a && a.bedingungen.join() === 'code_contains,component_type';
    window._taskShowHint(); await w(100);
    o.tippZaehlt = B.aufgabe().hilfe === true;
    document.getElementById('task-hint-modal').style.display = 'none';
    o.neuOhneHilfe = B.aufgabeStarten(task) && B.aufgabe().hilfe === false;
    /* selbst lösen: Code und Bauteiltyp wie ein Schüler eintragen */
    const sl = document.getElementById('saveload-text');
    sl.value = JSON.stringify({ rssr: window.VALIS_RSSR, code: 'LAMPE := TASTER;', factory: null, types: { TASTER: 'button' }, addresses: {}, layout: 'flex-row' });
    window.applyRawCode(); await w(300);
    window._taskCheckConditions(); await w(300);
    a = B.aufgabe();
    o.geloest = a.geloest === true && a.hilfe === false;
    const m = document.getElementById('task-success-modal'); if (m) m.style.display = 'none';
    return o;
  });
  for (const [k, v] of Object.entries(r)) ok(v, k);
  await browser.close(); srv.close();
  console.log(schlecht ? `${schlecht} Fehler, ${gut} ok` : `Aufgaben über die Brücke: alle ${gut} Punkte ok`);
  process.exit(schlecht ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
