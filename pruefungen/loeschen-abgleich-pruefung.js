const { chromium } = require('playwright');
// Prüfung: Löschen gleicht sich zwischen Fluidplan und 2D-Anlage ab (eine Wahrheit).
// Pneumatik und Hydraulik: Zylinder, Ventil, Aggregat im Plan oder in 2D gelöscht,
// „Alles löschen“ in 2D. Was in einer Ansicht fehlt, fehlt in der anderen und kommt
// beim nächsten Abgleich nicht still zurück.
//
//   node pruefungen/loeschen-abgleich-pruefung.js
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
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' ? '  (' + JSON.stringify(d) + ')' : ''}`); g ? gut++ : schlecht++; };

const FAELLE = {
  'Pneumatik: 2D-Zylinder gelöscht → Zylinder, Ventil, Drosseln auch im Plan weg': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'quelle' || t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 6) + 1 }); await warte(700); };
    deleteObjRecursive(factoryObjects.find(o => o.id === z.o.anlage)); await warte(800);
    R.push(['Plan: nur Quelle und Wartungseinheit', typen() === 'quelle,wartung', typen()]);
    R.push(['2D: keine Reste (Ventil, Drosseln)', zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/) === '', zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/)]);
    await nachAenderung();
    R.push(['kommt nach einer Planänderung nicht zurück', zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/) === '' && typen() === 'quelle,wartung', [typen(), zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/)]]);
  },
  'Pneumatik: Zylinder im Plan gelöscht → auch der übernommene 2D-Zylinder': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'quelle' || t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 6) + 1 }); await warte(700); };
    const id = z.o.anlage; F._entfernen(z.id); await warte(800);
    R.push(['2D-Zylinder weg', !factoryObjects.some(o => o.id === id), id]);
    R.push(['Ventil und Drosseln stehen weiter im Plan und frei in 2D', typen() === 'drv,drv,quelle,ventil,wartung' && zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/) === 'pneu_fp,pneu_fp,pneu_fp', [typen(), zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/)]]);
  },
  'Pneumatik: Ventil in 2D gelöscht → Ventil im Plan weg, Zylinder und Drosseln bleiben': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'quelle' || t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 6) + 1 }); await warte(700); };
    deleteObjRecursive(factoryObjects.find(o => o.type === 'valve_pneu')); await warte(800);
    R.push(['Plan: Zylinder und zwei Drosseln, kein Ventil', typen() === 'drv,drv,quelle,wartung,zyl_dw', typen()]);
    await nachAenderung();
    R.push(['2D: Zylinder, Drosseln frei, kein neues Ventil', zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/) === 'pneu_fp,pneu_fp,zylinder_double', zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/)]);
  },
  'Pneumatik: Ventil im Plan gelöscht → 2D-Ventil weg': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'quelle' || t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 6) + 1 }); await warte(700); };
    F._entfernen(v.id); await warte(800);
    R.push(['2D: kein Magnetventil mehr, Zylinder bleibt', !factoryObjects.some(o => o.type === 'valve_pneu') && factoryObjects.some(o => o.id === z.o.anlage), zwei(/^(zylinder|valve_pneu|throttle$|pneu_fp)/)]);
  },
  'Pneumatik: Alles löschen in 2D → Plan leer, nichts kommt zurück': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'quelle' || t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 6) + 1 }); await warte(700); };
    clearFactory(true); await warte(800);
    R.push(['Plan leer', F.plan().teile.length === 0, typen()]);
    await nachAenderung();
    R.push(['2D bleibt leer', factoryObjects.length === 0, factoryObjects.map(o => o.type)]);
  },
  'Hydraulik: 2D-Zylinder gelöscht → Zylinder, Ventil, Stromregelventile auch im Plan weg': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle', 'compressor', 'manifold', 'pneumatic_zone'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 60) + 1 }); await warte(700); };
    deleteObjRecursive(c); await warte(800);
    R.push(['Plan: nur Aggregat und Tank', typen() === 'aggregat,tank', typen()]);
    await nachAenderung();
    R.push(['kommt nach einer Planänderung nicht zurück', zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/) === '', zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/)]);
  },
  'Hydraulik: Zylinder im Plan gelöscht → 2D-Zylinder samt Ventil und Drosseln weg': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle', 'compressor', 'manifold', 'pneumatic_zone'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 60) + 1 }); await warte(700); };
    F._entfernen(z.id); await warte(800);
    R.push(['2D leer bis auf Aggregat', zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/) === '', zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/)]);
  },
  'Hydraulik: Ventil in 2D gelöscht → Ventil im Plan weg, Zylinder bleibt derselbe': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle', 'compressor', 'manifold', 'pneumatic_zone'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 60) + 1 }); await warte(700); };
    deleteObjRecursive(factoryObjects.find(o => o.type === 'valve_hyd')); await warte(800);
    await nachAenderung();
    R.push(['Plan: Zylinder und Stromregelventile, kein Ventil', typen() === 'aggregat,stromregel,stromregel,tank,zyl_dw', typen()]);
    R.push(['2D: derselbe Hydraulikzylinder, ohne Ventil und ohne verwaiste Drosseln', zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/) === 'zylinder_double' && factoryObjects.some(o => o.id === c.id && o.hasHydraulics), zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/)]);
    R.push(['Plan-Zylinder hängt weiter am 2D-Zylinder', F.plan().teile.find(t => t.typ === 'zyl_dw').o.anlage === c.id, '']);
  },
  'Hydraulik: Ventil im Plan gelöscht → 2D-Ventil weg, Ventil zurück bringt alles wieder': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle', 'compressor', 'manifold', 'pneumatic_zone'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 60) + 1 }); await warte(700); };
    const vv = JSON.parse(JSON.stringify(v)); F._entfernen(v.id); await warte(800);
    R.push(['2D: derselbe Zylinder ohne Ventil', zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/) === 'zylinder_double' && factoryObjects.some(o => o.id === c.id && o.hasHydraulics), zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/)]);
    R.push(['Plan behält die Stromregelventile', typen() === 'aggregat,stromregel,stromregel,tank,zyl_dw', typen()]);
    F._rueckgaengig();
    await warte(900);
    R.push(['Rückgängig: Ventil und Drosseln wieder in 2D', zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/) === 'throttle_hyd,throttle_hyd,valve_hyd,zylinder_double', zwei(/^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd)/)]);
  },
  'Hydraulik: Aggregat in 2D gelöscht → Aggregat und Tank im Plan weg': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle', 'compressor', 'manifold', 'pneumatic_zone'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 60) + 1 }); await warte(700); };
    deleteObjRecursive(factoryObjects.find(o => o.type === 'hydraulic_unit')); await warte(800);
    R.push(['Plan ohne Aggregat und Tank', !/aggregat|tank/.test(typen()), typen()]);
    await nachAenderung();
    R.push(['kein neues Aggregat in 2D', !factoryObjects.some(o => o.type === 'hydraulic_unit'), '']);
  },
  'Hydraulik: Alles löschen in 2D → Plan leer': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    factoryObjects.filter(o => o.hasPneumatics || ['valve_pneu', 'throttle', 'compressor', 'manifold', 'pneumatic_zone'].includes(o.type)).forEach(o => deleteObjRecursive(o));
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 300; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 60) + 1 }); await warte(700); };
    clearFactory(true); await warte(800);
    R.push(['Plan leer', F.plan().teile.length === 0, typen()]);
  },
  'Neuer Plan (Import) hält gleich benannte 2D-Teile nicht für gelöscht': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    F.ausAnlage(); await warte(600);
    const z = F.plan().teile.find(t => t.typ === 'zyl_dw'), v = F.plan().teile.find(t => t.typ === 'ventil');
    const nachAenderung = async () => { const q = F.plan().teile.find(t => t.typ === 'quelle' || t.typ === 'aggregat' || t.typ === 'tank'); if (q) F.aendern(q.id, { p: (q.o.p || 6) + 1 }); await warte(700); };
    const roh = JSON.parse(JSON.stringify(F.plan()));
    F.importieren(roh); await warte(800);
    R.push(['2D-Zylinder bleibt nach dem Import', factoryObjects.some(o => o.id === z.o.anlage), '']);
    R.push(['Plan bleibt vollständig', typen() === 'drv,drv,quelle,ventil,wartung,zyl_dw', typen()]);
  },
  'Strg+Z: ein gemeinsamer Schritt für 2D-Anlage und Plan (Hydraulik und Pneumatik)': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    const RE = /^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd|valve_pneu|throttle$|pneu_fp)/;
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 700; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    saveFactoryState();
    F.ausAnlage(); await warte(900);
    const p0 = typen(), d0 = zwei(RE);
    R.push(['Ausgangslage: Pneumatik und Hydraulik im Plan', /zyl_dw.*zyl_dw/.test(p0) && /stromregel/.test(p0), p0]);
    // 1) In 2D löschen (wie die Entf-Taste: löschen, dann speichern)
    const th = factoryObjects.find(o => o.type === 'throttle_hyd' && o.targetCylinderId === c.id && o.role === 'ext');
    deleteObjRecursive(th); saveFactoryState(); await warte(900);
    const p1 = typen();
    R.push(['2D-Drossel gelöscht → Stromregelventil im Plan weg', (p1.match(/stromregel/g) || []).length === (p0.match(/stromregel/g) || []).length - 1, p1]);
    window._undoFactory(); await warte(1200);
    R.push(['Strg+Z in der 2D-Anlage: 2D und Plan wieder wie vorher', typen() === p0 && zwei(RE) === d0, [typen(), zwei(RE)]]);
    // 2) Im Plan löschen, Strg+Z im Plan
    const zp = F.plan().teile.find(t => t.typ === 'zyl_dw' && t.o.hyd);
    const id2 = zp.o.anlage;
    F._entfernen(zp.id); await warte(900);
    R.push(['Planzylinder gelöscht → 2D-Hydraulikzylinder weg', !factoryObjects.some(o => o.id === id2), id2]);
    F._rueckgaengig(); await warte(1200);
    R.push(['Strg+Z im Plan: Plan und 2D wieder wie vorher', typen() === p0 && zwei(RE) === d0, [typen(), zwei(RE)]]);
    // 3) Danach wirkt der Abgleich weiter in beide Richtungen
    const c2 = factoryObjects.find(o => o.id === F.plan().teile.find(t => t.typ === 'zyl_dw' && t.o.hyd).o.anlage);
    c2.pistonD = 63; await warte(900);
    R.push(['nach Rückgängig: 2D-Änderung kommt im Plan an', F.plan().teile.find(t => t.typ === 'zyl_dw' && t.o.hyd).o.d === 63, F.plan().teile.find(t => t.typ === 'zyl_dw' && t.o.hyd).o.d]);
  },
  'Versorgung: Quelle/Kompressor, Wartung/Verteiler, Aggregat, Tank in beide Richtungen': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const hat = typ => factoryObjects.some(o => o.type === typ);
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 700; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    saveFactoryState();
    F.ausAnlage(); await warte(900);
    const T = typ => F.plan().teile.find(t => t.typ === typ);
    R.push(['Ausgangslage: Quelle, Wartung, Aggregat, Tank', !!(T('quelle') && T('wartung') && T('aggregat') && T('tank')) && hat('compressor') && hat('manifold') && hat('hydraulic_unit') && hat('oil_tank'), typen()]);
    // Plan → 2D
    F._entfernen(T('wartung').id); await warte(700);
    R.push(['Plan: Wartungseinheit gelöscht → 2D-Verteiler weg', !hat('manifold'), factoryObjects.map(o => o.type).filter(t => /manifold|compressor/.test(t))]);
    F._entfernen(T('tank').id); await warte(700);
    R.push(['Plan: Tank gelöscht → 2D-Öltank weg', !hat('oil_tank'), hat('oil_tank')]);
    F._rueckgaengig(); await warte(1000); F._rueckgaengig(); await warte(1200);
    R.push(['Strg+Z zweimal: Verteiler, Öltank, Wartung und Tank wieder da', hat('manifold') && hat('oil_tank') && !!T('wartung') && !!T('tank'), typen()]);
    // 2D → Plan
    deleteObjRecursive(factoryObjects.find(o => o.type === 'compressor')); saveFactoryState(); await warte(900);
    R.push(['2D: Kompressor gelöscht → Quelle im Plan weg', !T('quelle'), typen()]);
    deleteObjRecursive(factoryObjects.find(o => o.type === 'oil_tank')); saveFactoryState(); await warte(900);
    R.push(['2D: Öltank gelöscht → Tank im Plan weg', !T('tank'), typen()]);
    F._entfernen(T('aggregat').id); await warte(800);
    R.push(['Plan: Aggregat gelöscht → 2D-Hydraulikaggregat und -verteiler weg', !hat('hydraulic_unit') && !hat('hydraulic_manifold'), [hat('hydraulic_unit'), hat('hydraulic_manifold')]]);
    const nachher = typen(); await warte(1200);
    R.push(['nichts kommt von selbst zurück', typen() === nachher && !hat('compressor') && !hat('oil_tank'), typen()]);
  },
  'Verbinden von Anfang an: leerer Plan, Teile entstehen danach in 2D': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const zyl2D = () => factoryObjects.filter(o => /^zylinder_/.test(o.type)).length;
    const vorher = zyl2D();
    const c = window.confirm; window.confirm = () => false;
    try { F._anlageKnopf(); } finally { window.confirm = c; }
    await warte(500);
    R.push(['leerer Plan ist verbunden', !!F.plan().anlage, F.plan().anlage]);
    const q = F.setzen('quelle', 100, 400);
    const v = F.setzen('ventil', 260, 120, { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'Y9' }, '1V1');
    const z = F.setzen('zyl_dw', 260, -60, {}, '1A1');
    F.verbinden(q, '1', v, '1'); F.verbinden(v, '4', z, 'K'); F.verbinden(v, '2', z, 'S');
    await warte(1200);
    const zt = F.plan().teile.find(t => t.id === z);
    const o = zt && factoryObjects.find(q => q.id === zt.o.anlage);
    R.push(['neuer Zylinder steht sofort in 2D', !!o && zyl2D() === vorher + 1, [vorher, zyl2D()]]);
    R.push(['2D-Zylinder hängt am Ventil (Y9)', !!o && (o.linkedVarExt === 'Y9' || factoryObjects.some(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id)), o && [o.linkedVarExt, o.hasPneumatics]]);
  },
  'Verbinden von Anfang an: 2D hat Zylinder → Angebot übernehmen': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const c = window.confirm; window.confirm = () => true;
    try { F._anlageKnopf(); } finally { window.confirm = c; }
    await warte(800);
    R.push(['übernommen und verbunden', !!F.plan().anlage && F.plan().teile.some(t => t.typ === 'zyl_dw' || t.typ === 'zyl_ew'), F.plan().teile.map(t => t.typ).join(',')]);
  },
  'Löschen während der Simulation: beide Richtungen, nichts kommt beim Stopp zurück': async (R) => {
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const F = Fluidplan; window._findHydTankForCylinder = () => null;
    const typen = () => F.plan().teile.map(t => t.typ).sort().join(',');
    const zwei = re => factoryObjects.filter(o => re.test(o.type)).map(o => o.type).sort().join(',');
    const RE = /^(zylinder|valve_hyd|throttle_hyd|check_valve_hyd|valve_pneu|throttle$|pneu_fp)/;
    const c = createFactoryObject('zylinder_double', ''); c.x = 300; c.y = 700; c.linkedVarExt = 'Y1'; c.linkedVarRet = 'Y2';
    const sd = window.showValisChoiceDialog; window.showValisChoiceDialog = (a, b, x, cb) => cb('double');
    try { generateHydraulicSetup(c); } finally { window.showValisChoiceDialog = sd; }
    saveFactoryState();
    F.ausAnlage(); await warte(900);
    toggleSimulation(); await warte(600);
    // 2D-Hydraulikventil löschen
    const v = factoryObjects.find(o => o.type === 'valve_hyd' && o.targetCylinderId === c.id);
    deleteObjRecursive(v); saveFactoryState(); await warte(900);
    R.push(['Sim läuft: 2D-Hydraulikventil gelöscht → Ventil im Plan weg', F.plan().teile.filter(t => t.typ === 'ventil').length === 1, typen()]);
    // Pneumatikzylinder im Plan löschen
    const zp = F.plan().teile.find(t => t.typ === 'zyl_dw' && !t.o.hyd), id = zp.o.anlage;
    F._entfernen(zp.id); await warte(900);
    R.push(['Sim läuft: Planzylinder gelöscht → 2D-Zylinder weg', !factoryObjects.some(o => o.id === id), id]);
    const p1 = typen(), d1 = zwei(RE);
    toggleSimulation(); await warte(1200);
    R.push(['nach dem Stopp: Plan und 2D unverändert', typen() === p1 && zwei(RE) === d1, [p1, typen(), d1, zwei(RE)]]);
  }
};


(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html?fluidplan=1';
  for (const [name, fn] of Object.entries(FAELLE)) {
    console.log(name);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e).slice(0, 200)));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => { try { localStorage.setItem('valisTourSeen', '1'); } catch (e) {} });
    await page.goto(url); await page.waitForTimeout(3000);
    let R;
    try {
      R = await page.evaluate(async (src) => {
        try { closeHub(); } catch (e) {}
        const ta = document.getElementById('code'); ta.value = 'Y1 := S1\nY2 := S2'; ta.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        try { Fluidplan._sichtbar(); } catch (e) {}
        const R = []; try { await (eval('(' + src + ')'))(R); } catch (e) { R.push(['Lauf ohne Abbruch', false, String(e.stack || e).slice(0, 400)]); } return R;
      }, fn.toString());
    } catch (e) { R = [['Lauf ohne Abbruch', false, String(e).slice(0, 300)]]; }
    for (const [n, g, d] of R) ok(n, g, d);
    ok('Keine Skriptfehler', !fehler.length, fehler.slice(0, 2).join(' | '));
    await page.close();
  }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
