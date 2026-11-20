// Prüfung: Code aus fremden Ständen läuft nicht ohne Zustimmung.
// Teilen-Links, Dateien, Klassen und die Bibliothek bringen Stände mit. Was
// VALIS daraus als JavaScript ausführen würde (Nutzer-Plugins, eigene
// JS-Bedingungen in Aufgaben, Bauteil-Formeln, Ausgangsnamen im SPS-Code),
// braucht eine strenge Form oder die ausdrückliche Zustimmung.
//
//   node pruefungen/fremdcode-pruefung.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
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
const ok = (b, t) => { if (b) { gut++; console.log('  ✓ ' + t); } else { schlecht++; console.log('  ✗ ' + t); } };

// Harmloser Marker statt echtem Schadcode: Läuft der Plugin-Code, setzt er window.__fremd.
const PLUGIN = '(window.__fremd = 1, { role: "output", color: "#888", build: function () {} })';

async function seite(browser, port, { hash = '', zustimmen = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const dialoge = [];
  page.on('dialog', d => { dialoge.push(d.message()); zustimmen ? d.accept() : d.dismiss(); });
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); } catch (e) {} });
  await page.goto(`http://localhost:${port}/index.html${hash}`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} });
  return { page, dialoge };
}

(async () => {
  const srv = await server(), port = srv.address().port, browser = await chromium.launch();
  const lz = fs.readFileSync(path.join(WURZEL, 'vendor', 'lz-string.min.js'), 'utf8');
  const LZString = new Function(lz + '; return LZString;')();
  const hash = '#state=' + LZString.compressToEncodedURIComponent(JSON.stringify({ code: 'LAMPE := START', userPlugins: { fremd_plugin: PLUGIN } }));

  console.log('Teilen-Link mit Nutzer-Plugin, abgelehnt:');
  {
    const { page, dialoge } = await seite(browser, port, { hash });
    const r = await page.evaluate(() => ({ lief: window.__fremd === 1, gespeichert: /fremd_plugin/.test(localStorage.getItem('valisUserPlugins') || '') }));
    ok(dialoge.some(m => /Plugin/.test(m) && /fremd_plugin/.test(m)), 'Rückfrage nennt das Plugin');
    ok(!r.lief, 'Plugin-Code lief nicht');
    ok(!r.gespeichert, 'Plugin nicht gespeichert');
    await page.close();
  }
  console.log('Teilen-Link mit Nutzer-Plugin, zugestimmt:');
  {
    const { page } = await seite(browser, port, { hash, zustimmen: true });
    const r = await page.evaluate(() => ({ lief: window.__fremd === 1, gespeichert: /fremd_plugin/.test(localStorage.getItem('valisUserPlugins') || '') }));
    ok(r.lief && r.gespeichert, 'Plugin nach Zustimmung installiert');
    await page.close();
  }

  console.log('Formeln, JS-Bedingungen, SPS-Code:');
  {
    const { page, dialoge } = await seite(browser, port);
    const r = await page.evaluate(async () => {
      const o = {};
      o.formelGut = window._formelErlaubt('START AND NOT STOP') && window._formelErlaubt('(A && ¬B) || C1_X');
      o.formelZeichen = !window._formelErlaubt('[]+!') && !window._formelErlaubt("A']") && !window._formelErlaubt('window.__f=1') && !window._formelErlaubt('`x`');
      o.formelRechnet = resolveLinked({ linkedFormula: 'START AND NOT STOP' }, { START: true, STOP: false }) === true
        && resolveLinked({ linkedFormula: '¬STOP' }, { STOP: true }) === false;
      o.formelVerworfen = resolveLinked({ linkedFormula: '(window.__f = 1)' }, {}) === false && window.__f === undefined;
      o.jsFremd = window._jsBedingung('(window.__j = 1, true)') === null && window.__j === undefined;
      o.jsUebungsanlage = typeof window._jsBedingung('window.Uebungsanlagen&&window.Uebungsanlagen.ok("o14",0)') === 'function';
      // Aufgabe mit fremder JS-Bedingung starten (Rückfrage wird abgelehnt)
      const aufgabe = { id: 'fremd_test', name: 'Fremd', conditions: [{ type: 'custom_js', label: 'x', expression: '(window.__j = 2, true)' }] };
      try { window._startTask(aufgabe); } catch (e) {}
      await new Promise(r => setTimeout(r, 1500));
      o.aufgabeOhneZustimmung = !window._jsBedingungVertraut('(window.__j = 2, true)') && window.__j === undefined;
      try { window._taskCancel && window._taskCancel(); } catch (e) {}
      // Ausgangsname, der aus state['…'] ausbrechen will
      const ta = document.getElementById('code');
      ta.value = "X'];window.__c++;state['Y := START";
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1200));
      const b = [...document.querySelectorAll('button')].find(b => /Simulation starten/.test(b.textContent)); b && b.click();
      await new Promise(r => setTimeout(r, 1500));
      o.ausgangsname = window.__c === undefined;
      return o;
    });
    for (const [k, v] of Object.entries(r)) ok(v, k);
    ok(dialoge.some(m => /JavaScript-Bedingung/.test(m)), 'Rückfrage beim Aufgabenstart');
    await page.close();
  }
  await browser.close(); srv.close();
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  process.exit(schlecht ? 1 : 0);
})();
