const { chromium } = require('playwright');
// Prüfung des freien Fluidplans (fluidplan.js): baut Schaltungen über
// window.Fluidplan auf und prüft das Verhalten der Simulation.
//
//   node pruefungen/fluidplan-pruefung.js
//
// Braucht Playwright mit Chromium (require('playwright')).
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
function server() {
  const typen = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2' };
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(WURZEL) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': typen[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

// Jeder Fall läuft im Browser: F = window.Fluidplan, hilf = Hilfsfunktionen.
// Rückgabe: Liste von [Name, ok, Detail].
const FAELLE = {
  'Direkt: Taster -> 5/2 pneumatisch -> DW-Zylinder': () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 100, 400);
    const s1 = F.setzen('ventil', 60, 250, { wege: '3/2', links: 'taster' }, '1S1');
    const s2 = F.setzen('ventil', 420, 250, { wege: '3/2', links: 'taster' }, '1S2');
    const v = F.setzen('ventil', 260, 120, { wege: '5/2', links: 'pneu', rechts: 'pneu' }, '1V1');
    const z = F.setzen('zyl_dw', 260, -60, {}, '1A1');
    F.verbinden(q, '1', s1, '1'); F.verbinden(q, '1', s2, '1'); F.verbinden(q, '1', v, '1');
    F.verbinden(s1, '2', v, '14'); F.verbinden(s2, '2', v, '12');
    F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    R.push(['Prüfung ohne Meldung', F.pruefen().length === 0, JSON.stringify(F.pruefen())]);
    F._neu(); F._schritt(1);
    const a = () => F.zustand().teile[z].anteil;
    R.push(['Grundstellung hinten', a() < 0.02, a()]);
    F.druecken(s1, 'L', true); F._schritt(0.3); F.druecken(s1, 'L', false); F._schritt(2);
    R.push(['1S1 kurz: fährt aus und bleibt (Impulsventil)', a() > 0.98, a()]);
    F.druecken(s2, 'L', true); F._schritt(0.3); F.druecken(s2, 'L', false); F._schritt(2);
    R.push(['1S2 kurz: fährt ein', a() < 0.02, a()]);
    return R;
  },
  'Pendelhub mit Rollenventilen (A+ A-)': () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 500);
    const z = F.setzen('zyl_dw', 200, -100, {}, '1A1');
    const v = F.setzen('ventil', 200, 100, { wege: '5/2', links: 'pneu', rechts: 'pneu' }, '1V1');
    const st = F.setzen('ventil', 0, 300, { wege: '3/2', links: 'hebel' }, '1S1');
    const sh = F.setzen('ventil', 150, 300, { wege: '3/2', links: 'rolle', zyl: z, pos: 'hinten' }, '1S2');
    const sv = F.setzen('ventil', 450, 300, { wege: '3/2', links: 'rolle', zyl: z, pos: 'vorne' }, '1S3');
    const und = F.setzen('zweidruck', 150, 200, {}, '1V2');
    F.verbinden(q, '1', st, '1'); F.verbinden(q, '1', sh, '1'); F.verbinden(q, '1', sv, '1'); F.verbinden(q, '1', v, '1');
    F.verbinden(st, '2', und, 'X'); F.verbinden(sh, '2', und, 'Y'); F.verbinden(und, '2', v, '14');
    F.verbinden(sv, '2', v, '12');
    F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    R.push(['Prüfung ohne Meldung', F.pruefen().length === 0, JSON.stringify(F.pruefen())]);
    F._neu(); F._schritt(1);
    const a = () => F.zustand().teile[z].anteil;
    R.push(['ohne Hebel bleibt er hinten', a() < 0.02, a()]);
    F.druecken(st, 'L', true); // Hebel rastet
    let max = 0, min = 1, wechsel = 0, vorher = a();
    for (let i = 0; i < 80; i++) { F._schritt(0.1); const x = a(); max = Math.max(max, x); if (i > 10) min = Math.min(min, x); if ((x - 0.5) * (vorher - 0.5) < 0) wechsel++; vorher = x; }
    R.push(['Hebel ein: pendelt (mehrere Hübe)', max > 0.95 && wechsel >= 4, `max ${max.toFixed(2)}, Durchgänge ${wechsel}`]);
    F.druecken(st, 'L', true); // Hebel aus
    F._schritt(4);
    R.push(['Hebel aus: bleibt am Ende hinten stehen', a() < 0.02, a()]);
    return R;
  },
  'Weg-Schritt-Diagramm: A+ B+ A- B-': () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 600);
    const A = F.setzen('zyl_dw', 0, -200, {}, '1A1'), B = F.setzen('zyl_dw', 400, -200, {}, '2A1');
    const vA = F.setzen('ventil', 0, 0, { wege: '5/2', links: 'pneu', rechts: 'pneu' }, '1V1');
    const vB = F.setzen('ventil', 400, 0, { wege: '5/2', links: 'pneu', rechts: 'pneu' }, '2V1');
    const st = F.setzen('ventil', -100, 300, { wege: '3/2', links: 'taster' }, '1S1');
    const r = (zyl, pos, x) => F.setzen('ventil', x, 400, { wege: '3/2', links: 'rolle', zyl, pos });
    const a0 = r(A, 'hinten', 50), a1 = r(A, 'vorne', 200), b0 = r(B, 'hinten', 350), b1 = r(B, 'vorne', 500);
    const und = F.setzen('zweidruck', 0, 200, {}, '1V2');
    for (const v of [vA, vB, st, a0, a1, b0, b1]) F.verbinden(q, '1', v, '1');
    F.verbinden(st, '2', und, 'X'); F.verbinden(b0, '2', und, 'Y'); F.verbinden(und, '2', vA, '14');
    F.verbinden(b1, '2', vA, '12'); F.verbinden(a1, '2', vB, '14'); F.verbinden(a0, '2', vB, '12');
    F.verbinden(vA, '4', A, 'K'); F.verbinden(vA, '2', A, 'S'); F.verbinden(vB, '4', B, 'K'); F.verbinden(vB, '2', B, 'S');
    F._neu(); F._schritt(1); F._aufzNeu();
    F.druecken(st, 'L', true); F._schritt(0.3); F.druecken(st, 'L', false); F._schritt(4);
    const d = F._diagramm();
    const r1 = d.schritte.map(s => (s[A] > 0.5 ? 1 : 0) + '' + (s[B] > 0.5 ? 1 : 0)).join(' ');
    R.push(['Schritte 00 10 11 01 00', r1 === '00 10 11 01 00', r1]);
    return R;
  },
  'Abluftdrosselung macht langsamer': () => {
    const F = Fluidplan, R = [];
    const zeitBis = (offen) => {
      Fluidplan._leeren();
      const q = F.setzen('quelle', 0, 300);
      const s = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'hebel' }, '1V1');
      const z = F.setzen('zyl_dw', 0, -100, {}, '1A1');
      // Drosselrückschlagventil: frei zum Zylinder hin, gedrosselt in der Abluft
      const d = F.setzen('drv', 160, 50, { offen }, '1V2');
      F.verbinden(q, '1', s, '1'); F.verbinden(s, '4', z, 'K');
      F.verbinden(s, '2', d, '2'); F.verbinden(d, '1', z, 'S');
      F._neu(); F._schritt(1.5); F.druecken(s, 'L', true);
      for (let t = 0; t < 200; t++) { F._schritt(0.05); if (F.zustand().teile[z].anteil > 0.98) return (t + 1) * 0.05; }
      return 99;
    };
    const schnell = zeitBis(100), langsam = zeitBis(1);
    R.push(['Drossel 1 % deutlich langsamer als 100 %', langsam > schnell * 2 && langsam < 99, `${schnell.toFixed(2)} s gegen ${langsam.toFixed(2)} s`]);
    return R;
  },
  'Zeitverzögerungsventil schaltet nach der Zeit': () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 300);
    const s = F.setzen('ventil', 0, 150, { wege: '3/2', links: 'hebel' }, '1S1');
    const zt = F.setzen('zeit', 200, 150, { zeit: 2 }, '1V1');
    const z = F.setzen('zyl_ew', 260, -50, {}, '1A1');
    F.verbinden(q, '1', s, '1'); F.verbinden(q, '1', zt, '1');
    F.verbinden(s, '2', zt, '12'); F.verbinden(zt, '2', z, 'K');
    F._neu(); F._schritt(0.5); F.druecken(s, 'L', true);
    F._schritt(0.6);
    const früh = F.zustand().teile[z].anteil;
    F._schritt(3);
    const spät = F.zustand().teile[z].anteil;
    R.push(['nach 0,6 s noch nicht ausgefahren', früh < 0.05, früh]);
    R.push(['nach 3,6 s ausgefahren', spät > 0.95, spät]);
    return R;
  },
  'Magnetventil und Sensoren mit VALIS-Variablen': () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 300);
    const v = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'FP_Y1' }, '1M1');
    const z = F.setzen('zyl_dw', 0, -100, { sensH: 'FP_B1', sensV: 'FP_B2' }, '1A1');
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    spsState.FP_Y1 = false;
    F._neu(); F._schritt(1);
    R.push(['Sensor hinten meldet', spsState.FP_B1 === true && spsState.FP_B2 === false, `${spsState.FP_B1}/${spsState.FP_B2}`]);
    spsState.FP_Y1 = true; F._schritt(2);
    R.push(['Spule an: fährt aus, Sensor vorne', F.zustand().teile[z].anteil > 0.98 && spsState.FP_B2 === true && spsState.FP_B1 === false, `${F.zustand().teile[z].anteil}`]);
    spsState.FP_Y1 = false; F._schritt(2);
    R.push(['Spule aus: Feder schaltet zurück, fährt ein', F.zustand().teile[z].anteil < 0.02, F.zustand().teile[z].anteil]);
    return R;
  },
  'Eine Wahrheit: Plan baut die 2D-Pneumatik auf': () => {
    const F = Fluidplan, R = [];
    const zyl2d = () => factoryObjects.filter(o => o.type === 'zylinder_double' || o.type === 'zylinder_single');
    const vorher = zyl2d().length;
    const q = F.setzen('quelle', 0, 300);
    const v = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'FP_Y1' }, '1V1');
    const z = F.setzen('zyl_dw', 0, -100, { d: 32, dStange: 12, hub: 200 }, '1A1');
    const d = F.setzen('drv', 120, 40, { offen: 6 }, '1V2');
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', d, '2'); F.verbinden(d, '1', z, 'S');
    R.push(['ohne Verbindung keine 2D-Teile', zyl2d().length === vorher, zyl2d().length]);
    F.verbinden2D(true);
    const id = F.plan().teile.find(t => t.id === z).o.anlage;
    const o = factoryObjects.find(x => x.id === id);
    R.push(['2D-Zylinder angelegt und verknüpft', !!o && o.type === 'zylinder_double' && o.hasPneumatics, o && o.type]);
    const vt = factoryObjects.find(x => x.type === 'valve_pneu' && x.targetCylinderId === id);
    R.push(['2D-Ventil monostabil mit FP_Y1', vt && !vt.isDouble && vt.linkedVarExt === 'FP_Y1', vt && [vt.isDouble, vt.linkedVarExt]]);
    const th = factoryObjects.find(x => x.type === 'throttle' && x.targetCylinderId === id && x.role === 'ext');
    // Plan und 2D verstehen die Öffnung gleich (Anteil am Nenndurchfluss): 6 % bleiben 6 %
    R.push(['Drossel der Ausfahrbewegung (6 % Plan = 6 % 2D)', th && th.opening === 6, th && th.opening]);
    R.push(['keine Drossel fürs Einfahren (nicht im Plan)', !factoryObjects.find(x => x.type === 'throttle' && x.targetCylinderId === id && x.role === 'ret'), '']);
    R.push(['Maße übernommen', o && o.pistonD === 32 && o.rodD === 12 && o.stroke === 200, o && [o.pistonD, o.rodD, o.stroke]]);
    F.aendern(v, { links: 'magnet', rechts: 'magnet', varR: 'FP_Y2' });
    const vt2 = factoryObjects.find(x => x.type === 'valve_pneu' && x.targetCylinderId === id);
    R.push(['Impulsventil im Plan → bistabiles 2D-Ventil', vt2 && vt2.isDouble && !vt2.isTriple && vt2.linkedVarRet === 'FP_Y2', vt2 && [vt2.isDouble, vt2.linkedVarRet]]);
    F.aendern(v, { wege: '5/3' });
    const vt3 = factoryObjects.find(x => x.type === 'valve_pneu' && x.targetCylinderId === id);
    R.push(['5/3 im Plan → 5/3 in 2D', vt3 && vt3.isTriple, vt3 && vt3.isTriple]);
    // Drossel aus dem Plan nehmen: 2D-Drossel verschwindet
    F._entfernen(d);
    F.verbinden(v, '2', z, 'S');
    R.push(['ohne Drossel im Plan keine 2D-Drossel', !factoryObjects.find(x => x.type === 'throttle' && x.targetCylinderId === id), factoryObjects.filter(x => x.type === 'throttle' && x.targetCylinderId === id).length]);
    // Rückweg
    F._leeren();
    const n = F.ausAnlage();
    const p = F.plan();
    const zp = p.teile.find(t => t.typ === 'zyl_dw' && t.o.anlage === id);
    R.push(['Aus 2D-Anlage: Zylinder und Ventil zurück', n >= 1 && !!zp && p.teile.some(t => t.typ === 'ventil' && t.o.wege === '5/3'), n]);
    // Plan-Zylinder löschen entfernt den erzeugten 2D-Zylinder
    F._leeren(); F.verbinden2D(true);
    const z2 = F.setzen('zyl_ew', 0, 0, {}, '2A1');
    const id2 = F.plan().teile.find(t => t.id === z2).o.anlage;
    R.push(['EW-Zylinder erzeugt 2D-Zylinder', !!factoryObjects.find(x => x.id === id2 && x.type === 'zylinder_single'), id2]);
    F.importieren(Object.assign(F.exportieren(), {}));
    Fluidplan._entfernen(z2);
    R.push(['Planzylinder gelöscht → erzeugter 2D-Zylinder weg', !factoryObjects.find(x => x.id === id2), '']);
    return R;
  },
  'Drossel-Öffnung überall gleich (Anteil am Nenndurchfluss)': () => {
    const F = Fluidplan, R = [];
    // Alter Plan (v1, Querschnitt): 60 % → 60²/800 ≈ 5 %, Standard 50 % → 3 %
    F.importieren({ v: 1, teile: [{ id: 'a', typ: 'drv', x: 0, y: 0, rot: 0, bez: '1V2', o: { offen: 60 } }, { id: 'b', typ: 'drossel', x: 100, y: 0, rot: 0, bez: '1V3', o: {} }], leitungen: [] });
    const p = F.plan();
    R.push(['alter Plan: 60 % → 5 %, Standard → 3 %', p.v === 2 && p.teile[0].o.offen === 5 && p.teile[1].o.offen === 3, [p.v, p.teile[0].o.offen, p.teile[1].o.offen]]);
    F.importieren(F.exportieren());
    R.push(['neuer Plan wird nicht noch einmal umgerechnet', F.plan().teile[0].o.offen === 5, F.plan().teile[0].o.offen]);
    F._leeren();
    // Alter 2D-Stand mit 400-l/min-Kompressor: Öffnung verdoppelt, damit das Tempo bleibt
    const st = JSON.parse(JSON.stringify(getFactoryStateObj()));
    delete st.drosselModell;
    st.objects = [
      { id: 'k1', type: 'compressor', x: 40, y: 820, width: 100, height: 60, rotation: 0, pressure: 6, maxFlow: 400 },
      { id: 'd1', type: 'throttle', x: 170, y: 740, width: 40, height: 35, rotation: 0, opening: 6, role: 'ext' }
    ];
    st.pneuConnections = []; st.fluidplan = null;
    localStorage.setItem('logikFactoryState', JSON.stringify(st));
    loadFactoryState();
    const d1 = factoryObjects.find(o => o.id === 'd1');
    R.push(['alter 2D-Stand (400 l/min): 6 % → 12 %', d1 && d1.opening === 12, d1 && d1.opening]);
    R.push(['gespeichert mit drosselModell 2', getFactoryStateObj().drosselModell === 2, getFactoryStateObj().drosselModell]);
    localStorage.setItem('logikFactoryState', JSON.stringify(getFactoryStateObj()));
    loadFactoryState();
    R.push(['neuer Stand bleibt bei 12 %', factoryObjects.find(o => o.id === 'd1').opening === 12, factoryObjects.find(o => o.id === 'd1').opening]);
    return R;
  },
  'Verbunden: 2D-Zylinder steht in jedem Bild wie der Planzylinder': async () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 300);
    const v = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'FP_GL' }, '1V1');
    const z = F.setzen('zyl_dw', 0, -100, {}, '1A1');
    const d = F.setzen('drv', 120, 40, { offen: 3 }, '1V2');
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', d, '2'); F.verbinden(d, '1', z, 'S');
    F.verbinden2D(true);
    const o = factoryObjects.find(x => x.id === F.plan().teile.find(t => t.id === z).o.anlage);
    if (!isSimulationActive) window.toggleSimulation();
    await new Promise(r => setTimeout(r, 400));
    spsState.FP_GL = true;
    let maxAbw = 0, bilder = 0, bewegt = false;
    await new Promise(res => { const f = () => { const a = F.zustand().teile[z].anteil * 100, e = o.extension || 0; if (a > 1 && a < 99) { bewegt = true; bilder++; maxAbw = Math.max(maxAbw, Math.abs(a - e)); } if (a >= 99.5 || bilder > 200) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    spsState.FP_GL = false;
    window.toggleSimulation();
    R.push(['Planzylinder fährt aus', bewegt && bilder >= 3, bilder + ' Bilder']);
    R.push(['2D weicht höchstens 1 % ab', maxAbw <= 1, maxAbw.toFixed(2) + ' %']);
    F.verbinden2D(false);
    return R;
  },
  '2D-Pneumatik ohne Fluidplan läuft mit demselben Rechenkern': async () => {
    const R = [];
    window.loadExample('code');
    await new Promise(r => setTimeout(r, 800));
    const c = document.getElementById('code'); c.value = 'ZYL_AUS := START\nZYL_EIN := STOP'; c.dispatchEvent(new Event('input', { bubbles: true }));
    const cyl = factoryObjects.find(o => o.id === 'cyl1');
    if (!isSimulationActive) window.toggleSimulation();
    spsState.STOP = true; await new Promise(r => setTimeout(r, 600)); spsState.STOP = false;
    spsState.START = true;
    let gefuehrt = false;
    await new Promise(res => { const t0 = performance.now(); const f = () => { if (window._fpZylinder(cyl)) gefuehrt = true; if ((cyl.extension || 0) >= 99.5 || performance.now() - t0 > 4000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    spsState.START = false;
    R.push(['2D-Zylinder fährt aus', (cyl.extension || 0) >= 99.5, (cyl.extension || 0).toFixed(1)]);
    R.push(['bewegt vom Schattenplan (nicht vom alten Modell)', gefuehrt, gefuehrt]);
    // Schlauch ab: Zylinder bleibt stehen
    spsState.STOP = true; await new Promise(r => setTimeout(r, 800)); spsState.STOP = false;
    const eingefahren = (cyl.extension || 0);
    (window.pneuConnections || []).filter(k => k.aObjId === 'cyl1' || k.bObjId === 'cyl1').forEach(k => { k._broken = true; });
    spsState.START = true; await new Promise(r => setTimeout(r, 800)); spsState.START = false;
    R.push(['abgezogene Schläuche: fährt nicht aus', eingefahren < 1 && (cyl.extension || 0) < 20, eingefahren.toFixed(1) + ' → ' + (cyl.extension || 0).toFixed(1) + ' ' + (window.pneuConnections || []).filter(k => k._broken).length]);
    window.toggleSimulation();
    return R;
  },
  'Verbunden: Änderung in der 2D-Anlage landet im Plan': async () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 300);
    const v = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'FP_RA' }, '1V1');
    const z = F.setzen('zyl_dw', 0, -100, {}, '1A1');
    const d = F.setzen('drv', 120, 40, { offen: 6 }, '1V2');
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', d, '2'); F.verbinden(d, '1', z, 'S');
    F.verbinden2D(true);
    const id = F.plan().teile.find(t => t.id === z).o.anlage;
    const o = factoryObjects.find(x => x.id === id);
    const th = factoryObjects.find(x => x.type === 'throttle' && x.targetCylinderId === id && x.role === 'ext');
    th.opening = 15; o.pistonD = 32;
    await new Promise(r => setTimeout(r, 900));
    const p = F.plan();
    R.push(['2D-Drossel 15 % → Plan-DRV 15 %', p.teile.find(t => t.id === d).o.offen === 15, p.teile.find(t => t.id === d).o.offen]);
    R.push(['2D-Kolben 32 mm → Plan 32 mm', p.teile.find(t => t.id === z).o.d === 32, p.teile.find(t => t.id === z).o.d]);
    R.push(['und bleibt in 2D stehen', th.opening === 15 && o.pistonD === 32, [th.opening, o.pistonD]]);
    F.verbinden2D(false);
    return R;
  },
  'Verbunden: jede Änderung gleicht sich in beide Richtungen ab': async () => {
    const F = Fluidplan, R = [];
    F._leeren();
    const q = F.setzen('quelle', 0, 300);
    const v = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'magnet', rechts: 'magnet', varL: 'FP_SA', varR: 'FP_SB' }, '1V1');   // Impulsventil: 2D-Ventil mit 3 und 5
    const z = F.setzen('zyl_dw', 0, -100, {}, '1A1');
    const d = F.setzen('drv', 120, 40, { offen: 6 }, '1V2');
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', d, '2'); F.verbinden(d, '1', z, 'S');
    F.verbinden2D(true);
    const warte = () => new Promise(r => setTimeout(r, 900));
    const id = F.plan().teile.find(t => t.id === z).o.anlage;
    const o = factoryObjects.find(x => x.id === id);
    const vt = () => factoryObjects.find(x => x.type === 'valve_pneu' && x.targetCylinderId === id);
    // Plan 5 (Abluft des Kolbenraums an 4) entspricht 2D 3 (Abluft der Ausfahrseite 2), Plan 3 ↔ 2D 5
    const am = (p, pid) => { const l = p.leitungen.find(l => (l.a.t === v && l.a.p === pid) || (l.b.t === v && l.b.p === pid)); return l && p.teile.find(t => t.id === (l.a.t === v ? l.b.t : l.a.t)); };
    // Plan → 2D: Schalldämpfer an Plan-3
    const sd = F.setzen('daempfer', -20, 260); F.verbinden(v, '3', sd, '1');
    R.push(['Schalldämpfer an Plan-3 → 2D-Ventil 5', vt() && vt().abschluss && vt().abschluss['5'] && vt().abschluss['5'].art === 'daempfer', vt() && JSON.stringify(vt().abschluss)]);
    // 2D → Plan: Blindstopfen an 2D-3
    vt().abschluss = Object.assign({}, vt().abschluss, { '3': { art: 'stopfen' } });
    await warte();
    let p = F.plan(), st = am(p, '5');
    R.push(['Blindstopfen an 2D-3 → Plan-5', !!st && st.typ === 'stopfen', st && st.typ]);
    // 2D → Plan: Drosselschalldämpfer 40 % an 2D-5
    vt().abschluss = Object.assign({}, vt().abschluss, { '5': { art: 'drossel', offen: 40 } });
    await warte();
    p = F.plan(); const sd3 = am(p, '3');
    R.push(['Drosselschalldämpfer 40 % an 2D-5 → Plan-3', !!sd3 && sd3.typ === 'daempfer' && sd3.o.drossel && sd3.o.offen === 40, sd3 && [sd3.typ, sd3.o.drossel, sd3.o.offen]]);
    R.push(['nur ein Teil je Anschluss', p.leitungen.filter(l => (l.a.t === v && l.a.p === '3') || (l.b.t === v && l.b.p === '3')).length === 1, '']);
    // 2D → Plan: Spulen-Variable
    o.linkedVarExt = 'FP_NEU'; await warte();
    R.push(['Variable in 2D → Plan-Spule', F.plan().teile.find(t => t.id === v).o.varL === 'FP_NEU', F.plan().teile.find(t => t.id === v).o.varL]);
    // 2D → Plan: Kompressordruck
    const komp = factoryObjects.find(x => x.type === 'compressor');
    if (komp) { komp.pressure = 5; await warte(); R.push(['Kompressor 5 bar → Quelle 5 bar', F.plan().teile.find(t => t.id === q).o.p === 5, F.plan().teile.find(t => t.id === q).o.p]); }
    // 2D → Plan: Ventiltyp 5/2 → 5/3 (wie Klick im Auto-Schaltplan)
    vt().isTriple = true; vt().isDouble = true; await warte();
    R.push(['5/3 in 2D → Plan-Ventil 5/3', F.plan().teile.find(t => t.id === v).o.wege === '5/3', F.plan().teile.find(t => t.id === v).o.wege]);
    R.push(['und bleibt in 2D 5/3', !!vt() && vt().isTriple, vt() && vt().isTriple]);
    // 2D → Plan: Drossel entfernen und wieder einsetzen
    const th = factoryObjects.find(x => x.type === 'throttle' && x.targetCylinderId === id && x.role === 'ext');
    deleteObjRecursive(th); await warte();
    p = F.plan();
    R.push(['2D-Drossel entfernt → Plan-DRV weg, Leitung durchgehend', !p.teile.some(t => t.typ === 'drv') && p.leitungen.some(l => (l.a.t === z && l.a.p === 'S') || (l.b.t === z && l.b.p === 'S')), p.teile.filter(t => t.typ === 'drv').length]);
    const th2 = createFactoryObject('throttle'); th2.targetCylinderId = id; th2.role = 'ret'; th2.opening = 30;
    await warte();
    p = F.plan();
    const neuD = p.teile.find(t => t.typ === 'drv');
    const anK = neuD && p.leitungen.some(l => (l.a.t === neuD.id && l.a.p === '1' && l.b.t === z && l.b.p === 'K') || (l.b.t === neuD.id && l.b.p === '1' && l.a.t === z && l.a.p === 'K'));
    R.push(['2D-Drossel eingesetzt → Plan-DRV 30 % an K (1 zum Zylinder)', !!neuD && neuD.o.offen === 30 && anK, neuD && [neuD.o.offen, anK]]);
    // Endlagensensor im Plan → Reed-Schalter in 2D, und zurück
    F._leeren();
    const z2 = F.setzen('zyl_dw', 0, -100, { sensV: 'FP_B2' }, '1A1');
    const q2 = F.setzen('quelle', 0, 300), v2 = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'FP_SC' }, '1V1');
    F.verbinden(q2, '1', v2, '1'); F.verbinden(v2, '4', z2, 'K'); F.verbinden(v2, '2', z2, 'S');
    F.verbinden2D(true);
    const o2 = factoryObjects.find(x => x.id === F.plan().teile.find(t => t.id === z2).o.anlage);
    const reeds = () => factoryObjects.filter(x => x.type === 'sensor_reed' && x.parent === o2).map(x => x.linkedVar);
    R.push(['Plan-Sensor vorne → Reed-Schalter in 2D', reeds().includes('FP_B2'), JSON.stringify(reeds())]);
    window.attachReed(o2, 'FP_B1', 'left'); await warte();
    R.push(['Reed hinten in 2D → Plan-Sensor hinten', F.plan().teile.find(t => t.id === z2).o.sensH === 'FP_B1', F.plan().teile.find(t => t.id === z2).o.sensH]);
    // Schlauch in 2D abgezogen: verbundener Plan fährt nicht aus
    window.toggleSimulation(); await new Promise(r => setTimeout(r, 500));
    (window.pneuConnections || []).filter(k => k.aObjId === o2.id || k.bObjId === o2.id).forEach(k => { k._broken = true; });
    spsState.FP_SC = true; await new Promise(r => setTimeout(r, 900));
    R.push(['Schlauch in 2D ab → Plan-Zylinder bleibt stehen', (F.zustand().teile[z2].anteil || 0) < 0.3, F.zustand().teile[z2].anteil]);
    // Drücke für Sensoren kommen aus dem Rechenkern
    const k = window._fpDruckKarte && window._fpDruckKarte();
    R.push(['Druckkarte des Rechenkerns für 2D-Zylinder', !!k && k[o2.id + ':1'] != null, k && k[o2.id + ':1']]);
    spsState.FP_SC = false; window.toggleSimulation();
    (window.pneuConnections || []).forEach(k => { k._broken = false; });
    F.verbinden2D(false);
    return R;
  },
  'Schattenplan: Blindstopfen an den Abluftanschlüssen sperrt': async () => {
    const R = [];
    window.loadExample('code');
    await new Promise(r => setTimeout(r, 800));
    const c = document.getElementById('code'); c.value = 'ZYL_AUS := START\nZYL_EIN := STOP'; c.dispatchEvent(new Event('input', { bubbles: true }));
    const cyl = factoryObjects.find(o => o.id === 'cyl1');
    const v = factoryObjects.find(o => o.type === 'valve_pneu' && o.targetCylinderId === 'cyl1');
    v.abschluss = { '3': { art: 'stopfen' }, '5': { art: 'stopfen' } };
    if (!isSimulationActive) window.toggleSimulation();
    await new Promise(r => setTimeout(r, 600));   // Grundstellung: Stangenseite unter Druck
    spsState.START = true; await new Promise(r => setTimeout(r, 1200)); spsState.START = false;
    R.push(['beide Abluftanschlüsse zu: Zylinder bleibt nach kurzem Weg stehen (Luftpolster)', (cyl.extension || 0) < 30, (cyl.extension || 0).toFixed(1)]);
    v.abschluss = { '3': { art: 'daempfer' }, '5': { art: 'daempfer' } };
    spsState.START = true; await new Promise(r => setTimeout(r, 1500)); spsState.START = false;
    R.push(['mit Schalldämpfern fährt er aus', (cyl.extension || 0) > 95, (cyl.extension || 0).toFixed(1)]);
    window.toggleSimulation(); v.abschluss = null;
    return R;
  },
  'Aus 2D-Anlage übernehmen behält die Reed-Schalter': async () => {
    const F = Fluidplan, R = [];
    window.loadExample('code');
    await new Promise(r => setTimeout(r, 800));
    const reeds = () => factoryObjects.filter(o => o.type === 'sensor_reed' && o.parent && o.parent.id === 'cyl1').map(o => o.linkedVar).sort().join(',');
    const vorher = reeds();
    F._leeren();
    F.ausAnlage();
    const zt = F.plan().teile.find(t => t.typ === 'zyl_dw' && t.o.anlage === 'cyl1');
    R.push(['Reed-Schalter werden Endlagensensoren im Plan', !!zt && [zt.o.sensH, zt.o.sensV].filter(Boolean).sort().join(',') === vorher, (zt ? zt.o.sensH + '/' + zt.o.sensV : '-') + ' ← ' + vorher]);
    F.verbinden2D(true);
    if (typeof window._fpTakt === 'function') window._fpTakt(0.05);
    await new Promise(r => setTimeout(r, 300));
    R.push(['nach dem Verbinden sind die Reed-Schalter in der 2D-Anlage noch da', vorher !== '' && reeds() === vorher, reeds()]);
    F.verbinden2D(false);
    return R;
  },
  'Abluftdrosselung: Ausfahr-Drossel in 2D und Auto-Schaltplan auf der Stangenseite': async () => {
    const R = [];
    window.loadExample('code');
    await new Promise(r => setTimeout(r, 800));
    const cyl = factoryObjects.find(o => o.id === 'cyl1');
    const v = factoryObjects.find(o => o.type === 'valve_pneu' && o.targetCylinderId === 'cyl1');
    const tE = factoryObjects.find(o => o.type === 'throttle' && o.targetCylinderId === 'cyl1' && o.role === 'ext');
    const tR = factoryObjects.find(o => o.type === 'throttle' && o.targetCylinderId === 'cyl1' && o.role === 'ret');
    const hat = (a, ap, b, bp) => (window.pneuConnections || []).some(c => !c._broken &&
      ((c.aObjId === a.id && c.aPortId === ap && c.bObjId === b.id && c.bPortId === bp) || (c.aObjId === b.id && c.aPortId === bp && c.bObjId === a.id && c.bPortId === ap)));
    R.push(['Beispiel (alter Stand) migriert: ext an Ventil 4 und Zylinder 2', !!(tE && hat(v, '4', tE, '2') && hat(tE, '1', cyl, '2')), '']);
    R.push(['ret an Ventil 2 und Zylinder 1', !!(tR && hat(v, '2', tR, '2') && hat(tR, '1', cyl, '1')), '']);
    R.push(['keine Direktleitung mehr daneben', !hat(v, '2', cyl, '1') && !hat(v, '4', cyl, '2'), '']);
    R.push(['ext-Drossel steht rechts (über Ventil 4)', tE.x > tR.x, tE.x + ' / ' + tR.x]);
    // Rollen aus dem Verlauf bleiben gleich (Verlauf gilt als Wahrheit)
    _applyPneuManualConnections();
    R.push(['Rollen aus dem Schlauchverlauf: ext/ret bleiben', tE.role === 'ext' && tR.role === 'ret', tE.role + '/' + tR.role]);
    // Gespeichert und wieder geladen: keine zweite Migration
    const x0 = tE.x, st = getFactoryStateObj();
    R.push(['Zustand trägt drosselSeite', st.drosselSeite === 'stange', String(st.drosselSeite)]);
    // Auto-Schaltplan: ext-Drossel rechts (Stangenleitung)
    if (typeof window._syncCircuitFromFactory === 'function') window._syncCircuitFromFactory(true);
    await new Promise(r => setTimeout(r, 300));
    const lx = id => { const g = document.querySelector('#circuit-content [data-obj-id="' + id + '"] rect, [data-obj-id="' + id + '"] > rect'); return g ? parseFloat(g.getAttribute('x')) : null; };
    const xe = lx(tE.id), xr = lx(tR.id);
    R.push(['Auto-Schaltplan: Ausfahr-Drossel in der Stangenleitung (rechts)', xe != null && xr != null && xe > xr, xe + ' / ' + xr]);
    // Ausfahren über ext-Drossel (20 %) schneller als Einfahren über ret (5 %)
    const c = document.getElementById('code'); c.value = 'ZYL_AUS := START\nZYL_EIN := STOP'; c.dispatchEvent(new Event('input', { bubbles: true }));
    if (!isSimulationActive) window.toggleSimulation();
    spsState.STOP = true; await new Promise(r => setTimeout(r, 2500)); spsState.STOP = false;
    const zeit = (ziel) => new Promise(res => { const t0 = performance.now(); const f = () => { const e = cyl.extension || 0; if ((ziel ? e >= 99 : e <= 1) || performance.now() - t0 > 8000) res(performance.now() - t0); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    spsState.START = true; const tAus = await zeit(true); spsState.START = false;
    spsState.STOP = true; const tEin = await zeit(false); spsState.STOP = false;
    window.toggleSimulation();
    R.push(['Ausfahren (20 %) schneller als Einfahren (5 %)', tAus < tEin && tAus < 8000, Math.round(tAus) + ' / ' + Math.round(tEin) + ' ms']);
    // Neu aufgebaut: generatePneumaticSetup legt die Drossel gleich richtig an
    const pl = factoryObjects.filter(o => o.type === 'valve_pneu' || o.type === 'throttle');
    pl.forEach(o => { try { deleteObjRecursive(o); } catch (e) {} });
    cyl.hasPneumatics = false;
    window.generatePneumaticSetup(cyl, 'double', { drosseln: { ext: true, ret: true } });
    const v2 = factoryObjects.find(o => o.type === 'valve_pneu' && o.targetCylinderId === 'cyl1');
    const e2 = factoryObjects.find(o => o.type === 'throttle' && o.targetCylinderId === 'cyl1' && o.role === 'ext');
    R.push(['Neuaufbau: ext an Ventil 4 / Zylinder 2', !!(v2 && e2 && hat(v2, '4', e2, '2') && hat(e2, '1', cyl, '2')), '']);
    return R;
  },
  'Fehlersuche: versteckte Fehler wirken und lassen sich finden': () => {
    const F = Fluidplan, R = [];
    const bau = () => {
      F._leeren();
      const q = F.setzen('quelle', 0, 300);
      const s = F.setzen('ventil', 0, 150, { wege: '5/2', links: 'hebel' }, '1V1');
      const z = F.setzen('zyl_dw', 0, -100, { sensV: 'FP_B2' }, '1A1');
      F.verbinden(q, '1', s, '1'); F.verbinden(s, '4', z, 'K'); F.verbinden(s, '2', z, 'S');
      return { q, s, z };
    };
    const lauf = (fehler) => {
      const { q, s, z } = bau();
      const p = F.exportieren();
      if (fehler) { const key = fehler[0] === 'L' ? 'L:' + p.leitungen.find(l => l.b.t === z && l.b.p === 'K').id : ({ q, s, z })[fehler[0]]; p.fehler = { [key]: fehler[1] }; F.importieren(p); }
      F._neu(); F._schritt(0.5); F.druecken(s, 'L', true); F._schritt(2);
      return { x: F.zustand().teile[z].anteil, b2: spsState.FP_B2, p: F.zustand().teile[z].p.K, ids: { q, s, z } };
    };
    const ok = lauf(null);
    R.push(['ohne Fehler fährt aus', ok.x > 0.98, ok.x]);
    R.push(['Ventil klemmt: bleibt hinten', lauf(['s', 'klemmt']).x < 0.02, '']);
    R.push(['Leitung geknickt: bleibt hinten', lauf(['L', 'zu']).x < 0.02, '']);
    const dr = lauf(['q', 'druck']);
    R.push(['Versorgungsdruck niedrig: nur ~2,5 bar am Zylinder', dr.p < 2.7 && dr.p > 2.2, dr.p]);
    const se = lauf(['z', 'sensor']);
    R.push(['Sensor defekt: fährt aus, meldet aber nicht', se.x > 0.98 && se.b2 === false, String(se.b2)]);
    // Befund: falsche Meldung, dann richtige
    const { s, z } = lauf(['s', 'klemmt']).ids;
    const p = F.exportieren(); p.fehlersuche = true; F.importieren(p);
    R.push(['Anzahl 1, noch nicht gefunden', F.fehlerAnzahl() === 1 && !F.fehlerGefunden(), '']);
    F.verdacht(z); let b = F.befundPruefen();
    R.push(['falsche Meldung erkannt', b.falsch === 1 && b.offen === 1, JSON.stringify(b)]);
    F.verdacht(s); b = F.befundPruefen();
    R.push(['richtige Meldung: gefunden und instandgesetzt', b.treffer === 1 && b.offen === 0 && F.fehlerGefunden(), JSON.stringify(b)]);
    F._neu(); F._schritt(0.5); F.druecken(s, 'L', true); F._schritt(2);
    R.push(['nach der Instandsetzung fährt er aus', F.zustand().teile[z].anteil > 0.98, F.zustand().teile[z].anteil]);
    // Manometer anstecken: Leitung zum Kolbenraum
    const lk = F.plan().leitungen.find(l => l.b.t === z && l.b.p === 'K');
    F.messen(lk.id, 0, 0);
    const mw = F.messwerte()[0];
    R.push(['Manometer am Kolbenraum zeigt ~6 bar', mw > 5.8 && mw < 6.1, mw]);
    R.push(['Aufgabenbedingung fluid_fehler erfüllt', _checkCondition({ type: 'fluid_fehler' }) === true, '']);
    return R;
  },
  'Beispielpläne laden und sind vollständig verbunden': () => {
    const F = Fluidplan, R = [];
    F.beispiele().forEach((n, i) => { F.beispielLaden(i); const p = F.pruefen(); R.push([n, p.length === 0 && F.plan().teile.length > 1, JSON.stringify(p).slice(0, 120)]); });
    // Pendelhub läuft
    F.beispielLaden(F.beispiele().findIndex(n => /Pendelhub/.test(n)));
    const pl = F.plan(), z = pl.teile.find(t => t.typ === 'zyl_dw'), h = pl.teile.find(t => t.o.links === 'hebel');
    F._neu(); F._schritt(0.5); F.druecken(h.id, 'L', true);
    let max = 0, min = 1; for (let i = 0; i < 40; i++) { F._schritt(0.1); const a = F.zustand().teile[z.id].anteil; max = Math.max(max, a); if (i > 20) min = Math.min(min, a); }
    R.push(['Beispiel Pendelhub pendelt', max > 0.95 && min < 0.05, `${max.toFixed(2)}/${min.toFixed(2)}`]);
    return R;
  },
  'Export / Import und Speichern in der Anlage': () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 300);
    const z = F.setzen('zyl_ew', 0, 0, {}, '1A1');
    F.verbinden(q, '1', z, 'K');
    const ex = F.exportieren();
    R.push(['Export enthält 2 Teile, 1 Leitung', ex && ex.teile.length === 2 && ex.leitungen.length === 1, JSON.stringify(ex && [ex.teile.length, ex.leitungen.length])]);
    const st = getFactoryStateObj();
    R.push(['Anlagenzustand trägt den Plan', st.fluidplan && st.fluidplan.teile.length === 2, '']);
    F.importieren(null);
    R.push(['Leeren', F.exportieren() === null, '']);
    F.importieren(st.fluidplan);
    R.push(['Wieder einlesen', F.exportieren().teile.length === 2, '']);
    return R;
  }
};

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisFluidplan', '1'); localStorage.removeItem('logikFactoryState'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html`);
  await page.waitForFunction(() => window.Fluidplan, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  let gut = 0, schlecht = 0;
  for (const [name, fn] of Object.entries(FAELLE)) {
    const erg = await page.evaluate(`(() => { Fluidplan._leeren(); try { return (${fn.toString()})(); } catch (e) { return [['Ausnahme', false, String(e && e.stack || e)]]; } })()`);
    console.log('\n' + name);
    for (const [n, ok, d] of erg) { console.log(`  ${ok ? '✓' : '✗'} ${n}${d !== '' && d != null ? '  (' + (typeof d === 'number' ? d.toFixed(3) : d) + ')' : ''}`); ok ? gut++ : schlecht++; }
  }
  // Panel im Arbeitsbereich und abgekoppeltes Fenster (echter Browser-Popup)
  {
    console.log('\nPanel und abgekoppeltes Fenster');
    const R = [];
    const ok = (n, b, d) => { R.push([n, !!b, d == null ? '' : d]); };
    await page.evaluate(() => { Fluidplan._leeren(); window.loadExample('code'); });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { Fluidplan.ausAnlage(); Fluidplan.verbinden2D(true); });
    await page.evaluate(() => { try { if (typeof closeHub === 'function') closeHub(); } catch (e) {} Fluidplan.umschalten(); });
    await page.waitForTimeout(800);
    const a = await page.evaluate(() => { const p = document.getElementById('fluid-wrapper'), f = document.getElementById('fp-fenster');
      return { im: !!f && f.parentElement === p, sichtbar: p.offsetWidth > 100, teile: f ? f.querySelectorAll('.fp-svg [data-t]').length : 0, knopf: document.getElementById('btn-view-fluid').classList.contains('active') }; });
    ok('Fluidplan ist ein Panel im Arbeitsbereich', a.im && a.sichtbar, JSON.stringify(a));
    ok('Ansicht-Knopf zeigt das Panel als aktiv', a.knopf);
    ok('Plan wird im Panel gezeichnet', a.teile >= 5, a.teile);
    const [pop] = await Promise.all([page.context().waitForEvent('page'), page.evaluate(() => Fluidplan._abkoppeln())]);
    pop.on('pageerror', e => fehler.push('Abgekoppelt: ' + e));
    await pop.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(1200);
    const b = await pop.evaluate(() => { const f = document.getElementById('fp-fenster'), svg = f && f.querySelector('.fp-svg'), r = svg && svg.getBoundingClientRect();
      return { da: !!f, css: !!document.getElementById('fp-css'), breite: r ? Math.round(r.width) : 0, teile: f ? f.querySelectorAll('.fp-svg [data-t]').length : 0, abk: (document.getElementById('fp-abk') || {}).style ? document.getElementById('fp-abk').style.display : '?' }; });
    ok('abgekoppelt: Plan steht im eigenen Fenster mit Stil', b.da && b.css, JSON.stringify(b));
    ok('abgekoppelt: gezeichnet und füllt das Fenster', b.teile >= 5 && b.breite > 700, b.teile + ' Teile, ' + b.breite + ' px');
    ok('abgekoppelt: Knopf „Abkoppeln“ ausgeblendet', b.abk === 'none', b.abk);
    ok('Ansicht-Knopf zeigt „abgekoppelt“', await page.evaluate(() => document.getElementById('btn-view-fluid').classList.contains('detached')));
    // Simulation im Hauptfenster: Planzylinder und Darstellung im Popup laufen mit
    await page.evaluate(() => { const c = document.getElementById('code'); c.value = 'ZYL_AUS := START\nZYL_EIN := STOP'; c.dispatchEvent(new Event('input', { bubbles: true })); window.toggleSimulation(); });
    await page.waitForTimeout(600);
    const h0 = await pop.evaluate(() => document.querySelector('#fp-fenster .fp-welt').innerHTML);
    await page.evaluate(() => { spsState.START = true; }); await page.waitForTimeout(1500); await page.evaluate(() => { spsState.START = false; });
    const c = await pop.evaluate(() => ({ h: document.querySelector('#fp-fenster .fp-welt').innerHTML, sim: document.getElementById('fp-sim').textContent, x: Object.values(opener.Fluidplan.zustand().teile).filter(t => t.anteil != null).map(t => t.anteil) }));
    const ext = await page.evaluate(() => factoryObjects.find(o => o.id === 'cyl1').extension);
    ok('abgekoppelt: Simulation bewegt Plan- und 2D-Zylinder', c.x[0] > 0.98 && ext > 98, c.x[0].toFixed(2) + ' / ' + ext.toFixed(1));
    ok('abgekoppelt: Darstellung läuft mit (Drücke, Kolben)', c.h !== h0);
    ok('abgekoppelt: Sim-Knopf zeigt den Lauf', /Stopp/.test(c.sim), c.sim);
    await page.evaluate(() => window.toggleSimulation());
    await page.waitForTimeout(300);
    // Bedienen im Popup: Drossel der Ausfahrbewegung anklicken und mit Entf löschen → 2D-Drossel weg
    const drvId = await page.evaluate(() => { const p = Fluidplan.plan(); const z = p.teile.find(t => t.typ === 'zyl_dw'); const l = p.leitungen.find(l => (l.a.t === z.id && l.a.p === 'S') || (l.b.t === z.id && l.b.p === 'S')); const o = l.a.t === z.id ? l.b.t : l.a.t; return p.teile.find(t => t.id === o && t.typ === 'drv') ? o : null; });
    const bb = drvId && await (await pop.$('#fp-fenster .fp-svg [data-t="' + drvId + '"]')).boundingBox();
    if (bb) { await pop.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await pop.keyboard.press('Delete'); await page.waitForTimeout(600); }
    const d = await page.evaluate((id) => ({ imPlan: Fluidplan.plan().teile.some(t => t.id === id), th2d: !!factoryObjects.find(o => o.type === 'throttle' && o.targetCylinderId === 'cyl1' && o.role === 'ext') }), drvId);
    ok('abgekoppelt: Anklicken + Entf löscht die Drossel im Plan', drvId && !d.imPlan, drvId);
    ok('… und der Abgleich nimmt sie aus der 2D-Anlage', !d.th2d);
    // Zurück ins Hauptfenster
    await pop.evaluate(() => document.querySelector('.detached-cell[data-panel-id="fluid-wrapper"] .detached-cell-reattach-btn').click());
    await page.waitForTimeout(800);
    await page.evaluate(() => { try { if (typeof closeHub === 'function') closeHub(); } catch (e) {} Fluidplan.umschalten(); }); await page.waitForTimeout(800);
    const e = await page.evaluate(() => { const p = document.getElementById('fluid-wrapper'), f = document.getElementById('fp-fenster'); return { im: !!f && f.parentElement === p, w: p.offsetWidth, teile: f.querySelectorAll('.fp-svg [data-t]').length, abk: document.getElementById('fp-abk').style.display }; });
    ok('zurückgeholt: wieder Panel im Hauptfenster und gezeichnet', e.im && e.w > 100 && e.teile >= 4, JSON.stringify(e));
    ok('zurückgeholt: Knopf „Abkoppeln“ wieder da', e.abk === '', e.abk);
    await page.evaluate(() => { Fluidplan.verbinden2D(false); Fluidplan._leeren(); });
    for (const [n, g, dd] of R) { console.log(`  ${g ? '✓' : '✗'} ${n}${dd !== '' && dd != null ? '  (' + dd + ')' : ''}`); g ? gut++ : schlecht++; }
  }
  if (fehler.length) { console.log('\nSeitenfehler:\n  ' + fehler.join('\n  ')); schlecht += fehler.length; }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
