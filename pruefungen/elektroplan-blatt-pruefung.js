// Prüfung Elektroplan-Editor auf Blättern (elektroplan-blatt.js + blatt.js):
// Querverweis an jedem Hilfskontakt = Blatt.Spalte seiner Spule, Kontaktspiegel unter
// jeder Spule = Blatt.Spalte ihrer Kontakte, nachgerechnet aus den gedruckten Blättern.
// Kein Bauteil auf einer Blattgrenze, Blattrahmen als Hilfe beim Zeichnen ein/aus.
//
//   node pruefungen/elektroplan-blatt-pruefung.js
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
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };
(async () => {
  const srv = await server(), browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.removeItem('valisCedBlatt'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    const messen = (html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return [...d.querySelectorAll('.vb-blatt')].map(b => {
        const s = b.querySelector('svg[data-elektroplan-blatt]'); if (!s) return null;
        const [vx, , S] = s.getAttribute('viewBox').split(/\s+/).map(Number);
        const clip = s.querySelector('clipPath rect');
        return { nr: +b.getAttribute('data-blatt'), vx, S, breite: clip ? +clip.getAttribute('width') : S, spalten: b.querySelectorAll('.vb-sp').length, svg: s };
      }).filter(Boolean);
    };
    const adr = (bl, x) => {
      const b = bl.find(q => x >= q.vx && x < q.vx + q.breite) || bl[bl.length - 1];
      return { a: b.nr + '.' + Math.max(1, Math.min(b.spalten, Math.floor((x - b.vx) / (b.S / b.spalten)) + 1)), b };
    };
    const out = [];
    for (const k of ['full_demo', 'portal_crane', 'roboter_handshake']) {
      loadExample(k); await w(500);
      toggleWorkspaceView('circuit-editor-wrapper'); await w(1000);
      const o = { name: k, falschQv: [], falschSp: [], amRand: [], qv: 0, sp: 0 };
      const html = ElektroplanBlatt.drucken(true);
      const bl = messen(html || '');
      o.blaetter = bl.length;
      const rel = ElektroplanBlatt.relais();
      rel.forEach(r => {
        const soll = adr(bl, r.x);
        r.kontakte.forEach(k => {
          const ka = adr(bl, k.x);
          const qv = [...ka.b.svg.querySelectorAll('text.ced-qv')].filter(t => t.getAttribute('data-spule') === r.varName && Math.abs(+t.getAttribute('x') - (k.x + 6)) < 0.5);
          if (qv.length !== 1 || qv[0].textContent !== '↑ ' + soll.a) o.falschQv.push(`${r.name}@${ka.a}: ${qv.map(t => t.textContent).join('/') || '–'} statt ↑ ${soll.a}`); else o.qv++;
        });
        const g = soll.b.svg.querySelector(`.ced-spiegel[data-spule="${CSS.escape(r.varName)}"]`);
        const ist = g ? [...g.querySelectorAll('.ced-spiegel-nr')].map(t => t.textContent).sort() : [];
        const sollSp = r.kontakte.map(k => adr(bl, k.x).a).sort();
        if (JSON.stringify(ist) !== JSON.stringify(sollSp)) o.falschSp.push(`${r.name}: ${ist} statt ${sollSp}`); else o.sp++;
      });
      // kein Bauteilkörper auf einer Schnittlinie
      const T = window._cedTypen;
      _cedState.components.forEach(c => { const t = T[c.type]; if (!t) return; bl.forEach(b => { if (b.vx > c.x + 2 && b.vx < c.x + t.w - 2) o.amRand.push(c.varName || c.type); }); });
      o.relais = rel.length; o.kontakte = rel.reduce((n, r) => n + r.kontakte.length, 0);
      o.ohneHilfen = !/ced-pin|ced-wire-hit|ced-rail-hit|ced-blatt-hilfe/.test(html || '');
      toggleWorkspaceView('circuit-editor-wrapper'); await w(300);
      out.push(o);
    }
    // Blattrahmen beim Zeichnen
    toggleWorkspaceView('circuit-editor-wrapper'); await w(800);
    const rahmen = {};
    cedToggleBlatt(true); await w(100);
    rahmen.an = !!document.getElementById('ced-blatt') && /Blatt 1/.test(document.getElementById('ced-blatt').textContent);
    window.cedAutoAlign && window.cedAutoAlign(); await w(200);
    rahmen.bleibt = !!document.getElementById('ced-blatt');
    cedToggleBlatt(false); await w(100);
    rahmen.aus = !document.getElementById('ced-blatt');
    rahmen.gemerkt = localStorage.getItem('valisCedBlatt') === '0';
    ElektroplanBlatt.drucken(); await w(100);
    const dlg = document.querySelector('.vb-dialog');
    rahmen.dialog = !!dlg && !!dlg.querySelector('[data-blatt-format]');
    if (dlg) dlg.querySelector('[data-a="zu"]').click();
    // leerer Plan: kein Druck
    const alt = _cedState.components.slice(); _cedState.components.length = 0;
    rahmen.leer = ElektroplanBlatt.blaetter({}).length === 0;
    _cedState.components.push(...alt);
    return { out, rahmen };
  });
  for (const o of r.out) {
    console.log(o.name);
    ok('Blätter erzeugt', o.blaetter >= 1, o.blaetter + ' Blätter, ' + o.relais + ' Spulen, ' + o.kontakte + ' Hilfskontakte');
    ok(`Querverweise zeigen auf die Spule (${o.qv})`, !o.falschQv.length && o.qv === o.kontakte, o.falschQv.slice(0, 4).join(' | '));
    ok(`Kontaktspiegel zeigen auf die Kontakte (${o.sp})`, !o.falschSp.length && o.sp === o.relais, o.falschSp.slice(0, 4).join(' | '));
    ok('kein Bauteil auf einer Blattgrenze', !o.amRand.length, o.amRand.join(', '));
    ok('ohne Bearbeitungshilfen im Druck', o.ohneHilfen);
  }
  console.log('Blattrahmen beim Zeichnen');
  ok('Rahmen an', r.rahmen.an);
  ok('bleibt beim Neuzeichnen', r.rahmen.bleibt);
  ok('Rahmen aus', r.rahmen.aus);
  ok('Einstellung gemerkt', r.rahmen.gemerkt);
  ok('Dialog mit Format und Schriftfeld', r.rahmen.dialog);
  ok('leerer Plan: keine Blätter', r.rahmen.leer);
  ok('keine Fehler', !fehler.length, fehler.join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close(); process.exit(schlecht ? 1 : 0);
})();
