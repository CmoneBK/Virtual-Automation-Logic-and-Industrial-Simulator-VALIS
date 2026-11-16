const { chromium } = require('playwright');
// Prüfung Komponenten-Tutorials (komponenten-tutorials.js + Zylinder/Sensoren
// aus index.html): Übersicht, jedes Kapitel, Einsetzen-Knöpfe, Beispiele,
// Code-Beispiele ohne Fehlermeldung und mit dem beschriebenen Verhalten,
// Suche im Lernzentrum, korrigierte Drosselformel im Zylinder-Tutorial.
//
//   node pruefungen/komponenten-tutorials-pruefung.js
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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisEpneuMode', '1'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  const w = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} });

  console.log('Übersicht');
  const idx = await page.evaluate(() => ({
    kats: window._tutIndex.map(c => c.cat),
    keys: window._tutIndex.flatMap(c => c.entries.map(e => e.key)),
    fehlend: window._tutIndex.flatMap(c => c.entries.map(e => e.key)).filter(k => !window._tutData[k])
  }));
  ok('14 Tutorials in 11 Kategorien', idx.keys.length === 14 && idx.kats.length === 11, idx.keys.join(' '));
  ok('Zylinder und Sensoren bleiben erhalten', idx.keys.includes('zylinder') && idx.keys.includes('sensor_ber'));
  ok('Jeder Eintrag hat Inhalt', idx.fehlend.length === 0, idx.fehlend.join(' '));
  await page.evaluate(() => openHub('tutorials')); await w(500);
  const karten = await page.evaluate(() => document.querySelectorAll('#tut-index-body .tut-card').length);
  ok('Lernzentrum zeigt 14 Karten', karten === 14, karten);
  await page.evaluate(() => closeHub()); await w(200);

  console.log('Jedes Kapitel');
  const kap = await page.evaluate(() => {
    const probleme = []; let n = 0;
    for (const key of Object.keys(window._tutData)) {
      const d = window._tutData[key];
      openCompTutorial(key);
      for (let i = 0; i < d.chapters.length; i++) {
        if (i) window._tutNav(1);
        const a = document.getElementById('tut-content-area');
        const prog = document.getElementById('tut-progress').textContent;
        n++;
        if (!a || a.textContent.trim().length < 150) probleme.push(key + ' ' + (i + 1) + ' leer');
        if (prog !== (i + 1) + ' / ' + d.chapters.length) probleme.push(key + ' ' + (i + 1) + ' Fortschritt ' + prog);
        if (!a.querySelector('h2')) probleme.push(key + ' ' + (i + 1) + ' ohne Überschrift');
      }
      closeCompTutorial();
    }
    return { n, probleme };
  });
  ok('alle Kapitel zeigen Inhalt, Überschrift und Fortschritt', kap.probleme.length === 0 && kap.n > 60, kap.n + ' Kapitel ' + kap.probleme.join('; '));

  const verweise = await page.evaluate(() => {
    const html = Object.values(window._tutData).map(d => d.chapters.map(c => c.content).join('')).join('');
    const tut = [...html.matchAll(/openCompTutorial\('([a-z_]+)'\)/g)].map(m => m[1]).filter(k => !window._tutData[k]);
    const menue = document.body.innerHTML;
    const typen = KompTut._typen().filter(t => !menue.includes("addFactoryDevice('" + t + "')") && !menue.includes("_neu2D('" + t + "')"));
    return { tut, typen, anzahl: KompTut._typen().length };
  });
  ok('Verweise auf andere Tutorials gehen ins Leere: keiner', verweise.tut.length === 0, verweise.tut.join(' '));
  ok('jeder Einsetzen-Knopf hat ein Bauteil im Menü', verweise.typen.length === 0 && verweise.anzahl > 60, verweise.anzahl + ' Typen ' + verweise.typen.join(' '));

  console.log('Einsetzen');
  const ein = await page.evaluate(async () => {
    const z = () => factoryObjects.length;
    const r = {};
    openCompTutorial('struktur');
    const n0 = z(); KompTut.einsetzen('wall'); await new Promise(s => setTimeout(s, 300));
    r.wand = z() === n0 + 1 && factoryObjects.some(o => o.type === 'wall');
    r.tutZu = !document.getElementById('comp-tut-overlay').classList.contains('open');
    KompTut.einsetzen('led'); await new Promise(s => setTimeout(s, 300));
    const m = document.getElementById('factory-modal');
    r.dialog = !!m && getComputedStyle(m).display !== 'none';
    try { closeFactoryModal(); } catch (e) { if (m) m.style.display = 'none'; }
    const n1 = z(); KompTut.einsetzen('compressor'); await new Promise(s => setTimeout(s, 300));
    r.kompressor = z() === n1 + 1 && document.getElementById('tb-dropdown-pneu').style.display !== 'none';
    const n2 = z(); KompTut.einsetzen('manometer'); await new Promise(s => setTimeout(s, 500));
    r.manometer = z() > n2;
    const n3 = z(); KompTut.einsetzen('oil_tank'); await new Promise(s => setTimeout(s, 300));
    r.tank = z() === n3 + 1 && document.getElementById('tb-dropdown-hyd').style.display !== 'none';
    return r;
  });
  ok('Wand wird direkt eingesetzt, Tutorial schließt', ein.wand && ein.tutZu, JSON.stringify(ein));
  ok('Meldeleuchte öffnet den Zuweisungsdialog', ein.dialog);
  ok('Kompressor: Pneumatik-Menü an, Bauteil da', ein.kompressor);
  ok('Manometer (Fluidplan-Teil) kommt in die Anlage', ein.manometer);
  ok('Öltank: Hydraulik-Menü an, Bauteil da', ein.tank);

  console.log('Öffnen-Knöpfe');
  const auf = await page.evaluate(async () => {
    KompTut.oeffne('oszi'); await new Promise(s => setTimeout(s, 400));
    const o = document.getElementById('analyzer-modal'); const oszi = !!o && getComputedStyle(o).display !== 'none';
    try { closeAnalyzerModal(); } catch (e) {}
    KompTut.oeffne('fluidplan'); await new Promise(s => setTimeout(s, 600));
    const f = document.getElementById('fluid-wrapper'); const fluid = !!f && getComputedStyle(f).display !== 'none';
    try { Fluidplan.schliessen(); } catch (e) {}
    KompTut.oeffne('uebungsanlagen'); await new Promise(s => setTimeout(s, 400));
    const h = document.getElementById('hub-overlay'); const ua = !!h && h.classList.contains('open');
    try { closeHub(); } catch (e) {}
    return { oszi, fluid, ua };
  });
  ok('Oszilloskop, Fluidplan und Übungsanlagen öffnen', auf.oszi && auf.fluid && auf.ua, JSON.stringify(auf));

  console.log('Code-Beispiele ohne Fehlermeldung');
  const codes = await page.evaluate(() => KompTut._codes());
  const mitFehler = [];
  for (const [k, c] of Object.entries(codes)) {
    const n = await page.evaluate(async c => {
      const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 800));
      return document.querySelectorAll('#error-gutter .error-icon').length + (window._errorLines ? window._errorLines.size : 0);
    }, c);
    if (n) mitFehler.push(k);
  }
  ok(Object.keys(codes).length + ' Beispiele, keines mit Fehlermeldung', mitFehler.length === 0 && Object.keys(codes).length >= 25, mitFehler.join(' '));
  const ersetzt = await page.evaluate(() => { _tutInsertCode('kt_bed_startstopp', 'replace'); return document.getElementById('code').value === KompTut._codes().kt_bed_startstopp; });
  ok('„Ersetzen“ schreibt das Beispiel in den Editor', ersetzt);

  console.log('Verhalten der Beispiele');
  const setCode = c => page.evaluate(c => { if (isSimulationActive) toggleSimulation(); const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, c);
  const start = () => page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); });
  const st = (...v) => page.evaluate(v => Object.fromEntries(v.map(k => [k, spsState[k]])), v);
  const tippe = async n => { await page.evaluate(n => setTaster(n, true), n); await w(200); await page.evaluate(n => setTaster(n, false), n); await w(250); };
  await page.evaluate(() => { factoryObjects.slice().forEach(o => { try { deleteFactoryObject(o.id); } catch (e) {} }); });
  await setCode(codes.kt_si_nothalt); await w(900); await start(); await w(200);
  await tippe('START'); const a1 = await st('MOTOR');
  await page.evaluate(() => setTaster('NOTHALT', true)); await w(300); const a2 = await st('MOTOR', 'STOERUNG');
  await page.evaluate(() => setTaster('NOTHALT', false)); await w(300); const a3 = await st('MOTOR', 'STOERUNG');
  await tippe('QUITT'); await tippe('START'); const a4 = await st('MOTOR', 'STOERUNG');
  ok('Not-Halt: stoppt, bleibt nach Entriegeln aus, läuft erst nach Quittieren und Start', a1.MOTOR && !a2.MOTOR && a2.STOERUNG && !a3.MOTOR && a3.STOERUNG && a4.MOTOR && !a4.STOERUNG, JSON.stringify([a1, a2, a3, a4]));
  await setCode(codes.kt_foe_takt); await w(900); await start(); await w(200); await tippe('START');
  let flanken = 0, vorher = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 7000) { const s = await st('TRAEGER_STEP'); if (s.TRAEGER_STEP && !vorher) flanken++; vorher = !!s.TRAEGER_STEP; await w(60); }
  ok('Takt: STEP kommt als wiederholte Flanke (etwa alle 3 s)', flanken >= 2 && flanken <= 3, flanken);
  await setCode(codes.kt_ana_norm); await w(900); await start(); await w(200);
  await page.evaluate(() => { spsState.I_MA = 12; }); await w(300); const n1 = await st('TEMP', 'FUEHLERFEHLER');
  await page.evaluate(() => { spsState.I_MA = 2; }); await w(300); const n2 = await st('FUEHLERFEHLER');
  ok('4 … 20 mA: 12 mA = 50 °C, 2 mA = Fühlerfehler', n1.TEMP === 50 && !n1.FUEHLERFEHLER && !!n2.FUEHLERFEHLER, JSON.stringify([n1, n2]));
  await setCode(codes.kt_ana_zweipunkt); await w(900); await start(); await w(200);
  const zp = [];
  for (const t of [40, 56, 52, 49]) { await page.evaluate(t => { spsState.OELTEMP = t; }, t); await w(250); zp.push(!!(await st('UEBERTEMP')).UEBERTEMP); }
  ok('Zweipunkt: ein über 55, bleibt bei 52, aus unter 50', JSON.stringify(zp) === '[false,true,true,false]', JSON.stringify(zp));
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); });

  console.log('Beispiele laden');
  const bsp = await page.evaluate(() => KompTut._beispiele());
  for (const key of bsp) {
    const r = await page.evaluate(async key => { KompTut.beispiel(key); await new Promise(s => setTimeout(s, 900)); return { code: document.getElementById('code').value.length, obj: factoryObjects.length }; }, key);
    ok('Beispiel ' + key + ' lädt Code und Anlage', r.code > 20 && r.obj > 0, JSON.stringify(r));
  }

  console.log('Suche und Zylinder-Tutorial');
  const such = await page.evaluate(async () => {
    openHub(); await new Promise(s => setTimeout(s, 300));
    hubFilter('portalkran'); await new Promise(s => setTimeout(s, 300));
    const titel = Array.from(document.querySelectorAll('.hub-sr-title')).map(e => e.textContent);
    closeHub();
    return titel;
  });
  ok('Suche „portalkran“ findet das Tutorial Handling', such.includes('Handling'), such.join(' | '));
  const zyl = await page.evaluate(() => {
    const ch = window._tutData.zylinder.chapters;
    return { neu: ch[6].content.includes('min(Q<sub>N</sub>'), alt: ch[6].content.includes('Q<sub>max</sub> × (Öffnung'), fluid: ch[5].content.includes('Fluidplan') };
  });
  ok('Zylinder Kap. 7: Drosselformel nach Nenndurchfluss, alte Formel weg', zyl.neu && !zyl.alt, JSON.stringify(zyl));
  ok('Zylinder Kap. 6 nennt den Fluidplan', zyl.fluid);

  ok('keine Fehler auf der Seite', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
