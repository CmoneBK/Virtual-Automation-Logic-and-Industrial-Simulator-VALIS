const { chromium } = require('playwright');
// Prüfung englische Fassung (sprache/sprache-en.js + sprache/en-woerter.js):
// Wörterbuch lädt, Kopfleiste und Lernzentrum ohne deutsche Reste, Lexikon,
// Szenarien in englischer Wortfolge, Code-Beispiele mit englischen Kommentaren
// (Code selbst unverändert), Plugin-Doku mit Zeilenumbrüchen, Vorlagen fangen
// keine fremden Sätze ein, Rückweg nach Deutsch stellt alles wieder her.
//
//   node pruefungen/englisch-pruefung.js
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

// Sucht in einem Bereich sichtbare deutsche Texte (Textknoten und Tooltips)
const RESTE = (sel) => {
  const W = /[äöüÄÖÜß]|\b(der|die|das|und|oder|nicht|ist|sind|wird|mit|für|auf|bei|ein|eine|dem|den|zum|nach|über|wenn|dann|auch|nur|kein|keine|du|hier|alle|ohne|Klick|Taster|Zylinder|Ventil|Lampe|Fehler|Anlage|Aufgabe|Hinweis|Schalter|Eingang|Ausgang|Zähler|Leitung|Bauteil|Kabel|Spule|Schritt)\b/;
  const AUS = 'script, style, textarea, input, select, pre, code, .CodeMirror, [contenteditable="true"], .no-i18n, [data-no-i18n], #code-highlight, #editor-container .highlight';
  const r = document.querySelector(sel); if (!r) return ['(kein ' + sel + ')'];
  const out = new Set();
  const tw = document.createTreeWalker(r, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = tw.currentNode; n; n = tw.nextNode()) {
    if (n.nodeType === 3) {
      const p = n.parentElement; const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (t && p && !p.closest(AUS) && p.getClientRects().length && W.test(t) && !/^[A-Z0-9_ ¬&|:=().,]+$/.test(t)) out.add(t.slice(0, 90));
    } else if (n.title && !n.closest(AUS) && W.test(n.title)) out.add('@title ' + n.title.slice(0, 90));
  }
  return [...out];
};

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const fehler = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); localStorage.setItem('valisLang', 'en'); } catch (e) {} });
  await page.goto(url); await page.waitForTimeout(4000);
  const w = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { try { closeHub(); } catch (e) {} });

  console.log('Wörterbuch');
  const st = await page.evaluate(() => window.VALIS_EN && window.VALIS_EN.stats());
  ok('Wörterbuch geladen (über 8000 Texte, über 500 Vorlagen)', st && st.text > 8000 && st.vorlagen > 500, JSON.stringify(st));
  const t = await page.evaluate(() => [
    VALIS_EN.t('Lernzentrum (Strg+K) — Tour, Lektionen, Beispiele, Aufgaben, Komponenten-Tutorials und Hilfe an einem Ort'),
    VALIS_EN.t('Rückgängig (Strg+Z)'),
    VALIS_EN.t('Schritt 3'),
    VALIS_EN.t('Das ist ein langer deutscher Satz mit einer Aufgabe darin, den es nicht gibt')
  ]);
  ok('Ganzer Satz statt Wortersatz', /^Learning Center/.test(t[0]) && /tasks/.test(t[0]) && !/taskn/.test(t[0]), t[0].slice(0, 60));
  ok('Kurzer Text', t[1] === 'Undo (Ctrl+Z)', t[1]);
  ok('Vorlage mit Zahl', t[2] === 'Step 3', t[2]);
  ok('Vorlage fängt keinen fremden Satz ein', !/task/.test(t[3]), t[3].slice(0, 60));

  console.log('Kopfleiste und Fenster');
  const kopf = await page.evaluate(RESTE, '.header-area');
  ok('Kopfleiste ohne deutsche Reste', kopf.length === 0, kopf.slice(0, 5).join(' | '));
  await page.evaluate(() => loadExample('full_demo')); await w(1500);
  for (const v of ['fbs-wrapper', 'circuit-wrapper', 'factory-wrapper', 'fluid-wrapper']) {
    await page.evaluate(v => { const e = document.getElementById(v); if (e && e.style.display === 'none') toggleWorkspaceView(v); }, v); await w(600);
  }
  const fenster = await page.evaluate(RESTE, 'body');
  ok('Hauptansicht: höchstens 15 deutsche Reste', fenster.length <= 15, fenster.length + ': ' + fenster.slice(0, 6).join(' | '));

  console.log('Lernzentrum');
  await page.evaluate(() => openHub()); await w(600);
  const secs = await page.evaluate(() => [...document.querySelectorAll('[data-hub-panel]')].map(e => e.getAttribute('data-hub-panel')));
  let hubReste = [];
  for (const s of secs) {
    await page.evaluate(s => window._hubShowSection(s), s); await w(500);
    hubReste = hubReste.concat((await page.evaluate(RESTE, '#hub-overlay')).map(x => s + ': ' + x));
  }
  hubReste = [...new Set(hubReste)];
  ok('Lernzentrum: höchstens 10 deutsche Reste in ' + secs.length + ' Bereichen', hubReste.length <= 10, hubReste.length + ': ' + hubReste.slice(0, 6).join(' | '));
  await page.evaluate(() => window._hubShowSection('lexikon')); await w(400);
  const lex = await page.evaluate(() => {
    const k = [...document.querySelectorAll('.lex-card')].find(c => /Reset/i.test(c.querySelector('.lex-term').textContent));
    return k ? k.querySelector('.lex-alias').textContent : '';
  });
  ok('Lexikon: Synonyme englisch', lex && !/[äöü]|zurücksetzen/.test(lex), lex.slice(0, 80));
  await page.evaluate(() => window._hubShowSection('szenario')); await w(400);
  const sz = await page.evaluate(() => {
    const s = (window.SZENARIEN || []).find(x => x.id === 'maxi-klemmstation');
    return s ? s.seg.map(x => x.text || x.t || x.disp || '').join(' ') : '';
  });
  ok('Szenario aus Auszeichnung: englisch', sz === '' || !/\b(und|wenn|oder|der|die)\b/.test(sz), sz.slice(0, 90));
  await page.evaluate(() => closeHub());

  console.log('Code');
  // Alle Beispiele: VALIS_EN.code ändert nur Kommentare
  const bsp = await page.evaluate(() => {
    const nurCode = s => s.split('\n').map(z => z.replace(/\/\/.*$/, '').trimEnd()).join('\n');
    let n = 0, kommentiert = 0, geaendert = 0; const kaputt = [];
    for (const k of Object.keys(EXAMPLES)) {
      const ex = EXAMPLES[k]; const de = typeof ex === 'string' ? ex : ex && ex.code;
      if (typeof de !== 'string' || !de) continue;
      n++; const en = VALIS_EN.code(de);
      if (nurCode(en) !== nurCode(de)) kaputt.push(k);
      if (/\/\/.*[äöüß]/.test(de)) { kommentiert++; if (en !== de) geaendert++; else kaputt.push('unübersetzt:' + k); }
    }
    return { n, kommentiert, geaendert, kaputt };
  });
  ok('Beispielcode: Code selbst unverändert (' + bsp.n + ' Beispiele)', bsp.n > 5 && bsp.kaputt.filter(x => !/^unübersetzt/.test(x)).length === 0, bsp.kaputt.slice(0, 5).join(' '));
  ok('Beispielcode: Kommentare englisch', bsp.geaendert === bsp.kommentiert, bsp.geaendert + ' von ' + bsp.kommentiert + ' ' + bsp.kaputt.join(' '));
  const geladen = await page.evaluate(() => { loadExample('schrittkette_bohrer'); return document.getElementById('code').value; });
  ok('Geladenes Beispiel hat englische Kommentare', !/\/\/.*[äöüß]/.test(geladen), (geladen.match(/\/\/.*$/m) || [''])[0].slice(0, 60));
  const pre = await page.evaluate(() => {
    const p = [...document.querySelectorAll('pre')].find(x => /^menuTarget: '#menu-aktoren'/.test(x.textContent));
    return p ? p.textContent : '';
  });
  ok('Plugin-Doku: Kommentare englisch, Zeilen bleiben', /Actuators/.test(pre) && pre.split('\n').length >= 3, pre.split('\n')[0]);

  console.log('Rückweg');
  await page.evaluate(() => switchLanguage('de')); await w(800);
  const de = await page.evaluate(() => [document.getElementById('btn-hub').title, document.querySelector('.header-area').innerText]);
  ok('Deutsch wieder hergestellt', /^Lernzentrum \(Strg\+K\)/.test(de[0]) && /Lernzentrum/.test(de[1]), de[0].slice(0, 40));

  ok('Keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} bestanden, ${schlecht} fehlgeschlagen`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
