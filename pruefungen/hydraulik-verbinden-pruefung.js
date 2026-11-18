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
  ,
  'Druckschalter, Manometer und Last gleichen sich ab': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan;
    window._findHydTankForCylinder = () => null;
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2'; c.pistonD = 40; c.rodD = 20; c.stroke = 200;
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    c.extension = 0; c.hyd = { last: 6000, lastArt: 'gewicht' };
    window._hydAnbauen(c.id, 'pressure_switch_hyd', 'A'); const ds = factoryObjects.find(x => x.type === 'pressure_switch_hyd'); ds.hyd = { schaltdruck: 30 }; ds.linkedVar = 'DS';
    window._hydAnbauen(null, 'manometer_hyd', 'P'); const ma = factoryObjects.find(x => x.type === 'manometer_hyd');
    F.ausAnlage();
    await warte(300);
    let p = F.plan();
    const pd = p.teile.find(t => t.typ === 'dschalter'), pm = p.teile.find(t => t.typ === 'manometer'), pz = p.teile.find(t => t.typ === 'zyl_dw');
    R.push(['Druckschalter im Plan: 30 bar, DS, Kennzeichen wie 2D', pd && pd.o.p === 30 && pd.o.var === 'DS' && pd.o.anlage === ds.id && pd.bez === ds.normLabel, pd && [pd.o.p, pd.o.var, pd.bez, ds.normLabel]]);
    const anK = pd && p.leitungen.some(l => (l.a.t === pd.id && l.b.t === pz.id && l.b.p === 'K') || (l.b.t === pd.id && l.a.t === pz.id && l.a.p === 'K'));
    R.push(['Druckschalter hängt an der Kolbenseite (A)', anK, '']);
    R.push(['Manometer im Plan am Aggregat (P)', pm && pm.o.anlage === ma.id && p.leitungen.some(l => [l.a.t, l.b.t].includes(pm.id) && [l.a.p, l.b.p].includes('P')), pm && pm.o.anlage]);
    R.push(['Last 6 kN Gewicht im Plan', pz.o.last === 6000 && pz.o.lastArt === 'gewicht', [pz.o.last, pz.o.lastArt]]);
    await warte(500);
    R.push(['nach dem Abgleich: keine doppelten 2D-Messgeräte', factoryObjects.filter(x => x.type === 'pressure_switch_hyd').length === 1 && factoryObjects.filter(x => x.type === 'manometer_hyd').length === 1, [factoryObjects.filter(x => x.type === 'pressure_switch_hyd').length, factoryObjects.filter(x => x.type === 'manometer_hyd').length]]);
    toggleSimulation(); await warte(400);
    setTaster('S1', true);
    for (let i = 0; i < 80; i++) { await warte(50); if (c.extension > 99) break; }
    await warte(800);
    R.push(['Druckschalter schaltet in der Endlage (2D zeigt den Planwert)', ds.hydSchaltet === true && ds.hydP > 90 && F.zustand().teile[pd.id].an === true, [ds.hydSchaltet, ds.hydP]]);
    R.push(['Manometer zeigt den Systemdruck', ma.hydP > 90, ma.hydP]);
    setTaster('S1', false); setTaster('S2', true);
    for (let i = 0; i < 80; i++) { await warte(50); if (c.extension < 1) break; }
    setTaster('S2', false);
    toggleSimulation(); await warte(300);
    // 2D → Plan
    ds.hyd.schaltdruck = 40; c.hyd.lastAb = 60; c.hyd.lastArt = 'presse'; c.hyd.last = 50000;
    await warte(900);
    p = F.plan();
    R.push(['2D-Schaltdruck 40 bar → Plan', p.teile.find(t => t.id === pd.id).o.p === 40, p.teile.find(t => t.id === pd.id).o.p]);
    const z2 = p.teile.find(t => t.id === pz.id);
    R.push(['2D-Last Werkstück 50 kN ab 60 % → Plan', z2.o.last === 50000 && z2.o.lastArt === 'presse' && z2.o.lastAb === 60, [z2.o.last, z2.o.lastArt, z2.o.lastAb]]);
    // Plan → 2D
    F.aendern(pd.id, { p: 55, oeffner: true });
    R.push(['Plan 55 bar, Öffner → 2D', ds.hyd.schaltdruck === 55 && ds.hyd.oeffner === true, [ds.hyd.schaltdruck, ds.hyd.oeffner]]);
    F.aendern(pz.id, { lastAb: 50 });
    R.push(['Plan Werkstück ab 50 % → 2D', c.hyd.lastAb === 50 && c.hyd.lastArt === 'presse' && c.hyd.last === 50000, c.hyd]);
    // Werkstück stärker als der Zylinder: bleibt bei 50 % stehen
    c.extension = 0;
    toggleSimulation(); await warte(400);
    setTaster('S1', true); await warte(2500);
    R.push(['Plan rechnet das Werkstück: Zylinder steht bei 50 %', Math.abs(c.extension - 50) < 3 && c.hydPA > 90, [c.extension, c.hydPA]]);
    setTaster('S1', false); setTaster('S2', true); await warte(2000); setTaster('S2', false);
    toggleSimulation(); await warte(300);
    // Manometer im Plan löschen → in 2D weg; in 2D anbauen → im Plan da
    F._entfernen(pm.id); await warte(200);
    R.push(['Plan-Manometer gelöscht → 2D-Manometer weg', !factoryObjects.some(x => x.type === 'manometer_hyd'), factoryObjects.filter(x => x.type === 'manometer_hyd').length]);
    window._hydAnbauen(c.id, 'manometer_hyd', 'B');
    await warte(900);
    p = F.plan();
    const pm2 = p.teile.find(t => t.typ === 'manometer');
    R.push(['2D-Manometer an B → Plan-Manometer an der Stangenseite', pm2 && p.leitungen.some(l => (l.a.t === pm2.id && l.b.t === pz.id && l.b.p === 'S') || (l.b.t === pm2.id && l.a.t === pz.id && l.a.p === 'S')), pm2 && pm2.id]);
    deleteObjRecursive(ds); await warte(900);
    R.push(['2D-Druckschalter entfernt → aus dem Plan weg', !F.plan().teile.some(t => t.typ === 'dschalter'), '']);
  }
  ,
  'Hydraulikzylinder ablegen: Abfrage, 2D baut nur, was im Plan steht': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan;
    window._findHydTankForCylinder = () => null;
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle', 'compressor', 'manifold', 'pneu_fp'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    F._leeren(); F.verbinden2D(true);
    const sd = window.showValisChoiceDialog;
    let gefragt = 0;
    window.showValisChoiceDialog = (a, b, x, cb) => { gefragt++; cb('nein'); };
    F._ablegen('zyl_dw', 0, 0, { hyd: true });
    await warte(300);
    let p = F.plan(), z = p.teile.find(t => t.typ === 'zyl_dw');
    const o = z && factoryObjects.find(x => x.id === z.o.anlage);
    R.push(['Abfrage kommt', gefragt === 1, gefragt]);
    R.push(['„Nur der Zylinder“: Plan hat nur den Zylinder', p.teile.length === 1, p.teile.map(t => t.typ)]);
    R.push(['2D: nur der Hydraulikzylinder, kein Ventil, keine Drosseln, kein Aggregat', !!o && o.hasHydraulics && !factoryObjects.some(x => ['valve_hyd', 'throttle_hyd', 'hydraulic_unit'].includes(x.type)), factoryObjects.filter(x => /hyd/.test(x.type)).map(x => x.type)]);
    window.showValisChoiceDialog = (a, b, x, cb) => { gefragt++; cb('ja'); };
    F._ablegen('zyl_dw', 400, 0, { hyd: true });
    window.showValisChoiceDialog = sd;
    await warte(300);
    p = F.plan();
    const z2 = p.teile.filter(t => t.typ === 'zyl_dw')[1];
    R.push(['„Mit Grundschaltung“: Ventil 4/3, Aggregat, Tank im Plan', p.teile.some(t => t.typ === 'ventil' && t.o.wege === '4/3') && p.teile.some(t => t.typ === 'aggregat') && p.teile.some(t => t.typ === 'tank'), p.teile.map(t => t.typ)]);
    const o2 = z2 && factoryObjects.find(x => x.id === z2.o.anlage);
    const v2 = o2 && factoryObjects.find(x => x.type === 'valve_hyd' && x.targetCylinderId === o2.id);
    R.push(['2D: Ventil mit Sperrmitte, keine Drosseln (stehen nicht im Plan)', v2 && v2.isTriple && !factoryObjects.some(x => x.type === 'throttle_hyd' && x.targetCylinderId === o2.id), v2 && [v2.isTriple, factoryObjects.filter(x => x.type === 'throttle_hyd').length]]);
    R.push(['2D: Aggregat vorhanden, erster Zylinder weiter ohne Ventil', factoryObjects.some(x => x.type === 'hydraulic_unit') && !factoryObjects.some(x => x.type === 'valve_hyd' && x.targetCylinderId === o.id), '']);
  }
  ,
  'Aus 2D-Anlage mit Pneumatik und Hydraulik: beide kommen in den Plan': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan;
    window._findHydTankForCylinder = () => null;
    // Startszene: pneumatischer cyl1 mit Ventil und Drosseln bleibt, dazu ein Hydraulikzylinder
    const c = createFactoryObject('zylinder_double', ''); c.x = 700; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    window._hydAnbauen(null, 'manometer_hyd', 'P');
    const vorher = factoryObjects.map(o => o.type).sort().join(',');
    const n = F.ausAnlage(); await warte(900);
    const p = F.plan(), T = typ => p.teile.filter(t => t.typ === typ);
    R.push(['zwei Zylinder übernommen', n === 2, n]);
    R.push(['Pneumatik im Plan: Quelle, Zylinder, Ventil', T('quelle').length === 1 && p.teile.some(t => t.typ === 'zyl_dw' && !t.o.hyd && t.o.anlage === 'cyl1'), p.teile.map(t => t.typ)]);
    R.push(['Hydraulik im Plan: Aggregat, Tank, Zylinder, Ventil, Manometer', T('aggregat').length === 1 && T('tank').length === 1 && p.teile.some(t => t.typ === 'zyl_dw' && t.o.hyd && t.o.anlage === c.id) && p.teile.some(t => t.typ === 'ventil' && t.o.hyd) && T('manometer').some(t => t.o.hyd), p.teile.map(t => t.typ)]);
    const pn = p.teile.filter(t => !t.o.hyd), hy = p.teile.filter(t => t.o.hyd);
    R.push(['Hydraulik steht rechts neben der Pneumatik', Math.min(...hy.map(t => t.x)) > Math.max(...pn.map(t => t.x)), [Math.max(...pn.map(t => t.x)), Math.min(...hy.map(t => t.x))]]);
    R.push(['2D-Anlage bleibt wie sie war', factoryObjects.map(o => o.type).sort().join(',') === vorher, [vorher, factoryObjects.map(o => o.type).sort().join(',')]]);
  }
  ,
  'Hydraulikteile in den vier Darstellungen': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    window._findHydTankForCylinder = () => null;
    clearFactory(true);
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300;
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('triple');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    window._hydAnbauen(c.id, 'check_valve_hyd', 'A');
    window._hydAnbauen(null, 'accumulator_hyd', 'P');
    window._hydAnbauen(null, 'pressure_switch_hyd', 'P');
    window._hydAnbauen(null, 'manometer_hyd', 'P');
    const TEILE = ['valve_hyd', 'throttle_hyd', 'check_valve_hyd', 'hydraulic_unit', 'accumulator_hyd', 'pressure_switch_hyd', 'manometer_hyd'];
    for (const mode of ['symbol', 'schnitt', 'aussen']) {
      const n = window._fpAlleVentile(mode); await warte(400);
      const ohne = TEILE.filter(t => { const o = factoryObjects.find(q => q.type === t); return !o || !o.el.querySelector('svg.f2d-hyd-bild') || !o.el.classList.contains('hyd-bild'); });
      R.push([mode + ': jedes Hydraulikteil zeigt sein Bild', !ohne.length && n >= TEILE.length + 1, ohne]);
      R.push([mode + ': Hydraulikzylinder auch', !!c.el.querySelector('svg.f2d-zyl-bild'), '']);
    }
    // Normsymbol: das 4/3-Ventil zeigt die geschaltete Stellung
    window._fpAlleVentile('symbol'); await warte(300);
    const v = factoryObjects.find(q => q.type === 'valve_hyd');
    v.el.classList.add('active-ext'); await warte(400);
    const blk = v.el.querySelector('svg.f2d-hyd-bild .fp-block');
    R.push(['4/3-Ventil geschaltet: Kastenblock verschoben', blk && /translate\(40/.test(blk.getAttribute('transform') || ''), blk && blk.getAttribute('transform')]);
    v.el.classList.remove('active-ext');
    window._fpAlleVentile('gehaeuse'); await warte(400);
    R.push(['Gehäuse: wieder das gewohnte 2D-Bild', !factoryObjects.some(o => o.el && (o.el.querySelector('svg.f2d-hyd-bild') || o.el.classList.contains('hyd-bild'))) && !c.el.querySelector('svg.f2d-zyl-bild'), '']);
  }
  ,
  'Pneumatikplan mit Hydraulikteilen: Pneumatik bleibt, Hydraulik nur für Hydraulikzylinder': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan, H = { hyd: true };
    window._findHydTankForCylinder = () => null;
    const i = F.beispiele().findIndex(n => /sortier/i.test(n));
    if (i >= 0) { F.beispielLaden(i); F.verbinden2D(true); } else { F._leeren(); F.ausAnlage(); }
    await warte(300);
    const zyl2d = () => factoryObjects.filter(o => /^zylinder_/.test(o.type));
    const n0 = zyl2d().length, pneu0 = zyl2d().filter(o => o.hasPneumatics).length;
    R.push(['Pneumatikplan verbunden (' + (i >= 0 ? F.beispiele()[i] : 'Startszene') + ')', F.plan().anlage && pneu0 > 0, [n0, pneu0]]);
    const ag = F.setzen('aggregat', 900, 400, Object.assign({ q: 10, p: 80 }, H), '0G9');
    const v = F.setzen('ventil', 900, 250, Object.assign({ wege: '4/2', links: 'magnet', rechts: 'feder', varL: 'YH' }, H), '9Q1');
    F.verbinden(ag, 'P', v, '1');
    await warte(300);
    // Das Aggregat steht in 2D (eine Wahrheit), aber kein Ventil ohne Hydraulikzylinder und keine Hydraulik an Pneumatikzylindern
    R.push(['Aggregat und Ventil gesetzt: Aggregat in 2D, kein neuer 2D-Zylinder, kein 2D-Hydraulikventil', zyl2d().length === n0 && factoryObjects.some(o => o.type === 'hydraulic_unit') && !factoryObjects.some(o => o.type === 'valve_hyd') && !zyl2d().some(o => o.hasHydraulics), [zyl2d().length, factoryObjects.filter(o => /hyd/.test(o.type)).map(o => o.type)]]);
    R.push(['Pneumatikzylinder behalten ihre Pneumatik', zyl2d().filter(o => o.hasPneumatics).length === pneu0 && !zyl2d().some(o => o.hasHydraulics), zyl2d().map(o => [o.hasPneumatics, !!o.hasHydraulics])]);
    R.push(['keine Pneumatik-Teile aus Hydraulikteilen', !factoryObjects.some(o => o.type === 'pneu_fp' && o.pneu && o.pneu.fp && ['aggregat', 'tank'].includes(o.pneu.fp.typ)) && !factoryObjects.some(o => o.type === 'pneu_fp' && o.pneu && o.pneu.fp && o.pneu.fp.o && o.pneu.fp.o.hyd), '']);
    const z = F.setzen('zyl_dw', 900, 0, Object.assign({ d: 32, dStange: 16, hub: 100 }, H), '9M1');
    F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    await warte(300);
    const id = F.plan().teile.find(t => t.id === z).o.anlage, o = factoryObjects.find(x => x.id === id);
    R.push(['Hydraulikzylinder im Plan → genau ein 2D-Hydraulikzylinder', !!o && o.hasHydraulics && zyl2d().length === n0 + 1 && zyl2d().filter(q => q.hasHydraulics).length === 1, [zyl2d().length, n0]]);
    R.push(['Pneumatik danach unverändert', zyl2d().filter(q => q.hasPneumatics).length === pneu0, zyl2d().filter(q => q.hasPneumatics).length]);
    F._entfernen(z);
    await warte(300);
    R.push(['Hydraulikzylinder gelöscht → 2D-Hydraulikzylinder weg, Pneumatik bleibt', zyl2d().length === n0 && zyl2d().filter(q => q.hasPneumatics).length === pneu0, [zyl2d().length, n0]]);
  }
  ,
  'Ventileinstellung sofort synchron, Rechtsklickmenü des 2D-Ventils': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan, H = { hyd: true };
    window._findHydTankForCylinder = () => null;
    const ag = F.setzen('aggregat', 0, 300, Object.assign({ q: 12, p: 90 }, H), '0G1');
    const tk = F.setzen('tank', 200, 320, H, '');
    const v = F.setzen('ventil', 0, 150, Object.assign({ wege: '4/3', mitte: 'schwimm', links: 'magnet', rechts: 'magnet', varL: 'Y1', varR: 'Y2' }, H), '1Q1');
    const z = F.setzen('zyl_dw', 0, -100, Object.assign({ d: 32, dStange: 16, hub: 150 }, H), '1M1');
    F.verbinden(ag, 'P', v, '1'); F.verbinden(v, '3', tk, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    F.verbinden2D(true);
    const id = F.plan().teile.find(t => t.id === z).o.anlage;
    const ventil = factoryObjects.find(x => x.type === 'valve_hyd' && x.targetCylinderId === id);
    const k = () => JSON.stringify(window._fpHydKonf(ventil));
    R.push(['2D-Ventil kennt die Einstellung ohne Simulation (4/3 Schwimmstellung)', ventil && ventil.isTriple && window._fpHydKonf(ventil) && window._fpHydKonf(ventil).mitte === 'schwimm', ventil && k()]);
    // Plan → 2D sofort
    F.aendern(v, { mitte: 'umlauf' });
    R.push(['Plan: Mittelstellung Umlauf → 2D sofort', window._fpHydKonf(ventil).mitte === 'umlauf', k()]);
    ventil.pneu = { bild: 'symbol' }; window._fpHydBild(ventil);
    R.push(['Normsymbol der 2D-Anlage zeigt die Einstellung', /umlauf/.test(ventil._hydKey || ''), (ventil._hydKey || '').slice(0, 160)]);
    // Rechtsklickmenü
    const ctx = document.createElement('div'); document.body.appendChild(ctx);
    window._fpHydVentilMenue(ventil, ctx, () => {});
    const sel = c => ctx.querySelector('select.' + c);
    R.push(['Menü: Wege und Mittelstellung', !!sel('fp-hv-wege') && !!sel('fp-hv-mitte') && sel('fp-hv-mitte').value === 'umlauf', [!!sel('fp-hv-wege'), sel('fp-hv-mitte') && sel('fp-hv-mitte').value]]);
    sel('fp-hv-mitte').value = 'gesperrt'; sel('fp-hv-mitte').dispatchEvent(new Event('change'));
    await warte(700);
    let pv = F.plan().teile.find(t => t.id === v);
    R.push(['2D-Menü: gesperrt → Plan gesperrt', pv.o.mitte === 'gesperrt', pv.o.mitte]);
    sel('fp-hv-wege').value = '4/2'; sel('fp-hv-wege').dispatchEvent(new Event('change'));
    R.push(['2D-Menü: 4/2 → 2D-Ventil kein 4/3 mehr, Menü zeigt Rückstellung', !ventil.isTriple && !!sel('fp-hv-rueck'), [ventil.isTriple, !!sel('fp-hv-rueck')]]);
    sel('fp-hv-rueck').value = 'feder'; sel('fp-hv-rueck').dispatchEvent(new Event('change'));
    await warte(700);
    pv = F.plan().teile.find(t => t.id === v);
    R.push(['Plan: 4/2 mit Feder, Spule links Y1', pv.o.wege === '4/2' && pv.o.rechts === 'feder' && pv.o.links === 'magnet' && pv.o.varL === 'Y1', [pv.o.wege, pv.o.links, pv.o.rechts, pv.o.varL]]);
    const c2d = factoryObjects.find(x => x.id === id);
    R.push(['Zylinder in 2D ohne Einfahr-Spule', !c2d.linkedVarRet, c2d.linkedVarRet]);
    ctx.remove();
    // Fahren mit Feder: Y1 aus → fährt wieder ein (die Bedienoberfläche baut sich nach der Änderung neu auf)
    c2d.extension = 0; await warte(1500);
    toggleSimulation(); await warte(400);
    setTaster('S1', true);
    for (let i = 0; i < 100; i++) { await warte(50); if (c2d.extension > 99) break; }
    R.push(['fährt mit Y1 aus', c2d.extension > 99, c2d.extension]);
    setTaster('S1', false);
    for (let i = 0; i < 100; i++) { await warte(50); if (c2d.extension < 1) break; }
    R.push(['Feder: ohne Y1 fährt er wieder ein', c2d.extension < 1, c2d.extension]);
    toggleSimulation(); await warte(300);
    ctx.remove();
    return R;
  }
  ,
  'Ohne Plan: Mittelstellung im 2D-Menü gilt für den Schattenplan': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    window._findHydTankForCylinder = () => null;
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2'; c.pistonD = 40; c.rodD = 20; c.stroke = 200;
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('triple');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    c.extension = 50; c.hyd = { last: 4000, lastArt: 'gewicht' };
    const ventil = factoryObjects.find(x => x.type === 'valve_hyd' && x.targetCylinderId === c.id);
    const ctx = document.createElement('div'); document.body.appendChild(ctx);
    window._fpHydVentilMenue(ventil, ctx, () => {});
    const m = ctx.querySelector('select.fp-hv-mitte');
    R.push(['Menü für 4/3 ohne Plan', !!m && m.value === 'gesperrt', m && m.value]);
    m.value = 'schwimm'; m.dispatchEvent(new Event('change'));
    R.push(['Einstellung am 2D-Ventil gespeichert', window._fpHydKonf(ventil) && window._fpHydKonf(ventil).mitte === 'schwimm', JSON.stringify(window._fpHydKonf(ventil))]);
    // Schwimmstellung: die hängende Last zieht den Zylinder ohne Spule herunter (A und B → T)
    toggleSimulation(); await warte(1500);
    const x = c.extension;
    R.push(['Schwimmstellung: Last bewegt den Zylinder in der Mitte', Math.abs(x - 50) > 3, x]);
    toggleSimulation(); await warte(300);
    ctx.remove();
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
    await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
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
