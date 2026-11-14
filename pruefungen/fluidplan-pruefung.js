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
  if (fehler.length) { console.log('\nSeitenfehler:\n  ' + fehler.join('\n  ')); schlecht += fehler.length; }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
