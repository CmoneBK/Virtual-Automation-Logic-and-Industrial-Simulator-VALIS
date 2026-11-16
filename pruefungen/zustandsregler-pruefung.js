const { chromium } = require('playwright');
// Prüfung Zustandsregler: Code-Baustein ZUSTAND(W, X, KX, KV, KA, P), Rechnung
// (Y = P·(KX·e − KV·ẋ − KA·ẍ), Begrenzung, Offset, bipolar), Logikplan-Marke,
// Zustandsreglerkarte FESTO 162253 im Steckaufbau (Buchsen, Poti → Codezeile,
// Stufenschalter), Reglerfenster und SCL-Export.
//
//   node pruefungen/zustandsregler-pruefung.js
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
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const fehler = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  const w = ms => page.waitForTimeout(ms);
  await page.evaluate(async () => { try { closeHub(); } catch (e) {} if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);

  console.log('Rechnung window._regler.zustand');
  const r = await page.evaluate(() => {
    const R = window._regler, tm = {};
    const a = R.zustand(tm, 'T1', 60, 50, 1, 0, 0, 2, 100);            // reiner P-Teil: 2·(1·10) = 20
    const b = R.zustand({}, 'T2', 60, 50, 1, 0, 0, 20, 100);           // 200 → begrenzt auf 100
    const c = R.zustand({}, 'T3', 40, 50, 1, 0, 0, 2, 100);            // −20 → 0 (unipolar)
    window._reglerEin.T4 = { bipolar: true }; const d = R.zustand({}, 'T4', 40, 50, 1, 0, 0, 2, 100); // −20
    window._reglerEin.T5 = { offset: 5 }; const e = R.zustand({}, 'T5', 60, 50, 1, 0, 0, 2, 100);    // 25
    // Geschwindigkeitsrückführung: x steigt um 1 je 0,1 s → ẋ → 10/s, KV = 0,5 bremst
    const t6 = {}; let y6 = 0;
    for (let i = 0; i < 40; i++) y6 = R.zustand(t6, 'T6', 100, 10 + i, 1, 0.5, 0, 1, 100);
    const mitV = y6, xd = t6.T6.xd;
    const t7 = {}; let y7 = 0;
    for (let i = 0; i < 40; i++) y7 = R.zustand(t7, 'T7', 100, 10 + i, 1, 0, 0, 1, 100);
    return { a, b, c, d, e, mitV, ohneV: y7, xd };
  });
  ok('P-Teil: Y = P · KX · e = 2 · 1 · 10 = 20 %', r.a === 20, r.a);
  ok('Begrenzung auf 100 %', r.b === 100, r.b);
  ok('Unipolar: nicht unter 0 %', r.c === 0, r.c);
  ok('Bereichsschalter −10 … +10 V: −20 %', r.d === -20, r.d);
  ok('Offset +0,5 V (5 %) addiert', r.e === 25, r.e);
  ok('ẋ geschätzt ≈ 10 /s bei gleichmäßiger Bewegung', Math.abs(r.xd - 10) < 0.5, r.xd);
  ok('KV bremst: Stellgröße kleiner als ohne Geschwindigkeitsrückführung', r.mitV < r.ohneV - 4, `${r.mitV} < ${r.ohneV}`);

  console.log('Code, Logikplan, Steckaufbau');
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'VENTIL := ZUSTAND(SOLL, POS, 1, 0.3, 0.01, 10)'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1500);
  const k = await page.evaluate(() => {
    const n = currentGraph.nodes.get('VENTIL');
    return { regler: n && n.regler, id: n && n.reglerId, typSoll: componentTypes.SOLL, typAus: componentTypes.VENTIL,
      err: (document.getElementById('error-box') || {}).textContent || '' };
  });
  ok('Parser kennt ZUSTAND (Knoten mit regler ZUSTAND, Id ZR_VENTIL)', k.regler === 'ZUSTAND' && k.id === 'ZR_VENTIL', JSON.stringify(k));
  ok('SOLL wird Analogeingang, VENTIL Analogausgang', k.typSoll === 'analog_in' && k.typAus === 'analog_out', JSON.stringify(k));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1500);
  const s = await page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const g = svg.querySelector('[data-festo-panel-type="ana_zustand"]');
    if (!g) return null;
    const bu = Array.from(g.querySelectorAll('[data-festo-socket]')).map(e => e.getAttribute('data-festo-socket'));
    const kabel = (window._anaKabelListe || []).map(c => c.fromKey + '>' + c.toKey);
    return { text: g.textContent, bu, kabel };
  });
  ok('Zustandsreglerkarte im Steckaufbau', !!s && /162253/.test(s.text) && /Kẋ/.test(s.text) && /Kẍ/.test(s.text), s && s.text.slice(0, 80));
  const soll = ['ZK1_w_P', 'ZK1_w_N', 'ZK1_x_P', 'ZK1_x_N', 'ZK1_M_e', 'ZK1_M_kx', 'ZK1_M_kv', 'ZK1_M_ka', 'ZK1_Y', 'ZK1_YM', 'ZK1_15V', 'ZK1_AM', 'ZK1_24V', 'ZK1_0V'];
  ok('Buchsen w, x (je ±), e, Kx, Kẋ, Kẍ, Y, ⊥, +15 V, Versorgung', s && soll.every(b => s.bu.includes(b)), s && soll.filter(b => !s.bu.includes(b)).join(' '));
  ok('Karte zeigt SOLL an w und POS an x, Ausgang VENTIL', s && /SOLL/.test(s.text) && /POS/.test(s.text) && /VENTIL/.test(s.text));
  // Poti Kx: rechts klicken → +0,1 in der Codezeile
  const klick = async (sel, rechts) => page.evaluate(([sel, rechts]) => {
    const svg = _festoDoc().getElementById('festo-svg');
    const g = svg.querySelector('[data-festo-panel-type="ana_zustand"]');
    const hit = Array.from(g.querySelectorAll('circle')).find(c => c.querySelector('title') && c.querySelector('title').textContent.startsWith(sel));
    const b = hit.getBoundingClientRect();
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rechts ? b.right - 1 : b.left + 1, clientY: b.top + b.height / 2 }));
  }, [sel, rechts]);
  await klick('Poti Kx', true); await w(900);
  let code = await page.evaluate(() => document.getElementById('code').value);
  ok('Poti Kx rechts: KX 1 → 1.1 in der Codezeile', /ZUSTAND\(SOLL, POS, 1\.1, 0\.3, 0\.01, 10\)/.test(code), code);
  await klick('Stufenschalter P', true); await w(900);
  code = await page.evaluate(() => document.getElementById('code').value);
  ok('Stufenschalter P 1 → 10: P 10 → 100', /ZUSTAND\(SOLL, POS, 1\.1, 0\.3, 0\.01, 100\)/.test(code), code);
  // Reglerfenster
  await page.evaluate(() => window._reglerFenster('ZR_VENTIL', 'VENTIL')); await w(400);
  const f = await page.evaluate(() => { const f = document.getElementById('regler-fenster'); return f && f.style.display !== 'none' ? f.textContent : ''; });
  ok('Reglerfenster „Zustandsregler“ mit KX, KV, KA, P', /Zustandsregler VENTIL/.test(f) && /KV \(s\)/.test(f) && /KA \(s²\)/.test(f), f.slice(0, 120));
  await page.evaluate(() => window._reglerFensterZu && window._reglerFensterZu());
  // SCL
  const scl = await page.evaluate(() => { try { window.exportSCL(); } catch (e) {} return (window._sclTabContent || {}).scl || ''; });
  ok('SCL-Export rechnet den Zustandsregler aus', /Zustandsregler/.test(scl) && /ZR_VENTIL_XD/.test(scl) && /LIMIT\(MN := 0\.0, IN := 100\.0 \* \(1\.1 \* /.test(scl), (scl.match(/.*Zustandsregler.*\n(.*\n){5}/) || [''])[0]);
  try { await page.evaluate(() => { const m = document.querySelector('#scl-modal, .scl-modal'); if (m) m.style.display = 'none'; }); } catch (e) {}
  // Falscher Aufruf
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'VENTIL := ZUSTAND(SOLL, POS, 1)'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1200);
  const hin = await page.evaluate(() => document.body.textContent.includes('ZUSTAND braucht sechs Werte') || document.body.textContent.includes('Zustandsregler falsch aufgerufen'));
  ok('Falscher Aufruf wird erklärt', hin);

  // Analog-Interface 162247: Rechenzeile liest Analogwerte, schreibt einen Analogausgang
  await page.evaluate(() => toggleWorkspaceView('code-wrapper'));
  await page.evaluate(() => { loadExample('analog_oelkuehlung'); }); await w(1500);
  await page.evaluate(() => { if (!window.epneuMode) toggleEpneuMode(); componentTypes['STELLW'] = 'analog_out'; const ta = document.getElementById('code'); ta.value += '\nSTELLW := (OELTEMP - SOLLT) * 4'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1500);
  const d = await page.evaluate(() => { const d = window._anaSammeln(); return { e: d.ifEin, a: d.ifAus }; });
  ok('Interface: OELTEMP/SOLLT über INPUT U, STELLW über OUTPUT', d.e.join() === 'OELTEMP,SOLLT' && d.a.join() === 'STELLW', JSON.stringify(d));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper')); await w(1500);
  const ik = await page.evaluate(() => { const g = document.querySelector('[data-festo-panel-type="ana_if"]'); if (!g) return null; return { text: g.textContent, bu: [...g.querySelectorAll('[data-socket-key],[data-key]')].map(e => e.getAttribute('data-socket-key') || e.getAttribute('data-key')) }; });
  ok('Interface-Karte 162247 mit INPUT U, INPUT I, OUTPUT, COUNTER', !!ik && /162247/.test(ik.text) && /INPUT -U-/.test(ik.text) && /INPUT -I-/.test(ik.text) && /OUTPUT/.test(ik.text) && /COUNTER/.test(ik.text), ik && ik.text.slice(0, 100));
  ok('Interface zeigt OELTEMP, SOLLT und STELLW', ik && /OELTEMP/.test(ik.text) && /SOLLT/.test(ik.text) && /STELLW/.test(ik.text));

  ok('Keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
