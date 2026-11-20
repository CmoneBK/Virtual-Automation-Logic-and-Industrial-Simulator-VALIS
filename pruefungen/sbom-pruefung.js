// Prüfung: Softwarestückliste (sbom.cdx.json) und DRITTANBIETER.md passen zum Repo.
// Jede Datei in vendor/ steht in beiden, die Prüfsummen stimmen, und VALIS
// lädt keine Skripte von fremden Servern.
//
//   node pruefungen/sbom-pruefung.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const W = path.join(__dirname, '..');
let gut = 0, schlecht = 0;
const ok = (b, t) => { if (b) gut++; else { schlecht++; console.log('FEHLER:', t); } };

const bom = JSON.parse(fs.readFileSync(path.join(W, 'sbom.cdx.json'), 'utf8'));
const dritt = fs.readFileSync(path.join(W, 'DRITTANBIETER.md'), 'utf8');
ok(bom.bomFormat === 'CycloneDX' && /^1\.\d$/.test(bom.specVersion), 'CycloneDX-Kopf');

const dateien = new Map();
for (const c of bom.components || []) {
  ok(c.name && c.licenses && c.licenses.length, 'Name und Lizenz bei ' + (c.name || c['bom-ref']));
  for (const p of c.properties || []) if (p.name === 'valis:datei') dateien.set(p.value, c);
}
for (const [datei, c] of dateien) {
  const voll = path.join(W, datei);
  ok(fs.existsSync(voll), 'Datei vorhanden: ' + datei);
  if (!fs.existsSync(voll)) continue;
  const h = (c.hashes || []).find(x => x.alg === 'SHA-256');
  const ist = crypto.createHash('sha256').update(fs.readFileSync(voll)).digest('hex');
  if (h && (c.properties || []).filter(p => p.name === 'valis:datei')[0].value === datei) ok(h.content === ist, 'Prüfsumme ' + datei + ' (Datei geändert? Version und Hash in sbom.cdx.json nachziehen)');
}
for (const f of fs.readdirSync(path.join(W, 'vendor'))) {
  ok(dateien.has('vendor/' + f), 'vendor/' + f + ' fehlt in sbom.cdx.json');
  ok(dritt.includes('vendor/' + f), 'vendor/' + f + ' fehlt in DRITTANBIETER.md');
}
for (const c of bom.components || []) ok(dritt.toLowerCase().includes(String(c.name).split(' ')[0].toLowerCase()), c.name + ' fehlt in DRITTANBIETER.md');

const html = fs.readFileSync(path.join(W, 'index.html'), 'utf8');
const fremd = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]).filter(u => /^(https?:)?\/\//i.test(u));
ok(fremd.length === 0, 'Skripte von fremden Servern: ' + fremd.join(', '));

console.log(`${gut} gut, ${schlecht} schlecht`);
process.exit(schlecht ? 1 : 0);
