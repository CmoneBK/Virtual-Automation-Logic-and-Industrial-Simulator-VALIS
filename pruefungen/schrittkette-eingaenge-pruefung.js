const { chromium } = require('playwright');
// Schrittkette: Variablen aus Übergängen stehen als Eingänge im Sim-Panel
// (Christoph 27.11.2026). Die Grafcet-Ansicht schreibt UND als `*` und ODER
// als `+`; wer das so in den Editor übernimmt (`START * REED -> S2`), dem
// fehlten die Variablen still. Jetzt gilt `*`/`+` in rein booleschen
// Ausdrücken als UND/ODER, in der DSL- wie in der SR-Form. Was sich trotzdem
// nicht übersetzen lässt, bekommt einen Fehler an seiner Zeile.
//
//   node pruefungen/schrittkette-eingaenge-pruefung.js
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
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' && !g ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };

const KETTE = `SCHRITTKETTE NEU:
  STEP S1 (INIT):
    LED_BETRIEB := TRUE
  TRANS:
    START * REED_SPANNER_HINTEN * REED_AUSWERFER_HINTEN -> S2

  STEP S2 (LAUFEN):
    SPULE_SPANNEN := TRUE
  TRANS:
    REED_SPANNER_VORN * SENSOR_GUT + ¬REED_SPANNER_HINTEN * STOPP -> S3

  STEP S3:
    SPULE_AUSWERFER_VOR := TRUE
  TRANS:
    REED_AUSWERFER_VORN -> S1
END
`;
const EINGAENGE = ['START', 'REED_SPANNER_HINTEN', 'REED_AUSWERFER_HINTEN', 'REED_SPANNER_VORN', 'SENSOR_GUT', 'STOPP', 'REED_AUSWERFER_VORN'];

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const fehler = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.removeItem('valisSpsAddresses'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} });
  const lauf = async (code) => {
    await page.evaluate(c => { const ed = document.getElementById('code'); ed.value = c; ed.dispatchEvent(new Event('input', { bubbles: true })); }, code);
    await page.waitForTimeout(1300);
    return page.evaluate(() => {
      const d = window._spsZuordnungData();
      let err = [];
      try { const e = window._collectAllErrors(); err = [...(e && e.size !== undefined ? e : (e || []))]; } catch (x) { err = ['X ' + x]; }
      const panel = [...document.querySelectorAll('[data-sim-in]')].map(e => e.getAttribute('data-sim-in'));
      return { ein: d.inputs.map(r => r.name), aus: d.outputs.map(r => r.name), err, panel, skErr: (window._schrittkettenErrors || []).map(e => e.line + ': ' + e.msg) };
    });
  };
  const fehlt = (liste, soll) => soll.filter(n => !liste.includes(n));

  // 1) DSL-Form mit `*` und `+`
  let r = await lauf(KETTE);
  ok('DSL: alle Übergangsvariablen sind Eingänge', fehlt(r.ein, EINGAENGE).length === 0, 'fehlt ' + fehlt(r.ein, EINGAENGE).join(', '));
  ok('DSL: alle stehen im Sim-Panel', fehlt(r.panel, EINGAENGE).length === 0, 'fehlt ' + fehlt(r.panel, EINGAENGE).join(', '));
  ok('DSL: keine Fehler', r.err.length === 0 && r.skErr.length === 0, JSON.stringify(r.err) + ' ' + r.skErr.join(' | '));

  // Verhalten: S1 → S2 nur mit START UND beiden Reeds; S2 → S1 über `+` (ODER)
  const ablauf = await page.evaluate(async (namen) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    // Alle als Schließer-Taster, damit kein Reed von einer Anlage gesteuert wird
    namen.forEach(n => { try { changeType(n, 'taster'); } catch (e) {} });
    await w(300);
    if (!isSimulationActive) toggleSimulation();
    await w(300);
    const setz = async (n, v) => { setTaster(n, v); await w(200); };
    const bild = () => ({ led: !!spsState.LED_BETRIEB, sp: !!spsState.SPULE_SPANNEN, aw: !!spsState.SPULE_AUSWERFER_VOR });
    const out = {};
    out.start = bild();
    await setz('START', true); out.nurStart = bild(); await setz('START', false);
    await setz('REED_SPANNER_HINTEN', true); await setz('REED_AUSWERFER_HINTEN', true);
    await setz('START', true); out.alle = bild(); await setz('START', false);
    await setz('STOPP', true); out.stoppHinten = bild(); await setz('STOPP', false);
    await setz('REED_SPANNER_HINTEN', false);
    await setz('STOPP', true); out.stopp = bild(); await setz('STOPP', false);
    if (isSimulationActive) toggleSimulation();
    return out;
  }, EINGAENGE);
  ok('Sim: nur START schaltet nicht weiter (UND)', ablauf.nurStart.led && !ablauf.nurStart.sp, JSON.stringify(ablauf));
  ok('Sim: START * beide Reeds → S2', ablauf.alle.sp && !ablauf.alle.led, JSON.stringify(ablauf));
  ok('Sim: STOPP mit Spanner hinten schaltet nicht (UND vor ODER)', ablauf.stoppHinten.sp && !ablauf.stoppHinten.aw, JSON.stringify(ablauf));
  ok('Sim: `+ ¬REED_SPANNER_HINTEN * STOPP` (ODER) → S3', ablauf.stopp.aw && !ablauf.stopp.sp, JSON.stringify(ablauf));

  // 2) Umwandeln in die SR-Form behält alle Eingänge
  const sr = await page.evaluate(c => {
    const p = window._parseSchrittketten(c);
    return window._printSchrittketteAsSR(p.chains[0], { baseNum: 1 });
  }, KETTE);
  r = await lauf(sr);
  ok('SR-Form: alle Übergangsvariablen sind Eingänge', fehlt(r.ein, EINGAENGE).length === 0, 'fehlt ' + fehlt(r.ein, EINGAENGE).join(', '));
  ok('SR-Form: keine Fehler', r.err.length === 0, JSON.stringify(r.err));

  // 3) Selbst geschriebene SR-Form mit `*` neben && (vorher Fehler, Variablen weg)
  r = await lauf('S1 := START * REED_HINTEN && ¬Q2\nR1 := Q2\nS2 := Q1 && (REED_VORN * SENSOR_GUT)\nR2 := ¬START\nLAMPE := Q1\nSPULE := Q2\n');
  ok('SR von Hand: `*` neben && ist UND', fehlt(r.ein, ['START', 'REED_HINTEN', 'REED_VORN', 'SENSOR_GUT']).length === 0 && r.err.length === 0, JSON.stringify(r));

  // 4) Rechnen bleibt Rechnen
  const n = await page.evaluate(() => [
    window._grafcetUndOder('A * B + C'),
    window._grafcetUndOder('A * 2'),
    window._grafcetUndOder('TEMP + 5 > SOLL'),
    window._grafcetUndOder('Z.cv * B'),
    window._grafcetUndOder('MIN(A, B) * C'),
    window._grafcetUndOder('A && B')
  ]);
  ok('Grafcet-UND/ODER: rein boolesch wird umgesetzt', n[0] === 'A && B || C', n[0]);
  ok('Grafcet-UND/ODER: Zahlen, Vergleiche, .cv und Funktionen bleiben', n[1] === 'A * 2' && n[2] === 'TEMP + 5 > SOLL' && n[3] === 'Z.cv * B' && n[4] === 'MIN(A, B) * C' && n[5] === 'A && B', JSON.stringify(n));
  r = await lauf('Y := A + B\n');
  ok('Y := A + B allein bleibt Rechnung (kein Fehler)', r.err.length === 0 && r.ein.includes('A') && r.ein.includes('B'), JSON.stringify(r));

  // 5) Was nicht übersetzbar ist, meldet einen Fehler an der Übergangszeile
  r = await lauf('SCHRITTKETTE K:\n  STEP S1 (INIT):\n    A := TRUE\n  TRANS:\n    START + X > -> S2\n  STEP S2:\n    B := TRUE\n  TRANS:\n    C -> S1\nEND\n');
  ok('kaputter Übergang: Fehler an seiner Zeile statt still', r.err.includes(4), JSON.stringify(r.err) + ' ' + r.skErr.join(' | '));

  // 6) Beispiel-Schrittketten bleiben fehlerfrei
  const beispiele = await page.evaluate(() => Object.keys(EXAMPLES).filter(k => /SCHRITTKETTE\s+\w+\s*:/.test(EXAMPLES[k].code || '')));
  for (const k of beispiele) {
    const code = await page.evaluate(k => EXAMPLES[k].code, k);
    r = await lauf(code);
    const bereiche = await page.evaluate(() => (window._schrittkettenChains || []).map(c => [c.startLine, c.endLine]));
    const imBlock = r.err.filter(i => bereiche.some(([a, b]) => i >= a && i <= b));
    ok('Beispiel ' + k + ': keine Fehler in der Schrittkette', imBlock.length === 0 && r.skErr.length === 0, JSON.stringify(imBlock) + ' ' + r.skErr.join(' | '));
  }

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
