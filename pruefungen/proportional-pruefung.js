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
  'Kennlinie: Soll-Kennlinie, Aufnahme mit Hysterese, Diagramm': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fluid-wrapper'), offen = !!fw && fw.offsetWidth > 100;
    if (!offen) F.umschalten();
    // Prüfstand: Pumpe mit 35 bar, A frei in den Tank
    const agg = F.setzen('aggregat', 0, 300, { q: 100, p: 35 });
    const v = F.setzen('ventil', 0, 100, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'Y', qn: 40, ueber: 10, hyst: 4, tau: 20 }, '-QMA1');
    const tk = F.setzen('tank', 200, 300), st = F.setzen('stopfen', 100, -50, { hyd: true });
    F.verbinden(agg, 'P', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', tk, '1'); F.verbinden(v, '2', st, '1');
    let k = F.kennlinie(v);
    const bei = (l, u) => l.find(p => p[0] === u)[1];
    R.push(['Soll-Kennlinie: 5 V = 0, 10 V = +40, 0 V = −40 l/min', bei(k.soll, 50) === 0 && Math.abs(bei(k.soll, 100) - 40) < 1e-6 && Math.abs(bei(k.soll, 0) + 40) < 1e-6, JSON.stringify([bei(k.soll, 0), bei(k.soll, 50), bei(k.soll, 100)])]);
    R.push(['… Totzone durch Überdeckung: 5,5 V = 0', bei(k.soll, 55) === 0 && bei(k.soll, 60) > 0, bei(k.soll, 60).toFixed(2)]);
    R.push(['noch nichts aufgenommen', !F.kennlinieAufgenommen() && k.mess.length === 0 && !k.fertig, '']);
    // Aufnahme: 20 s Rampe 0 → 10 V → 0 V
    spsState.Y = 50; F._neu(); F._schritt(0.5);
    R.push(['Aufnahme startet', F.kennlinieAufnehmen(v, 20) === true && F.kennlinie(v).laeuft, '']);
    F._schritt(10);
    R.push(['in der Mitte der Rampe bei 10 V und vollem Durchfluss', Math.abs(F.zustand().teile[v].q - 40) < 3 && F.kennlinie(v).laeuft, F.zustand().teile[v].q.toFixed(1)]);
    F._schritt(10.2);
    k = F.kennlinie(v);
    R.push(['nach 20 s fertig, über 500 Messpunkte', k.fertig && !k.laeuft && k.mess.length > 500, k.mess.length]);
    R.push(['Bedingung „Kennlinie aufgenommen“ erfüllt (auch mit Kennzeichen)', F.kennlinieAufgenommen() && F.kennlinieAufgenommen('-QMA1') && !F.kennlinieAufgenommen('-QMA9'), '']);
    // Hysterese: bei 7,5 V liegt der Rückweg über dem Hinweg
    const halb = k.mess.length / 2, hin = k.mess.slice(0, halb).reduce((a, p) => Math.abs(p[0] - 75) < Math.abs(a[0] - 75) ? p : a), rueck = k.mess.slice(halb).reduce((a, p) => Math.abs(p[0] - 75) < Math.abs(a[0] - 75) ? p : a);
    R.push(['Hysterese sichtbar: Rückweg bei 7,5 V über dem Hinweg', rueck[1] - hin[1] > 1.5 && rueck[1] - hin[1] < 6, `hin ${hin[1].toFixed(1)}, zurück ${rueck[1].toFixed(1)} l/min`]);
    R.push(['Sättigung: nie über Nenndurchfluss', Math.max(...k.mess.map(p => p[1])) < 42, Math.max(...k.mess.map(p => p[1])).toFixed(1)]);
    R.push(['nach der Aufnahme gilt wieder der SPS-Sollwert', (F._schritt(0.5), Math.abs(F.zustand().teile[v].s) < 0.05), F.zustand().teile[v].s.toFixed(3)]);
    // Diagramm
    F._kennZeigen(v); await warte(300);
    const d = document.getElementById('fp-diag');
    R.push(['Diagramm zeigt Soll-Kennlinie, aufgenommene Kurve und Arbeitspunkt', !!d && d.classList.contains('offen') && !!d.querySelector('.fp-kenn-soll') && !!d.querySelector('.fp-kenn-mess') && !!d.querySelector('.fp-kenn-punkt'), '']);
    R.push(['Knopf „Kennlinie aufnehmen“ sichtbar', !!document.getElementById('fp-d-auf') && document.getElementById('fp-d-auf').style.display !== 'none', '']);
    // Druckventil: Kennlinie p über U
    const dr = F.setzen('druckregel', 500, 100, { prop: true, varS: 'Y', von: 0, bis: 6, hyst: 0, tau: 50 }, '-QN1');
    const kd = F.kennlinie(dr);
    R.push(['Druckregelventil: Soll-Kennlinie 0 … 6 bar', bei(kd.soll, 0) === 0 && bei(kd.soll, 50) === 3 && bei(kd.soll, 100) === 6 && kd.info.einheit === 'bar', '']);
    // Oszilloskop-Kanäle
    const m = window._fpPropMess && (() => { const alt = window.isSimulationActive; return window._fpPropMess(); })();
    R.push(['Messwerte für das Oszilloskop (läuft nur in der Simulation)', m === null || (m && typeof m === 'object'), JSON.stringify(m)]);
    d.classList.remove('offen');
    F._leeren(); if (!offen) F.umschalten();
    return R;
  },
  'Verstärkerkarte: Ströme, Sprungstrom, Maximalstrom, Rampe, Dither': () => {
    const F = Fluidplan, R = [];
    const agg = F.setzen('aggregat', 0, 300, { q: 100, p: 35 });
    const v = F.setzen('ventil', 0, 100, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'Y', qn: 40, ueber: 10, hyst: 0, tau: 20, nullS: 50, elektronik: 'karte' });
    const tk = F.setzen('tank', 200, 300), st = F.setzen('stopfen', 100, -50, { hyd: true });
    F.verbinden(agg, 'P', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', tk, '1'); F.verbinden(v, '2', st, '1');
    const Q = (y, t) => { spsState.Y = y; F._schritt(t || 0.8); return F.zustand().teile[v]; };
    const K = F.propKarten();
    R.push(['Karte ist gemeldet, Lieferzustand 0 / 0 / 800 mA', K.length === 1 && K[0].id === v && K[0].karte.grund === 0 && K[0].karte.sprung === 0 && K[0].karte.max === 800, JSON.stringify(K[0] && K[0].karte)]);
    F._neu(); F._schritt(0.3);
    let z = Q(100);
    R.push(['10 V: Magnet A 800 mA, Magnet B stromlos, Schieber voll', Math.abs(z.iA - 800) < 1 && z.iB < 1 && z.s > 0.98, `${z.iA.toFixed(0)}/${z.iB.toFixed(0)} mA, s ${z.s.toFixed(2)}`]);
    z = Q(0);
    R.push(['0 V: Magnet B 800 mA', Math.abs(z.iB - 800) < 1 && z.iA < 1 && z.s < -0.98, `${z.iA.toFixed(0)}/${z.iB.toFixed(0)} mA`]);
    // ohne Sprungstrom: 5,4 V liegt in der Überdeckung (10 %), kein Durchfluss
    z = Q(50, 0.5); z = Q(54);
    R.push(['ohne Sprungstrom: 5,4 V bleibt in der Überdeckung', z.q < 0.2 && Math.abs(z.iA - 64) < 2, `Q ${z.q.toFixed(2)}, IA ${z.iA.toFixed(0)} mA`]);
    // Sprungstrom 80 mA = 10 % vom Nennstrom: überspringt die Überdeckung
    R.push(['Sprungstrom einstellen', F.propKarteSetzen(v, 'sprung', 80) === 80, '']);
    z = Q(50, 0.5); z = Q(54);
    R.push(['mit Sprungstrom 80 mA: 5,4 V gibt schon Durchfluss', z.q > 1 && z.iA > 135 && z.iA < 145, `Q ${z.q.toFixed(2)}, IA ${z.iA.toFixed(0)} mA`]);
    Q(100); F.propKarteSetzen(v, 'sprung', 80);
    R.push(['Einstellen setzt die laufende Simulation nicht zurück', F.zustand().teile[v].s > 0.9, F.zustand().teile[v].s.toFixed(2)]);
    // Grundstrom fließt in beiden Magneten
    F.propKarteSetzen(v, 'grund', 100);
    z = Q(50, 0.5);
    R.push(['Grundstrom 100 mA: bei 5 V in beiden Magneten, Schieber in der Mitte', Math.abs(z.iA - 100) < 1 && Math.abs(z.iB - 100) < 1 && Math.abs(z.s) < 0.01, `${z.iA.toFixed(0)}/${z.iB.toFixed(0)} mA`]);
    // Maximalstrom begrenzt den Hub
    F.propKarteSetzen(v, 'max', 500);
    z = Q(100);
    R.push(['Maximalstrom 500 mA: Schieber nur halb (400 mA Unterschied)', Math.abs(z.iA - 500) < 1 && Math.abs(z.s - 0.5) < 0.03, `IA ${z.iA.toFixed(0)}, s ${z.s.toFixed(2)}`]);
    R.push(['Grenzen der Einsteller greifen', F.propKarteSetzen(v, 'max', 5000) === 1000 && F.propKarteSetzen(v, 'grund', -5) === 0, '']);
    // Rampe: 2 s für 0 → 10 V
    F.propKarteSetzen(v, 'max', 800); F.propKarteSetzen(v, 'sprung', 0); F.propKarteSetzen(v, 'rampeAuf', 2); F.propKarteSetzen(v, 'rampeAb', 0);
    z = Q(50, 0.5); z = Q(100, 1);
    R.push(['Rampe auf 2 s: nach 1 s erst halber Sollwert', Math.abs(z.w - 0.5) < 0.05 && Math.abs(z.iA - 400) < 40, `w ${z.w.toFixed(2)}, IA ${z.iA.toFixed(0)}`]);
    z = Q(100, 1.3);
    R.push(['… nach 2 s voll', z.w > 0.99 && z.s > 0.95, `w ${z.w.toFixed(2)}`]);
    z = Q(50, 0.2);
    R.push(['Rampe ab 0 s: sofort zurück', Math.abs(z.w) < 0.01 && Math.abs(z.s) < 0.02, `w ${z.w.toFixed(2)}, s ${z.s.toFixed(3)}`]);
    const live = F.propKarteLive(v);
    R.push(['Live-Werte für den Steckaufbau', live && Math.abs(live.w1) < 0.1 && live.karte.rampeAuf === 2, JSON.stringify(live)]);
    // Dither: ohne Dither dreifache Hysterese
    F.propKarteSetzen(v, 'rampeAuf', 0);
    F.aendern(v, { hyst: 4, ueber: 0 }); F._neu(); F._schritt(0.3);
    const breite = () => { Q(0, 0.6); const auf = Q(75).s; Q(100, 0.6); const ab = Q(75).s; return ab - auf; };
    const mit = breite();
    F.propKarteSetzen(v, 'dither', 0);
    const ohne = breite();
    R.push(['Dither 100 %: Hysterese wie eingestellt (4 %)', Math.abs(mit - 0.08) < 0.02, mit.toFixed(3)]);
    R.push(['Dither 0 %: Hysterese dreimal so groß', Math.abs(ohne - 0.24) < 0.04, ohne.toFixed(3)]);
    const o = F.plan().teile.find(x => x.id === v).o;
    R.push(['Einstellungen stehen im Plan (werden gespeichert)', o.karte && o.karte.dither === 0 && o.karte.grund === 0, JSON.stringify(o.karte)]);
    return R;
  },
  'Fehler am Proportionalventil: Sollwertleitung, Schmutz, Nullpunkt': () => {
    const F = Fluidplan, R = [];
    const bau = (extra) => {
      F._leeren();
      const agg = F.setzen('aggregat', 0, 300, { q: 100, p: 35 });
      const v = F.setzen('ventil', 0, 100, Object.assign({ hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'Y', qn: 40, ueber: 0, hyst: 2, tau: 20, nullS: 50 }, extra || {}));
      const tk = F.setzen('tank', 200, 300), st = F.setzen('stopfen', 100, -50, { hyd: true });
      F.verbinden(agg, 'P', v, '1'); F.verbinden(v, '3', agg, 'T'); F.verbinden(v, '4', tk, '1'); F.verbinden(v, '2', st, '1');
      return v;
    };
    const mitFehler = (v, f) => { const p = F.exportieren(); p.fehler = { [v]: f }; F.importieren(p); F._neu(); F._schritt(0.3); };
    const Q = (v, y, t) => { spsState.Y = y; F._schritt(t || 0.8); return F.zustand().teile[v]; };
    let v = bau();
    const liste = F._fehlerListe ? F._fehlerListe(v).map(x => x[0]).join() : '';
    R.push(['Fehlerliste des Proportionalventils', /spule/.test(liste) && /sollwert/.test(liste) && /schmutz/.test(liste) && /nullpunkt/.test(liste), liste]);
    mitFehler(v, 'sollwert');
    let z = Q(v, 100);
    R.push(['Sollwertleitung unterbrochen (eingebaut): Ventil sieht 0 V, Schieber ganz auf B', z.s < -0.95, z.s.toFixed(2)]);
    v = bau({ elektronik: 'karte' }); mitFehler(v, 'sollwert');
    z = Q(v, 100);
    R.push(['Sollwertleitung unterbrochen (Karte): W1 = 0 V, Schieber in der Mitte', Math.abs(z.s) < 0.02 && z.iA < 1, z.s.toFixed(2)]);
    v = bau(); mitFehler(v, 'nullpunkt');
    z = Q(v, 50);
    R.push(['Nullpunkt verstellt: bei 5 V fließt schon Öl', z.s > 0.1 && z.q > 3, `s ${z.s.toFixed(2)}, Q ${z.q.toFixed(1)}`]);
    v = bau(); mitFehler(v, 'schmutz');
    Q(v, 0, 0.6); const auf = Q(v, 75).s; Q(v, 100, 0.6); const ab = Q(v, 75).s;
    R.push(['Schieber verschmutzt: Hysterese deutlich größer', ab - auf > 0.15, (ab - auf).toFixed(3)]);
    return R;
  },
  'Steckaufbau: Verstärkerkarte mit Drehknöpfen und Magnetkabeln': async () => {
    const F = Fluidplan, R = [];
    const agg = F.setzen('aggregat', 0, 300, { q: 100, p: 35 });
    const v = F.setzen('ventil', 0, 100, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'YPROP', qn: 40, elektronik: 'karte' });
    const v2 = F.setzen('ventil', 300, 100, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'YZWEI', qn: 40 });
    const d = window._anaSammeln();
    const e = d.ventile.filter(x => x._fp);
    R.push(['Nur das Ventil mit Karte bekommt einen Verstärker', e.length === 1 && e[0]._fp === v && e[0].linkedVar === 'YPROP', JSON.stringify(e.map(x => x.linkedVar))]);
    // Karte zeichnen (ohne den ganzen Steckaufbau): eigenes SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    let ok = true, fehler = '';
    try { window._anaReiheTest(svg); } catch (err) { ok = false; fehler = String(err); }
    R.push(['Analog-Reihe zeichnet ohne Fehler', ok, fehler]);
    const karte = svg.querySelector('[data-festo-panel-type="ana_pv"]'), feld = svg.querySelector('[data-festo-panel-type="ana_pvm"]');
    R.push(['Verstärkerkarte und Magnetfeld sind da', !!karte && !!feld, '']);
    const txt = karte ? karte.textContent : '';
    R.push(['Sechs Einsteller beschriftet', ['Grundstrom', 'Sprungstrom', 'Maximalstrom', 'Rampe auf', 'Rampe ab', 'Dither'].every(n => txt.includes(n)), '']);
    const kabel = (window._anaKabelListe || []).filter(c => c.pvm);
    R.push(['Vier Magnetkabel (A und B, hin und zurück)', kabel.length === 4 && kabel.some(c => c.fromKey === 'PV1_A1' && c.toKey === 'PVM1_A1') && kabel.some(c => c.fromKey === 'PVM1_B2' && c.toKey === 'PV1_B2'), JSON.stringify(kabel.map(c => c.fromKey + '>' + c.toKey))]);
    // Drehknopf Sprungstrom: Klick rechts = +10 mA
    const knopf = karte ? [...karte.querySelectorAll('circle')].filter(c => c.querySelector('title') && /^Sprungstrom/.test(c.querySelector('title').textContent))[0] : null;
    if (knopf) { const b = knopf.getBoundingClientRect(); knopf.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + b.width * 0.8, clientY: b.top + b.height / 2 })); }
    const k = F.propKarten()[0].karte;
    R.push(['Klick rechts am Knopf Sprungstrom: +10 mA im Plan', !!knopf && k.sprung === 10, JSON.stringify(k)]);
    svg.remove();
    return R;
  },
  '2D-Anlage: Proportional-Wegeventil in vier Darstellungen, Schieber stetig, Abgleich': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren(); window._fpKeinAutoVerbinden = false;
    const q = F.setzen('quelle', 0, 400);
    const v = F.setzen('ventil', 0, 200, { wege: '5/3', links: 'prop', rechts: 'prop', varS: 'YP', qn: 200 });
    const z = F.setzen('zyl_dw', 0, 0, {});
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    F.verbinden2D(true); await warte(1200);
    const o2 = () => factoryObjects.find(x => x.id === F.plan().teile.find(t => t.id === v).o.anlage);
    let o = o2();
    R.push(['Planventil steht in der 2D-Anlage als Proportional-Wegeventil', !!o && o.type === 'pneu_fp' && o.pneu.fp.o.links === 'prop' && o.pneu.fp.o.varS === 'YP', o ? JSON.stringify(o.pneu.fp.o).slice(0, 120) : 'fehlt']);
    const zy = factoryObjects.find(x => x.type === 'zylinder_double');
    const ta = document.getElementById('code'); ta.value = 'YP := 62'; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(500);
    if (!isSimulationActive) toggleSimulation();
    await warte(900);
    const s = F.zustand().teile[v].s;
    R.push(['Simulation: Schieber steht stetig bei 24 %', Math.abs(s - 0.24) < 0.04, s.toFixed(3)]);
    const weg = () => {
      const e = o2().el, b = e.querySelector('.fp-block'), sg = e.querySelector('.fp-r-schieber');
      if (sg) { const m = /translateX\(([-\d.]+)px\)/.exec(sg.style.transform || ''); return m ? +m[1] : null; }
      if (!b) return null;
      const m = /translateX\(([-\d.]+)px\)/.exec(b.style.transform || '') || /translate\(([-\d.]+)/.exec(b.getAttribute('transform') || '');
      return m ? +m[1] : null;
    };
    for (const [bild, name] of [['gehaeuse', 'Gehäuse'], ['symbol', 'Normsymbol'], ['schnitt', 'aufgeschnitten'], ['aussen', 'geschlossen']]) {
      window._fpAlleVentile(bild); await warte(350);
      const e = o2().el, w = weg();
      if (bild === 'aussen') R.push([`Darstellung „${name}“: Bild mit Proportionalmagneten`, !!e.querySelector('svg.fp-echt') && /Proportionalventil/.test(e.textContent), e.textContent.slice(0, 60)]);
      else if (bild === 'schnitt') R.push([`Darstellung „${name}“: Kolbenschieber steht zwischen den Stellungen`, w != null && Math.abs(w) > 1 && e.querySelectorAll('.fp-r-anker').length === 2, String(w)]);
      else R.push([`Darstellung „${name}“: Kastenblock um einen Teil verschoben`, w != null && w > 4 && w < 20, String(w)]);
    }
    window._fpAlleVentile('gehaeuse');
    const x1 = zy.extension; await warte(600);
    R.push(['Zylinder der 2D-Anlage fährt aus', zy.extension > x1 + 0.5 || zy.extension > 99, `${x1.toFixed(1)} → ${zy.extension.toFixed(1)}`]);
    ta.value = 'YP := 50'; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(700);
    const x2 = zy.extension; await warte(600);
    R.push(['5 V: Zylinder steht', Math.abs(zy.extension - x2) < 1.5, `${x2.toFixed(1)} → ${zy.extension.toFixed(1)}`]);
    toggleSimulation(); await warte(300);
    // Abgleich Plan → 2D und 2D → Plan
    F.aendern(v, { ueber: 4 }); await warte(900);
    R.push(['Änderung im Plan (Überdeckung) kommt in der 2D-Anlage an', o2().pneu.fp.o.ueber === 4, String(o2().pneu.fp.o.ueber)]);
    o = o2(); o.pneu.fp.o.qn = 320; o.pneu.fp.o.elektronik = 'karte'; window._fp2d.refreshLabel(o); F._geaendert2D(o); await warte(1200);
    const pt = F.plan().teile.find(t => t.id === v);
    R.push(['Änderung in der 2D-Anlage (Qn, Verstärkerkarte) kommt im Plan an', pt.o.qn === 320 && pt.o.elektronik === 'karte', JSON.stringify([pt.o.qn, pt.o.elektronik])]);
    // Rechtsklickmenü der 2D-Anlage
    const ctx = document.createElement('div'); document.body.appendChild(ctx);
    window._fp2d.contextMenu(o2(), ctx, () => {});
    const mt = ctx.textContent;
    R.push(['Rechtsklickmenü zeigt Sollwert, Nenndurchfluss, Überdeckung, Elektronik', /Sollwert/.test(mt) && /Nenndurchfluss/.test(mt) && /Überdeckung/.test(mt) && /Elektronik/.test(mt) && !/Betätigung rechts/.test(mt), mt.slice(0, 80)]);
    ctx.remove();
    // Auto-Schaltplan zeigt dasselbe Symbol
    const svgS = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), gS = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svgS.appendChild(gS); document.body.appendChild(svgS);
    try { F._schaltbild(gS, {}); } catch (e) {}
    const html = gS.innerHTML; svgS.remove();
    R.push(['Auto-Schaltplan: Symbol mit Proportionalmagneten', /fp-bet-prop/.test(String(html)), String(html).length + ' Zeichen']);
    F.verbinden2D(false); clearFactory(true); F._leeren(); window._fpKeinAutoVerbinden = true;
    return R;
  },
  'Altes Proportionalventil der 2D-Anlage zieht beim Laden um': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren();
    const ta = document.getElementById('code'); ta.value = 'YALT := 85'; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(400);
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 200; c.pistonD = 20; c.rodD = 8; c.stroke = 100; updateObjTransform(c);
    const pv = createFactoryObject('valve_prop', 'YALT'); pv.x = 300; pv.y = 300; pv.targetCylinderId = c.id; pv.ana = { vmax: 100, mitte: 50, totzone: 2, zylinder: c.id };
    saveFactoryState();
    // wie beim Öffnen einer alten Datei: Stand laden
    loadFactoryState(); await warte(1500);
    const alt = factoryObjects.filter(o => o.type === 'valve_prop').length;
    const neu = factoryObjects.find(o => o.type === 'pneu_fp' && o.pneu && o.pneu.fp && o.pneu.fp.o && o.pneu.fp.o.links === 'prop');
    R.push(['Kein altes Proportionalventil mehr in der Anlage', alt === 0, String(alt)]);
    R.push(['Dafür ein 5/3-Proportional-Wegeventil mit demselben Sollwert', !!neu && neu.pneu.fp.o.wege === '5/3' && neu.pneu.fp.o.varS === 'YALT' && neu.pneu.fp.o.ueber === 4, neu ? JSON.stringify(neu.pneu.fp.o).slice(0, 160) : 'fehlt']);
    const schl = (window.pneuConnections || []).filter(k => neu && (k.aObjId === neu.id || k.bObjId === neu.id)).length;
    R.push(['Kompressor und Schläuche zum Zylinder sind gebaut', factoryObjects.some(o => o.type === 'compressor') && schl >= 3, schl + ' Schläuche']);
    const hin = document.getElementById('prop-umzug-hinweis');
    R.push(['Hinweis beim Laden nennt das Ventil', !!hin && /YALT/.test(hin.textContent) && /neu einstellen/.test(hin.textContent), hin ? hin.textContent.slice(0, 70) : 'fehlt']);
    if (hin) hin.querySelector('button').click();
    R.push(['Hinweis lässt sich schließen', !document.getElementById('prop-umzug-hinweis'), '']);
    const zy = factoryObjects.find(o => o.type === 'zylinder_double');
    if (!isSimulationActive) toggleSimulation();
    await warte(2500);
    R.push(['Zylinder fährt jetzt mit Druckluft aus (8,5 V)', zy.extension > 30, zy.extension.toFixed(1) + ' %']);
    toggleSimulation(); await warte(200);
    R.push(['Menü Pneumatik setzt ein Proportional-Wegeventil', (() => { const n = F._neuProp2D(); return !!n && n.type === 'pneu_fp' && n.pneu.fp.o.links === 'prop' && n.pneu.fp.o.qn === 700; })(), '']);
    clearFactory(true); F._leeren();
    return R;
  },
  'Hydraulik in der 2D-Anlage: 4/3-Proportional-Wegeventil': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren();
    const alt = window._findHydTankForCylinder; window._findHydTankForCylinder = () => null;
    const ta = document.getElementById('code'); ta.value = 'YH := 50'; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(400);
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.pistonD = 40; c.rodD = 20; c.stroke = 200;
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('triple');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    c.extension = 0;
    const hv = factoryObjects.find(x => x.type === 'valve_hyd');
    // Rechtsklickmenü: Betätigung auf Proportionalmagnete
    const ctx = document.createElement('div'); document.body.appendChild(ctx);
    window._fpHydVentilMenue(hv, ctx, () => {});
    const sel = ctx.querySelector('select.fp-hv-bet');
    R.push(['Rechtsklickmenü bietet „Proportionalmagnete (stetig)“', !!sel, '']);
    if (sel) { sel.value = 'prop'; sel.dispatchEvent(new Event('change')); }
    await warte(200);
    const soll = ctx.querySelector('select.fp-hv-soll');
    if (soll) { if (![...soll.options].some(op => op.value === 'YH')) { const op = document.createElement('option'); op.value = 'YH'; op.textContent = 'YH'; soll.appendChild(op); } soll.value = 'YH'; soll.dispatchEvent(new Event('change')); }
    await warte(300);
    const k = hv.hyd && hv.hyd.ventil;
    R.push(['2D-Ventil ist jetzt 4/3 proportional mit Sollwert und 40 l/min', !!k && k.links === 'prop' && k.rechts === 'prop' && k.wege === '4/3' && k.varS === 'YH' && k.qn === 40, JSON.stringify(k)]);
    R.push(['Menü zeigt Kennwerte statt Spulen', /Nenndurchfluss/.test(ctx.textContent) && !/Spule Ausfahren/.test(ctx.textContent), '']);
    ctx.remove();
    toggleSimulation(); await warte(800);
    const x0 = c.extension; await warte(800);
    R.push(['5 V: Zylinder steht', Math.abs(c.extension - x0) < 1, `${x0.toFixed(1)} → ${c.extension.toFixed(1)}`]);
    ta.value = 'YH := 75'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(1500);
    const xa = c.extension, va = c.hydV;
    R.push(['7,5 V: Zylinder fährt aus', xa > x0 + 3, `${x0.toFixed(1)} → ${xa.toFixed(1)} %, v ${va != null ? (+va).toFixed(0) : '?'} mm/s`]);
    for (const bild of ['symbol', 'schnitt', 'aussen', 'gehaeuse']) {
      window._fpAlleVentile(bild); await warte(400);
      if (bild === 'symbol') { const b = hv.el.querySelector('svg.f2d-hyd-bild .fp-block'), m = b && /translate\(([-\d.]+)/.exec(b.getAttribute('transform') || ''); R.push(['Normsymbol: Kastenblock stetig verschoben', !!m && +m[1] > 2 && +m[1] < 38, m ? m[1] : 'kein Block']); }
      if (bild === 'schnitt') { const sg = hv.el.querySelector('.fp-r-schieber'), m = sg && /translateX\(([-\d.]+)px\)/.exec(sg.style.transform || ''); R.push(['aufgeschnitten: Kolbenschieber zwischen den Stellungen', !!m && hv.el.querySelectorAll('.fp-r-anker').length === 2, m ? m[1] : 'kein Schieber']); }
      if (bild === 'aussen') R.push(['geschlossen: Bild ohne Fehler', !!hv.el.querySelector('svg.f2d-hyd-bild'), '']);
      if (bild === 'gehaeuse') { await warte(300); R.push(['gewohntes 2D-Bild zeigt die offene Seite', hv.el.classList.contains('active-ext') || hv.el.classList.contains('active-ret'), hv.el.className.slice(0, 80)]); }
    }
    ta.value = 'YH := 30'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(1500);
    R.push(['3 V: Zylinder fährt ein', c.extension < xa + 12 && (c.hydV == null || c.hydV < 0 || c.extension < xa), `${xa.toFixed(1)} → ${c.extension.toFixed(1)} %`]);
    toggleSimulation(); await warte(200);
    window._findHydTankForCylinder = alt;
    clearFactory(true); F._leeren();
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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
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
