// Prüfung: VALIS-Tour (kurz und ausführlich). Klickt jede Fassung Schritt für
// Schritt durch und prüft, dass jeder Schritt mit Ziel auch etwas markiert.
// Wer die Kopfleiste oder ein Panel umbaut und dabei eine Tour-Markierung
// verliert, sieht es hier (Christoph 15.11.2026: „Tour an neues Layout anpassen“).
// Läuft in zwei Fenstergrößen, weil Knöpfe bei wenig Platz zu Symbolen werden.
//
//   node pruefungen/tour-pruefung.js
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
// Schritte, die bewusst nichts markieren (Text in der Mitte).
const OHNE_ZIEL = /Willkommen|Analogwerte und Regler|Geschafft|Kapitel \d+ von \d+:/;
(async () => {
  const srv = await server(), browser = await chromium.launch();
  for (const [fassung, w, h] of [['kurz', 1920, 1000], ['lang', 1920, 1000], ['lang', 1280, 720]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const fehler = [];
    page.on('pageerror', e => fehler.push(e.message));
    await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
    await page.goto(`http://localhost:${srv.address().port}/index.html?tour=${fassung}`);
    await page.waitForTimeout(4500);
    const titel = [];
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(1100);
      const s = await page.evaluate(() => {
        const t = document.getElementById('tutorial-tooltip');
        if (!t || !t.offsetWidth) return null;
        const sp = document.getElementById('tutorial-spotlight');
        const r = sp.getBoundingClientRect();
        return { titel: document.getElementById('tut-title').textContent.trim(), spot: sp.style.display !== 'none' && r.width > 4 && r.height > 4,
                 imBild: r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight };
      });
      if (!s) break;
      titel.push(s.titel);
      const wo = `${fassung} ${w}x${h} Schritt ${i + 1} „${s.titel}“`;
      if (OHNE_ZIEL.test(s.titel)) ok(true, wo);
      else { ok(s.spot, wo + ': keine Markierung (Ziel fehlt oder unsichtbar)'); if (s.spot) ok(s.imBild, wo + ': Markierung außerhalb des Fensters'); }
      const weiter = await page.evaluate(() => { const b = document.getElementById('tut-next'); if (!b || /Fertig/.test(b.textContent)) return false; b.click(); return true; });
      if (!weiter) break;
    }
    const fluid = titel.filter(t => /Fluidplan|Prüfen, Messen/.test(t)).length;
    ok(fluid >= (fassung === 'kurz' ? 1 : 3), `${fassung}: Fluidplan-Schritte ${fluid}`);
    ok(titel.some(t => /Elektroplan/.test(t)), `${fassung}: Schritt „Elektroplan“ fehlt`);
    if (fassung === 'lang') ok(titel.some(t => /forcen/.test(t)), 'lang: Schritt „Sensoren forcen“ fehlt');
    // Kapitelkarten (Christoph 16.11.2026): in der ausführlichen Tour vor jedem der zehn Kapitel, in der kurzen keine.
    const karten = titel.filter(t => /Kapitel \d+ von \d+:/.test(t));
    ok(karten.length === (fassung === 'lang' ? 10 : 0), `${fassung}: ${karten.length} Kapitelkarten`);
    if (fassung === 'lang') ok(/Willkommen/.test(titel[0]) && /Kapitel 1 von 10/.test(titel[1]) && /Kapitel 10 von 10/.test(karten[9] || ''), 'lang: Karten an falscher Stelle');
    ok(fehler.length === 0, `${fassung} ${w}x${h}: Seitenfehler ${fehler.join(' | ')}`);
    console.log(`${fassung} ${w}x${h}: ${titel.length} Schritte`);
    await page.close();
  }
  console.log(`${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
