const { chromium } = require('playwright');
// Prüfung: Ein Hydraulik-Fluidplan lässt sich mit der 2D-Anlage verbinden (eine Wahrheit
// wie bei der Pneumatik). „⇐ Aus 2D-Anlage“ übernimmt die 2D-Hydraulik als Plan, der
// sichtbare Plan rechnet dann für die 2D-Anlage, Änderungen gleichen sich in beide
// Richtungen ab, und ein Plan ohne 2D-Teile baut sie in der 2D-Anlage auf.
//
//   node pruefungen/hydraulik-verbinden-pruefung.js
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
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' ? '  (' + JSON.stringify(d) + ')' : ''}`); g ? gut++ : schlecht++; };

const FAELLE = {
  // 2D-Hydraulik aufbauen, als Plan übernehmen, fahren, in beide Richtungen ändern
  'Aus 2D-Anlage übernehmen und verbunden fahren': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan;
    window._findHydTankForCylinder = () => null;
    // Startszene: pneumatischer Zylinder weg (sonst übernimmt „Aus 2D-Anlage“ die Pneumatik)
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2'; c.pistonD = 40; c.rodD = 20; c.stroke = 200;
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    c.extension = 0; c.hyd = { last: 4000, lastArt: 'gewicht' };
    window._hydAnbauen(c.id, 'check_valve_hyd', 'A');
    window._hydAnbauen(null, 'accumulator_hyd', 'P');
    const sp = factoryObjects.find(x => x.type === 'accumulator_hyd'); sp.hyd = { volumen: 1, vordruck: 50 };
    const u = factoryObjects.find(x => x.type === 'hydraulic_unit');
    const n = F.ausAnlage();
    const p = F.plan(), T = typ => p.teile.filter(t => t.typ === typ);
    R.push(['ein Zylinder übernommen, Plan verbunden', n === 1 && p.anlage === true, [n, p.anlage]]);
    const zp = T('zyl_dw')[0], vp = T('ventil')[0];
    R.push(['Zylinder 40/20 × 200 mit 2D-Zylinder verknüpft', zp && zp.o.anlage === c.id && zp.o.d === 40 && zp.o.hub === 200, zp && zp.o]);
    R.push(['Wegeventil 4/2, Y1 aus, Y2 ein', vp && vp.o.wege === '4/2' && vp.o.varL === 'Y1' && vp.o.varR === 'Y2', vp && [vp.o.wege, vp.o.varL, vp.o.varR]]);
    R.push(['Aggregat 100 bar, Speicher 1 l / 50 bar', T('aggregat').length === 1 && T('aggregat')[0].o.p === 100 && T('speicher').length === 1 && T('speicher')[0].o.p0 === 50, [T('aggregat')[0] && T('aggregat')[0].o.p, T('speicher')[0] && T('speicher')[0].o.p0]]);
    R.push(['zwei Stromregelventile, ein entsperrbares Rückschlagventil', T('stromregel').length === 2 && T('entsperr').length === 1, [T('stromregel').length, T('entsperr').length]]);
    await warte(500);
    R.push(['nach dem Abgleich bleibt der 2D-Aufbau (Ventil, 2 Drosseln, Rückschlagventil)', factoryObjects.filter(x => x.targetCylinderId === c.id && ['valve_hyd', 'throttle_hyd', 'check_valve_hyd'].includes(x.type)).length === 4, factoryObjects.filter(x => x.targetCylinderId === c.id).map(x => x.type)]);
    // Fahren: der sichtbare Plan rechnet für die 2D-Anlage
    toggleSimulation(); await warte(400);
    R.push(['Plan rechnet (kein Schattenplan, alte 2D-Hydraulik aus)', window._fpHydSchatten() && !window._fpHydPlan(), [window._fpHydSchatten(), !!window._fpHydPlan()]]);
    setTaster('S1', true);
    let v = 0;
    for (let i = 0; i < 80; i++) { await warte(50); if (c.extension > 20 && c.extension < 80) v = Math.max(v, c.hydV || 0); if (c.extension > 99) break; }
    await warte(1200);
    const zz = F.zustand().teile[zp.id];
    R.push(['2D-Zylinder fährt aus wie der Planzylinder', c.extension > 99 && zz.anteil > 0.99, [c.extension, zz.anteil]]);
    R.push(['Live-Werte: Druck A ≈ 100 bar, Geschwindigkeit, Kraft', c.hydPA > 95 && v > 10 && c.hydKraft > 10000, [c.hydPA, v, c.hydKraft]]);
    R.push(['Aggregat: DBV offen, Öl in den Tank', u.hydDbvOffen && u.hydQdbv > 5 && u.hydP > 95, [u.hydDbvOffen, u.hydQdbv, u.hydP]]);
    R.push(['Speicher geladen', sp.hydP > 90 && sp.hydOelL > 0.2, [sp.hydP, sp.hydOelL]]);
    setTaster('S1', false); setTaster('S2', true);
    for (let i = 0; i < 80; i++) { await warte(50); if (c.extension < 1) break; }
    await warte(300);
    R.push(['fährt wieder ein', c.extension < 1, c.extension]);
    setTaster('S2', false);
    toggleSimulation(); await warte(300);
    // 2D → Plan
    const th = factoryObjects.find(x => x.type === 'throttle_hyd' && x.targetCylinderId === c.id && x.role === 'ext');
    th.opening = 30; u.pressure = 80; c.pistonD = 50;
    const ventil = factoryObjects.find(x => x.type === 'valve_hyd' && x.targetCylinderId === c.id); ventil.isTriple = true;
    await warte(900);
    let q = F.plan();
    const srExt = q.teile.find(t => t.typ === 'stromregel' && t.o.anlage === th.id);
    R.push(['2D-Drossel 30 % → Stromregelventil 6 l/min', srExt && srExt.o.q === 6, srExt && srExt.o.q]);
    R.push(['2D-Aggregat 80 bar → Plan 80 bar', q.teile.find(t => t.typ === 'aggregat') && q.teile.find(t => t.typ === 'aggregat').o.p === 80, q.teile.find(t => t.typ === 'aggregat').o.p]);
    R.push(['2D-Kolben 50 mm → Plan 50 mm', q.teile.find(t => t.typ === 'zyl_dw').o.d === 50, q.teile.find(t => t.typ === 'zyl_dw').o.d]);
    R.push(['2D-Ventil 4/3 → Plan 4/3', q.teile.find(t => t.typ === 'ventil').o.wege === '4/3', q.teile.find(t => t.typ === 'ventil').o.wege]);
    // Plan → 2D
    F.aendern(srExt.id, { q: 10 });
    R.push(['Plan 10 l/min → 2D-Drossel 50 %', th.opening === 50, th.opening]);
    F.aendern(q.teile.find(t => t.typ === 'aggregat').id, { p: 120, q: 25 });
    R.push(['Plan-Aggregat 120 bar, 25 l/min → 2D', u.pressure === 120 && u.maxFlow === 25, [u.pressure, u.maxFlow]]);
    F.aendern(q.teile.find(t => t.typ === 'ventil').id, { wege: '4/2' });
    R.push(['Plan 4/2 → 2D-Ventil bistabil', ventil.isDouble && !ventil.isTriple, [ventil.isDouble, ventil.isTriple]]);
    // Rückschlagventil im Plan entfernen: 2D-Rückschlagventil weg, Leitung wieder durch
    const rv = q.teile.find(t => t.typ === 'entsperr');
    const an = pid => q.leitungen.find(l => (l.a.t === rv.id && l.a.p === pid) || (l.b.t === rv.id && l.b.p === pid));
    const e1 = an('1'), e2 = an('2'), ende = (l, pid) => l.a.t === rv.id && l.a.p === pid ? l.b : l.a;
    F._entfernen(rv.id);
    F.verbinden(ende(e1, '1').t, ende(e1, '1').p, ende(e2, '2').t, ende(e2, '2').p);
    await warte(200);
    R.push(['Rückschlagventil im Plan entfernt → in 2D weg', !factoryObjects.some(x => x.type === 'check_valve_hyd' && x.targetCylinderId === c.id), factoryObjects.filter(x => x.type === 'check_valve_hyd').length]);
    const Cn = (window.fluidPipeConnections || []).filter(k => k._sys === 'hyd');
    const hatA = Cn.some(k => (k.aObjId === c.id && k.aPortId === 'A') || (k.bObjId === c.id && k.bPortId === 'A'));
    const hatVA = Cn.some(k => (k.aObjId === ventil.id && k.aPortId === 'A') || (k.bObjId === ventil.id && k.bPortId === 'A'));
    R.push(['Schläuche: Ventil A und Zylinder A weiter angeschlossen', hatA && hatVA, [hatA, hatVA]]);
    // 2D: Rückschlagventil wieder anbauen → Plan bekommt eins
    window._hydAnbauen(c.id, 'check_valve_hyd', 'B');
    await warte(900);
    q = F.plan();
    R.push(['2D-Rückschlagventil in B → Plan hat eins auf der Stangenseite', q.teile.filter(t => t.typ === 'entsperr').length === 1, q.teile.filter(t => t.typ === 'entsperr').length]);
    // 2D-Drossel entfernen → Stromregelventil weg
    const thR = factoryObjects.find(x => x.type === 'throttle_hyd' && x.targetCylinderId === c.id && x.role === 'ret');
    deleteObjRecursive(thR);
    await warte(900);
    q = F.plan();
    R.push(['2D-Drossel entfernt → nur noch ein Stromregelventil', q.teile.filter(t => t.typ === 'stromregel').length === 1, q.teile.filter(t => t.typ === 'stromregel').length]);
    return R;
  },
  'Plan ohne 2D-Teile baut die 2D-Hydraulik auf': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan, H = { hyd: true };
    window._findHydTankForCylinder = () => null;
    const zyl2d = () => factoryObjects.filter(o => o.type === 'zylinder_double' || o.type === 'zylinder_single');
    const vorher = zyl2d().length;
    const ag = F.setzen('aggregat', 0, 300, Object.assign({ q: 12, p: 90 }, H), '0G1');
    const tk = F.setzen('tank', 200, 320, H, '');
    const v = F.setzen('ventil', 0, 150, Object.assign({ wege: '4/2', links: 'magnet', rechts: 'magnet', varL: 'Y1', varR: 'Y2' }, H), '1Q1');
    const z = F.setzen('zyl_dw', 0, -100, Object.assign({ d: 32, dStange: 16, hub: 150 }, H), '1M1');
    const sr = F.setzen('stromregel', -40, 40, Object.assign({ q: 4 }, H), '1R1');
    F.verbinden(ag, 'P', v, '1'); F.verbinden(v, '3', tk, '1'); F.verbinden(v, '4', sr, '1'); F.verbinden(sr, '2', z, 'K'); F.verbinden(v, '2', z, 'S');
    R.push(['ohne Verbindung keine 2D-Teile', zyl2d().length === vorher, zyl2d().length]);
    F.verbinden2D(true);
    const id = F.plan().teile.find(t => t.id === z).o.anlage, o = factoryObjects.find(x => x.id === id);
    R.push(['2D-Zylinder mit Hydraulik angelegt', !!o && o.type === 'zylinder_double' && o.hasHydraulics && o.pistonD === 32 && o.stroke === 150, o && [o.type, o.hasHydraulics, o.pistonD, o.stroke]]);
    const ventil = factoryObjects.find(x => x.type === 'valve_hyd' && x.targetCylinderId === id);
    R.push(['2D-Ventil bistabil mit Y1/Y2', ventil && ventil.isDouble && !ventil.isTriple && ventil.linkedVarExt === 'Y1' && ventil.linkedVarRet === 'Y2', ventil && [ventil.isDouble, ventil.linkedVarExt, ventil.linkedVarRet]]);
    const th = factoryObjects.filter(x => x.type === 'throttle_hyd' && x.targetCylinderId === id);
    R.push(['nur die Drossel aus dem Plan (ext, 4 l/min = 20 %)', th.length === 1 && th[0].role === 'ext' && th[0].opening === 20, th.map(x => [x.role, x.opening])]);
    const u = factoryObjects.find(x => x.type === 'hydraulic_unit');
    R.push(['2D-Aggregat 90 bar, 12 l/min, Kennzeichen 0G1', u && u.pressure === 90 && u.maxFlow === 12 && u.normLabel === '0G1', u && [u.pressure, u.maxFlow, u.normLabel]]);
    R.push(['Kennzeichen 1M1 und 1Q1 in 2D', o.normLabel === '1M1' && ventil.normLabel === '1Q1', [o.normLabel, ventil.normLabel]]);
    o.extension = 0;
    toggleSimulation(); await warte(400);
    setTaster('S1', true);
    for (let i = 0; i < 100; i++) { await warte(50); if (o.extension > 99) break; }
    R.push(['fährt mit dem Plan aus', o.extension > 99, o.extension]);
    setTaster('S1', false);
    toggleSimulation(); await warte(300);
    F._entfernen(z);
    await warte(200);
    R.push(['Planzylinder gelöscht → 2D-Zylinder und Ventil weg', !factoryObjects.some(x => x.id === id) && !factoryObjects.some(x => x.type === 'valve_hyd' && x.targetCylinderId === id), '']);
    return R;
  }
};

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html?fluidplan=1';
  for (const [name, fn] of Object.entries(FAELLE)) {
    console.log(name);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); } catch (e) {} });
    await page.goto(url); await page.waitForTimeout(3000);
    let R;
    try {
      R = await page.evaluate(async (src) => {
        try { closeHub(); } catch (e) {}
        const ta = document.getElementById('code'); ta.value = 'Y1 := S1\nY2 := S2'; ta.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        try { Fluidplan._sichtbar(); } catch (e) {}
        const R = []; try { await (eval('(' + src + ')'))(R); } catch (e) { R.push(['Lauf ohne Abbruch', false, String(e.stack || e).slice(0, 400)]); } return R;
      }, fn.toString());
    } catch (e) { R = [['Lauf ohne Abbruch', false, String(e).slice(0, 300)]]; }
    for (const [n, g, d] of R) ok(n, g, d);
    ok('Keine Skriptfehler', !fehler.length, fehler.slice(0, 2).join(' | '));
    await page.close();
  }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
