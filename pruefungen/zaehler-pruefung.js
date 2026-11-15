const { chromium } = require('playwright');
// Prüfung Vorwahlzähler und Zeitrelais-Funktion TP im Steckaufbau:
// Belegung, Verdrahtung (Zähleingang A1/A2, Rücksetzen A3/A4), Zählen in
// der Simulation, Anzeige, Multimeter-Modell und Freier Aufbau (Code aus
// Aufbau mit CTU).
//
//   node pruefungen/zaehler-pruefung.js
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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  const w = ms => page.waitForTimeout(ms);
  await page.evaluate(async () => { try { closeHub(); } catch (e) {} if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);

  console.log('Standard-Steckaufbau: VOLL := CTU(ZAEHL, RESET, 3), IMP := TP(START, 2)');
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'VOLL := CTU(ZAEHL, RESET, 3)\nH1 := VOLL\nIMP := TP(START, 2)\nH2 := IMP'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1200);
  const a = await page.evaluate(() => { const m = window._elSteckModell(); return { asg: window._festoLastAssignments, kabel: m.kabel.map(k => k.a + '>' + k.b), el: m.elemente.filter(e => /^C1_/.test(e.a)).map(e => e.art + ':' + e.a + '-' + e.b) }; });
  ok('CTU liegt auf dem Vorwahlzähler, nicht auf einem Hilfsrelais', a.asg.C1_S1 === 'CTU_VOLL' && !Object.entries(a.asg).some(([k, v]) => /^R/.test(k) && v === 'CTU_VOLL'), JSON.stringify(a.asg));
  ok('TP liegt auf dem Zeitrelais', a.asg.Z1_S1 === 'IMP');
  const hat = k => a.kabel.includes(k);
  ok('Zählstrang: +24 V → ZAEHL → A1, A2 → 0 V', hat('__BUS_24V__>T1_S2_13') && hat('T1_S2_14>C1_S1_A1') && hat('C1_S1_A2>__BUS_0V__'));
  ok('Rücksetzstrang eigenständig: +24 V → RESET → A3, A4 → 0 V', hat('__BUS_24V__>T1_S3_13') && hat('T1_S3_14>C1_S1_A3') && hat('C1_S1_A4>__BUS_0V__'));
  ok('ZAEHL und RESET nicht in Reihe', !hat('T1_S2_14>T1_S3_13'));
  ok('Schließer 13/14 des Zählers schaltet weiter', hat('__BUS_24V__>C1_S1_13') && a.kabel.some(k => k.startsWith('C1_S1_14>')));
  ok('Multimeter-Modell kennt beide Spulen und vier Kontakte', a.el.filter(x => x.startsWith('last')).length === 2 && a.el.filter(x => x.startsWith('kontakt')).length === 4, a.el.join(' '));
  const beschr = await page.evaluate(() => [window._elBuchseName('C1_S1_A3'), window._elBuchseName('C1_S1_32')]);
  ok('Buchsen haben Namen', /Rücksetzen A3/.test(beschr[0]) && /Öffner/.test(beschr[1]), beschr.join(' | '));
  // Simulation: zählen
  await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(300);
  for (let i = 0; i < 2; i++) { await page.evaluate(() => setTaster('ZAEHL', true)); await w(200); await page.evaluate(() => setTaster('ZAEHL', false)); await w(200); }
  let z = await page.evaluate(() => ({ cv: window.simTimers.CTU_VOLL.cv, h1: !!spsState.H1 }));
  ok('Zwei Impulse: Stand 2, H1 aus', z.cv === 2 && !z.h1, JSON.stringify(z));
  await page.evaluate(() => setTaster('ZAEHL', true)); await w(200); await page.evaluate(() => setTaster('ZAEHL', false)); await w(300);
  // Steckaufbau öffnen (über den Werkzeugleisten-Knopf)
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1200);
  z = await page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const ist = svg && svg.querySelector('[data-festo-zaehler-ist="C1_S1"]'), vw = svg && svg.querySelector('[data-festo-zaehler-vorwahl="C1_S1"]');
    const q = svg && svg.querySelector('[data-festo-zaehler-led="q"][data-festo-slot="C1_S1"]');
    const fn = svg && svg.querySelector('[data-festo-zr-funktion="Z1_S1"]');
    return { cv: window.simTimers.CTU_VOLL.cv, h1: !!spsState.H1, ist: ist && ist.textContent, vw: vw && vw.textContent, q: q && q.getAttribute('fill'), fn: fn && fn.textContent };
  });
  ok('Drei Impulse: Vorwahl erreicht, H1 an', z.cv === 3 && z.h1, JSON.stringify(z));
  ok('Anzeige am Brett: Stand 3, Vorwahl 3, LED „erreicht“ an', z.ist === '3' && z.vw === '3' && z.q === '#ff6d00');
  ok('Zeitrelais-Slot zeigt Funktion TP', z.fn === 'Funktion TP', z.fn);
  await page.evaluate(() => setTaster('RESET', true)); await w(200); await page.evaluate(() => setTaster('RESET', false)); await w(200);
  z = await page.evaluate(() => ({ cv: window.simTimers.CTU_VOLL.cv, h1: !!spsState.H1 }));
  ok('RESET: Stand 0, H1 aus', z.cv === 0 && !z.h1, JSON.stringify(z));
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); }); await w(200);

  console.log('Freier Aufbau: Vorwahlzähler und Zeitrelais stecken, Code aus Aufbau');
  const f = await page.evaluate(() => {
    window._toggleFestoFreeBuild(true);
    const A = window._fbAusSicht;
    A.module().forEach(m => A.entfernen(m.prefix));
    const T = A.modul('taster'), C = A.modul('zaehler'), L = A.modul('led');
    const st = (a, b) => A.stecken(a, b).ok;
    const r = [st(T + '_24V_1', T + '_S2_13'), st(T + '_S2_14', C + '_S1_A1'), st(C + '_S1_A2', C + '_0V_1'),
      st(T + '_24V_2', T + '_S3_13'), st(T + '_S3_14', C + '_S1_A3'), st(C + '_S1_A4', C + '_0V_2'),
      st(C + '_24V_1', C + '_S1_13'), st(C + '_S1_14', L + '_S1_24V_a')];
    const v = A.vorwahl(C + '_S1', 2);
    const c = A.code();
    return { r, v, c, src: document.getElementById('code').value, typen: A.typen().map(t => t.art) };
  });
  ok('Vorwahlzähler ist ein Modul des Freien Aufbaus', f.typen.includes('zaehler'));
  ok('Kabel gesteckt', f.r.every(Boolean));
  ok('Code aus Aufbau: CTU mit Rücksetzen und Vorwahl', f.c.ok && new RegExp(f.v + ' := CTU\\(\\w+, ' + f.v + '_R, 2\\)').test(f.src), f.src.replace(/\n+/g, ' | '));
  ok('Zähler heißt KF…', /^KF\d+$/.test(f.v || ''), f.v);
  await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(300);
  const sj = (f.src.match(/CTU\((\w+),/) || [])[1];
  for (let i = 0; i < 2; i++) { await page.evaluate(n => setTaster(n, true), sj); await w(200); await page.evaluate(n => setTaster(n, false), sj); await w(200); }
  const led = (f.src.match(/(PF\d+) := /) || [])[1];
  z = await page.evaluate(([v, l]) => ({ q: !!spsState[v], led: !!spsState[l] }), [f.v, led]);
  ok('Zwei Impulse im Freien Aufbau: Zähler schaltet die LED', z.q && z.led, JSON.stringify(z));
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); window._toggleFestoFreeBuild(false); });

  ok('Keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
