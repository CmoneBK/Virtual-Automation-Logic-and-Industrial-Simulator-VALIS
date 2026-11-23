const { chromium } = require('playwright');
// Herkunft der Panels im Steckaufbau (Christoph, 23.11.2026): jedes Panel
// trägt seine Herstellernummer (FESTO nnnnnn) oder das Schild „gibt es so
// nicht“ (window._festoHerkunftMarken, Tabellen _FESTO_NUMMER/_FESTO_OHNE_VORBILD).
//
//   node pruefungen/herkunft-pruefung.js
//   node pruefungen/count-fg-pruefung.js
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

// Herkunft der Panels im Steckaufbau (Christoph, 23.11.2026): Jedes Panel trägt
// seine Herstellernummer oder das Schild „gibt es so nicht“. Kein Panel darf so
// aussehen, als gäbe es das als Produkt, wenn es das nicht gibt.
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
  await page.evaluate(() => toggleWorkspaceView('festo-wrapper'));
  await w(1200);

  const pruefen = () => page.evaluate(() => {
    const svg = _festoDoc().getElementById('festo-svg');
    const out = {};
    svg.querySelectorAll('g[data-festo-panel-type]').forEach(g => {
      if (g.parentElement && g.parentElement.closest('g[data-festo-panel-type]')) return;
      const typ = g.getAttribute('data-festo-panel-type');
      const txt = [...g.querySelectorAll('text')].map(t => t.textContent).join(' ');
      const nummer = /FESTO \d{6,7}/.test(txt);
      const schild = !!g.querySelector('[data-festo-fiktiv]');
      out[typ] = out[typ] || { nummer: false, schild: false, n: 0 };
      out[typ].n++; out[typ].nummer = out[typ].nummer || nummer; out[typ].schild = out[typ].schild || schild;
    });
    return out;
  });

  console.log('Freier Aufbau mit allen Modulen');
  const typen = await page.evaluate(() => {
    window._toggleFestoFreeBuild(true);
    const A = window._fbAusSicht;
    A.module().forEach(m => A.entfernen(m.prefix));
    const arten = A.typen().map(t => t.art);
    arten.forEach(a => { try { A.modul(a); } catch (e) {} });
    return arten;
  });
  await w(1500);
  await page.evaluate(() => { try { window._festoHerkunftMarken(); } catch (e) {} });
  const r = await pruefen();
  ok('Alle Modularten stehen auf der Wand', typen.every(t => r[t] || Object.keys(r).some(k => k.replace('-', '_') === t)), typen.filter(t => !r[t]).join(', '));
  Object.entries(r).forEach(([typ, v]) => {
    ok(`${typ}: Herstellernummer oder Schild „gibt es so nicht“`, v.nummer || v.schild, JSON.stringify(v));
  });
  ok('PID-Reglerkarte trägt FESTO 162254', r.ana_pid && r.ana_pid.nummer, JSON.stringify(r.ana_pid));
  ok('Analoggeber trägt das Schild', r.ana_geber && r.ana_geber.schild, JSON.stringify(r.ana_geber));
  const titel = await page.evaluate(() => { const b = _festoDoc().querySelector('[data-festo-fiktiv="ana_geber"] title'); return b ? b.textContent : ''; });
  ok('Schild erklärt sich im Tooltip', /gibt es ihn so nicht/.test(titel), titel);

  await page.evaluate(() => { const g = _festoDoc().querySelector('g[data-festo-panel-type="ana_geber"]'); if (g) g.scrollIntoView(); });
  if (process.env.BILD) {
    await page.evaluate(() => { const p = document.querySelector('.fb-menu, #fb-menu'); if (p) p.style.display = 'none'; });
    const sel = ['ana_geber', 'ana_pid'];
    for (const t of sel) { const h = await page.$(`g[data-festo-panel-type="${t}"]`); if (h) await h.screenshot({ path: process.env.BILD.replace('.png', '-' + t + '.png') }).catch(() => {}); }
  }

  console.log('Steckaufbau aus dem Code (Regler, Analog-Interface)');
  await page.evaluate(() => { window._toggleFestoFreeBuild(false); const ta = document.getElementById('code'); ta.value = 'Y := PID(W, X, 2, 5, 0)\nV := ZUSTAND(S, P, 1, 0, 0, 1)\nH := ZWEIPUNKT(T, 60, 4, HEIZEN)'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await w(2500);
  await page.evaluate(() => { try { window._festoHerkunftMarken(); } catch (e) {} });
  const r2 = await pruefen();
  ok('Code-Aufbau zeigt Panels', Object.keys(r2).length > 0, JSON.stringify(Object.keys(r2)));
  Object.entries(r2).filter(([typ]) => typ !== 'ana_komp').forEach(([typ, v]) => {
    ok(`${typ} (Code): Herstellernummer oder Schild`, v.nummer || v.schild, JSON.stringify(v));
  });

  console.log('Proportionalventil mit Verstärkerkarte (Fluidplan)');
  await page.evaluate(() => {
    const F = window.Fluidplan;
    F.setzen('ventil', 0, 100, { hyd: true, wege: '4/3', links: 'prop', rechts: 'prop', varS: 'YPROP', qn: 40, elektronik: 'karte' });
    const ta = document.getElementById('code'); ta.value = 'YPROP := 70'; ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await w(3000);
  await page.evaluate(() => { try { window._updateFestoAnalog && window._updateFestoAnalog(); window._festoHerkunftMarken(); } catch (e) {} });
  const r3 = await pruefen();
  ok('Verstärkerkarte trägt FESTO 162255', r3.ana_pv && r3.ana_pv.nummer && !r3.ana_pv.schild, JSON.stringify(r3.ana_pv));
  ok('Magnetfeld des Ventils trägt das Schild', r3.ana_pvm && r3.ana_pvm.schild, JSON.stringify(r3.ana_pvm));
  if (process.env.BILD) { const h = await page.$('g[data-festo-panel-type="ana_pv"]'); if (h) { await h.scrollIntoViewIfNeeded().catch(() => {}); await h.screenshot({ path: process.env.BILD.replace('.png', '-ana_pv.png') }).catch(e => console.log(String(e))); } }

  ok('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
