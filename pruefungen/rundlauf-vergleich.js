// Vergleich zweier Programme per Wahrheitstabelle (aus schaltplan-editor-rundlauf.js)
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
// Argumente eines Aufrufs F(a, b, …) auf oberster Ebene trennen
function aufruf(x) {
  const m = x.trim().match(/^([A-Z_]+)\((.*)\)$/);
  if (!m) return null;
  const args = []; let tiefe = 0, akt = '';
  for (const ch of m[2]) {
    if (ch === '(') tiefe++;
    if (ch === ')') tiefe--;
    if (tiefe < 0) return null;
    if (ch === ',' && tiefe === 0) { args.push(akt.trim()); akt = ''; } else akt += ch;
  }
  if (tiefe) return null;
  args.push(akt.trim());
  return { f: m[1], args };
}
function gleich(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  // TON(A && B, 2) = TON(B && A, 2): Argumente einzeln vergleichen
  const fa0 = aufruf(a), fb0 = aufruf(b);
  if (fa0 && fb0 && fa0.f === fb0.f && fa0.args.length === fb0.args.length && fa0.args.every(x => !/^\d/.test(x) || true))
    return fa0.args.every((x, i) => gleich(x, fb0.args[i]));
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
module.exports = { norm, gleich, vergleiche };
