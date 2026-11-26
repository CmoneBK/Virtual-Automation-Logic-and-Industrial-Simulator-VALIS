const { chromium } = require('playwright');
// Flanken R_TRIG / F_TRIG (IEC 61131-3, im TIA Portal direkt vorhanden;
// Christoph 23.11.2026): Ablauf, Editor, Logikplan, FUP, LOGO!, SCL,
// Relais-Ansichten.
//
//   node pruefungen/flanken-pruefung.js
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

  console.log('Flanken: Ablauf');
  const lauf = await page.evaluate(() => {
    const p = parseToGraph('AUF := R_TRIG(TASTER)\nAB := F_TRIG(TASTER)\nZ := CTU(AUF, RESET, 3)\nUM := R_TRIG(A && ¬B)');
    const f = new Function('state', 'deltaMs', 'timers', p.jsCompiledCode);
    const state = {}, timers = {};
    const zyklus = (ein) => { state.TASTER = ein; f(state, 50, timers); return [!!state.AUF, !!state.AB]; };
    const r = { typen: ['R_TRIG_AUF', 'F_TRIG_AB', 'R_TRIG_UM'].map(k => (p.graph.nodes.get(k) || {}).type) };
    r.folge = [zyklus(false), zyklus(true), zyklus(true), zyklus(true), zyklus(false), zyklus(false), zyklus(true), zyklus(false)];
    // Zähler über die Flanke: 3 Mal drücken (lange halten) = 3 Schritte
    for (let k = 0; k < 3; k++) { for (let i = 0; i < 10; i++) zyklus(true); for (let i = 0; i < 10; i++) zyklus(false); }
    r.zaehler = !!state.Z;
    // Ausdruck am Eingang
    state.A = true; state.B = true; f(state, 50, timers); const u1 = !!state.UM; state.B = false; f(state, 50, timers); const u2 = !!state.UM; f(state, 50, timers); const u3 = !!state.UM;
    r.ausdruck = [u1, u2, u3];
    return r;
  });
  ok('Bausteine R_TRIG/F_TRIG im Logikplan', lauf.typen.join() === 'R_TRIG,F_TRIG,R_TRIG', JSON.stringify(lauf.typen));
  ok('R_TRIG: genau ein Zyklus bei 0→1', JSON.stringify(lauf.folge.map(x => x[0])) === JSON.stringify([false, true, false, false, false, false, true, false]), JSON.stringify(lauf.folge));
  ok('F_TRIG: genau ein Zyklus bei 1→0', JSON.stringify(lauf.folge.map(x => x[1])) === JSON.stringify([false, false, false, false, true, false, false, true]), JSON.stringify(lauf.folge));
  ok('CTU über R_TRIG zählt drei lange Drücke', lauf.zaehler === true);
  ok('Ausdruck als CLK (A && ¬B)', JSON.stringify(lauf.ausdruck) === '[false,true,false]', JSON.stringify(lauf.ausdruck));

  console.log('Prüfung im Editor');
  const fehlerzeilen = async c => { await page.evaluate(c => { const ta = document.getElementById('code'); ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, c); await w(1200); return page.evaluate(() => [...window._collectAllErrors()]); };
  const fz = await fehlerzeilen('AUF := R_TRIG(TASTER)\nAB := F_TRIG(TASTER && FREIGABE)\nLAMPE := AUF || AB');
  ok('richtige Aufrufe ohne Fehler im Editor', fz.length === 0, JSON.stringify(fz));
  const ex = await page.evaluate(() => ['AUF := R_TRIG(TASTER, 2)', 'AUF := R_TRIG()', 'L := A && R_TRIG(B)'].map(c => { const r = window._explainError(c); return r ? r.title : null; }));
  ok('R_TRIG mit Zeit wird gemeldet', /R_TRIG/.test(ex[0] || ''), ex[0]);
  ok('R_TRIG ohne Signal wird gemeldet', /R_TRIG/.test(ex[1] || ''), ex[1]);
  ok('Flanke mitten im Ausdruck wird gemeldet', !!ex[2], ex[2]);
  const hl = await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'L := F_TRIG(B)'; ta.dispatchEvent(new Event('input', { bubbles: true })); return document.getElementById('highlighting-content').innerHTML; });
  ok('Hervorhebung als Baustein', /token func">F_TRIG</.test(hl), hl.slice(0, 200));

  console.log('FUP, LOGO!, SCL');
  const code = 'AUF := R_TRIG(TASTER)\nAB := F_TRIG(TASTER)\nZ := CTU(AUF, RESET, 3)\nLAMPE := Z OR AB';
  const v = await page.evaluate(async (code) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code'); ta.value = code; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(900);
    window.fbsFupMode = true;
    try { window._fupRender(currentGraph); } catch (e) { return { fehler: String(e) }; }
    const svg = (typeof _fbsDoc === 'function' ? _fbsDoc() : document).getElementById('fup-norm-svg');
    const fup = svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : [];
    window.fbsFupMode = false;
    const p = window._logoProgramm ? window._logoProgramm() : null;
    const m = Logo.aktuell ? Logo.aktuell() : null;
    const logo = m ? { typen: m.bausteine.map(b => b.typ), namen: m.bausteine.map(b => b.name), stufe: m.passt.stufe, zeilen: Logo.zeilen(m).map(z => z.text).join(' | ') } : null;
    try { window.exportSCL(); } catch (e) {}
    const scl = (window._sclTabContent || {}).scl || '';
    try { document.querySelectorAll('.modal, .scl-modal').forEach(m => m.style.display = 'none'); } catch (e) {}
    return { fup, logo, scl };
  }, code);
  ok('FUP: R_TRIG und F_TRIG mit CLK und Q', v.fup.includes('R_TRIG') && v.fup.includes('F_TRIG') && v.fup.filter(t => t === 'CLK').length === 2, (v.fup || []).join(' ').slice(0, 300));
  ok('LOGO!: AND/NAND mit Flankenauswertung', v.logo && v.logo.typen.includes('ANDF') && v.logo.typen.includes('NANDF') && /AND mit Flankenauswertung/.test(v.logo.zeilen) && /NAND mit Flankenauswertung/.test(v.logo.zeilen), JSON.stringify(v.logo).slice(0, 400));
  ok('LOGO!: passt aufs Grundgerät', v.logo && v.logo.stufe === 'grund', v.logo && v.logo.stufe);
  ok('SCL: Instanzen R_TRIG/F_TRIG und Aufruf mit CLK', /"_R_TRIG\d+" : R_TRIG;/.test(v.scl) && /"_F_TRIG\d+" : F_TRIG;/.test(v.scl) && /"_R_TRIG\d+"\(CLK := .*TASTER.*\);/.test(v.scl) && /#AUF := "_R_TRIG\d+"\.Q;/.test(v.scl), v.scl.split('\n').filter(l => /TRIG/.test(l)).join(' / ').slice(0, 400));

  console.log('Relais-Ansichten: Wischrelais EW/AW (E-Pneu)');
  await page.evaluate(() => { if (!window.epneuMode) toggleEpneuMode(); });
  await w(400);
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'AUF := R_TRIG(TASTER)\nAB := F_TRIG(TASTER)\nM := SR(AUF, AB)\nLAMPE := M'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1500);
  const sp = await page.evaluate(() => {
    const cc = _iecDoc().getElementById('circuit-content');
    const t = (ct) => { const sp = cc && cc.querySelector(`[data-iec-role="coil"][data-ctype="${ct}"]`); return sp ? [...sp.querySelectorAll('text')].map(x => x.textContent).join(' ') : null; };
    const k = cc && cc.querySelector('[data-iec-role="contact"][data-ctype="r_trig"]');
    return { ew: t('r_trig'), aw: t('f_trig'), kontakt: !!k, boegen: k ? k.querySelectorAll('.circ-moving-contact path').length : -1 };
  });
  ok('Auto-Schaltplan: Spulen EW und AW', /EW/.test(sp.ew || '') && /AW/.test(sp.aw || ''), JSON.stringify(sp));
  ok('Auto-Schaltplan: Kontakt des Wischrelais ohne Verzögerungsbogen', sp.kontakt && sp.boegen === 0, JSON.stringify(sp));
  // Christoph 23.11.: Der Kontakt muss sichtbar schließen, obwohl der Impuls nur einen Zyklus dauert
  await page.evaluate(() => { const ta = document.getElementById('code'); ta.value = 'OUT := R_TRIG(CLK)'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(1200);
  const anim = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const zu = document.getElementById('circuit-wrapper').style.display === 'none';
    if (zu) toggleWorkspaceView('circuit-wrapper');
    await warte(500);
    if (!isSimulationActive) toggleSimulation();
    await warte(300);
    const k = () => _iecDoc().getElementById('circuit-content').querySelector('[data-iec-role="contact"][data-ctype="r_trig"] .circ-moving-contact');
    const vorher = k() ? k().classList.contains('open') : null;
    const cb = document.getElementById('sim_in_CLK'); const drueck = (v) => { if (cb) { cb.checked = v; window.toggleInput('CLK'); } else { spsState.CLK = v; runSimulationTick(); } };
    drueck(true);
    const proben = [];
    for (let i = 0; i < 6; i++) { await warte(40); proben.push(k() ? !k().classList.contains('open') : null); }
    await warte(600);
    const nachher = k() ? k().classList.contains('open') : null;
    drueck(false);
    if (isSimulationActive) toggleSimulation();
    if (zu) toggleWorkspaceView('circuit-wrapper');
    const ta = document.getElementById('code'); ta.value = 'AUF := R_TRIG(TASTER)\nAB := F_TRIG(TASTER)\nM := SR(AUF, AB)\nLAMPE := M'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(1200);
    return { vorher, proben, nachher, cb: !!cb };
  });
  ok('Auto-Schaltplan: Kontakt des Wischrelais schließt sichtbar und öffnet wieder', anim.vorher === true && anim.proben.some(Boolean) && anim.nachher === true, JSON.stringify(anim));
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1500);
  const st = await page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const fn = [...svg.querySelectorAll('[data-festo-zr-funktion]')].map(t => t.textContent);
    const fk = svg.querySelector('[data-festo-fiktiv="r_trig"]');
    return { asg: window._festoLastAssignments, fn, fiktiv: !!fk && !!svg.querySelector('[data-festo-fiktiv="f_trig"]'), titel: fk && fk.querySelector('title') ? fk.querySelector('title').textContent : '' };
  });
  ok('Steckaufbau: Flanken auf dem Zeitrelais, Funktion EW / AW', Object.values(st.asg || {}).includes('AUF') && Object.values(st.asg || {}).includes('AB') && st.fn.includes('Funktion EW') && st.fn.includes('Funktion AW'), JSON.stringify(st));
  ok('Steckaufbau: rot „gibt es so nicht“ mit Erklärung', st.fiktiv && /162243/.test(st.titel) && /Zyklus/.test(st.titel), st.titel);
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));

  console.log('Elektroplan');
  const ced = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const ta = document.getElementById('code');
    const out = {};
    for (const c of ['AUF := R_TRIG(TASTER)\nAB := F_TRIG(TASTER)\nM := SR(AUF, AB)\nLAMPE := M', 'OUT := R_TRIG(IN)']) {
      ta.value = c; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(700);
      window.cedGenerateFromCode(); await warte(250);
      const ST = window._cedState;
      out[c] = { teile: ST.components.map(k => k.type + ':' + (k.varName || '')).join(', '), code: window.cedGenerateCode(true).trim(),
        kf: ST.components.filter(k => /timer_/.test(k.type)).map(k => k.normPrefix).join(',') };
    }
    out.palette = !!window._cedDoc().querySelector('.ced-pal-item[data-ctype="timer_rtrig"]') && !!window._cedDoc().querySelector('.ced-pal-item[data-ctype="timer_ftrig"]');
    return out;
  });
  const c1 = ced['AUF := R_TRIG(TASTER)\nAB := F_TRIG(TASTER)\nM := SR(AUF, AB)\nLAMPE := M'], c2 = ced['OUT := R_TRIG(IN)'];
  ok('Elektroplan: Wischrelais EW/AW statt Programmbaustein', /timer_rtrig:AUF/.test(c1.teile) && /timer_ftrig:AB/.test(c1.teile) && !/baustein/.test(c1.teile), c1.teile);
  ok('Elektroplan: -KF-Kennzeichen', /KF/.test(c1.kf), c1.kf);
  ok('Elektroplan: Rundlauf behält R_TRIG/F_TRIG', /AUF := R_TRIG\(TASTER\)/.test(c1.code) && /AB := F_TRIG\(TASTER\)/.test(c1.code), c1.code);
  ok('Elektroplan: Flanke auf Ausgang mit zweitem Strang zur LED', /relay_no:OUT/.test(c2.teile) && /led:OUT/.test(c2.teile) && c2.code === 'OUT := R_TRIG(IN)', JSON.stringify(c2));
  ok('Elektroplan: Palette hat EW und AW', ced.palette);

  // Christoph 26.11.: Der Impuls dauert einen SPS-Zyklus, die Ansichten zeigen ihn 300 ms lang
  console.log('Anzeige des Impulses (Logikplan, FUP, LOGO!, Sim-Panel)');
  const puls = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const fw = document.getElementById('fbs-wrapper'); if (fw && fw.style.display === 'none') toggleWorkspaceView('fbs-wrapper');
    const ta = document.getElementById('code'); ta.value = 'A := F_TRIG(SIGNAL)'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(1200);
    const out = {};
    for (const ansicht of ['plan', 'fup', 'logo']) {
      if (ansicht === 'fup' && !window.fbsFupMode) window._toggleFbsFup();
      if (ansicht === 'logo') { if (window.fbsFupMode) window._toggleFbsFup(); window._toggleLogoAnsicht(true); }
      await warte(500);
      if (!isSimulationActive) toggleSimulation();
      await warte(300);
      const d = _fbsDoc();
      const sicht = () => {
        if (ansicht === 'plan') { const bl = d.getElementById('custom-svg').querySelector('#node-block-A'); return !!bl && bl.classList.contains('active'); }
        const sel = ansicht === 'fup' ? '#fup-norm-svg line, #fup-norm-svg path, #fup-norm-svg polyline' : '#logo-svg line';
        return [...d.querySelectorAll(sel)].some(l => l.getAttribute('stroke') === '#2e7d32');
      };
      const led = () => { const l = document.getElementById('sim_out_A'); return !!l && l.classList.contains('on'); };
      spsState.SIGNAL = true; await warte(400);
      spsState.SIGNAL = false; await warte(80);
      const mitte = [sicht(), led()];
      await warte(600);
      out[ansicht] = { mitte, danach: [sicht(), led()] };
      toggleSimulation(); await warte(200);
    }
    window._toggleLogoAnsicht(false);
    return out;
  });
  ['plan', 'fup', 'logo'].forEach(a => ok(`${a}: A nach dem Loslassen sichtbar an, danach wieder aus`, puls[a].mitte[0] && !puls[a].danach[0], JSON.stringify(puls[a])));
  ok('Sim-Panel: Ausgang A leuchtet sichtbar', puls.plan.mitte[1] && !puls.plan.danach[1], JSON.stringify(puls.plan));

  console.log('FUP mit Flankenmerker (P_TRIG/N_TRIG)');
  const pn = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    if (!window.fbsFupMode) window._toggleFbsFup();
    const ta = document.getElementById('code'); ta.value = 'A := F_TRIG(SIGNAL; FM)\nB := R_TRIG(SIGNAL; FM2)'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(1500);
    const t = [...(_fbsDoc().querySelectorAll('#fup-norm-svg text'))].map(x => x.textContent);
    window._toggleFbsFup();
    return t;
  });
  ok('FUP: N_TRIG/P_TRIG mit FM als M_BIT, kein eigenes Netzwerk für FM', pn.includes('N_TRIG') && pn.includes('P_TRIG') && pn.includes('FM') && pn.filter(x => /^Netzwerk/.test(x)).length === 2, pn.join('|'));

  console.log('Steckaufbau (SPS): Ausgang als Relais');
  const sr = await page.evaluate(async () => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    if (window.epneuMode) { toggleEpneuMode(); await warte(800); }
    const ta = document.getElementById('code'); ta.value = 'A := F_TRIG(SIGNAL)'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await warte(800); componentTypes['A'] = 'relais'; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(1000);
    const fw = document.getElementById('festo-wrapper'); if (fw.style.display === 'none') toggleWorkspaceView('festo-wrapper');
    await warte(1500);
    const k = (window._festoCablesList || []).map(c => c.fromKey + '>' + c.toKey);
    toggleWorkspaceView('festo-wrapper');
    return { epneu: !!window.epneuMode, k };
  });
  ok('Steckaufbau: A0.0 auf A1 des Relais, A2 an 0V', !sr.epneu && sr.k.some(x => /^ANS_DOUT_A0\.0>R\d+_S\d+_A1$/.test(x)) && sr.k.some(x => /^R\d+_S\d+_A2>__ANS_BUS_0V__$/.test(x)), JSON.stringify(sr));

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
