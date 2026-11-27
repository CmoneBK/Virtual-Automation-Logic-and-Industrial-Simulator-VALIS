const { chromium } = require('playwright');
// Alle Beispiele aus „➕ Weitere Bausteine“ (Christoph 27.11.2026) je im E-Pneu- und
// SPS-Modus: keine Editorfehler, FUP ein Netzwerk, LOGO! ohne „ohne Baustein“,
// Ausgang B bleibt LED und ist im Steckaufbau gesteckt, keine Seitenfehler.
//
//   node pruefungen/weitere-bausteine-pruefung.js
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
let gut = 0, schlecht = 0;
const AUS = ['CTD(SIGNAL, LADEN, 10)','CTU(SIGNAL, RESET, 10; ZAEHLER)','CTUD(HOCH, RUNTER, RESET, LADEN, 10)','CTUD(HOCH, RUNTER, RESET, LADEN, 10; ZAEHLER)','F_TRIG(SIGNAL)','F_TRIG(SIGNAL; FM)','R_TRIG(SIGNAL)','R_TRIG(SIGNAL; FM)','RS(SETZEN, RUECKSETZEN)','SR(SETZEN, RUECKSETZEN)','SR(SETZEN, RUECKSETZEN; SPEICHER)','STROMSTOSS(TASTER, AUS)','STROMSTOSS(TASTER, AUS; MERK)','TON(SIGNAL, 2.0; HILF)','TONOF(SIGNAL, 2.0, 5.0)','TONOF(SIGNAL, 2.0, 5.0; HILF)','TONR(SIGNAL, RESET, 10.0)','TONR(SIGNAL, RESET, 10.0; HILF)','TP(SIGNAL, 2.0; HILF)','TOF(SIGNAL, 2.0; HILF)'];
(async () => {
  const srv = http.createServer((req, rsp) => { const p = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; } rsp.writeHead(200, {'Content-Type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'}); fs.createReadStream(p).pipe(rsp); }).listen(0);
  await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const fehler = []; page.on('pageerror', e => fehler.push(String(e).slice(0,200))); page.on('dialog', d => d.accept());
  await page.addInitScript(() => { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); });
  await page.goto('http://localhost:' + srv.address().port + '/index.html'); await page.waitForTimeout(3500);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} });
  for (const modus of ['epneu', 'sps']) {
    await page.evaluate(async (m) => { if (!!window.epneuMode !== (m === 'epneu')) { toggleEpneuMode(); await new Promise(r => setTimeout(r, 800)); } }, modus);
    for (const x of AUS) {
      const n0 = fehler.length;
      const r = await page.evaluate(async (code) => {
        const warte = ms => new Promise(r => setTimeout(r, ms));
        const ta = document.getElementById('code'); ta.value = code; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(1300);
        const err = [...(window._collectAllErrors ? window._collectAllErrors() : [])];
        const fw = document.getElementById('fbs-wrapper'); if (fw.style.display === 'none') toggleWorkspaceView('fbs-wrapper');
        if (!window.fbsFupMode) window._toggleFbsFup(); await warte(500);
        const ft = [...(_fbsDoc().querySelectorAll('#fup-norm-svg text'))].map(x => x.textContent);
        window._toggleFbsFup();
        const lm = Logo.aktuell(); const logo = Logo.zeilen(lm).map(z => z.text);
        const st = document.getElementById('festo-wrapper'); if (st.style.display === 'none') toggleWorkspaceView('festo-wrapper'); await warte(1300);
        const asg = Object.assign({}, window._festoLastAssignments); const kab = (window._festoCablesList || []).map(c => c.strand + ':' + c.fromKey + '>' + c.toKey);
        toggleWorkspaceView('festo-wrapper'); await warte(200);
        const bSlot = Object.keys(asg).find(k => asg[k] === 'B');
        const bKabel = bSlot ? kab.some(k => k.includes(bSlot)) : false;
        return { err: err.length, netze: ft.filter(t => /^Netzwerk/.test(t)).length, ftxt: ft.join(' '), logo, stufe: lm.passt.stufe, bSlot, bKabel, ct: componentTypes.B, outs: globalOutputs };
      }, 'B := ' + x);
      const prob = [];
      if (r.err) prob.push('Editorfehler ' + r.err);
      if (r.netze !== 1) prob.push('FUP ' + r.netze + ' Netzwerke');
      if (r.logo.some(z => /ohne Baustein/.test(z))) prob.push('LOGO ohne Baustein: ' + r.logo.filter(z => /ohne Baustein/.test(z)).join(';'));
      if (!r.bSlot || !r.bKabel) prob.push('Steck B: slot=' + r.bSlot + ' kabel=' + r.bKabel);
      if (r.ct !== 'led') prob.push('Typ B=' + r.ct);
      if (fehler.length > n0) prob.push('Seitenfehler ' + fehler.slice(n0).join(' / '));
      prob.length ? schlecht++ : gut++;
      console.log((prob.length ? '  ✗ ' : '  ✓ ') + modus + ' B := ' + x + (prob.length ? '   ' + prob.join(' | ') : '') + '   [LOGO ' + r.stufe + ']');
      if (process.env.V) console.log('   ' + r.ftxt + '\n   ' + r.logo.join(' / '));
    }
  }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await b.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
