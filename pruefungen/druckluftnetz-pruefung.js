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
    // Alle vier Darstellungen der 2D-Anlage: der Kompressor zeigt den Netzdruck vom Abgang
    const bilder = [];
    for (const bild of ['symbol', 'schnitt', 'aussen', 'gehaeuse']) {
      window._fpAlleVentile(bild); await warte(700);
      const sp = comp.el.querySelector('span'), inf = comp.el.querySelector('.f2d-comp-info');
      bilder.push(bild + ': ' + (sp ? sp.textContent : 'kein Text') + (inf ? ' | ' + inf.textContent.slice(0, 30) : ' | keine Anzeige'));
    }
    R.push(['Alle vier Darstellungen: Kompressor der Anlage zeigt Netzdruck und Netz-Anzeige', bilder.every(b => /: \d[.,]\d+ bar \| \S/.test(b)) && Math.abs(comp._pNetz - 6) < 0.08, bilder.join(' ; ')]);
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
  'Verbraucher-Baustein: Luftbedarf je Takt, Gleichzeitigkeit, Klick hält an': () => {
    const F = Fluidplan, R = [];
    const k = F.setzen('kompressor', 0, 100, { q: 600, pEin: 6.5, pAus: 7 });
    const b = F.setzen('behaelter', 120, 60, { V: 500 });
    const a = F.setzen('anlage', 300, 140, { art: 'baustein', name: 'Presse 2', bedarf: 20, takte: 12, gleich: 50, pMin: 5 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', a, '1');
    F._neu();
    const Z = id => F.zustand().teile[id];
    R.push(['Mittlerer Luftbedarf 20 l · 12/min · 50 % = 120 l/min', Math.abs(F.netz.bedarf(F.plan().teile.find(t => t.id === a).o) - 120) < 1e-9, '']);
    F.netz.raffer(10); F.netz.rechnen(30, 0.05);   // 300 s = 60 Takte
    const z = Z(a);
    R.push(['60 Takte in 5 Minuten', Math.abs(z.takte - 60) <= 1, String(z.takte)]);
    R.push(['Abgenommene Luft 60 · 10 l = 600 l', Math.abs(z.luft - 600) < 12, z.luft.toFixed(1)]);
    R.push(['Takt läuft voll, keine Meldung', Math.abs(z.taktIst - 12) < 0.01 && !z.zuNiedrig, z.taktIst.toFixed(2)]);
    R.push(['Kompressor hat nachgefüllt', Z(k).schalt >= 1 && Z(b).pNetz > 6.4, Z(k).schalt + '× ein, ' + Z(b).pNetz.toFixed(2) + ' bar']);
    R.push(['Baustein braucht kein Kennzeichen und meldet keinen offenen Anschluss', !F.pruefen().some(m => /Presse 2|offen/.test(m)), F.pruefen().join(' | ')]);
    // anhalten durch Klick
    F.druecken(a, 'N', true); F.druecken(a, 'N', false);
    const l0 = Z(a).luft; F.netz.rechnen(5, 0.05);
    R.push(['Klick hält die Anlage an: keine Luft mehr', Z(a).aus === true && Math.abs(Z(a).luft - l0) < 1e-9, '']);
    F.netz.raffer(1);
    return R;
  },
  'Mehrere Anlagen: Druck zu niedrig, Takt wird langsamer, Eingang meldet': () => {
    const F = Fluidplan, R = [];
    // Kompressor 400 l/min, zwei Anlagen mit zusammen 520 l/min: Die Luft reicht nicht
    const k = F.setzen('kompressor', 0, 100, { q: 400, pEin: 6.5, pAus: 7 });
    const b = F.setzen('behaelter', 120, 60, { V: 500 });
    const t = F.setzen('knoten', 260, 60);
    const a1 = F.setzen('anlage', 220, 160, { art: 'baustein', name: 'Halle A', bedarf: 26, takte: 10, gleich: 100, pMin: 5.5, var: 'B_DRUCK_OK' });
    const a2 = F.setzen('anlage', 340, 160, { art: 'baustein', name: 'Halle B', bedarf: 13, takte: 20, gleich: 100, pMin: 3.5 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', t, 'P'); F.verbinden(t, 'P', a1, '1'); F.verbinden(t, 'P', a2, '1');
    F._neu();
    const Z = id => F.zustand().teile[id];
    R.push(['Prüfung warnt: Bedarf größer als Liefermenge', F.pruefen().some(m => /größer als die Liefermenge/.test(m)), '']);
    F.netz.raffer(10); F.netz.rechnen(2, 0.05);
    R.push(['Am Anfang reicht der Druck, Eingang B_DRUCK_OK = 1', !Z(a1).zuNiedrig && F._schreib().B_DRUCK_OK === true, Z(a1).pNetz.toFixed(2)]);
    F.netz.rechnen(360, 0.05);   // 60 min
    const z1 = Z(a1), z2 = Z(a2);
    R.push(['Halle A meldet „Druck zu niedrig“', z1.zuNiedrig === true && z1.pNetz < 5.5, z1.pNetz.toFixed(2) + ' bar']);
    R.push(['Takt von Halle A ist langsamer als 10/min', z1.taktIst < 9.6 && z1.taktIst > 4, z1.taktIst.toFixed(2)]);
    R.push(['Halle B (Mindestdruck 3,5 bar) läuft im vollen Takt', !z2.zuNiedrig && Math.abs(z2.taktIst - 20) < 0.01, z2.taktIst.toFixed(2)]);
    R.push(['Eingang B_DRUCK_OK = 0', F._schreib().B_DRUCK_OK === false, '']);
    // Gleichgewicht: 260·f + 260 = 400 → f = 0,538 → p = 5,5·√0,538 = 4,03 bar
    R.push(['Druck pendelt sich dort ein, wo Bedarf und Liefermenge gleich sind (rund 4,0 bar)', Math.abs(z1.pNetz - 4.03) < 0.15, z1.pNetz.toFixed(2)]);
    R.push(['Kompressor läuft durch', Z(k).lauf === true && Z(k).laufS / Z(k).simS > 0.9, (100 * Z(k).laufS / Z(k).simS).toFixed(0) + ' %']);
    // Halle B steht: Luft reicht wieder
    F.druecken(a2, 'N', true); F.druecken(a2, 'N', false);
    F.netz.rechnen(60, 0.05);
    R.push(['Steht Halle B, reicht die Luft wieder: Meldung weg, voller Takt', !Z(a1).zuNiedrig && Math.abs(Z(a1).taktIst - 10) < 0.01 && F._schreib().B_DRUCK_OK === true, Z(a1).pNetz.toFixed(2) + ' bar']);
    F.netz.raffer(1);
    return R;
  },
  'Leckage je Abgang und langer Stich: der hintere Abgang hat weniger Druck': () => {
    const F = Fluidplan, R = [];
    const k = F.setzen('kompressor', 0, 100, { q: 2000, pEin: 6.8, pAus: 7 });
    const b = F.setzen('behaelter', 120, 60, { V: 1000 });
    const t = F.setzen('knoten', 260, 60);
    const h1 = F.setzen('hahn', 260, 120, { abgang: true, leck: 60 });
    const a1 = F.setzen('anlage', 260, 220, { art: 'baustein', name: 'vorn', bedarf: 30, takte: 10, pMin: 6 });
    const r = F.setzen('rohr', 400, 60, { L: 150, d: 13 });
    const h2 = F.setzen('hahn', 540, 120, { abgang: true, leck: 0 });
    const a2 = F.setzen('anlage', 540, 220, { art: 'baustein', name: 'hinten', bedarf: 30, takte: 10, pMin: 6 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', t, 'P'); F.verbinden(t, 'P', h1, '1'); F.verbinden(h1, '2', a1, '1');
    F.verbinden(t, 'P', r, '1'); F.verbinden(r, '2', h2, '1'); F.verbinden(h2, '2', a2, '1');
    F._neu();
    const Z = id => F.zustand().teile[id];
    F.netz.raffer(5); F.netz.rechnen(24, 0.05);
    R.push(['Leckage am vorderen Abgang rund 60 l/min · p/6', Z(h1).qLeck > 60 && Z(h1).qLeck < 72, Z(h1).qLeck.toFixed(1)]);
    R.push(['Hinterer Abgang liegt im Mittel tiefer als der vordere', Z(a2).pNetz < Z(a1).pNetz + 0.001, Z(a1).pNetz.toFixed(2) + ' / ' + Z(a2).pNetz.toFixed(2)]);
    // schließt man den vorderen Hahn, fällt dort die Leckage weg und die Anlage dahinter verhungert
    F.druecken(h1, 'N', true); F.druecken(h1, 'N', false);
    F.netz.rechnen(24, 0.05);
    R.push(['Hahn zu: Anlage dahinter bekommt keine Luft und steht', Z(a1).pNetz < 0.5 && Z(a1).taktIst === 0 && Z(a1).zuNiedrig, Z(a1).pNetz.toFixed(2)]);
    F.netz.raffer(1);
    return R;
  },
  'Luftbedarf aus einem gespeicherten Stand': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    // Stand von Hand: ein doppelt wirkender Zylinder Ø 50/20, Hub 200 und ein einfach wirkender Ø 32, Hub 50 bei 6 bar
    const stand = { code: '', factory: JSON.stringify({ objects: [
      { id: 'a', type: 'compressor', pressure: 6 },
      { id: 'b', type: 'zylinder_double', hasPneumatics: true, pistonD: 50, rodD: 20, stroke: 200 },
      { id: 'c', type: 'zylinder_single', hasPneumatics: true, pistonD: 32, rodD: 12, stroke: 50 },
      { id: 'd', type: 'zylinder_double', hasHydraulics: true, pistonD: 63, rodD: 28, stroke: 300 } ] }) };
    const AK = Math.PI * 50 * 50 / 4, AR = AK - Math.PI * 20 * 20 / 4, A2 = Math.PI * 32 * 32 / 4;
    const soll = ((AK + AR) * 200 + A2 * 50) * 7 / 1e6;   // 5,34 l
    const r = F.netz.luftbedarf(JSON.stringify(stand));
    R.push(['Zwei pneumatische Zylinder gezählt, der hydraulische nicht', r && r.zyl === 2, r && String(r.zyl)]);
    R.push(['Luftbedarf je Takt = (A_K + A_R) · h · (p + 1) + A · h · (p + 1)', r && Math.abs(r.nl - soll) < 1e-6, r && r.nl.toFixed(3) + ' / ' + soll.toFixed(3) + ' l']);
    R.push(['Kein VALIS-Stand: nichts', F.netz.luftbedarf({ irgendwas: 1 }) === null, '']);
    // aus der eigenen 2D-Anlage über den Knopf im Eigenschaften-Feld
    clearFactory(true); F._leeren(); await warte(300);
    const c = createFactoryObject('zylinder_double', 'Y1'); c.x = 300; c.y = 200; c.pistonD = 40; c.rodD = 16; c.stroke = 100; updateObjTransform(c);
    generatePneumaticSetup(c, 'single'); await warte(300);
    const a = F.setzen('anlage', 300, 140, { art: 'baustein' });
    F._waehlen(a); await warte(200);
    const kn = [...document.querySelectorAll('.fp-eigen button')].find(x => /dieser 2D-Anlage/.test(x.textContent));
    R.push(['Knopf „Luftbedarf aus dieser 2D-Anlage“ ist da', !!kn, '']);
    if (kn) kn.click(); await warte(300);
    const comp = factoryObjects.find(o => o.type === 'compressor'), p = comp ? comp.pressure || 6 : 6;
    const s2 = (Math.PI * 40 * 40 / 4 * 2 - Math.PI * 16 * 16 / 4) * 100 * (p + 1) / 1e6;
    const o = F.plan().teile.find(t => t.id === a).o;
    R.push(['Bedarf des Bausteins übernommen', Math.abs(o.bedarf - s2) < 0.01, o.bedarf + ' / ' + s2.toFixed(2) + ' l']);
    clearFactory(true); F._leeren();
    return R;
  },
  'Aufbereitung: Druckverlust der Kette aus Trockner, Filter und Wartungseinheit': () => {
    const F = Fluidplan, R = [];
    // großer Kompressor mit enger Hysterese hält 7 bar; ein Baustein nimmt gleichmäßig 500 l/min ab
    const k = F.setzen('kompressor', 0, 100, { q: 3000, pEin: 6.95, pAus: 7 });
    const b = F.setzen('behaelter', 120, 60, { V: 2000 });
    const ab = F.setzen('ableiter', 120, 140);
    const tr = F.setzen('ktrockner', 260, 60, { qN: 1000, dpN: 0.2 });
    const fi = F.setzen('nfilter', 400, 60, { qN: 1000, dpN: 0.08 });
    const h = F.setzen('hahn', 520, 60, { abgang: true });
    const w = F.setzen('awartung', 640, 60, { p: 6, qN: 1000, dpN: 0.3 });
    const a = F.setzen('anlage', 760, 160, { art: 'baustein', name: 'Linie', bedarf: 2, takte: 250, pMin: 5.5 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', tr, '1'); F.verbinden(b, '1', ab, '1'); F.verbinden(tr, '2', fi, '1'); F.verbinden(fi, '2', h, '1'); F.verbinden(h, '2', w, '1'); F.verbinden(w, '2', a, '1');
    F._neu();
    const Z = id => F.zustand().teile[id];
    R.push(['Plan ohne Meldung (Ableiter angeschlossen, nichts offen)', F.pruefen().length === 0, F.pruefen().join(' | ')]);
    F.netz.raffer(5); F.netz.rechnen(12, 0.05);
    // Δp = Δp_N · (Q/Q_N)²: Trockner 0,2 · 0,25 = 0,05 bar, Filter 0,08 · 0,25 = 0,02 bar
    R.push(['Trockner: Δp = 0,2 bar · (500/1000)² = 0,05 bar', Math.abs(Z(tr).dp - 0.05) < 0.012 && Math.abs(Z(tr).q - 500) < 40, Z(tr).dp.toFixed(3) + ' bar bei ' + Z(tr).q.toFixed(0) + ' l/min']);
    R.push(['Filter: Δp = 0,08 bar · (500/1000)² = 0,02 bar', Math.abs(Z(fi).dp - 0.02) < 0.008, Z(fi).dp.toFixed(3)]);
    R.push(['Wartungseinheit regelt auf 6 bar', Math.abs(Z(a).pNetz - 6) < 0.08, Z(a).pNetz.toFixed(2)]);
    R.push(['Druckverlust der Kette am Verbraucher rund 1 bar (7 → 6)', Math.abs(Z(a).dpKette - 1) < 0.12, Z(a).dpKette.toFixed(2)]);
    // Filter verschmutzt (100 % = zehnfacher Druckverlust): 0,2 bar, Wechselanzeige noch nicht
    F.netz.raffer(1); F.aendern(fi, { schmutz: 100 }); F._neu(); F.netz.raffer(5); F.netz.rechnen(12, 0.05);
    R.push(['Filter 100 % verschmutzt: zehnfacher Druckverlust (0,2 bar)', Math.abs(Z(fi).dp - 0.2) < 0.04, Z(fi).dp.toFixed(3)]);
    // Fehler „Filter zu“: der Verbraucher bekommt den Druck nicht mehr
    F.netz.raffer(1); F.aendern(fi, { schmutz: 0 }); F.fehlerSetzen(fi, 'zu'); F._neu(); F.netz.raffer(5); F.netz.rechnen(24, 0.05);
    R.push(['Fehler „Filter zugesetzt“: Differenzdruck über der Wechselanzeige, Anlage meldet Druck zu niedrig', Z(fi).dp > 0.35 && Z(a).zuNiedrig === true, 'Δp ' + Z(fi).dp.toFixed(2) + ' bar, Anlage ' + Z(a).pNetz.toFixed(2) + ' bar']);
    F.fehlerSetzen(fi, null);
    F.netz.raffer(1);
    return R;
  },
  'Aufbereitung: Kondensat am Behälter und im Trockner, Fehler „Trockner aus“': () => {
    const F = Fluidplan, R = [];
    const k = F.setzen('kompressor', 0, 100, { q: 1000, pEin: 6.9, pAus: 7 });
    const b = F.setzen('behaelter', 120, 60, { V: 1000 });
    const tr = F.setzen('ktrockner', 260, 60, { qN: 1000, dpN: 0.2, tp: 3 });
    const a = F.setzen('anlage', 400, 160, { art: 'baustein', name: 'Linie', bedarf: 5, takte: 100, pMin: 5 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', tr, '1'); F.verbinden(tr, '2', a, '1');
    F._neu();
    const Z = id => F.zustand().teile[id];
    const K = F.netz.kondensat(7, 3);
    R.push(['Sättigung bei 20 °C rund 17,3 g/m³, bei 3 °C rund 5,9 g/m³', Math.abs(F.netz.kondensat(7, 20).satt - 17.3) < 0.2 && Math.abs(K.satt - 5.95) < 0.1, F.netz.kondensat(7, 20).satt.toFixed(2) + ' / ' + K.satt.toFixed(2)]);
    R.push(['Kondensat je m³ angesaugter Luft bei 7 bar: Behälter rund 8,2 g, Trockner rund 1,4 g', Math.abs(K.behaelter - 8.19) < 0.1 && Math.abs(K.trockner - 1.41) < 0.05, K.behaelter.toFixed(2) + ' / ' + K.trockner.toFixed(2)]);
    R.push(['Prüfung meldet den fehlenden Kondensatableiter', F.pruefen().some(m => /Kondensatableiter/.test(m)), '']);
    F.netz.raffer(20); F.netz.rechnen(30, 0.05);   // 10 min, rund 5 m³ Luft
    const luft = Z(a).luft / 1000;
    R.push(['Rund 5 m³ Luft in 10 Minuten', Math.abs(luft - 5) < 0.2, luft.toFixed(2) + ' m³']);
    R.push(['Ohne Ableiter steht das Kondensat im Behälter (rund 41 g)', Math.abs(Z(b).kond - luft * K.behaelter) < 6 && Z(b).ableiter === false, Z(b).kond.toFixed(1) + ' g']);
    R.push(['Trockner scheidet rund 7 g ab, Luft am Verbraucher ist trocken', Math.abs(Z(tr).kond - luft * K.trockner) < 0.8 && !Z(a).feucht && Z(tr).nass === 0, Z(tr).kond.toFixed(2) + ' g']);
    // Fehler „Trockner aus“
    F.fehlerSetzen(tr, 'aus'); F._neu(); F.netz.raffer(20); F.netz.rechnen(30, 0.05);
    R.push(['Fehler „Trockner aus“: Wasser geht ins Netz, Verbraucher meldet feuchte Luft', Z(tr).kond === 0 && Z(tr).nass > 5 && Z(a).feucht === true, Z(tr).nass.toFixed(2) + ' g']);
    R.push(['Der Druckverlust des Trockners bleibt', Z(tr).dp > 0.02, Z(tr).dp.toFixed(3)]);
    F.fehlerSetzen(tr, null);
    // mit Ableiter am Behälter: Kondensat wird abgeleitet
    F.netz.raffer(1);
    const ab = F.setzen('ableiter', 120, 140); F.verbinden(b, '1', ab, '1'); F._neu(); F.netz.raffer(20); F.netz.rechnen(30, 0.05);
    R.push(['Mit Ableiter: Behälter bleibt leer, der Ableiter hat das Kondensat', Z(b).kond === 0 && Z(ab).kond > 30 && Z(b).ableiter === true, Z(ab).kond.toFixed(1) + ' g']);
    // Ableiter hängt offen: Leck
    F.fehlerSetzen(ab, 'offen'); F._neu(); F.netz.raffer(5); F.netz.rechnen(4, 0.05);
    R.push(['Fehler „Ableiter hängt offen“: bläst rund 58 l/min ab', Z(ab).qLeck > 50 && Z(ab).qLeck < 60, Z(ab).qLeck.toFixed(1)]);
    F.fehlerSetzen(ab, 'zu'); F._neu(); F.netz.raffer(20); F.netz.rechnen(10, 0.05);
    R.push(['Fehler „Ableiter verstopft“: Kondensat bleibt im Behälter', Z(b).kond > 5 && Z(ab).kond === 0, Z(b).kond.toFixed(1) + ' g']);
    F.fehlerSetzen(ab, null);
    F.netz.raffer(1);
    return R;
  },
  'Auswertung: Kennzahlen und Kosten wie in der Lernsituation (120 l/min = 720 € im Jahr)': () => {
    const F = Fluidplan, R = [];
    // Netz der Lernsituation: 400 l/min, 1500 l, 7 bar, Leckage 120 l/min bei 7 bar (= 102,9 l/min bei 6 bar), Fertigung 190 l/min
    const k = F.setzen('kompressor', 0, 100, { q: 400, pEin: 6.2, pAus: 7 });
    const b = F.setzen('behaelter', 120, 60, { V: 1500 });
    const m = F.setzen('nmess', 260, 60, { bereich: 1000, var: 'AI_LUFT', varSchalt: 'B_VIEL', schaltpunkt: 250 });
    const h = F.setzen('hahn', 400, 60, { abgang: true, leck: 120 * 6 / 6.6 });
    const a = F.setzen('anlage', 400, 160, { art: 'baustein', name: 'Fertigung', bedarf: 19 / 60, takte: 600, pMin: 5 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', m, '1'); F.verbinden(m, '2', h, '1'); F.verbinden(m, '2', a, '1');
    F._neu();
    const Z = id => F.zustand().teile[id];
    const K0 = F.netz.kennzahlen();
    R.push(['Preis je m³: 6,25 kW je m³/min · 0,24 €/kWh / 60 = 0,025 €', Math.abs(K0.euroM3 - 0.025) < 1e-9, K0.euroM3.toFixed(4)]);
    R.push(['Speicher im Netz 1500 l', Math.abs(K0.volumen - 1500) < 1, K0.volumen.toFixed(0)]);
    F.netz.raffer(20); F.netz.rechnen(180, 0.05);   // 60 min
    const K = F.netz.kennzahlen(), kp = K.kompressoren[0];
    R.push(['Leckage im Mittel rund 120 l/min (bei im Mittel 6,6 bar)', Math.abs(K.leck - 120) < 5, K.leck.toFixed(1)]);
    R.push(['Leckagekosten rund 720 € im Jahr', Math.abs(K.leckEuroJahr - 720) < 30, K.leckEuroJahr.toFixed(0) + ' €']);
    R.push(['Luftbedarf im Mittel rund 310 l/min (der Speicher gibt am Ende noch etwas ab)', Math.abs(K.qv - 310) < 22, K.qv.toFixed(0)]);
    R.push(['Einschaltdauer = Bedarf / Liefermenge (rund 78 %)', Math.abs(kp.ed - K.qv / 400) < 0.03, (kp.ed * 100).toFixed(0) + ' %']);
    R.push(['Energie: 2,5 kW · ED, im Jahr · 4000 h · 0,24 €', Math.abs(K.kW - 2.5 * kp.ed) < 0.01 && Math.abs(K.euroJahr - K.kW * 4000 * 0.24) < 0.5, K.kW.toFixed(2) + ' kW, ' + K.euroJahr.toFixed(0) + ' €']);
    R.push(['1 bar weniger spart 7 % davon', Math.abs(K.sparBar - K.euroJahr * 0.07) < 0.01, K.sparBar.toFixed(0) + ' €']);
    // Behälter-Rechner: z = Q_K · L · (1 − L) · 60 / (V · Δp)
    const B = F.netz.behaelter();
    const zSoll = 400 * B.lb * (1 - B.lb) * 60 / (1500 * 0.8);
    R.push(['Behälter-Rechner nimmt den gemessenen Bedarf', B.gemessen === true && Math.abs(B.qv - K.qv) < 1e-6 && Math.abs(B.dp - 0.8) < 1e-9, '']);
    R.push(['Gerechnete Schaltspiele passen zur Simulation', Math.abs(B.zIst - zSoll) < 1e-6 && Math.abs(kp.spiele - B.zIst) < 0.5, 'gerechnet ' + B.zIst.toFixed(2) + ' /h, simuliert ' + kp.spiele.toFixed(2) + ' /h']);
    const B2 = F.netz.behaelter({ qk: 400, qv: 200, dp: 1, z: 10 });
    R.push(['Rechenbeispiel: 400 l/min, halbe Auslastung, 1 bar, 10/h → 600 l', Math.abs(B2.vErf - 600) < 1e-6 && Math.abs(B2.vWorst - 600) < 1e-6, B2.vErf.toFixed(0) + ' l']);
    // Kosten umstellen
    F.netz.kosten({ strom: 0.30 });
    R.push(['Strompreis 0,30 €/kWh: Preis je m³ steigt auf 0,03125 €', Math.abs(F.netz.kennzahlen().euroM3 - 0.03125) < 1e-9 && F.plan().netzKosten.strom === 0.30, '']);
    F.netz.kosten({ strom: 0.24 });
    // Durchflusssensor
    R.push(['Durchflusssensor misst den Bedarf der Halle und schreibt den Analogwert', Math.abs(Z(m).q - 310) < 15 && Math.abs(F._schreibA().AI_LUFT - Math.abs(Z(m).q)) < 0.06, Z(m).q.toFixed(0) + ' l/min']);
    R.push(['Schaltausgang über 250 l/min, Mengenzähler rund 18,6 m³', F._schreib().B_VIEL === true && Math.abs(Z(m).summe / 1000 - 18.6) < 0.4, (Z(m).summe / 1000).toFixed(2) + ' m³']);
    // Aufzeichnung
    const A = F.netz.aufzeichnung();
    R.push(['Aufzeichnung: Druck an Kompressor, Behälter, Abgang und Anlage', A && A.n > 200 && A.n <= 2400 && Object.keys(A.p).length === 4 && A.p[k].length === A.n, A && A.n + ' Punkte']);
    R.push(['Aufzeichnung bleibt zwischen den Schaltpunkten', A && Math.min(...A.p[b]) > 6.15 && Math.max(...A.p[b]) < 7.05, A && Math.min(...A.p[b]).toFixed(2) + ' … ' + Math.max(...A.p[b]).toFixed(2)]);
    F.netz.raffer(1);
    return R;
  },
  'Auswertung: Druckabfallprüfung fürs ganze Netz und für einen abgesperrten Abschnitt': () => {
    const F = Fluidplan, R = [];
    // Lernsituation: 1500 l, von 7,0 auf 6,2 bar in 10 min → 120 l/min
    const k = F.setzen('kompressor', 0, 100, { q: 400, pEin: 6, pAus: 7, aus: true });
    const b = F.setzen('behaelter', 120, 60, { V: 1500 });
    const h1 = F.setzen('hahn', 260, 60, {});
    const b2 = F.setzen('behaelter', 400, 60, { V: 500 });
    const ab = F.setzen('hahn', 540, 60, { abgang: true, leck: 60 });
    const lk = F.setzen('hahn', 120, 160, { abgang: true, leck: 109.2 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', h1, '1'); F.verbinden(h1, '2', b2, '1'); F.verbinden(b2, '2', ab, '1'); F.verbinden(b, '1', lk, '1');
    F._neu();
    const Z = id => F.zustand().teile[id];
    // Abschnitt absperren: Hahn zu, gemessen wird am ersten Behälter
    F.druecken(h1, 'N', true); F.druecken(h1, 'N', false);
    const s = F.netz.pruefStart();
    R.push(['Start: 7,0 bar, Abschnitt 1500 l (Hahn zu trennt den Rest ab), Kompressor aus', s && Math.abs(s.p0 - 7) < 0.01 && Math.abs(s.V - 1500) < 3 && s.kompAn === false, s && s.V.toFixed(0) + ' l']);
    F.netz.raffer(20); F.netz.rechnen(30, 0.05);   // 10 min
    const e = F.netz.pruefStopp();
    R.push(['Nach 10 min rund 6,2 bar', e && Math.abs(e.p1 - 6.2) < 0.03 && Math.abs(e.t - 600) < 1, e && e.p1.toFixed(3) + ' bar']);
    R.push(['Leckage = V · Δp / t = 1500 · 0,8 / 10 = 120 l/min', e && Math.abs(e.leck - 120) < 4, e && e.leck.toFixed(1)]);
    R.push(['Der abgesperrte Rest verliert für sich (60 l/min an 500 l)', Z(b2).pNetz < 6.0, Z(b2).pNetz.toFixed(2)]);
    // ganzes Netz: Hahn auf
    F.netz.raffer(1); F._neu();
    const s2 = F.netz.pruefStart();
    R.push(['Ganzes Netz: Abschnitt 2000 l', s2 && Math.abs(s2.V - 2000) < 4, s2 && s2.V.toFixed(0)]);
    F.netz.raffer(20); F.netz.rechnen(15, 0.05);
    const e2 = F.netz.pruefStopp();
    // beide Leckagen bei im Mittel rund 6,7 bar: (109,2 + 60) · 6,7/6 ≈ 189 l/min
    R.push(['Ganzes Netz: beide Leckagen zusammen (rund 190 l/min)', e2 && Math.abs(e2.leck - 189) < 8, e2 && e2.leck.toFixed(1)]);
    // läuft der Kompressor mit, warnt die Prüfung
    F.netz.raffer(1); F.aendern(k, { aus: false }); F._neu();
    const s3 = F.netz.pruefStart();
    R.push(['Kompressor nicht aus: Hinweis', s3 && s3.kompAn === true, '']);
    F.netz.pruefStopp();
    return R;
  },
  'Auswertung: Netz-Diagramm mit Kennzahlen, Rechenweg und Oszilloskop-Kanälen': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    F.oeffnen(); await warte(300);
    const k = F.setzen('kompressor', 0, 100, { q: 400, pEin: 6.5, pAus: 7 });
    const b = F.setzen('behaelter', 120, 60, { V: 200 });
    const m = F.setzen('nmess', 260, 60, {});
    const h = F.setzen('hahn', 400, 60, { abgang: true, leck: 150 });
    F.verbinden(k, '1', b, '1'); F.verbinden(b, '2', m, '1'); F.verbinden(m, '2', h, '1');
    F.netz.diagramm(); await warte(200);
    const box = document.getElementById('fp-diag'), panel = box.querySelector('.fp-netzkz');
    R.push(['Knopf „Netz“ im Diagrammfenster, Kennzahlen daneben', !!document.getElementById('fp-d-netz') && document.getElementById('fp-d-netz').classList.contains('an') && !!panel && panel.style.display !== 'none', '']);
    const sel = panel.querySelector('#fp-nz-raffer'); sel.value = '20'; sel.onchange();
    R.push(['Zeitraffer stellt das Netz auf × 20', F.netz.raffer() === 20, String(F.netz.raffer())]);
    if (!isSimulationActive) toggleSimulation();
    await warte(6000);   // rund 2 min Netzzeit
    const svg = box.querySelector(':scope > svg');
    R.push(['Diagramm zeichnet Verläufe und die Schaltpunkte', svg.querySelectorAll('path[data-reihe]').length >= 2 && /aus 7 bar/.test(svg.textContent) && /ein 6,5 bar/.test(svg.textContent), svg.querySelectorAll('path[data-reihe]').length + ' Linien']);
    R.push(['Balken „Kompressor läuft“', svg.querySelectorAll('rect[data-lauf]').length >= 1, String(svg.querySelectorAll('rect[data-lauf]').length)]);
    const txt = id => panel.querySelector('#' + id).textContent;
    R.push(['Kennzahlen zeigen Schaltspiele, Einschaltdauer und Kosten', /\/h/.test(txt('fp-nz-spiele')) && /%/.test(txt('fp-nz-ed')) && /€/.test(txt('fp-nz-leckeuro')) && /0,025 €\/m³/.test(txt('fp-nz-m3')), txt('fp-nz-spiele') + ' | ' + txt('fp-nz-ed') + ' | ' + txt('fp-nz-leckeuro')]);
    R.push(['Behälter-Rechner zeigt den Rechenweg', /V = Q_K · L · \(1 − L\) · 60 \/ \(z · Δp\)/.test(txt('fp-nz-beh')) && /Vorhanden: 200 l/.test(txt('fp-nz-beh')), txt('fp-nz-beh').split('\n')[2]]);
    // Kosten im Feld ändern
    const ein = panel.querySelector('input[data-kosten="stunden"]'); ein.value = '2000'; ein.onchange();
    R.push(['Betriebsstunden im Feld geändert: im Plan gespeichert', F.plan().netzKosten.stunden === 2000, '']);
    ein.value = '4000'; ein.onchange();
    // Druckabfallprüfung über den Knopf
    F.druecken(k, 'N', true); F.druecken(k, 'N', false);
    const pb = panel.querySelector('#fp-nz-pruef'); pb.click(); await warte(3000); pb.click(); await warte(300);
    R.push(['Druckabfallprüfung über den Knopf: Rechenweg mit Ergebnis in l/min', /V̇_L = V · \(p₁ − p₂\) \/ t/.test(txt('fp-nz-pruefw')) && /l\/min/.test(txt('fp-nz-pruefw')), txt('fp-nz-pruefw').split('\n')[1]]);
    // Oszilloskop-Kanäle
    const M = window._fpPropMess(), kb = F.plan().teile.find(t => t.id === k).bez, mb = F.plan().teile.find(t => t.id === m).bez;
    R.push(['Oszilloskop: Druck am Kompressor, Durchfluss und Druck am Sensor', M && typeof M[kb].p === 'number' && typeof M[mb].Q === 'number' && typeof M[mb].p === 'number', kb + ', ' + mb]);
    toggleSimulation(); await warte(200);
    F.netz.raffer(1);
    document.getElementById('fp-d-zu').click();
    return R;
  },
  'Beispiele: Ringleitung, „Der Kompressor schaltet zu oft“, „Die Druckluft reicht nicht mehr“': () => {
    const F = Fluidplan, R = [];
    const N = F.beispiele(), idx = n => N.findIndex(x => x.includes(n));
    const Z = id => F.zustand().teile[id], T = typ => F.plan().teile.filter(t => t.typ === typ);
    const bau = n => { F.beispielLaden(idx(n), false); F._neu(); };
    R.push(['Drei Netz-Beispiele in der Liste', idx('Ringleitung in der Halle') >= 0 && idx('Der Kompressor schaltet zu oft') >= 0 && idx('Die Druckluft reicht nicht mehr') >= 0, '']);
    // --- Ringleitung
    bau('Ringleitung in der Halle');
    R.push(['Ringleitung: Plan ohne Meldung, alle Teile haben ein Kennzeichen', F.pruefen().length === 0 && F.plan().teile.every(t => t.typ === 'knoten' || t.typ === 'anlage' || /^-[A-Z]+\d+$/.test(t.bez)), F.pruefen().join(' | ')]);
    const mo = T('anlage').find(t => t.o.name === 'Montage'), hr = T('hahn').find(t => !t.o.abgang), rohre = T('rohr');
    F.netz.raffer(10); F.netz.rechnen(18, 0.05);   // 3 min
    const dpRing = Math.max(Z(rohre[0].id).dp, Z(rohre[1].id).dp);
    R.push(['Ring offen: beide Leitungen tragen, Montage hat genug Druck', Math.abs(Z(rohre[0].id).q) > 150 && Math.abs(Z(rohre[1].id).q) > 150 && !Z(mo.id).zuNiedrig, Z(rohre[0].id).q.toFixed(0) + ' / ' + Z(rohre[1].id).q.toFixed(0) + ' l/min, Δp ' + dpRing.toFixed(3) + ' bar']);
    F.druecken(hr.id, 'N', true); F.druecken(hr.id, 'N', false);
    let niedrig = false, dpStich = 0;
    for (let i = 0; i < 36; i++) { F.netz.rechnen(0.5, 0.05); if (Z(mo.id).zuNiedrig) niedrig = true; dpStich = Math.max(dpStich, Z(rohre[0].id).dp, Z(rohre[1].id).dp); }
    R.push(['Hahn im Ring zu: eine Leitung allein, Druckverlust auf ein Mehrfaches', dpStich > 2.5 * dpRing, dpStich.toFixed(3) + ' gegen ' + dpRing.toFixed(3) + ' bar']);
    R.push(['Montage meldet dann „Druck zu niedrig“', niedrig, '']);
    // --- Der Kompressor schaltet zu oft: z = 3000 · 0,633 · 0,367 · 60 / (3000 · 0,2) ≈ 70 /h
    F.netz.raffer(1); bau('Der Kompressor schaltet zu oft');
    const k2 = T('kompressor')[0], b2 = T('behaelter')[0];
    R.push(['Kompressor: Speicher rund 3000 l (Behälter 2000 l, Netz rund 1000 l)', Math.abs(F.netz.kennzahlen().volumen - 3000) < 10, F.netz.kennzahlen().volumen.toFixed(0)]);
    F.netz.raffer(20); F.netz.rechnen(60, 0.05);   // 20 min
    let K = F.netz.kennzahlen();
    R.push(['Ist-Zustand: Bedarf rund 1,9 m³/min, davon Leckage rund 1,1 m³/min', Math.abs(K.qv - 1900) < 60 && Math.abs(K.leck - 1100) < 30, K.qv.toFixed(0) + ' / ' + K.leck.toFixed(0) + ' l/min']);
    R.push(['Ist-Zustand: rund 70 Schaltspiele je Stunde (Grenze 20)', Math.abs(K.kompressoren[0].spiele - 70) < 6, K.kompressoren[0].spiele.toFixed(1)]);
    // Weg A: Druckschalter 6,6 / 7,4 bar → rund 17 /h
    F.netz.raffer(1); F.aendern(k2.id, { pEin: 6.6, pAus: 7.4 }); F._neu(); F.netz.raffer(20); F.netz.rechnen(90, 0.05);
    K = F.netz.kennzahlen();
    R.push(['Weg A (6,6 / 7,4 bar): unter 20 Schaltspiele je Stunde, Druck bleibt über 6,5 bar', K.kompressoren[0].spiele < 20 && K.kompressoren[0].spiele > 13 && Math.min(...F.netz.aufzeichnung().p[b2.id]) > 6.5, K.kompressoren[0].spiele.toFixed(1)]);
    // Weg A und C: Leckagen dicht → rund 15 /h
    F.netz.raffer(1); F.plan().teile.forEach(t => { if (t.typ === 'hahn' || t.typ === 'ableiter') F.aendern(t.id, { leck: 0 }); }); F._neu(); F.netz.raffer(20); F.netz.rechnen(90, 0.05);
    K = F.netz.kennzahlen();
    R.push(['Weg A und C (Leckagen dicht): rund 15 Schaltspiele je Stunde, Leckage 0', Math.abs(K.kompressoren[0].spiele - 14.7) < 2.5 && K.leck < 1, K.kompressoren[0].spiele.toFixed(1)]);
    // --- Die Druckluft reicht nicht mehr
    F.netz.raffer(1); bau('Die Druckluft reicht nicht mehr');
    const neu = T('anlage').find(t => t.o.name === 'Neue Geräte'), fe = T('anlage').find(t => t.o.name === 'Fertigung'), k3 = T('kompressor')[0], b3 = T('behaelter')[0];
    R.push(['Druckluft: Speicher 1500 l, neue Geräte stehen zuerst', Math.abs(F.netz.kennzahlen().volumen - 1500) < 3 && Z(neu.id).aus === true, F.netz.kennzahlen().volumen.toFixed(1)]);
    F.netz.raffer(20); F.netz.rechnen(90, 0.05);   // 30 min
    K = F.netz.kennzahlen();
    R.push(['Bestand: rund 310 l/min, davon rund 120 l/min Leckage, die Luft reicht', Math.abs(K.qv - 311) < 12 && Math.abs(K.leck - 121) < 6 && !Z(fe.id).zuNiedrig && Z(b3.id).pNetz >= 6.45, K.qv.toFixed(0) + ' / ' + K.leck.toFixed(0)]);
    // neue Geräte starten: 190 + 118 + Leckage > 400
    F.druecken(neu.id, 'N', true); F.druecken(neu.id, 'N', false);
    F.netz.rechnen(180, 0.05);   // 60 min
    R.push(['Neue Geräte dazu: Kompressor läuft durch, Druck fällt unter 6 bar, Anlagen melden „Druck zu niedrig“', Z(k3.id).lauf && Z(b3.id).pNetz < 6 && Z(neu.id).zuNiedrig && Z(fe.id).zuNiedrig, Z(b3.id).pNetz.toFixed(2) + ' bar']);
    // Druckabfallprüfung wie in der Lernsituation: 7,0 → 6,2 bar in 10 min
    F.netz.raffer(1); bau('Die Druckluft reicht nicht mehr');
    F.druecken(k3.id, 'N', true); F.druecken(k3.id, 'N', false);
    const fe2 = T('anlage').find(t => t.o.name === 'Fertigung'), k4 = T('kompressor')[0];
    F.druecken(k4.id, 'N', true); F.druecken(k4.id, 'N', false); F.druecken(fe2.id, 'N', true); F.druecken(fe2.id, 'N', false);
    F.netz.pruefStart(); F.netz.raffer(20); F.netz.rechnen(30, 0.05);
    const e = F.netz.pruefStopp();
    R.push(['Druckabfallprüfung: 7,0 auf rund 6,2 bar in 10 min, also rund 120 l/min', e && Math.abs(e.p1 - 6.2) < 0.05 && Math.abs(e.leck - 120) < 6 && Math.abs(e.V - 1500) < 3, e && e.p1.toFixed(2) + ' bar, ' + e.leck.toFixed(0) + ' l/min']);
    // Leckagen behoben: Luft reicht für die neuen Geräte
    F.netz.raffer(1); F.plan().teile.forEach(t => { if (t.typ === 'hahn') F.aendern(t.id, { leck: 0 }); }); F.aendern(T('anlage').find(t => t.o.name === 'Neue Geräte').id, { aus: false }); F._neu(); F.netz.raffer(20); F.netz.rechnen(90, 0.05);
    K = F.netz.kennzahlen();
    R.push(['Leckagen behoben: 190 + 118 = 308 l/min, die Luft reicht für die neuen Geräte', Math.abs(K.qv - 304) < 15 && T('anlage').every(t => !Z(t.id).zuNiedrig) && Z(T('behaelter')[0].id).pNetz >= 6.45, K.qv.toFixed(0) + ' l/min']);
    F.netz.raffer(1);
    return R;
  },
  'Aufgabe mit Netz-Plan und ohne 2D-Anlage: der Fluidplan geht auf': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren(); await warte(300);
    F.beispielLaden(F.beispiele().findIndex(n => n.includes('Der Kompressor schaltet zu oft')), false); await warte(300);
    const stand = JSON.parse(JSON.stringify(getFactoryStateObj()));
    F._leeren(); F.schliessen(); await warte(300);
    const lp = document.getElementById('fbs-wrapper');
    if (getComputedStyle(lp).display === 'none') { toggleWorkspaceView('fbs-wrapper'); await warte(200); }
    window._startTask({ version: '1.0', type: 'valitask', id: 'pruef-netz', name: 'Netz', description: 'Netz', category: 'Test', preset: { code: '', factory: stand, types: {}, layout: 'flex-row' },
      conditions: [{ type: 'custom_js', label: 'Netz da', expression: '(function(){return Fluidplan.plan().teile.length > 0;})()' }], restrictObjects: 'none', enforceMode: 'none' });
    await warte(1800);
    const fw = document.getElementById('fluid-wrapper');
    R.push(['Der Plan der Aufgabe ist geladen und der Fluidplan sichtbar', F.plan().teile.length === stand.fluidplan.teile.length && getComputedStyle(fw).display !== 'none' && fw.offsetWidth > 300, fw.offsetWidth + ' px']);
    R.push(['Ohne Programm macht der Logikplan dem Plan Platz, das Diagramm „Netz“ ist offen', getComputedStyle(lp).display === 'none' && !!document.querySelector('.fp-netzkz') && document.querySelector('.fp-netzkz').offsetWidth > 100, getComputedStyle(lp).display + ' ' + !!document.querySelector('.fp-netzkz') + ' ' + (document.querySelector('.fp-netzkz') || {}).offsetWidth + ' aktiv ' + F.netz.aktiv()]);
    const cf = window.confirm; window.confirm = () => true; try { window._taskAbandon(); } catch (e) {} window.confirm = cf;
    await warte(300);
    R.push(['Aufgabe abgebrochen: keine Aufgabe mehr aktiv', !document.getElementById('task-panel') || getComputedStyle(document.getElementById('task-panel')).display === 'none', '']);
    if (getComputedStyle(lp).display === 'none') toggleWorkspaceView('fbs-wrapper');
    return R;
  },
  'Palette: Vorschaubilder der Netzteile ohne schwarze Flächen': async () => {
    const F = Fluidplan, R = [];
    F.oeffnen(); await new Promise(r => setTimeout(r, 400));
    const schwarz = [];
    document.querySelectorAll('.fp-pal').forEach(d => d.querySelectorAll('svg rect, svg path, svg circle').forEach(n => {
      const cs = getComputedStyle(n), f = cs.fill, bb = n.getBBox();
      if (/^rgb\(0, 0, 0\)$/.test(f) && +cs.fillOpacity > 0 && +cs.opacity > 0 && bb.width * bb.height > 150) schwarz.push(d.textContent.trim() + ' ' + n.tagName + '.' + n.getAttribute('class'));
    }));
    R.push(['Kein Vorschaubild der Palette hat eine schwarz gefüllte Fläche', document.querySelectorAll('.fp-pal').length > 30 && schwarz.length === 0, schwarz.join(' | ')]);
    return R;
  },
  'Netz im Auto-Schaltplan: nicht verbundener Plan zeigt das Netz neben der Pneumatik': async () => {
    const F = Fluidplan, R = [];
    const warte = ms => new Promise(r => setTimeout(r, ms));
    clearFactory(true); F._leeren(); await warte(300);
    const c = createFactoryObject('zylinder_double', 'Y1'); c.x = 300; c.y = 200; updateObjTransform(c);
    generatePneumaticSetup(c, 'single'); await warte(300);
    const comp = factoryObjects.find(o => o.type === 'compressor');
    const ziel = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); document.body.appendChild(ziel);
    const ohne = F._schaltbild(ziel, {});
    const nOhne = ohne && ohne.g ? ohne.g.querySelectorAll('[data-obj-id]').length : 0;
    F.netz.sichern(comp, false); await warte(300);
    const b = F.setzen('anlage', 600, 600, { art: 'baustein', name: 'Nachbaranlage', bedarf: 10, takte: 10 });
    const kn = F.plan().teile.find(t => t.typ === 'behaelter'); F.verbinden(kn.id, '2', b, '1');
    R.push(['Plan ist nicht verbunden und trägt das Netz', F.plan().anlage !== true && F.netz.aktiv(), '']);
    const mit = F._schaltbild(ziel, {});
    const g = mit && (mit.g || mit), txt = g && g.textContent || '';
    R.push(['Auto-Schaltplan zeigt Kompressor, Behälter und Baustein des Netzes', !!g && /-GQA\d/.test(txt) && /-CM\d/.test(txt) && /Nachbaranlage/.test(txt) && /diese Anlage/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 160)]);
    R.push(['„diese Anlage“ im Bild gehört zum Kompressor der 2D-Anlage (Klick führt dorthin)', !!g && !!g.querySelector('[data-obj-id="' + comp.id + '"]'), '']);
    ziel.remove();
    F.netz.entfernen(); clearFactory(true); F._leeren();
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
