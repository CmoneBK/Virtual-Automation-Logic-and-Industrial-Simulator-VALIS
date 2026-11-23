/*
 * logo.js – Das VALIS-Programm als LOGO!-Programm (Maßstab LOGO! 8)
 * ---------------------------------------------------------------------
 * Bildet den fertigen Logik-Graphen (currentGraph) auf LOGO!-Klemmen und
 * nummerierte Bausteine B001, B002 … ab: Eingänge I1 …, Ausgänge Q1 …,
 * Merker M1 …, Analog AI1 … / AQ1 … / AM1 …. Grundfunktionen AND, OR,
 * NOT, Sonderfunktionen mit den Namen, unter denen man sie in LOGO!Soft
 * Comfort findet. Dazu eine Prüfung, ob das Programm auf eine LOGO! 8
 * passt, und eine kleine Simulation der abgebildeten Schaltung, mit der
 * pruefungen/logo-pruefung.js nachweist, dass sie dasselbe tut wie das
 * VALIS-Programm.
 *
 * Abbildung der VALIS-Bausteine (geprüft gegen die Beschreibung der
 * LOGO!-Sonderfunktionen, in eigenen Worten):
 *   TON  → Einschaltverzögerung (Trg, T)
 *   TOF  → Ausschaltverzögerung (Trg, T)
 *   TP   → Flankengetriggertes Wischrelais (Trg, TH = T, TL = 0, N = 1).
 *          Das einfache „Wischrelais (Impulsausgabe)“ der LOGO! bricht den
 *          Impuls ab, sobald Trg vor Ablauf auf 0 geht; TP hält ihn. Ein
 *          neuer Impuls an Trg während der Zeit startet sie auf der LOGO!
 *          neu (Fußnote).
 *   CTU  → Vor-/Rückwärtszähler (R, Cnt, Dir = lo, Ein = Aus = PV)
 *   SR   → Selbsthalterelais (Rücksetzen dominant, wie die LOGO!)
 *   RS   → Selbsthalterelais mit R UND NICHT S davor, weil die LOGO! kein
 *          setzdominantes Speicherglied hat (Fußnote).
 *   A > 5, A >= B …   → Analoger Schwellwertschalter bzw. Analogkomparator
 *   A + B, A * 2 …    → Arithmetikanweisung (bis 4 Werte)
 *   PID               → PI-Regler (ohne D-Anteil)
 *   ZWEIPUNKT         → Analoger Schwellwertschalter
 * Was es auf der LOGO! nicht gibt (Schrittketten, ZUSTAND, min/max, …),
 * meldet die Passt-Prüfung mit Zeile im Code.
 *
 * API (window.Logo):
 *   abbilden(graph, opt)  Modell { klemmen, bausteine, schritte, passt, fussnoten }
 *   aktuell()             Modell des Programms im Editor
 *   zeit(sek)             { text: '03:00 s', basis, wert, genau, ausserhalb }
 *   neuerZustand(), zyklus(modell, zustand, eingaenge, dtMs)  Simulation
 *   zeilen(modell)        Bausteinliste als Textzeilen
 *   festeKlemmen() / klemmeSetzen(var, klemme)  Klemmen der Lehrkraft
 *   exportieren() / importieren(daten)          für den Anlagenzustand
 */
