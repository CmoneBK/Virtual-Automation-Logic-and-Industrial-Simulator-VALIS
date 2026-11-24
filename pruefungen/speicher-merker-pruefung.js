const { chromium } = require('playwright');
// Benannter Merker am SR-/RS-Glied (Christoph 24.11.2026):
//   ohne Merker            G := SR(A, B)
//   mit Merker SPEICHER    G := SR(A, B; SPEICHER)
//   mit Merker Q1          S1 := A / R1 := B / Z := Q1
//   mit Merker SPEICHER    S1 := A / R1 := B / Z := (Q1; SPEICHER)
//                          (die Klammer `(…; SPEICHER)` auch an S1 oder R1)
// Bisherige Programme ändern sich nicht.
//
//   node pruefungen/speicher-merker-pruefung.js
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
  const lauf = async (code) => {
    await page.evaluate(c => { const ed = document.getElementById('code'); ed.value = c; ed.dispatchEvent(new Event('input', { bubbles: true })); }, code);
    await page.waitForTimeout(1300);
    return page.evaluate(() => {
      const d = window._spsZuordnungData();
      const z = r => r.name + '=' + String(r.addr).replace(/^%/, '');
      let err = [];
      try { const e = window._collectAllErrors(); err = [...(e && e.size !== undefined ? e : (e || []))]; } catch (x) { err = ['X ' + x]; }
      return { aus: d.outputs.map(z), merker: (d.merker || []).map(z), err };
    });
  };
  // Verhalten: A setzen → G an; B → G aus
  const verhalten = async (ziel) => {
    await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); });
    await page.waitForTimeout(300);
    const t = async (n, v) => { await page.evaluate(([n, v]) => setTaster(n, v), [n, v]); await page.waitForTimeout(200); };
    await t('A', true); await t('A', false);
    const an = await page.evaluate(z => !!spsState[z], ziel);
    await t('B', true); await t('B', false);
    const aus = await page.evaluate(z => !spsState[z], ziel);
    await page.evaluate(() => { if (isSimulationActive) toggleSimulation(); });
    return an && aus;
  };
  const faelle = [
    ['Kurzform ohne Merker', 'G := SR(A, B)', r => r.merker.length === 0 && r.aus.join() === 'G=A0.0', 'G'],
    ['Kurzform mit Merker SPEICHER', 'G := SR(A, B; SPEICHER)', r => r.merker.join() === 'SPEICHER=M0.0' && r.aus.join() === 'G=A0.0', 'G'],
    ['RS-Kurzform mit Merker', 'G := RS(A, B; SP)', r => r.merker.join() === 'SP=M0.0' && r.aus.join() === 'G=A0.0', 'G'],
    ['Langform mit Merker Q1 (wie bisher)', 'S1 := A\nR1 := B\nZ := Q1', r => r.merker.join() === 'Q1=M0.0' && r.aus.join() === 'Z=A0.0', 'Z'],
    ['Langform, Name an Q1', 'S1 := A\nR1 := B\nZ := (Q1; SPEICHER)', r => r.merker.join() === 'SPEICHER=M0.0' && r.aus.join() === 'Z=A0.0', 'Z'],
    ['Langform, Name an S1', 'S1 := (A; SPEICHER)\nR1 := B\nZ := Q1', r => r.merker.join() === 'SPEICHER=M0.0' && r.aus.join() === 'Z=A0.0', 'Z'],
    ['Langform, Name an R1 (Klammer hinten)', 'S1 := A\nR1 := B (; SPEICHER)\nZ := Q1', r => r.merker.join() === 'SPEICHER=M0.0' && r.aus.join() === 'Z=A0.0', 'Z'],
    ['Langform _SR, Name an Q1', 'S1_SR := A\nR1_SR := B\nZ := (Q1_SR; SPEICHER)', r => r.merker.join() === 'SPEICHER=M0.0' && r.aus.join() === 'Z=A0.0', 'Z'],
    ['Name später weiter benutzbar', 'G := SR(A, B; SPEICHER)\nH := SPEICHER AND C', r => r.merker.join() === 'SPEICHER=M0.0' && r.aus.join() === 'G=A0.0,H=A0.1', 'G'],
  ];
  for (const [name, code, pruef, ziel] of faelle) {
    const r = await lauf(code);
    ok(name + ': Merker/Ausgänge', pruef(r), JSON.stringify(r));
    ok(name + ': keine Fehlerzeilen', r.err.length === 0, JSON.stringify(r.err));
    ok(name + ': setzt und setzt zurück', await verhalten(ziel));
  }
  // FUP, LOGO!, SCL, Elektroplan für die Form mit Merker
  for (const code of ['G := SR(A, B; SPEICHER)', 'S1 := A\nR1 := B\nG := (Q1; SPEICHER)']) {
    const v = await page.evaluate(async (code) => {
      const warte = ms => new Promise(r => setTimeout(r, ms));
      const fw = document.getElementById('fbs-wrapper'); if (fw && fw.style.display === 'none') { try { toggleWorkspaceView('fbs-wrapper'); } catch (e) {} }
      const ta = document.getElementById('code'); ta.value = code; ta.dispatchEvent(new Event('input', { bubbles: true }));
      await warte(900);
      const fbs = (typeof _fbsDoc === 'function' ? _fbsDoc() : document);
      window.fbsFupMode = true;
      try { window._fupRender(currentGraph); } catch (e) { return { fehler: String(e) }; }
      const svg = fbs.getElementById('fup-norm-svg');
      const fup = svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : [];
      window.fbsFupMode = false;
      let logo = '';
      try { const m = Logo.aktuell(); logo = Logo.zeilen(m).map(z => z.text).join(' | '); } catch (e) { logo = 'X ' + e; }
      try { window.exportSCL(); } catch (e) {}
      const scl = (window._sclTabContent || {}).scl || '';
      try { document.querySelectorAll('.modal, .scl-modal').forEach(m => m.style.display = 'none'); } catch (e) {}
      return { fup, logo, scl };
    }, code);
    const k = code.replace(/\n/g, ' / ');
    ok(k + ': FUP zeigt SPEICHER, kein Q1', v.fup && v.fup.includes('SPEICHER') && !v.fup.includes('Q1'), JSON.stringify(v.fup || v).slice(0, 300));
    ok(k + ': LOGO! ohne Fehler', v.logo && !/^X /.test(v.logo), v.logo);
    ok(k + ': SCL: SPEICHER ist die Speichervariable, kein Q1', /#SPEICHER := TRUE;/.test(v.scl) && /#G := #SPEICHER;/.test(v.scl) && !/Q1/.test(v.scl), v.scl.slice(300, 1400));
  }
  // Umwandeln Kurzform → Langform behält den Namen
  const lang = await page.evaluate(() => window._speicherZuLangform('G := SR(A, B; SPEICHER)', 0));
  ok('Kurzform → Langform behält den Merker', /\(Q1_SR;\s*SPEICHER\)/.test(lang || ''), lang);
  const kurz = await page.evaluate((t) => window._speicherZuKurzform(t, 0), lang || '');
  ok('Langform → Kurzform zurück', /^G := SR\(A, B; SPEICHER\)/.test(kurz || ''), kurz);
  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
