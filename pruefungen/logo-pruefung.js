const { chromium } = require('playwright');
// Prüfung der LOGO!-Abbildung (logo.js):
//   1. Zeitformat, Klemmen, Bausteinnamen, Bausteinliste, RS-Umbau,
//      Passt-Prüfung, feste Klemmen der Lehrkraft.
//   2. Gleichwertigkeit: Für jedes Programm aus index.html (Beispiele,
//      Lektionen, Aufgaben) und jede Musterlösung der Übungsanlagen wird die
//      abgebildete LOGO!-Schaltung mit derselben Eingangsfolge gefahren wie
//      das VALIS-Programm. Am Ende jeder Haltezeit müssen alle Ausgänge und
//      Merker gleich sein (Zeiten, Zähler, Dominanz inklusive).
//
//   node pruefungen/logo-pruefung.js
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
function korpusAusIndex() {
  const s = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
  const re = /\b(code|refCode|loesung|solution|startCode|musterCode|solutionCode)\s*:\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  const out = new Set(); let m;
  while ((m = re.exec(s))) {
    if (/\$\{/.test(m[2])) continue;
    let v; try { v = eval(m[2]); } catch (e) { continue; }
    if (typeof v === 'string' && /:=/.test(v)) out.add(v);
  }
  return [...out];
}
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
let gut = 0, schlecht = 0;
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' && !g ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const fehler = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.removeItem('valisLogoKlemmen'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} if (window.epneuMode) toggleEpneuMode(); });
  await page.waitForTimeout(400);

  // Hilfsfunktion im Browser: Programm übersetzen und abbilden
  await page.evaluate(() => {
    window.__logo = function (code, typen) {
      const p = parseToGraph(code);
      const m = Logo.abbilden(p.graph, { eingaenge: p.inputs, ausgaenge: p.outputs, generatedQ: p.generatedQ, typen: typen || {}, festeKlemmen: window.__feste || {} });
      return { p, m };
    };
  });

  console.log('Zeitformat');
  const z = await page.evaluate(() => [3, 2.5, 0.1, 99.99, 150, 120.5, 3600 * 2 + 60 * 5].map(s => Logo.zeit(s)));
  ok('3 s → 03:00 s', z[0].text === '03:00 s', z[0].text);
  ok('2,5 s → 02:50 s', z[1].text === '02:50 s', z[1].text);
  ok('0,1 s → 00:10 s', z[2].text === '00:10 s', z[2].text);
  ok('99,99 s bleibt in der Zeitbasis s', z[3].text === '99:99 s', z[3].text);
  ok('150 s → 02:30 m', z[4].text === '02:30 m', z[4].text);
  ok('120,5 s → nicht genau (Basis m)', z[5].basis === 'm' && !z[5].genau, JSON.stringify(z[5]));
  ok('2 h 5 min → 02:05 h', z[6].text === '02:05 h', z[6].text);

  console.log('Beispiel: Einschaltverzögerung und UND');
  let r = await page.evaluate(() => {
    const { m } = __logo('LAMPE := TON(START, 3)\nMOTOR := AN AND NOT AUS AND LAMPE');
    return { kl: m.klemmen, z: Logo.zeilen(m).map(x => x.text), stufe: m.passt.stufe };
  });
  ok('Eingänge I1 … in Reihenfolge, Ausgänge Q …', r.kl.START === 'I1' && r.kl.AN === 'I2' && r.kl.AUS === 'I3', JSON.stringify(r.kl));
  ok('LAMPE wird weiterverwendet → Merker M1, MOTOR → Q1', r.kl.LAMPE === 'M1' && r.kl.MOTOR === 'Q1', JSON.stringify(r.kl));
  ok('Liste: B001 Einschaltverzögerung · Trg ← I1 · T = 03:00 s → M1', r.z[0] === 'B001 Einschaltverzögerung · Trg ← I1 · T = 03:00 s → M1', r.z[0]);
  ok('Liste: B002 AND · I2, NOT I3, M1 → Q1', r.z[1] === 'B002 AND · I2, NOT I3, M1 → Q1', r.z[1]);
  ok('passt aufs Grundgerät', r.stufe === 'grund', r.stufe);

  console.log('Speicher, Zähler, Wischrelais');
  r = await page.evaluate(() => {
    const { m } = __logo('M1 := SR(START, STOP)\nM2 := RS(EIN, AUS)\nVOLL := CTU(ZAEHL, RESET, 5)\nIMP := TP(TASTER, 2)\nH1 := M1\nH2 := M2\nH3 := VOLL\nH4 := IMP');
    return { z: Logo.zeilen(m).map(x => x.text), fn: m.fussnoten, typen: m.bausteine.map(b => b.typ) };
  });
  ok('SR → Selbsthalterelais ohne Umbau', r.z.some(t => /Selbsthalterelais · S ← I1 · R ← I2/.test(t)), r.z.join(' | '));
  ok('RS → AND mit NOT S vor R', r.z.some(t => /AND · I4, NOT I3/.test(t)) && r.fn.some(f => /Setzdominant/.test(f)), r.z.join(' | '));
  ok('CTU → Vor-/Rückwärtszähler mit Ein = Aus = 5', r.z.some(t => /Vor-\/Rückwärtszähler · R ← I6 · Cnt ← I5 · Dir = lo · Ein = 5, Aus = 5/.test(t)), r.z.join(' | '));
  ok('TP → Flankengetriggertes Wischrelais TH = 02:00 s', r.z.some(t => /Flankengetriggertes Wischrelais · Trg ← I7 · TH = 02:00 s, TL = 00:00 s, N = 1/.test(t)) && r.fn.some(f => /Wischrelais/.test(f)), r.z.join(' | '));

  console.log('Analog und Passt-Prüfung');
  r = await page.evaluate(() => {
    const a = __logo('LUEFTER := TEMP > 50\nWARN := TEMP <= DRUCK\nSUMME := TEMP + DRUCK * 2', { TEMP: 'analog_in', DRUCK: 'analog_in' }).m;
    const viel = Array.from({ length: 10 }, (_, i) => 'A' + i + ' := E' + i).join('\n');
    const b = __logo(viel).m;
    const c = __logo('SCHRITTKETTE K\nEND\nX := Y').m;
    return { kl: a.klemmen, z: Logo.zeilen(a).map(x => x.text), sa: b.passt.stufe, erw: b.passt.erweiterung, kb: b.klemmen, sc: c.passt };
  });
  ok('Analogeingänge AI1, AI2 (Klemmen I7, I8 frei für AI)', r.kl.TEMP === 'AI1' && r.kl.DRUCK === 'AI2', JSON.stringify(r.kl));
  ok('Vergleich mit Zahl → Analoger Schwellwertschalter Ein = Aus = 50', r.z.some(t => /Analoger Schwellwertschalter · Ax ← AI1 · Ein = 50, Aus = 50 → Q1/.test(t)), r.z.join(' | '));
  ok('Vergleich zweier Werte → Analogkomparator', r.z.some(t => /Analogkomparator · Ax ← AI1 · Ay ← AI2/.test(t)), r.z.join(' | '));
  ok('Rechnung → Arithmetikanweisung auf AQ1', r.kl.SUMME === 'AQ1' && r.z.some(t => /Arithmetikanweisung/.test(t)), JSON.stringify(r.kl));
  ok('10 E/A → Erweiterung, I9 … und Q5 …', r.sa === 'erweiterung' && r.kb.E9 === 'I10' && r.kb.A4 === 'Q5' && r.erw.length, JSON.stringify([r.sa, r.erw, r.kb]));
  ok('Schrittkette passt nicht, mit Zeile', r.sc.stufe === 'nicht' && r.sc.gruende.some(g => /Schrittkette/.test(g.text) && g.zeile === 0), JSON.stringify(r.sc.gruende));

  console.log('Feste Klemmen');
  r = await page.evaluate(() => {
    window.__feste = { NOTHALT: 'I8', LAMPE: 'Q3', START: 'Q1' };
    const m = __logo('LAMPE := START AND NOTHALT').m;
    window.__feste = {};
    return { kl: m.klemmen, gr: m.passt.gruende.map(g => g.text) };
  });
  ok('Lehrkraft-Klemmen gelten, falsche Art wird gemeldet', r.kl.NOTHALT === 'I8' && r.kl.LAMPE === 'Q3' && r.kl.START === 'I1' && r.gr.some(g => /Q1 für START/.test(g)), JSON.stringify(r));

  console.log('Gleichwertigkeit LOGO! ↔ VALIS');
  const korpus = korpusAusIndex();
  const anlagen = await page.evaluate(() => {
    const out = [];
    try { (Uebungsanlagen.liste() || []).forEach((a, i) => { for (let s = 0; s < 3; s++) { try { const t = Uebungsanlagen.aufgabe(a.id || i, s); if (t && t.solution && t.solution.code) out.push({ code: t.solution.code, typen: t.solution.types || {} }); } catch (e) {} } }); } catch (e) {}
    return out;
  });
  // dazu kleine Programme, die jede Abbildung einmal allein fahren
  const eigene = [
    'LAMPE := TON(START, 3)\nMOTOR := AN AND NOT AUS AND LAMPE',
    'M1 := SR(START, STOP)\nM2 := RS(EIN, AUS)\nVOLL := CTU(ZAEHL, RESET, 5)\nIMP := TP(TASTER, 2)\nH1 := M1\nH2 := M2\nH3 := VOLL\nH4 := IMP',
    'NACH := TOF(NOT TASTER, 1.5)\nH1 := NACH OR (A AND B AND C AND D AND E AND F)',
    'S1 := A OR Q1\nR1 := B\nX := Q1\nS2_RS := C\nR2_RS := D AND NOT X\nY := Q2_RS',
    'MOTOR := (START OR MOTOR) AND NOT STOP',
    'Z := CTU(TON(TAKT, 0.5), RESET, 3)\nL := NOT Z',
    'LUEFTER := TONOF(TASTER, 1.5, 0.85)\nH := LUEFTER AND NOT B\nK := TONOF(LUEFTER, 0, 2.35)',
    'AUF := R_TRIG(TASTER)\nAB := F_TRIG(A AND NOT B)\nZ := CTU(AUF, RESET, 3)\nM := SR(AB, AUF)\nH := Z OR M',
    'BETRIEB := TONR(MOTOR AND NOT STOER, QUITT, 2.35)\nH := BETRIEB OR (A AND NOT B)\nW := TONR(BETRIEB, NOT A, 0.85)',
    // CTD: LD liegt beim Einschalten an (NOT …), sonst weicht nur der Startwert ab (Hinweis in logo.js)
    'LEER := CTD(TEIL, NOT VOLL, 3)\nH := LEER OR (A AND NOT B)\nM := CTD(R_TRIG(A), NOT B, 2)'
  ];
  const ana = [['LUEFTER := TEMP > 50\nWARN := TEMP <= DRUCK\nGLEICH := TEMP == 30\nUNGL := DRUCK <> 20\nSUMME := TEMP + DRUCK * 2\nK := 40 >= TEMP', { TEMP: 'analog_in', DRUCK: 'analog_in' }],
    ['HEIZ := ZWEIPUNKT(T, 20, 4, HEIZEN)\nKUEHL := ZWEIPUNKT(T, 30, 2, KUEHLEN)', { T: 'analog_in' }]];
  const alle = eigene.map(c => ({ code: c, typen: {} })).concat(ana.map(([c, t]) => ({ code: c, typen: t })), korpus.map(c => ({ code: c, typen: {} })), anlagen);
  const erg = await page.evaluate((alle) => {
    let zufall = 12345;
    const rnd = () => { zufall = (zufall * 1103515245 + 12345) & 0x7fffffff; return zufall / 0x7fffffff; };
    const res = { reihenfolge: [], gepr: 0, uebersprungen: 0, fehler: [], stufen: { grund: 0, erweiterung: 0, nicht: 0 } };
    alle.forEach(({ code, typen }, idx) => {
      let p, m;
      try { ({ p, m } = __logo(code, typen)); } catch (e) { res.fehler.push({ idx, text: 'Ausnahme: ' + e.message, code: code.slice(0, 200) }); return; }
      res.stufen[m.passt.stufe]++;
      if (/^\s*SCHRITTKETTE\b/m.test(code) || /^[^/]*ZUSTAND\s*\(/m.test(code) || !p.jsCompiledCode) { res.uebersprungen++; res.grundUe = (res.grundUe || []).concat([code.slice(0, 80)]); return; }
      let f;
      try { f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode); } catch (e) { res.uebersprungen++; return; }
      const ein = Object.keys(m.klemmen).filter(n => m.rollen[n].rolle === 'ein');
      const ana = new Set(ein.filter(n => /^AI/.test(m.klemmen[n])));
      const vergl = Object.keys(m.klemmen).filter(n => m.rollen[n].rolle !== 'ein' && !m.nichtVergleichbar.includes(n));
      const zeiten = m.bausteine.filter(b => b.sek).map(b => b.sek);
      const tpMax = Math.max(0, ...m.bausteine.filter(b => b.typ === 'TP').map(b => b.sek));
      const tMax = Math.max(0, ...zeiten);
      const halte = [0.35, 0.85, 1.35, 2.35, 3.85].concat(tMax ? [tMax + 0.35, tMax / 2 + 0.35] : []).filter(h => h >= tpMax + 0.3 || !tpMax);
      if (!halte.length) halte.push(tpMax + 0.35);
      const lauf = (zugleich) => {
        zufall = 777 + idx;
        const state = {}, timers = {}, z = Logo.neuerZustand();
        const dt = 50;
        let abw = null;
        const ein0 = {};
        ein.forEach(n => { ein0[n] = ana.has(n) ? 0 : false; });
        for (let schritt = 0; schritt < 150 && !abw; schritt++) {
          // je Schritt ändert sich genau ein Eingang (wie beim Bedienen)
          const e = Object.assign({}, ein0);
          const n = ein[Math.floor(rnd() * ein.length)];
          if (n) e[n] = ana.has(n) ? Math.round(rnd() * 120) - 10 : !ein0[n];
          Object.assign(ein0, e);
          const h = halte[Math.floor(rnd() * halte.length)];
          const takte = Math.round(h * 1000 / dt);
          let la = null, unruhig = false, letzt = null;
          for (let t = 0; t < takte; t++) {
            Object.assign(state, e); state.TRUE = true; state.FALSE = false;
            try { f(state, dt, timers); } catch (er) { return 'fehler'; }
            la = Logo.zyklus(m, z, e, dt, { zugleich });
            // Schwingt das VALIS-Programm selbst (z. B. eine Schrittkette, die bei
            // allen Gebern 1 im Kreis läuft), ist der Stand am Ende Zufall: nicht vergleichen.
            if (t >= takte - 6) { const jetzt = vergl.map(nn => String(state[nn])).join(); if (letzt !== null && jetzt !== letzt) unruhig = true; letzt = jetzt; }
          }
          if (unruhig) { res.unruhig = (res.unruhig || 0) + 1; continue; }
          for (const nn of vergl) {
            const kl = m.klemmen[nn];
            const an = /^(AQ|AM)/.test(kl);
            const valis = an ? +state[nn] || 0 : !!state[nn];
            const logo = an ? +la[nn] || 0 : !!la[nn];
            if (an ? Math.abs(valis - logo) > 1e-6 : valis !== logo) { abw = { n: nn, kl, valis, logo, schritt, e: JSON.stringify(e) }; break; }
          }
        }
        return abw;
      };
      let abw = lauf(false);
      if (abw === 'fehler') { res.uebersprungen++; return; }
      // Weicht nur die Reihenfolge im Zyklus ab (zwei Speicher, die sich
      // gegenseitig verriegeln, werden im selben Zyklus gesetzt)? Dann passt
      // die Abbildung, die LOGO! entscheidet nur nach Bausteinnummer.
      if (abw) { const a2 = lauf(true); if (!a2) { res.reihenfolge.push(idx); abw = null; } else if (abw) abw.zugleich = a2; }
      res.gepr++;
      if (abw) res.fehler.push({ idx, text: 'Abweichung ' + abw.n + ' (' + abw.kl + '): VALIS ' + abw.valis + ', LOGO! ' + abw.logo + ' nach Schritt ' + abw.schritt + ' bei ' + abw.e + (abw.zugleich ? ' / zugleich: ' + JSON.stringify(abw.zugleich) : ''), code: code.slice(0, 400), liste: Logo.zeilen(m).map(x => x.text).slice(0, 30) });
    });
    return res;
  }, alle);
  console.log(`  ${alle.length} Programme, ${erg.gepr} verglichen, ${erg.uebersprungen} übersprungen (Schrittkette/ZUSTAND), ${erg.reihenfolge.length} nur mit anderer Reihenfolge im Zyklus gleich, ${erg.unruhig || 0} Stände ohne Ruhe nicht verglichen, Passt: ${JSON.stringify(erg.stufen)}`);
  if (process.env.LOGO_DEBUG) console.log(erg.grundUe);
  erg.fehler.slice(0, 8).forEach(f => console.log('    ✗ ' + f.text + '\n      ' + f.code.replace(/\n/g, ' ⏎ ') + (f.liste ? '\n      ' + f.liste.join('\n      ') : '')));
  ok('alle abgebildeten Programme verhalten sich wie das VALIS-Programm', erg.fehler.length === 0, erg.fehler.length + ' Abweichungen');
  ok('mindestens 50 Programme verglichen', erg.gepr >= 50, erg.gepr);

  console.log('Ansicht im Logikplan');
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'MOTOR := SR(START AND NOT STOER, STOP)\nLAMPE := TON(MOTOR, 3)\nX := RS(EIN, AUS)\nH := X OR LAMPE\nW := max(A, B)'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const w = document.getElementById('fbs-wrapper'); if (w && w.style.display === 'none') { try { toggleWorkspaceView('fbs-wrapper'); } catch (e) {} } });
  await page.waitForTimeout(400);
  // Mit der Maus klicken wie ein Mensch (die Leiste lässt Klicks nur auf Knöpfe durch)
  let klickFehler = '';
  try { await page.click('#btn-fbs-logo', { timeout: 3000 }); } catch (e) { klickFehler = e.message.split('\n')[0]; }
  await page.waitForTimeout(300);
  ok('Knopf „LOGO!“ lässt sich mit der Maus drücken', !klickFehler && (await page.evaluate(() => window.logoAnsicht)) === true, klickFehler);
  await page.evaluate(() => window._toggleLogoAnsicht(true));
  await page.waitForTimeout(600);
  r = await page.evaluate(() => {
    const h = document.getElementById('logo-host'), svg = document.getElementById('logo-svg');
    const bs = [...svg.querySelectorAll('[data-logo-b]')].map(g => g.getAttribute('data-logo-b'));
    const passt = document.querySelector('[data-logo-passt]');
    return { sichtbar: h && h.style.display === 'block', bs, knopf: document.getElementById('btn-fbs-logo').textContent, passt: passt && passt.getAttribute('data-logo-passt'), zeilen: [...document.querySelectorAll('[data-logo-zeile]')].map(a => a.getAttribute('data-logo-zeile')), fuss: document.getElementById('logo-fuss').textContent, plan: document.getElementById('custom-svg').style.visibility };
  });
  ok('Schalter zeigt die LOGO!-Ansicht, Logikplan darunter verborgen', r.sichtbar && /AN/.test(r.knopf) && r.plan === 'hidden', JSON.stringify(r));
  ok('Bausteine B001 … gezeichnet', r.bs.includes('B001') && r.bs.includes('B004'), r.bs.join());
  ok('Passt-Kasten gelb mit Sprung in Zeile 5 (max ohne Gegenstück)', r.passt === 'nicht' && r.zeilen.includes('4'), JSON.stringify(r));
  ok('Fußnote zum RS-Umbau', /Setzdominanter Speicher/.test(r.fuss), r.fuss);
  r = await page.evaluate(() => { document.querySelector('[data-logo-zeile="4"]').click(); const ta = document.getElementById('code'); return ta.value.slice(ta.selectionStart, ta.selectionEnd); });
  ok('Klick auf „Zeile 5“ markiert die Zeile im Code', /^W := max/i.test(r), r);
  await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => setTaster('START', true)); await page.waitForTimeout(600);
  await page.evaluate(() => setTaster('START', false)); await page.waitForTimeout(3600);
  r = await page.evaluate(() => {
    const st = (sel) => { const g = document.querySelector('#logo-svg [data-logo-strang="' + sel + '"]'); return g ? [...g.querySelectorAll('line')].map(l => l.getAttribute('stroke')).filter(c => c !== '#eceff1') : []; };
    return { m1: st('M1'), m2: st('M2'), m3: st('M3') };
  });
  ok('Live: Selbsthaltung MOTOR (M1) grün nach Start', r.m1.includes('#2e7d32'), JSON.stringify(r.m1));
  ok('Live: Einschaltverzögerung nach 3 s durch (Strang M2 ganz grün)', r.m2.length && r.m2.every(c => c === '#2e7d32'), JSON.stringify(r.m2));
  ok('Live: Speicher X (M3) aus, blau', r.m3.length && r.m3.some(c => c === '#1565c0'), JSON.stringify(r.m3));
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); });
  r = await page.evaluate(() => { let fehler = ''; const a = document.createElement('a'); const alt = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {}; try { window._logoSvg(); } catch (e) { fehler = e.message; } HTMLAnchorElement.prototype.click = alt; void a; return fehler; });
  ok('SVG speichern läuft', r === '', r);
  console.log('Listen');
  r = await page.evaluate(() => { const l = document.querySelector('#logo-liste [data-logo-liste]'); return l ? l.textContent : ''; });
  ok('Bausteinliste unter dem Plan', /B001 AND · I1, NOT I2 → B002/.test(r) && /B003 Einschaltverzögerung · Trg ← M1 · T = 03:00 s → M2/.test(r), r.slice(0, 300));
  await page.evaluate(() => window._openZuordnungsliste());
  await page.waitForTimeout(300);
  r = await page.evaluate(() => [...document.querySelectorAll('#zuordnung-modal input.zl-logo')].map(i => i.getAttribute('data-zl-logo') + '=' + i.value));
  ok('Zuordnungsliste hat die Spalte LOGO! mit Vorschlag', r.includes('START=I1') && r.includes('MOTOR=M1') && r.includes('H=Q1'), r.join(' '));
  await page.evaluate(() => { const i = document.querySelector('#zuordnung-modal input.zl-logo[data-zl-logo="START"]'); i.value = 'I5'; i.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(300);
  r = await page.evaluate(() => ({ fest: Logo.festeKlemmen(), inp: [...document.querySelectorAll('#zuordnung-modal input.zl-logo')].map(i => i.getAttribute('data-zl-logo') + '=' + i.value + (i.classList.contains('fest') ? '!' : '')), liste: document.querySelector('#logo-liste [data-logo-liste]').textContent, csv: window._zuordnungCsv(), stand: getFactoryStateObj().logo }));
  ok('Geänderte Klemme ist fest, andere rücken nach', r.fest.START === 'I5' && r.inp.includes('START=I5!') && r.inp.includes('STOER=I1'), r.inp.join(' '));
  ok('LOGO!-Plan folgt der festen Klemme', /AND · I5, NOT I1/.test(r.liste), r.liste.slice(0, 120));
  ok('CSV hat die Spalte LOGO!', /;LOGO!;/.test(r.csv.split('\n')[0]) && /;START;%?[EI][^;]*;I5;/.test(r.csv), r.csv.split('\n').slice(0, 2).join(' / '));
  ok('Feste Klemmen reisen im Anlagenzustand', r.stand && r.stand.klemmen && r.stand.klemmen.START === 'I5', JSON.stringify(r.stand));
  await page.evaluate(() => { const i = document.querySelector('#zuordnung-modal input.zl-logo[data-zl-logo="START"]'); i.value = ''; i.dispatchEvent(new Event('change')); window._closeZuordnungsliste(); });
  r = await page.evaluate(() => Logo.festeKlemmen());
  ok('Leer = wieder Vorschlag', !r.START, JSON.stringify(r));
  r = await page.evaluate(() => window._logoDruckHtml());
  ok('Druckblatt: Passt, Bausteinliste, Zuordnungsliste, Fußnote', /Passt so nicht/.test(r) && /B001 AND/.test(r) && /Zuordnungsliste mit LOGO!-Klemmen/.test(r) && /<b>I1<\/b><\/td><td class="m">START/.test(r) && /Setzdominanter/.test(r), r.length);

  // Englisch: Leiste, Passt-Kasten und Liste folgen der Sprache
  await page.evaluate(() => { window.switchLanguage('en'); });
  await page.waitForTimeout(400);
  r = await page.evaluate(() => ({ leiste: document.getElementById('logo-leiste').textContent, passt: document.getElementById('logo-passt').textContent, knopf: document.getElementById('btn-fbs-logo').textContent }));
  ok('Englisch: Leiste, Passt-Kasten und Knopf', /Block list/.test(r.leiste) && /1 = green/.test(r.leiste) && /Print/.test(r.leiste) && /LOGO! 8/.test(r.passt) && !/Passt/.test(r.passt) && /ON|OFF/.test(r.knopf), JSON.stringify(r).slice(0, 400));
  await page.evaluate(() => { window.switchLanguage('de'); });
  await page.waitForTimeout(300);
  r = await page.evaluate(() => document.getElementById('logo-leiste').textContent);
  ok('Zurück auf Deutsch', /Bausteinliste/.test(r) && /1 = grün/.test(r), r.slice(0, 160));

  await page.evaluate(() => window._toggleLogoAnsicht(false));
  r = await page.evaluate(() => ({ h: document.getElementById('logo-host').style.display, plan: document.getElementById('custom-svg').style.visibility }));
  ok('Ausschalten zeigt wieder den Logikplan', r.h === 'none' && r.plan === '', JSON.stringify(r));

  // Link von der Webseite: ?ansicht=logo öffnet den Logikplan mit LOGO!-Ansicht
  const p2 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  p2.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  await p2.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.setItem('valisLogoAnsicht', '0'); } catch (e) {} });
  await p2.goto(url + '?ansicht=logo'); await p2.waitForTimeout(5000);
  r = await p2.evaluate(() => ({ an: window.logoAnsicht, h: (document.getElementById('logo-host') || {}).style?.display, fbs: document.getElementById('fbs-wrapper').style.display }));
  ok('?ansicht=logo schaltet die LOGO!-Ansicht ein', r.an === true && r.h === 'block' && r.fbs !== 'none', JSON.stringify(r));
  await p2.close();
  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
