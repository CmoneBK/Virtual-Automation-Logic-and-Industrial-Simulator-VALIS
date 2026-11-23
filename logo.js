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
 *   TONOF → Ein-/Ausschaltverzögerung (Trg, Ta, Tb), dieselbe Sonderfunktion
 *   TP   → Flankengetriggertes Wischrelais (Trg, TH = T, TL = 0, N = 1).
 *          Das einfache „Wischrelais (Impulsausgabe)“ der LOGO! bricht den
 *          Impuls ab, sobald Trg vor Ablauf auf 0 geht; TP hält ihn. Ein
 *          neuer Impuls an Trg während der Zeit startet sie auf der LOGO!
 *          neu (Fußnote).
 *   TONR → Betriebsstundenzähler (R, En, Ral = lo, MI = PT): die Zeit läuft,
 *          solange En = 1, Q kommt nach MI insgesamt und bleibt bis R. MI
 *          wird in Stunden und Minuten eingestellt; Sekunden gehen nicht.
 *   R_TRIG → AND mit Flankenauswertung (ein Eingang): Q einen Zyklus lang bei 0 → 1
 *   F_TRIG → NAND mit Flankenauswertung (ein Eingang): Q einen Zyklus lang bei 1 → 0
 *   CTU  → Vor-/Rückwärtszähler (R, Cnt, Dir = lo, Ein = Aus = PV)
 *   CTD  → Vor-/Rückwärtszähler (R ← LD, Cnt ← CD, Dir = hi, StartVal = PV,
 *          Ein = Aus = 1) mit NOT dahinter: Q = CV <= 0. Vor dem ersten LD
 *          weicht die LOGO! ab (Start bei StartVal statt 0, Hinweis).
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
    AND: 'AND', OR: 'OR', NOT: 'NOT', ANDF: 'AND mit Flankenauswertung', NANDF: 'NAND mit Flankenauswertung',
    TON: 'Einschaltverzögerung', TOF: 'Ausschaltverzögerung', TONOF: 'Ein-/Ausschaltverzögerung', BSZ: 'Betriebsstundenzähler', TP: 'Flankengetriggertes Wischrelais',
    CTU: 'Vor-/Rückwärtszähler', SHR: 'Selbsthalterelais',
    ASW: 'Analoger Schwellwertschalter', AKOMP: 'Analogkomparator',
    ARITH: 'Arithmetikanweisung', PI: 'PI-Regler'
  };
  const NAME_EN = {
    AND: 'AND', OR: 'OR', NOT: 'NOT', ANDF: 'AND with edge evaluation', NANDF: 'NAND with edge evaluation',
    TON: 'On-delay', TOF: 'Off-delay', TONOF: 'On-/Off-delay', BSZ: 'Hours counter', TP: 'Edge triggered wiping relay',
    CTU: 'Up/down counter', SHR: 'Latching relay',
    ASW: 'Analog threshold trigger', AKOMP: 'Analog comparator',
    ARITH: 'Math instruction', PI: 'PI controller'
  };
  // Texte deutsch oder englisch (VALIS-Sprache beim Abbilden)
  const EN = () => window.currentLang === 'en';
  const L = (de, en) => (EN() ? en : de);
  const SF = new Set(['TON', 'TOF', 'TONOF', 'BSZ', 'TP', 'CTU', 'SHR', 'ASW', 'AKOMP', 'ARITH', 'PI']);
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
    const fussnote = (text, b) => { if (!modell.fussnoten.includes(text)) modell.fussnoten.push(text); if (b) b.fussnote = modell.fussnoten.indexOf(text) + 1; };

    const memo = new Map();
    function neuerBaustein(typ, src, zeile) {
      return { nr: 0, typ, name: (EN() ? NAME_EN : NAME)[typ] || typ, ein: [], par: [], ziele: [], src: src || null, zeile: zeile == null ? null : zeile, hinweise: [] };
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
      if (n.type === 'TONOF') {
        b = neuerBaustein('TONOF', id, zeile);
        const platz = { art: 'b', b };
        memo.set(id, platz);
        sfEingang(b, 'Trg', pin('IN') || ie[0]);
        const zeiten = [['Ta', +n.pt || 0], ['Tb', +n.pt2 || 0]].map(([nm, sek]) => {
          const z = zeit(sek);
          b.par.push({ n: nm, w: z.text });
          if (!z.genau) grund(L('Zeit ' + nm + ' = ' + komma(sek) + ' s passt nicht genau in die Zeitbasis der LOGO! (' + z.text + ').', 'Time ' + nm + ' = ' + sek + ' s does not fit the LOGO! time base exactly (' + z.text + ').'), zeile, 'hinweis');
          if (z.ausserhalb) grund(L('Zeit ' + nm + ' = ' + komma(sek) + ' s ist länger als 99:59 h.', 'Time ' + nm + ' = ' + sek + ' s is longer than 99:59 h.'), zeile, 'nicht');
          return z.wert;
        });
        b.sek = zeiten[0]; b.sek2 = zeiten[1];
        ablegen(b); return platz;
      }
      if (n.type === 'TONR') {
        // Speichernde Einschaltverzögerung → Betriebsstundenzähler: En zählt die Zeit,
        // Q nach MI insgesamt, R setzt zurück. MI nur in Stunden und Minuten.
        b = neuerBaustein('BSZ', id, zeile);
        const platz = { art: 'b', b };
        memo.set(id, platz);
        sfEingang(b, 'R', pin('R'));
        sfEingang(b, 'En', pin('IN'));
        b.ein.push({ pin: 'Ral', ref: konst(false), neg: false });
        const sek = Math.max(0, +n.pt || 0);
        const min = Math.round(sek / 60);
        b.sek = sek;
        b.par.push({ n: 'MI', w: zwei(Math.floor(min / 60)) + ':' + zwei(min % 60) + ' h' });
        if (Math.abs(min * 60 - sek) > 1e-6 || min < 1) grund(L('Speichernde Einschaltverzögerung (TONR) ' + komma(sek) + ' s: Der Betriebsstundenzähler der LOGO! zählt die Zeit wie TONR, sein Intervall MI wird aber in Stunden und Minuten eingestellt. Sekunden gehen nicht, nur ganze Minuten.',
          'Retentive on-delay (TONR) ' + sek + ' s: the LOGO! hours counter adds up the time like TONR, but its interval MI is set in hours and minutes. Seconds are not possible, only whole minutes.'), zeile, 'nicht');
        ablegen(b); return platz;
      }
      if (n.type === 'R_TRIG' || n.type === 'F_TRIG') {
        // Grundfunktion mit Flankenauswertung, ein Eingang
        b = neuerBaustein(n.type === 'R_TRIG' ? 'ANDF' : 'NANDF', id, zeile);
        const platz = { art: 'b', b };
        memo.set(id, platz);
        const e = pin('IN') || ie[0];
        if (e) b.ein.push({ pin: '', ref: quelle(e.sourceId), neg: !!e.inverted });
        ablegen(b); return platz;
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
          fussnote(L('TP → Flankengetriggertes Wischrelais: Der Impuls läuft wie bei TP auch dann weiter, wenn Trg vorher auf 0 geht. Anders als bei TP startet ein neuer Impuls an Trg während der Zeit sie auf der LOGO! neu.',
            'TP → Edge triggered wiping relay: as with TP, the pulse continues even if Trg drops to 0 earlier. Unlike TP, a new pulse at Trg while the time is running restarts it on the LOGO!.'), b);
        } else b.par.push({ n: 'T', w: z.text });
        if (!z.genau) grund(L('Zeit ' + komma(sek) + ' s passt nicht genau in die Zeitbasis der LOGO! (' + z.text + ').', 'Time ' + sek + ' s does not fit the LOGO! time base exactly (' + z.text + ').'), zeile, 'hinweis');
        if (z.ausserhalb) grund(L('Zeit ' + komma(sek) + ' s ist länger als 99:59 h.', 'Time ' + sek + ' s is longer than 99:59 h.'), zeile, 'nicht');
        ablegen(b); return platz;
      }
      if (n.type === 'CTD') {
        // Rückwärtszähler: Vor-/Rückwärtszähler mit Dir = hi, StartVal = PV, R ← LD
        // (R setzt auf StartVal zurück), On = Off = 1. Q des Zählers ist CV >= 1,
        // CTD will CV <= 0: dahinter ein NOT.
        const platz = { art: 'b', b: null };
        memo.set(id, platz);
        b = neuerBaustein('CTU', id, zeile);
        sfEingang(b, 'R', pin('LD'));
        sfEingang(b, 'Cnt', pin('CD'));
        b.ein.push({ pin: 'Dir', ref: konst(true), neg: false });
        const pv = parseInt((String(n.label).match(/\((\d+)\)/) || [0, 0])[1], 10) || 0;
        b.pv = 1; b.start = pv;
        b.par.push({ n: 'StartVal', w: String(pv) }, { n: L('Ein', 'On'), w: '1' }, { n: L('Aus', 'Off'), w: '1' });
        const r = ablegen(b);
        const nb = neuerBaustein('NOT', id, zeile);
        nb.ein.push({ pin: '', ref: r, neg: false });
        platz.b = ablegen(nb).b;
        grund(L('Rückwärtszähler (CTD): Die LOGO! beginnt beim Einschalten mit StartVal = ' + pv + ', die SPS mit 0 (Q = 1). Erst nach dem ersten Laden (LD) verhalten sich beide gleich.',
          'Down counter (CTD): the LOGO! starts at StartVal = ' + pv + ' when switched on, the PLC at 0 (Q = 1). Only after the first load (LD) do both behave the same.'), zeile, 'hinweis');
        return platz;
      }
      if (n.type === 'CTU') {
        b = neuerBaustein('CTU', id, zeile);
        const platz = { art: 'b', b };
        memo.set(id, platz);
        sfEingang(b, 'R', pin('R'));
        sfEingang(b, 'Cnt', pin('CU'));
        b.ein.push({ pin: 'Dir', ref: konst(false), neg: false });
        const pv = parseInt((String(n.label).match(/\((\d+)\)/) || [0, 0])[1], 10) || 0;
        b.pv = pv;
        b.par.push({ n: L('Ein', 'On'), w: String(pv) }, { n: L('Aus', 'Off'), w: String(pv) });
        if (pv === 0) grund(L('Zähler mit Vorwahl 0: die LOGO! schaltet Q schon vor dem ersten Impuls.', 'Counter with preset 0: the LOGO! switches Q on before the first pulse.'), zeile, 'hinweis');
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
          und.hinweise.push(L('vor R: Setzen dominant', 'before R: set dominant'));
          const ru = ablegen(und);
          b.ein.push({ pin: 'R', ref: ru, neg: false });
          b.umbau = true;
          fussnote(L('Setzdominanter Speicher (RS): Die LOGO! hat nur das Selbsthalterelais, bei dem Rücksetzen gewinnt. Davor steht deshalb R UND NICHT S. Sind beide 1, bleibt der Ausgang gesetzt wie im VALIS-Programm.',
            'Set-dominant latch (RS): the LOGO! only has the latching relay, where reset wins. That is why R AND NOT S comes before it. If both are 1, the output stays set as in the VALIS program.'), b);
          und.fussnote = b.fussnote;
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
      if (n.regler === 'ZUSTAND') return kein(L('Zustandsregler (ZUSTAND) gibt es auf der LOGO! nicht.', 'The LOGO! has no state controller (ZUSTAND).'));
      if (n.regler) {
        const args = ((ausdruck.match(/\((.*)\)\s*$/) || [0, ''])[1]).split(',').map(a => a.trim());
        if (n.regler === 'ZWEIPUNKT') {
          // ZWEIPUNKT(X, EIN, AUS) bzw. (X, W, HYST, HEIZEN|KUEHLEN)
          const x = wert(args[0]);
          let ein, aus;
          const richt = /^(KUEHLEN|KÜHLEN|INVERS)$/i.test(args[3] || '') ? -1 : (args[3] ? 1 : 0);
          const a1 = wert(args[1]), a2 = wert(args[2]);
          if (!x || !x.ref || !a1 || a1.zahl == null || !a2 || a2.zahl == null) return kein(L('ZWEIPUNKT mit Variablen als Schaltpunkt: auf der LOGO! nur mit festen Werten.', 'ZWEIPUNKT with variables as switching points: on the LOGO! only with fixed values.'));
          if (richt === 0) { ein = a1.zahl; aus = a2.zahl; } else { const h = Math.abs(a2.zahl) / 2; ein = richt > 0 ? a1.zahl - h : a1.zahl + h; aus = richt > 0 ? a1.zahl + h : a1.zahl - h; }
          const b = neuerBaustein('ASW', id, zeile);
          b.ein.push({ pin: 'Ax', ref: x.ref, neg: false });
          // LOGO!: Q = 1 bei Ax > Ein, Q = 0 bei Ax ≤ Aus; ganzzahlig heißt x < a ⇔ x ≤ a − 1
          const unter = (a) => Math.ceil(a) - 1;
          if (ein <= aus) {
            // ein unten (Heizen): Schwellwert schaltet oben ein, NOT dreht um
            b.par.push({ n: L('Ein', 'On'), w: komma(aus) }, { n: L('Aus', 'Off'), w: komma(unter(ein)) });
            b.ein_ = aus; b.aus_ = unter(ein);
            const r = ablegen(b);
            const nb = nicht(r, id, zeile);
            memo.set(id, nb); return nb;
          }
          b.par.push({ n: L('Ein', 'On'), w: komma(ein) }, { n: L('Aus', 'Off'), w: komma(unter(aus)) });
          b.ein_ = ein; b.aus_ = unter(aus);
          const r = ablegen(b); memo.set(id, r); return r;
        }
        if (n.regler === 'PID') {
          const b = neuerBaustein('PI', id, zeile);
          const w = wert(args[0]), x = wert(args[1]);
          if (!x || !x.ref) return kein(L('PID: Istwert muss eine Variable sein.', 'PID: the actual value must be a variable.'));
          b.ein.push({ pin: 'PV', ref: x.ref, neg: false });
          b.par.push({ n: 'SP', w: w ? (w.zahl != null ? komma(w.zahl) : w.name) : args[0] }, { n: 'KC', w: args[2] || '' }, { n: 'TI', w: (args[3] || '') + ' s' });
          if (args[4] && zahl(args[4]) !== 0) grund(L('Der PI-Regler der LOGO! hat keinen D-Anteil (TV = ' + args[4] + ' fällt weg).', 'The LOGO! PI controller has no D part (TV = ' + args[4] + ' is dropped).'), zeile, 'hinweis');
          grund(L('PI-Regler: Die LOGO! gibt 0 … 1000 aus, VALIS 0 … 100 % – Verstärkung des Analogausgangs anpassen.', 'PI controller: the LOGO! outputs 0 … 1000, VALIS 0 … 100 % – adjust the gain of the analog output.'), zeile, 'hinweis');
          modell.nichtVergleichbar.push(id);
          const r = ablegen(b); memo.set(id, r); return r;
        }
      }
      if (/\.(cv|et|q)\b/i.test(ausdruck)) return kein(L('Zählerstand oder Zeitwert in einer Rechnung (' + ausdruck + '): auf der LOGO! über einen Parameterverweis von Hand bauen.', 'Counter value or time value in a calculation (' + ausdruck + '): build it by hand on the LOGO! with a parameter reference.'));
      if (/\b(min|max|abs|floor|ceil|round)\s*\(|\?|%/i.test(ausdruck)) return kein(L('Rechnung „' + ausdruck + '“ hat kein Gegenstück in der LOGO! (nur + − × ÷ mit bis zu vier Werten).', 'Calculation “' + ausdruck + '” has no counterpart on the LOGO! (only + − × ÷ with up to four values).'));
      const v = zerlegeVergleich(ausdruck);
      if (v) {
        let a = wert(v.a), bw = wert(v.b), op = v.op;
        if (!a || !bw) return kein(L('Vergleich „' + ausdruck + '“: vor dem Vergleich die Rechnung in eine eigene Zeile schreiben.', 'Comparison “' + ausdruck + '”: write the calculation in its own line before comparing.'));
        if (a.zahl != null && bw.zahl != null) return kein(L('Vergleich zweier Zahlen „' + ausdruck + '“.', 'Comparison of two numbers “' + ausdruck + '”.'));
        if (a.zahl != null) { const t = a; a = bw; bw = t; op = { '>': '<', '<': '>', '>=': '<=', '<=': '>=', '==': '==', '!=': '!=' }[op]; }
        // LOGO! rechnet ganzzahlig: A >= c ⇔ A > c − 1
        const schwelle = (ax, ay, c) => {
          const b = neuerBaustein(ay ? 'AKOMP' : 'ASW', id, zeile);
          b.ein.push({ pin: 'Ax', ref: ax, neg: false });
          if (ay) b.ein.push({ pin: 'Ay', ref: ay, neg: false });
          b.par.push({ n: L('Ein', 'On'), w: komma(c) }, { n: L('Aus', 'Off'), w: komma(c) });
          b.ein_ = c; b.aus_ = c;
          return ablegen(b);
        };
        const ay = bw.ref || null;
        const c = bw.ref ? 0 : bw.zahl;
        const ganz = (x) => Math.ceil(x) - 1;
        if (bw.zahl != null && !Number.isInteger(bw.zahl)) grund(L('Vergleich mit ' + komma(bw.zahl) + ': die LOGO! rechnet mit ganzen Zahlen – Messbereich über Verstärkung und Nullpunkt im Baustein einstellen.', 'Comparison with ' + bw.zahl + ': the LOGO! calculates with whole numbers – set the measuring range with gain and offset in the block.'), zeile, 'hinweis');
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
          grund(L('Vergleich auf Gleichheit „' + ausdruck + '“ braucht auf der LOGO! zwei Schwellwertschalter.', 'Equality check “' + ausdruck + '” needs two threshold triggers on the LOGO!.'), zeile, 'hinweis');
        }
        memo.set(id, r); return r;
      }
      // Arithmetikanweisung: bis vier Werte, + − * /
      const teile = ausdruck.replace(/\s+/g, '').split(/[-+*/()]/).filter(Boolean);
      if (!teile.length) return kein(L('Rechnung „' + ausdruck + '“ ohne Gegenstück.', 'Calculation “' + ausdruck + '” without counterpart.'));
      if (teile.length > 4) return kein(L('Rechnung „' + ausdruck + '“ hat mehr als vier Werte: auf der LOGO! auf mehrere Arithmetikanweisungen aufteilen.', 'Calculation “' + ausdruck + '” has more than four values: split it into several math instructions on the LOGO!.'));
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
      b.par.push({ n: L('Formel', 'Formula'), w: formel });
      if (/\//.test(ausdruck)) grund(L('Teilen in „' + ausdruck + '“: die LOGO! rechnet ganzzahlig (Rest fällt weg).', 'Division in “' + ausdruck + '”: the LOGO! calculates with whole numbers (the remainder is dropped).'), zeile, 'hinweis');
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
      grund(L('Schrittkette (S7-GRAPH): auf der LOGO! von Hand mit Selbsthalterelais je Schritt bauen.', 'Step sequence (S7-GRAPH): build it by hand on the LOGO! with one latching relay per step.'), i < 0 ? null : i, 'nicht');
    }
    if (vg.konflikt.length) vg.konflikt.forEach(kf => grund(L('Klemme ' + kf.klemme + ' für ' + kf.name + ' geht nicht (' + ({ art: 'falsche Art', doppelt: 'schon vergeben', reserviert: 'Sondermerker der LOGO!' }[kf.grund]) + ') – VALIS schlägt eine andere vor.',
      'Terminal ' + kf.klemme + ' for ' + kf.name + ' is not possible (' + ({ art: 'wrong type', doppelt: 'already used', reserviert: 'special flag of the LOGO!' }[kf.grund]) + ') – VALIS suggests another one.'), null, 'hinweis'));
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
    if (hoechst.I > GRENZE.I) zuViel(L(zaehl.I + ' digitale Eingänge: die LOGO! 8 hat auch mit Erweiterungen höchstens ' + GRENZE.I + '.', zaehl.I + ' digital inputs: even with expansions the LOGO! 8 has at most ' + GRENZE.I + '.'));
    if (hoechst.Q > GRENZE.Q) zuViel(L(zaehl.Q + ' digitale Ausgänge: höchstens ' + GRENZE.Q + ' mit Erweiterungen.', zaehl.Q + ' digital outputs: at most ' + GRENZE.Q + ' with expansions.'));
    if (hoechst.AI > GRENZE.AI) zuViel(L(zaehl.AI + ' Analogeingänge: höchstens ' + GRENZE.AI + '.', zaehl.AI + ' analog inputs: at most ' + GRENZE.AI + '.'));
    if (hoechst.AQ > GRENZE.AQ) zuViel(L(zaehl.AQ + ' Analogausgänge: höchstens ' + GRENZE.AQ + '.', zaehl.AQ + ' analog outputs: at most ' + GRENZE.AQ + '.'));
    if (hoechst.M > GRENZE.M) zuViel(L(zaehl.M + ' Merker: höchstens ' + (GRENZE.M - M_BELEGT.size) + ' frei.', zaehl.M + ' flags: at most ' + (GRENZE.M - M_BELEGT.size) + ' free.'));
    if (hoechst.AM > GRENZE.AM) zuViel(L(zaehl.AM + ' Analogmerker: höchstens ' + GRENZE.AM + '.', zaehl.AM + ' analog flags: at most ' + GRENZE.AM + '.'));
    if (nB > GRENZE.B) zuViel(L(nB + ' Bausteine: die LOGO! 8 nimmt höchstens ' + GRENZE.B + '.', nB + ' blocks: the LOGO! 8 takes at most ' + GRENZE.B + '.'));
    // Grundgerät oder Erweiterung?
    const iGrund = Object.values(m.klemmen || {}).every(k => { const a = klemmeArt(k); return !a || (a.art === 'I' ? a.nr <= GRUND.I : a.art === 'Q' ? a.nr <= GRUND.Q : a.art === 'AI' ? a.nr <= GRUND.AI : a.art === 'AQ' ? false : true); });
    const erw = [];
    const iMehr = Math.max(0, hoechst.I - GRUND.I), qMehr = Math.max(0, hoechst.Q - GRUND.Q);
    if (iMehr || qMehr) erw.push(L('Digital: ' + [iMehr ? iMehr + ' Eingänge mehr (I9 …)' : '', qMehr ? qMehr + ' Ausgänge mehr (Q5 …)' : ''].filter(Boolean).join(', ') + ', z. B. DM8 (4 E / 4 A) oder DM16 (8 E / 8 A)',
      'Digital: ' + [iMehr ? iMehr + ' more inputs (I9 …)' : '', qMehr ? qMehr + ' more outputs (Q5 …)' : ''].filter(Boolean).join(', ') + ', e.g. DM8 (4 I / 4 Q) or DM16 (8 I / 8 Q)'));
    if (hoechst.AI > GRUND.AI) erw.push(L('Analog: AM2 für AI5 …', 'Analog: AM2 for AI5 …'));
    if (hoechst.AQ > 0) erw.push(L('Analogausgang: AM2 AQ (das Grundgerät 12/24 RCE hat keinen)', 'Analog output: AM2 AQ (the 12/24 RCE base module has none)'));
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
      if (!st) { st = { q: false, ta: 0, cv: b.start || 0, alt: false }; z.s.set(b, st); }
      const w = b.ein.map(e => { const v = bit(lesen(z, e.ref)); return e.neg ? !v : v; });
      switch (b.typ) {
        case 'AND': st.q = w.every(Boolean); break;
        case 'OR': st.q = w.some(Boolean); break;
        case 'NOT': st.q = !w[0]; break;
        case 'ANDF': case 'NANDF': {
          // AND (Flanke): 1 für einen Zyklus, wenn das UND von 0 auf 1 geht; NAND (Flanke): wenn es von 1 auf 0 geht
          const u = w.every(Boolean);
          st.q = b.typ === 'ANDF' ? (u && !st.alt) : (!u && st.alt);
          st.alt = u;
          break;
        }
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
        case 'TONOF': {
          // Ta läuft, solange Trg = 1 und Q = 0; Tb läuft, solange Trg = 0 und Q = 1
          const trg = bit(ein(b, 'Trg'));
          if (trg) { if (st.q) st.ta = 0; else { st.ta += dtMs; if (st.ta >= b.sek * 1000 - 1e-6) { st.q = true; st.ta = 0; } } }
          else if (st.q) { st.ta += dtMs; if (st.ta >= b.sek2 * 1000 - 1e-6) { st.q = false; st.ta = 0; } }
          else st.ta = 0;
          break;
        }
        case 'BSZ': {
          // Betriebsstundenzähler: Zeit läuft bei En = 1, Q nach MI, R setzt Zeit und Q zurück
          if (bit(ein(b, 'R'))) { st.ta = 0; st.q = false; }
          else if (bit(ein(b, 'En')) && !st.q) { st.ta += dtMs; if (st.ta >= b.sek * 1000 - 1e-6) st.q = true; }
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
          if (r) st.cv = b.start || 0;
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
      if (b.typ === 'AND' || b.typ === 'OR' || b.typ === 'NOT' || b.typ === 'ANDF' || b.typ === 'NANDF') s += ' · ' + b.ein.map(e => (e.neg ? 'NOT ' : '') + refText(e.ref)).join(', ');
      else {
        const e = b.ein.filter(x => !((x.pin === 'Dir' || x.pin === 'Ral') && x.ref.art === 'c' && x.ref.k === 'lo')).map(x => x.pin + ' ← ' + refText(x.ref));
        if (e.length) s += ' · ' + e.join(' · ');
        if (b.typ === 'BSZ') s += ' · Ral = lo';
        if (b.typ === 'CTU') s += ' · Dir = ' + refText((b.ein.find(x => x.pin === 'Dir') || {}).ref || { art: 'c', k: 'lo' });
        if (b.par.length) s += ' · ' + b.par.map(p => p.n + ' = ' + p.w).join(', ');
      }
      const ziel = b.ziele.length ? b.ziele : b.abnehmer.map(x => x.kurz);
      if (ziel.length) s += ' → ' + ziel.join(', ');
      out.push({ text: s, b });
    });
    m.verbindungen.forEach(v => out.push({ text: v.klemme + ' ← ' + refText(v.ref) + '  ' + L('(ohne Baustein)', '(no block)'), v }));
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

// =====================================================================
// LOGO!-Ansicht im Logikplan (Schalter „LOGO!“ neben „FUP“)
// ---------------------------------------------------------------------
// Zeichnet die abgebildete Schaltung wie in LOGO!Soft Comfort (FUP):
// Kästen mit Nummer B001 … und Funktionsnamen, Klemmen I1/Q1/M1 mit dem
// Variablennamen darüber, Negation als Kreis, Parameter unter dem Kasten.
// Je Ausgang oder Merker ein Strang; ein Baustein, der schon gezeichnet
// ist, steht später nur noch als Verweis (B003) am Eingang. Oben der
// Passt-Kasten mit Gründen, ein Klick springt zur Zeile im Code.
// Live-Färbung aus dem Simulationszustand (1 grün, 0 blau gestrichelt).
// Reine Ansicht: bearbeitet wird weiter im Code oder im Logikplan.
// =====================================================================
(function () {
  'use strict';
  if (!window.Logo || window._logoRender) return;
  const NS = 'http://www.w3.org/2000/svg';
  const LS_AN = 'valisLogoAnsicht';
  let an = false;
  try { an = localStorage.getItem(LS_AN) === '1'; } catch (_) {}
  window.logoAnsicht = an;
  let modell = null, layout = null, zoom = 1, groesse = null;
  // Texte der Ansicht: deutsch, englisch aus dieser Tabelle (VALIS-Sprache)
  const EN_T = {
    'Ansicht des Codes, wie er auf einer LOGO! 8 aussieht': 'View of the code as it looks on a LOGO! 8',
    '1 = grün': '1 = green', '0 = blau gestrichelt': '0 = blue dashed',
    'Passt auf ein LOGO! 8 Grundgerät': 'Fits a LOGO! 8 base module',
    'Passt auf eine LOGO! 8 mit Erweiterungsmodul': 'Fits a LOGO! 8 with expansion module',
    'Passt so nicht auf eine LOGO! 8': 'Does not fit a LOGO! 8 as it is',
    'Bausteine': 'blocks', 'Zeile': 'Line',
    'Kein Programm – im Code-Editor eine Zuweisung schreiben, z. B. LAMPE := TASTER': 'No program – write an assignment in the code editor, e.g. LAMPE := TASTER',
    'Bausteinliste zum Abtippen in LOGO!Soft Comfort': 'Block list to type into LOGO!Soft Comfort',
    'Bausteinliste': 'Block list', 'LOGO!-Klemme': 'LOGO! terminal', 'Variable': 'Variable', 'Kennzeichen': 'Designation',
    'SPS-Adresse': 'PLC address', 'Bauteil': 'Component', 'Kommentar': 'Comment', 'LOGO!-Programm': 'LOGO! program',
    'LOGO!-Programm (Maßstab LOGO! 8)': 'LOGO! program (reference LOGO! 8)', 'Zuordnungsliste mit LOGO!-Klemmen': 'Assignment list with LOGO! terminals',
    'Eingänge': 'Inputs', 'Ausgänge': 'Outputs', 'Merker': 'Flags',
    'Erstellt mit VALIS. Das Programm in LOGO!Soft Comfort von Hand eingeben; VALIS lädt nichts direkt in die LOGO!.': 'Made with VALIS. Enter the program by hand in LOGO!Soft Comfort; VALIS does not download anything to the LOGO!.',
    'Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.': 'The print window was blocked. Please allow pop-ups for this page.',
    'Verkleinern (oder Mausrad)': 'Zoom out (or mouse wheel)', 'Vergrößern (oder Mausrad)': 'Zoom in (or mouse wheel)', 'Zoom zurücksetzen (100 %)': 'Reset zoom (100 %)',
    'Bausteinliste unter dem Plan ein- oder ausblenden': 'Show or hide the block list below the diagram',
    'Bausteinliste und Zuordnungsliste mit LOGO!-Klemmen auf einem Blatt drucken oder als PDF speichern': 'Print the block list and the assignment list with LOGO! terminals on one sheet or save them as PDF',
    '📋 Bausteinliste': '📋 Block list', '🖨 Drucken': '🖨 Print', '💾 Als SVG speichern': '💾 Save as SVG',
    'LOGO!-Plan als SVG-Grafik speichern, z. B. für ein Arbeitsblatt': 'Save the LOGO! diagram as an SVG graphic, e.g. for a worksheet'
  };
  const T = (s) => (window.currentLang === 'en' && EN_T[s]) || s;
  const doc = () => (typeof _fbsDoc === 'function' ? _fbsDoc() : document); // eslint-disable-line no-undef
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function el(tag, attrs, parent) {
    const e = doc().createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, o) {
    o = o || {};
    const t = el('text', { x, y, 'font-family': o.mono ? 'Consolas, monospace' : "'Segoe UI', Arial, sans-serif", 'font-size': o.size || 12,
      'font-weight': o.bold ? 'bold' : 'normal', 'text-anchor': o.anchor || 'start', fill: o.fill || '#111' }, parent);
    t.textContent = s;
    return t;
  }

  function leisteInnen() {
    return '<span><b>LOGO!</b> · ' + T('Ansicht des Codes, wie er auf einer LOGO! 8 aussieht') + ' · <span style="color:#2e7d32;font-weight:bold;">' + T('1 = grün') + '</span>, <span style="color:#1565c0;">' + T('0 = blau gestrichelt') + '</span></span>' +
        '<span style="margin-left:auto; display:inline-flex; gap:2px; align-items:center;">' +
          '<button class="btn-export" style="background:#607d8b; border:1px solid #455a64; padding:2px 8px; font-size:11px;" onclick="window._logoZoom(1/1.2)" title="' + T('Verkleinern (oder Mausrad)') + '">−</button>' +
          '<span id="logo-zoom-anzeige" style="min-width:40px; text-align:center;">' + Math.round(zoom * 100) + ' %</span>' +
          '<button class="btn-export" style="background:#607d8b; border:1px solid #455a64; padding:2px 8px; font-size:11px;" onclick="window._logoZoom(1.2)" title="' + T('Vergrößern (oder Mausrad)') + '">+</button>' +
          '<button class="btn-export" style="background:#607d8b; border:1px solid #455a64; padding:2px 8px; font-size:11px;" onclick="window._logoZoom(0)" title="' + T('Zoom zurücksetzen (100 %)') + '">⟲</button>' +
        '</span>' +
        '<span id="logo-knoepfe" style="display:inline-flex; gap:4px;">' +
          '<button class="btn-export" style="background:#607d8b; border:1px solid #455a64; padding:2px 8px; font-size:11px;" onclick="window._logoListeZeigen()" title="' + T('Bausteinliste unter dem Plan ein- oder ausblenden') + '">' + T('📋 Bausteinliste') + '</button>' +
          '<button class="btn-export" style="background:#607d8b; border:1px solid #455a64; padding:2px 8px; font-size:11px;" onclick="window._logoDrucken()" title="' + T('Bausteinliste und Zuordnungsliste mit LOGO!-Klemmen auf einem Blatt drucken oder als PDF speichern') + '">' + T('🖨 Drucken') + '</button>' +
        '</span>' +
        '<button class="btn-export" style="background:#607d8b; border:1px solid #455a64; padding:2px 8px; font-size:11px;" onclick="window._logoSvg()" title="' + T('LOGO!-Plan als SVG-Grafik speichern, z. B. für ein Arbeitsblatt') + '">' + T('💾 Als SVG speichern') + '</button>';
  }

  // ---------- Host im Logikplan ----------
  function host() {
    const d = doc();
    let h = d.getElementById('logo-host');
    if (h) return h;
    const fup = d.getElementById('fup-norm-host');
    if (!fup || !fup.parentNode) return null;
    h = d.createElement('div');
    h.id = 'logo-host';
    h.setAttribute('style', 'display:none; position:absolute; top:56px; left:0; right:0; bottom:0; overflow:auto; background:#fff; z-index:41;');
    h.innerHTML =
      '<div id="logo-leiste" style="position:sticky; top:0; left:0; display:flex; flex-wrap:wrap; gap:4px 8px; align-items:center; padding:4px 10px; background:#fafafa; border-bottom:1px solid #ddd; font:12px \'Segoe UI\', Arial, sans-serif; color:#455a64; z-index:2;">' +
        leisteInnen() +
      '</div>' +
      '<div id="logo-passt" style="margin:8px 10px 0; font:12px \'Segoe UI\', Arial, sans-serif;"></div>' +
      '<svg id="logo-svg" xmlns="http://www.w3.org/2000/svg" style="display:block;"></svg>' +
      '<div id="logo-fuss" style="margin:0 10px 12px; font:11px \'Segoe UI\', Arial, sans-serif; color:#455a64;"></div>' +
      '<div id="logo-liste" style="margin:0 10px 16px; font:12px \'Segoe UI\', Arial, sans-serif; color:#263238;"></div>';
    fup.parentNode.insertBefore(h, fup.nextSibling);
    zoomBinden(h);
    return h;
  }

  // ---------- Passt-Kasten ----------
  function passtHtml(m) {
    const p = m.passt;
    const farbe = { grund: ['#e8f5e9', '#2e7d32'], erweiterung: ['#e8f5e9', '#2e7d32'], nicht: ['#fff8e1', '#e65100'] }[p.stufe];
    const kopf = p.stufe === 'grund' ? '✔ ' + T('Passt auf ein LOGO! 8 Grundgerät') + ' (' + p.zahlen.I + ' I, ' + p.zahlen.Q + ' Q' + (p.zahlen.AI ? ', ' + p.zahlen.AI + ' AI' : '') + ', ' + p.zahlen.B + ' ' + T('Bausteine') + ')'
      : p.stufe === 'erweiterung' ? '✔ ' + T('Passt auf eine LOGO! 8 mit Erweiterungsmodul') + ' (' + p.zahlen.I + ' I, ' + p.zahlen.Q + ' Q' + (p.zahlen.AI ? ', ' + p.zahlen.AI + ' AI' : '') + (p.zahlen.AQ ? ', ' + p.zahlen.AQ + ' AQ' : '') + ', ' + p.zahlen.B + ' ' + T('Bausteine') + ')'
        : '⚠ ' + T('Passt so nicht auf eine LOGO! 8');
    let h = '<div data-logo-passt="' + p.stufe + '" style="background:' + farbe[0] + '; border-left:4px solid ' + farbe[1] + '; padding:6px 10px; border-radius:3px;">' +
      '<b style="color:' + farbe[1] + ';">' + esc(kopf) + '</b>';
    if (p.erweiterung.length) h += '<div style="margin-top:3px; color:#33691e;">' + p.erweiterung.map(esc).join(' · ') + '</div>';
    const liste = p.gruende.slice().sort((a, b) => (a.art === 'nicht' ? 0 : 1) - (b.art === 'nicht' ? 0 : 1));
    if (liste.length) {
      h += '<ul style="margin:4px 0 0; padding-left:18px;">';
      liste.forEach(g => {
        const zeile = g.zeile != null ? ' <a href="#" data-logo-zeile="' + g.zeile + '" style="color:#1565c0;">' + T('Zeile') + ' ' + (g.zeile + 1) + '</a>' : '';
        h += '<li style="color:' + (g.art === 'nicht' ? '#bf360c' : '#5d4037') + ';">' + (g.art === 'nicht' ? '' : 'ℹ ') + esc(g.text) + zeile + '</li>';
      });
      h += '</ul>';
    }
    return h + '</div>';
  }
  function zeileZeigen(idx) {
    const ta = document.getElementById('code');
    if (!ta) return;
    const z = ta.value.split('\n');
    if (idx < 0 || idx >= z.length) return;
    let off = 0;
    for (let i = 0; i < idx; i++) off += z[i].length + 1;
    try { ta.focus(); } catch (_) {}
    ta.selectionStart = off; ta.selectionEnd = off + z[idx].length;
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.5);
    ta.scrollTop = Math.max(0, (parseFloat(cs.paddingTop) || 0) + idx * lh - ta.clientHeight / 2 + lh);
    if (window._updateCurrentLineHighlight) window._updateCurrentLineHighlight();
  }
  window._logoZeileZeigen = zeileZeigen;

  // ---------- Bäume aus dem Modell ----------
  const PIN = 28, BW = 46, BW_SF = 92, STUB = 18, GAP = 26, OPW_MIN = 120, ZW = 7.2;
  function baeume(m) {
    const gezeichnet = new Set();
    const vonRef = (ref, wurzelB) => {
      if (ref.art === 'b') {
        const b = ref.b;
        if (gezeichnet.has(b) || b === wurzelB) return { kind: 'op', text: b.kurz, sub: '', ref };
        gezeichnet.add(b);
        return { kind: 'box', b, ref, ins: b.ein.filter(e => !(e.pin === 'Dir' && e.ref.art === 'c' && e.ref.k === 'lo')).map(e => ({ pin: e.pin, neg: e.neg, child: vonRef(e.ref) })) };
      }
      if (ref.art === 'c') return { kind: 'op', text: ref.k, sub: '', ref, konst: true };
      return { kind: 'op', text: ref.k, sub: ref.name || '', ref };
    };
    return m.schritte.filter(s => s.art === 'k').map(s => ({ klemme: s.klemme, name: s.name, ref: s.ref, baum: vonRef(s.ref) }));
  }
  function messen(it) {
    if (it.kind === 'op') { it.h = 32; it.outY = 24; return it; }
    let cur = 0, prev = -1e9;
    const pins = [];
    it.ins.forEach(inp => {
      const c = messen(inp.child);
      let top = cur;
      if (top + c.outY < prev + PIN) top = prev + PIN - c.outY;
      inp._top = top; prev = top + c.outY; pins.push(prev); cur = top + c.h + 6;
    });
    if (!pins.length) pins.push(16);
    const sf = SF_TYP.has(it.b.typ);
    const parZeilen = sf ? it.b.par.length : 0;
    let boxTop = pins[0] - 16;
    let boxBot = pins[pins.length - 1] + 16;
    if (boxBot - boxTop < 40) boxBot = boxTop + 40;
    const oben = boxTop - 30; // Nummer und Name über dem Kasten
    let minTop = oben;
    it.ins.forEach(i => { minTop = Math.min(minTop, i._top); });
    const d = -minTop;
    it.ins.forEach(i => { i._top += d; });
    it.pins = pins.map(p => p + d);
    it.boxTop = boxTop + d; it.boxBot = boxBot + d;
    it.outY = (it.boxTop + it.boxBot) / 2;
    if (it.ins.length === 1) it.outY = it.pins[0];
    let h = it.boxBot + parZeilen * 13 + 4;
    it.ins.forEach(i => { h = Math.max(h, i._top + i.child.h); });
    it.h = h;
    return it;
  }
  const SF_TYP = new Set(['TON', 'TOF', 'TONOF', 'BSZ', 'TP', 'CTU', 'SHR', 'ASW', 'AKOMP', 'ARITH', 'PI']);
  const SYMBOL = { AND: '&', OR: '≥1', NOT: '1', ANDF: '&↑', NANDF: '&↓', TON: '⊓→', TOF: '→⊓', TONOF: '→⊓→', BSZ: 'Σh', TP: '⊓', CTU: '+/−', SHR: 'RS', ASW: 'A→', AKOMP: 'ΔA', ARITH: '+−×÷', PI: 'PI' };
  function breite(it) {
    if (it.kind !== 'box') return 0;
    let m = 0;
    it.ins.forEach(i => { m = Math.max(m, breite(i.child)); });
    return m + (SF_TYP.has(it.b.typ) ? BW_SF : BW) + 2 * STUB + GAP;
  }
  function zeichnen(g, it, y, xAus, ctx) {
    if (it.kind === 'op') {
      const ly = y + it.outY, x0 = ctx.left;
      const ln = el('line', { x1: x0 + ctx.opW - 4, y1: ly, x2: xAus, y2: ly, stroke: '#111', 'stroke-width': 1.6 }, g);
      ctx.wires.push({ el: ln, ref: it.ref });
      txt(g, x0 + ctx.opW - 8, ly - 4, it.text, { anchor: 'end', bold: !it.konst, mono: true, fill: it.konst ? '#0d47a1' : (it.ref.art === 'b' ? '#6a1b9a' : '#111') });
      if (it.sub) txt(g, x0 + ctx.opW - 8, ly - 17, it.sub, { anchor: 'end', size: 10, fill: '#666' });
      return;
    }
    const b = it.b, sf = SF_TYP.has(b.typ), w = sf ? BW_SF : BW;
    const bx = xAus - w - STUB, top = y + it.boxTop, bot = y + it.boxBot;
    const gg = el('g', { 'data-logo-b': b.kurz }, g);
    el('rect', { x: bx, y: top, width: w, height: bot - top, fill: sf ? '#f3f8ff' : '#fff', stroke: '#111', 'stroke-width': 1.6, rx: 2 }, gg);
    txt(gg, bx, top - 6, b.kurz, { bold: true, size: 11, fill: '#1565c0', mono: true });
    if (sf) txt(gg, bx + 34, top - 6, b.name, { size: 10, fill: '#37474f' });
    if (b.fussnote) {
      let fx = bx + 34;
      if (sf) { const nt = gg.lastChild; let lw = b.name.length * 5.6; try { lw = nt.getComputedTextLength() || lw; } catch (_) {} fx = bx + 36 + lw; }
      txt(gg, fx, top - 10, String(b.fussnote), { size: 9, fill: '#bf360c', bold: true });
    }
    txt(gg, bx + w / 2 + (sf ? 10 : 0), (top + bot) / 2 + 5, SYMBOL[b.typ] || b.typ, { anchor: 'middle', bold: true, size: sf ? 12 : 14 });
    const tip = el('title', {}, gg); tip.textContent = Logo.zeilen({ bausteine: [b], verbindungen: [] })[0].text;
    // Ausgang (bei NOT mit Kreis wie in LOGO!Soft)
    const oy = y + it.outY;
    const ln = el('line', { x1: bx + w + (b.typ === 'NOT' ? 8 : 0), y1: oy, x2: xAus, y2: oy, stroke: '#111', 'stroke-width': 1.6 }, g);
    ctx.wires.push({ el: ln, ref: it.ref });
    if (b.typ === 'NOT') el('circle', { cx: bx + w + 4, cy: oy, r: 4, fill: '#fff', stroke: '#111', 'stroke-width': 1.4 }, gg);
    txt(gg, bx + w - 4, oy - 4, 'Q', { anchor: 'end', size: 9, fill: '#555' });
    // Parameter unter dem Kasten
    if (sf) b.par.forEach((p, i) => txt(gg, bx + 2, bot + 12 + i * 13, p.n + ' = ' + p.w, { size: 10, mono: true, fill: '#0d47a1' }));
    // Eingänge
    const kindAus = bx - STUB;
    it.ins.forEach((inp, i) => {
      const py = y + it.pins[i];
      zeichnen(g, inp.child, y + inp._top, inp.child.kind === 'box' ? kindAus - GAP : bx, ctx);
      if (inp.child.kind === 'box') {
        const l2 = el('line', { x1: kindAus - GAP, y1: py, x2: bx, y2: py, stroke: '#111', 'stroke-width': 1.6 }, g);
        ctx.wires.push({ el: l2, ref: inp.child.ref });
      }
      if (inp.pin) txt(gg, bx + 3, py + 4, inp.pin, { size: 9, fill: '#333' });
      if (inp.neg) el('circle', { cx: bx - 4, cy: py, r: 4, fill: '#fff', stroke: '#111', 'stroke-width': 1.4 }, gg);
    });
  }

  function render(graph) {
    const h = host();
    if (!h) return;
    const cs = doc().getElementById('custom-svg');
    if (!window.logoAnsicht) {
      h.style.display = 'none';
      if (cs) cs.style.visibility = window.fbsFupMode ? 'hidden' : '';
      return;
    }
    h.style.display = 'block';
    if (cs) cs.style.visibility = 'hidden';
    const leiste = doc().getElementById('logo-leiste');
    if (leiste) leiste.innerHTML = leisteInnen(); // Sprache kann gewechselt haben
    const svg = doc().getElementById('logo-svg');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    try { modell = Logo.abbilden(graph || null, {}); } catch (e) { console.warn('LOGO!', e); modell = null; }
    layout = { wires: [] };
    const passt = doc().getElementById('logo-passt');
    const fuss = doc().getElementById('logo-fuss');
    if (!modell || !modell.schritte.length) {
      passt.innerHTML = '';
      fuss.innerHTML = '';
      svg.setAttribute('width', 500); svg.setAttribute('height', 60);
      txt(svg, 20, 34, T('Kein Programm – im Code-Editor eine Zuweisung schreiben, z. B. LAMPE := TASTER'), { fill: '#666' });
      return;
    }
    const liste = doc().getElementById('logo-liste');
    if (liste) liste.innerHTML = listeAn ? listeHtml(modell) : '';
    passt.innerHTML = passtHtml(modell);
    passt.querySelectorAll('[data-logo-zeile]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); zeileZeigen(+a.getAttribute('data-logo-zeile')); }));
    fuss.innerHTML = modell.fussnoten.map((f, i) => '<div style="margin-top:3px;"><sup>' + (i + 1) + '</sup> ' + esc(f) + '</div>').join('');
    const straenge = baeume(modell);
    let lang = 0;
    const sammle = (it) => { if (it.kind === 'op') { lang = Math.max(lang, it.text.length, (it.sub || '').length * 0.8); return; } it.ins.forEach(i => sammle(i.child)); };
    let maxW = 0;
    straenge.forEach(s => { messen(s.baum); sammle(s.baum); maxW = Math.max(maxW, breite(s.baum)); });
    const ctx = { wires: layout.wires, left: 14, opW: Math.max(OPW_MIN, Math.ceil(lang * ZW + 20)) };
    const rechts = ctx.left + ctx.opW + maxW + 40;
    let y = 10, langZiel = 0;
    straenge.forEach(s => { langZiel = Math.max(langZiel, String(s.name || '').length); });
    straenge.forEach(s => {
      const g = el('g', { 'data-logo-strang': s.klemme }, svg);
      const c = s.baum;
      const top = y + (c.kind === 'box' ? 8 : 4);
      const ay = top + c.outY;
      // Klemme am rechten Rand (wie der Ausgangsblock in LOGO!Soft)
      const kw = 40, kh = 24;
      el('rect', { x: rechts, y: ay - kh / 2, width: kw, height: kh, fill: /^M|^AM/.test(s.klemme) ? '#fff8e1' : '#e8f5e9', stroke: '#111', 'stroke-width': 1.6, rx: 3 }, g);
      txt(g, rechts + kw / 2, ay + 5, s.klemme, { anchor: 'middle', bold: true, mono: true, size: 12 });
      txt(g, rechts + kw + 6, ay + 4, s.name, { mono: true, size: 11, fill: '#37474f' });
      if (c.kind === 'box') {
        zeichnen(g, c, top, rechts - 20 - GAP, ctx);
        const ln = el('line', { x1: rechts - 20 - GAP, y1: ay, x2: rechts, y2: ay, stroke: '#111', 'stroke-width': 1.6 }, g);
        layout.wires.push({ el: ln, ref: s.ref });
      } else zeichnen(g, c, top, rechts, ctx);
      y = top + c.h + 16;
      el('line', { x1: 8, y1: y - 8, x2: rechts + kw + 20 + langZiel * 7, y2: y - 8, stroke: '#eceff1', 'stroke-width': 1 }, g);
    });
    const w = Math.ceil(Math.max(rechts + 60 + langZiel * 7.5, 400)), hh = y + 10;
    svg.setAttribute('width', w); svg.setAttribute('height', hh);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hh);
    svg.style.maxWidth = 'none';
    groesse = { w, h: hh };
    zoomAnwenden();
    live();
  }

  // ---------- Bausteinliste und Druck ----------
  const LS_LISTE = 'valisLogoListe';
  let listeAn = true;
  try { listeAn = localStorage.getItem(LS_LISTE) !== '0'; } catch (_) {}
  function listeHtml(m) {
    const z = Logo.zeilen(m);
    if (!z.length) return '';
    return '<h4 style="margin:10px 0 4px; font-size:13px;">' + T('Bausteinliste zum Abtippen in LOGO!Soft Comfort') + '</h4>' +
      '<div data-logo-liste style="font:12px Consolas, monospace; line-height:1.6; background:#f5f7f8; border:1px solid #cfd8dc; border-radius:3px; padding:6px 10px;">' +
      z.map(x => '<div>' + esc(x.text) + (x.b && x.b.fussnote ? ' <sup style="color:#bf360c;">' + x.b.fussnote + '</sup>' : '') + '</div>').join('') + '</div>';
  }
  window._logoListeZeigen = function (an_) {
    listeAn = an_ === undefined ? !listeAn : !!an_;
    try { localStorage.setItem(LS_LISTE, listeAn ? '1' : '0'); } catch (_) {}
    window._logoNeu();
  };
  // Ein Blatt: Passt-Prüfung, Bausteinliste, Zuordnungsliste mit LOGO!-Klemmen, Fußnoten
  window._logoDruckHtml = function () {
    const m = Logo.aktuell();
    const zl = (typeof window._spsZuordnungData === 'function') ? window._spsZuordnungData() : { inputs: [], outputs: [], merker: [] };
    const p = m.passt;
    const kopf = p.stufe === 'grund' ? T('Passt auf ein LOGO! 8 Grundgerät') : p.stufe === 'erweiterung' ? T('Passt auf eine LOGO! 8 mit Erweiterungsmodul') : T('Passt so nicht auf eine LOGO! 8');
    const zeilen = (rows) => rows.map(r => '<tr><td class="m"><b>' + esc(r.logo || '–') + '</b></td><td class="m">' + esc(r.name) + '</td><td class="m">' + esc(r.kz || '–') + '</td><td class="m">' + esc(r.addr) + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.comment) + '</td></tr>').join('');
    const tab = (titel, rows) => !rows.length ? '' : '<h3>' + esc(titel) + '</h3><table><thead><tr><th>' + T('LOGO!-Klemme') + '</th><th>' + T('Variable') + '</th><th>' + T('Kennzeichen') + '</th><th>' + T('SPS-Adresse') + '</th><th>' + T('Bauteil') + '</th><th>' + T('Kommentar') + '</th></tr></thead><tbody>' + zeilen(rows) + '</tbody></table>';
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + T('LOGO!-Programm') + '</title><style>' +
      "body{font:12px 'Segoe UI',Arial,sans-serif;color:#000;margin:14mm 12mm}h1{font-size:17px;margin:0 0 4px}h2{font-size:14px;margin:14px 0 4px}h3{font-size:12px;margin:10px 0 3px}" +
      'table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:2px 6px;text-align:left;vertical-align:top}th{background:#eee}td.m{font-family:Consolas,monospace;white-space:nowrap}' +
      '.liste div{font-family:Consolas,monospace;padding:1px 0}.passt{border-left:4px solid #555;padding:3px 8px;margin:6px 0}.fuss{font-size:10.5px;color:#333;margin-top:10px}' +
      '</style></head><body><h1>' + T('LOGO!-Programm (Maßstab LOGO! 8)') + '</h1>' +
      '<div class="passt"><b>' + esc(kopf) + '</b>' + (p.erweiterung.length ? '<br>' + p.erweiterung.map(esc).join(' · ') : '') +
      (p.gruende.length ? '<ul style="margin:3px 0 0;padding-left:16px;">' + p.gruende.map(g => '<li>' + esc(g.text) + (g.zeile != null ? ' (' + T('Zeile') + ' ' + (g.zeile + 1) + ')' : '') + '</li>').join('') + '</ul>' : '') + '</div>' +
      '<h2>' + T('Bausteinliste') + '</h2><div class="liste">' + Logo.zeilen(m).map(x => '<div>' + esc(x.text) + (x.b && x.b.fussnote ? ' <sup>' + x.b.fussnote + '</sup>' : '') + '</div>').join('') + '</div>' +
      '<h2>' + T('Zuordnungsliste mit LOGO!-Klemmen') + '</h2>' + tab(T('Eingänge'), zl.inputs) + tab(T('Ausgänge'), zl.outputs) + tab(T('Merker'), zl.merker) +
      (m.fussnoten.length ? '<div class="fuss">' + m.fussnoten.map((f, i) => '<div><sup>' + (i + 1) + '</sup> ' + esc(f) + '</div>').join('') + '</div>' : '') +
      '<div class="fuss">' + T('Erstellt mit VALIS. Das Programm in LOGO!Soft Comfort von Hand eingeben; VALIS lädt nichts direkt in die LOGO!.') + '</div>';
  };
  window._logoDrucken = function () {
    const w = window.open('', '_blank');
    if (!w) { alert(T('Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.')); return; }
    w.document.open(); w.document.write(window._logoDruckHtml() + '<script>window.onload=function(){window.print();}<\/script></body></html>'); w.document.close();
  };

  // ---------- Live-Werte aus dem VALIS-Zustand ----------
  function wertVon(ref, tiefe) {
    const st = (typeof spsState !== 'undefined') ? spsState : {}; // eslint-disable-line no-undef
    const tm = window.simTimers || {};
    if (!ref) return false;
    if (ref.art === 'c') return ref.k === 'hi';
    if (ref.art === 'k') return st[ref.name];
    const b = ref.b;
    if (!b || tiefe > 30) return false;
    const ein = (pin) => { const e = b.ein.find(x => x.pin === pin); return e ? wertVon(e.ref, tiefe + 1) : 0; };
    const bits = () => b.ein.map(e => { const v = !!wertVon(e.ref, tiefe + 1); return e.neg ? !v : v; });
    switch (b.typ) {
      case 'AND': return bits().every(Boolean);
      case 'OR': return bits().some(Boolean);
      case 'NOT': return !bits()[0];
      case 'CTU': if (b.start != null) return !(tm[b.src] && tm[b.src].q); return !!(tm[b.src] && tm[b.src].q); // CTD: Zähler-Q ist das Gegenteil
      case 'TON': case 'TOF': case 'TONOF': case 'BSZ': case 'TP': case 'ANDF': case 'NANDF': return !!(tm[b.src] && tm[b.src].q);
      case 'SHR': return !!st[b.src];
      case 'ASW': case 'AKOMP': {
        const x = (+ein('Ax') || 0) - (b.typ === 'AKOMP' ? (+ein('Ay') || 0) : 0);
        if (b.ein_ !== b.aus_) { const z = tm['ZP_' + b.src]; return z ? (b.ein_ > b.aus_ && z.ein < z.aus ? !z.q : !!z.q) : x > b.ein_; }
        return x > b.ein_;
      }
      default: return st[b.src];
    }
  }
  function live() {
    if (!layout || !window.logoAnsicht) return;
    const aktiv = (typeof isSimulationActive !== 'undefined') && isSimulationActive; // eslint-disable-line no-undef
    layout.wires.forEach(w => {
      if (!aktiv) { w.el.setAttribute('stroke', '#111'); w.el.removeAttribute('stroke-dasharray'); w.el.setAttribute('stroke-width', 1.6); return; }
      let v = false;
      try { v = wertVon(w.ref, 0); } catch (_) {}
      const on = typeof v === 'number' ? v !== 0 : !!v;
      w.el.setAttribute('stroke', on ? '#2e7d32' : '#1565c0');
      if (on) w.el.removeAttribute('stroke-dasharray'); else w.el.setAttribute('stroke-dasharray', '5,3');
      w.el.setAttribute('stroke-width', on ? 2.4 : 1.6);
    });
  }

  // ---------- Zoom ----------
  function zoomAnwenden() {
    const svg = doc().getElementById('logo-svg');
    if (!svg || !groesse) return;
    svg.style.width = (groesse.w * zoom) + 'px';
    svg.style.height = (groesse.h * zoom) + 'px';
    const a = doc().getElementById('logo-zoom-anzeige');
    if (a) a.textContent = Math.round(zoom * 100) + ' %';
  }
  window._logoZoom = function (f) { zoom = f === 0 ? 1 : Math.max(0.2, Math.min(4, zoom * f)); zoomAnwenden(); };
  function zoomBinden(h) {
    h.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.altKey && Math.abs(e.deltaY) < 1) return; e.preventDefault(); window._logoZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  }

  // ---------- Schalter und Export ----------
  function knopf() {
    const b = doc().getElementById('btn-fbs-logo');
    if (!b) return;
    b.textContent = window.logoAnsicht ? '🟩 LOGO!: AN' : '🟩 LOGO!: AUS';
    b.style.backgroundColor = window.logoAnsicht ? '#2e7d32' : '#455a64';
  }
  window._toggleLogoAnsicht = function (an_) {
    window.logoAnsicht = an_ === undefined ? !window.logoAnsicht : !!an_;
    try { localStorage.setItem(LS_AN, window.logoAnsicht ? '1' : '0'); } catch (_) {}
    knopf();
    render(typeof currentGraph !== 'undefined' ? currentGraph : null); // eslint-disable-line no-undef
  };
  // ?ansicht=logo (z. B. aus einer Seite von t-bk.de): Logikplan zeigen, LOGO!-Ansicht an
  (function () {
    let q = null;
    try { q = new URLSearchParams(location.search); } catch (_) { return; }
    if (!q || q.get('ansicht') !== 'logo') return;
    const los = () => setTimeout(() => {
      const fbs = document.getElementById('fbs-wrapper');
      if (fbs && fbs.style.display === 'none' && typeof window.toggleWorkspaceView === 'function') {
        try { window.toggleWorkspaceView('fbs-wrapper'); } catch (_) {}
      }
      window._toggleLogoAnsicht(true);
    }, 1500);
    if (document.readyState === 'complete') los();
    else window.addEventListener('load', los);
  })();
  window._logoSvg = function () {
    const svg = doc().getElementById('logo-svg');
    if (!svg) return;
    const c = svg.cloneNode(true);
    c.setAttribute('xmlns', NS);
    c.removeAttribute('style');
    const bg = doc().createElementNS(NS, 'rect');
    bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
    c.insertBefore(bg, c.firstChild);
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'VALIS_LOGO.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  window._logoRender = render;
  window._logoLive = live;
  window._logoModell = () => modell;
  window._logoNeu = () => render(typeof currentGraph !== 'undefined' ? currentGraph : null); // eslint-disable-line no-undef
  function init() { knopf(); if (window.logoAnsicht) window._logoNeu(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
