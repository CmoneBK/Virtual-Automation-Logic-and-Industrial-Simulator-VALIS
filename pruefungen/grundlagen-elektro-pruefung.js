const { chromium } = require('playwright');
// Prüfung Grundlagen-Messplatz (grundlagen-elektro.js): Reihe, parallel,
// gemischt, Ohm nur spannungsfrei, Sicherung, Lampe, Aufgaben, Oberfläche.
//
//   node pruefungen/grundlagen-elektro-pruefung.js   (GE_BILD=datei.png für ein Bild)
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
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const fehler = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  const w = ms => page.waitForTimeout(ms);
  const nahe = (a, b, t) => a != null && Math.abs(a - b) <= (t || Math.abs(b) * 0.005 + 1e-4);

  console.log('Lernzentrum');
  await page.evaluate(() => { try { openHub(); } catch (e) {} }); await w(400);
  const eintrag = await page.evaluate(() => !!document.querySelector(".hub-item[onclick=\"hubLaunch('grundlagen')\"]"));
  ok('Eintrag ⚡ Grundlagen Elektrotechnik im Lernzentrum', eintrag);
  await page.evaluate(() => hubLaunch('grundlagen')); await w(400);
  const offen = await page.evaluate(() => { const f = document.getElementById('ge-fenster'); return !!f && getComputedStyle(f).display !== 'none'; });
  ok('Fenster öffnet aus dem Lernzentrum', offen);

  console.log('Reihenschaltung R1 100 Ω + R2 220 Ω an 12 V');
  const r = await page.evaluate(() => {
    const G = window.GrundlagenE;
    G.vorlage('reihe'); G.setzen({ u: 12, r: { R1: 100, R2: 220 }, an: true });
    const u1 = G.messen('V', 'R1a', 'R1b').wert, u2 = G.messen('V', 'R2a', 'R2b').wert, u = G.messen('V', 'Q+', 'Q-').wert;
    // Strom: Kabel Q+–R1a heraus, Messgerät in den Kreis
    G.setzen({ kabel: [['R1b', 'R2a'], ['R2b', 'Q-']] });
    const i = G.messen('A', 'Q+', 'R1a').wert;
    const ohneA = G.messen('V', 'R1a', 'R1b').wert;
    return { u1, u2, u, i, ohneA };
  });
  ok('I ≈ 37,5 mA', nahe(r.i, 0.0375, 0.0003), r.i);
  ok('U1 ≈ 3,75 V', nahe(r.u1, 3.75, 0.03), r.u1);
  ok('U2 ≈ 8,25 V', nahe(r.u2, 8.25, 0.05), r.u2);
  ok('U1 + U2 = U (Klemmenspannung)', nahe(r.u1 + r.u2, r.u, 0.01), r.u);
  ok('Offener Kreis ohne Amperemeter: kein Spannungsfall an R1', nahe(r.ohneA, 0, 0.01), r.ohneA);

  console.log('Parallelschaltung R1 ∥ R2');
  const p = await page.evaluate(() => {
    const G = window.GrundlagenE;
    G.vorlage('parallel'); G.setzen({ u: 12, an: true });
    const err = G.messen('Ω', 'A1', 'B1');
    const uR1 = G.messen('V', 'R1a', 'R1b').wert, uR2 = G.messen('V', 'R2a', 'R2b').wert;
    G.setzen({ an: false });
    const rg = G.messen('Ω', 'A1', 'B1').wert;
    const rEinzel = G.messen('Ω', 'R3a', 'R3b').wert;
    const offen = G.messen('Ω', 'R1a', 'R3a').text;
    return { err: err.text, hinweis: err.hinweis, uR1, uR2, rg, rEinzel, offen };
  });
  ok('Ω bei eingeschaltetem Netzteil: Err mit Hinweis', p.err === 'Err' && /spannungsfrei/.test(p.hinweis || ''), p.err);
  ok('Beide Zweige liegen an derselben Spannung', nahe(p.uR1, p.uR2, 0.001) && p.uR1 > 11.5, p.uR1 + ' / ' + p.uR2);
  ok('Ersatzwiderstand ≈ 68,75 Ω', nahe(p.rg, 68.75, 0.2), p.rg);
  ok('Einzelwiderstand R3 330 Ω', nahe(p.rEinzel, 330, 0.5), p.rEinzel);
  ok('Kein Stromweg: OL', p.offen === 'OL', p.offen);

  console.log('Gemischt, Sicherung, Lampe');
  const g = await page.evaluate(() => {
    const G = window.GrundlagenE;
    G.vorlage('gemischt'); G.setzen({ u: 24, an: false });
    const rg = G.messen('Ω', 'Q+', 'Q-').wert;
    G.setzen({ an: true });
    const u1 = G.messen('V', 'R1a', 'R1b').wert;
    // Kurzschluss
    G.setzen({ kabel: [['Q+', 'Q-']], an: true });
    const kurz = G.zustand().ausgeloest;
    // Lampe
    G.vorlage('lampe'); G.setzen({ u: 12, an: true, schalter: true });
    const hell = G.lampe();
    G.setzen({ schalter: false });
    const dunkel = G.lampe();
    G.setzen({ u: 6, schalter: true });
    const halb = G.lampe();
    return { rg, u1, kurz, hell, dunkel, halb };
  });
  const rp = 1 / (1 / 220 + 1 / 330);
  ok('Gesamtwiderstand gemischt ≈ 232 Ω', nahe(g.rg, 100 + rp, 0.3), g.rg);
  ok('U1 gemischt ≈ 10,34 V', nahe(g.u1, 24 * 100 / (100 + rp), 0.06), g.u1);
  ok('Kurzschluss löst die Sicherung aus', g.kurz === true);
  ok('Lampe an 12 V hell', g.hell > 0.95, g.hell);
  ok('Schalter offen: Lampe dunkel', g.dunkel < 0.001, g.dunkel);
  ok('Lampe an 6 V: ein Viertel der Leistung', nahe(g.halb, 0.25, 0.02), g.halb);

  console.log('Aufgaben');
  const a = await page.evaluate(() => {
    const G = window.GrundlagenE;
    const richtig = G.AUFGABEN.map((x, i) => { const w = {}; x.felder.forEach(f => { w[f[0]] = String(f[2].toFixed(3)).replace('.', ','); }); return G.aufgabePruefen(i, w).every(e => e.ok); });
    const falsch = G.aufgabePruefen(0, { I: '50', U1: '3,75', U2: '8,25' }).map(e => e.ok);
    G.aufgabeLaden(2);
    return { richtig, falsch, z: G.zustand() };
  });
  ok('Richtige Werte werden angenommen (alle 3 Aufgaben)', a.richtig.every(Boolean), a.richtig.join());
  ok('Falscher Strom wird erkannt', a.falsch[0] === false && a.falsch[1] && a.falsch[2], a.falsch.join());
  ok('Aufgabe 3 stellt 24 V ein', a.z.u === 24);

  console.log('Oberfläche');
  const ui = await page.evaluate(() => {
    const f = document.getElementById('ge-fenster');
    return { buchsen: f.querySelectorAll('[data-b]').length, svg: !!f.querySelector('svg'), txt: f.textContent };
  });
  ok('Steckbrett mit Buchsen gezeichnet', ui.svg && ui.buchsen >= 20, ui.buchsen);
  // Kabel per Klick stecken
  await page.evaluate(() => { const G = window.GrundlagenE; G.vorlage('leer'); G.setzen({ an: false }); });
  const vorher = await page.evaluate(() => window.GrundlagenE.zustand().kabel.length);
  await page.click('#ge-fenster [data-b="Q+"]', { force: true }); await w(100);
  await page.click('#ge-fenster [data-b="R1a"]', { force: true }); await w(100);
  const nachher = await page.evaluate(() => window.GrundlagenE.zustand().kabel);
  ok('Kabel per Klick Buchse → Buchse', nachher.length === vorher + 1 && nachher.some(k => k.join() === 'Q+,R1a'), JSON.stringify(nachher));
  if (process.env.GE_BILD) {
    await page.evaluate(() => { const G = window.GrundlagenE; G.vorlage('reihe'); G.setzen({ u: 12, an: true }); G.messen('V', 'R2a', 'R2b'); });
    await w(200);
    await page.locator('#ge-fenster').screenshot({ path: process.env.GE_BILD });
  }
  ok('Keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
