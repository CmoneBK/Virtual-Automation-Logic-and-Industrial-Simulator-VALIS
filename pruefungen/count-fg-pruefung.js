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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  const w = ms => page.waitForTimeout(ms);
  await page.evaluate(async () => { try { closeHub(); } catch (e) {} if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);
  const klick = sel => page.evaluate(s => { const t = _festoDoc().querySelector(s); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel);
  const lcd = () => page.evaluate(() => [...(_festoDoc().querySelectorAll('[data-fg-panel="FG1"][data-fg-zeile]'))].map(t => t.textContent).join(' | '));

  console.log('Freier Aufbau: Taster → S1 START/UP, OUT → LED');
  const f = await page.evaluate(() => {
    window._toggleFestoFreeBuild(true);
    const A = window._fbAusSicht;
    A.module().forEach(m => A.entfernen(m.prefix));
    const T = A.modul('taster'), G = A.modul('count_fg'), L = A.modul('led');
    const st = (a, b) => A.stecken(a, b).ok;
    const r = [st(T + '_24V_1', T + '_S2_13'), st(T + '_S2_14', G + '_S1_UP'),
      st(T + '_24V_2', T + '_S3_13'), st(T + '_S3_14', G + '_S1_STOP'),
      st(G + '_OUT', L + '_S1_24V_a')];
    const c = A.code();
    return { G, r, c, src: document.getElementById('code').value, typen: A.typen().map(t => t.art) };
  });
  ok('Count 544315 ist ein Modul des freien Aufbaus', f.typen.includes('count_fg'));
  ok('Präfix FG1', f.G === 'FG1', f.G);
  ok('Kabel gesteckt', f.r.every(Boolean));
  ok('Code: Eingang S1 START/UP und STOP aus den Tastern', f.c.ok && /FG1_S1_UP := SJ\d+/.test(f.src) && /FG1_S1_STOP := SJ\d+/.test(f.src), f.src.replace(/\n+/g, ' | '));
  ok('Code: LED hängt an OUT', /PF\d+ := FG1_OUT/.test(f.src), f.src.replace(/\n+/g, ' | '));
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

  const sj = (f.src.match(/FG1_S1_UP := (SJ\d+)/) || [])[1], sjStop = (f.src.match(/FG1_S1_STOP := (SJ\d+)/) || [])[1];
  const tippen = async n => { await page.evaluate(v => setTaster(v, true), n); await w(150); await page.evaluate(v => setTaster(v, false), n); await w(150); };
  await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(300);
  for (let i = 0; i < 3; i++) await tippen(sj);
  ok('Pulse: drei Impulse an S1 START/UP → 3', /^Pulse \| 3/.test(await lcd()), await lcd());
  await page.evaluate(v => setTaster(v, true), sjStop); await w(150);
  await tippen(sj);
  await page.evaluate(v => setTaster(v, false), sjStop); await w(150);
  ok('STOP an S1 hält den Zähler an', /^Pulse \| 3/.test(await lcd()), await lcd());
  await klick('[data-fg-taste="DOWN"][data-fg-panel="FG1"]'); await w(150);
  ok('Taste RESET/DOWN setzt auf 0', /^Pulse \| 0/.test(await lcd()), await lcd());

  // Stoppuhr t1: START an S1, nach ~1 s STOP an S1
  await page.evaluate(() => window._fgModus('FG1', 't1')); await w(400);
  await page.evaluate(v => setTaster(v, true), sj); await w(150); await page.evaluate(v => setTaster(v, false), sj);
  await w(1000);
  await page.evaluate(v => setTaster(v, true), sjStop); await w(150); await page.evaluate(v => setTaster(v, false), sjStop); await w(200);
  const t1 = await lcd(), sek = parseFloat((t1.match(/\| ([\d,]+) s/) || [, '0'])[1].replace(',', '.'));
  ok('Stoppuhr t1 misst START → STOP an S1 (≈ 1,15 s)', sek > 0.8 && sek < 1.8 && !/▶/.test(t1), t1);

  // Frequency out: OUT taktet die LED
  await page.evaluate(() => window._fgModus('FG1', 'fout')); await w(400);
  await klick('[data-fg-taste="UP"][data-fg-panel="FG1"]'); await w(100);
  const led = (f.src.match(/(PF\d+) := FG1_OUT/) || [])[1];
  const proben = [];
  for (let i = 0; i < 12; i++) { proben.push(await page.evaluate(l => !!spsState[l], led)); await w(150); }
  ok('Frequency out 1 Hz: LED an OUT blinkt', proben.some(Boolean) && proben.some(x => !x), proben.map(x => x ? 1 : 0).join(''));
  await klick('[data-fg-taste="STOP"][data-fg-panel="FG1"]'); await w(300);
  ok('STOP schaltet den Generator ab', !(await page.evaluate(l => !!spsState[l], led)) && /AUS/.test(await lcd()), await lcd());

  // Pulse width out: ein Impuls tp = 1 s
  await page.evaluate(() => window._fgModus('FG1', 'pwout')); await w(400);
  await tippen(sj);
  const an = await page.evaluate(l => !!spsState[l], led);
  await w(1300);
  const aus = await page.evaluate(l => !!spsState[l], led);
  ok('Pulse width out: S1 START/UP gibt einen Impuls von 1 s an OUT', an && !aus, `${an} → ${aus}`);
  await klick('[data-fg-wahl="FG1"]'); await w(300);
  ok('Wahlschalter weiter: Pulse/s', /^Pulse\/s/.test(await lcd()), await lcd());
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); window._toggleFestoFreeBuild(false); });

  ok('Keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
