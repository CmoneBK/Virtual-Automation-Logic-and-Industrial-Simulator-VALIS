const { chromium } = require('playwright');
// Rundlauf-Prüfung des Schaltplan-Editors: Code → „Aus Code“ → Plan → Code.
// Läuft über alle Beispiele (EXAMPLES) und alle Code-Stellen in index.html
// (Lektionen, Aufgaben, Musterlösungen). Verglichen wird per Wahrheitstabelle,
// Schrittketten und Programmbausteine wörtlich, INPUT-Zeilen müssen bleiben.
// Zwei Runden: der zurückgeschriebene Code muss beim zweiten Einlesen gleich bleiben.
//
//   node pruefungen/schaltplan-editor-rundlauf.js
//
// Braucht Playwright mit Chromium (require('playwright')).
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
function korpusAusIndex() {
  const s = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
  const re = /\b(code|refCode|loesung|solution|startCode|musterCode|solutionCode)\s*:\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  const out = new Set(); let m;
  while ((m = re.exec(s))) {
    if (/\$\{/.test(m[2])) continue;
    let v; try { v = eval(m[2]); } catch (e) { continue; }
    if (typeof v === 'string' && /:=/.test(v)) out.add(v);
  }
  return [...out];
}
function server() {
  const typen = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2' };
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(WURZEL) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': typen[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}
const ID = '[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß0-9_]*';
function norm(code) {
  const out = { zeilen: {}, ketten: [], inputs: new Set() };
  const L = code.split('\n');
  for (let i = 0; i < L.length; i++) {
    const z = L[i].replace(/\/\/.*/, '').trim();
    if (!z) continue;
    if (/^SCHRITTKETTE\b/i.test(z)) {
      const blk = [];
      for (; i < L.length; i++) { const y = L[i].replace(/\/\/.*/, '').trim(); if (y) blk.push(y); if (/^END\b/i.test(y)) break; }
      out.ketten.push(blk.join('\n')); continue;
    }
    if (/^INPUT\s+/.test(z)) { z.slice(6).split(/[\s,]+/).filter(Boolean).forEach(v => out.inputs.add(v)); continue; }
    const m = z.match(new RegExp('^(' + ID + ')\\s*:=\\s*(.+)$'));
    if (m) out.zeilen[m[1]] = m[2].replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/\bNOT\b/g, '¬').replace(/(\d+)\.0\b/g, '$1').replace(/\s+/g, ' ').trim();
    else out.zeilen['#' + z] = z;
  }
  // Speicher-Kurzform X := SR(a, b) / RS(a, b) → Qx-Zeile
  for (const [k, v] of Object.entries(out.zeilen)) {
    const m = v.match(/^(SR|RS)\((.+),(.+)\)$/);
    if (m) out.zeilen[k] = m[1] === 'SR' ? `((${m[2]}) || ${k}) && ¬(${m[3]})` : `(${m[2]}) || (${k} && ¬(${m[3]}))`;
  }
  // S/R-Paare → Q-Zeile
  for (const k of Object.keys(out.zeilen)) {
    const m = k.match(/^S(\d+)(_RS)?$/);
    if (!m) continue;
    const q = 'Q' + m[1] + (m[2] || ''), r = 'R' + m[1] + (m[2] || '');
    const S = out.zeilen[k], R = out.zeilen[r] || 'FALSE';
    out.zeilen[q] = m[2] ? `(${S}) || (${q} && ¬(${R}))` : `((${S}) || ${q}) && ¬(${R})`;
    delete out.zeilen[k]; delete out.zeilen[r];
  }
  // reine Aliase (X := Y) einsetzen bzw. Q-Namen auf den Merker umbenennen
  for (let runde = 0; runde < 3; runde++) for (const [k, v] of Object.entries(out.zeilen)) {
    if (!new RegExp('^' + ID + '$').test(v) || v === k) continue;
    const reV = new RegExp('\\b' + v + '\\b', 'g'), reK = new RegExp('\\b' + k + '\\b', 'g');
    if (/^Q\d+(_RS)?$/.test(v) && out.zeilen[v]) {
      // Merker := Qn → Qn heißt künftig wie der Merker
      out.zeilen[k] = out.zeilen[v].replace(reV, k); delete out.zeilen[v];
      for (const k2 of Object.keys(out.zeilen)) out.zeilen[k2] = out.zeilen[k2].replace(reV, k);
      continue;
    }
    let benutzt = false;
    for (const k2 of Object.keys(out.zeilen)) if (k2 !== k && reK.test(out.zeilen[k2])) { out.zeilen[k2] = out.zeilen[k2].replace(reK, v); benutzt = true; }
    if (benutzt) delete out.zeilen[k];
  }
  return out;
}
// Zwei Ausdrücke über alle Belegungen vergleichen (nur boolesche Logik)
function gleich(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const nurBool = x => !/[<>=+\-*\/,]|\b(?!NOT\b)[A-Z_]\w*\s*\(/.test(x);
  if (!nurBool(a) || !nurBool(b)) return a.replace(/\s/g, '') === b.replace(/\s/g, '');
  const vars = [...new Set((a + ' ' + b).match(new RegExp(ID, 'g')).filter(v => !/^(TRUE|FALSE)$/.test(v)))];
  if (vars.length > 14) return a.replace(/\s/g, '') === b.replace(/\s/g, '');
  const js = x => x.replace(/¬/g, '!').replace(new RegExp(ID, 'g'), v => v === 'TRUE' ? 'true' : v === 'FALSE' ? 'false' : 'w[' + JSON.stringify(v) + ']');
  const fa = new Function('w', 'return !!(' + js(a) + ')'), fb = new Function('w', 'return !!(' + js(b) + ')');
  for (let n = 0; n < (1 << vars.length); n++) {
    const w = {}; vars.forEach((v, i) => w[v] = !!(n >> i & 1));
    if (fa(w) !== fb(w)) return false;
  }
  return true;
}
function vergleiche(a, b) {
  const fehler = [];
  for (const k of new Set([...Object.keys(a.zeilen), ...Object.keys(b.zeilen)])) {
    if (!gleich(a.zeilen[k], b.zeilen[k])) fehler.push(`${k}: «${a.zeilen[k]}» → «${b.zeilen[k]}»`);
  }
  if (a.ketten.join('\n#\n') !== b.ketten.join('\n#\n')) fehler.push('Schrittkette verändert');
  const fehltIn = [...a.inputs].filter(v => !b.inputs.has(v) && !b.zeilen[v]);
  if (fehltIn.length) fehler.push('INPUT fehlt: ' + fehltIn.join(', '));
  return fehler;
}
(async () => {
  const srv = await server();
  const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1600,height:1000}});
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,200)));
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:' + srv.address().port + '/index.html'); await p.waitForTimeout(3500);
  const KORPUS = korpusAusIndex();
  const keys = (await p.evaluate(() => Object.keys(EXAMPLES))).concat(KORPUS.map((c, i) => '#' + i));
  await p.evaluate(() => { try{localStorage.setItem('cedSuppressOverwriteWarning','1')}catch(e){} toggleWorkspaceView('circuit-editor-wrapper'); });
  await p.waitForTimeout(800);
  let rot = 0;
  for (const k of keys) {
    const e0 = errs.length;
    const r = await p.evaluate(async ([k, code]) => {
      const warte = ms => new Promise(r => setTimeout(r, ms));
      if (code != null) { const ta = document.getElementById('code'); ta.value = code; ta.dispatchEvent(new Event('input', { bubbles: true })); await warte(400); }
      else { loadExample(k); await warte(400); }
      const c1 = document.getElementById('code').value;
      window.cedGenerateFromCode(); await warte(300);
      const c2 = window.cedGenerateCode(true);
      // zweite Runde: Code aus dem Plan wieder einlesen
      document.getElementById('code').value = c2;
      window.cedGenerateFromCode(); await warte(300);
      const c3 = window.cedGenerateCode(true);
      return { c1, c2, c3 };
    }, [k, k.startsWith('#') ? KORPUS[+k.slice(1)] : null]);
    if (!/:=/.test(r.c1)) { console.log('--  ' + k + ' (kein Code im Beispiel)'); continue; }
    const f = vergleiche(norm(r.c1), norm(r.c2));
    const f2 = vergleiche(norm(r.c2), norm(r.c3));
    const err = errs.slice(e0);
    const ok = !f.length && !f2.length && !err.length;
    if (!ok) rot++;
    console.log((ok ? 'OK  ' : 'ROT ') + k + (f.length ? '\n   ' + f.join('\n   ') : '') + (f2.length ? '\n   2. Runde: ' + f2.join('\n   ') : '') + (err.length ? '\n   Fehler: ' + err.join(' | ') : ''));
  }
  await b.close();
  srv.close();
  console.log(rot ? `${rot} Programm(e) verändert` : `Alle ${keys.length} Programme kommen unverändert zurück`);
  process.exit(rot ? 1 : 0);
})();
