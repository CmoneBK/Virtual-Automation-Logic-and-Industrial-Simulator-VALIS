const { chromium } = require('playwright');
// Prüfung „📥 Aktuelle Schaltung übernehmen“ im freien Aufbau (16.11.2026):
// Die Schaltung aus dem Code landet mit denselben Modulen, Variablen und
// Kabeln im freien Aufbau, läuft nach „Code aus Aufbau“ genauso, lässt sich
// umstecken/erweitern und reist mit Projekt bzw. Aufgabe (freierAufbau im
// Anlagen-Stand), ohne dass Rückgängig in der 2D-Anlage ihn zurücksetzt.
//
//   node pruefungen/uebernehmen-pruefung.js
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
  await page.evaluate(() => { try { closeHub(); } catch (e) {} if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);
  const code = c => page.evaluate(c => { const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, c);
  const sim = an => page.evaluate(an => { if (!!isSimulationActive !== an) toggleSimulation(); }, an);
  const tippen = async (v, ms) => { await page.evaluate(v => setTaster(v, true), v); await w(ms || 200); await page.evaluate(v => setTaster(v, false), v); await w(200); };

  console.log('Selbsthaltung aus dem Code übernehmen');
  await code('K1 := (START || K1) && ¬STOP\nLAMPE := K1');
  await w(1200);
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1200);
  const u = await page.evaluate(() => {
    const r = window._fbUebernehmen(true);
    const m = window._elSteckModell();
    return { r, frei: !!window.festoFreeBuildMode, module: window._fbAusSicht.module(), art: m.art, kabel: m.kabel.map(k => k.a + '>' + k.b),
      knopf: !!_festoDoc().getElementById('fb-uebernehmen'), sichtbar: _festoDoc().getElementById('fb-panel').style.display !== 'none' };
  });
  ok('Knopf im Freibau-Panel', u.knopf && u.sichtbar);
  ok('Übernehmen meldet Erfolg und schaltet auf freien Aufbau', u.r.ok && u.frei && u.art === 'frei', u.r.text);
  const prefixe = u.module.map(m => m.prefix).sort().join(' ');
  ok('Dieselben Module wie im Standard-Steckaufbau', ['T1', 'R1', 'L1'].every(p => prefixe.includes(p)), prefixe);
  // Vergleich mit dem Standard-Steckaufbau im selben (Direkt-)Modus
  const std = await page.evaluate(() => { window._toggleFestoFreeBuild(false); const n = window._elSteckModell().kabel.length; window._toggleFestoFreeBuild(true); return { n }; });
  ok('Alle Kabel übernommen, Platzhalter der Schienen aufgelöst', u.kabel.length === std.n && !u.kabel.some(k => /__BUS/.test(k)), u.kabel.length + ' / ' + std.n + ': ' + u.kabel.join(' '));
  ok('Parallelzweig der Selbsthaltung gesteckt (START und Selbsthaltekontakt auf einem Knoten)', u.kabel.some(k => /T1_S\d_14>R1_S1_11|R1_S1_11>T1_S\d_14/.test(k)), u.kabel.join(' '));
  const g = await page.evaluate(() => { const r = window._fbAusSicht.code(); return { r, src: document.getElementById('code').value }; });
  ok('Code aus Aufbau gelingt ohne Lücken', g.r.ok, g.r.text.replace(/\n/g, ' | '));
  ok('Erzeugter Code nutzt dieselben Variablen', /\bK1\s*:=/.test(g.src) && /\bLAMPE\s*:=/.test(g.src) && /START/.test(g.src) && /STOP/.test(g.src), g.src.replace(/\n+/g, ' | '));
  await sim(true); await w(300);
  await tippen('START');
  let z = await page.evaluate(() => ({ k1: !!spsState.K1, l: !!spsState.LAMPE }));
  ok('START: Selbsthaltung zieht an, LAMPE an', z.k1 && z.l, JSON.stringify(z));
  await tippen('STOP');
  z = await page.evaluate(() => ({ k1: !!spsState.K1, l: !!spsState.LAMPE }));
  ok('STOP: fällt ab', !z.k1 && !z.l, JSON.stringify(z));
  await sim(false);

  console.log('Zoomen im freien Aufbau');
  const zm = await page.evaluate(async () => {
    const svg = _festoDoc().getElementById('festo-svg'), body = _festoDoc().getElementById('festo-body');
    const b0 = svg.getBoundingClientRect().width;
    festoZoomIn(); festoZoomIn();
    const b1 = svg.getBoundingClientRect().width;
    body.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 300, clientY: 300, bubbles: true, cancelable: true }));
    const b2 = svg.getBoundingClientRect().width;
    window._fbAusSicht.module(); window._renderFestoPanel();
    const b3 = svg.getBoundingClientRect().width;
    festoZoomReset();
    return { b0, b1, b2, b3, b4: svg.getBoundingClientRect().width, basis: +svg.dataset.baseW };
  });
  ok('Knopf + vergrößert, Mausrad verkleinert, Zoom bleibt beim Neuzeichnen, Reset = 100 %', zm.b1 > zm.b0 * 1.3 && zm.b2 < zm.b1 && Math.abs(zm.b3 - zm.b2) < 2 && Math.abs(zm.b4 - zm.basis) < 2, JSON.stringify(zm));

  console.log('Erweitern: zweiter Stopp-Taster in Reihe');
  const e = await page.evaluate(() => {
    const A = window._fbAusSicht, m = window._elSteckModell();
    // Kabel, das am Öffner von STOP abgeht (…_22) → zweiten Öffner dazwischen
    const asg = {}; window._fbAusSicht.module();
    const kab = m.kabel.find(k => /^T1_S\d_22$/.test(k.a) || /^T1_S\d_22$/.test(k.b));
    if (!kab) return { fehlt: m.kabel.map(k => k.a + '>' + k.b) };
    const stopAus = /_22$/.test(kab.a) ? kab.a : kab.b, weiter = stopAus === kab.a ? kab.b : kab.a;
    const belegt = new Set(m.kabel.flatMap(k => [k.a, k.b]).filter(k => /^T1_S\d_/.test(k)).map(k => k.slice(0, 5)));
    const frei = ['T1_S2', 'T1_S3', 'T1_S4'].find(s => !belegt.has(s));
    const z1 = A.ziehen(kab.a, kab.b);
    const s1 = A.stecken(stopAus, frei + '_21').ok, s2 = A.stecken(frei + '_22', weiter).ok;
    const r = A.code();
    return { z1, s1, s2, r, src: document.getElementById('code').value };
  });
  ok('Kabel umgesteckt, zweiter Öffner eingefügt', e.z1 && e.s1 && e.s2, JSON.stringify(e).slice(0, 300));
  const stop2 = ((e.src || '').match(/^R1 := .*\b(TASTER_\d+)\b/m) || [])[1];
  ok('Neuer Stopp erscheint im Code', !!stop2 && e.r && e.r.ok, (e.src || '').replace(/\n+/g, ' | '));
  if (stop2) {
    await sim(true); await w(300);
    await tippen('START');
    await tippen(stop2);
    z = await page.evaluate(() => ({ k1: !!spsState.K1 }));
    ok('Neuer Stopp schaltet die Selbsthaltung ab', !z.k1, JSON.stringify(z));
    await sim(false);
  }

  console.log('Projekt: freier Aufbau reist mit, Rückgängig lässt ihn stehen');
  const p = await page.evaluate(() => {
    const st = JSON.parse(JSON.stringify(getFactoryStateObj()));
    const vorher = window._elSteckModell().kabel.length;
    // Aufbau ändern: alle Kabel weg
    window._fbAusSicht.module();
    const m = window._elSteckModell();
    m.kabel.forEach(k => window._fbAusSicht.ziehen(k.a, k.b));
    const leer = window._elSteckModell().kabel.length;
    // Projekt laden wie .valisave/Aufgabe
    const feld = document.getElementById('saveload-text');
    feld.value = JSON.stringify({ rssr: window.VALIS_RSSR, code: document.getElementById('code').value, factory: st, types: componentTypes, layout: 'flex-row' });
    window.applyRawCode();
    return { hat: !!(st.freierAufbau && st.freierAufbau.boards.length), aktiv: st.freierAufbau && st.freierAufbau.aktiv, vorher, leer, nachher: window._elSteckModell().kabel.length, frei: !!window.festoFreeBuildMode };
  });
  ok('Anlagen-Stand enthält den freien Aufbau', p.hat && p.aktiv, JSON.stringify(p));
  ok('Laden eines Projekts stellt Module und Kabel wieder her', p.leer === 0 && p.nachher === p.vorher && p.frei, JSON.stringify(p));
  const r = await page.evaluate(async () => {
    const vorher = window._elSteckModell().kabel.length;
    addFactoryDevice('taster');
    await new Promise(r => setTimeout(r, 300));
    const m = window._elSteckModell();
    window._fbAusSicht.ziehen(m.kabel[0].a, m.kabel[0].b);
    window._undoFactory();
    await new Promise(r => setTimeout(r, 300));
    return { vorher, nachher: window._elSteckModell().kabel.length };
  });
  ok('Rückgängig in der 2D-Anlage setzt den freien Aufbau nicht zurück', r.nachher === r.vorher - 1, JSON.stringify(r));

  console.log('Zähler, Zeitrelais, Sensor, Magnetventil mit zwei Spulen');
  await page.evaluate(() => { window._toggleFestoFreeBuild(false); componentTypes.S_METALL = 'sensor_ind'; });
  await code('VOLL := CTU(ZAEHL, RESET, 3)\nH1 := VOLL\nVERZ := TON(START, 2)\nH2 := VERZ\nH3 := S_METALL');
  await w(1500);
  const v = await page.evaluate(() => {
    const r = window._fbUebernehmen(true);
    const fb = window._fbStandExport();
    const b = t => fb.boards.find(x => x.type === t) || {};
    return { r, rel: fb.boards.filter(x => x.type === 'relais').map(x => Object.values(x.slotVars).join(',')).join(','), zl: b('zaehler'), zr: b('zeitrelais'), se: b('sensor'), arten: fb.boards.map(x => x.type), kabel: fb.cables.length };
  });
  ok('Zähler mit Vorwahl 3 und Namen VOLL', v.zl.slotVars && v.zl.slotVars.S1 === 'VOLL' && v.zl.zaehlerCfg.S1.pv === 3, JSON.stringify(v.zl));
  ok('Zeitrelais TON 2 s', v.zr.slotVars && v.zr.slotVars.S1 === 'VERZ' && v.zr.timerCfg.S1.type === 'ton' && v.zr.timerCfg.S1.time === 2, JSON.stringify(v.zr.timerCfg));
  ok('Induktiver Sensor, Koppelrelais K_S_METALL', v.se.sensorType === 'inductive' && v.se.slotVars.S1 === 'S_METALL' && v.rel.includes('K_S_METALL'), JSON.stringify(v.se) + ' ' + v.rel);
  const g2 = await page.evaluate(() => { const r = window._fbAusSicht.code(); return { r, src: document.getElementById('code').value }; });
  ok('Code aus Aufbau: CTU, TON und Sensor wie vorher, ohne Koppelrelais', g2.r.ok && /VOLL := CTU\(ZAEHL, VOLL_R, 3\)/.test(g2.src) && /VOLL_R := RESET/.test(g2.src) && /VERZ := TON\(START, 2\)/.test(g2.src) && /H3 := S_METALL/.test(g2.src) && /H1 := VOLL/.test(g2.src) && !/\bK_\w+ :=/.test(g2.src) && !/Selbst-Referenz/.test(g2.src), g2.r.text.replace(/\n/g, ' ') + ' || ' + g2.src.replace(/\n+/g, ' | '));
  await sim(true); await w(300);
  for (let i = 0; i < 3; i++) await tippen('ZAEHL');
  z = await page.evaluate(() => ({ h1: !!spsState.H1 }));
  ok('Drei Impulse: H1 an', z.h1, JSON.stringify(z));
  await sim(false);

  const d = await page.evaluate(() => {
    window._toggleFestoFreeBuild(true);
    const A = window._fbAusSicht;
    A.module().forEach(m => A.entfernen(m.prefix));
    const T = A.modul('taster'), M1 = A.modul('magnet'), M2 = A.modul('magnet_duo');
    const st = (a, b) => A.stecken(a, b).ok;
    const s = [st(T + '_24V_1', T + '_S2_13'), st(T + '_S2_14', M2 + '_S1_M1_24V_a'), st(T + '_24V_2', T + '_S3_13'), st(T + '_S3_14', M2 + '_S1_M2_24V_a')];
    const r = A.code();
    return { M1, M2, s, r, src: document.getElementById('code').value, buchsen: !!_festoDoc().querySelector('[data-festo-socket="' + M2 + '_S1_M2_X2"]') };
  });
  ok('Magnetventil mit zwei Spulen eigenes Modul, Präfix nicht doppelt', d.M1 === 'M1' && d.M2 === 'M2' && d.buchsen, JSON.stringify([d.M1, d.M2]));
  ok('Beide Spulen erscheinen im Code', d.s.every(Boolean) && d.r.ok && (d.src.match(/VENTIL_\d+ := TASTER_\d+/g) || []).length === 2, d.r.text.replace(/\n/g, ' ') + ' || ' + d.src.replace(/\n+/g, ' | '));
  await page.evaluate(() => window._toggleFestoFreeBuild(false));

  console.log('Rundlauf SR mit fünf Kontakten (Christoph, 16.11.2026)');
  await page.evaluate(() => { componentTypes.S_METALL = 'sensor_ind'; componentTypes.S_ZYL_VORN = 'sensor_reed'; });
  await code('S1 := START && ¬STOP\nR1 := STOP\nLED_BETRIEB := Q1\nBAND := Q1\nZYL_AUS := Q1 && S_METALL\nZYL_EIN := ¬Q1 || S_ZYL_VORN');
  await w(1500);
  const sr = await page.evaluate(() => {
    const r = window._fbUebernehmen(true);
    const kabel = window._elSteckModell().kabel.map(k => k.a + '>' + k.b);
    const fb = window._fbStandExport();
    const g = window._fbAusSicht.code();
    return { r, kabel, rel: fb.boards.filter(x => x.type === 'relais').map(x => Object.values(x.slotVars).join(',')).join(' | '), g, src: document.getElementById('code').value };
  });
  ok('Fünfter Kontakt von Q1 auf zweitem Relais (Spule parallel)', (sr.rel.match(/\bQ1\b/g) || []).length === 2, sr.rel);
  ok('STOP-Öffner nur einmal gesteckt, nicht kurzgeschlossen', !sr.kabel.some(k => /^(T\d_S\d)_2[12]>\1_2[12]$/.test(k)), sr.kabel.join(' '));
  const srSrc = sr.src.replace(/\n+/g, ' | ');
  const soll = ['S1 := START', 'R1 := STOP', 'LED_BETRIEB := Q1', 'BAND := Q1', 'ZYL_AUS := (S_METALL && Q1|Q1 && S_METALL)', 'ZYL_EIN := (S_ZYL_VORN \\|\\| ¬Q1|¬Q1 \\|\\| S_ZYL_VORN)'];
  ok('Code aus Aufbau gleich dem Ausgangscode (ohne Hilfsrelais, Q1 statt SR_1)', sr.g.ok && soll.every(z => new RegExp('^' + z + '$', 'm').test(sr.src)) && !/\bK_|\bSR_1\b|Selbst-Referenz/.test(sr.src), srSrc);
  await sim(true); await w(300);
  let zs = await page.evaluate(() => ({ band: !!spsState.BAND, ein: !!spsState.ZYL_EIN }));
  ok('Ruhe: BAND aus, ZYL_EIN an', !zs.band && zs.ein, JSON.stringify(zs));
  await tippen('START');
  zs = await page.evaluate(() => ({ band: !!spsState.BAND, ein: !!spsState.ZYL_EIN }));
  ok('START: BAND an, ZYL_EIN aus', zs.band && !zs.ein, JSON.stringify(zs));
  await tippen('STOP');
  zs = await page.evaluate(() => ({ band: !!spsState.BAND, ein: !!spsState.ZYL_EIN }));
  ok('STOP: BAND aus', !zs.band && zs.ein, JSON.stringify(zs));
  await sim(false);
  await page.evaluate(() => window._toggleFestoFreeBuild(false));

  ok('Keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
