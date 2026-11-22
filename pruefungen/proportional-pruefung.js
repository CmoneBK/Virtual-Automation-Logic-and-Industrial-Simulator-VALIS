// Prüfung der Proportionaltechnik im Fluidplan (fluidplan.js): stetige Wegeventile
// für Pneumatik (5/3) und Hydraulik (4/3) mit Kennlinie, Überdeckung, Hysterese
// und Zeitkonstante.
//
//   node pruefungen/proportional-pruefung.js
//
// Braucht Playwright mit Chromium (require('playwright')).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
function server() {
  const typen = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(WURZEL) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': typen[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

// Jeder Fall läuft im Browser. Rückgabe: Liste von [Name, ok, Detail].
const FAELLE = {
  'Hydraulik 4/3: Durchfluss folgt der Kennlinie': () => {
    const F = Fluidplan, R = [];
    // Pumpe 100 l/min, Druckbegrenzung 35 bar: an der Steuerkante P→A liegen 35 bar, A geht frei in den Tank
    const agg = F.setzen('aggregat', 0, 300, { q: 100, p: 35 });
    const v = F.setzen('ventil', 0, 100, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'Y', qn: 40, ueber: 0, hyst: 0, tau: 20, nullS: 50, verlauf: 'linear' });
    const tk = F.setzen('tank', 200, 300), st = F.setzen('stopfen', 100, -50, { hyd: true });
    F.verbinden(agg, 'P', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', tk, '1'); F.verbinden(v, '2', st, '1');
    const Q = y => { spsState.Y = y; F._schritt(0.8); return F.zustand().teile[v]; };
    F._neu(); F._schritt(0.5);
    const m = Q(50);
    R.push(['5 V: Schieber in der Mitte, kein Durchfluss', Math.abs(m.s) < 0.01 && Math.abs(m.q) < 0.3, `s ${m.s.toFixed(3)}, Q ${m.q.toFixed(2)}`]);
    const voll = Q(100);
    R.push(['10 V: Nenndurchfluss 40 l/min bei 35 bar', Math.abs(voll.q - 40) < 3, `Q ${voll.q.toFixed(1)} l/min`]);
    const halb = Q(75);
    R.push(['7,5 V: halber Durchfluss (linear)', Math.abs(halb.q - 20) < 2, `Q ${halb.q.toFixed(1)} l/min`]);
    const viertel = Q(62.5);
    R.push(['6,25 V: ein Viertel', Math.abs(viertel.q - 10) < 1.5, `Q ${viertel.q.toFixed(1)} l/min`]);
    const zurueck = Q(0);
    R.push(['0 V: Schieber ganz auf der anderen Seite, A gesperrt gegen P', zurueck.s < -0.98 && zurueck.q < 0.3, `s ${zurueck.s.toFixed(2)}, Q ${zurueck.q.toFixed(2)}`]);
    // geknickte Kennlinie: bei 20 % Schieberweg nur 5 % Öffnung
    F.aendern(v, { verlauf: 'geknickt' }); F._neu(); F._schritt(0.3);
    const fein = Q(60), grob = Q(100);
    R.push(['geknickt: 6 V gibt nur 5 % vom Nenndurchfluss', Math.abs(fein.q - 2) < 0.6, `Q ${fein.q.toFixed(2)} l/min`]);
    R.push(['geknickt: 10 V gibt wieder den vollen Durchfluss', Math.abs(grob.q - 40) < 3, `Q ${grob.q.toFixed(1)} l/min`]);
    // halber Nenndurchfluss
    F.aendern(v, { verlauf: 'linear', qn: 20 }); F._neu(); F._schritt(0.3);
    R.push(['Nenndurchfluss 20 l/min eingestellt', Math.abs(Q(100).q - 20) < 2, '']);
    return R;
  },
  'Überdeckung: Totzone um die Mitte': () => {
    const F = Fluidplan, R = [];
    const agg = F.setzen('aggregat', 0, 300, { q: 100, p: 35 });
    const v = F.setzen('ventil', 0, 100, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'Y', qn: 40, ueber: 20, hyst: 0, tau: 20 });
    const tk = F.setzen('tank', 200, 300), st = F.setzen('stopfen', 100, -50, { hyd: true });
    F.verbinden(agg, 'P', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', tk, '1'); F.verbinden(v, '2', st, '1');
    const Q = y => { spsState.Y = y; F._schritt(0.8); return F.zustand().teile[v]; };
    F._neu(); F._schritt(0.3);
    const a = Q(58), b = Q(60), c = Q(80), d = Q(100);
    R.push(['positive Überdeckung 20 %: bei 5,8 V noch kein Durchfluss', a.q < 0.2 && a.s > 0.1, `s ${a.s.toFixed(2)}, Q ${a.q.toFixed(2)}`]);
    R.push(['… bis 6 V (Ende der Totzone)', b.q < 0.4, `Q ${b.q.toFixed(2)}`]);
    R.push(['… dahinter linear: 8 V = halber Durchfluss', Math.abs(c.q - 20) < 2, `Q ${c.q.toFixed(1)}`]);
    R.push(['… 10 V = voller Durchfluss', Math.abs(d.q - 40) < 3, `Q ${d.q.toFixed(1)}`]);
    // negative Überdeckung: in der Mitte sind alle Kanten etwas offen → Öl fließt von P nach T (über A und B gesperrt hier: über A in den Tank)
    F.aendern(v, { ueber: -10 }); F._neu(); F._schritt(0.3);
    const n = Q(50);
    R.push(['negative Überdeckung: in der Mitte fließt Lecköl', n.q > 1 && n.auf[0] > 0.05 && n.auf[1] > 0.05, `Q ${n.q.toFixed(2)}, Öffnung ${n.auf.map(x => x.toFixed(2))}`]);
    F.aendern(v, { ueber: 0 }); F._neu(); F._schritt(0.3);
    const nu = Q(51);
    R.push(['Nullüberdeckung: schon 5,1 V öffnet', nu.q > 0.4, `Q ${nu.q.toFixed(2)}`]);
    return R;
  },
  'Hysterese und Zeitkonstante': () => {
    const F = Fluidplan, R = [];
    const agg = F.setzen('aggregat', 0, 300, { q: 100, p: 35 });
    const v = F.setzen('ventil', 0, 100, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'Y', qn: 40, ueber: 0, hyst: 6, tau: 20 });
    const tk = F.setzen('tank', 200, 300), st = F.setzen('stopfen', 100, -50, { hyd: true });
    F.verbinden(agg, 'P', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', tk, '1'); F.verbinden(v, '2', st, '1');
    const Q = y => { spsState.Y = y; F._schritt(0.8); return F.zustand().teile[v]; };
    F._neu(); F._schritt(0.3);
    const hin = Q(75); Q(100); const rueck = Q(75);
    R.push(['Hysterese 6 %: beim Zurückfahren mehr Durchfluss als beim Hinfahren', rueck.q - hin.q > 3 && rueck.q - hin.q < 7, `hin ${hin.q.toFixed(1)}, zurück ${rueck.q.toFixed(1)} l/min`]);
    R.push(['… Schieber steht um die Hysterese auseinander', Math.abs((rueck.s - hin.s) - 0.12) < 0.02, (rueck.s - hin.s).toFixed(3)]);
    // Zeitkonstante: Sprung, nach τ sind etwa 63 % erreicht
    F.aendern(v, { hyst: 0, tau: 100 }); F._neu(); F._schritt(0.3);
    spsState.Y = 50; F._schritt(0.5); spsState.Y = 100;
    F._schritt(0.096); const s1 = F.zustand().teile[v].s;
    F._schritt(0.6); const s2 = F.zustand().teile[v].s;
    R.push(['Zeitkonstante 100 ms: nach 0,1 s etwa 63 % des Wegs', s1 > 0.55 && s1 < 0.7, s1.toFixed(3)]);
    R.push(['… nach 0,7 s ganz offen', s2 > 0.99, s2.toFixed(3)]);
    F.aendern(v, { tau: 20 }); F._neu(); F._schritt(0.3);
    spsState.Y = 50; F._schritt(0.3); spsState.Y = 100; F._schritt(0.096);
    R.push(['Zeitkonstante 20 ms: nach 0,1 s praktisch offen', F.zustand().teile[v].s > 0.98, F.zustand().teile[v].s.toFixed(3)]);
    return R;
  },
  'Hydraulik: Zylinder fährt stetig, steht bei 5 V': () => {
    const F = Fluidplan, R = [];
    const agg = F.setzen('aggregat', 0, 400, { q: 20, p: 60 });
    const v = F.setzen('ventil', 0, 200, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'Y', qn: 40, ueber: 10, hyst: 0, tau: 20 }, '-QMA1');
    const z = F.setzen('zyl_dw', 0, 0, { hyd: true, d: 40, dStange: 20, hub: 200 }, '-MMA1');
    F.verbinden(agg, 'P', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    R.push(['Prüfung ohne Meldung', F.pruefen().length === 0, JSON.stringify(F.pruefen())]);
    const Z = () => F.zustand().teile[z];
    spsState.Y = 50; F._neu(); F._schritt(1.5);
    const x0 = Z().x; F._schritt(2);
    R.push(['5 V: Zylinder steht', Math.abs(Z().x - x0) < 0.3 && Math.abs(Z().v) < 0.5, `Δx ${(Z().x - x0).toFixed(2)} mm`]);
    // immer von hinten: einfahren, anhalten, Sollwert geben, nach 0,1 s über 0,2 s messen
    const tempo = y => { spsState.Y = 0; F._schritt(3); spsState.Y = 50; F._schritt(0.3); spsState.Y = y; F._schritt(0.1); const a = Z().x; F._schritt(0.2); return (Z().x - a) / 0.2; };
    const v60 = tempo(62), v70 = tempo(70);
    spsState.Y = 70; F._schritt(0.3);
    R.push(['6,2 V: fährt langsam aus', v60 > 1 && v60 < v70, v60.toFixed(1) + ' mm/s']);
    R.push(['7 V: fährt schneller aus', v70 > v60 * 1.5, v70.toFixed(1) + ' mm/s']);
    spsState.Y = 50; F._schritt(0.5); const xs = Z().x; F._schritt(1.5);
    R.push(['zurück auf 5 V: hält die Lage', Math.abs(Z().x - xs) < 0.5, (Z().x - xs).toFixed(2)]);
    spsState.Y = 30; F._schritt(0.1); const xr = Z().x; F._schritt(0.2); const r = (Z().x - xr) / 0.2;
    R.push(['3 V: fährt ein', r < -1, r.toFixed(1) + ' mm/s']);
    spsState.Y = 100; F._schritt(6);
    R.push(['10 V: fährt ganz aus', Z().anteil > 0.98, Z().anteil.toFixed(3)]);
    spsState.Y = 0; F._schritt(6);
    R.push(['0 V: fährt ganz ein', Z().anteil < 0.02, Z().anteil.toFixed(3)]);
    return R;
  },
  'Pneumatik 5/3: Zylinder fährt stetig, steht bei 5 V': () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 400);
    const v = F.setzen('ventil', 0, 200, { wege: '5/3', links: 'prop', rechts: 'prop', varS: 'Y', qn: 100, ueber: 10, hyst: 0, tau: 20 }, '-QM1');
    const z = F.setzen('zyl_dw', 0, 0, { d: 32, dStange: 12, hub: 200 }, '-MM1');
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    R.push(['Prüfung ohne Meldung', F.pruefen().length === 0, JSON.stringify(F.pruefen())]);
    const Z = () => F.zustand().teile[z], V = () => F.zustand().teile[v];
    spsState.Y = 50; F._neu(); F._schritt(1.5);
    R.push(['5 V: Zylinder bleibt hinten, Ventil gesperrt', Z().anteil < 0.02 && V().auf[0] === 0 && V().auf[1] === 0, Z().anteil.toFixed(3)]);
    const tempo = y => { spsState.Y = 0; F._schritt(2); spsState.Y = 50; F._schritt(0.3); spsState.Y = y; F._schritt(0.1); const a = Z().x; F._schritt(0.1); return (Z().x - a) / 0.1; };
    const v6 = tempo(57), v8 = tempo(80);
    R.push(['5,7 V: fährt langsam aus', v6 > 1, v6.toFixed(1) + ' mm/s']);
    R.push(['8 V: fährt deutlich schneller', v8 > v6 * 2, v8.toFixed(1) + ' mm/s']);
    spsState.Y = 100; F._schritt(3);
    R.push(['10 V: ganz ausgefahren, Kolbenseite auf Netzdruck', Z().anteil > 0.98 && Z().p.K > 5.5, `${Z().anteil.toFixed(2)}, pK ${Z().p.K} bar`]);
    spsState.Y = 0; F._schritt(3);
    R.push(['0 V: ganz eingefahren', Z().anteil < 0.02, Z().anteil.toFixed(3)]);
    // In der Mitte anhalten: Luft federt, aber der Kolben bleibt in der Nähe
    spsState.Y = 65; F._schritt(0.25); spsState.Y = 50; F._schritt(1.5);
    const xm = Z().x; F._schritt(1.5);
    R.push(['unterwegs auf 5 V: bleibt stehen (Mitte gesperrt)', xm > 5 && xm < 195 && Math.abs(Z().x - xm) < 2, `x ${xm.toFixed(1)} mm, Δ ${(Z().x - xm).toFixed(2)}`]);
    // Leitwert folgt der Kennlinie
    spsState.Y = 77.5; F._schritt(0.5);
    R.push(['Öffnung bei 7,75 V = 50 % (Überdeckung 10 %)', Math.abs(V().auf[0] - 0.5) < 0.02, V().auf[0].toFixed(3)]);
    return R;
  },
  'Proportional-Druckregelventil (Pneumatik): Druck folgt dem Sollwert': () => {
    const F = Fluidplan, R = [];
    const q = F.setzen('quelle', 0, 400, { p: 7 });
    const dr = F.setzen('druckregel', 0, 250, { prop: true, varS: 'Y', von: 0, bis: 6, hyst: 0, tau: 50 }, '-QN1');
    const z = F.setzen('zyl_ew', 0, 0, { d: 32, hub: 50 }, '-MM1');
    const m = F.setzen('manometer', 100, 150);
    F.verbinden(q, '1', dr, '1'); F.verbinden(dr, '2', z, 'K'); F.verbinden(dr, '2', m, '1');
    R.push(['Prüfung ohne Meldung', F.pruefen().length === 0, JSON.stringify(F.pruefen())]);
    const P = y => { spsState.Y = y; F._schritt(2); return F.zustand().teile[dr]; };
    F._neu();
    const p0 = P(0), p5 = P(50), p10 = P(100), p3 = P(30);
    R.push(['0 V: kein Druck am Ausgang', p0.p['2'] < 0.2, p0.p['2']]);
    R.push(['5 V: 3 bar', Math.abs(p5.p['2'] - 3) < 0.25, p5.p['2']]);
    R.push(['10 V: 6 bar', Math.abs(p10.p['2'] - 6) < 0.25, p10.p['2']]);
    R.push(['zurück auf 3 V: Ventil entlüftet auf 1,8 bar', Math.abs(p3.p['2'] - 1.8) < 0.3, p3.p['2']]);
    R.push(['Zustand meldet den Sollwert in bar', Math.abs(p3.wert - 1.8) < 0.02, p3.wert]);
    // Hysterese: gleicher Sollwert, von unten und von oben angefahren
    F.aendern(dr, { hyst: 10 }); F._neu();
    P(0); const auf = P(50).wert; P(100); const ab = P(50).wert;
    R.push(['Hysterese 10 %: von oben 0,6 bar mehr als von unten', Math.abs((ab - auf) - 0.6) < 0.05, `${auf.toFixed(2)} / ${ab.toFixed(2)} bar`]);
    // Zeitkonstante
    F.aendern(dr, { hyst: 0, tau: 500 }); F._neu(); spsState.Y = 0; F._schritt(0.5); spsState.Y = 100; F._schritt(0.496);
    const w = F.zustand().teile[dr].wert;
    R.push(['Zeitkonstante 0,5 s: nach 0,5 s etwa 63 %', w > 3.4 && w < 4.1, w.toFixed(2)]);
    // Anfangs- und Endwert
    F.aendern(dr, { tau: 50, von: 1, bis: 5 }); F._neu();
    R.push(['Bereich 1 … 5 bar: 0 V = 1 bar, 10 V = 5 bar', Math.abs(P(0).p['2'] - 1) < 0.25 && Math.abs(P(100).p['2'] - 5) < 0.25, '']);
    return R;
  },
  'Proportional-Druckbegrenzungsventil (Hydraulik): Presskraft über den Druck': () => {
    const F = Fluidplan, R = [];
    const agg = F.setzen('aggregat', 0, 500, { q: 10, p: 200 });
    const dbv = F.setzen('dbv', 150, 400, { prop: true, varS: 'Y', von: 10, bis: 110, hyst: 0, tau: 50 }, '-QNA1');
    const v = F.setzen('ventil', 0, 250, { hyd: true, wege: '4/2', links: 'magnet', rechts: 'feder', varL: 'Y1' }, '-QMA1');
    const z = F.setzen('zyl_dw', 0, 0, { hyd: true, d: 50, dStange: 25, hub: 100 }, '-MMA1');
    const tk = F.setzen('tank', 150, 500);
    F.verbinden(agg, 'P', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    F.verbinden(agg, 'P', dbv, 'P'); F.verbinden(dbv, 'T', tk, '1');
    R.push(['Prüfung ohne Meldung', F.pruefen().length === 0, JSON.stringify(F.pruefen())]);
    spsState.Y1 = true; spsState.Y = 0; F._neu(); F._schritt(6);
    const Z = () => F.zustand().teile[z], D = () => F.zustand().teile[dbv];
    R.push(['ausgefahren am Anschlag', Z().anteil > 0.98, Z().anteil.toFixed(2)]);
    const AK = Math.PI * 50 * 50 / 400;
    const P = y => { spsState.Y = y; F._schritt(1.5); return Z().p.K; };
    const a = P(0), b = P(50), c = P(100), d = P(20);
    R.push(['0 V: 10 bar am Kolben', Math.abs(a - 10) < 2.5, a.toFixed(1)]);
    R.push(['5 V: 60 bar, Presskraft etwa 118 kN · 0,1', Math.abs(b - 60) < 3, `${b.toFixed(1)} bar = ${(b * AK / 100).toFixed(1)} kN`]);
    R.push(['10 V: 110 bar', Math.abs(c - 110) < 4, c.toFixed(1)]);
    R.push(['zurück auf 2 V: Druck fällt auf 30 bar', Math.abs(d - 30) < 3, d.toFixed(1)]);
    R.push(['Ventil meldet offen und Sollwert', D().offen === true || Math.abs(D().wert - 30) < 0.5, JSON.stringify([D().offen, D().wert])]);
    return R;
  },
  'Proportional-Stromregelventil (Hydraulik): Vorschub folgt dem Sollwert, unabhängig von der Last': () => {
    const F = Fluidplan, R = [];
    const agg = F.setzen('aggregat', 0, 500, { q: 30, p: 100 });
    const sr = F.setzen('stromregel', 0, 380, { prop: true, varS: 'Y', von: 0, bis: 10, hyst: 0, tau: 50 }, '-RNA1');
    const v = F.setzen('ventil', 0, 250, { hyd: true, wege: '4/3', mitte: 'gesperrt', links: 'magnet', rechts: 'magnet', varL: 'Y1', varR: 'Y2' }, '-QMA1');
    const z = F.setzen('zyl_dw', 0, 0, { hyd: true, d: 40, dStange: 20, hub: 300, last: 0 }, '-MMA1');
    F.verbinden(agg, 'P', sr, '1'); F.verbinden(sr, '2', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    R.push(['Prüfung ohne Meldung', F.pruefen().length === 0, JSON.stringify(F.pruefen())]);
    const Z = () => F.zustand().teile[z];
    const AK = Math.PI * 40 * 40 / 400;   // cm²
    const tempo = y => { spsState.Y1 = false; spsState.Y2 = true; spsState.Y = 100; F._schritt(4); spsState.Y2 = false; spsState.Y = y; spsState.Y1 = true; F._schritt(0.5); const a = Z().x; F._schritt(0.5); return (Z().x - a) / 0.5; };
    F._neu();
    const soll = q => q * 1000 / 60 / AK * 10;   // l/min → mm/s
    const v5 = tempo(50), v10 = tempo(100), v2 = tempo(20), v0 = tempo(0);
    R.push(['5 V: 5 l/min', Math.abs(v5 - soll(5)) < soll(5) * 0.12, `${v5.toFixed(1)} mm/s (Soll ${soll(5).toFixed(1)})`]);
    R.push(['10 V: 10 l/min', Math.abs(v10 - soll(10)) < soll(10) * 0.12, `${v10.toFixed(1)} mm/s (Soll ${soll(10).toFixed(1)})`]);
    R.push(['2 V: 2 l/min', Math.abs(v2 - soll(2)) < soll(2) * 0.15, `${v2.toFixed(1)} mm/s (Soll ${soll(2).toFixed(1)})`]);
    R.push(['0 V: steht', Math.abs(v0) < 0.5, v0.toFixed(2)]);
    F.aendern(z, { last: 5000 }); F._neu();
    const vl = tempo(50);
    R.push(['mit 5 kN Last: gleiche Geschwindigkeit (Druckwaage)', Math.abs(vl - v5) < v5 * 0.1, `${vl.toFixed(1)} gegen ${v5.toFixed(1)} mm/s`]);
    // Rampe: Sollwert steigt in Stufen, Geschwindigkeit steigt mit
    F.aendern(z, { last: 0 }); F.aendern(sr, { tau: 1000, bis: 5 }); F._neu();
    spsState.Y1 = false; spsState.Y2 = true; spsState.Y = 100; F._schritt(4); spsState.Y2 = false; spsState.Y = 0; F._schritt(8); spsState.Y1 = true; spsState.Y = 100;
    F._schritt(0.2); const x0 = Z().x; F._schritt(0.2); const x1 = Z().x; F._schritt(2.6); const x2 = Z().x; F._schritt(0.3); const x3 = Z().x;
    const va = (x1 - x0) / 0.2, ve = (x3 - x2) / 0.3;
    R.push(['Zeitkonstante 1 s: fährt sanft an (Rampe)', va < ve * 0.45 && ve > 55, `${va.toFixed(0)} → ${ve.toFixed(0)} mm/s`]);
    return R;
  },
  'Druck- und Stromventile: Symbol, Umstellen, Listen': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fluid-wrapper'), offen = !!fw && fw.offsetWidth > 100;
    if (!offen) F.umschalten();
    const a = F.setzen('druckregel', 0, 0, {}), b = F.setzen('dbv', 100, 0, {}), c = F.setzen('stromregel', 200, 0, {});
    F.aendern(a, { prop: true }); F.aendern(b, { prop: true }); F.aendern(c, { prop: true });
    const T = id => F.plan().teile.find(x => x.id === id);
    R.push(['Umstellen auf proportional setzt Bereich und Kennwerte', T(a).o.bis === 6 && T(b).o.bis === 100 && T(c).o.bis === 20 && T(a).o.tau === 50, JSON.stringify([T(a).o, T(b).o, T(c).o])]);
    R.push(['Kennzeichen bleiben -QN, -QNA, -RNA', /^-QN\d/.test(T(a).bez) && /^-QNA\d/.test(T(b).bez) && /^-RNA\d/.test(T(c).bez), [T(a).bez, T(b).bez, T(c).bez].join(' ')]);
    R.push(['Prüfung meldet drei fehlende Sollwerte', F.pruefen().filter(m => /Sollwert/.test(m)).length === 3, '']);
    await warte(200);
    const n = [a, b, c].map(id => document.querySelectorAll(`svg.fp-svg .fp-teil[data-t="${id}"] .fp-bet-propw`).length);
    R.push(['Symbole zeigen den Proportionalmagneten', n.join('') === '111', n.join('/')]);
    const L = JSON.stringify(F._listen());
    R.push(['Stückliste: Proportional-Druckregelventil, -Druckbegrenzungsventil, -Stromregelventil mit Bereich', /Proportional-Druckregelventil/.test(L) && /Proportional-Druckbegrenzungsventil/.test(L) && /Proportional-Stromregelventil/.test(L) && /Q = 0 … 20 l\/min/.test(L) && /p = 5 … 100 bar/.test(L), '']);
    F.aendern(a, { prop: false });
    await warte(100);
    R.push(['Zurückstellen: wieder Feder statt Magnet', document.querySelectorAll(`svg.fp-svg .fp-teil[data-t="${a}"] .fp-bet-propw`).length === 0, '']);
    const pal = () => [...document.querySelectorAll('.fp-pal span')].map(e => e.textContent.trim());
    const wechsel = m => { const k = document.querySelector('.fp-reiter-k[data-m="' + m + '"]'); if (k) k.click(); };
    wechsel('pneu'); const pp = pal(); wechsel('hyd'); const ph = pal(); wechsel('pneu');
    R.push(['Palette kennt die fünf Proportionalventile', ['5/3 Proportional-Wegeventil', 'Proportional-Druckregelventil'].every(n => pp.includes(n)) && ['4/3 Proportional-Wegeventil', 'Proportional-Druckbegrenzungsventil', 'Proportional-Stromregelventil'].every(n => ph.includes(n)), '']);
    F._leeren(); if (!offen) F.umschalten();
    return R;
  },
  'Fehler, Symbol, Umstellen, Listen': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fluid-wrapper'), offen = !!fw && fw.offsetWidth > 100;
    if (!offen) F.umschalten();
    const q = F.setzen('quelle', 0, 400);
    const v = F.setzen('ventil', 0, 200, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'Y1' });
    const z = F.setzen('zyl_dw', 0, 0, {});
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    // Umstellen auf proportional: wird 5/3 mit beiden Seiten proportional und Standardwerten
    F.aendern(v, { links: 'prop' });
    let t = F.plan().teile.find(x => x.id === v);
    R.push(['Umstellen auf „proportional“: 5/3, beide Seiten, Kennwerte gesetzt', t.o.wege === '5/3' && t.o.rechts === 'prop' && t.o.qn === 700 && t.o.tau === 20 && t.o.ueber === 10, JSON.stringify(t.o)]);
    R.push(['Kennzeichen bleibt Wegeventil -QM', /^-QM\d+$/.test(t.bez), t.bez]);
    R.push(['Prüfung meldet fehlenden Sollwert', F.pruefen().some(m => /Sollwert/.test(m)), '']);
    F.aendern(v, { varS: 'Y' });
    R.push(['… mit Sollwert keine Meldung', F.pruefen().length === 0, JSON.stringify(F.pruefen())]);
    await warte(200);
    const g = document.querySelector(`svg.fp-svg .fp-teil[data-t="${v}"]`);
    R.push(['Symbol: drei Kästen, Parallelstriche, zwei Proportionalmagnete', !!g && g.querySelectorAll('.fp-block > rect').length === 3 && g.querySelectorAll('.fp-stetig').length === 2 && g.querySelectorAll('.fp-bet-prop').length === 2, g ? g.querySelectorAll('.fp-block > rect').length + '/' + g.querySelectorAll('.fp-stetig').length + '/' + g.querySelectorAll('.fp-bet-prop').length : 'kein Bild']);
    const txt = [...document.querySelectorAll('svg.fp-svg .fp-var')].map(e => e.textContent).join('|');
    R.push(['Sollwert steht am Ventil', /Y \(0 … 10 V\)/.test(txt), txt]);
    const L = F._listen();
    const zeile = JSON.stringify(L);
    R.push(['Stückliste nennt das Proportional-Wegeventil mit Qn', /Proportional-Wegeventil/.test(zeile) && /Qn = 700 l\/min/.test(zeile), '']);
    // Simulation: Block wandert stetig
    spsState.Y = 75; F._neu(); F._schritt(0.5);
    R.push(['Zustand meldet Schieberlage 0,5', Math.abs(F.zustand().teile[v].s - 0.5) < 0.03, F.zustand().teile[v].s.toFixed(3)]);
    // Fehler: Spule defekt → Schieber in der Mitte
    const p = F.exportieren(); p.fehler = { [v]: 'spule' }; F.importieren(p);
    spsState.Y = 100; F._neu(); F._schritt(1);
    const zz = F.zustand().teile;
    R.push(['Fehler „Magnetspule defekt“: Schieber bleibt in der Mitte', Math.abs(zz[v].s) < 0.01 && zz[z].anteil < 0.02, zz[v].s.toFixed(3)]);
    // Zurück auf Magnet: rechts wird wieder Magnet
    F.aendern(v, { links: 'magnet' });
    t = F.plan().teile.find(x => x.id === v);
    R.push(['Zurück auf Magnet: rechte Seite wird Magnet', t.o.rechts === 'magnet' && t.o.links === 'magnet', t.o.links + '/' + t.o.rechts]);
    // Palette bietet beide Proportionalventile
    F._leeren(); if (!offen) F.umschalten();
    return R;
  }
};

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(`http://localhost:${srv.address().port}/index.html`);
  await page.waitForFunction(() => !!window.Fluidplan, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} window._fpKeinAutoVerbinden = true; });
  let gut = 0, schlecht = 0;
  for (const [name, fn] of Object.entries(FAELLE)) {
    const erg = await page.evaluate(`(async () => { Fluidplan._leeren(); try { return await (${fn.toString()})(); } catch (e) { return [['Ausnahme', false, String(e && e.stack || e)]]; } })()`);
    console.log('\n' + name);
    for (const [n, ok, d] of erg) { console.log(`  ${ok ? '✓' : '✗'} ${n}${d !== '' && d != null ? '  (' + d + ')' : ''}`); ok ? gut++ : schlecht++; }
  }
  if (fehler.length) { console.log('\nSeitenfehler:\n  ' + fehler.join('\n  ')); schlecht += fehler.length; }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
