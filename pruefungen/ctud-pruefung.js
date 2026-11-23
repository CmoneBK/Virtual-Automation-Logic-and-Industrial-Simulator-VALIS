const { chromium } = require('playwright');
// Vor-/Rückwärtszähler CTUD (IEC/TIA: CU, CD, R, LD, PV; Christoph 23.11.2026):
// Z = QU, dazu Z_QD und Z_CV. Ablauf, Editor, Ansichten.
//
//   node pruefungen/ctud-pruefung.js
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

  console.log('CTUD: Ablauf');
  const lauf = await page.evaluate(() => {
    const p = parseToGraph('Z := CTUD(REIN, RAUS, LEEREN, FUELLEN, 3)\nLEER := Z_QD\nWARN := Z_CV >= 2\nH := Z OR X');
    const f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode);
    const state = {}, timers = {}; const out = [];
    const z = (cu, cd, r, ld) => { Object.assign(state, { REIN: cu, RAUS: cd, LEEREN: r, FUELLEN: ld }); f(state, 50, timers); };
    const merk = () => out.push([!!state.Z, !!state.LEER, state.Z_CV, !!state.WARN]);
    z(0, 0, 0, 0); merk();                                   // Start: CV 0, QD
    z(1, 0, 0, 0); z(0, 0, 0, 0); z(1, 0, 0, 0); z(0, 0, 0, 0); merk(); // +2
    z(1, 0, 0, 0); z(1, 0, 0, 0); z(0, 0, 0, 0); merk();     // +1 = 3 → QU
    z(0, 1, 0, 0); z(0, 0, 0, 0); merk();                    // −1 = 2
    z(1, 1, 0, 0); z(0, 0, 0, 0); merk();                    // beide zugleich: bleibt 2
    z(0, 0, 0, 1); z(0, 0, 0, 0); merk();                    // LD: 3
    z(0, 0, 1, 1); merk();                                   // R vor LD: 0
    return { out, typ: (p.graph.nodes.get('CTUD_Z') || {}).type, pins: p.graph.edges.filter(e => e.targetId === 'CTUD_Z').map(e => e.sourceId + '.' + e.targetPin).join(), inputs: p.inputs.join() };
  });
  ok('Baustein CTUD mit CU, CD, R, LD', lauf.typ === 'CTUD' && lauf.pins === 'REIN.CU,RAUS.CD,LEEREN.R,FUELLEN.LD', JSON.stringify(lauf));
  ok('Z_QD und Z_CV sind keine Eingänge', !/Z_QD|Z_CV/.test(lauf.inputs), lauf.inputs);
  const E = JSON.stringify;
  ok('Start: CV 0, QD = 1, QU = 0', E(lauf.out[0]) === '[false,true,0,false]', E(lauf.out));
  ok('CU zählt hoch, QU ab PV', E(lauf.out[1]) === '[false,false,2,true]' && E(lauf.out[2]) === '[true,false,3,true]', E(lauf.out));
  ok('CD zählt ab, beide zugleich heben sich auf', E(lauf.out[3]) === '[false,false,2,true]' && E(lauf.out[4]) === '[false,false,2,true]', E(lauf.out));
  ok('LD lädt PV, R hat Vorrang', E(lauf.out[5]) === '[true,false,3,true]' && E(lauf.out[6]) === '[false,true,0,false]', E(lauf.out));

  console.log('Prüfung im Editor');
  const fehlerzeilen = async c => { await page.evaluate(c => { const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, c); await w(1200); return page.evaluate(() => [...window._collectAllErrors()]); };
  const CODE = 'Z := CTUD(REIN, RAUS, LEEREN, FALSE, 20)\nLAMPE_LEER := Z_QD\nWARN := Z_CV >= 18\nVOLL := Z';
  const fz = await fehlerzeilen(CODE);
  ok('richtiger Aufruf mit Z_QD/Z_CV ohne Fehler', fz.length === 0, JSON.stringify(fz));
  const ex = await page.evaluate(() => ['L := CTUD(A, B, 5)', 'L := CTUD(A, B, C, D, X)'].map(c => { const r = window._explainError(c); return r ? r.title : null; }));
  ok('CTUD mit drei Argumenten wird gemeldet', /Argumenten für CTUD/.test(ex[0] || ''), ex[0]);
  ok('CTUD ohne Zahl als Vorwahl wird gemeldet', /CTUD/.test(ex[1] || ''), ex[1]);
  const hl = await page.evaluate(() => document.getElementById('highlighting-content').innerHTML);
  ok('Hervorhebung als Baustein', /token func">CTUD</.test(hl), hl.slice(0, 200));
  ok('Beschreibung hinter „Weitere“', await page.evaluate(() => !!document.querySelector('[data-leg-ext-panel="weitere"] code[data-glossary="CTUD"]')));

  console.log('Logikplan, FUP, SCL');
  const v = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fbs-wrapper'); if (fw && fw.style.display === 'none') { try { toggleWorkspaceView('fbs-wrapper'); } catch (e) {} }
    await warte(900);
    const fbs = (typeof _fbsDoc === 'function' ? _fbsDoc() : document);
    const blk = fbs.querySelector('g[data-node-id="CTUD_Z"]');
    const plan = blk ? [...blk.querySelectorAll('text')].map(t => t.textContent) : [];
    const pinY = ['CU', 'CD', 'R', 'LD'].map(p => fbsFfPinY(currentGraph.nodes.get('CTUD_Z'), p, -1) - currentGraph.nodes.get('CTUD_Z').y);
    window.fbsFupMode = true;
    try { window._fupRender(currentGraph); } catch (e) { return { fehler: String(e) }; }
    const svg = fbs.getElementById('fup-norm-svg');
    const fup = svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = false;
    try { window.exportSCL(); } catch (e) {}
    const scl = (window._sclTabContent || {}).scl || '';
    try { document.querySelectorAll('.modal, .scl-modal').forEach(m => m.style.display = 'none'); } catch (e) {}
    return { plan, pinY, fup, scl };
  });
  ok('Logikplan: Kasten CTUD (20)', (v.plan || []).some(t => /^CTUD \(20\)/.test(t)), (v.plan || []).join(' ') + JSON.stringify(v.fehler || ''));
  ok('Logikplan: vier Eingänge untereinander', JSON.stringify(v.pinY) === '[15,35,55,75]', JSON.stringify(v.pinY));
  ok('FUP: Kasten CTUD mit CU, CD, R, LD, PV, QU, QD, CV', ['CTUD', 'CU', 'CD', 'R', 'LD', 'PV', 'QU', 'QD', 'CV', '20'].every(x => (v.fup || []).includes(x)), (v.fup || []).join(' ').slice(0, 300));
  const sl = (v.scl || '').split('\n');
  ok('SCL: IEC_COUNTER mit .CTUD(CU, CD, R, LD, PV)', /"_C_CTUD\d+" : IEC_COUNTER;/.test(v.scl) && /"_C_CTUD\d+"\.CTUD\(CU := .*REIN.*, CD := .*RAUS.*, R := .*LEEREN.*, LD := FALSE, PV := 20\);/.test(v.scl), sl.filter(l => /CTUD|Z_/.test(l)).join(' / ').slice(0, 500));
  ok('SCL: Z := QU, Z_QD := QD, Z_CV := CV (INT)', /#Z := "_C_CTUD\d+"\.QU;/.test(v.scl) && /#Z_QD := "_C_CTUD\d+"\.QD;/.test(v.scl) && /#Z_CV := "_C_CTUD\d+"\.CV;/.test(v.scl) && /Z_CV : INT;/.test(v.scl), sl.filter(l => /Z_|CTUD/.test(l)).join(' / ').slice(0, 500));

  console.log('Relais-Ansichten (E-Pneu)');
  await page.evaluate(() => { if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'Z := CTUD(REIN, RAUS, LEEREN, FUELLEN, 5)\nLAMPE := Z'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1500);
  const sp = await page.evaluate(() => {
    const cc = _iecDoc().getElementById('circuit-content');
    const spulen = [...cc.querySelectorAll('[data-iec-role="coil"]')].filter(e => e.getAttribute('data-iec-id') === 'CTUD_Z');
    return { typen: spulen.map(e => e.getAttribute('data-ctype')), texte: spulen.map(e => [...e.querySelectorAll('text')].map(x => x.textContent).join(' ')) };
  });
  ok('Auto-Schaltplan: vier Spulen +1, −1, (R), (LD)', JSON.stringify(sp.typen) === '["ctu","ctud_ab","relais","ctud_ld"]' && /\+1/.test(sp.texte[0]) && /−1/.test(sp.texte[1]) && /B1/.test(sp.texte[1]) && /R1/.test(sp.texte[2]) && /L1/.test(sp.texte[3]), JSON.stringify(sp));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1500);
  const st = await page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const asg = window._festoLastAssignments || {};
    const slot = Object.keys(asg).find(k => /^C/.test(k) && /Z/.test(asg[k] || ''));
    const fk = svg.querySelector('[data-festo-fiktiv="ctud"]');
    let kabel = []; try { kabel = (window.valisBruecke.festo().kabel || []).map(k => [k.von, k.nach]); } catch (e) {}
    const n = s => slot ? kabel.filter(k => k.includes(slot + '_' + s)).length : -1;
    return { slot, asg: JSON.stringify(asg).slice(0, 300), fiktiv: !!fk, titel: fk && fk.querySelector('title') ? fk.querySelector('title').textContent : '', buchsen: svg.querySelectorAll('[data-festo-ctud-buchse]').length,
      a1: n('A1'), b1: n('B1'), r1: n('R1'), l1: n('L1'), b2: n('B2'), l2: n('L2') };
  });
  ok('Steckaufbau: CTUD auf dem Vorwahlzähler', !!st.slot, JSON.stringify(st));
  ok('Steckaufbau: rot „gibt es so nicht“ mit Erklärung und B1/B2, L1/L2', st.fiktiv && /162355/.test(st.titel) && st.buchsen === 2, JSON.stringify(st));
  ok('Steckaufbau: Stränge auf A1, B1, R1, L1, Rückleiter B2, L2', [st.a1, st.b1, st.r1, st.l1, st.b2, st.l2].every(x => x >= 1), JSON.stringify(st));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  // Z_QD und Z_CV in den Relais-Ansichten: Kontakte bzw. Vergleich ohne Fehler
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'Z := CTUD(REIN, RAUS, FALSE, FALSE, 3)\nLEER := Z_QD\nWARN := Z_CV >= 2\nVOLL := Z'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1200);
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper')); await w(1200);
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper')); await w(300);
  const sim = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const p = parseToGraph(document.getElementById('code').value);
    return { outs: p.outputs ? [...p.outputs].join() : '', ins: p.inputs.join() };
  });
  ok('Z_QD/Z_CV sind Ausgänge, keine Eingänge', !/Z_QD|Z_CV/.test(sim.ins), JSON.stringify(sim));

  console.log('Elektroplan');
  const ced = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code');
    const out = {};
    for (const c of ['Z := CTUD(REIN, RAUS, LEEREN, FUELLEN, 5)\nLAMPE := Z', 'Z := CTUD(REIN, RAUS, FALSE, FALSE, 3)\nLEER := Z_QD\nVOLL := Z']) {
      ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(700);
      window.cedGenerateFromCode(); await warte(250);
      const ST = window._cedState;
      const k = ST.components.find(k => k.type === 'counter_ctud');
      const svgT = [...window._cedDoc().querySelectorAll('svg text')].map(t => t.textContent);
      out[c] = { teile: ST.components.map(k => k.type + ':' + (k.varName || '')).join(', '), code: window.cedGenerateCode(true).trim(),
        cd: k ? k.ctudCd : null, r: k ? k.ctuReset : null, ld: k ? k.ctudLd : null, pv: k ? k.ctuLimit : null, kf: k ? k.normPrefix : '', texte: svgT.filter(t => /Z↕|CD:|R:/.test(t)) };
    }
    out.palette = !!window._cedDoc().querySelector('.ced-pal-item[data-ctype="counter_ctud"]');
    return out;
  });
  const c1 = ced['Z := CTUD(REIN, RAUS, LEEREN, FUELLEN, 5)\nLAMPE := Z'], c2 = ced['Z := CTUD(REIN, RAUS, FALSE, FALSE, 3)\nLEER := Z_QD\nVOLL := Z'];
  ok('Elektroplan: Zählrelais vor/rück statt Programmbaustein', /counter_ctud:Z/.test(c1.teile) && !/baustein/.test(c1.teile), c1.teile);
  ok('Elektroplan: Vorwahl, CD, R, LD übernommen, -KF', c1.pv === 5 && c1.cd === 'RAUS' && c1.r === 'LEEREN' && c1.ld === 'FUELLEN' && /KF/.test(c1.kf), JSON.stringify(c1));
  ok('Elektroplan: Spule zeigt Z↕, R:, CD: und LD:', c1.texte.some(t => /Z↕/.test(t)) && c1.texte.some(t => /R: LEEREN/.test(t)) && c1.texte.some(t => /CD: RAUS LD: FUELLEN/.test(t)), JSON.stringify(c1.texte));
  ok('Elektroplan: Rundlauf behält CTUD(CU, CD, R, LD, PV)', /Z := CTUD\(REIN, RAUS, LEEREN, FUELLEN, 5\)/.test(c1.code), c1.code);
  ok('Elektroplan: mit Z_QD keine erfundene Zeile im Code', /Z := CTUD\(REIN, RAUS, FALSE, FALSE, 3\)/.test(c2.code) && /LEER := Z_QD/.test(c2.code) && !/\.cv/.test(c2.code), JSON.stringify(c2));
  ok('Elektroplan: Palette hat CTUD', ced.palette);

  console.log('LOGO!');
  const lg = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code');
    const erg = {};
    for (const c of ['Z := CTUD(REIN, RAUS, LEEREN, FALSE, 4)\nLAMPE := Z', 'Z := CTUD(REIN, RAUS, LEEREN, FUELLEN, 4)\nLAMPE := Z', 'Z := CTUD(REIN, RAUS, FALSE, FALSE, 4)\nLAMPE := Z\nLEER := Z_QD']) {
      ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(600);
      const m = Logo.aktuell();
      erg[c] = { typen: m.bausteine.map(b => b.typ).join(), stufe: m.passt.stufe, zeilen: Logo.zeilen(m).map(z => z.text).join(' | '), gruende: JSON.stringify(m.passt) };
    }
    return erg;
  });
  const [l1, l2, l3] = Object.values(lg);
  ok('LOGO!: Vor-/Rückwärtszähler mit zwei Flanken auf Cnt und Dir', /ANDF,ANDF,OR,CTU/.test(l1.typen) && /Ein = 4/.test(l1.zeilen) && l1.stufe !== 'nicht', JSON.stringify(l1).slice(0, 500));
  ok('LOGO!: Hinweis zu CU und CD im selben Zyklus', /selben Zyklus/.test(l1.gruende), l1.gruende.slice(0, 300));
  ok('LOGO!: R und LD zugleich geht nicht', l2.stufe === 'nicht' && /R und LD/.test(l2.gruende), l2.gruende.slice(0, 300));
  ok('LOGO!: Z_QD von Hand, mit Erklärung', /QD des CTUD/.test(l3.gruende), l3.gruende.slice(0, 300));

  // WEITER

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
