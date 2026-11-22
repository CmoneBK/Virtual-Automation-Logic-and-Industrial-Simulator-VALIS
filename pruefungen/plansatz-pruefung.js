// Prüfung „Plansatz drucken“ (plansatz.js): Dialog mit den Teilen der Anlage,
// Deckblatt und Inhaltsverzeichnis mit den richtigen Blattnummern, durchgehende
// Blattnummer über alle Teile, Querverweise im Stromlaufplan zählen ab dem Blatt,
// auf dem er im Plansatz beginnt, Logikplan und Schrittkette als Bild, Zuordnungsliste
// mit Lage im Stromlaufplan, Fluidplan mit Stückliste, leere Auswahl.
//
//   node pruefungen/plansatz-pruefung.js
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
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'de'); localStorage.removeItem('valisBlattAnsicht'); } catch (e) {} });
  await page.goto(`http://localhost:${srv.address().port}/index.html`); await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    try { closeHub(); } catch (e) {}
    const o = {};
    const lesen = html => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return { d, bl: [...d.querySelectorAll('.vb-blatt')] };
    };
    // 1) full_demo: Deckblatt, Inhalt, Stromlaufplan, Logikplan, Zuordnung
    loadExample('full_demo'); await w(800);
    toggleWorkspaceView('circuit-wrapper'); await w(800);
    o.vorhanden = Plansatz.vorhanden();
    const allein = SchaltplanBlatt.blaetter({ erstes: 1 }).length;
    const ausw = { deckblatt: true, inhalt: true, stromlauf: true, logik: true, zuordnung: true };
    const d1 = Plansatz.dokument(ausw);
    const { d, bl } = lesen(d1.html);
    o.anzahl = bl.length; o.liste = d1.liste.length; o.allein = allein;
    o.nummern = bl.map(b => +b.getAttribute('data-blatt'));
    o.vonAlle = bl.map(b => (b.querySelector('.vb-sf') || b).textContent.match(/Blatt (\d+)\/(\d+)/)).map(m => m && +m[2]);
    o.deck = /Plansatz/.test(bl[0].textContent) && new RegExp('Blätter\\s*' + bl.length).test(bl[0].textContent.replace(/\s+/g, ' '));
    // Inhaltsverzeichnis: Zeile n nennt Blatt n
    const zeilen = [...bl[1].querySelectorAll('table.vb-tab tr')].slice(1).map(tr => [+tr.cells[0].textContent, tr.cells[1].textContent]);
    o.inhalt = zeilen.length === bl.length && zeilen.every((z, i) => z[0] === i + 1);
    o.inhaltTitel = zeilen.map(z => z[1]);
    // Querverweise: Stromlaufplan beginnt auf Blatt 3, kein Verweis auf Blatt 1 oder 2
    const strom = bl.filter(b => b.querySelector('svg[data-schaltplan-blatt]'));
    o.stromVon = strom.length ? +strom[0].getAttribute('data-blatt') : 0;
    const qv = [...d.querySelectorAll('text.circ-qv')].map(t => t.textContent.replace(/[^\d.]/g, ''));
    o.qv = qv.length; o.qvFalsch = qv.filter(a => { const n = +a.split('.')[0]; return n < 3 || n >= 3 + strom.length; });
    const lage = Object.values(SchaltplanBlatt.lage || {});
    o.lageFalsch = lage.filter(a => +String(a).split('.')[0] < 3);
    // Logikplan als Bild mit Bausteinen, ohne die Bildschirm-Verschiebung
    const lb = bl.find(b => /Logikplan/.test(b.textContent) && b.querySelector('.mitte svg'));
    o.logik = !!(lb && lb.querySelector('.fbs-block')) && !/svg-pan-zoom_viewport[^>]*transform: matrix/.test(lb.innerHTML);
    // Zuordnungsliste mit Lage
    const zb = bl.find(b => /Zuordnungs- und Betriebsmittelliste/.test(b.textContent));
    o.zuord = !!zb && /Lage \(Blatt\.Spalte\)/.test(zb.textContent) && [...zb.querySelectorAll('td')].some(td => /^\d+\.\d+$/.test(td.textContent));
    // 2) Ohne Deckblatt und Inhalt beginnt der Stromlaufplan auf Blatt 1
    const d2 = lesen(Plansatz.dokument({ stromlauf: true }).html);
    o.ohneVorne = +d2.bl[0].getAttribute('data-blatt') === 1 && d2.bl.length === allein;
    // 3) Leere Auswahl
    o.leer = Plansatz.dokument({}).liste.length === 0;
    // 4) Dialog: Häkchen je Teil, Vorschlag, leere Teile gesperrt
    const box = Plansatz.oeffnen();
    const h = k => box.querySelector(`[data-plansatz="${k}"]`);
    o.dialog = Plansatz.TEILE.every(([k]) => h(k)) && h('stromlauf').checked && h('logik').checked && !h('elektro').checked && h('fluid').disabled && /\(leer\)/.test(box.textContent);
    // Drucken mit einem Ersatz-Fenster
    let gedruckt = null; const alt = Blatt.drucken; Blatt.drucken = (html) => { gedruckt = html; return true; };
    box.querySelectorAll('[data-plansatz]').forEach(i => { i.checked = false; });
    h('deckblatt').checked = true; h('stromlauf').checked = true;
    box.querySelector('[data-sf="anlage"]').value = 'Stempelanlage Prüfung';
    box.querySelector('[data-a="los"]').click(); await w(200);
    Blatt.drucken = alt;
    o.druck = !!gedruckt && /Stempelanlage Prüfung/.test(gedruckt) && !/Inhaltsverzeichnis/.test(gedruckt);
    try { const z = document.querySelector('.fp-sf-dialog'); z && z.remove(); } catch (e) {}
    // 5) Schrittkette
    if (!window._isProMode()) window._toggleProMode();
    loadExample('schrittkette_bohrer'); await w(800);
    try { window._skTriggerRerender(); } catch (e) {} await w(300);
    o.vorhSchritt = Plansatz.vorhanden().schritt;
    const d5 = lesen(Plansatz.dokument({ inhalt: true, schritt: true }).html);
    o.schritt = d5.bl.length === 2 && !!d5.bl[1].querySelector('.mitte svg text') && /Schrittkette/.test(d5.bl[1].textContent);
    // 6) Fluidplan mit Stückliste
    const F = Fluidplan; F.oeffnen(); await w(300);
    F.beispielLaden(0); await w(300);
    try { F.schliessen && F.schliessen(); } catch (e) {}
    o.vorhFluid = Plansatz.vorhanden().fluid;
    const d6 = Plansatz.dokument({ deckblatt: true, fluid: true, stueckliste: true });
    const l6 = lesen(d6.html);
    o.fluid = d6.liste.some(b => b.teil === 'fluid') && d6.liste.some(b => b.teil === 'stueckliste') && l6.bl.map(b => +b.getAttribute('data-blatt')).every((n, i) => n === i + 1);
    return o;
  });
  console.log('Plansatz drucken');
  ok('Anlage erkannt: Stromlaufplan, Logikplan, Zuordnung vorhanden, Fluidplan leer', r.vorhanden.stromlauf && r.vorhanden.logik && r.vorhanden.zuordnung && !r.vorhanden.fluid, JSON.stringify(r.vorhanden));
  ok('Blätter = Deckblatt + Inhalt + Stromlaufplan + Logikplan + Zuordnung', r.anzahl === r.allein + 4 && r.liste === r.anzahl, `${r.anzahl} / ${r.allein}`);
  ok('Blattnummern durchgehend 1 … n', r.nummern.every((n, i) => n === i + 1), r.nummern.join(','));
  ok('Jedes Schriftfeld nennt dieselbe Gesamtzahl', r.vonAlle.every(v => v === r.anzahl), r.vonAlle.join(','));
  ok('Deckblatt mit Titel und Zahl der Blätter', r.deck);
  ok('Inhaltsverzeichnis: Zeile n = Blatt n, alle Blätter', r.inhalt, r.inhaltTitel.join(' | '));
  ok('Stromlaufplan beginnt auf Blatt 3', r.stromVon === 3, r.stromVon);
  ok('Querverweise zeigen auf Blätter des Stromlaufplans im Plansatz', r.qv > 0 && r.qvFalsch.length === 0, `${r.qv} Verweise, falsch: ${r.qvFalsch.slice(0, 5)}`);
  ok('Lage in der Zuordnungsliste zählt ab Blatt 3', r.lageFalsch.length === 0, r.lageFalsch.slice(0, 5));
  ok('Logikplan als Bild mit Bausteinen, ohne Zoom des Bildschirms', r.logik);
  ok('Zuordnungsliste mit Spalte Lage (Blatt.Spalte)', r.zuord);
  ok('Ohne Deckblatt und Inhalt beginnt der Stromlaufplan auf Blatt 1', r.ohneVorne);
  ok('Leere Auswahl gibt keine Blätter', r.leer);
  ok('Dialog: Häkchen je Teil, Vorschlag, leere Teile gesperrt', r.dialog);
  ok('Dialog druckt die gewählten Teile mit dem Schriftfeld', r.druck);
  ok('Schrittkette erkannt und als Bild gedruckt', r.vorhSchritt && r.schritt);
  ok('Fluidplan und Stückliste im Plansatz, Nummern durchgehend', r.vorhFluid && r.fluid);
  ok('Keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
