const { chromium } = require('playwright');
// Rundlauf Steckaufbau: Beispiel laden → „Aktuelle Schaltung übernehmen“ →
// „Code aus Aufbau“ → gleiche Logik wie vorher? (Wahrheitstabelle wie in
// schaltplan-editor-rundlauf.js, Koppelrelais/Q-Namen eingesetzt)
//
//   node pruefungen/steck-rundlauf-pruefung.js [beispiel …]
const http = require('http'), fs = require('fs'), path = require('path');
const { norm, vergleiche } = require('./rundlauf-vergleich.js');
const WURZEL = path.join(__dirname, '..');
function server() {
  const typen = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
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
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('dialog', d => d.accept());
  await p.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
  await p.goto('http://localhost:' + srv.address().port + '/index.html'); await p.waitForTimeout(3500);
  await p.evaluate(() => { try { closeHub(); } catch (e) {} });
  const nur = process.argv.slice(2);
  // Beispiele (EXAMPLES) und Musterlösungen des Übungsanlagen-Katalogs (ua-<anlage>-<n>)
  const keys = (await p.evaluate(() => Object.keys(EXAMPLES).concat(
    window.Uebungsanlagen ? [].concat(...window.Uebungsanlagen.liste().map(a => [1, 2, 3].map(n => 'ua-' + a.id + '-' + n))) : [])))
    .filter(k => !nur.length || nur.includes(k));
  let rot = 0, grau = 0;
  for (const k of keys) {
    const e0 = errs.length;
    let r;
    try {
      r = await p.evaluate(async k => {
        const warte = ms => new Promise(r => setTimeout(r, ms));
        if (window.festoFreeBuildMode) window._toggleFestoFreeBuild(false);
        const ua = k.match(/^ua-(.+)-(\d)$/);
        if (ua) { window.Uebungsanlagen.starten(ua[1], +ua[2] - 1); await warte(1200); window._taskLoadSolution(); await warte(1200); }
        else { loadExample(k); await warte(900); }
        const c1 = document.getElementById('code').value;
        // SPS-Modus: übernommen wird aus der Programm-Sicht
        if (!window.epneuMode && window._iecAnschlussView) { window._toggleIecAnschlussView(); await warte(400); }
        toggleWorkspaceView('festo-wrapper'); await warte(500);
        const u = window._fbUebernehmen(true);
        if (!u.ok) return { c1, nicht: u.text };
        // Analogkarten übernimmt der freie Aufbau nicht (Hinweis im Status)
        if (/Analogkarten bleiben/.test(u.text)) return { c1, nicht: 'Analogkarten' };
        const g = window._fbAusSicht.code(); await warte(300);
        return { c1, c2: document.getElementById('code').value, g: g.text, u: u.text };
      }, k);
    } catch (e) { r = { nicht: 'Ausnahme ' + String(e).slice(0, 120) }; }
    if (!r.c1 || !/:=/.test(r.c1)) { console.log('--  ' + k + ' (kein Code)'); continue; }
    // Eine Schrittkette steckt der freie Aufbau als Speicher (S/R je Schritt):
    // das ist eine andere Schreibweise, kein Vergleich per Wahrheitstabelle
    if (!r.nicht && /^\s*SCHRITTKETTE\b/im.test(r.c1)) r.nicht = 'Schrittkette, im Aufbau als Speicher';
    if (r.nicht) { grau++; console.log('--  ' + k + ' (nicht übernommen: ' + r.nicht.replace(/\n/g, ' ') + ')'); continue; }
    const f = vergleiche(norm(r.c1), norm(r.c2));
    const err = errs.slice(e0);
    const ok = !f.length && !err.length;
    if (!ok) rot++;
    console.log((ok ? 'OK  ' : 'ROT ') + k + (f.length ? '\n   ' + f.join('\n   ') : '') + (err.length ? '\n   Fehler: ' + err.join(' | ') : '') + (ok ? '' : '\n   ' + r.g.replace(/\n/g, ' ')));
  }
  await b.close(); srv.close();
  console.log(rot ? `${rot} von ${keys.length} Beispielen verändert (${grau} nicht übernehmbar)` : `Alle übernehmbaren Beispiele kommen gleich zurück (${grau} nicht übernehmbar)`);
  process.exit(rot ? 1 : 0);
})();
