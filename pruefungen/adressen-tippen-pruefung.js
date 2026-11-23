const { chromium } = require('playwright');
// SPS-Adressen beim Tippen (Christoph 23.11.2026): halbe Namen (C, CL, CLK …)
// dürfen keine Adressen belegen, sonst landen Eingänge bei E3.x und der
// Steckaufbau hat keine Buchse dafür (E/A werden nicht gesteckt).
//
//   node pruefungen/adressen-tippen-pruefung.js
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

  await page.evaluate(async () => { try { closeHub(); } catch (e) {} if (window.epneuMode) toggleEpneuMode(); if (document.getElementById('festo-wrapper').style.display === 'none') toggleWorkspaceView('festo-wrapper'); });
  await w(800);
  const programme = ['OUT := TONOF(IN, 2.0, 5.0)', 'OUT := TONR(IN, R, 5)', 'OUT := F_TRIG(CLK)', 'OUT := CTD(CD, LD, 10)', 'Z := CTUD(CU, CD, R, LD, 5)\nOUT := Z'];
  for (const c of programme) {
    await page.click('#code'); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
    await page.keyboard.type(c, { delay: 25 });
    await w(1800);
    const r = await page.evaluate(() => {
      let k = []; try { k = (window.valisBruecke.festo().kabel || []).map(k => [k.von, k.nach]); } catch (e) {}
      const ein = (globalInputs || []).map(n => [n, window._getSpsAddresses()[n]]);
      const aus = (globalOutputs || []).filter(n => !window._isMerkerVar(n)).map(n => [n, window._getSpsAddresses()[n]]);
      return { ein, aus, din: k.filter(x => x.some(s => /ANS_DIN_/.test(s))).length, dout: k.filter(x => x.some(s => /ANS_DOUT_/.test(s))).length };
    });
    const adr = r.ein.concat(r.aus).map(x => x[1]);
    ok(c.replace(/\n/g, ' / ') + ': Adressen ab E0.0/A0.0 und alle E/A gesteckt',
      adr.every(a => /^[EA][01]\.[0-7]$/.test(a || '')) && r.din === r.ein.length && r.dout === r.aus.length, JSON.stringify(r));
  }

  // Alte Adressen aus dem Browser-Speicher (E2.5, A2.0 …), wie bei Christoph:
  // neue Seite mit vorbelegtem localStorage, Programm in einem Zug eingefügt.
  const alt = { IN: 'E2.5', CLK: 'E2.4', OUT: 'A2.0', START: 'E3.1', STOP: 'E3.2', BAND: 'A2.3', LED_BETRIEB: 'A2.4' };
  const page2 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page2.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  page2.on('dialog', d => d.accept());
  await page2.addInitScript(a => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('valisSpsAddresses', JSON.stringify(a)); sessionStorage.setItem('gesetzt', '1'); } } catch (e) {} }, alt);
  await page2.goto(url); await page2.waitForTimeout(3500);
  await page2.evaluate(async () => { try { closeHub(); } catch (e) {} if (window.epneuMode) toggleEpneuMode(); if (document.getElementById('festo-wrapper').style.display === 'none') toggleWorkspaceView('festo-wrapper'); });
  await page2.waitForTimeout(800);
  for (const c of ['OUT := TONOF(IN, 2.0, 5.0)', 'OUT := R_TRIG(CLK)', 'BAND := START AND NOT STOP\nLED_BETRIEB := BAND']) {
    await page2.click('#code'); await page2.keyboard.press('Control+A'); await page2.keyboard.press('Delete');
    await page2.keyboard.insertText(c);
    await page2.waitForTimeout(1800);
    const r = await page2.evaluate(() => {
      let k = []; try { k = (window.valisBruecke.festo().kabel || []).map(k => [k.von, k.nach]); } catch (e) {}
      const ein = (globalInputs || []).map(n => [n, window._getSpsAddresses()[n]]);
      const aus = (globalOutputs || []).filter(n => !window._isMerkerVar(n)).map(n => [n, window._getSpsAddresses()[n]]);
      return { ein, aus, din: k.filter(x => x.some(s => /ANS_DIN_/.test(s))).length, dout: k.filter(x => x.some(s => /ANS_DOUT_/.test(s))).length };
    });
    const adr = r.ein.concat(r.aus).map(x => x[1]);
    ok('alte Adressen im Speicher, ' + c.replace(/\n/g, ' / ') + ': neu ab E0.0/A0.0 und gesteckt',
      adr.every(a => /^[EA][01]\.[0-7]$/.test(a || '')) && r.din === r.ein.length && r.dout === r.aus.length, JSON.stringify(r));
  }
  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
