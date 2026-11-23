const { chromium } = require('playwright');
// Speichernde Einschaltverzögerung TONR (IEC/TIA: IN, R, PT; Christoph
// 23.11.2026): Ablauf, Editor, Logikplan, FUP, LOGO!, SCL, Relais-Ansichten.
//
//   node pruefungen/tonr-pruefung.js
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


  console.log('TONR: Ablauf');
  const lauf = await page.evaluate(() => {
    const p = parseToGraph('L := TONR(T1, T2, 3)\nH := L OR X');
    const f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode);
    const state = {}, timers = {}; const out = [];
    const z = (a, b, n) => { state.T1 = a; state.T2 = b; for (let i = 0; i < n; i++) f(state, 100, timers); out.push([!!state.L, Math.round(timers['TONR_L'].et)]); };
    z(true, false, 20); z(false, false, 10); z(true, false, 9); z(true, false, 2); z(false, false, 5); z(false, true, 1); z(false, false, 1); z(true, true, 40);
    return { out, typ: (p.graph.nodes.get('TONR_L') || {}).type, pins: p.graph.edges.filter(e => e.targetId === 'TONR_L').map(e => e.sourceId + '.' + e.targetPin).join() };
  });
  ok('Baustein TONR im Logikplan mit IN und R', lauf.typ === 'TONR' && lauf.pins === 'T1.IN,T2.R', JSON.stringify(lauf));
  ok('Zeit läuft bei IN = 1 und bleibt bei IN = 0 stehen', JSON.stringify(lauf.out.slice(0, 3)) === '[[false,2000],[false,2000],[false,2900]]', JSON.stringify(lauf.out));
  ok('Q nach 3 s insgesamt, ET bleibt bei PT', JSON.stringify(lauf.out[3]) === '[true,3000]', JSON.stringify(lauf.out));
  ok('Q bleibt bei IN = 0 bis R', JSON.stringify(lauf.out[4]) === '[true,3000]', JSON.stringify(lauf.out));
  ok('R setzt Zeit und Q zurück, R hat Vorrang', JSON.stringify(lauf.out.slice(5)) === '[[false,0],[false,0],[false,0]]', JSON.stringify(lauf.out));

  console.log('Prüfung im Editor');
  const fehlerzeilen = async c => { await page.evaluate(c => { const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, c); await w(1200); return page.evaluate(() => [...window._collectAllErrors()]); };
  const fz = await fehlerzeilen('BETRIEB := TONR(MOTOR_LAEUFT, QUITT, 10.0)\nLAMPE := BETRIEB');
  ok('richtiger Aufruf ohne Fehler im Editor', fz.length === 0, JSON.stringify(fz));
  const ex = await page.evaluate(() => ['L := TONR(A, 5)', 'L := TONR(A, B, X)', 'L := C && TONR(A, B, 5)'].map(c => { const r = window._explainError(c); return r ? r.title : null; }));
  ok('TONR mit zwei Argumenten wird gemeldet', /Argumenten für TONR/.test(ex[0] || ''), ex[0]);
  ok('TONR ohne Zeit an dritter Stelle wird gemeldet', /TONR/.test(ex[1] || ''), ex[1]);
  ok('TONR mitten im Ausdruck wird gemeldet', !!ex[2], ex[2]);
  const hl = await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'L := TONR(A, B, 5)'; ta.dispatchEvent(new Event('input', { bubbles: true })); return document.getElementById('highlighting-content').innerHTML; });
  ok('Hervorhebung als Baustein', /token func">TONR</.test(hl), hl.slice(0, 200));
  const doku = await page.evaluate(() => ({ leg: !!document.querySelector('[data-leg-ext-panel="weitere"] code[data-glossary="TONR"]'), en: !!(window.i18n && JSON.stringify(window.i18n).includes('Retentive on-delay')) }));
  ok('Beschreibung hinter „Weitere“', doku.leg, JSON.stringify(doku));

  console.log('Logikplan, FUP, LOGO!, SCL');
  const code = 'BETRIEB := TONR(MOTOR, QUITT, 120)\nLAMPE := BETRIEB';
  const v = await page.evaluate(async (code) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fbs-wrapper'); if (fw && fw.style.display === 'none') { try { toggleWorkspaceView('fbs-wrapper'); } catch (e) {} }
    const ta = document.getElementById('code'); ta.value = code; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(900);
    const fbs = (typeof _fbsDoc === 'function' ? _fbsDoc() : document);
    const blk = fbs.querySelector('g[data-node-id="TONR_BETRIEB"]');
    const plan = blk ? [...blk.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = true;
    try { window._fupRender(currentGraph); } catch (e) { return { fehler: String(e) }; }
    const svg = fbs.getElementById('fup-norm-svg');
    const fup = svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = false;
    const p = window._logoProgramm ? window._logoProgramm() : null;
    const m = Logo.aktuell ? Logo.aktuell() : null;
    const logo = m ? { typen: m.bausteine.map(b => b.typ), stufe: m.passt.stufe, zeilen: Logo.zeilen(m).map(z => z.text).join(' | '), gruende: JSON.stringify(m.passt) } : null;
    try { window.exportSCL(); } catch (e) {}
    const scl = (window._sclTabContent || {}).scl || '';
    try { document.querySelectorAll('.modal, .scl-modal').forEach(m => m.style.display = 'none'); } catch (e) {}
    ta.value = 'BETRIEB := TONR(MOTOR, QUITT, 10)\nLAMPE := BETRIEB'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(900);
    const m2 = Logo.aktuell();
    return { plan, fup, logo, scl, sek: { stufe: m2.passt.stufe, text: JSON.stringify(m2.passt) } };
  }, code);
  ok('Logikplan: Kasten TONR (120s)', (v.plan || []).some(t => /^TONR \(120s\)/.test(t)), (v.plan || []).join(' '));
  ok('FUP: Kasten TONR mit IN, R, PT, Q, ET', ['TONR', 'IN', 'R', 'PT', 'Q', 'ET', 'T#120s'].every(x => (v.fup || []).includes(x)), (v.fup || []).join(' ').slice(0, 300));
  ok('LOGO!: Betriebsstundenzähler mit MI = 00:02 h', v.logo && v.logo.typen.includes('BSZ') && /Betriebsstundenzähler/.test(v.logo.zeilen) && /MI = 00:02 h/.test(v.logo.zeilen) && /En ← /.test(v.logo.zeilen) && /R ← /.test(v.logo.zeilen), JSON.stringify(v.logo).slice(0, 500));
  ok('LOGO!: ganze Minuten passen', v.logo && v.logo.stufe !== 'nicht', v.logo && v.logo.gruende.slice(0, 300));
  ok('LOGO!: Sekunden gehen nicht, mit Grund', v.sek.stufe === 'nicht' && /Minuten/.test(v.sek.text), v.sek.text.slice(0, 300));
  ok('SCL: IEC_TIMER mit .TONR(IN, R, PT)', /"_T_TONR\d+" : IEC_TIMER;/.test(v.scl) && /"_T_TONR\d+"\.TONR\(IN := .*MOTOR.*, R := .*QUITT.*, PT := T#120000ms\);/.test(v.scl), v.scl.split('\n').filter(l => /TONR/.test(l)).join(' / ').slice(0, 400));

  console.log('Relais-Ansichten (E-Pneu)');
  await page.evaluate(() => { if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'BETRIEB := TONR(MOTOR, QUITT, 10)\nM := SR(BETRIEB, AUS)\nLAMPE := M'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1500);
  const sp = await page.evaluate(() => {
    const cc = _iecDoc().getElementById('circuit-content');
    const spulen = [...cc.querySelectorAll('[data-iec-role="coil"]')].filter(e => e.getAttribute('data-iec-id') === 'TONR_BETRIEB' || e.getAttribute('data-iec-id') === 'BETRIEB');
    const k = cc.querySelector('[data-iec-role="contact"][data-ctype="tonr"]');
    return { typen: spulen.map(e => e.getAttribute('data-ctype')), texte: spulen.map(e => [...e.querySelectorAll('text')].map(x => x.textContent).join(' ')), boegen: k ? k.querySelectorAll('.circ-moving-contact path').length : -1 };
  });
  ok('Auto-Schaltplan: Spule mit Σ und Rücksetzspule R1/R2', sp.typen.includes('tonr') && sp.typen.includes('tonr_r') && sp.texte.some(t => /Σ/.test(t)) && sp.texte.some(t => /R1/.test(t) && /\(R\)/.test(t)), JSON.stringify(sp));
  ok('Auto-Schaltplan: Kontakt verzögert (Bogen)', sp.boegen === 1, JSON.stringify(sp));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1500);
  const st = await page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const fn = [...svg.querySelectorAll('[data-festo-zr-funktion]')].map(t => t.textContent);
    const fk = svg.querySelector('[data-festo-fiktiv="tonr"]');
    const asg = window._festoLastAssignments || {};
    const slot = Object.keys(asg).find(k => /^Z/.test(k) && asg[k] && /BETRIEB/.test(asg[k]));
    let kabel = []; try { kabel = (window.valisBruecke.festo().kabel || []).map(k => ({ fromKey: k.von, toKey: k.nach })); } catch (e) {}
    return { asg, slot, fn, fiktiv: !!fk, titel: fk && fk.querySelector('title') ? fk.querySelector('title').textContent : '',
      r1: slot ? !!svg.querySelector(`[data-festo-socket="${slot}_R1"]`) : false,
      kabelR1: slot ? kabel.filter(c => c.fromKey === slot + '_R1' || c.toKey === slot + '_R1').length : -1,
      kabelA1: slot ? kabel.filter(c => c.fromKey === slot + '_A1' || c.toKey === slot + '_A1').length : -1 };
  });
  ok('Steckaufbau: TONR auf dem Zeitrelais, Funktion TONR', !!st.slot && st.fn.includes('Funktion TONR'), JSON.stringify(st).slice(0, 400));
  ok('Steckaufbau: rot „gibt es so nicht“ mit Erklärung', st.fiktiv && /162243/.test(st.titel) && /R1\/R2/.test(st.titel), st.titel);
  ok('Steckaufbau: Rücksetzbuchsen R1/R2', st.r1, JSON.stringify(st).slice(0, 300));
  ok('Steckaufbau: Rücksetzstrang auf R1, nicht auf A1', st.kabelR1 >= 1 && st.kabelA1 >= 1, JSON.stringify({ r1: st.kabelR1, a1: st.kabelA1 }));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));

  console.log('Elektroplan');
  const ced = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code');
    const out = {};
    for (const c of ['BETRIEB := TONR(MOTOR, QUITT, 10)\nM := SR(BETRIEB, AUS)\nLAMPE := M', 'OUT := TONR(IN, RES, 5)']) {
      ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(700);
      window.cedGenerateFromCode(); await warte(250);
      const ST = window._cedState;
      const k = ST.components.find(k => k.type === 'timer_tonr');
      const svgT = [...window._cedDoc().querySelectorAll('#ced-svg text, svg text')].map(t => t.textContent);
      out[c] = { teile: ST.components.map(k => k.type + ':' + (k.varName || '')).join(', '), code: window.cedGenerateCode(true).trim(),
        reset: k ? k.tonrReset : null, zeit: k ? k.timerTime : null, kf: k ? k.normPrefix : '', texte: svgT.filter(t => /Σ|R:/.test(t)) };
    }
    out.palette = !!window._cedDoc().querySelector('.ced-pal-item[data-ctype="timer_tonr"]');
    return out;
  });
  const c1 = ced['BETRIEB := TONR(MOTOR, QUITT, 10)\nM := SR(BETRIEB, AUS)\nLAMPE := M'], c2 = ced['OUT := TONR(IN, RES, 5)'];
  ok('Elektroplan: Zeitrelais TONR statt Programmbaustein', /timer_tonr:BETRIEB/.test(c1.teile) && !/baustein/.test(c1.teile), c1.teile);
  ok('Elektroplan: Zeit und Rücksetzen übernommen, -KF', c1.zeit === 10 && c1.reset === 'QUITT' && /KF/.test(c1.kf), JSON.stringify(c1));
  ok('Elektroplan: Spule zeigt Σ-Zeit und R:', c1.texte.some(t => /Σ10 s/.test(t)) && c1.texte.some(t => /R: QUITT/.test(t)), JSON.stringify(c1.texte));
  ok('Elektroplan: Rundlauf behält TONR(IN, R, PT)', /BETRIEB := TONR\(MOTOR, QUITT, 10\)/.test(c1.code), c1.code);
  ok('Elektroplan: TONR auf Ausgang mit zweitem Strang zur LED', /relay_no:OUT/.test(c2.teile) && /led:OUT/.test(c2.teile) && c2.code === 'OUT := TONR(IN, RES, 5)', JSON.stringify(c2));
  ok('Elektroplan: Palette hat TONR', ced.palette);

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