(function () {
  'use strict';
  if (window.Logo) return;

  // ---------- LOGO! 8: Grenzen ----------
  // Grundgerät 12/24 RCE: 8 Eingänge (I1, I2, I7, I8 auch analog), 4 Ausgänge,
  // keine Analogausgänge. Mit Erweiterungsmodulen höchstens 24 I, 20 Q,
  // 8 AI, 8 AQ. 64 Merker (M8 Anlaufmerker, M25 … M31 Hintergrundlicht und
  // Zeichensatz sind belegt), 64 Analogmerker, 400 Bausteine.
  const GRENZE = { I: 24, Q: 20, AI: 8, AQ: 8, M: 64, AM: 64, B: 400 };
  const GRUND = { I: 8, Q: 4, AI: 4, AQ: 0 };
  const M_BELEGT = new Set([8, 25, 26, 27, 28, 29, 30, 31]);
  // Analogeingänge des Grundgeräts liegen auf Digitalklemmen
  const AI_AUF = { 1: 'I7', 2: 'I8', 3: 'I1', 4: 'I2' };
  const NAME = {
    AND: 'AND', OR: 'OR', NOT: 'NOT',
    TON: 'Einschaltverzögerung', TOF: 'Ausschaltverzögerung', TP: 'Flankengetriggertes Wischrelais',
    CTU: 'Vor-/Rückwärtszähler', SHR: 'Selbsthalterelais',
    ASW: 'Analoger Schwellwertschalter', AKOMP: 'Analogkomparator',
    ARITH: 'Arithmetikanweisung', PI: 'PI-Regler'
  };
  const SF = new Set(['TON', 'TOF', 'TP', 'CTU', 'SHR', 'ASW', 'AKOMP', 'ARITH', 'PI']);
  const ID = /^[A-Za-zÄÖÜäöüß_][A-Za-z0-9_ÄÖÜäöüß]*$/;
  const ZAHL = /^-?\d+(?:[.,]\d+)?$/;
  const LS = 'valisLogoKlemmen';

  let feste = {};
  try { feste = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (_) { feste = {}; }
  function festeSpeichern() { try { localStorage.setItem(LS, JSON.stringify(feste)); } catch (_) {} }

  const zwei = (n) => (n < 10 ? '0' : '') + n;
  const komma = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');

  // ---------- Zeiten im LOGO!-Format ----------
  // Zeitbasis s: Sekunden:Hundertstel (bis 99:99 s), m: Minuten:Sekunden
  // (bis 99:59 m), h: Stunden:Minuten (bis 99:59 h).
  function zeit(sek) {
    sek = Math.max(0, Number(sek) || 0);
    let text, basis, wert;
    if (sek <= 99.99 + 1e-9) {
      const h = Math.round(sek * 100);
      text = zwei(Math.floor(h / 100)) + ':' + zwei(h % 100) + ' s'; basis = 's'; wert = h / 100;
    } else if (sek < 99 * 60 + 59.5) {
      const s = Math.round(sek);
      text = zwei(Math.floor(s / 60)) + ':' + zwei(s % 60) + ' m'; basis = 'm'; wert = s;
    } else {
      const min = Math.min(99 * 60 + 59, Math.round(sek / 60));
      text = zwei(Math.floor(min / 60)) + ':' + zwei(min % 60) + ' h'; basis = 'h'; wert = min * 60;
    }
    return { text, basis, wert, genau: Math.abs(wert - sek) < 1e-6, ausserhalb: sek > (99 * 60 + 59) * 60 + 1e-6 };
  }

  // ---------- Klemmen ----------
  function klemmeArt(k) { const m = String(k || '').match(/^(I|Q|M|AI|AQ|AM)(\d+)$/); return m ? { art: m[1], nr: +m[2] } : null; }
  // Vorschlag: Reihenfolge der Zuordnungsliste; Feste Klemmen der Lehrkraft gehen vor.
  function klemmenVergeben(liste, festeKl) {
    // liste: [{ name, art: 'I'|'Q'|'M'|'AI'|'AQ'|'AM' }]
    const belegt = new Set(), aus = {}, konflikt = [];
    liste.forEach(v => {
      const f = festeKl[v.name], fa = klemmeArt(f);
      if (!f) return;
      if (!fa || fa.art !== v.art) { konflikt.push({ name: v.name, klemme: f, grund: 'art' }); return; }
      if (belegt.has(f)) { konflikt.push({ name: v.name, klemme: f, grund: 'doppelt' }); return; }
      if (fa.art === 'M' && M_BELEGT.has(fa.nr)) { konflikt.push({ name: v.name, klemme: f, grund: 'reserviert' }); return; }
      belegt.add(f); aus[v.name] = f; v.fest = true;
    });
    // Analogeingänge des Grundgeräts sperren ihre Digitalklemme und umgekehrt
    const aiFrei = (nr) => !belegt.has('AI' + nr) && !(AI_AUF[nr] && belegt.has(AI_AUF[nr]));
    liste.filter(v => v.art === 'AI' && !aus[v.name]).forEach(v => {
      for (let nr = 1; nr <= 99; nr++) if (aiFrei(nr)) { aus[v.name] = 'AI' + nr; belegt.add('AI' + nr); if (AI_AUF[nr]) belegt.add(AI_AUF[nr]); break; }
    });
    const iFrei = (nr) => !belegt.has('I' + nr) && !Object.keys(AI_AUF).some(a => AI_AUF[a] === 'I' + nr && belegt.has('AI' + a));
    liste.filter(v => !aus[v.name]).forEach(v => {
      for (let nr = 1; nr <= 999; nr++) {
        if (v.art === 'I' && !iFrei(nr)) continue;
        if (v.art === 'M' && M_BELEGT.has(nr)) continue;
        const k = v.art + nr;
        if (belegt.has(k)) continue;
        aus[v.name] = k; belegt.add(k); break;
      }
    });
    return { klemmen: aus, konflikt };
  }

  // ---------- Graph → Bausteine ----------
  function zerlegeVergleich(expr) {
    let tiefe = 0;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '(') tiefe++;
      else if (c === ')') tiefe--;
      else if (tiefe === 0) {
        const zwei_ = expr.substr(i, 2);
        let op = null;
        if (['>=', '<=', '==', '!=', '<>'].includes(zwei_)) op = zwei_;
        else if (c === '>' || c === '<') op = c;
        if (op) return { a: expr.slice(0, i).trim(), op: op === '<>' ? '!=' : op, b: expr.slice(i + op.length).trim() };
      }
    }
    return null;
  }
  const ohneKlammern = (s) => { s = String(s).trim(); while (/^\(.*\)$/.test(s) && klammerPaar(s)) s = s.slice(1, -1).trim(); return s; };
  function klammerPaar(s) { let t = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '(') t++; else if (s[i] === ')') { t--; if (t === 0 && i < s.length - 1) return false; } } return true; }
  const zahl = (s) => parseFloat(String(s).replace(',', '.'));

  function abbilden(graph, opt) {
    opt = opt || {};
    if (graph && typeof window._circuitCleanGraph === 'function') graph = window._circuitCleanGraph(graph);
    else if (graph && typeof _circuitCleanGraph === 'function') graph = _circuitCleanGraph(graph); // eslint-disable-line no-undef
    const modell = { klemmen: {}, rollen: {}, bausteine: [], schritte: [], verbindungen: [], fussnoten: [], gruende: [], konflikt: [], nichtVergleichbar: [] };
    if (!graph || !graph.nodes || !graph.nodes.size) { modell.passt = passtPruefen(modell); return modell; }
    const typen = opt.typen || (typeof componentTypes !== 'undefined' ? componentTypes : {}); // eslint-disable-line no-undef
    const text = graph._sourceText || opt.text || '';
    const zeilenText = text.split('\n');
    const nodes = graph.nodes;
    const inEdges = new Map();
    graph.edges.forEach(e => { if (!inEdges.has(e.targetId)) inEdges.set(e.targetId, []); inEdges.get(e.targetId).push(e); });
    const quellen = new Set(graph.edges.map(e => e.sourceId));
    const genQ = opt.generatedQ || window._generatedQ || new Set();
    const einRoh = (opt.eingaenge || (typeof globalInputs !== 'undefined' ? globalInputs : [])).filter(n => !/^(TRUE|FALSE)$/.test(n)); // eslint-disable-line no-undef
    const ausRoh = (opt.ausgaenge || (typeof globalOutputs !== 'undefined' ? globalOutputs : [])) // eslint-disable-line no-undef
      .filter(n => !/^[QRS]\d+(_(?:RS|SR))?$/i.test(n) && !genQ.has(n));
    // ARITH-Knoten: numerisch (Rechnung, PID) oder boolesch (Vergleich, ZWEIPUNKT)
    const arithBool = (n) => n.regler === 'ZWEIPUNKT' || (!n.regler && !!zerlegeVergleich(String(n.label || '').replace(/^\s*[^=]+?=\s*/, '')));
    // Analoge Eingänge: Bauteiltyp oder Eingang einer Rechnung/eines Vergleichs
    const anaEin = new Set();
    einRoh.forEach(n => { if (typen[n] === 'analog_in') anaEin.add(n); });
    nodes.forEach(n => { if (n.type === 'ARITH') (inEdges.get(n.id) || []).forEach(e => { if (einRoh.includes(e.sourceId)) anaEin.add(e.sourceId); }); });
    const numerisch = (name) => { const n = nodes.get(name); return (n && n.type === 'ARITH' && !arithBool(n)) || typen[name] === 'analog_out'; };
    const physAus = ausRoh.filter(n => !quellen.has(n) || typen[n] === 'analog_out');
    const merker = ausRoh.filter(n => !physAus.includes(n));
    const liste = [];
    einRoh.forEach(n => liste.push({ name: n, art: anaEin.has(n) ? 'AI' : 'I', rolle: 'ein' }));
    physAus.forEach(n => liste.push({ name: n, art: numerisch(n) ? 'AQ' : 'Q', rolle: 'aus' }));
    merker.forEach(n => liste.push({ name: n, art: numerisch(n) ? 'AM' : 'M', rolle: 'mem' }));
    const fk = opt.festeKlemmen || feste;
    const vg = klemmenVergeben(liste, fk);
    modell.klemmen = vg.klemmen;
    modell.konflikt = vg.konflikt;
    liste.forEach(v => { modell.rollen[v.name] = { rolle: v.rolle, art: v.art, fest: !!v.fest }; });

    const zeileVon = (id) => {
      const n = nodes.get(id);
      if (n && n.sourceLine != null) return n.sourceLine;
      const re = new RegExp('^\\s*' + String(id).replace(/[^A-Za-z0-9_ÄÖÜäöüß]/g, '') + '\\s*(:=|=(?!=)|<-)', 'i');
      for (let i = 0; i < zeilenText.length; i++) if (re.test(zeilenText[i])) return i;
      return null;
    };
    const grund = (text, zeile, art) => { if (!modell.gruende.some(g => g.text === text && g.zeile === zeile)) modell.gruende.push({ text, zeile: zeile == null ? null : zeile, art: art || 'nicht' }); };
    const fussnote = (text) => { if (!modell.fussnoten.includes(text)) modell.fussnoten.push(text); };

    const memo = new Map();
    function neuerBaustein(typ, src, zeile) {
      return { nr: 0, typ, name: NAME[typ] || typ, ein: [], par: [], ziele: [], src: src || null, zeile: zeile == null ? null : zeile, hinweise: [] };
    }
    function ablegen(b) {
      modell.bausteine.push(b);
      b.nr = modell.bausteine.length;
      b.kurz = 'B' + String(b.nr).padStart(3, '0');
      modell.schritte.push({ art: 'b', b });
      return { art: 'b', b };
    }
    const konst = (wahr) => ({ art: 'c', k: wahr ? 'hi' : 'lo' });
    function varRef(name) {
      if (name === 'TRUE') return konst(true);
      if (name === 'FALSE') return konst(false);
      const k = modell.klemmen[name];
      if (k) return { art: 'k', k, name };
      // Variable ohne Klemme (z. B. ein Eingang, der nicht in der Liste steht)
      let nr = 1; const belegt = new Set(Object.values(modell.klemmen));
      while (belegt.has('I' + nr)) nr++;
      modell.klemmen[name] = 'I' + nr; modell.rollen[name] = { rolle: 'ein', art: 'I', fest: false };
      return { art: 'k', k: 'I' + nr, name };
    }
    // Quelle eines Eingangs; neg = negiert. Sonderfunktionen haben keine
    // negierbaren Eingänge: davor kommt ein NOT.
    function quelle(id) {
      const n = nodes.get(id);
      if (!n || n.type === 'PURE_INPUT' || n.type === 'INPUT' || n.type === 'OUTPUT' || n.type === 'ARITH') return varRef(id);
      return baustein(id);
    }
    function nicht(ref, src, zeile) {
      const b = neuerBaustein('NOT', src, zeile);
      b.ein.push({ pin: '', ref, neg: false });
      return ablegen(b);
    }
    function sfEingang(b, pin, edge) {
      if (!edge) return;
      let ref = quelle(edge.sourceId);
      if (edge.inverted) ref = nicht(ref, b.src, b.zeile);
      b.ein.push({ pin, ref, neg: false });
    }
    function gatter(typ, eingaenge, src, zeile) {
      // höchstens vier Eingänge je Grundfunktion: größere Kästen aufteilen
      let rest = eingaenge.slice();
      while (rest.length > 4) {
        const teil = neuerBaustein(typ, src, zeile);
        teil.ein = rest.slice(0, 4);
        const r = ablegen(teil);
        rest = [{ pin: '', ref: r, neg: false }].concat(rest.slice(4));
      }
      const b = neuerBaustein(typ, src, zeile);
      b.ein = rest;
      return b;
    }
    function baustein(id) {
      if (memo.has(id)) return memo.get(id);
      const n = nodes.get(id);
      const ie = (inEdges.get(id) || []).slice();
      const zeile = zeileVon(id);
      const pin = (p) => ie.find(e => e.targetPin === p);
      // Platzhalter gegen Rückführungen (S1 := A OR Q1): der Baustein ist
      // schon „da“, seine Nummer bekommt er beim Ablegen.
      let b;
      if (n.type === 'GATE') {
        const typ = n.label === '&' ? 'AND' : 'OR';
        const platz = { art: 'b', b: null };
        memo.set(id, platz);
        const ein = ie.map(e => ({ pin: '', ref: quelle(e.sourceId), neg: !!e.inverted }));
        b = gatter(typ, ein, id, zeile);
        const r = ablegen(b); platz.b = r.b; return platz;
      }
      if (n.type === 'TON' || n.type === 'TOF' || n.type === 'TP') {
        b = neuerBaustein(n.type, id, zeile);
        const platz = { art: 'b', b };
        memo.set(id, platz);
        sfEingang(b, 'Trg', pin('IN') || ie[0]);
        const sek = zahl((String(n.label).match(/\(([\d.]+)\s*s\)/) || [0, 0])[1]);
        const z = zeit(sek);
        b.sek = z.wert;
        if (n.type === 'TP') {
          b.par.push({ n: 'TH', w: z.text }, { n: 'TL', w: '00:00 s' }, { n: 'N', w: '1' });
          fussnote('TP → Flankengetriggertes Wischrelais: Der Impuls läuft wie bei TP auch dann weiter, wenn Trg vorher auf 0 geht. Anders als bei TP startet ein neuer Impuls an Trg während der Zeit sie auf der LOGO! neu.');
        } else b.par.push({ n: 'T', w: z.text });
        if (!z.genau) grund('Zeit ' + komma(sek) + ' s passt nicht genau in die Zeitbasis der LOGO! (' + z.text + ').', zeile, 'hinweis');
        if (z.ausserhalb) grund('Zeit ' + komma(sek) + ' s ist länger als 99:59 h.', zeile, 'nicht');
        ablegen(b); return platz;
      }
      if (n.type === 'CTU' || n.type === 'CTD') {
        b = neuerBaustein('CTU', id, zeile);
        const platz = { art: 'b', b };
        memo.set(id, platz);
        sfEingang(b, 'R', pin('R'));
        sfEingang(b, 'Cnt', pin('CU') || pin('CD'));
        b.ein.push({ pin: 'Dir', ref: konst(n.type === 'CTD'), neg: false });
        const pv = parseInt((String(n.label).match(/\((\d+)\)/) || [0, 0])[1], 10) || 0;
        b.pv = pv;
        b.par.push({ n: 'Ein', w: String(pv) }, { n: 'Aus', w: String(pv) });
        if (n.type === 'CTD') grund('Rückwärtszähler (CTD) bitte von Hand prüfen.', zeile, 'hinweis');
        if (pv === 0) grund('Zähler mit Vorwahl 0: die LOGO! schaltet Q schon vor dem ersten Impuls.', zeile, 'hinweis');
        ablegen(b); return platz;
      }
      if (n.type === 'SR' || n.type === 'RS') {
        b = neuerBaustein('SHR', id, zeile);
        const platz = { art: 'b', b };
        memo.set(id, platz);
        const s = pin('S'), r = pin('R');
        if (n.type === 'SR' || !s || !r) {
          sfEingang(b, 'S', s);
          sfEingang(b, 'R', r);
        } else {
          // setzdominant: R' = R UND NICHT S, dann gewinnt S wie im VALIS-Programm
          sfEingang(b, 'S', s);
          const und = neuerBaustein('AND', id, zeile);
          und.ein.push({ pin: '', ref: quelle(r.sourceId), neg: !!r.inverted });
          und.ein.push({ pin: '', ref: quelle(s.sourceId), neg: !s.inverted });
          und.hinweise.push('vor R: Setzen dominant');
          const ru = ablegen(und);
          b.ein.push({ pin: 'R', ref: ru, neg: false });
          b.umbau = true;
          fussnote('Setzdominanter Speicher (RS): Die LOGO! hat nur das Selbsthalterelais, bei dem Rücksetzen gewinnt. Davor steht deshalb R UND NICHT S. Sind beide 1, bleibt der Ausgang gesetzt wie im VALIS-Programm.');
        }
        ablegen(b); return platz;
      }
      // unbekannt: wie eine Variable behandeln
      return varRef(id);
    }
    // Rechnen und Vergleichen (ARITH-Knoten)
    function rechnung(id) {
      if (memo.has(id)) return memo.get(id);
      const n = nodes.get(id);
      const zeile = zeileVon(id);
      const ausdruck = String(n.label || '').replace(/^\s*[^=]+?=\s*/, '').trim();
      const wert = (s) => {
        s = ohneKlammern(s);
        if (ZAHL.test(s)) return { zahl: zahl(s) };
        if (ID.test(s) && !/^(TRUE|FALSE)$/i.test(s)) return { ref: varRef(s), name: s };
        if (/^TRUE$/i.test(s)) return { zahl: 1 };
        if (/^FALSE$/i.test(s)) return { zahl: 0 };
        return null;
      };
      const kein = (txt) => { grund(txt, zeile, 'nicht'); modell.nichtVergleichbar.push(id); const r = konst(false); memo.set(id, r); return r; };
      if (n.regler === 'ZUSTAND') return kein('Zustandsregler (ZUSTAND) gibt es auf der LOGO! nicht.');
      if (n.regler) {
        const args = ((ausdruck.match(/\((.*)\)\s*$/) || [0, ''])[1]).split(',').map(a => a.trim());
        if (n.regler === 'ZWEIPUNKT') {
          // ZWEIPUNKT(X, EIN, AUS) bzw. (X, W, HYST, HEIZEN|KUEHLEN)
          const x = wert(args[0]);
          let ein, aus;
          const richt = /^(KUEHLEN|KÜHLEN|INVERS)$/i.test(args[3] || '') ? -1 : (args[3] ? 1 : 0);
          const a1 = wert(args[1]), a2 = wert(args[2]);
          if (!x || !x.ref || !a1 || a1.zahl == null || !a2 || a2.zahl == null) return kein('ZWEIPUNKT mit Variablen als Schaltpunkt: auf der LOGO! nur mit festen Werten.');
          if (richt === 0) { ein = a1.zahl; aus = a2.zahl; } else { const h = Math.abs(a2.zahl) / 2; ein = richt > 0 ? a1.zahl - h : a1.zahl + h; aus = richt > 0 ? a1.zahl + h : a1.zahl - h; }
          const b = neuerBaustein('ASW', id, zeile);
          b.ein.push({ pin: 'Ax', ref: x.ref, neg: false });
          // LOGO!: Q = 1 bei Ax > Ein, Q = 0 bei Ax ≤ Aus; ganzzahlig heißt x < a ⇔ x ≤ a − 1
          const unter = (a) => Math.ceil(a) - 1;
          if (ein <= aus) {
            // ein unten (Heizen): Schwellwert schaltet oben ein, NOT dreht um
            b.par.push({ n: 'Ein', w: komma(aus) }, { n: 'Aus', w: komma(unter(ein)) });
            b.ein_ = aus; b.aus_ = unter(ein);
            const r = ablegen(b);
            const nb = nicht(r, id, zeile);
            memo.set(id, nb); return nb;
          }
          b.par.push({ n: 'Ein', w: komma(ein) }, { n: 'Aus', w: komma(unter(aus)) });
          b.ein_ = ein; b.aus_ = unter(aus);
          const r = ablegen(b); memo.set(id, r); return r;
        }
        if (n.regler === 'PID') {
          const b = neuerBaustein('PI', id, zeile);
          const w = wert(args[0]), x = wert(args[1]);
          if (!x || !x.ref) return kein('PID: Istwert muss eine Variable sein.');
          b.ein.push({ pin: 'PV', ref: x.ref, neg: false });
          b.par.push({ n: 'SP', w: w ? (w.zahl != null ? komma(w.zahl) : w.name) : args[0] }, { n: 'KC', w: args[2] || '' }, { n: 'TI', w: (args[3] || '') + ' s' });
          if (args[4] && zahl(args[4]) !== 0) grund('Der PI-Regler der LOGO! hat keinen D-Anteil (TV = ' + args[4] + ' fällt weg).', zeile, 'hinweis');
          grund('PI-Regler: Die LOGO! gibt 0 … 1000 aus, VALIS 0 … 100 % – Verstärkung des Analogausgangs anpassen.', zeile, 'hinweis');
          modell.nichtVergleichbar.push(id);
          const r = ablegen(b); memo.set(id, r); return r;
        }
      }
      if (/\.(cv|et|q)\b/.test(ausdruck)) return kein('Zählerstand oder Zeitwert in einer Rechnung (' + ausdruck + '): auf der LOGO! über einen Parameterverweis von Hand bauen.');
      if (/\b(min|max|abs|floor|ceil|round)\s*\(|\?|%/.test(ausdruck)) return kein('Rechnung „' + ausdruck + '“ hat kein Gegenstück in der LOGO! (nur + − × ÷ mit bis zu vier Werten).');
      const v = zerlegeVergleich(ausdruck);
      if (v) {
        let a = wert(v.a), bw = wert(v.b), op = v.op;
        if (!a || !bw) return kein('Vergleich „' + ausdruck + '“: vor dem Vergleich die Rechnung in eine eigene Zeile schreiben.');
        if (a.zahl != null && bw.zahl != null) return kein('Vergleich zweier Zahlen „' + ausdruck + '“.');
        if (a.zahl != null) { const t = a; a = bw; bw = t; op = { '>': '<', '<': '>', '>=': '<=', '<=': '>=', '==': '==', '!=': '!=' }[op]; }
        // LOGO! rechnet ganzzahlig: A >= c ⇔ A > c − 1
        const schwelle = (ax, ay, c) => {
          const b = neuerBaustein(ay ? 'AKOMP' : 'ASW', id, zeile);
          b.ein.push({ pin: 'Ax', ref: ax, neg: false });
          if (ay) b.ein.push({ pin: 'Ay', ref: ay, neg: false });
          b.par.push({ n: 'Ein', w: komma(c) }, { n: 'Aus', w: komma(c) });
          b.ein_ = c; b.aus_ = c;
          return ablegen(b);
        };
        const ay = bw.ref || null;
        const c = bw.ref ? 0 : bw.zahl;
        const ganz = (x) => Math.ceil(x) - 1;
        if (bw.zahl != null && !Number.isInteger(bw.zahl)) grund('Vergleich mit ' + komma(bw.zahl) + ': die LOGO! rechnet mit ganzen Zahlen – Messbereich über Verstärkung und Nullpunkt im Baustein einstellen.', zeile, 'hinweis');
        let r;
        if (op === '>') r = schwelle(a.ref, ay, ay ? 0 : Math.floor(c));
        else if (op === '>=') r = schwelle(a.ref, ay, ay ? -1 : ganz(c));
        else if (op === '<') r = nicht(schwelle(a.ref, ay, ay ? -1 : ganz(c)), id, zeile);
        else if (op === '<=') r = nicht(schwelle(a.ref, ay, ay ? 0 : Math.floor(c)), id, zeile);
        else {
          // A == c ⇔ (A > c − 1) UND NICHT (A > c)
          const lo = schwelle(a.ref, ay, ay ? -1 : ganz(c)), hi = schwelle(a.ref, ay, ay ? 0 : Math.floor(c));
          const g = neuerBaustein(op === '==' ? 'AND' : 'OR', id, zeile);
          g.ein.push({ pin: '', ref: lo, neg: op !== '==' }, { pin: '', ref: hi, neg: op === '==' });
          r = ablegen(g);
          grund('Vergleich auf Gleichheit „' + ausdruck + '“ braucht auf der LOGO! zwei Schwellwertschalter.', zeile, 'hinweis');
        }
        memo.set(id, r); return r;
      }
      // Arithmetikanweisung: bis vier Werte, + − * /
      const teile = ausdruck.replace(/\s+/g, '').split(/[-+*/()]/).filter(Boolean);
      if (!teile.length) return kein('Rechnung „' + ausdruck + '“ ohne Gegenstück.');
      if (teile.length > 4) return kein('Rechnung „' + ausdruck + '“ hat mehr als vier Werte: auf der LOGO! auf mehrere Arithmetikanweisungen aufteilen.');
      if (teile.length === 1) {
        // reine Zahl oder Weitergabe
        const w = wert(teile[0]);
        if (w && w.ref) { memo.set(id, w.ref); return w.ref; }
      }
      const b = neuerBaustein('ARITH', id, zeile);
      let formel = ausdruck.replace(/\s+/g, ' ');
      const namen = {};
      teile.forEach((t, i) => {
        const w = wert(t);
        if (!w) return;
        if (w.ref) { b.ein.push({ pin: 'V' + (i + 1), ref: w.ref, neg: false }); namen[t] = 'V' + (i + 1); }
      });
      b.formel = formel;
      b.js = ausdruck.replace(/[A-Za-zÄÖÜäöüß_][A-Za-z0-9_ÄÖÜäöüß]*/g, (m) => (namen[m] ? 'v.' + namen[m] : (/^(TRUE)$/i.test(m) ? '1' : '0')));
      b.par.push({ n: 'Formel', w: formel });
      if (/\//.test(ausdruck)) grund('Teilen in „' + ausdruck + '“: die LOGO! rechnet ganzzahlig (Rest fällt weg).', zeile, 'hinweis');
      const r = ablegen(b); memo.set(id, r); return r;
    }

    // Wurzeln: jede Zuweisung (OUTPUT) und jede Rechnung (ARITH), in Code-Reihenfolge
    const wurzeln = [];
    nodes.forEach(n => { if (n.type === 'OUTPUT' || n.type === 'ARITH') wurzeln.push({ id: n.id, zeile: zeileVon(n.id) }); });
    wurzeln.sort((a, b) => ((a.zeile == null ? 1e9 : a.zeile) - (b.zeile == null ? 1e9 : b.zeile)) || a.id.localeCompare(b.id));
    wurzeln.forEach(w => {
      const n = nodes.get(w.id);
      const k = modell.klemmen[w.id];
      if (!k) return;
      let ref, neg = false;
      if (n.type === 'ARITH') {
        ref = rechnung(w.id);
        if (n.regler !== 'ZWEIPUNKT' && n.regler !== 'PID' && n.regler !== 'ZUSTAND' && !zerlegeVergleich(String(n.label || '').replace(/^\s*[^=]+?=\s*/, '')) && ref.art !== 'b') {
          // reine Weitergabe einer Zahl
        }
      } else {
        const e = (inEdges.get(w.id) || [])[0];
        ref = e ? quelle(e.sourceId) : konst(false);
        neg = !!(e && e.inverted);
      }
      if (neg) ref = nicht(ref, w.id, w.zeile);
      if (ref.art === 'b') { if (!ref.b.ziele.includes(k)) ref.b.ziele.push(k); }
      else modell.verbindungen.push({ klemme: k, ref, name: w.id });
      modell.schritte.push({ art: 'k', klemme: k, ref, name: w.id });
    });
    // Abnehmer je Baustein (für „→ B004“ in der Liste)
    modell.bausteine.forEach(b => { b.abnehmer = []; });
    modell.bausteine.forEach(b => b.ein.forEach(e => { if (e.ref.art === 'b' && e.ref.b && !e.ref.b.abnehmer.includes(b)) e.ref.b.abnehmer.push(b); }));

    if (/^\s*SCHRITTKETTE\b/im.test(text)) {
      const i = zeilenText.findIndex(z => /^\s*SCHRITTKETTE\b/i.test(z));
      grund('Schrittkette (S7-GRAPH): auf der LOGO! von Hand mit Selbsthalterelais je Schritt bauen.', i < 0 ? null : i, 'nicht');
    }
    if (vg.konflikt.length) vg.konflikt.forEach(kf => grund('Klemme ' + kf.klemme + ' für ' + kf.name + ' geht nicht (' + ({ art: 'falsche Art', doppelt: 'schon vergeben', reserviert: 'Sondermerker der LOGO!' }[kf.grund]) + ') – VALIS schlägt eine andere vor.', null, 'hinweis'));
    modell.passt = passtPruefen(modell);
    return modell;
  }

  // ---------- Passt-Prüfung ----------
  function passtPruefen(m) {
    const zaehl = { I: 0, Q: 0, M: 0, AI: 0, AQ: 0, AM: 0 }, hoechst = { I: 0, Q: 0, M: 0, AI: 0, AQ: 0, AM: 0 };
    Object.values(m.klemmen || {}).forEach(k => { const a = klemmeArt(k); if (a) { zaehl[a.art]++; hoechst[a.art] = Math.max(hoechst[a.art], a.nr); } });
    const gruende = (m.gruende || []).slice();
    const nB = (m.bausteine || []).length;
    let stufe = 'grund';
    const zuViel = (txt) => { gruende.push({ text: txt, zeile: null, art: 'nicht' }); };
    if (hoechst.I > GRENZE.I) zuViel(zaehl.I + ' digitale Eingänge: die LOGO! 8 hat auch mit Erweiterungen höchstens ' + GRENZE.I + '.');
    if (hoechst.Q > GRENZE.Q) zuViel(zaehl.Q + ' digitale Ausgänge: höchstens ' + GRENZE.Q + ' mit Erweiterungen.');
    if (hoechst.AI > GRENZE.AI) zuViel(zaehl.AI + ' Analogeingänge: höchstens ' + GRENZE.AI + '.');
    if (hoechst.AQ > GRENZE.AQ) zuViel(zaehl.AQ + ' Analogausgänge: höchstens ' + GRENZE.AQ + '.');
    if (hoechst.M > GRENZE.M) zuViel(zaehl.M + ' Merker: höchstens ' + (GRENZE.M - M_BELEGT.size) + ' frei.');
    if (hoechst.AM > GRENZE.AM) zuViel(zaehl.AM + ' Analogmerker: höchstens ' + GRENZE.AM + '.');
    if (nB > GRENZE.B) zuViel(nB + ' Bausteine: die LOGO! 8 nimmt höchstens ' + GRENZE.B + '.');
    // Grundgerät oder Erweiterung?
    const iGrund = Object.values(m.klemmen || {}).every(k => { const a = klemmeArt(k); return !a || (a.art === 'I' ? a.nr <= GRUND.I : a.art === 'Q' ? a.nr <= GRUND.Q : a.art === 'AI' ? a.nr <= GRUND.AI : a.art === 'AQ' ? false : true); });
    const erw = [];
    const iMehr = Math.max(0, hoechst.I - GRUND.I), qMehr = Math.max(0, hoechst.Q - GRUND.Q);
    if (iMehr || qMehr) erw.push('Digital: ' + [iMehr ? iMehr + ' Eingänge mehr (I9 …)' : '', qMehr ? qMehr + ' Ausgänge mehr (Q5 …)' : ''].filter(Boolean).join(', ') + ', z. B. DM8 (4 E / 4 A) oder DM16 (8 E / 8 A)');
    if (hoechst.AI > GRUND.AI) erw.push('Analog: AM2 für AI5 …');
    if (hoechst.AQ > 0) erw.push('Analogausgang: AM2 AQ (das Grundgerät 12/24 RCE hat keinen)');
    if (!iGrund) stufe = 'erweiterung';
    if (gruende.some(g => g.art === 'nicht')) stufe = 'nicht';
    return { stufe, gruende, erweiterung: erw, zahlen: { I: zaehl.I, Q: zaehl.Q, M: zaehl.M, AI: zaehl.AI, AQ: zaehl.AQ, AM: zaehl.AM, B: nB } };
  }

  // ---------- Simulation der abgebildeten Schaltung ----------
  function neuerZustand() { return { k: {}, s: new Map() }; }
  function lesen(z, ref) {
    if (!ref) return false;
    if (ref.art === 'c') return ref.k === 'hi';
    if (ref.art === 'k') { const q = z.vor || z.k; return q[ref.k] === undefined ? false : q[ref.k]; }
    const st = z.s.get(ref.b);
    return st ? st.q : false;
  }
  const bit = (v) => !!v && v !== 0;
  const num = (v) => (typeof v === 'number' ? v : (v ? 1 : 0));
  // opt.zugleich: Merker und Ausgänge werden im Zyklus erst am Ende gelesen
  // (alle Bausteine sehen den Stand vom Zyklusanfang). Nur für die Prüfung,
  // um Unterschiede der Reihenfolge im Zyklus von Fehlern der Abbildung zu trennen.
  function zyklus(m, z, eingaenge, dtMs, opt) {
    Object.keys(eingaenge || {}).forEach(n => { const k = m.klemmen[n]; if (k) z.k[k] = eingaenge[n]; });
    z.vor = (opt && opt.zugleich) ? Object.assign({}, z.k) : null;
    const ein = (b, pin) => { const e = b.ein.find(x => x.pin === pin); return e ? lesen(z, e.ref) : undefined; };
    m.schritte.forEach(s => {
      if (s.art === 'k') { z.k[s.klemme] = lesen(z, s.ref); return; }
      const b = s.b;
      let st = z.s.get(b);
      if (!st) { st = { q: false, ta: 0, cv: 0, alt: false }; z.s.set(b, st); }
      const w = b.ein.map(e => { const v = bit(lesen(z, e.ref)); return e.neg ? !v : v; });
      switch (b.typ) {
        case 'AND': st.q = w.every(Boolean); break;
        case 'OR': st.q = w.some(Boolean); break;
        case 'NOT': st.q = !w[0]; break;
        case 'TON': {
          const trg = bit(ein(b, 'Trg'));
          if (trg) { st.ta += dtMs; if (st.ta >= b.sek * 1000 - 1e-6) st.q = true; } else { st.ta = 0; st.q = false; }
          break;
        }
        case 'TOF': {
          const trg = bit(ein(b, 'Trg'));
          if (trg) { st.ta = 0; st.q = true; } else if (st.q) { st.ta += dtMs; if (st.ta >= b.sek * 1000 - 1e-6) st.q = false; }
          break;
        }
        case 'TP': {
          const trg = bit(ein(b, 'Trg'));
          if (trg && !st.alt) { st.q = true; st.ta = 0; } // Flanke 0 → 1 startet (auch neu)
          if (st.q) { st.ta += dtMs; if (st.ta >= b.sek * 1000 - 1e-6) st.q = false; }
          st.alt = trg;
          break;
        }
        case 'CTU': {
          const r = bit(ein(b, 'R')), cnt = bit(ein(b, 'Cnt')), dir = bit(ein(b, 'Dir'));
          if (r) st.cv = 0;
          else if (cnt && !st.alt) st.cv += dir ? -1 : 1;
          st.alt = cnt;
          if (st.cv >= b.pv) st.q = true; else if (st.cv < b.pv) st.q = false;
          break;
        }
        case 'SHR': {
          if (bit(ein(b, 'R'))) st.q = false; else if (bit(ein(b, 'S'))) st.q = true;
          break;
        }
        case 'ASW': case 'AKOMP': {
          const x = num(ein(b, 'Ax')) - (b.typ === 'AKOMP' ? num(ein(b, 'Ay')) : 0);
          if (x > b.ein_) st.q = true; else if (x <= b.aus_) st.q = false;
          break;
        }
        case 'ARITH': {
          const v = {};
          b.ein.forEach(e => { v[e.pin] = num(lesen(z, e.ref)); });
          let r = 0;
          try { r = Function('v', '"use strict"; return (' + b.js + ');')(v); } catch (_) { r = 0; }
          st.q = isFinite(r) ? r : 0;
          break;
        }
        case 'PI': st.q = 0; break;
      }
    });
    z.vor = null;
    const aus = {};
    Object.keys(m.klemmen).forEach(n => { const r = m.rollen[n]; if (r && r.rolle !== 'ein') aus[n] = z.k[m.klemmen[n]]; });
    return aus;
  }

  // ---------- Bausteinliste als Text ----------
  function refText(ref) {
    if (!ref) return '–';
    if (ref.art === 'c') return ref.k;
    if (ref.art === 'k') return ref.k;
    return ref.b ? ref.b.kurz : '?';
  }
  function zeilen(m) {
    const out = [];
    m.bausteine.forEach(b => {
      let s = b.kurz + ' ' + b.name;
      if (b.typ === 'AND' || b.typ === 'OR' || b.typ === 'NOT') s += ' · ' + b.ein.map(e => (e.neg ? 'NOT ' : '') + refText(e.ref)).join(', ');
      else {
        const e = b.ein.filter(x => !(x.pin === 'Dir' && x.ref.art === 'c' && x.ref.k === 'lo')).map(x => x.pin + ' ← ' + refText(x.ref));
        if (e.length) s += ' · ' + e.join(' · ');
        if (b.typ === 'CTU') s += ' · Dir = ' + refText((b.ein.find(x => x.pin === 'Dir') || {}).ref || { art: 'c', k: 'lo' });
        if (b.par.length) s += ' · ' + b.par.map(p => p.n + ' = ' + p.w).join(', ');
      }
      const ziel = b.ziele.length ? b.ziele : b.abnehmer.map(x => x.kurz);
      if (ziel.length) s += ' → ' + ziel.join(', ');
      out.push({ text: s, b });
    });
    m.verbindungen.forEach(v => out.push({ text: v.klemme + ' ← ' + refText(v.ref) + '  (ohne Baustein)', v }));
    return out;
  }

  // ---------- aktuelles Programm ----------
  function aktuell() {
    const g = (typeof currentGraph !== 'undefined') ? currentGraph : null; // eslint-disable-line no-undef
    return abbilden(g, {});
  }

  window.Logo = {
    GRENZE, GRUND, NAME,
    abbilden, aktuell, zeit, zeilen, refText,
    neuerZustand, zyklus,
    festeKlemmen: () => Object.assign({}, feste),
    klemmeSetzen: function (name, klemme) {
      if (!klemme) delete feste[name]; else feste[name] = String(klemme).trim().toUpperCase();
      festeSpeichern();
      if (typeof window._logoNeu === 'function') window._logoNeu();
    },
    exportieren: () => (Object.keys(feste).length ? { klemmen: Object.assign({}, feste) } : null),
    importieren: function (d) {
      feste = (d && d.klemmen && typeof d.klemmen === 'object') ? Object.assign({}, d.klemmen) : {};
      festeSpeichern();
      if (typeof window._logoNeu === 'function') window._logoNeu();
    }
  };
})();
