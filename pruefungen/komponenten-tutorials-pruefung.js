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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.setItem('valisEpneuMode', '1'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  const w = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} });

  console.log('Übersicht');
  const idx = await page.evaluate(() => ({
    kats: window._tutIndex.map(c => c.cat),
    keys: window._tutIndex.flatMap(c => c.entries.map(e => e.key)),
    fehlend: window._tutIndex.flatMap(c => c.entries.map(e => e.key)).filter(k => !window._tutData[k])
  }));
  ok('15 Tutorials in 11 Kategorien', idx.keys.length === 15 && idx.kats.length === 11, idx.keys.join(' '));
  ok('Zylinder und Sensoren bleiben erhalten', idx.keys.includes('zylinder') && idx.keys.includes('sensor_ber'));
  ok('Jeder Eintrag hat Inhalt', idx.fehlend.length === 0, idx.fehlend.join(' '));
  await page.evaluate(() => openHub('tutorials')); await w(500);
  const karten = await page.evaluate(() => document.querySelectorAll('#tut-index-body .tut-card').length);
  ok('Lernzentrum zeigt 15 Karten', karten === 15, karten);
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

  console.log('Roboter');
  const fabrik = () => page.evaluate(() => { const fw = document.getElementById('factory-wrapper'); if (getComputedStyle(fw).display === 'none') toggleWorkspaceView('factory-wrapper'); });
  const robo = () => page.evaluate(() => { const r = factoryObjects.find(o => o.type === 'robot_arm_2d' || o.type === 'worker_2d'); return { grab: !!(r && r.grabbedItem), status: r && r._statusBadge ? r._statusBadge.textContent : '', zyklen: r && r._cycleCount, tx: r && r.targetX, ty: r && r.targetY, ansicht: globalViewMode }; });
  await page.evaluate(() => KompTut.beispiel('roboter_handshake')); await w(1500); await fabrik(); await w(300); await start(); await w(500);
  const r0 = await robo();
  await tippe('START');
  let gegriffen = false, fertig = false, abgelegt = false, freigabeVorGreifen = true;
  for (let i = 0; i < 40 && !(gegriffen && fertig); i++) {
    await w(400);
    const a = await robo(), s = await st('FREIGABE', 'ROBO_FERTIG', 'LED_ABGELEGT');
    if (a.grab && !gegriffen) { gegriffen = true; freigabeVorGreifen = !!s.FREIGABE || freigabeVorGreifen; }
    if (gegriffen && s.ROBO_FERTIG && s.LED_ABGELEGT) fertig = true;
    if (gegriffen && !a.grab) abgelegt = true;
  }
  ok('Beispiel Roboterarm lädt in der Draufsicht und wartet in Grundstellung', r0.ansicht === 'top' && /Warte|Waiting/.test(r0.status), JSON.stringify(r0));
  ok('Handshake: Roboter greift nach FREIGABE, legt ab und meldet ROBO_FERTIG', gegriffen && abgelegt && fertig, JSON.stringify({ gegriffen, abgelegt, fertig }));
  // Zykluszähler im Einpfad-Modus, Wegpunkt-Aktion schreibt in einen SPS-Eingang
  await page.evaluate(() => { const r = factoryObjects.find(o => o.type === 'robot_arm_2d'); r.cycleCountVar = 'ZYKLEN'; r._cycleCount = 0; r.pathSpeed = 8; });
  await w(6000);
  const zz = await page.evaluate(() => ({ z: spsState.ZYKLEN, r: factoryObjects.find(o => o.type === 'robot_arm_2d')._cycleCount }));
  ok('Zykluszähler zählt im Einpfad-Modus', zz.r >= 1 && zz.z === zz.r, JSON.stringify(zz));
  const popup = await page.evaluate(() => { const r = factoryObjects.find(o => o.type === 'robot_arm_2d'); window._showWpActionPopup(100, 100, r.waypoints, 0); const el = document.getElementById('_wp-action-popup'); const n = el ? el.querySelectorAll('option').length : 0; const t = el ? el.textContent : ''; if (el) el.remove(); return { n, eingang: t.includes('ROBO_FERTIG'), ausgang: t.includes('FREIGABE') }; });
  ok('⚙ Aktion bietet Ein- und Ausgänge an', popup.eingang && popup.ausgang && popup.n > 10, JSON.stringify(popup));
  // Tippen: Zielpunkt bleibt im Arbeitsraum
  await page.evaluate(() => { const r = factoryObjects.find(o => o.type === 'robot_arm_2d'); r.pathEnabled = false; r.linkedVarX_Plus = 'BAND'; r.targetX = 0; r.targetY = 100; spsState.BAND = true; });
  await w(1500);
  const rand = await page.evaluate(() => { const r = factoryObjects.find(o => o.type === 'robot_arm_2d'); return Math.round(Math.hypot(r.targetX, r.targetY)); });
  ok('Tippen über den Rand: Zielpunkt bleibt am Rand des Arbeitsraums', rand <= 140, rand);
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); });
  await page.evaluate(() => KompTut.beispiel('mensch_lichtgitter')); await w(1500); await fabrik(); await w(300); await start(); await w(300);
  await tippe('START');
  const m0 = await st('BAND');
  let gestoppt = false, frei = false;
  for (let i = 0; i < 40 && !(gestoppt && frei); i++) { await w(400); const s = await st('BAND', 'LICHTGITTER'); if (!s.LICHTGITTER && !s.BAND) gestoppt = true; if (gestoppt && s.LICHTGITTER) frei = true; }
  await w(400); const m1 = await st('BAND');
  await tippe('START'); const m2 = await st('BAND');
  ok('Mensch am Lichtgitter: Band stoppt, bleibt nach Verlassen aus, läuft nach START', m0.BAND && gestoppt && frei && !m1.BAND && m2.BAND, JSON.stringify({ m0, gestoppt, frei, m1, m2 }));
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
