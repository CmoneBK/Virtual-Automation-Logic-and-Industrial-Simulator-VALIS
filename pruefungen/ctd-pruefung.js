const { chromium } = require('playwright');
// Rückwärtszähler CTD (IEC/TIA: CD, LD, PV; Christoph 23.11.2026): Ablauf,
// Editor, Logikplan, FUP, LOGO!, SCL, Relais-Ansichten.
//
//   node pruefungen/ctd-pruefung.js
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

  console.log('CTD: Ablauf');
  const lauf = await page.evaluate(() => {
    const p = parseToGraph('LEER := CTD(TEIL, VOLL, 3)\nH := LEER OR X');
    const f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode);
    const state = {}, timers = {}; const out = [];
    const z = (cd, ld) => { state.TEIL = cd; state.VOLL = ld; f(state, 50, timers); };
    const merk = () => out.push([!!state.LEER, timers['CTD_LEER'].cv]);
    z(false, false); merk();                 // Start: CV = 0, Q = 1
    z(false, true); z(false, false); merk(); // Laden: CV = 3, Q = 0
    for (let k = 0; k < 2; k++) { z(true, false); z(true, false); z(false, false); } merk(); // zwei Impulse
    z(true, false); z(false, false); merk(); // dritter: CV = 0, Q = 1
    z(true, false); z(false, false); merk(); // weiter: CV = -1, Q bleibt 1
    z(true, true); merk();                   // LD hat Vorrang
    return { out, typ: (p.graph.nodes.get('CTD_LEER') || {}).type, pins: p.graph.edges.filter(e => e.targetId === 'CTD_LEER').map(e => e.sourceId + '.' + e.targetPin).join() };
  });
  ok('Baustein CTD im Logikplan mit CD und LD', lauf.typ === 'CTD' && lauf.pins === 'TEIL.CD,VOLL.LD', JSON.stringify(lauf));
  ok('Start bei 0 (Q = 1), Laden setzt PV', JSON.stringify(lauf.out.slice(0, 2)) === '[[true,0],[false,3]]', JSON.stringify(lauf.out));
  ok('jede steigende Flanke zählt 1 ab, Q bei 0', JSON.stringify(lauf.out.slice(2, 4)) === '[[false,1],[true,0]]', JSON.stringify(lauf.out));
  ok('unter 0 bleibt Q, LD hat Vorrang', JSON.stringify(lauf.out.slice(4)) === '[[true,-1],[false,3]]', JSON.stringify(lauf.out));

  console.log('Prüfung im Editor');
  const fehlerzeilen = async c => { await page.evaluate(c => { const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, c); await w(1200); return page.evaluate(() => [...window._collectAllErrors()]); };
  const fz = await fehlerzeilen('LEER := CTD(TEIL, VOLL, 20)\nLAMPE := LEER');
  ok('richtiger Aufruf ohne Fehler im Editor', fz.length === 0, JSON.stringify(fz));
  const ex = await page.evaluate(() => ['L := CTD(A, 5)', 'L := CTD(A, B, X)', 'L := C && CTD(A, B, 5)'].map(c => { const r = window._explainError(c); return r ? r.title : null; }));
  ok('CTD mit zwei Argumenten wird gemeldet', /Argumenten für CTD/.test(ex[0] || ''), ex[0]);
  ok('CTD ohne Zahl als Vorwahl wird gemeldet', /CTD/.test(ex[1] || ''), ex[1]);
  ok('CTD mitten im Ausdruck wird gemeldet', !!ex[2], ex[2]);
  const hl = await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'L := CTD(A, B, 5)'; ta.dispatchEvent(new Event('input', { bubbles: true })); return document.getElementById('highlighting-content').innerHTML; });
  ok('Hervorhebung als Baustein', /token func">CTD</.test(hl), hl.slice(0, 200));
  ok('Beschreibung hinter „Weitere“', await page.evaluate(() => !!document.querySelector('[data-leg-ext-panel="weitere"] code[data-glossary="CTD"]')));

  console.log('Logikplan, FUP, LOGO!, SCL');
  const v = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fbs-wrapper'); if (fw && fw.style.display === 'none') { try { toggleWorkspaceView('fbs-wrapper'); } catch (e) {} }
    const ta = document.getElementById('code'); ta.value = 'LEER := CTD(TEIL, VOLL, 20)\nLAMPE := LEER'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(900);
    const fbs = (typeof _fbsDoc === 'function' ? _fbsDoc() : document);
    const blk = fbs.querySelector('g[data-node-id="CTD_LEER"]');
    const plan = blk ? [...blk.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = true;
    try { window._fupRender(currentGraph); } catch (e) { return { fehler: String(e) }; }
    const svg = fbs.getElementById('fup-norm-svg');
    const fup = svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = false;
    const m = Logo.aktuell();
    const logo = { typen: m.bausteine.map(b => b.typ), stufe: m.passt.stufe, zeilen: Logo.zeilen(m).map(z => z.text).join(' | '), gruende: JSON.stringify(m.passt) };
    // LOGO!-Simulation nach dem ersten Laden wie VALIS
    const p = parseToGraph(ta.value); const f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode);
    const state = {}, timers = {}, z = Logo.neuerZustand(); let gleich = true;
    const folge = [[false, true], [false, false]]; for (let i = 0; i < 25; i++) folge.push([true, false], [false, false]); folge.push([false, true], [true, false]);
    folge.forEach(([cd, ld]) => { const e = { TEIL: cd, VOLL: ld }; Object.assign(state, e); f(state, 50, timers); const la = Logo.zyklus(m, z, e, 50); if (!!la.LAMPE !== !!state.LAMPE) gleich = false; });
    try { window.exportSCL(); } catch (e) {}
    const scl = (window._sclTabContent || {}).scl || '';
    try { document.querySelectorAll('.modal, .scl-modal').forEach(m => m.style.display = 'none'); } catch (e) {}
    return { plan, fup, logo, gleich, scl };
  });
  ok('Logikplan: Kasten CTD (20)', (v.plan || []).some(t => /^CTD \(20\)/.test(t)), (v.plan || []).join(' '));
  ok('FUP: Kasten CTD mit CD, LD, PV, Q, CV', ['CTD', 'CD', 'LD', 'PV', 'Q', 'CV', '20'].every(x => (v.fup || []).includes(x)), (v.fup || []).join(' ').slice(0, 300));
  ok('LOGO!: Vor-/Rückwärtszähler mit StartVal, Dir = hi und NOT', v.logo && /StartVal = 20/.test(v.logo.zeilen) && /Dir = hi/.test(v.logo.zeilen) && v.logo.typen.includes('NOT'), JSON.stringify(v.logo).slice(0, 500));
  ok('LOGO!: Hinweis auf den Start vor dem ersten Laden', /ersten Laden/.test(v.logo.gruende), v.logo.gruende.slice(0, 300));
  ok('LOGO!: nach dem Laden gleich wie VALIS', v.gleich === true);
  ok('SCL: IEC_COUNTER mit .CTD(CD, LD, PV)', /"_C_CTD\d+" : IEC_COUNTER;/.test(v.scl) && /"_C_CTD\d+"\.CTD\(CD := .*TEIL.*, LD := .*VOLL.*, PV := 20\);/.test(v.scl), v.scl.split('\n').filter(l => /CTD/.test(l)).join(' / ').slice(0, 400));

  console.log('Relais-Ansichten (E-Pneu)');
  await page.evaluate(() => { if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'LEER := CTD(TEIL, VOLL, 5)\nLAMPE := LEER'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1500);
  const sp = await page.evaluate(() => {
    const cc = _iecDoc().getElementById('circuit-content');
    const spulen = [...cc.querySelectorAll('[data-iec-role="coil"]')].filter(e => /LEER/.test(e.getAttribute('data-iec-id')));
    return { typen: spulen.map(e => e.getAttribute('data-ctype')), texte: spulen.map(e => [...e.querySelectorAll('text')].map(x => x.textContent).join(' ')) };
  });
  ok('Auto-Schaltplan: Zählspule −1 und zweite Spule (R)', sp.typen.includes('ctd') && sp.texte.some(t => /−1/.test(t)) && sp.texte.some(t => /\(R\)/.test(t) && /R1/.test(t)), JSON.stringify(sp));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1500);
  const st = await page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const asg = window._festoLastAssignments || {};
    const slot = Object.keys(asg).find(k => /^C/.test(k) && /LEER/.test(asg[k] || ''));
    const fk = svg.querySelector('[data-festo-fiktiv="ctd"]');
    let kabel = []; try { kabel = (window.valisBruecke.festo().kabel || []).map(k => [k.von, k.nach]); } catch (e) {}
    const vor = [...svg.querySelectorAll('[data-festo-zaehler-vorwahl]')].map(t => t.textContent).join('');
    return { slot, fiktiv: !!fk, titel: fk && fk.querySelector('title') ? fk.querySelector('title').textContent : '', vor,
      r1: slot ? kabel.filter(k => k.includes(slot + '_R1')).length : -1, a1: slot ? kabel.filter(k => k.includes(slot + '_A1')).length : -1 };
  });
  ok('Steckaufbau: CTD auf dem Vorwahlzähler, Vorwahl 005', !!st.slot && /005/.test(st.vor), JSON.stringify(st));
  ok('Steckaufbau: rot „gibt es so nicht“ mit Erklärung', st.fiktiv && /162355/.test(st.titel), st.titel);
  ok('Steckaufbau: Zählstrang auf A1, Ladestrang auf R1', st.a1 >= 1 && st.r1 >= 1, JSON.stringify(st));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));

  console.log('Elektroplan');
  const ced = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code');
    const out = {};
    for (const c of ['LEER := CTD(TEIL, VOLL, 5)\nM := SR(LEER, AUS)\nLAMPE := M', 'OUT := CTD(IN, LAD, 4)']) {
      ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(700);
      window.cedGenerateFromCode(); await warte(250);
      const ST = window._cedState;
      const k = ST.components.find(k => k.type === 'counter_ctd');
      const svgT = [...window._cedDoc().querySelectorAll('svg text')].map(t => t.textContent);
      out[c] = { teile: ST.components.map(k => k.type + ':' + (k.varName || '')).join(', '), code: window.cedGenerateCode(true).trim(),
        lad: k ? k.ctuReset : null, pv: k ? k.ctuLimit : null, kf: k ? k.normPrefix : '', texte: svgT.filter(t => /Z↓|LD:/.test(t)) };
    }
    out.palette = !!window._cedDoc().querySelector('.ced-pal-item[data-ctype="counter_ctd"]');
    return out;
  });
  const c1 = ced['LEER := CTD(TEIL, VOLL, 5)\nM := SR(LEER, AUS)\nLAMPE := M'], c2 = ced['OUT := CTD(IN, LAD, 4)'];
  ok('Elektroplan: Zählrelais rückwärts statt Programmbaustein', /counter_ctd:LEER/.test(c1.teile) && !/baustein/.test(c1.teile), c1.teile);
  ok('Elektroplan: Vorwahl und Laden übernommen, -KF', c1.pv === 5 && c1.lad === 'VOLL' && /KF/.test(c1.kf), JSON.stringify(c1));
  ok('Elektroplan: Spule zeigt Z↓ und LD:', c1.texte.some(t => /Z↓/.test(t)) && c1.texte.some(t => /LD: VOLL/.test(t)), JSON.stringify(c1.texte));
  ok('Elektroplan: Rundlauf behält CTD(CD, LD, PV)', /LEER := CTD\(TEIL, VOLL, 5\)/.test(c1.code), c1.code);
  ok('Elektroplan: CTD auf Ausgang', /OUT := CTD\(IN, LAD, 4\)/.test(c2.code), JSON.stringify(c2));
  ok('Elektroplan: Palette hat CTD', ced.palette);

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
