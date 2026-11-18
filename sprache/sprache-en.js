// =====================================================================
// VALIS – englische Oberfläche (Übersetzungsschicht)
// =====================================================================
// VALIS ist auf Deutsch geschrieben. Im englischen Modus (window.currentLang
// === 'en') ersetzt diese Schicht deutsche Texte durch englische, ohne dass
// jede Stelle im Code eine eigene Übersetzung braucht:
//   * Textknoten und die Attribute title / placeholder / aria-label / alt
//     (auch in später eingefügten Teilen, über einen MutationObserver),
//   * ganze Absätze mit Auszeichnung (z. B. "Die <b>Lampe</b> leuchtet"),
//     wenn ihr innerHTML als Ganzes im Wörterbuch steht,
//   * alert / confirm / prompt und Text, der auf ein Canvas gezeichnet wird.
// Die Wörter stehen in sprache/en-*.js (VALIS_EN.dazu({...})). Schlüssel ist
// der deutsche Text mit zusammengefassten Leerzeichen. Fehlt ein Eintrag,
// bleibt der deutsche Text stehen; pruefungen/englisch-pruefung.js findet ihn.
// Zurück auf Deutsch stellt die Schicht alle ersetzten Texte wieder her.
(function () {
  'use strict';
  const TEXT = new Map();      // deutscher Text -> englischer Text
  const HTML = new Map();      // deutsches innerHTML eines Absatzes -> englisches
  const MUSTER = [];           // [RegExp, Ersatz] für Texte mit Zahlen/Namen
  const VORLAGEN = [];         // {re, nrn, en, anker} aus Texten mit Platzhaltern
  const CACHE = new Map();
  const KERN = new Map();
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  // Auszeichnung vereinheitlichen, damit innerHTML aus dem Browser und aus
  // dem Wörterbuch gleich aussieht (Attribute bleiben, Leerraum nicht)
  const normHtml = s => norm(String(s).replace(/>\s+</g, '><'));

  // Präfix (Emoji, Pfeil, Aufzählung) und Endzeichen abtrennen
  const RAND = /^([^A-Za-zÄÖÜäöüß0-9(„"'[]*)(.*?)([\s:.…!?)\]"“•·]*)$/s;
  const EN = window.VALIS_EN = {
    dazu(woerter) {
      for (const k in woerter) {
        const v = woerter[k];
        if (/<[a-z][^>]*>/i.test(k)) HTML.set(normHtml(k), v);
        // Tooltips mit spitzen Klammern (z. B. X<n>) sind kein HTML
        if (/<[a-z][^>]*>/i.test(k) && k.indexOf('</') >= 0) continue;
        {
          TEXT.set(norm(k), v);
          // Kern ohne Icon/Satzzeichen, für Texte, die ein anderes Skript zerlegt
          const a = RAND.exec(norm(k)), b = RAND.exec(norm(v));
          if (a && b && (a[1] || a[3])) { const ka = a[2].trim(), kb = b[2].trim(); if (ka && kb && !KERN.has(ka)) KERN.set(ka, kb); }
        }
      }
    },
    muster(liste) { for (const [re, ers] of liste) MUSTER.push([re, ers]); },
    // Texte mit eingesetzten Werten: "Kabel ⟦0⟧ → ⟦1⟧" -> "Cable ⟦0⟧ → ⟦1⟧"
    vorlagen(woerter) {
      for (const k in woerter) {
        const teile = norm(k).split(/\u27E6(\d+)\u27E7/);
        // teile: [text, nr, text, nr, text ...]
        let re = '^', nrn = [], anker = '';
        for (let i = 0; i < teile.length; i++) {
          if (i % 2) { re += '([\\s\\S]*?)'; nrn.push(+teile[i]); }
          else { re += teile[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (teile[i].trim().length > anker.length) anker = teile[i].trim(); }
        }
        if (anker.length < 4) continue;
        const en = woerter[k];
        VORLAGEN.push({ re: new RegExp(re + '$'), nrn, en, anker });
      }
    },
    an: () => window.currentLang === 'en',
    // Übersetzt einen Text (oder gibt ihn unverändert zurück)
    t(s) {
      if (s == null) return s;
      const roh = String(s);
      if (!/[A-Za-zÄÖÜäöüß]/.test(roh)) return roh;
      const k = norm(roh);
      const v = uebersetze(k);
      if (v === null) return roh;
      // Leerraum am Rand des Originals erhalten
      const vorn = roh.match(/^\s*/)[0], hinten = roh.match(/\s*$/)[0];
      return vorn + v + hinten;
    },
    stats: () => ({ text: TEXT.size, html: HTML.size, muster: MUSTER.length, vorlagen: VORLAGEN.length }),
    _TEXT: TEXT, _HTML: HTML
  };

  function uebersetze(k) {
    if (TEXT.has(k)) return TEXT.get(k);
    if (CACHE.has(k)) return CACHE.get(k);
    const v = uebersetze2(k);
    if (CACHE.size > 20000) CACHE.clear();
    CACHE.set(k, v);
    return v;
  }
  function vorlage(k) {
    for (const v of VORLAGEN) {
      if (k.indexOf(v.anker) < 0) continue;
      const m = v.re.exec(k);
      if (!m) continue;
      const werte = {};
      let passt = true;
      v.nrn.forEach((nr, i) => {
        const w = m[i + 1]; const t = TEXT.get(norm(w));
        // Ein eingesetzter Wert ist eine Zahl, ein Name oder ein kurzes Wort.
        // Ganze deutsche Satzteile heißen: die Vorlage passt nur zufällig.
        if (t === undefined && (w.length > 40 || norm(w).split(' ').length > 3)) passt = false;
        werte[nr] = t !== undefined ? t : w;
      });
      if (!passt) continue;
      return v.en.replace(/\u27E6(\d+)\u27E7/g, (_, nr) => werte[nr] !== undefined ? werte[nr] : '');
    }
    return null;
  }
  function uebersetze2(k) {
    if (KERN.has(k)) return KERN.get(k);
    const vl = vorlage(k);
    if (vl !== null) return vl;
    for (const [re, ers] of MUSTER) {
      re.lastIndex = 0;
      if (re.test(k)) { re.lastIndex = 0; return k.replace(re, typeof ers === 'function' ? (...a) => ers(...a) : ers); }
    }
    const m = RAND.exec(k);
    if (m && (m[1] || m[3])) {
      const kern = m[2].trim();
      if (kern && kern !== k) {
        const v = TEXT.has(kern) ? TEXT.get(kern) : KERN.has(kern) ? KERN.get(kern) : (vorlage(kern) ?? musterAuf(kern));
        if (v !== null) return (m[1] || '') + v + (m[3] || '');
      }
    }
    // Mehrzeiliges (Meldungen): Zeile für Zeile
    return null;
  }
  function musterAuf(k) {
    for (const [re, ers] of MUSTER) { re.lastIndex = 0; if (re.test(k)) { re.lastIndex = 0; return k.replace(re, ers); } }
    return null;
  }
  function mehrzeilig(s) {
    if (s == null) return s;
    s = String(s);
    if (s.indexOf('\n') < 0) return EN.t(s);
    const ganz = uebersetze(norm(s));
    if (ganz !== null) return ganz;
    return s.split('\n').map(z => EN.t(z)).join('\n');
  }
  EN.mehrzeilig = mehrzeilig;

  // ---------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------
  const ATTR = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip', 'data-title'];
  const ORIG_T = new WeakMap();     // Textknoten -> deutscher Text
  const GESETZT_T = new WeakMap();  // Textknoten -> zuletzt gesetzter englischer Text
  const ORIG_H = new WeakMap();     // Element -> deutsches innerHTML
  const ORIG_A = new WeakMap();     // Element -> {attr: deutscher Wert}
  const BERUEHRT = new Set();       // WeakRefs auf alles Ersetzte (für den Rückweg)
  const merke = n => { try { BERUEHRT.add(new WeakRef(n)); } catch (e) {} };
  // Hier wird nichts übersetzt: Code, Eingaben, Variablen
  const AUS = 'script, style, textarea, input, pre.tut-code, .CodeMirror, [contenteditable="true"], #editor-container .highlight, #code-highlight, .no-i18n, [data-no-i18n]';
  const aus = el => !!(el && el.closest && el.closest(AUS));
  const BLOCK = new Set(['P', 'LI', 'TD', 'TH', 'DIV', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'BUTTON', 'B', 'STRONG', 'SMALL', 'DD', 'DT', 'A', 'SUMMARY', 'FIGCAPTION', 'LEGEND', 'EM', 'I', 'U', 'SUB', 'SUP', 'BLOCKQUOTE', 'CAPTION']);
  const DE = /[A-Za-zÄÖÜäöüß]{2}/;

  let selbst = false;   // eigene Änderungen nicht erneut verarbeiten

  function textKnoten(n) {
    const v = n.nodeValue;
    if (!v || !DE.test(v)) return;
    if (GESETZT_T.get(n) === v) return;
    const p = n.parentNode;
    if (!p || p.nodeType !== 1 || aus(p)) return;
    const e = (v.indexOf('\n') >= 0 && (p.closest('pre') || /^pre/.test(getComputedStyle(p).whiteSpace))) ? preZeilen(v) : EN.t(v);
    if (e === v) return;
    if (!ORIG_T.has(n) || GESETZT_T.has(n)) ORIG_T.set(n, v);
    GESETZT_T.set(n, e);
    n.nodeValue = e;
    merke(n);
  }
  // Code-Beispiele in <pre>: Zeilen bleiben, übersetzt werden Kommentare und reine Textzeilen
  function preZeilen(v, nurKommentare) {
    return v.split('\n').map(z => {
      const i = z.indexOf('//');
      if (i >= 0) {
        const m = /^(\/\/\s*)(.*?)(\s*)$/.exec(z.slice(i));
        const e = m[2] && DE.test(m[2]) ? EN.t(m[2]) : m[2];
        const vorn = z.slice(0, i), kv = vorn.trim() && !/[=:;{}(),'"]/.test(vorn) ? vorn.replace(vorn.trim(), EN.t(vorn.trim())) : vorn;
        return kv + m[1] + e + m[3];
      }
      const t = z.trim();
      if (!nurKommentare && t && TEXT.has(norm(t))) return z.replace(t, TEXT.get(norm(t)));
      const pf = z.lastIndexOf('→');
      if (!nurKommentare && pf > 0) {
        const r = z.slice(pf + 1).trim();
        if (r && DE.test(r)) return z.slice(0, pf + 1) + ' ' + EN.t(r);
      }
      if (nurKommentare || !t || !DE.test(t) || /[=;{}]|:\s*['"\d{[]/.test(t)) return z;
      return z.replace(t, EN.t(t));
    }).join('\n');
  }
  // Geladener Code (Beispiele, Aufgabenvorlagen): ganzer Text aus dem Wörterbuch,
  // sonst nur die //-Kommentare. Der Code selbst bleibt unverändert.
  EN.code = function (c) {
    if (c == null || !EN.an()) return c;
    c = String(c);
    if (!DE.test(c)) return c;
    const g = c.indexOf('\n') >= 0 ? uebersetze(norm(c)) : null;
    // Das Wörterbuch darf nur Kommentare ändern: Codezeilen müssen gleich bleiben
    const nurCode = x => x.split('\n').map(z => z.replace(/\/\/.*$/, '').trimEnd()).filter(Boolean).join('\n');
    if (g && g.indexOf('\n') >= 0 && nurCode(g) === nurCode(c)) return c.match(/^\s*/)[0] + g.trim() + c.match(/\s*$/)[0];
    return preZeilen(c, true);
  };
  function attribute(el) {
    for (const a of ATTR) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v || !DE.test(v)) continue;
      const e = mehrzeilig(v);
      if (e === v) continue;
      let o = ORIG_A.get(el); if (!o) { o = {}; ORIG_A.set(el, o); merke(el); }
      o[a] = v; o['_' + a] = e;
      el.setAttribute(a, e);
    }
  }
  // Absatz mit Auszeichnung als Ganzes?
  function absatz(el) {
    if (!HTML.size || !BLOCK.has(el.tagName)) return false;
    let text = false, kind = false;
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 && DE.test(c.nodeValue)) text = true;
      else if (c.nodeType === 1) kind = true;
    }
    if (!(text && kind)) return false;
    const h = el.innerHTML;
    if (h.length > 20000) return false;
    const k = normHtml(h);
    const e = HTML.get(k);
    if (e === undefined) return false;
    ORIG_H.set(el, h); merke(el);
    el.innerHTML = e;
    return true;
  }
  function baum(wurzel) {
    if (!wurzel) return;
    if (wurzel.nodeType === 3) { textKnoten(wurzel); return; }
    if (wurzel.nodeType !== 1 && wurzel.nodeType !== 11) return;
    if (wurzel.nodeType === 1 && aus(wurzel)) { if (/^(INPUT|TEXTAREA|SELECT)$/.test(wurzel.tagName)) attribute(wurzel); return; }
    const stapel = [wurzel];
    while (stapel.length) {
      const el = stapel.pop();
      if (el.nodeType === 1) {
        if (el !== wurzel && el.matches && el.matches(AUS)) {
          // Eingabefelder: Platzhalter und Tooltip ja, Inhalt nie
          if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) attribute(el);
          continue;
        }
        attribute(el);
        if (absatz(el)) continue;
      }
      for (let c = el.lastChild; c; c = c.previousSibling) {
        if (c.nodeType === 3) textKnoten(c);
        else if (c.nodeType === 1) stapel.push(c);
      }
      if (el.shadowRoot) stapel.push(el.shadowRoot);
    }
  }
  let offen = new Set(), geplant = false;
  function plane(n) {
    offen.add(n);
    if (geplant) return;
    geplant = true;
    Promise.resolve().then(abarbeiten);
  }
  function abarbeiten() {
    geplant = false;
    if (!EN.an()) { offen.clear(); return; }
    const liste = offen; offen = new Set();
    selbst = true;
    try { for (const n of liste) if (n.isConnected !== false) baum(n); }
    finally { selbst = false; }
  }
  const beob = new MutationObserver(ms => {
    if (selbst || !EN.an()) return;
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(plane);
      else if (m.type === 'characterData') plane(m.target);
      else if (m.type === 'attributes') {
        const el = m.target, o = ORIG_A.get(el), v = el.getAttribute(m.attributeName);
        if (o && o['_' + m.attributeName] === v) continue;
        plane(el);
      }
    }
  });
  function beobachte(doc) {
    try {
      beob.observe(doc.documentElement || doc, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
    } catch (e) {}
  }
  EN.beobachte = beobachte;   // für abgekoppelte Fenster (window.open)
  EN.anwenden = function (wurzel) {
    if (!EN.an()) return;
    selbst = true;
    try { baum(wurzel || document.body); } finally { selbst = false; }
  };
  EN.zurueck = function () {
    selbst = true;
    try {
      for (const r of BERUEHRT) {
        const n = r.deref(); if (!n) continue;
        if (n.nodeType === 3) { const o = ORIG_T.get(n); if (o !== undefined && GESETZT_T.get(n) === n.nodeValue) n.nodeValue = o; GESETZT_T.delete(n); ORIG_T.delete(n); }
        else {
          const h = ORIG_H.get(n); if (h !== undefined) { n.innerHTML = h; ORIG_H.delete(n); }
          const a = ORIG_A.get(n); if (a) { for (const k in a) if (k[0] !== '_' && n.getAttribute(k) === a['_' + k]) n.setAttribute(k, a[k]); ORIG_A.delete(n); }
        }
      }
      BERUEHRT.clear();
      // Was andere Skripte inzwischen umgebaut haben (z. B. Icons vor den
      // Text gesetzt), über das umgekehrte Wörterbuch zurückholen
      const rev = new Map();
      const kern = x => { const m = RAND.exec(x); return m ? m[2].trim() : x; };
      for (const [de, en] of TEXT) {
        if (!rev.has(norm(en))) rev.set(norm(en), de);
        const ke = kern(norm(en)), kd = kern(de);
        if (ke && kd && !rev.has(ke)) rev.set(ke, kd);
      }
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n;
      while ((n = w.nextNode())) {
        if (n.nodeType === 3) {
          const v = n.nodeValue, k = norm(v);
          if (k && rev.has(k) && n.parentNode && !aus(n.parentNode)) n.nodeValue = v.replace(k, rev.get(k));
        } else for (const a of ATTR) { const v = n.getAttribute(a); if (v && rev.has(norm(v))) n.setAttribute(a, rev.get(norm(v))); }
      }
      CACHE.clear();
    } finally { selbst = false; }
  };

  // ---------------------------------------------------------------
  // Meldungen und Canvas
  // ---------------------------------------------------------------
  const _alert = window.alert, _confirm = window.confirm, _prompt = window.prompt;
  window.alert = function (m) { return _alert.call(this, EN.an() ? mehrzeilig(m) : m); };
  window.confirm = function (m) { return _confirm.call(this, EN.an() ? mehrzeilig(m) : m); };
  window.prompt = function (m, d) { return _prompt.call(this, EN.an() ? mehrzeilig(m) : m, d); };
  try {
    const C = CanvasRenderingContext2D.prototype;
    for (const f of ['fillText', 'strokeText', 'measureText']) {
      const o = C[f];
      C[f] = function (txt, ...r) { return o.call(this, EN.an() && typeof txt === 'string' ? EN.t(txt) : txt, ...r); };
    }
  } catch (e) {}

  // Wörterbuch nur laden, wenn Englisch gebraucht wird (rund 0,5 MB)
  const WOERTER_V = '081befcf';
  const pfad = (function () {
    const sc = document.currentScript && document.currentScript.src;
    return sc ? sc.replace(/sprache-en\.js.*$/, '') : 'sprache/';
  })();
  let geladen = false, laedt = null;
  EN.laden = function () {
    if (geladen) return Promise.resolve();
    if (laedt) return laedt;
    laedt = new Promise(res => {
      const sc = document.createElement('script');
      sc.src = pfad + 'en-woerter.js?v=' + WOERTER_V;
      sc.onload = sc.onerror = () => { geladen = true; res(); };
      document.head.appendChild(sc);
    });
    return laedt;
  };
  (function () {
    let lang = null;
    try { lang = localStorage.getItem('valisLang'); } catch (e) {}
    if (!lang) lang = String(navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en';
    if (lang === 'en' && document.readyState === 'loading') {
      document.write('<script src="' + pfad + 'en-woerter.js?v=' + WOERTER_V + '"><\/script>');
      geladen = true;
    }
  })();

  function start() {
    beobachte(document);
    if (EN.an()) EN.anwenden(document.documentElement);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  // Sprachwechsel: index.html ruft VALIS_EN.sprache(lang) aus switchLanguage
  EN.sprache = function (lang) {
    if (lang === 'en') EN.laden().then(() => EN.anwenden(document.documentElement));
    else EN.zurueck();
  };
})();
