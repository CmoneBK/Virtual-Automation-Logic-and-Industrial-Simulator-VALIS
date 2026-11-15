const { chromium } = require('playwright');
// Prüfung: Die Hydraulik der 2D-Anlage rechnet mit dem Fluidplan-Kern
// (Hydraulik-Schattenplan, eine Wahrheit). Jeder Fall läuft einmal mit der
// alten 2D-Hydraulik (window._fpOhneHydSchatten) und einmal mit dem
// Fluidplan-Kern; verglichen werden Geschwindigkeit, Drücke, Kraft und
// Schaltzustände.
//
//   node pruefungen/hydraulik-2d-pruefung.js
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
const nah = (a, b, rel, abs) => Math.abs(a - b) <= Math.max(abs || 0, Math.abs(b) * rel);

// Aufbau im Browser: doppeltwirkender Zylinder 40/20 × 200 mit Ventil (double|triple),
// Drosseln 100 %, Last; extra: Rückschlagventil, Druckschalter, Speicher
async function lauf(browser, url, neu, fall) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3000);
  const r = await page.evaluate(async ([neu, fall]) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    window._fpOhneHydSchatten = !neu;
    window._findHydTankForCylinder = () => null;   // Öl im Tank: hier nicht Thema
    const ta = document.getElementById('code'); ta.value = 'Y1 := S1\nY2 := S2\nH1 := DS'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(400);
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2'; c.pistonD = 40; c.rodD = 20; c.stroke = 200;
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb(fall.ventil || 'double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    c.extension = 0;
    c.hyd = { last: fall.last || 0, lastArt: fall.art || 'presse', lastAb: fall.ab || 0 };
    const u = factoryObjects.find(x => x.type === 'hydraulic_unit');
    if (fall.rv) { const rv = window._hydAnbauen(c.id, 'check_valve_hyd', 'A'); }
    let ds = null;
    if (fall.ds) { window._hydAnbauen(c.id, 'pressure_switch_hyd', 'A'); ds = factoryObjects.find(x => x.type === 'pressure_switch_hyd'); ds.hyd = { schaltdruck: 30 }; }
    let sp = null;
    if (fall.speicher) { window._hydAnbauen(null, 'accumulator_hyd', 'P'); sp = factoryObjects.find(x => x.type === 'accumulator_hyd'); sp.hyd = { volumen: 1, vordruck: 50 }; }
    toggleSimulation(); await warte(300);
    const mess = { schatten: window._fpHydSchatten() };
    const t0 = performance.now();
    if (fall.speicher) { await warte(1500); mess.spP = sp.hydP; mess.spOel = sp.hydOelL; }
    setTaster('S1', true);
    // Ausfahrgeschwindigkeit in der Mitte des Hubs
    let x1 = null, tA = 0;
    for (let i = 0; i < 60; i++) {
      await warte(50);
      if (x1 == null && c.extension > 15) { x1 = c.extension; tA = performance.now(); }
      if (c.extension > 20 && c.extension < 80 && c.hydV > 0) mess.vAus = c.hydV;   // mm/s aus der Rechnung (unabhängig von der Rechnerlast)
      if (c.extension > 80) break;
    }
    await warte(fall.halteZeit || 1500);
    mess.xAus = c.extension; mess.pA = c.hydPA; mess.pB = c.hydPB; mess.kraft = c.hydKraft; mess.rolle = c.hydRolle; mess.pSys = u.hydP; mess.qDbv = u.hydQdbv;
    mess.ds = ds ? !!ds.hydSchaltet : null;
    if (fall.ventil === 'triple') {
      setTaster('S1', false); await warte(800);
      const xm = c.extension; await warte(1500); mess.xMitteDrift = c.extension - xm; mess.rolleMitte = c.hydRolle;
    }
    setTaster('S1', false); setTaster('S2', true);
    x1 = null;
    for (let i = 0; i < 60; i++) {
      await warte(50);
      if (x1 == null && c.extension < 85) { x1 = c.extension; tA = performance.now(); }
      if (c.extension < 80 && c.extension > 20 && c.hydV > 0) mess.vEin = c.hydV;
      if (c.extension < 20) break;
    }
    await warte(1500);
    mess.xEin = c.extension; mess.temp = u.hydTempC;
    setTaster('S2', false);
    toggleSimulation();
    return mess;
  }, [neu, fall]);
  r.fehler = fehler;
  await page.close();
  return r;
}

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const F = {
    'Gewicht 6 kN, 5/2 bistabil': { last: 6000, art: 'gewicht' },
    'Presse 20 kN ab 50 % Hub (zu viel für 100 bar): bleibt stehen': { last: 20000, art: 'presse', ab: 50 },
    '4/3 Sperrmitte, Gewicht 4 kN, Rückschlagventil in A, Druckschalter an A': { last: 4000, art: 'gewicht', ventil: 'triple', rv: true, ds: true },
    'Druckspeicher am P-Anschluss': { last: 2000, art: 'gewicht', speicher: true }
  };
  for (const [name, fall] of Object.entries(F)) {
    console.log(name);
    const alt = await lauf(browser, url, false, fall), neu = await lauf(browser, url, true, fall);
    ok('Fluidplan-Kern rechnet (Schattenplan aktiv), alte Rechnung im Vergleich nicht', neu.schatten && !alt.schatten);
    if (fall.ab) {
      ok('bleibt am Werkstück stehen (≈ 50 %)', nah(neu.xAus, 50, 0, 3) && nah(alt.xAus, 50, 0, 3), `alt ${alt.xAus.toFixed(1)}, neu ${neu.xAus.toFixed(1)}`);
      ok('Druck steigt bis zum DBV (100 bar)', nah(neu.pA, 100, 0.03), `alt ${alt.pA}, neu ${neu.pA}`);
    } else {
      ok('Ausfahren: Geschwindigkeit wie bisher (±15 %)', nah(neu.vAus, alt.vAus, 0.15), `alt ${alt.vAus && alt.vAus.toFixed(0)} mm/s, neu ${neu.vAus && neu.vAus.toFixed(0)} mm/s`);
      // 4/3 Sperrmitte: das eingesperrte Öl behält seinen Druck (mindestens den Lastdruck der 2D-Rechnung)
      if (fall.ventil === 'triple') ok('Endlage vorne, Sperrmitte hält mindestens den Lastdruck', neu.xAus > 99 && neu.pA >= alt.pA - 1, `alt ${alt.pA} bar, neu ${neu.pA} bar`);
      else ok('Endlage vorne, Druck am DBV, Kraft wie bisher', neu.xAus > 99 && nah(neu.pA, alt.pA, 0.03) && nah(neu.kraft, alt.kraft, 0.05), `alt ${alt.pA} bar ${alt.kraft} N ${alt.rolle} x ${alt.xAus.toFixed(0)}, neu ${neu.pA} bar ${neu.kraft} N ${neu.rolle} x ${neu.xAus.toFixed(0)}`);
      ok('Einfahren: Geschwindigkeit wie bisher (±15 %)', nah(neu.vEin, alt.vEin, 0.15), `alt ${alt.vEin && alt.vEin.toFixed(0)}, neu ${neu.vEin && neu.vEin.toFixed(0)}`);
      ok('wieder hinten', neu.xEin < 1, neu.xEin.toFixed(1));
    }
    ok('Öl am DBV in den Tank (≈ Förderstrom)', nah(neu.qDbv, alt.qDbv, 0.1, 1), `alt ${alt.qDbv}, neu ${neu.qDbv} l/min`);
    if (fall.ds) ok('Druckschalter an A (30 bar) schaltet in der Endlage', neu.ds === true && alt.ds === true, `alt ${alt.ds}, neu ${neu.ds}`);
    if (fall.ventil === 'triple') ok('Mittelstellung: Last sinkt nicht', Math.abs(neu.xMitteDrift) < 0.5, neu.xMitteDrift.toFixed(2) + ' %');
    if (fall.speicher) ok('Speicher lädt bis zum DBV-Druck', nah(neu.spP, 100, 0.05) && neu.spOel > 0.2, `alt ${alt.spP} bar ${alt.spOel} l, neu ${neu.spP} bar ${neu.spOel} l`);
    ok('Öltemperatur steigt (DBV macht Wärme)', neu.temp > 20, neu.temp + ' °C');
    ok('Keine Skriptfehler', !neu.fehler.length && !alt.fehler.length, neu.fehler.concat(alt.fehler).slice(0, 2).join(' | '));
  }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
