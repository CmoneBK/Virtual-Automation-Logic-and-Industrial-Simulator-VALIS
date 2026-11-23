const { chromium } = require('playwright');
// Herkunft der Panels im Steckaufbau (Christoph, 23.11.2026): jedes Panel
// trägt seine Herstellernummer (FESTO nnnnnn) oder das Schild „gibt es so
// nicht“ (window._festoHerkunftMarken, Tabellen _FESTO_NUMMER/_FESTO_OHNE_VORBILD).
//
//   node pruefungen/herkunft-pruefung.js
//   node pruefungen/count-fg-pruefung.js
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
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' && !g ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };

// Herkunft der Panels im Steckaufbau (Christoph, 23.11.2026): Jedes Panel trägt
// seine Herstellernummer oder das Schild „gibt es so nicht“. Kein Panel darf so
// aussehen, als gäbe es das als Produkt, wenn es das nicht gibt.
(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const fehler = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  const w = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} });

  console.log('Ein-/Ausschaltverzögerung TONOF: Ablauf');
  const lauf = await page.evaluate(() => {
    const p = parseToGraph('LUEFTER := TONOF(TASTER, 2, 3)');
    const f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode);
    const state = {}, timers = {};
    let t = 0;
    const fahre = (ein, sek) => { for (let i = 0; i < Math.round(sek * 1000 / 50); i++) { state.TASTER = ein; f(state, 50, timers); t += 0.05; } return !!state.LUEFTER; };
    const r = {};
    r.knoten = (p.graph.nodes.get('TONOF_LUEFTER') || {}).type;
    r.label = (p.graph.nodes.get('TONOF_LUEFTER') || {}).label;
    r.fehler = p.errors || p.error || null;
    r.a = fahre(true, 1.9);      // T_EIN noch nicht um
    r.b = fahre(true, 0.2);      // jetzt an
    r.c = fahre(false, 2.9);     // T_AUS läuft noch
    r.d = fahre(false, 0.2);     // aus
    r.e = fahre(true, 1.0); r.e2 = fahre(false, 0.5); r.e3 = fahre(true, 1.5); // Abfall vor T_EIN: neu anfangen
    r.f = fahre(true, 0.6);      // 1,5 + 0,6 = 2,1 s am Stück: an
    r.g = fahre(false, 2.0); r.h = fahre(true, 0.5); r.i = fahre(false, 2.9); // kommt während T_AUS wieder: bleibt an, T_AUS neu
    r.j = fahre(false, 0.2);
    return r;
  });
  ok('Baustein im Logikplan', lauf.knoten === 'TONOF' && /2s\/3s/.test(lauf.label), JSON.stringify(lauf));
  ok('nach 1,9 s noch aus', lauf.a === false);
  ok('nach 2,1 s an', lauf.b === true);
  ok('2,9 s nach Abfall noch an', lauf.c === true);
  ok('3,1 s nach Abfall aus', lauf.d === false);
  ok('Abfall vor Ablauf von T_EIN: T_EIN beginnt neu', lauf.e === false && lauf.e3 === false && lauf.f === true, JSON.stringify(lauf));
  ok('IN kommt während T_AUS wieder: bleibt an, T_AUS beginnt neu', lauf.g === true && lauf.h === true && lauf.i === true && lauf.j === false, JSON.stringify(lauf));

  console.log('Prüfung im Editor');
  const ex = await page.evaluate(() => ['LUEFTER := TONOF(TASTER, 2.0, 5.0)', 'LUEFTER := TONOF(TASTER, 2.0)', 'LUEFTER := TONOF(TASTER, 2.0, x)', 'L := A && TONOF(B, 1, 2)'].map(c => { const r = window._explainError(c); return r ? r.title : null; }));
  const fehlerzeilen = async c => { await page.evaluate(c => { const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, c); await w(1200); return page.evaluate(() => [...window._collectAllErrors()]); };
  const fz = await fehlerzeilen('LUEFTER := TONOF(TASTER, 2.0, 5.0)\nLAMPE := TON(LUEFTER, 1)\nX := TONOF_LUEFTER');
  ok('richtiger TONOF-Aufruf ohne Fehler im Editor', fz.length === 0, JSON.stringify(fz));
  const fz2 = await fehlerzeilen('LUEFTER := TONOF(TASTER, 2.0)');
  ok('TONOF mit zwei Argumenten: Zeile rot', fz2.includes(0), JSON.stringify(fz2));
  ok('zwei Argumente werden gemeldet', /Anzahl.*TONOF/.test(ex[1] || ''), ex[1]);
  ok('Zeit keine Zahl wird gemeldet', /TONOF/.test(ex[2] || ''), ex[2]);
  ok('TONOF mitten im Ausdruck wird gemeldet', !!ex[3], ex[3]);
  const hl = await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'L := TONOF(B, 1, 2)'; ta.dispatchEvent(new Event('input', { bubbles: true })); return document.getElementById('highlighting-content').innerHTML; });
  ok('Hervorhebung als Baustein', /token func">TONOF</.test(hl), hl.slice(0, 200));

  console.log('LOGO!-Ansicht');
  const lg = await page.evaluate(() => {
    const p = parseToGraph('LUEFTER := TONOF(TASTER, 2, 5)');
    const m = Logo.abbilden(p.graph, { eingaenge: p.inputs, ausgaenge: p.outputs, generatedQ: p.generatedQ, typen: {} });
    const b = m.bausteine.find(x => x.typ === 'TONOF');
    return { b: b ? { par: b.par, sek: b.sek, sek2: b.sek2 } : null, stufe: m.passt.stufe, zeilen: Logo.zeilen(m).map(z => z.text).join(' | ') };
  });
  ok('Abbildung auf Ein-/Ausschaltverzögerung mit Ta und Tb', lg.b && lg.b.par.map(p => p.n).join() === 'Ta,Tb' && lg.b.sek === 2 && lg.b.sek2 === 5, JSON.stringify(lg));
  ok('Bausteinliste nennt die Sonderfunktion', /Ein-\/Ausschaltverzögerung/.test(lg.zeilen), lg.zeilen.slice(0, 300));
  ok('passt in die LOGO!', lg.stufe === 'grund', lg.stufe);

  console.log('Auto-Schaltplan, Steckaufbau, FUP, SCL (E-Pneu)');
  await page.evaluate(() => { if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'LUEFTER := TONOF(TASTER, 2, 5)\nLAMPE := LUEFTER'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1500);
  const sp = await page.evaluate(() => {
    const cc = _iecDoc().getElementById('circuit-content');
    const spule = cc && cc.querySelector('[data-iec-role="coil"][data-ctype="tonof"]');
    const kontakt = cc && cc.querySelector('[data-iec-role="contact"][data-ctype="tonof"]');
    return { spule: !!spule, gefuellt: spule ? spule.querySelectorAll('rect[fill="#000"]').length : 0, kreuz: spule ? spule.querySelectorAll('line').length : 0,
      boegen: kontakt ? kontakt.querySelectorAll('.circ-moving-contact path').length : -1, asg: window._festoLastAssignments };
  });
  ok('Auto-Schaltplan: Spule mit Ansprech- und Rückfallverzögerung (Kreuz + gefülltes Feld)', sp.spule && sp.gefuellt === 1 && sp.kreuz >= 4, JSON.stringify(sp));
  ok('Auto-Schaltplan: Kontakt mit Bogen auf beiden Seiten', sp.boegen === 2, JSON.stringify(sp));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1500);
  const st = await page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const fn = [...svg.querySelectorAll('[data-festo-zr-funktion]')].map(t => t.textContent);
    const fk = svg.querySelector('[data-festo-fiktiv="tonof"]');
    return { asg: window._festoLastAssignments, fn, fiktiv: !!fk, titel: fk && fk.querySelector('title') ? fk.querySelector('title').textContent : '' };
  });
  ok('Steckaufbau: TONOF liegt auf dem Zeitrelais, Funktion TONOF', Object.values(st.asg || {}).includes('LUEFTER') && st.fn.includes('Funktion TONOF'), JSON.stringify(st));
  ok('Steckaufbau: rot „gibt es so nicht“ mit Erklärung', st.fiktiv && /162243/.test(st.titel), st.titel);
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  const scl = await page.evaluate(() => { try { window.exportSCL(); } catch (e) {} return (window._sclTabContent || {}).scl || ''; });
  ok('SCL: zwei TON-Instanzen und IF/ELSIF für die Ein-/Ausschaltverzögerung', /_EIN"\.TON\(IN := .*TASTER.*AND NOT #LUEFTER, PT := T#2000ms\)/.test(scl) && /_AUS"\.TON\(IN := NOT \(.*TASTER.*\) AND #LUEFTER, PT := T#5000ms\)/.test(scl) && /ELSIF/.test(scl), scl.split('\n').filter(l => /TONOF|_EIN|_AUS/.test(l)).join(' / ').slice(0, 400));
  await page.evaluate(() => { try { document.querySelectorAll('.modal, .scl-modal').forEach(m => m.style.display = 'none'); } catch (e) {} });

  console.log('Schaltplan-Editor');
  const ced = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('code').value = 'LUEFTER := TONOF(TASTER, 2, 5)\nLAMPE := LUEFTER';
    try { window.cedGenerateFromCode(); } catch (e) { return 'Fehler: ' + e.message; }
    await warte(300);
    try { return window.cedGenerateCode(true); } catch (e) { return 'Fehler: ' + e.message; }
  });
  ok('Rundlauf Code → Schaltplan-Editor → Code behält TONOF', /LUEFTER\s*:=\s*TONOF\(\s*TASTER\s*,\s*2(\.0)?\s*,\s*5(\.0)?\s*\)/.test(ced), String(ced).slice(0, 300));
  const ced2 = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ST = window._cedState;
    const spule = ST.components.find(c => c.varName === 'LUEFTER' && c.type === 'timer_tonof');
    const baustein = ST.components.some(c => c.type === 'baustein' && /TONOF/.test(c.codeText || ''));
    const r = { spule: !!spule, baustein, t1: spule && spule.timerTime, t2: spule && spule.timerTime2, kf: spule && spule.normPrefix };
    const svg = window._cedDoc().getElementById('ced-svg') || window._cedDoc().querySelector('#ced-canvas-area svg');
    if (spule && svg) {
      const g = svg.querySelector(`[data-id="${spule.id}"]`) || svg.querySelector(`g[data-comp-id="${spule.id}"]`);
      r.feld = !!(g && g.querySelector('rect[fill="#000"]'));
      r.zeit = g ? [...g.querySelectorAll('text')].map(t => t.textContent).join(' ') : '';
      const kontakt = ST.components.find(c => c.varName === 'LUEFTER' && window._cedTypen[c.type] && window._cedTypen[c.type].kind === 'aux');
      const gk = kontakt && (svg.querySelector(`[data-id="${kontakt.id}"]`) || svg.querySelector(`g[data-comp-id="${kontakt.id}"]`));
      r.boegen = gk ? gk.querySelectorAll('path').length : -1;
    }
    const pal = window._cedDoc().querySelector('.ced-pal-item[data-ctype="timer_tonof"]'); const tp = window._cedDoc().querySelector('.ced-pal-item[data-ctype="timer_tp"] svg');
    r.palette = !!pal && (!tp || !!pal.querySelector('svg'));
    if (spule) { spule.timerTime2 = 7; }
    await warte(50);
    r.code = window.cedGenerateCode(true);
    return r;
  });
  ok('Editor: TONOF wird ein Zeitrelais (Spule), kein Programmbaustein', ced2.spule && !ced2.baustein, JSON.stringify(ced2).slice(0, 300));
  ok('Editor: beide Zeiten an der Spule (2/5) und -KF', ced2.t1 === 2 && ced2.t2 === 5 && /2\/5/.test(ced2.zeit) && /KF/.test(ced2.kf || ''), JSON.stringify(ced2).slice(0, 300));
  ok('Editor: Spulensymbol mit gefülltem Feld, Kontakt mit zwei Bögen', ced2.feld && ced2.boegen >= 2, JSON.stringify(ced2).slice(0, 300));
  ok('Editor: Palette hat das Zeitrelais TONOF', ced2.palette);
  const ced3 = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code');
    const out = {};
    for (const c of ['OUT := TONOF(IN, 2, 5)', 'OUT := TON(IN, 2)', 'OUT := TOF(IN, 2)']) {
      ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(600);
      window.cedGenerateFromCode(); await warte(200);
      out[c] = { teile: window._cedState.components.map(k => k.type + ':' + (k.varName || '')).join(', '), code: window.cedGenerateCode(true).trim() };
    }
    return out;
  });
  Object.entries(ced3).forEach(([c, r]) => ok(`Editor: ${c} – zweiter Strang Kontakt → LED OUT wie im Auto-Plan, Code bleibt`, /relay_no:OUT/.test(r.teile) && /led:OUT/.test(r.teile) && r.code === c.replace(/\s+/g, ' ').replace(/ := /, ' := '), JSON.stringify(r)));
  ok('Editor: geänderte T_AUS geht in den Code', /LUEFTER\s*:=\s*TONOF\(\s*TASTER\s*,\s*2(\.0)?\s*,\s*7\s*\)/.test(ced2.code), String(ced2.code).slice(0, 200));

  console.log('FUP nach Norm (wie im TIA Portal)');
  const fup = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code'); ta.value = 'LUEFTER := TONOF(TASTER, 2, 5)\nLAMPE := LUEFTER'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(800);
    window.fbsFupMode = true;
    try { window._fupRender(currentGraph); } catch (e) { return { fehler: String(e) }; }
    const svg = (typeof _fbsDoc === 'function' ? _fbsDoc() : document).getElementById('fup-norm-svg');
    const texte = svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = false;
    return { texte };
  });
  const tx = (fup.texte || []);
  ok('FUP: kein erfundener TONOF-Kasten', tx.length > 0 && !tx.some(t => /TONOF|PT_EIN|PT_AUS/.test(t)), tx.join(' ').slice(0, 300));
  ok('FUP: zwei TON mit T#2s und T#5s, ein SR', tx.filter(t => t === 'TON').length === 2 && tx.includes('T#2s') && tx.includes('T#5s') && tx.includes('SR'), tx.join(' ').slice(0, 300));
  ok('FUP: Instanzen "LUEFTER_EIN"/"LUEFTER_AUS", Rückführung über LUEFTER', tx.includes('"LUEFTER_EIN"') && tx.includes('"LUEFTER_AUS"') && tx.filter(t => t === 'LUEFTER').length >= 3 && tx.includes('S') && tx.includes('R1'), tx.join(' ').slice(0, 300));

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
