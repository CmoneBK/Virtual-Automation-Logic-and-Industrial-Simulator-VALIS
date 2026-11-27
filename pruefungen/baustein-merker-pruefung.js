const { chromium } = require('playwright');
// Benannter Merker an Zeiten, Zählern und Flanken (Christoph 24.11.2026),
// wie beim SR-Glied:  G := TON(A, 2.0; HILF)  →  HILF ist Merker, G Ausgang.
// Flanken: OUT := R_TRIG(CLK; FM)  →  FM ist der Flankenmerker (alter CLK).
// Siehe auch speicher-merker-pruefung.js (SR/RS).
// Bisherige Programme ändern sich nicht.
//
//   node pruefungen/baustein-merker-pruefung.js
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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.removeItem('valisSpsAddresses'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(3500);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} if (window.epneuMode) toggleEpneuMode(); });
  const w = ms => page.waitForTimeout(ms);
  const lauf = async (code) => {
    await page.evaluate(c => { const ed = document.getElementById('code'); ed.value = c; ed.dispatchEvent(new Event('input', { bubbles: true })); }, code);
    await w(1300);
    return page.evaluate(() => {
      const d = window._spsZuordnungData();
      const z = r => r.name + '=' + String(r.addr).replace(/^%/, '');
      let err = []; try { err = [...window._collectAllErrors()]; } catch (x) { err = ['X ' + x]; }
      return { aus: d.outputs.map(z).sort(), merker: (d.merker || []).map(z).sort(), err };
    });
  };
  const sim = async (fn) => { await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(300); const r = await fn(); await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); }); return r; };
  const t = async (n, v, ms = 150) => { await page.evaluate(([n, v]) => setTaster(n, v), [n, v]); await w(ms); };
  const st = n => page.evaluate(n => !!spsState[n], n);

  const faelle = [
    ['TON', 'G := TON(A, 0.3; HILF)', 'HILF=M0.0', 'A=E0.0', 'G=A0.0', async () => { await t('A', true, 600); const an = await st('G') && await st('HILF'); await t('A', false); return an && !(await st('G')); }],
    ['TOF', 'G := TOF(A, 0.3; HILF)', 'HILF=M0.0', 'A=E0.0', 'G=A0.0', async () => { await t('A', true); await t('A', false, 50); const an = await st('G'); await w(600); return an && !(await st('G')); }],
    ['TP', 'G := TP(A, 0.3; HILF)', 'HILF=M0.0', 'A=E0.0', 'G=A0.0', async () => { await t('A', true, 100); const an = await st('G'); await w(600); const aus = !(await st('G')); await t('A', false); return an && aus; }],
    ['TONOF', 'G := TONOF(A, 0.2, 0.2; HILF)', 'HILF=M0.0', 'A=E0.0', 'G=A0.0', async () => { await t('A', true, 500); return await st('G'); }],
    ['TONR', 'G := TONR(A, R, 0.2; HILF)', 'HILF=M0.0', 'A=E0.0', 'G=A0.0', async () => { await t('A', true, 500); const an = await st('G'); await t('A', false); await t('R', true); await t('R', false); return an && !(await st('G')); }],
    ['CTU', 'G := CTU(A, R, 2; Z)', 'Z=M0.0', 'A=E0.0', 'G=A0.0', async () => { await t('A', true); await t('A', false); const eins = await st('G'); await t('A', true); await t('A', false); return !eins && await st('G'); }],
    ['CTD', 'G := CTD(A, LD, 1; Z)', 'Z=M0.0', 'A=E0.0', 'G=A0.0', async () => { await t('LD', true); await t('LD', false); const vor = await st('G'); await t('A', true); await t('A', false); return !vor && await st('G'); }],
    ['CTUD mit Z_QD', 'Z := CTUD(CU, CD, R, LD, 1; ZM)\nL := Z_QD', 'ZM=M0.0', 'CU=E0.0', 'L=A0.1', async () => { const leer = await st('L'); await t('CU', true); await t('CU', false); return leer && await st('Z') && !(await st('L')); }],
    ['R_TRIG mit Flankenmerker', 'OUT := R_TRIG(CLK; FM)', 'FM=M0.0', 'CLK=E0.0', 'OUT=A0.0', async () => { await t('CLK', true, 300); const fm = await st('FM'); const out = await st('OUT'); await t('CLK', false, 300); return fm && !out && !(await st('FM')); }],
    ['F_TRIG mit Flankenmerker', 'OUT := F_TRIG(CLK; FM)', 'FM=M0.0', 'CLK=E0.0', 'OUT=A0.0', async () => { await t('CLK', true, 300); const fm = await st('FM'); await t('CLK', false, 300); return fm && !(await st('FM')) && !(await st('OUT')); }],
  ];
  for (const [name, code, merker, ein, aus, verhalten] of faelle) {
    const r = await lauf(code);
    ok(name + ': ' + merker.split('=')[0] + ' ist Merker, ' + aus.split('=')[0] + ' Ausgang', r.merker.includes(merker) && r.aus.includes(aus) && !r.aus.some(a => a.startsWith(merker.split('=')[0] + '=')), JSON.stringify(r));
    ok(name + ': keine Fehlerzeilen', r.err.length === 0, JSON.stringify(r.err));
    ok(name + ': Verhalten', await sim(verhalten));
  }
  // Flanke zählt wirklich: R_TRIG(CLK; FM) in CTU, ein Puls je Flanke
  await lauf('P := R_TRIG(CLK; FM)\nG := CTU(P, R, 2)');
  ok('R_TRIG mit Flankenmerker zählt je Flanke einmal', await sim(async () => { await t('CLK', true, 300); await t('CLK', false); const eins = await st('G'); await t('CLK', true, 300); await t('CLK', false); return !eins && await st('G'); }));

  // FUP, LOGO!, SCL
  for (const [code, sclRe] of [['G := TON(A, 2.0; HILF)', /#G := #HILF;/], ['OUT := R_TRIG(CLK; FM)', /#OUT := \(#CLK\) AND NOT #FM;[\s\S]*#FM := #CLK;/], ['OUT := F_TRIG(CLK; FM)', /#OUT := NOT \(#CLK\) AND #FM;[\s\S]*#FM := #CLK;/]]) {
    const v = await page.evaluate(async (code) => {
      const warte = ms => new Promise(r => setTimeout(r, ms));
      const fw = document.getElementById('fbs-wrapper'); if (fw && fw.style.display === 'none') { try { toggleWorkspaceView('fbs-wrapper'); } catch (e) {} }
      const ta = document.getElementById('code'); ta.value = code; ta.dispatchEvent(new Event('input', { bubbles: true }));
      await warte(900);
      window.fbsFupMode = true;
      try { window._fupRender(currentGraph); } catch (e) { return { fehler: String(e) }; }
      window.fbsFupMode = false;
      let logo = ''; try { const m = Logo.aktuell(); logo = Logo.zeilen(m).map(z => z.text).join(' | '); } catch (e) { logo = 'X ' + e; }
      try { window.exportSCL(); } catch (e) {}
      const scl = (window._sclTabContent || {}).scl || '';
      try { document.querySelectorAll('.modal, .scl-modal').forEach(m => m.style.display = 'none'); } catch (e) {}
      return { logo, scl };
    }, code);
    ok(code + ': FUP und LOGO! ohne Fehler', !v.fehler && v.logo && !/^X /.test(v.logo), JSON.stringify(v).slice(0, 300));
    ok(code + ': SCL', sclRe.test(v.scl) && !/;\s*(HILF|FM)\s*\)/.test(v.scl), v.scl.slice(300, 1500));
  }
  // Christoph 27.11.: „; NAME“ ist im FUP ein Netzwerk (Merker und Abzweig auf OUT), in der LOGO! am Baustein
  const ein = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fbs-wrapper'); if (fw && fw.style.display === 'none') toggleWorkspaceView('fbs-wrapper');
    if (!window.fbsFupMode) window._toggleFbsFup();
    const out = {};
    for (const c of ['B := CTUD(HOCH, RUNTER, RESET, LADEN, 10; ZAEHLER)', 'B := TON(A, 2; HILF)', 'G := SR(A, C; SP)', 'L := STROMSTOSS(T; M)']) {
      const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(1300);
      const t = [...(_fbsDoc().querySelectorAll('#fup-norm-svg text'))].map(x => x.textContent);
      out[c] = { netze: t.filter(x => /^Netzwerk/.test(x)).length, t: t.join('|'), logo: Logo.zeilen(Logo.aktuell()).map(z => z.text).join(' | ') };
    }
    window._toggleFbsFup();
    return out;
  });
  Object.entries(ein).forEach(([c, r]) => ok('FUP: ein Netzwerk für ' + c, r.netze === 1, r.t));
  ok('LOGO!: Baustein schreibt Merker und Ausgang (→ M1, Q1)', Object.values(ein).slice(0, 3).every(r => /→ M1, Q1/.test(r.logo) && !/ohne Baustein/.test(r.logo)), Object.values(ein).map(r => r.logo).join(' || '));

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
