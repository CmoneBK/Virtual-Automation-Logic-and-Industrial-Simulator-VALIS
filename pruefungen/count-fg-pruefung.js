const { chromium } = require('playwright');
// Prüfung Zähler/Funktionsgenerator FESTO 544315 (Count) im freien Aufbau:
// Platte nach Foto (Buchsen, Tasten, Wahlschalter, LCD), Eingänge S1 START/UP
// zählen Impulse eines Tasters, STOP hält an, Stoppuhr t1, Frequency out
// schaltet über OUT eine LED, Pulse width out.
//
//   node pruefungen/count-fg-pruefung.js
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
  const klick = sel => page.evaluate(s => { const t = _festoDoc().querySelector(s); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel);
  const lcd = () => page.evaluate(() => [...(_festoDoc().querySelectorAll('[data-fg-panel="FG1"][data-fg-zeile]'))].map(t => t.textContent).join(' | '));

  console.log('Freier Aufbau: Taster → S1 START/UP, S1 STOP, S2 (Zähleingang), OUT → LED');
  const f = await page.evaluate(() => {
    window._toggleFestoFreeBuild(true);
    const A = window._fbAusSicht;
    A.module().forEach(m => A.entfernen(m.prefix));
    const T = A.modul('taster'), G = A.modul('count_fg'), L = A.modul('led');
    const st = (a, b) => A.stecken(a, b).ok;
    const r = [st(T + '_24V_1', T + '_S2_13'), st(T + '_S2_14', G + '_S1_UP'),
      st(T + '_24V_2', T + '_S3_13'), st(T + '_S3_14', G + '_S1_STOP'),
      st(G + '_OUT', L + '_S1_24V_a'),
      st(T + '_24V_3', T + '_S4_13'), st(T + '_S4_14', G + '_S2_UP')];
    const c = A.code();
    return { G, r, c, src: document.getElementById('code').value, typen: A.typen().map(t => t.art) };
  });
  ok('Count 544315 ist ein Modul des freien Aufbaus', f.typen.includes('count_fg'));
  ok('Präfix FG1', f.G === 'FG1', f.G);
  ok('Kabel gesteckt', f.r.every(Boolean));
  ok('Code: Eingang S1 START/UP und STOP aus den Tastern', f.c.ok && /FG1_S1_UP := TASTER_\d+/.test(f.src) && /FG1_S1_STOP := TASTER_\d+/.test(f.src), f.src.replace(/\n+/g, ' | '));
  ok('Code: LED hängt an OUT', /LAMPE_\d+ := FG1_OUT/.test(f.src), f.src.replace(/\n+/g, ' | '));
  await w(800);
  const pl = await page.evaluate(() => {
    const g = _festoDoc().querySelector('[data-festo-panel-type="count_fg"]'); if (!g) return null;
    return { text: g.textContent, bu: [...g.querySelectorAll('[data-festo-socket]')].map(e => e.getAttribute('data-festo-socket')), tasten: g.querySelectorAll('[data-fg-taste]').length, wahl: !!g.querySelector('[data-fg-wahl]') };
  });
  ok('Platte 544315 gezeichnet', !!pl && /544315/.test(pl.text), pl && pl.text.slice(0, 60));
  const soll = ['FG1_24V_1', 'FG1_24V_2', 'FG1_S1_UP', 'FG1_S1_STOP', 'FG1_S1_DOWN', 'FG1_S2_UP', 'FG1_S2_STOP', 'FG1_S3_UP', 'FG1_S3_STOP', 'FG1_OUT', 'FG1_0V_1', 'FG1_0V_2', 'FG1_0V_3'];
  ok('Buchsen wie auf dem Foto: 2× +24 V, S1 (3), S2 (2), S3 (2), OUT, 3× 0 V', pl && soll.every(b => pl.bu.includes(b)) && pl.bu.length === soll.length, pl && pl.bu.join(' '));
  ok('Tasten START/UP, STOP, RESET/DOWN und Wahlschalter', pl && pl.tasten === 3 && pl.wahl && /START\/UP/.test(pl.text) && /RESET\/DOWN/.test(pl.text) && /Frequency/.test(pl.text) && /Pulse width/.test(pl.text) && /t3/.test(pl.text));
  ok('LCD zeigt Pulse 0', /^Pulse \| 0/.test(await lcd()), await lcd());

  const sj = (f.src.match(/FG1_S1_UP := (TASTER_\d+)/) || [])[1], sjStop = (f.src.match(/FG1_S1_STOP := (TASTER_\d+)/) || [])[1];
  const sz = (f.src.match(/FG1_S2_UP := (TASTER_\d+)/) || [])[1];
  const tippen = async n => { await page.evaluate(v => setTaster(v, true), n); await w(150); await page.evaluate(v => setTaster(v, false), n); await w(150); };
  await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(300);
  for (let i = 0; i < 3; i++) await tippen(sz);
  ok('Pulse: drei Impulse an S2 → 3', /^Pulse \| 3/.test(await lcd()), await lcd());
  await tippen(sj);
  ok('S1 START/UP zählt nicht (startet nur)', /^Pulse \| 3/.test(await lcd()), await lcd());
  await tippen(sjStop);
  await tippen(sz);
  ok('STOP an S1 hält den Zähler an', /^Pulse \| 3  STOP/.test(await lcd()), await lcd());
  await tippen(sj); await tippen(sz);
  ok('START an S1 zählt weiter', /^Pulse \| 4$/.test(await lcd()), await lcd());
  await klick('[data-fg-taste="UP"][data-fg-panel="FG1"]'); await w(150);
  ok('Taste START/UP zählt nicht', /^Pulse \| 4$/.test(await lcd()), await lcd());
  await klick('[data-fg-taste="DOWN"][data-fg-panel="FG1"]'); await w(150);
  ok('Taste RESET/DOWN setzt auf 0', /^Pulse \| 0/.test(await lcd()), await lcd());

  // Stoppuhr t1: START an S1, nach ~1 s STOP an S1
  await page.evaluate(() => window._fgModus('FG1', 't1')); await w(400);
  await page.evaluate(v => setTaster(v, true), sj); await w(150); await page.evaluate(v => setTaster(v, false), sj);
  await w(1000);
  await page.evaluate(v => setTaster(v, true), sjStop); await w(150); await page.evaluate(v => setTaster(v, false), sjStop); await w(200);
  const t1 = await lcd(), sek = parseFloat((t1.match(/\| ([\d,]+) s/) || [, '0'])[1].replace(',', '.'));
  ok('Stoppuhr t1 misst START → STOP an S1 (≈ 1,15 s)', sek > 0.8 && sek < 1.8 && !/▶/.test(t1), t1);

  // Frequency out: OUT taktet die LED dauernd, ohne Start
  await page.evaluate(() => window._fgModus('FG1', 'fout')); await w(400);
  const led = (f.src.match(/(LAMPE_\d+) := FG1_OUT/) || [])[1];
  const proben = [];
  for (let i = 0; i < 12; i++) { proben.push(await page.evaluate(l => !!spsState[l], led)); await w(150); }
  ok('Frequency out 1 Hz: LED an OUT blinkt', proben.some(Boolean) && proben.some(x => !x), proben.map(x => x ? 1 : 0).join(''));
  await klick('[data-fg-taste="UP"][data-fg-panel="FG1"]'); await w(100);
  ok('START/UP erhöht die Frequenz auf 2 Hz', /f = 2 Hz/.test(await lcd()), await lcd());
  for (let i = 0; i < 20; i++) await klick('[data-fg-taste="UP"][data-fg-panel="FG1"]');
  await w(100);
  ok('Frequenz endet bei 200 Hz', /f = 200 Hz/.test(await lcd()), await lcd());
  for (let i = 0; i < 20; i++) await klick('[data-fg-taste="DOWN"][data-fg-panel="FG1"]');
  await w(100);
  ok('Frequenz beginnt bei 0,01 Hz', /f = 0,01 Hz/.test(await lcd()), await lcd());

  // Pulse width out: Spannung 0 … 24 V
  await page.evaluate(() => window._fgModus('FG1', 'pwout')); await w(400);
  ok('Pulse width out zeigt U = 24,0 V, OUT gilt als 1', /U = 24,0 V/.test(await lcd()) && await page.evaluate(l => !!spsState[l] && spsState.FG1_OUT_U === 24, led), await lcd());
  for (let i = 0; i < 6; i++) await klick('[data-fg-taste="DOWN"][data-fg-panel="FG1"]');
  await w(300);
  ok('9,6 V: zwischen den Schwellen bleibt OUT an', /U = 9,6 V/.test(await lcd()) && await page.evaluate(l => !!spsState[l], led), await lcd());
  for (let i = 0; i < 3; i++) await klick('[data-fg-taste="DOWN"][data-fg-panel="FG1"]');
  await w(300);
  ok('2,4 V: OUT gilt als 0', /U = 2,4 V/.test(await lcd()) && !(await page.evaluate(l => !!spsState[l], led)), await lcd());
  await tippen(sj);
  ok('S1-Eingänge ändern die Spannung nicht', /U = 2,4 V/.test(await lcd()), await lcd());
  await klick('[data-fg-wahl="FG1"]'); await w(300);
  ok('Wahlschalter weiter: Pulse/s', /^Pulse\/s/.test(await lcd()), await lcd());
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); });

  // Relais 162241: je zwei Buchsen +24 V und 0 V wie auf der Frontplatte
  const rel = await page.evaluate(async () => {
    const A = window._fbAusSicht, R = A.modul('relais');
    await new Promise(r => setTimeout(r, 600));
    const g = [..._festoDoc().querySelectorAll('[data-festo-panel-type="relais"]')].pop();
    const bu = g ? [...g.querySelectorAll('[data-festo-socket]')].map(e => e.getAttribute('data-festo-socket')).filter(k => /_(24V|0V)_\d+$/.test(k)) : [];
    const st = A.stecken(R + '_24V_1', R + '_S1_A1').ok && A.stecken(R + '_S1_A2', R + '_0V_2').ok;
    return { R, bu, st };
  });
  ok('Relais 162241: +24 V und 0 V je zweimal', ['_24V_1', '_24V_2', '_0V_1', '_0V_2'].every(x => rel.bu.includes(rel.R + x)) && rel.bu.length === 4, rel.bu.join(' '));
  ok('Relais-Spule direkt an die eigenen Sammelschienen steckbar', rel.st);
  await page.evaluate(() => window._toggleFestoFreeBuild(false));

  ok('Keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
