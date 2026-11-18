const { chromium } = require('playwright');
// Prüfung Vorwahlzähler FESTO 162355 und Zeitrelais-Funktion TP im Steckaufbau:
// Belegung, Verdrahtung (Zähleingang A1/A2, Rücksetzen R1/R2, Wechsler 1/2/4),
// Hilfsrelais bei mehr als einem Kontaktsatz, Zählen in der Simulation,
// Anzeige, Vorwahl-Tasten, Rückstelltaste, Multimeter-Modell, Freier Aufbau
// (Code aus Aufbau mit CTU) und Umschreiben alter Lernmodell-Aufbauten.
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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
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
  ok('Rücksetzstrang eigenständig: +24 V → RESET → R1, R2 → 0 V', hat('__BUS_24V__>T1_S3_13') && hat('T1_S3_14>C1_S1_R1') && hat('C1_S1_R2>__BUS_0V__'));
  ok('ZAEHL und RESET nicht in Reihe', !hat('T1_S2_14>T1_S3_13'));
  ok('Schließer 4–1 des Wechslers schaltet weiter (ein Kontaktsatz, kein Hilfsrelais)', hat('__BUS_24V__>C1_S1_4') && a.kabel.some(k => k.startsWith('C1_S1_1>')) && !Object.entries(a.asg).some(([k, v]) => /^R/.test(k) && v === 'CTU_VOLL'), a.kabel.filter(k => /C1/.test(k)).join(' '));
  ok('Multimeter-Modell kennt beide Spulen und den Wechsler (Schließer 4–1, Öffner 2–1)', a.el.filter(x => x.startsWith('last')).length === 2 && a.el.filter(x => x.startsWith('kontakt')).sort().join(' ') === 'kontakt:C1_S1_2-C1_S1_1 kontakt:C1_S1_4-C1_S1_1', a.el.join(' '));
  const beschr = await page.evaluate(() => [window._elBuchseName('C1_S1_R1'), window._elBuchseName('C1_S1_2'), window._elBuchseName('C1_S1_4')]);
  ok('Buchsen haben Namen', /Rücksetzen R1/.test(beschr[0]) && /Öffner/.test(beschr[1]) && /Schließer/.test(beschr[2]), beschr.join(' | '));
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
    const stellen = sel => Array.from(svg.querySelectorAll(sel)).sort((a, b) => a.getAttribute('data-festo-stelle') - b.getAttribute('data-festo-stelle')).map(t => t.textContent).join('');
    const hebel = svg.querySelector('[data-festo-zl-wechsler][data-festo-slot="C1_S1"]');
    const fn = svg && svg.querySelector('[data-festo-zr-funktion="Z1_S1"]');
    const brett = svg.querySelector('[data-festo-panel-type="zaehler"]');
    const buchsen = Array.from(brett.querySelectorAll('[data-festo-socket]')).map(e => e.getAttribute('data-festo-socket'));
    return { cv: window.simTimers.CTU_VOLL.cv, h1: !!spsState.H1, ist: stellen('[data-festo-zaehler-ist="C1_S1"]'), vw: stellen('[data-festo-zaehler-vorwahl="C1_S1"]'),
      hebelX: hebel && +hebel.getAttribute('x2'), fn: fn && fn.textContent,
      fiktivC: !!svg.querySelector('[data-festo-panel-type="zaehler"] [data-festo-fiktiv]'), fiktivTP: !!svg.querySelector('[data-festo-fiktiv="tp"]'),
      fiktivAndere: svg.querySelectorAll('[data-festo-fiktiv]').length, buchsen: buchsen.length,
      pins: ['A1', 'A2', 'R1', 'R2', '1', '2', '4'].every(p => buchsen.includes('C1_S1_' + p)), titel: brett.textContent.includes('162355') };
  });
  ok('Drei Impulse: Vorwahl erreicht, H1 an', z.cv === 3 && z.h1, JSON.stringify(z));
  ok('Zählwerk: Stand 003, Vorwahl 003, Wechsler liegt am Schließer 4', z.ist === '003' && z.vw === '003' && z.hebelX === 140, JSON.stringify(z));
  ok('Frontplatte wie FESTO 162355: 6+6 Verteiler, A1 A2 R1 R2 1 2 4', z.titel && z.pins && z.buchsen === 19, JSON.stringify(z));
  ok('Zeitrelais-Slot zeigt Funktion TP', z.fn === 'Funktion TP', z.fn);
  ok('Zähler ist ein echtes Modul (kein „gibt es so nicht“), TP bleibt markiert', !z.fiktivC && z.fiktivTP && z.fiktivAndere === 1, JSON.stringify([z.fiktivC, z.fiktivTP, z.fiktivAndere]));
  // Vorwahl-Taste der Einerstelle: 3 → 4 in der Codezeile
  await page.evaluate(() => { const t = _festoDoc().querySelector('[data-festo-zaehler-taste="2"][data-festo-slot="C1_S1"]'); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await w(900);
  z = await page.evaluate(() => document.getElementById('code').value);
  ok('Taste am Zählwerk stellt die Vorwahl in der Codezeile (3 → 4)', /VOLL := CTU\(ZAEHL, RESET, 4\)/.test(z), z.split('\n')[0]);
  // Weiße Rückstelltaste
  await page.evaluate(() => { const t = _festoDoc().querySelector('[data-festo-zaehler-hand="C1_S1"]'); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await w(300);
  z = await page.evaluate(() => ({ cv: window.simTimers.CTU_VOLL ? window.simTimers.CTU_VOLL.cv : -1 }));
  ok('Rückstelltaste setzt den Zählerstand auf 0', z.cv === 0, JSON.stringify(z));
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
      st(T + '_24V_2', T + '_S3_13'), st(T + '_S3_14', C + '_S1_R1'), st(C + '_S1_R2', C + '_0V_2'),
      st(C + '_24V_1', C + '_S1_1'), st(C + '_S1_4', L + '_S1_24V_a')];
    const v = A.vorwahl(C + '_S1', 2);
    const c = A.code();
    return { r, v, c, src: document.getElementById('code').value, typen: A.typen().map(t => t.art) };
  });
  ok('Vorwahlzähler ist ein Modul des Freien Aufbaus', f.typen.includes('zaehler'));
  ok('Kabel gesteckt', f.r.every(Boolean));
  ok('Code aus Aufbau: CTU mit Rücksetzen und Vorwahl', f.c.ok && new RegExp(f.v + ' := CTU\\(\\w+, ' + f.v + '_R, 2\\)').test(f.src), f.src.replace(/\n+/g, ' | '));
  ok('Zähler heißt ZAEHLER_…', /^ZAEHLER_\d+$/.test(f.v || ''), f.v);
  await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(300);
  const sj = (f.src.match(/CTU\((\w+),/) || [])[1];
  for (let i = 0; i < 2; i++) { await page.evaluate(n => setTaster(n, true), sj); await w(200); await page.evaluate(n => setTaster(n, false), sj); await w(200); }
  const led = (f.src.match(/(LAMPE_\d+) := /) || [])[1];
  z = await page.evaluate(([v, l]) => ({ q: !!spsState[v], led: !!spsState[l] }), [f.v, led]);
  ok('Zwei Impulse im Freien Aufbau: Zähler schaltet die LED', z.q && z.led, JSON.stringify(z));
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); window._toggleFestoFreeBuild(false); });

  console.log('Alter freier Aufbau mit dem Lernmodell (2-fach) wird umgeschrieben');
  const p2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  p2.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  await p2.addInitScript(() => { try {
    localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de');
    if (!sessionStorage.getItem('altGesetzt')) {
      sessionStorage.setItem('altGesetzt', '1');
      localStorage.setItem('valisFestoFreeBuildData2', JSON.stringify({ idc: 3, tc: {}, boards: [
        { id: 'b1', type: 'zaehler', idx: 1, prefix: 'C1', x: 0, y: 0, slotVars: { S1: 'KF1', S2: 'KF2' }, zaehlerCfg: { S1: { pv: 4 }, S2: { pv: 2 } } }],
        cables: [{ id: 'k1', a: 'C1_S1_A3', b: 'C1_0V_7' }, { id: 'k2', a: 'C1_24V_1', b: 'C1_S1_13' }, { id: 'k3', a: 'C1_S1_32', b: 'C1_S1_A1' }, { id: 'k4', a: 'C1_S2_A1', b: 'C1_24V_2' }] }));
    } } catch (e) {} });
  await p2.goto(url); await p2.waitForTimeout(2500);
  const alt = await p2.evaluate(() => JSON.parse(localStorage.getItem('valisFestoFreeBuildData2')));
  const ks = alt.cables.map(c => c.a + '>' + c.b).sort().join(' ');
  ok('Kabel umgeschrieben (A3→R1, 13→1, 32→2, Bus 7→6), Zähler 2 entfällt', ks === 'C1_24V_1>C1_S1_1 C1_S1_2>C1_S1_A1 C1_S1_R1>C1_0V_6' && !alt.boards[0].slotVars.S2 && alt.boards[0].zaehlerCfg.S1.pv === 4, ks);
  await p2.close();

  ok('Keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
