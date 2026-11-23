// Prüfung des Druckluftnetzes im Fluidplan (fluidplan.js): Kompressor mit
// Druckschalter, Behälter, Rohrleitung mit Druckverlust, Kugelhahn/Abgang,
// „diese Anlage“ (Kopplung an die 2D-Anlage) und der Umzug alter Stände.
//
//   node pruefungen/druckluftnetz-pruefung.js
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
  'Kompressor und Behälter: Druckschalter als Zweipunktregler': () => {
    const F = Fluidplan, R = [];
    const k = F.setzen('kompressor', 0, 100, { q: 400, pEin: 6, pAus: 7 });
    const b = F.setzen('behaelter', 120, 60, { V: 500 });
    // Abgang mit Kupplung ohne Stecker: dicht bis auf die Leckage (20 l/min je bar)
    const a = F.setzen('hahn', 260, 60, { abgang: true, leck: 120 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', a, '1');
    F._neu();
    const Z = id => F.zustand().teile[id];
    R.push(['Start: Netz steht unter Ausschaltdruck, Kompressor steht', Math.abs(Z(b).pNetz - 7) < 0.01 && !Z(k).lauf, Z(b).pNetz.toFixed(2) + ' bar']);
    // Leeren 7 → 6 bar: t = V/k · ln(7/6) mit k = 20 l/min je bar → 3,85 min
    F.netz.raffer(10);
    let tEin = null, tAus = null, t = 0;
    while (t < 600 && tAus == null) {
      F.netz.rechnen(0.1, 0.05); t += 1;
      if (tEin == null && Z(k).lauf) tEin = t;
      if (tEin != null && !Z(k).lauf) tAus = t;
    }
    R.push(['Leerzeit 7 → 6 bar wie gerechnet (231 s)', tEin != null && Math.abs(tEin - 231) < 8, tEin + ' s']);
    R.push(['Füllzeit 6 → 7 bar wie gerechnet (111 s)', tAus != null && Math.abs(tAus - tEin - 111) < 6, (tAus - tEin) + ' s']);
    F.netz.rechnen(100, 0.05);   // 1000 s weiter
    const z = Z(k);
    R.push(['Schaltspiele je Stunde wie gerechnet (10,5)', Math.abs(z.spiele - 10.5) < 0.6, z.spiele.toFixed(2) + ' /h, ' + z.schalt + '× ein']);
    R.push(['Druck bleibt zwischen den Schaltpunkten', Z(b).pNetz > 5.95 && Z(b).pNetz < 7.05, Z(b).pNetz.toFixed(2)]);
    const ed = z.laufS / z.simS;
    R.push(['Einschaltdauer rund ein Drittel', ed > 0.27 && ed < 0.38, (ed * 100).toFixed(0) + ' %']);
    // größerer Behälter: seltener
    F.netz.raffer(1);
    F.aendern(b, { V: 1000 }); F._neu(); F.netz.raffer(20); F.netz.rechnen(150, 0.05);
    R.push(['Doppelter Behälter: halb so viele Schaltspiele', Math.abs(Z(k).spiele - 5.25) < 0.4, Z(k).spiele.toFixed(2) + ' /h']);
    // engere Hysterese: häufiger
    F.netz.raffer(1);
    F.aendern(k, { pEin: 6.8 }); F._neu(); F.netz.raffer(20); F.netz.rechnen(80, 0.05);
    R.push(['Enge Hysterese (0,2 bar): deutlich mehr Schaltspiele', Z(k).spiele > 20, Z(k).spiele.toFixed(1) + ' /h']);
    F.netz.raffer(1);
    return R;
  },
  'Druckabfallprüfung und Kugelhahn': () => {
    const F = Fluidplan, R = [];
    const k = F.setzen('kompressor', 0, 100, { q: 400, pEin: 6, pAus: 7, aus: true });
    const b = F.setzen('behaelter', 120, 60, { V: 1500 });
    // 120 l/min bei 7 bar = 102,9 l/min bei 6 bar
    const a = F.setzen('hahn', 260, 60, { abgang: true, leck: 102.86 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', a, '1');
    F._neu(); F.netz.raffer(10);
    const Z = id => F.zustand().teile[id];
    F.netz.rechnen(60, 0.05);   // 10 min
    const p10 = Z(b).pNetz;
    R.push(['Kompressor aus: Druck fällt in 10 min von 7,0 auf rund 6,2 bar', Math.abs(p10 - 6.24) < 0.03, p10.toFixed(3) + ' bar']);
    R.push(['Leckage aus der Messung: Q = V · Δp / t ≈ 114 l/min', Math.abs(1500 * (7 - p10) / 10 - 114) < 5, (1500 * (7 - p10) / 10).toFixed(1)]);
    R.push(['Kompressor bleibt aus', !Z(k).lauf && Z(k).aus && Z(k).schalt === 0, '']);
    // Hahn zu: die Leckage hinter dem Hahn ist abgesperrt, der Druck hält
    F.druecken(a, 'N', true);
    R.push(['Klick schließt den Hahn', Z(a).zu === true, '']);
    F.netz.rechnen(60, 0.05);
    R.push(['Abgesperrt: Behälterdruck hält', Math.abs(Z(b).pNetz - p10) < 0.005, Z(b).pNetz.toFixed(3)]);
    R.push(['Hinter dem Hahn ist der Druck weg', Z(a).pNetz < 0.05, Z(a).pNetz.toFixed(3)]);
    // Klick auf den Kompressor schaltet ihn wieder ein
    F.druecken(k, 'N', true); F.druecken(a, 'N', true);
    F.netz.rechnen(60, 0.05);
    R.push(['Kompressor wieder ein: füllt bis zum Ausschaltdruck', Z(k).schalt >= 1 && Z(b).pNetz > 6.0, Z(b).pNetz.toFixed(2) + ' bar, ' + Z(k).schalt + '× ein']);
    F.netz.raffer(1);
    return R;
  },
  'Rohrleitung: Druckverlust nach der Näherung, Länge und Durchmesser': () => {
    const F = Fluidplan, R = [];
    const bau = (L, d) => {
      F._leeren();
      const k = F.setzen('kompressor', 0, 100, { q: 3000, pEin: 6.95, pAus: 7 });
      const b = F.setzen('behaelter', 120, 60, { V: 2000 });
      const r = F.setzen('rohr', 260, 60, { L, d });
      const a = F.setzen('hahn', 380, 60, { abgang: true, leck: 600 });
      F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', r, '1'); F.verbinden(r, '2', a, '1');
      F._neu(); F.netz.rechnen(30, 0.05);
      const T = F.zustand().teile;
      return { pB: T[b].pNetz, pA: T[a].p['1'], q: T[r].q, dp: T[r].dp, leck: T[a].qLeck };
    };
    const m = bau(100, 15);
    // unabhängig nachgerechnet: Δp = 1,6e3 · V̇^1,85 · L / (d^5 · p)
    const soll = (q, L, d, p) => 1.6e3 * Math.pow(q / 60000, 1.85) * L / (Math.pow(d / 1000, 5) * (p + 1) * 1e5) / 1e5;
    const s = soll(m.q, 100, 15, (m.pB + m.pA) / 2);
    R.push(['Am Abgang kommt weniger Druck an als am Behälter', m.pB - m.pA > 0.2, `Behälter ${m.pB.toFixed(2)}, Abgang ${m.pA.toFixed(2)} bar`]);
    R.push(['Druckverlust wie die Näherung (unabhängig gerechnet)', Math.abs((m.pB - m.pA) - s) < 0.06 * s + 0.01, `${(m.pB - m.pA).toFixed(3)} gegen ${s.toFixed(3)} bar bei ${m.q.toFixed(0)} l/min`]);
    R.push(['Anzeige an der Leitung nennt denselben Druckverlust', Math.abs(m.dp - (m.pB - m.pA)) < 0.06 * s + 0.01, m.dp.toFixed(3)]);
    R.push(['Durchfluss der Leitung = Leckage am Abgang', Math.abs(m.q - m.leck) < 0.03 * m.leck, `${m.q.toFixed(0)} / ${m.leck.toFixed(0)} l/min`]);
    const lang = bau(200, 15), dick = bau(100, 25);
    R.push(['Doppelte Länge: mehr Druckverlust', (lang.pB - lang.pA) > 1.5 * (m.pB - m.pA), (lang.pB - lang.pA).toFixed(3)]);
    R.push(['Größerer Durchmesser (25 statt 15 mm): nur noch ein Bruchteil', (dick.pB - dick.pA) < 0.12 * (m.pB - m.pA), (dick.pB - dick.pA).toFixed(4)]);
    R.push(['Umkehrung der Näherung stimmt (Δp → Durchfluss → Δp)', Math.abs(F.netz.druckverlust({ L: 80, d: 20 }, F.netz.durchfluss({ L: 80, d: 20 }, 0.3, 6.5), 6.5) - 0.3) < 1e-6, '']);
    R.push(['Volumen der Leitung: 40 m mit 25 mm innen = 19,6 l', Math.abs(F.netz.volumen({ L: 40, d: 25 }) - 19.63) < 0.02, F.netz.volumen({ L: 40, d: 25 }).toFixed(2)]);
    return R;
  },
  'Ringleitung gegen Stichleitung': () => {
    const F = Fluidplan, R = [];
    const bau = (ring) => {
      F._leeren();
      const k = F.setzen('kompressor', 0, 100, { q: 3000, pEin: 6.95, pAus: 7 });
      const b = F.setzen('behaelter', 120, 60, { V: 2000 });
      const t1 = F.setzen('knoten', 240, 60), t2 = F.setzen('knoten', 500, 60);
      const r1 = F.setzen('rohr', 360, 20, { L: 60, d: 15 });
      const a = F.setzen('hahn', 600, 60, { abgang: true, leck: 600 });
      F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', t1, 'P'); F.verbinden(t1, 'P', r1, '1'); F.verbinden(r1, '2', t2, 'P'); F.verbinden(t2, 'P', a, '1');
      let r2 = null;
      if (ring) { r2 = F.setzen('rohr', 360, 120, { L: 60, d: 15 }); F.verbinden(t1, 'P', r2, '1'); F.verbinden(r2, '2', t2, 'P'); }
      F._neu(); F.netz.rechnen(30, 0.05);
      const T = F.zustand().teile;
      return { dp: T[b].pNetz - T[a].p['1'], q1: T[r1].q, q2: r2 ? T[r2].q : 0, pA: T[a].p['1'] };
    };
    const stich = bau(false), ring = bau(true);
    R.push(['Stich: ein Weg trägt alles', stich.q1 > 500, stich.q1.toFixed(0) + ' l/min, Δp ' + stich.dp.toFixed(3) + ' bar']);
    R.push(['Ring: der Strom teilt sich auf beide Wege', Math.abs(ring.q1 - ring.q2) < 0.05 * ring.q1 && ring.q1 > 200, `${ring.q1.toFixed(0)} + ${ring.q2.toFixed(0)} l/min`]);
    // halber Strom je Weg: Δp · 0,5^1,85 ≈ 0,28
    R.push(['Ring: Druckverlust nur gut ein Viertel', ring.dp < 0.36 * stich.dp && ring.dp > 0.2 * stich.dp, `${ring.dp.toFixed(3)} gegen ${stich.dp.toFixed(3)} bar`]);
    R.push(['Ring: am Abgang kommt mehr Druck an', ring.pA > stich.pA + 0.05, `${ring.pA.toFixed(2)} gegen ${stich.pA.toFixed(2)} bar`]);
    return R;
  },
  'Sicherheitsventil, Fehler, Prüfung, Listen': () => {
    const F = Fluidplan, R = [];
    const k = F.setzen('kompressor', 0, 100, { q: 600, pEin: 11.5, pAus: 12 });
    const b = F.setzen('behaelter', 120, 60, { V: 50, pSV: 11 });
    F.verbinden(k, '1', b, '1');
    F._neu(); F.netz.rechnen(20, 0.05);
    const T = () => F.zustand().teile;
    R.push(['Sicherheitsventil hält den Behälter bei 11 bar', T()[b].pNetz <= 11.01 && T()[b].sv === true, T()[b].pNetz.toFixed(2)]);
    R.push(['Prüfung: Kompressor zählt als Druckluftquelle', !F.pruefen().some(m => /keine Druckluftquelle/.test(m)), F.pruefen().join(' | ')]);
    R.push(['Fehlerliste des Kompressors', F._fehlerListe(k).map(x => x[0]).join() === 'aus,verschleiss', '']);
    const l = F._listen();
    const txt = JSON.stringify(l);
    R.push(['Betriebsmittelliste nennt Kompressor und Behälter mit Daten', /Kompressor mit Druckschalter/.test(txt) && /Q = 600 l\/min/.test(txt) && /V = 50 l/.test(txt), '']);
    const P = F.plan().teile;
    R.push(['Kennzeichen: Kompressor -GQA, Behälter -CM', /^-GQA\d+$/.test(P.find(t => t.id === k).bez) && /^-CM\d+$/.test(P.find(t => t.id === b).bez), P.map(t => t.bez).join(' ')]);
    R.push(['Palette kennt die Netzteile', ['kompressor', 'behaelter', 'rohr', 'hahn', 'anlage'].every(t => F.typen().includes(t)), '']);
    return R;
  },
  '2D-Anlage ohne Netz: fester Druck wie bisher': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren(); await warte(300);
    const c = createFactoryObject('zylinder_double', 'Y1'); c.x = 300; c.y = 200; updateObjTransform(c);
    generatePneumaticSetup(c, 'single'); await warte(300);
    const comp = factoryObjects.find(o => o.type === 'compressor');
    R.push(['Kompressor steht in der 2D-Anlage', !!comp, '']);
    if (!isSimulationActive) toggleSimulation();
    await warte(1200);
    R.push(['Kein Netz: _pneuNetzAktiv ist aus, Kompressor zeigt den festen Druck', !_pneuNetzAktiv(comp) && comp._pNetz == null && /6 bar/.test(comp.el.querySelector('span').textContent), comp.el.querySelector('span').textContent]);
    R.push(['Kein Netzteil im Plan', !F.plan().teile.some(t => ['kompressor', 'behaelter', 'anlage'].includes(t.typ)), '']);
    toggleSimulation(); await warte(200);
    return R;
  },
  '2D-Anlage am Netz: „diese Anlage“, Leckage, Abgleich, Menü': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren(); await warte(300);
    const c = createFactoryObject('zylinder_double', 'Y1'); c.x = 300; c.y = 200; updateObjTransform(c);
    generatePneumaticSetup(c, 'single'); await warte(300);
    const comp = factoryObjects.find(o => o.type === 'compressor');
    // Häkchen „Druckluftnetz simulieren“
    F.netz.sichern(comp, false); await warte(200);
    const netz = () => F.plan().teile.filter(t => ['kompressor', 'behaelter', 'anlage', 'rohr', 'hahn'].includes(t.typ));
    const K = () => F.plan().teile.find(t => t.typ === 'kompressor'), B = () => F.plan().teile.find(t => t.typ === 'behaelter');
    R.push(['Einfaches Netz im Plan: Kompressor, Behälter, „diese Anlage“', netz().length === 3 && F.netz.aktiv() && F.netz.cfg().einfach, netz().map(t => t.typ).join()]);
    R.push(['Werte des 2D-Kompressors übernommen (6 bar, 200 l/min, 10 l, 1 bar Schaltdifferenz)', K().o.pAus === 6 && K().o.pEin === 5 && K().o.q === 200 && B().o.V === 10, JSON.stringify(K().o) + JSON.stringify(B().o)]);
    R.push(['Netzteile haben kein Gegenstück in der 2D-Anlage', factoryObjects.filter(o => o.type === 'compressor').length === 1 && !factoryObjects.some(o => o.type === 'pneu_fp' && o.pneu && o.pneu.fp && ['kompressor', 'behaelter', 'anlage'].includes(o.pneu.fp.typ)), '']);
    F.netz.setzen({ V: 12, hyst: 0.2 }); await warte(100);
    R.push(['Menü: Netzvolumen und Schaltdifferenz stellen Behälter und Druckschalter', B().o.V === 12 && Math.abs(K().o.pEin - 5.8) < 1e-9, B().o.V + ' l, ein ' + K().o.pEin]);
    // Abgleich Netzdruck und Fördermenge in beide Richtungen
    comp.pressure = 7; comp.maxFlow = 300; await warte(300);
    R.push(['2D → Plan: Netzdruck 7 bar wird Ausschaltdruck, Schaltdifferenz bleibt', K().o.pAus === 7 && Math.abs(K().o.pEin - 6.8) < 1e-9 && K().o.q === 300, JSON.stringify(K().o)]);
    F.aendern(K().id, { pAus: 6.5, q: 250 }); await warte(300);
    R.push(['Plan → 2D: Ausschaltdruck und Liefermenge am Kompressor der Anlage', comp.pressure === 6.5 && comp.maxFlow === 250, comp.pressure + ' bar, ' + comp.maxFlow + ' l/min']);
    F.aendern(K().id, { pAus: 6, pEin: 5.8, q: 200 }); await warte(300);
    // Simulation: ohne Leckage steht der Druck
    if (!isSimulationActive) toggleSimulation();
    await warte(1500);
    R.push(['Simulation: Kompressor der Anlage zeigt den Netzdruck', _pneuNetzAktiv(comp) && Math.abs(comp._pNetz - 6) < 0.05, String(comp._pNetz)]);
    // Leckage im Leitungsnetz der Anlage: 100 % = 50 l/min bei 6 bar
    comp.leakRate = 100;
    await warte(9000);
    const st = F.netz.stand();
    R.push(['Leckage: Druck pendelt zwischen den Schaltpunkten, Kompressor schaltet', st.schalt >= 2 && comp._pNetz > 5.5 && comp._pNetz < 6.05, `${st.schalt}× ein, ${comp._pNetz.toFixed(2)} bar`]);
    R.push(['Anzeige am Kompressor: Leckage, Einschaltdauer, Schaltungen', /Leckage 4\d[.,]\d l\/min · ED \d+ % · \d+× ein/.test(comp.el.querySelector('.f2d-comp-info').textContent), comp.el.querySelector('.f2d-comp-info').textContent]);
    const za = Object.values(F.zustand().teile).find(t => t.typ === 'anlage');
    R.push(['„diese Anlage“ nennt Druck und Entnahme', Math.abs(za.pNetz - comp._pNetz) < 0.1 && za.q > 30 && za.q < 60, `${za.pNetz.toFixed(2)} bar, ${za.q.toFixed(0)} l/min`]);
    // Kompressor aus: Druckabfallprüfung wie bisher
    const pVor = comp._pNetz;
    F.netz.setzen({ aus: true }); await warte(4000);
    R.push(['Kompressor aus: Druck fällt, Anzeige AUS', comp._pNetz < pVor - 0.15 && /^AUS/.test(comp.el.querySelector('.f2d-comp-info').textContent) && comp._netzAus === true, comp._pNetz.toFixed(2)]);
    F.netz.setzen({ aus: false }); comp.leakRate = 0; await warte(2500);
    R.push(['Wieder ein, dicht: Druck steht am Ausschaltdruck', Math.abs(comp._pNetz - 6) < 0.08, comp._pNetz.toFixed(2)]);
    // Zylinder nimmt Luft ab
    const vor = F.netz.stand().p;
    spsState.Y1 = true; await warte(600); spsState.Y1 = false; await warte(600); spsState.Y1 = true; await warte(600);
    R.push(['Zylinderhübe nehmen Luft aus dem Netz', F.netz.stand().p < vor - 0.005 || F.netz.stand().schalt > st.schalt, `${vor.toFixed(3)} → ${F.netz.stand().p.toFixed(3)} bar`]);
    spsState.Y1 = false;
    toggleSimulation(); await warte(300);
    R.push(['Nach dem Stopp zeigt der Kompressor wieder den Netzdruck', /6 bar/.test(comp.el.querySelector('span').textContent) && comp._pNetz == null, comp.el.querySelector('span').textContent]);
    // Häkchen aus: einfaches Netz verschwindet
    F.netz.entfernen(); await warte(200);
    R.push(['Häkchen aus: das einfache Netz ist wieder weg', netz().length === 0 && !F.netz.aktiv(), '']);
    return R;
  },
  'Leckage ohne Häkchen: Netz kommt und geht von selbst': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren(); await warte(300);
    const c = createFactoryObject('zylinder_double', 'Y1'); c.x = 300; c.y = 200; updateObjTransform(c);
    generatePneumaticSetup(c, 'single'); await warte(300);
    const comp = factoryObjects.find(o => o.type === 'compressor');
    const v = factoryObjects.find(o => o.type === 'valve_pneu');
    v.leakRate = 40; await warte(400);
    R.push(['Leckage am Ventil: einfaches Netz steht im Plan', F.netz.aktiv() && F.netz.nurLeck() && F.netz.cfg().V === 10 && F.netz.cfg().hyst === 1, JSON.stringify(F.netz.cfg())]);
    if (!isSimulationActive) toggleSimulation();
    await warte(5000);
    R.push(['Druck fällt durch die Leckage (20 l/min aus 10 l)', comp._pNetz < 5.95 && comp._pNetz >= 4.95, comp._pNetz.toFixed(2)]);
    R.push(['Das Ventil zischt', v.el.classList.contains('f2d-zischt'), '']);
    toggleSimulation(); await warte(200);
    v.leakRate = 0; await warte(400);
    R.push(['Leckage behoben: Netz ist wieder weg, fester Druck', !F.netz.aktiv() && !F.plan().teile.some(t => t.typ === 'kompressor'), '']);
    return R;
  },
  'Alter Stand mit „Druckluftnetz simulieren“ zieht um': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren(); await warte(300);
    const c = createFactoryObject('zylinder_double', 'Y1'); c.x = 300; c.y = 200; updateObjTransform(c);
    generatePneumaticSetup(c, 'single'); await warte(300);
    let comp = factoryObjects.find(o => o.type === 'compressor');
    comp.pressure = 7; comp.maxFlow = 400; comp.leakRate = 30;
    comp.pneu = { netz: true, netzV: 25, hyst: 0.5, aus: true };
    // so stand es in alten Dateien: speichern ohne Plan, dann laden
    const roh = getFactoryStateObj(); roh.fluidplan = null;
    roh.objects.forEach(o => { if (o.type === 'compressor') o.pneu = { netz: true, netzV: 25, hyst: 0.5, aus: true }; });
    localStorage.setItem('logikFactoryState', JSON.stringify(roh));
    loadFactoryState(); await warte(1500);
    comp = factoryObjects.find(o => o.type === 'compressor');
    const P = F.plan().teile, k = P.find(t => t.typ === 'kompressor'), b = P.find(t => t.typ === 'behaelter'), a = P.find(t => t.typ === 'anlage');
    R.push(['Netz steht nach dem Laden im Plan', !!k && !!b && !!a, P.map(t => t.typ).join()]);
    R.push(['Netzvolumen 25 l → Behälter', !!b && b.o.V === 25, b && b.o.V]);
    R.push(['Netzdruck 7 bar und Schaltdifferenz 0,5 bar → Druckschalter 6,5 … 7 bar', !!k && k.o.pAus === 7 && k.o.pEin === 6.5, k && JSON.stringify(k.o)]);
    R.push(['Fördervolumen 400 l/min und „Kompressor aus“ übernommen', !!k && k.o.q === 400 && k.o.aus === true, '']);
    R.push(['Alte Felder am 2D-Kompressor sind umgezogen, die Leckage bleibt', !(comp.pneu && (comp.pneu.netz || comp.pneu.netzV != null)) && comp.leakRate === 30 && !F.netz.nurLeck(), JSON.stringify(comp.pneu || {})]);
    // Druckabfallprüfung läuft wie vorher: 15 l/min · p/6 aus 25 l
    if (!isSimulationActive) toggleSimulation();
    await warte(5000);
    // dp/dt = −(15/6)·p/25 je min → nach 5 s rund 7·exp(−0,0083) = 6,94
    R.push(['Druckabfallprüfung wie vorher (Kompressor aus, Druck fällt langsam)', comp._pNetz < 6.99 && comp._pNetz > 6.85, comp._pNetz.toFixed(3)]);
    toggleSimulation(); await warte(200);
    // noch einmal speichern und laden: das Netz bleibt, kein zweites
    saveFactoryState(); await warte(300); loadFactoryState(); await warte(1200);
    R.push(['Speichern und Laden: genau ein Netz', F.plan().teile.filter(t => t.typ === 'kompressor').length === 1 && F.plan().teile.filter(t => t.typ === 'anlage').length === 1, '']);
    return R;
  },
  'Verbundener Plan: Netz bleibt beim Übernehmen, Quelle hängt am Abgang': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren(); await warte(300);
    const c = createFactoryObject('zylinder_double', 'Y1'); c.x = 300; c.y = 200; updateObjTransform(c);
    generatePneumaticSetup(c, 'single'); await warte(300);
    const comp = factoryObjects.find(o => o.type === 'compressor');
    F.netz.sichern(comp, false); await warte(200);
    F.netz.setzen({ hyst: 0.5 });
    const n = F.ausAnlage(); await warte(600);
    const P = () => F.plan();
    R.push(['Übernahme aus der 2D-Anlage ohne Rückfrage, Plan verbunden', n === 1 && P().anlage === true, String(n)]);
    R.push(['Das Netz steht noch im Plan', ['kompressor', 'behaelter', 'anlage'].every(a => P().teile.some(t => t.typ === a)) && P().teile.some(t => t.typ === 'zyl_dw') && P().teile.some(t => t.typ === 'quelle'), P().teile.map(t => t.typ).join()]);
    R.push(['Weiter nur ein Kompressor in der 2D-Anlage', factoryObjects.filter(o => o.type === 'compressor').length === 1, '']);
    const bez = P().teile.map(t => t.bez).filter(Boolean);
    R.push(['Kennzeichen eindeutig', new Set(bez).size === bez.length, bez.join(' ')]);
    if (!isSimulationActive) toggleSimulation();
    comp.leakRate = 100;
    await warte(3000);
    const T = F.zustand().teile, q = P().teile.find(t => t.typ === 'quelle');
    R.push(['Quelle im Plan hat den Druck vom Abgang des Netzes', Math.abs(T[q.id].p['1'] - comp._pNetz) < 0.12 && comp._pNetz < 5.99, `${T[q.id].p['1'].toFixed(2)} / ${comp._pNetz.toFixed(2)} bar`]);
    comp.leakRate = 0;
    toggleSimulation(); await warte(300);
    F.verbinden2D(false); clearFactory(true); F._leeren();
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
  const nur = process.argv[2];
  let gut = 0, schlecht = 0;
  for (const [name, fn] of Object.entries(FAELLE)) {
    if (nur && !name.includes(nur)) continue;
    const erg = await page.evaluate(`(async () => { Fluidplan._leeren(); try { return await (${fn.toString()})(); } catch (e) { return [['Ausnahme', false, String(e && e.stack || e)]]; } })()`);
    console.log('\n' + name);
    for (const [n, ok, d] of erg) { console.log(`  ${ok ? '✓' : '✗'} ${n}${d !== '' && d != null ? '  (' + d + ')' : ''}`); ok ? gut++ : schlecht++; }
  }
  if (fehler.length) { console.log('\nSeitenfehler:\n  ' + fehler.join('\n  ')); schlecht += fehler.length; }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
