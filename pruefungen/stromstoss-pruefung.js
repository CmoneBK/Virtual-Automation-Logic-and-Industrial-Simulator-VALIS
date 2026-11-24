const { chromium } = require('playwright');
// Stromstoßrelais STROMSTOSS(TRG) / STROMSTOSS(TRG, R) (LOGO!-Sonderfunktion,
// Christoph 24.11.2026): jede steigende Flanke an TRG schaltet um, R (Zentral-
// Aus) schaltet aus und hat Vorrang. Ablauf, Editor, Logikplan, FUP wie in TIA
// gebaut (R_TRIG + XOR + &), SCL, LOGO!, Auto-Schaltplan, Steckaufbau, Elektroplan.
//
//   node pruefungen/stromstoss-pruefung.js
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


  console.log('Ablauf');
  const lauf = await page.evaluate(() => {
    const p = parseToGraph('L := STROMSTOSS(T, AUS)\nH := L OR X');
    const f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode);
    const state = {}, timers = {}; const out = [];
    const z = (t, r) => { state.T = t; state.AUS = r; f(state, 50, timers); f(state, 50, timers); out.push(state.L ? 1 : 0); };
    z(1, 0); z(0, 0); z(1, 0); z(0, 0); z(1, 0); z(1, 0); z(0, 0); z(0, 1); z(1, 1); z(0, 0);
    const p1 = parseToGraph('L := STROMSTOSS(T)'); const f1 = new Function('state', 'deltaMs', 'timers', p1.jsCompiledCode);
    const s1 = {}, t1 = {}, o1 = []; [1, 0, 1, 0].forEach(v => { s1.T = !!v; f1(s1, 50, t1); o1.push(s1.L ? 1 : 0); });
    return { out: out.join(''), o1: o1.join(''), typ: (p.graph.nodes.get('STROMSTOSS_L') || {}).type, pins: p.graph.edges.filter(e => e.targetId === 'STROMSTOSS_L').map(e => e.sourceId + '.' + e.targetPin).join() };
  });
  ok('Baustein STROMSTOSS mit TRG und R', lauf.typ === 'STROMSTOSS' && lauf.pins === 'T.TRG,AUS.R', JSON.stringify(lauf));
  ok('Jede steigende Flanke schaltet um, Halten ändert nichts', lauf.out.slice(0, 7) === '1100111', lauf.out);
  ok('R schaltet aus und hat Vorrang vor TRG', lauf.out.slice(7) === '000', lauf.out);
  ok('Ohne R: STROMSTOSS(TRG)', lauf.o1 === '1100', lauf.o1);

  console.log('Prüfung im Editor');
  const fehlerzeilen = async c => { await page.evaluate(c => { const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, c); await w(1200); return page.evaluate(() => [...window._collectAllErrors()]); };
  for (const c of ['LICHT := STROMSTOSS(TASTER)', 'LICHT := STROMSTOSS(TASTER, ZENTRAL_AUS)', 'LICHT := STROMSTOSS(T1 OR T2; MERK)\nLAMPE := LICHT'])
    ok('ohne Fehler im Editor: ' + c.replace(/\n/g, ' / '), (await fehlerzeilen(c)).length === 0);
  const ex = await page.evaluate(() => ['L := STROMSTOSS()', 'L := STROMSTOSS(A, B, C)', 'L := C && STROMSTOSS(A)'].map(c => { const r = window._explainError(c); return r ? r.title : null; }));
  ok('STROMSTOSS ohne Argument wird gemeldet', /STROMSTOSS/.test(ex[0] || ''), ex[0]);
  ok('STROMSTOSS mit drei Argumenten wird gemeldet', /STROMSTOSS/.test(ex[1] || ''), ex[1]);
  ok('STROMSTOSS mitten im Ausdruck wird gemeldet', !!ex[2], ex[2]);
  const hl = await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'L := STROMSTOSS(A)'; ta.dispatchEvent(new Event('input', { bubbles: true })); return document.getElementById('highlighting-content').innerHTML; });
  ok('Hervorhebung als Baustein', /token func">STROMSTOSS</.test(hl), hl.slice(0, 200));
  const doku = await page.evaluate(() => ({ leg: !!document.querySelector('[data-leg-ext-panel="weitere"] code[data-glossary="STROMSTOSS"]'), en: !!(window.i18n && JSON.stringify(window.i18n).includes('Pulse relay')) }));
  ok('Beschreibung hinter „Weitere“ (DE/EN)', doku.leg && doku.en, JSON.stringify(doku));

  console.log('Logikplan, FUP, LOGO!, SCL');
  const v = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fbs-wrapper'); if (fw && fw.style.display === 'none') { try { toggleWorkspaceView('fbs-wrapper'); } catch (e) {} }
    const ta = document.getElementById('code'); ta.value = 'LICHT := STROMSTOSS(TASTER, AUS)'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(900);
    const fbs = (typeof _fbsDoc === 'function' ? _fbsDoc() : document);
    const blk = fbs.querySelector('g[data-node-id="STROMSTOSS_LICHT"]');
    const plan = blk ? [...blk.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = true;
    try { window._fupRender(currentGraph); } catch (e) { return { fehler: String(e) }; }
    const svg = fbs.getElementById('fup-norm-svg');
    const fup = svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = false;
    const m = Logo.aktuell();
    const logo = { typen: m.bausteine.map(b => b.typ), stufe: m.passt.stufe, zeilen: Logo.zeilen(m).map(z => z.text).join(' | '), gruende: JSON.stringify(m.passt) };
    try { window.exportSCL(); } catch (e) {}
    const scl = (window._sclTabContent || {}).scl || '';
    try { document.querySelectorAll('.modal, .scl-modal').forEach(m => m.style.display = 'none'); } catch (e) {}
    // LOGO!-Simulation gleich VALIS
    const p = parseToGraph(ta.value); const f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode);
    const state = {}, timers = {}, z = Logo.neuerZustand(); let gleich = true;
    [[1,0],[0,0],[1,0],[0,0],[1,0],[0,1],[1,1],[0,0],[1,0]].forEach(([t, r]) => { const e = { TASTER: !!t, AUS: !!r }; Object.assign(state, e); f(state, 50, timers); const la = Logo.zyklus(m, z, e, 50); if (!!la.LICHT !== !!state.LICHT) gleich = false; });
    return { plan, fup, logo, scl, gleich };
  });
  ok('Logikplan: Kasten Stromstoß', (v.plan || []).some(x => /Stromstoß/.test(x)), JSON.stringify(v.plan || v));
  ok('FUP: wie in TIA gebaut (R_TRIG, X, &)', ['R_TRIG', 'X', '&', 'CLK'].every(x => (v.fup || []).includes(x)) && !(v.fup || []).includes('STROMSTOSS'), (v.fup || []).join(' ').slice(0, 300));
  ok('LOGO!: Sonderfunktion Stromstoßrelais mit Trg und R', v.logo && /Stromstoßrelais/.test(v.logo.zeilen) && /Trg ← /.test(v.logo.zeilen) && /R ← /.test(v.logo.zeilen) && v.logo.stufe !== 'nicht', JSON.stringify(v.logo).slice(0, 500));
  ok('LOGO!: schaltet gleich wie VALIS', v.gleich);
  ok('SCL: Flanke R_TRIG und XOR mit Rücksetzen', /R_TRIG/.test(v.scl) && /#LICHT := \(#LICHT XOR "[^"]+"\.Q\) AND NOT #AUS;|#LICHT := \(#LICHT XOR #?[A-Za-z_]+\) AND NOT/.test(v.scl), v.scl.split('\n').filter(l => /LICHT|TRIG/.test(l)).join(' / ').slice(0, 500));

  console.log('Relais-Ansichten (E-Pneu)');
  await page.evaluate(() => { if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'LICHT := STROMSTOSS(TASTER, AUS)\nLAMPE := LICHT'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1500);
  const sp = await page.evaluate(() => {
    const cc = _iecDoc().getElementById('circuit-content');
    const spulen = [...cc.querySelectorAll('[data-iec-role="coil"]')].filter(e => /LICHT/.test(e.getAttribute('data-iec-id')));
    const k = cc.querySelector('[data-iec-role="contact"][data-ctype="stromstoss"]');
    return { typen: spulen.map(e => e.getAttribute('data-ctype')), texte: spulen.map(e => [...e.querySelectorAll('text')].map(x => x.textContent).join(' ')), kontakt: !!k };
  });
  ok('Auto-Schaltplan: Spule ⇅ und Rücksetzspule R1/R2', sp.typen.includes('stromstoss') && sp.typen.includes('stromstoss_r') && sp.texte.some(t => /⇅/.test(t)) && sp.texte.some(t => /R1/.test(t)), JSON.stringify(sp));
  ok('Auto-Schaltplan: Kontakt des Stromstoßrelais schaltet die Lampe', sp.kontakt, JSON.stringify(sp));
  // Umschalten in der Ansicht: Taster drücken
  await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(300);
  const t = async (n, v2) => { await page.evaluate(([n, v2]) => setTaster(n, v2), [n, v2]); await w(250); };
  await t('TASTER', true); await t('TASTER', false);
  const an = await page.evaluate(() => !!spsState.LAMPE);
  await t('TASTER', true); await t('TASTER', false);
  const aus = await page.evaluate(() => !spsState.LAMPE);
  await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); });
  ok('Simulation: einmal drücken an, nochmal drücken aus', an && aus, JSON.stringify({ an, aus }));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1500);
  const st = await page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const fn = [...svg.querySelectorAll('[data-festo-zr-funktion]')].map(t => t.textContent);
    const fk = svg.querySelector('[data-festo-fiktiv="stromstoss"]');
    const asg = window._festoLastAssignments || {};
    const slot = Object.keys(asg).find(k => /^Z/.test(k) && asg[k] && /LICHT/.test(asg[k]));
    let kabel = []; try { kabel = (window.valisBruecke.festo().kabel || []).map(k => ({ fromKey: k.von, toKey: k.nach })); } catch (e) {}
    return { asg, slot, fn, fiktiv: !!fk, titel: fk && fk.querySelector('title') ? fk.querySelector('title').textContent : '',
      kabelR1: slot ? kabel.filter(c => c.fromKey === slot + '_R1' || c.toKey === slot + '_R1').length : -1,
      kabelA1: slot ? kabel.filter(c => c.fromKey === slot + '_A1' || c.toKey === slot + '_A1').length : -1 };
  });
  ok('Steckaufbau: auf dem Zeitrelais, Funktion Stromstoß', !!st.slot && st.fn.includes('Funktion Stromstoß'), JSON.stringify(st).slice(0, 400));
  ok('Steckaufbau: rot „gibt es so nicht“ mit Erklärung', st.fiktiv && /162243/.test(st.titel) && /Zentral-Aus/.test(st.titel), st.titel);
  ok('Steckaufbau: Strang auf A1, Zentral-Aus auf R1', st.kabelR1 >= 1 && st.kabelA1 >= 1, JSON.stringify({ r1: st.kabelR1, a1: st.kabelA1 }));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));

  console.log('Elektroplan');
  const ced = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code');
    const out = {};
    for (const c of ['LICHT := STROMSTOSS(TASTER, AUS)\nLAMPE := LICHT', 'LICHT := STROMSTOSS(TASTER)']) {
      ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(700);
      window.cedGenerateFromCode(); await warte(250);
      const ST = window._cedState;
      const k = ST.components.find(k => k.type === 'relay_stromstoss');
      out[c] = { teile: ST.components.map(k => k.type + ':' + (k.varName || '')).join(', '), code: window.cedGenerateCode(true).trim(), reset: k ? k.stromReset : null, kf: k ? k.normPrefix : '' };
    }
    out.palette = !!window._cedDoc().querySelector('.ced-pal-item[data-ctype="relay_stromstoss"]');
    return out;
  });
  const c1 = ced['LICHT := STROMSTOSS(TASTER, AUS)\nLAMPE := LICHT'], c2 = ced['LICHT := STROMSTOSS(TASTER)'];
  ok('Elektroplan: Stromstoßrelais statt Programmbaustein', /relay_stromstoss:LICHT/.test(c1.teile) && !/baustein/.test(c1.teile), c1.teile);
  ok('Elektroplan: Zentral-Aus übernommen, -KF', c1.reset === 'AUS' && /KF/.test(c1.kf), JSON.stringify(c1));
  ok('Elektroplan: Rundlauf behält STROMSTOSS(TRG, R)', /LICHT := STROMSTOSS\(TASTER, AUS\)/.test(c1.code), c1.code);
  ok('Elektroplan: Rundlauf ohne R', /LICHT := STROMSTOSS\(TASTER\)/.test(c2.code), JSON.stringify(c2));
  ok('Elektroplan: Palette hat das Stromstoßrelais', ced.palette);

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
