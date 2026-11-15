/* =====================================================================
 * VALIS – Elektrisch messen (virtuelles Multimeter) und elektrische
 * Fehlersuche
 * ---------------------------------------------------------------------
 * Messen wie an der Aufbauwand: Im Steckaufbau und im Auto-Schaltplan
 * misst ein Multimeter
 *   • Spannung gegen 0 V (rote Spitze an den Messpunkt, COM auf 0 V)
 *     bei eingeschalteter Anlage (Simulation läuft),
 *   • Widerstand und Durchgang (Summer) zwischen zwei Punkten bei
 *     ausgeschalteter Anlage.
 * Beide Sichten messen an derselben Schaltung: dem elektrischen Modell
 * des Steckaufbaus (window._elSteckModell in index.html). Ein Punkt im
 * Schaltplan ist die Buchse, auf der der Anschluss im Steckaufbau liegt.
 *
 * Fehlersuche: Die Lehrkraft baut versteckte Fehler ein (Ader gebrochen,
 * Kontakt abgebrannt oder verschweißt, Spule unterbrochen, Sensor
 * defekt). Die Fehler wirken auf die Simulation: Eine Spule, die wegen
 * eines Fehlers keinen Strom bekommt, zieht nicht an, auch wenn die
 * Logik sie einschaltet. Lernende messen, melden ihren Befund und
 * prüfen ihn. Gespeichert mit der Anlage (getFactoryStateObj →
 * `elFehler`), Aufgaben-Bedingung `el_fehler`.
 *
 * Rechenmodell: Kabel und geschlossene Kontakte sind ideale Leiter
 * (Union-Find), Verbraucher Widerstände. Bei eingeschalteter Anlage
 * liegen +24 V und 0 V fest, die übrigen Knoten folgen aus der Knoten-
 * analyse (G · U = I). Ein Knoten ohne Verbindung zu einer Schiene liegt
 * frei; das Messgerät zeigt dort 0 V (sein Innenwiderstand zieht ihn
 * auf COM). Widerstand: Anlage spannungsfrei, alle Relais abgefallen,
 * 1 A in die rote Spitze, COM auf 0 V, R = U.
 * ===================================================================== */
(function () {
    'use strict';
    if (window.ElMessen) return;
    const NS = 'http://www.w3.org/2000/svg';

    // Widerstände der Verbraucher (Ω), Nennspannung 24 V
    const R_LAST = { relais: 480, zeit: 1200, zaehler: 1200, ventil: 380, led: 2200, hupe: 1000, sps_ein: 4700 };
    const R_SENSOR = 4700;          // Eigenverbrauch eines 3-Leiter-Sensors
    const U_FEST = { P: 24, M: 0, L1: 230, N: 0 };
    const LAST_NAME = { relais: 'Relaisspule', zeit: 'Zeitrelais-Spule', zaehler: 'Zählereingang', ventil: 'Magnetspule', led: 'Leuchtmelder', hupe: 'Hörmelder', sps_ein: 'SPS-Eingang' };
    const FEHLER = {
        kabel: [['ab', 'Ader im Kabel gebrochen (kein Durchgang)']],
        kontakt: [['offen', 'Kontakt abgebrannt (schließt nicht)'], ['klebt', 'Kontakt verschweißt (öffnet nicht)']],
        last: [['offen', 'unterbrochen (kein Durchgang)']],
        sensor: [['defekt', 'Sensor defekt (schaltet nicht)']],
        sps_aus: [['offen', 'SPS-Ausgang defekt (schaltet nicht durch)'], ['klebt', 'SPS-Ausgang durchlegiert (immer 24 V)']],
        sps_ein: [['offen', 'SPS-Eingang defekt (erkennt kein Signal)']]
    };
    const fehlerListe = e => !e ? FEHLER.kabel : (e.sem === 'sps_aus' ? FEHLER.sps_aus : e.last === 'sps_ein' ? FEHLER.sps_ein : FEHLER[e.art] || []);
    // Ausgänge der SPS schalten, was das Programm sagt, auch wenn ein Fehler
    // dahinter die Spule stromlos lässt (Wert vor dem Eingriff)
    let logik = null;

    const sps = () => { try { return spsState; } catch (e) { return window.spsState || {}; } };
    const simAn = () => { try { return !!isSimulationActive; } catch (e) { return false; } };
    const eingaenge = () => { try { return Array.isArray(globalInputs) ? globalInputs : []; } catch (e) { return []; } };
    const ctypVon = v => { try { return (componentTypes && componentTypes[v]) || ''; } catch (e) { return ''; } };
    const komma = x => String(x).replace('.', window.currentLang === 'en' ? '.' : ',');

    // ------------------------------------------------------------
    // Modell (aus index.html), zwischengespeichert bis sich der Schaltplan
    // oder der freie Aufbau ändert
    // ------------------------------------------------------------
    let cache = null, cacheVer = null;
    function modell() {
        const ver = [window._elVersion || 0, !!window.festoFreeBuildMode, !!window.epneuMode, !!window._iecAnschlussView, !!window.configDualCircuit].join('|');
        if (cache !== undefined && cacheVer === ver) return cache;
        cacheVer = ver;
        try { cache = window._elSteckModell ? window._elSteckModell() : null; } catch (e) { console.warn('Elektrik-Modell', e); cache = null; }
        if (cache) cache.nachId = new Map(cache.elemente.map(e => [e.id, e]));
        return cache;
    }

    // ------------------------------------------------------------
    // Fehler (versteckt) und Befund
    // ------------------------------------------------------------
    let F = leer();
    function leer() { return { fehler: {}, fehlersuche: false, verdacht: [], behoben: [], fehlversuche: 0 }; }
    const fehlerVon = k => F.fehler[k] || null;
    const fehlerAktiv = k => { const f = F.fehler[k]; return f && !F.behoben.includes(k) ? f : null; };
    function gibtEs(m, k) {
        if (!m) return false;
        if (k.startsWith('K:')) return m.kabel.some(c => c.id === k.slice(2));
        return m.nachId.has(k.slice(2));
    }
    const fehlerKeys = () => { const m = modell(); return Object.keys(F.fehler).filter(k => gibtEs(m, k)); };
    const hatAktiveFehler = () => Object.keys(F.fehler).some(k => fehlerAktiv(k));
    function fehlerGefunden() {
        const ks = fehlerKeys();
        return ks.length > 0 && ks.every(k => F.behoben.includes(k));
    }

    // ------------------------------------------------------------
    // Rechnen
    // ------------------------------------------------------------
    // Kontakt geschlossen? sem 'taster': Wechsler der Signaleingabe (betätigt
    // nach Variablen-Semantik, auch bei ausgeschalteter Anlage von Hand),
    // 'roh': freier Aufbau (wie dort der Stromfluss), 'relais': Relais- und
    // Zeitrelaiskontakt (abgefallen, solange keine Spannung anliegt).
    function geschlossen(e, s, an, f) {
        if (f === 'klebt') return true;
        if (f === 'offen') return false;
        const sig = !!(e.v && s[e.v]);
        let betaetigt = false;
        if (e.sem === 'taster') {
            const inv = typeof window._variableIsNCInverted === 'function' ? window._variableIsNCInverted(ctypVon(e.v) || 'taster') : false;
            betaetigt = e.v ? (inv ? !sig : sig) : false;
        } else if (e.sem === 'roh') betaetigt = sig;
        else if (e.sem === 'relais') betaetigt = an && sig;
        else if (e.sem === 'sps_aus') betaetigt = an && !!(logik && e.v in logik ? logik[e.v] : sig);
        return e.nc ? !betaetigt : betaetigt;
    }
    // Lineares Gleichungssystem (Gauß mit Spaltenpivot), klein
    function loese(A, b) {
        const n = b.length;
        for (let i = 0; i < n; i++) {
            let p = i;
            for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
            if (Math.abs(A[p][i]) < 1e-15) continue;
            if (p !== i) { [A[p], A[i]] = [A[i], A[p]]; [b[p], b[i]] = [b[i], b[p]]; }
            for (let r = i + 1; r < n; r++) {
                const f = A[r][i] / A[i][i]; if (!f) continue;
                for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
                b[r] -= f * b[i];
            }
        }
        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            let s = b[i];
            for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
            x[i] = Math.abs(A[i][i]) < 1e-15 ? 0 : s / A[i][i];
        }
        return x;
    }
    // Netz bauen: Knoten (Union-Find) und Lasten zwischen Knoten
    function netz(m, opt, sensorZu) {
        const s = opt.s || sps(), an = !!opt.an;
        const fa = k => opt.fehler ? fehlerAktiv(k) : null;
        const par = new Map();
        const find = x => { if (!par.has(x)) par.set(x, x); let r = x; while (par.get(r) !== r) r = par.get(r); while (par.get(x) !== r) { const n = par.get(x); par.set(x, r); x = n; } return r; };
        const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
        const knoten = k => { const r = m.schiene(k); return r ? '#' + r : k; };
        ['#P', '#M', '#L1', '#N'].forEach(find);
        for (const c of m.kabel) {
            const a = knoten(c.a), b = knoten(c.b);
            find(a); find(b);
            if (fa('K:' + c.id) !== 'ab') uni(a, b);
        }
        for (const [a, b] of m.intern) uni(knoten(a), knoten(b));
        for (const k of m.masse) uni(knoten(k), (m.schiene(k) === 'N' || (window.configDualCircuit && /^[LM]\d+_/.test(k))) ? '#N' : '#M');
        const lasten = [];
        for (const e of m.elemente) {
            const a = knoten(e.a), b = knoten(e.b); find(a); find(b);
            const f = fa('E:' + e.id);
            if (e.art === 'kontakt') { if (geschlossen(e, s, an, f)) uni(a, b); }
            else if (e.art === 'last') { if (f !== 'offen') lasten.push({ a, b, g: 1 / (R_LAST[e.last] || 1000), e }); }
            else if (e.art === 'sensor') {
                if (e.c) { const c = knoten(e.c); find(c); if (an) lasten.push({ a, b: c, g: 1 / R_SENSOR, e, versorgung: true }); }
                if (sensorZu && sensorZu.has(e.id)) uni(a, b);
            }
        }
        return { find, knoten, lasten, s, an };
    }
    // Spannungen aller Knoten bei eingeschalteter Anlage (bzw. alles 0 V, wenn aus)
    function spannungen(m, opt) {
        const bau = zu => {
            const N = netz(m, opt, zu);
            const fest = new Map();
            if (N.an) for (const r of ['P', 'M', 'L1', 'N']) { const g = N.find('#' + r); if (!fest.has(g)) fest.set(g, U_FEST[r]); }
            const kurz = N.an && (N.find('#P') === N.find('#M') || N.find('#L1') === N.find('#N') || N.find('#P') === N.find('#N') || N.find('#L1') === N.find('#M'));
            const U = new Map();
            if (N.an && !kurz) {
                // Knoten, die über Lasten an einer Schiene hängen
                const nb = new Map();
                const add = (x, y, l) => { if (!nb.has(x)) nb.set(x, []); nb.get(x).push([y, l]); };
                const L = N.lasten.map(l => ({ a: N.find(l.a), b: N.find(l.b), g: l.g, e: l.e })).filter(l => l.a !== l.b);
                L.forEach(l => { add(l.a, l.b, l); add(l.b, l.a, l); });
                const erreicht = new Set(fest.keys()), offen = Array.from(fest.keys());
                while (offen.length) { const x = offen.pop(); for (const [y] of (nb.get(x) || [])) if (!erreicht.has(y)) { erreicht.add(y); offen.push(y); } }
                const unb = Array.from(erreicht).filter(g => !fest.has(g));
                const idx = new Map(unb.map((g, i) => [g, i]));
                const A = unb.map(() => new Array(unb.length).fill(0)), b = new Array(unb.length).fill(0);
                for (const l of L) {
                    for (const [x, y] of [[l.a, l.b], [l.b, l.a]]) {
                        if (!idx.has(x)) continue;
                        const i = idx.get(x);
                        A[i][i] += l.g;
                        if (idx.has(y)) A[i][idx.get(y)] -= l.g;
                        else if (fest.has(y)) b[i] += l.g * fest.get(y);
                    }
                }
                const x = unb.length ? loese(A, b) : [];
                fest.forEach((u, g) => U.set(g, u));
                unb.forEach((g, i) => U.set(g, x[i]));
            }
            return { N, U, kurz };
        };
        // Zweiter Durchgang: versorgte, betätigte Sensoren schalten Q auf +24 V
        let r = bau(null);
        if (r.N.an && !r.kurz) {
            const zu = new Set();
            for (const e of m.elemente) {
                if (e.art !== 'sensor' || !e.v || !r.N.s[e.v]) continue;
                if (opt.fehler && fehlerAktiv('E:' + e.id) === 'defekt') continue;
                const ua = r.U.get(r.N.find(r.N.knoten(e.a))), uc = e.c ? r.U.get(r.N.find(r.N.knoten(e.c))) : 0;
                if (ua != null && uc != null && ua - uc >= 18) zu.add(e.id);
            }
            if (zu.size) r = bau(zu);
        }
        const { N, U, kurz } = r;
        const u = k => { const g = N.find(N.knoten(k)); return U.has(g) ? U.get(g) : null; };
        return {
            kurz, an: N.an,
            u,                       // null = Knoten liegt frei
            gleich: (a, b) => N.find(N.knoten(a)) === N.find(N.knoten(b)),
            bestromt: e => { const a = u(e.a), b = u(e.b); if (a == null || b == null) return false; if (opt.fehler && fehlerAktiv('E:' + e.id) === 'offen') return false; return Math.abs(a - b) >= 12; }
        };
    }
    // Widerstand zwischen zwei Punkten bei ausgeschalteter Anlage (Ω, Infinity = kein Durchgang)
    function widerstand(m, a, b, opt) {
        const N = netz(m, Object.assign({}, opt, { an: false }), null);
        const ga = N.find(N.knoten(a)), gb = N.find(N.knoten(b));
        if (ga === gb) return 0;
        const nb = new Map();
        const L = N.lasten.filter(l => !l.versorgung).map(l => ({ a: N.find(l.a), b: N.find(l.b), g: l.g })).filter(l => l.a !== l.b);
        L.forEach(l => { (nb.get(l.a) || nb.set(l.a, []).get(l.a)).push(l.b); (nb.get(l.b) || nb.set(l.b, []).get(l.b)).push(l.a); });
        const kom = new Set([ga]), offen = [ga];
        while (offen.length) { const x = offen.pop(); for (const y of (nb.get(x) || [])) if (!kom.has(y)) { kom.add(y); offen.push(y); } }
        if (!kom.has(gb)) return Infinity;
        const unb = Array.from(kom).filter(g => g !== gb);
        const idx = new Map(unb.map((g, i) => [g, i]));
        const A = unb.map(() => new Array(unb.length).fill(0)), rhs = new Array(unb.length).fill(0);
        for (const l of L) {
            if (!kom.has(l.a)) continue;
            for (const [x, y] of [[l.a, l.b], [l.b, l.a]]) {
                if (!idx.has(x)) continue;
                const i = idx.get(x);
                A[i][i] += l.g;
                if (idx.has(y)) A[i][idx.get(y)] -= l.g;
            }
        }
        rhs[idx.get(ga)] = 1;
        const x = loese(A, rhs);
        return x[idx.get(ga)];
    }

    // ------------------------------------------------------------
    // Fehler wirken auf die Simulation
    // ------------------------------------------------------------
    // Zuerst ohne Fehler im Zustand, den die Logik gerechnet hat: Nur Spulen,
    // bei denen das Modell dasselbe sagt wie die Logik, steuert danach die
    // Elektrik (so wirken Unschärfen des Modells nie). Dann mit Fehlern bis
    // zum Stillstand rechnen, damit Relaisketten (KF1 schaltet KF2 …) im
    // selben Zyklus folgen.
    function eingreifen(s, vorLogik) {
        if (!simAn() || !hatAktiveFehler()) { logik = null; return; }
        const m = modell(); if (!m) { logik = null; return; }
        const ein = new Set(eingaenge());
        if (!vorLogik) { logik = {}; m.elemente.forEach(e => { if (e.sem === 'sps_aus' && e.v) logik[e.v] = !!s[e.v]; }); }
        const ohne = spannungen(m, { an: true, fehler: false, s });
        const spulen = m.elemente.filter(e => e.art === 'last' && e.last !== 'zaehler' && e.v && ein.has(e.v) === vorLogik && ohne.bestromt(e) === !!s[e.v]);
        if (!spulen.length) return;
        for (let runde = 0; runde < 8; runde++) {
            const mit = spannungen(m, { an: true, fehler: true, s });
            const neu = new Map();
            for (const e of spulen) neu.set(e.v, (neu.get(e.v) || false) || mit.bestromt(e));
            let anders = false;
            neu.forEach((x, v) => { if (!!s[v] !== x) { s[v] = x; anders = true; } });
            if (!anders) break;
        }
    }
    window._elVorLogik = s => eingreifen(s, true);
    window._elNachLogik = s => eingreifen(s, false);

    // ------------------------------------------------------------
    // Messen
    // ------------------------------------------------------------
    // Messpunkt: Buchse (Steckaufbau) oder Schiene '__BUS_24V__'/'__BUS_0V__'
    function messen(rot, schwarz, modus) {
        const m = modell();
        if (!m) return { text: '– – –', hinweis: (!window.epneuMode && window._iecAnschlussView) ? 'Öffne den Steckaufbau: In der Anschluss-Sicht misst das Multimeter an den gezeichneten SPS-Modulen.' : 'Hier kann noch nicht gemessen werden.' };
        if (!rot) return { text: modus === 'ohm' ? 'OL' : '0,0', einheit: modus === 'ohm' ? 'Ω' : 'V', hinweis: modus === 'ohm' ? 'Rote und schwarze Spitze an die zwei Punkte, zwischen denen du den Durchgang prüfst.' : 'Rote Spitze an den Messpunkt halten, COM liegt auf 0 V.' };
        if (modus === 'ohm') {
            if (simAn()) return { text: '‼', einheit: '', warn: true, hinweis: 'Widerstand und Durchgang nur an der ausgeschalteten Anlage messen! Erst die Simulation stoppen.' };
            if (!schwarz) return { text: 'OL', einheit: 'Ω', hinweis: 'Jetzt die schwarze Spitze an den zweiten Punkt.' };
            const r = widerstand(m, rot, schwarz, { fehler: true });
            if (!isFinite(r) || r > 2e7) return { text: 'OL', einheit: 'Ω', wert: Infinity, hinweis: 'Kein Durchgang: Zwischen den Spitzen ist die Verbindung offen.' };
            if (r < 1) return { text: '0,0', einheit: 'Ω', wert: 0, piep: true, hinweis: '🔊 Durchgang: Die Punkte sind leitend verbunden.' };
            const t = r >= 1000 ? komma((r / 1000).toFixed(r >= 10000 ? 1 : 2)) : String(Math.round(r));
            return { text: t, einheit: r >= 1000 ? 'kΩ' : 'Ω', wert: r, hinweis: 'Zwischen den Spitzen liegt ein Verbraucher (Spule, Leuchte).' };
        }
        const sp = spannungen(m, { an: simAn(), fehler: true });
        if (!sp.an) return { text: '0,0', einheit: 'V', wert: 0, hinweis: 'Die Anlage ist aus. Zum Spannungsmessen die Simulation starten.' };
        if (sp.kurz) return { text: '0,0', einheit: 'V', wert: 0, warn: true, hinweis: 'Kurzschluss: Die Sicherung des Netzteils hat ausgelöst.' };
        const ur = sp.u(rot), us = sp.u(schwarz || '__BUS_0V__');
        const u = ur == null || us == null ? 0 : ur - us;
        const wechsel = ['L1', 'N'].includes(m.schiene(rot) || '') ;
        return { text: komma((Math.abs(u) < 0.05 ? 0 : u).toFixed(Math.abs(u) >= 100 ? 0 : 1)), einheit: wechsel ? 'V~' : 'V', wert: u,
            hinweis: ur == null ? 'Der Punkt hat keine Verbindung zu einer Schiene (offen), das Messgerät zeigt 0 V.' : '' };
    }

    // ------------------------------------------------------------
    // Namen
    // ------------------------------------------------------------
    const buchse = k => {
        if (k === '__BUS_24V__' || k === '__ANS_BUS_24V__') return '+24-V-Schiene';
        if (k === '__BUS_0V__' || k === '__ANS_BUS_0V__') return '0-V-Schiene';
        try { return window._elBuchseName ? window._elBuchseName(k) : k; } catch (e) { return k; }
    };
    const pin = k => String(k).split('_').pop();
    function elemName(m, e) {
        const wer = (m.iec(e.v) || '') + (e.v ? (m.iec(e.v) ? ' (' + e.v + ')' : e.v) : '');
        if (e.sem === 'sps_aus') return 'SPS-Ausgang ' + e.adr + ' (' + e.v + ')';
        if (e.last === 'sps_ein') return 'SPS-Eingang ' + e.adr + ' (' + e.v + ')';
        if (e.art === 'kontakt') return (e.nc ? 'Öffner ' : 'Schließer ') + pin(e.a) + '/' + pin(e.b) + ' von ' + (wer || '?');
        if (e.art === 'last') return (e.rueck ? 'Rücksetzeingang' : (LAST_NAME[e.last] || 'Verbraucher')) + ' ' + (wer || '?');
        return 'Sensor ' + (wer || '?');
    }
    function kabelName(c) {
        const n = k => /^__BUS_/.test(k) ? buchse(k) : buchse(k);
        return 'Kabel ' + n(c.a) + ' → ' + n(c.b);
    }
    function keyName(m, k) {
        if (!m) return k;
        if (k.startsWith('K:')) { const c = m.kabel.find(x => x.id === k.slice(2)); return c ? kabelName(c) : 'Kabel'; }
        const e = m.nachId.get(k.slice(2)); return e ? elemName(m, e) : '?';
    }
    function fehlerText(m, k) {
        const f = fehlerVon(k); if (!f) return '';
        const liste = k.startsWith('K:') ? FEHLER.kabel : fehlerListe(m && m.nachId.get(k.slice(2)));
        const e = liste.find(x => x[0] === f);
        return e ? e[1] : f;
    }

    // ------------------------------------------------------------
    // Darstellung: Multimeter (je Ort) und Fehlersuche im Steckaufbau
    // ------------------------------------------------------------
    const ORTE = {
        steck: { svg: () => dok('steck').getElementById('festo-svg'), wrap: () => dok('steck').getElementById('festo-wrapper'), knopf: 'festo-btn-messen' },
        plan: { svg: () => dok('plan').getElementById('circuit-svg'), wrap: () => dok('plan').getElementById('circuit-wrapper'), knopf: 'btn-iec-messen' }
    };
    function dok(ort) {
        try {
            if (ort === 'steck' && typeof window._festoDoc === 'function') return window._festoDoc() || document;
            if (ort === 'plan' && typeof window._iecDoc === 'function') return window._iecDoc() || document;
        } catch (e) {}
        try { if (ort === 'plan' && typeof _iecDoc === 'function') return _iecDoc() || document; } catch (e) {}
        return document;
    }
    const MESS = { steck: { an: false, modus: 'volt', rot: null, schwarz: null }, plan: { an: false, modus: 'volt', rot: null, schwarz: null } };
    let FS_OFFEN = false, auswahl = null, meldung = '';
    const CSS = `
.elm-box{position:absolute;z-index:45;background:#263238;color:#eceff1;border:1px solid #455a64;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.45);font:12px 'Segoe UI',sans-serif;}
.elm-mm{left:10px;bottom:10px;width:250px;padding:8px 10px 9px}
.elm-mm .kopf,.elm-fs .kopf{display:flex;align-items:center;gap:6px;font-weight:bold;margin-bottom:6px}
.elm-mm .kopf span,.elm-fs .kopf span{flex:1}
.elm-x{background:none;border:none;color:#b0bec5;cursor:pointer;font-size:14px;padding:0 2px}
.elm-lcd{background:#9ccc65;background:linear-gradient(#aed581,#8bc34a);color:#1b2b10;border:3px solid #37474f;border-radius:5px;font:bold 30px 'Consolas',monospace;text-align:right;padding:2px 10px;letter-spacing:1px;min-height:38px}
.elm-lcd small{font-size:15px;margin-left:5px}
.elm-lcd.warn{background:#ffcc80;color:#7f2700}
.elm-modi{display:flex;gap:4px;margin:7px 0 5px}
.elm-modi button,.elm-fs button{flex:1;background:#37474f;color:#eceff1;border:1px solid #546e7a;border-radius:4px;padding:3px 4px;cursor:pointer;font-size:11.5px}
.elm-modi button.an{background:#ffb300;color:#212121;border-color:#ff8f00;font-weight:bold}
.elm-spitze{display:flex;gap:6px;align-items:flex-start;margin-top:3px;font-size:11px;line-height:1.3}
.elm-spitze i{flex:0 0 10px;height:10px;border-radius:50%;margin-top:2px;border:1px solid #000}
.elm-spitze b{font-weight:600}
.elm-hinw{color:#b0bec5;font-size:10.5px;margin-top:6px;line-height:1.35}
.elm-hinw.warn{color:#ffab91}
.elm-klein{display:flex;gap:4px;margin-top:6px}
.elm-klein button{flex:1;background:#37474f;color:#cfd8dc;border:1px solid #546e7a;border-radius:4px;padding:2px 4px;cursor:pointer;font-size:10.5px}
.elm-fs{right:10px;top:10px;width:300px;max-height:calc(100% - 20px);overflow:auto;padding:8px 10px}
.elm-fs label{display:block;color:#90a4ae;font-size:10.5px;margin:8px 0 3px;text-transform:uppercase;letter-spacing:.4px}
.elm-fs select{width:100%;background:#37474f;color:#eceff1;border:1px solid #546e7a;border-radius:4px;font-size:11px;padding:2px}
.elm-fs .zeile{margin:3px 0;padding:4px 6px;background:#2e3c43;border-radius:4px}
.elm-fs .zeile .n{font-size:11px;margin-bottom:3px}
.elm-fs .rot{color:#ef9a9a}.elm-fs .gelb{color:#ffb74d}
.elm-fs .start{margin-top:8px;width:100%;flex:none}
.elm-box button.elm-x{flex:none;background:none;border:none;color:#b0bec5;padding:0 2px;font-size:14px}
.elm-mess-btn.an{background:#ffb300 !important;color:#212121 !important;border-color:#ff8f00 !important}
`;
    function css(d) {
        if (d.getElementById('elm-css')) return;
        const st = d.createElement('style'); st.id = 'elm-css'; st.textContent = CSS; (d.head || d.documentElement).appendChild(st);
    }
    function h(d, tag, attrs, parent) {
        const e = d.createElement(tag);
        if (attrs) for (const k in attrs) {
            if (k === 'text') e.textContent = attrs[k];
            else if (k === 'html') e.innerHTML = attrs[k];
            else if (k.startsWith('on')) e[k] = attrs[k];
            else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
        }
        if (parent) parent.appendChild(e);
        return e;
    }
    function s(d, tag, attrs, parent) {
        const e = d.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    // Position eines SVG-Elements in den Koordinaten von `bis` (nur translate)
    function versatz(elem, bis) {
        let x = 0, y = 0, p = elem.parentNode;
        while (p && p !== bis && p.nodeType === 1) {
            const tf = p.getAttribute && p.getAttribute('transform');
            if (tf) { const mm = tf.match(/translate\(\s*([\-\d.]+)\s*[,\s]\s*([\-\d.]+)\s*\)/); if (mm) { x += parseFloat(mm[1]); y += parseFloat(mm[2]); } }
            p = p.parentNode;
        }
        return { x, y };
    }
    function zuSvg(svgOderG, cx, cy) {
        try {
            const ctm = svgOderG.getScreenCTM(); if (!ctm) return null;
            const root = svgOderG.ownerSVGElement || svgOderG;
            const pt = root.createSVGPoint(); pt.x = cx; pt.y = cy;
            const p = pt.matrixTransform(ctm.inverse());
            return { x: p.x, y: p.y };
        } catch (e) { return null; }
    }
    // ---------- Steckaufbau: Buchse / Kabel unter dem Mauszeiger ----------
    function buchsePos(svg, key) {
        const c = svg.querySelector(`[data-festo-socket="${(window.CSS && CSS.escape) ? CSS.escape(key) : key}"]`);
        if (!c) return null;
        const o = versatz(c, svg);
        return { x: parseFloat(c.getAttribute('cx')) + o.x, y: parseFloat(c.getAttribute('cy')) + o.y };
    }
    function buchseAus(ev, svg) {
        const t = ev.target;
        if (t && t.getAttribute) {
            if (t.getAttribute('data-festo-socket')) return t.getAttribute('data-festo-socket');
            const n = t.nextElementSibling;
            if (t.tagName === 'circle' && n && n.getAttribute && n.getAttribute('data-festo-socket') && n.getAttribute('cx') === t.getAttribute('cx') && n.getAttribute('cy') === t.getAttribute('cy')) return n.getAttribute('data-festo-socket');
        }
        const p = zuSvg(svg, ev.clientX, ev.clientY); if (!p) return null;
        let best = null, bd = 10 * 10;
        svg.querySelectorAll('[data-festo-socket]').forEach(c => {
            const o = versatz(c, svg), dx = parseFloat(c.getAttribute('cx')) + o.x - p.x, dy = parseFloat(c.getAttribute('cy')) + o.y - p.y, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = c.getAttribute('data-festo-socket'); }
        });
        return best;
    }
    function kabelPfade(svg) { return Array.from(svg.querySelectorAll('path[data-el-kabel], path.fb-cable[data-fb-cable]')); }
    const kabelIdVon = p => p.getAttribute('data-el-kabel') || p.getAttribute('data-fb-cable');
    function kabelAus(ev, svg) {
        const p = zuSvg(svg, ev.clientX, ev.clientY); if (!p) return null;
        let best = null, bd = 8 * 8;
        for (const path of kabelPfade(svg)) {
            let L = 0; try { L = path.getTotalLength(); } catch (e) { continue; }
            const o = versatz(path, svg), n = Math.max(8, Math.min(60, Math.round(L / 12)));
            for (let i = 0; i <= n; i++) {
                const q = path.getPointAtLength(L * i / n), dx = q.x + o.x - p.x, dy = q.y + o.y - p.y, d = dx * dx + dy * dy;
                if (d < bd) { bd = d; best = kabelIdVon(path); }
            }
        }
        return best;
    }
    // ---------- Auto-Schaltplan: Anschlusspunkte und Leitungen ----------
    function planInhalt() { return dok('plan').getElementById('circuit-content'); }
    function planPunkte(m) {
        const cc = planInhalt(); if (!cc || !m || !m.plan) return [];
        const pkt = [];
        const auf = (elem, sel, attrY) => {
            const o = versatz(elem, cc);
            return Array.from(elem.querySelectorAll(sel)).map(x => ({ x: parseFloat(x.getAttribute(sel.startsWith('circle') ? 'cx' : 'x1')) + o.x, y1: parseFloat(x.getAttribute(sel.startsWith('circle') ? 'cy' : 'y1')) + o.y, y2: parseFloat(x.getAttribute(sel.startsWith('circle') ? 'cy' : 'y2')) + o.y }));
        };
        for (const k of m.plan.kontakte) {
            if (!k.elem || !k.elem.isConnected) continue;
            const c = auf(k.elem, 'circle.circ-static').sort((p, q) => p.y1 - q.y1);
            if (c.length < 2) continue;
            pkt.push({ x: c[0].x, y: c[0].y1, key: k.a, elem: k.elem }, { x: c[c.length - 1].x, y: c[c.length - 1].y1, key: k.b, elem: k.elem });
        }
        for (const k of m.plan.spulen) {
            if (!k.elem || !k.elem.isConnected) continue;
            const l = auf(k.elem, 'line.circ-static').sort((p, q) => p.y1 - q.y1);
            if (l.length < 2) continue;
            pkt.push({ x: l[0].x, y: Math.min(l[0].y1, l[0].y2), key: k.a, elem: k.elem });
            if (k.b) pkt.push({ x: l[l.length - 1].x, y: Math.max(l[l.length - 1].y1, l[l.length - 1].y2), key: k.b, elem: k.elem });
        }
        return pkt;
    }
    function planLeitungen() {
        const cc = planInhalt(); if (!cc) return [];
        return Array.from(cc.querySelectorAll('line.circ-wire')).map(l => {
            const o = versatz(l, cc);
            return { x1: +l.getAttribute('x1') + o.x, y1: +l.getAttribute('y1') + o.y, x2: +l.getAttribute('x2') + o.x, y2: +l.getAttribute('y2') + o.y, oy: o.y };
        });
    }
    function abstandSeg(px, py, l) {
        const dx = l.x2 - l.x1, dy = l.y2 - l.y1, L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((px - l.x1) * dx + (py - l.y1) * dy) / L2)) : 0;
        const x = l.x1 + t * dx, y = l.y1 + t * dy;
        return { d: Math.hypot(px - x, py - y), x, y };
    }
    // Punkt im Schaltplan → Buchse/Schiene. Leitungen führen zum nächsten
    // Anschluss oder zur Schiene (oberes Ende = +24 V, unteres = 0 V).
    function planTreffer(px, py) {
        const m = modell(); if (!m) return null;
        const pkt = planPunkte(m);
        let best = null, bd = 12;
        for (const q of pkt) { const d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = { key: q.key, x: q.x, y: q.y, elem: q.elem }; } }
        if (best) return best;
        const L = planLeitungen();
        let seg = null, sd = 7;
        for (const l of L) { const a = abstandSeg(px, py, l); if (a.d < sd) { sd = a.d; seg = { l, x: a.x, y: a.y }; } }
        if (!seg) return null;
        // Schienen je Block (gleicher Versatz): oberstes und unterstes Leitungsende
        const ob = new Map(), un = new Map();
        for (const l of L) { const lo = Math.min(l.y1, l.y2), hi = Math.max(l.y1, l.y2); ob.set(l.oy, Math.min(ob.has(l.oy) ? ob.get(l.oy) : Infinity, lo)); un.set(l.oy, Math.max(un.has(l.oy) ? un.get(l.oy) : -Infinity, hi)); }
        const beiPunkt = (x, y) => pkt.find(q => Math.hypot(q.x - x, q.y - y) < 4);
        const gesehen = new Set([seg.l]), offen = [seg.l];
        let ziel = null, zd = Infinity;
        while (offen.length) {
            const l = offen.shift();
            for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) {
                const d = Math.hypot(x - seg.x, y - seg.y);
                const q = beiPunkt(x, y);
                if (q) { if (d < zd) { zd = d; ziel = { key: q.key, elem: q.elem }; } continue; }
                if (Math.abs(y - ob.get(l.oy)) < 2) { if (d < zd) { zd = d; ziel = { key: '__BUS_24V__' }; } continue; }
                if (Math.abs(y - un.get(l.oy)) < 2) { if (d < zd) { zd = d; ziel = { key: '__BUS_0V__' }; } continue; }
                for (const n of L) if (!gesehen.has(n) && abstandSeg(x, y, n).d < 2) { gesehen.add(n); offen.push(n); }
            }
            if (ziel && offen.length === 0) break;
        }
        return ziel ? Object.assign(ziel, { x: seg.x, y: seg.y }) : null;
    }
    function planName(t) {
        if (!t) return '';
        let wer = '';
        if (t.elem) { const tx = t.elem.querySelector('text'); wer = tx ? (tx.textContent || '').trim() : ''; }
        return (wer && /^-/.test(wer) ? wer + ' · ' : '') + buchse(t.key);
    }

    // Fenster am Kopf verschieben (bleibt im Panel)
    function ziehbar(box, griff) {
        griff.style.cursor = 'move';
        griff.title = 'Zum Verschieben ziehen';
        griff.addEventListener('mousedown', ev => {
            if (ev.target.closest('button')) return;
            const W = box.ownerDocument.defaultView || window, par = box.offsetParent || box.parentElement;
            const r = box.getBoundingClientRect(), pr = par.getBoundingClientRect();
            const dx = ev.clientX - r.left, dy = ev.clientY - r.top;
            const mv = e => {
                const x = Math.max(0, Math.min(pr.width - r.width, e.clientX - pr.left - dx)), y = Math.max(0, Math.min(pr.height - 30, e.clientY - pr.top - dy));
                Object.assign(box.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' }); box._gezogen = true;
            };
            const up = () => { W.removeEventListener('mousemove', mv); W.removeEventListener('mouseup', up); };
            W.addEventListener('mousemove', mv); W.addEventListener('mouseup', up);
            ev.preventDefault(); ev.stopPropagation();
        });
    }
    // ---------- Messgerät-Fenster ----------
    function mmBox(ort) {
        const wrap = ORTE[ort].wrap(); if (!wrap) return null;
        const d = wrap.ownerDocument; css(d);
        let box = d.getElementById('elm-mm-' + ort);
        if (box && box.parentElement !== wrap) { box.remove(); box = null; }
        if (!box) {
            box = h(d, 'div', { id: 'elm-mm-' + ort, class: 'elm-box elm-mm' }, wrap);
            box.addEventListener('mousedown', e => e.stopPropagation());
            box.addEventListener('wheel', e => e.stopPropagation());
            const k = h(d, 'div', { class: 'kopf' }, box);
            h(d, 'span', { text: '🩺 Multimeter' }, k);
            h(d, 'button', { class: 'elm-x', title: 'Messgerät weglegen', text: '✕', onclick: () => umschalten(ort, false) }, k);
            ziehbar(box, k);
            h(d, 'div', { class: 'elm-lcd' }, box);
            const mo = h(d, 'div', { class: 'elm-modi' }, box);
            h(d, 'button', { 'data-m': 'volt', text: 'V⎓ Spannung', title: 'Gleichspannung messen: rote Spitze an den Messpunkt, COM (schwarz) liegt auf 0 V. Anlage eingeschaltet (Simulation läuft).', onclick: () => modus(ort, 'volt') }, mo);
            h(d, 'button', { 'data-m': 'ohm', text: 'Ω 🔊 Durchgang', title: 'Widerstand und Durchgang zwischen zwei Punkten messen. Nur an der ausgeschalteten Anlage (Simulation gestoppt).', onclick: () => modus(ort, 'ohm') }, mo);
            h(d, 'div', { class: 'elm-spitze', 'data-s': 'rot' }, box);
            h(d, 'div', { class: 'elm-spitze', 'data-s': 'schwarz' }, box);
            const kl = h(d, 'div', { class: 'elm-klein' }, box);
            h(d, 'button', { text: 'COM auf 0 V', title: 'Schwarze Spitze zurück auf die 0-V-Schiene', onclick: () => { MESS[ort].schwarz = null; zeigen(ort); } }, kl);
            h(d, 'button', { text: 'Spitzen abnehmen', onclick: () => { MESS[ort].rot = null; MESS[ort].schwarz = null; zeigen(ort); } }, kl);
            h(d, 'div', { class: 'elm-hinw' }, box);
        }
        return box;
    }
    let letzterPiep = '';
    function piep(d) {
        if (window.soundMode === 0) return;
        try {
            const W = d.defaultView || window, AC = W.AudioContext || W.webkitAudioContext; if (!AC) return;
            const ac = piep.ac || (piep.ac = new AC()), o = ac.createOscillator(), g = ac.createGain();
            o.frequency.value = 2400; g.gain.value = 0.05; o.connect(g); g.connect(ac.destination);
            o.start(); o.stop(ac.currentTime + 0.25);
        } catch (e) {}
    }
    function zeigen(ort) {
        const st = MESS[ort];
        const box = mmBox(ort); if (!box) return;
        const d = box.ownerDocument;
        const m0 = ort === 'plan' ? modell() : null;
        const r = ort === 'plan' && window.festoFreeBuildMode
            ? { text: '– – –', einheit: '', hinweis: 'Im freien Aufbau misst du direkt an den Buchsen im Steckaufbau.' }
            : ort === 'plan' && m0 && !m0.plan
            ? { text: '– – –', einheit: '', hinweis: 'Im Klemmenplan (Anschluss-Sicht) misst du im Steckaufbau an den SPS-Modulen. Im Schaltplan geht es in der Programm-Sicht und im E-Pneu-Modus.' }
            : messen(st.rot && st.rot.key, st.schwarz && st.schwarz.key, st.modus);
        const lcd = box.querySelector('.elm-lcd');
        lcd.innerHTML = '';
        lcd.appendChild(d.createTextNode(r.text)); if (r.einheit) h(d, 'small', { text: r.einheit }, lcd);
        lcd.classList.toggle('warn', !!r.warn);
        box.querySelectorAll('.elm-modi button').forEach(b => b.classList.toggle('an', b.getAttribute('data-m') === st.modus));
        const sp = (art, p, farbe, leer) => {
            const z = box.querySelector(`[data-s="${art}"]`); z.innerHTML = '';
            h(d, 'i', { style: 'background:' + farbe }, z);
            const t = h(d, 'div', {}, z);
            h(d, 'b', { text: art === 'rot' ? 'rot (V Ω): ' : 'schwarz (COM): ' }, t);
            t.appendChild(d.createTextNode(p ? p.name : leer));
        };
        sp('rot', st.rot, '#e53935', 'nicht angelegt');
        sp('schwarz', st.schwarz, '#212121', st.modus === 'ohm' ? 'nicht angelegt' : '0-V-Schiene');
        const hw = box.querySelector('.elm-hinw');
        hw.textContent = (r.hinweis ? r.hinweis + ' ' : '') + (st.rot ? '' : (ort === 'steck' ? 'Klick auf eine Buchse = rote Spitze, Shift-Klick oder Rechtsklick = schwarze Spitze.' : 'Klick auf einen Anschluss oder eine Leitung = rote Spitze, Shift-Klick oder Rechtsklick = schwarze Spitze.'));
        hw.classList.toggle('warn', !!r.warn);
        const sig = (st.rot && st.rot.key) + '|' + (st.schwarz && st.schwarz.key);
        if (r.piep && letzterPiep !== ort + sig) { letzterPiep = ort + sig; piep(d); }
        if (!r.piep && letzterPiep === ort + sig) letzterPiep = '';
        st.anzeige = r;
        spitzenZeichnen(ort);
    }
    // Messspitzen als kleine Prüfspitzen im Bild
    function spitzenZeichnen(ort) {
        const st = MESS[ort];
        const ziel = ort === 'steck' ? ORTE.steck.svg() : planInhalt();
        if (!ziel) return;
        const d = ziel.ownerDocument;
        let g = ziel.querySelector(':scope > #elm-spitzen');
        if (!g) { g = s(d, 'g', { id: 'elm-spitzen', 'pointer-events': 'none' }, ziel); }
        else if (g !== ziel.lastElementChild) ziel.appendChild(g);
        g.innerHTML = '';
        if (!st.an) return;
        const zeichne = (p, farbe, txt, dx) => {
            if (!p) return;
            let x = p.x, y = p.y;
            if (ort === 'steck') { const q = buchsePos(ziel, p.key); if (!q) return; x = q.x; y = q.y; }
            const gg = s(d, 'g', { transform: `translate(${x},${y})` }, g);
            s(d, 'line', { x1: 0, y1: 0, x2: dx, y2: -34, stroke: '#9e9e9e', 'stroke-width': 1.6 }, gg);
            s(d, 'line', { x1: dx * 0.35, y1: -12, x2: dx, y2: -34, stroke: farbe, 'stroke-width': 6, 'stroke-linecap': 'round' }, gg);
            s(d, 'circle', { cx: 0, cy: 0, r: 3.2, fill: farbe, stroke: '#fff', 'stroke-width': 1.2 }, gg);
            const t = s(d, 'text', { x: dx + (dx > 0 ? 4 : -4), y: -36, 'font-size': 10, 'font-weight': 'bold', fill: farbe, 'text-anchor': dx > 0 ? 'start' : 'end', 'font-family': 'Segoe UI,sans-serif', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, gg);
            t.textContent = txt;
        };
        zeichne(st.rot, '#e53935', '+', 16);
        zeichne(st.schwarz, '#212121', 'COM', -16);
        // Anzeige neben der roten Spitze
        if (st.rot && st.anzeige) {
            let x = st.rot.x, y = st.rot.y;
            if (ort === 'steck') { const q = buchsePos(ziel, st.rot.key); if (q) { x = q.x; y = q.y; } }
            const t = st.anzeige.text + (st.anzeige.einheit ? ' ' + st.anzeige.einheit : '');
            const w = 8 + t.length * 7.2;
            s(d, 'rect', { x: x + 22, y: y - 64, width: w, height: 18, rx: 4, fill: '#263238', stroke: '#ffb300', 'stroke-width': 1 }, g);
            const tt = s(d, 'text', { x: x + 22 + w / 2, y: y - 51, 'text-anchor': 'middle', 'font-size': 11.5, 'font-family': 'Consolas,monospace', 'font-weight': 'bold', fill: '#c5e1a5' }, g);
            tt.textContent = t;
        }
    }
    function modus(ort, m) { MESS[ort].modus = m; if (m === 'ohm' && !MESS[ort].schwarz) { /* COM muss angelegt werden */ } zeigen(ort); }

    // ---------- Fehlersuche (Steckaufbau) ----------
    function fsBox() {
        const wrap = ORTE.steck.wrap(); if (!wrap) return null;
        const d = wrap.ownerDocument; css(d);
        let box = d.getElementById('elm-fs');
        if (box && box.parentElement !== wrap) { box.remove(); box = null; }
        if (!box) {
            box = h(d, 'div', { id: 'elm-fs', class: 'elm-box elm-fs' }, wrap);
            box.addEventListener('mousedown', e => e.stopPropagation());
            box.addEventListener('wheel', e => e.stopPropagation());
        }
        // unter die Werkzeugleiste des Steckaufbaus
        if (!box._gezogen) try { const tb = d.getElementById('festo-toolbar'); if (tb) box.style.top = (tb.offsetTop + tb.offsetHeight + 8) + 'px'; } catch (e) {}
        return box;
    }
    function kandidaten(sel) {
        const m = modell(); if (!m || !sel) return [];
        const out = [];
        if (sel.kabel) { const c = m.kabel.find(x => x.id === sel.kabel); if (c) out.push({ k: 'K:' + c.id, art: 'kabel', name: kabelName(c) }); return out; }
        const k = sel.buchse;
        const r = m.schiene(k);
        for (const e of m.elemente) if (e.a === k || e.b === k || e.c === k) out.push({ k: 'E:' + e.id, art: e.art, e, name: elemName(m, e) });
        for (const c of m.kabel) {
            if (c.a === k || c.b === k || (r && !/^__/.test(k) && false)) out.push({ k: 'K:' + c.id, art: 'kabel', name: kabelName(c) });
        }
        return out;
    }
    function fsZeigen() {
        const box = fsBox(); if (!box) return;
        const d = box.ownerDocument, m = modell();
        box.innerHTML = '';
        const k = h(d, 'div', { class: 'kopf' }, box);
        h(d, 'span', { text: '🔍 Fehlersuche Elektrik' }, k);
        h(d, 'button', { class: 'elm-x', title: 'Schließen', text: '✕', onclick: () => fehlersucheUmschalten(false) }, k);
        ziehbar(box, k);
        if (!m) { h(d, 'div', { class: 'elm-hinw', text: 'In der Anschluss-Sicht mit SPS-Modulen gibt es die Fehlersuche noch nicht. Schalte auf die Programm-Sicht oder den E-Pneu-Modus.' }, box); return; }
        const ks = fehlerKeys();
        const sel = kandidaten(auswahl);
        if (F.fehlersuche) {
            const gef = ks.filter(x => F.behoben.includes(x)).length;
            h(d, 'div', { class: 'elm-hinw', text: `In diesem Aufbau stecken ${ks.length} versteckte Fehler (${gef} gefunden). Starte die Simulation, beobachte und miss mit dem 🩺 Multimeter: Spannung gegen 0 V bei laufender Anlage, Durchgang bei ausgeschalteter. Dann klicke die Buchse oder das Kabel an, das du für defekt hältst, und melde den Befund.` }, box);
            if (auswahl) {
                h(d, 'label', { text: 'Ausgewählt: ' + (auswahl.kabel ? 'Kabel' : buchse(auswahl.buchse)) }, box);
                if (!sel.length) h(d, 'div', { class: 'elm-hinw', text: 'Hier ist nichts angeschlossen.' }, box);
                sel.forEach(c => {
                    const z = h(d, 'div', { class: 'zeile' }, box);
                    h(d, 'div', { class: 'n', text: c.name }, z);
                    const gemeldet = F.verdacht.includes(c.k), erledigt = F.behoben.includes(c.k);
                    const b = h(d, 'button', { text: erledigt ? '✓ instand gesetzt' : gemeldet ? 'Meldung zurücknehmen' : 'Als defekt melden', onclick: () => verdacht(c.k) }, z);
                    if (erledigt) b.disabled = true;
                });
            }
            h(d, 'label', { text: 'Deine Meldungen' }, box);
            if (!F.verdacht.length) h(d, 'div', { class: 'elm-hinw', text: '– noch keine –' }, box);
            F.verdacht.forEach(x => h(d, 'div', { class: 'gelb', text: '• ' + keyName(m, x) }, box));
            h(d, 'button', { class: 'start', text: '✓ Befund prüfen', onclick: () => befundPruefen() }, box);
            if (meldung) h(d, 'div', { class: 'elm-hinw', text: meldung, style: 'color:#e0e0e0;font-size:11.5px' }, box);
            h(d, 'button', { class: 'start', text: 'Lehrkraft: Fehler zeigen', title: 'Fehlersuche beenden und die versteckten Fehler wieder einblenden', onclick: () => { const W = d.defaultView || window; if (W.confirm('Fehlersuche beenden und die versteckten Fehler zeigen?')) { F.fehlersuche = false; F.verdacht = []; meldung = ''; geaendert(); } } }, box);
        } else {
            h(d, 'div', { class: 'elm-hinw', text: 'Lehrkraft: Buchse oder Kabel anklicken und einen versteckten Fehler wählen. Die Fehler wirken sofort auf die Simulation. Dann die Fehlersuche starten: Die Fehler sind nicht mehr zu sehen, die Lernenden messen und melden ihren Befund. Als Aufgabe speichern: Bedingung „Elektrik: alle versteckten Fehler gefunden“.' }, box);
            if (auswahl) {
                h(d, 'label', { text: 'Ausgewählt: ' + (auswahl.kabel ? 'Kabel' : buchse(auswahl.buchse)) }, box);
                if (!sel.length) h(d, 'div', { class: 'elm-hinw', text: 'Hier ist nichts angeschlossen.' }, box);
                sel.forEach(c => {
                    const z = h(d, 'div', { class: 'zeile' }, box);
                    h(d, 'div', { class: 'n', text: c.name }, z);
                    const sl = h(d, 'select', {}, z);
                    h(d, 'option', { value: '', text: '– kein Fehler –' }, sl);
                    (c.art === 'kabel' ? FEHLER.kabel : fehlerListe(c.e)).forEach(([v, n]) => h(d, 'option', { value: v, text: n }, sl));
                    sl.value = fehlerVon(c.k) || '';
                    sl.onchange = () => setzen(c.k, sl.value || null);
                });
            }
            h(d, 'label', { text: `Eingebaute Fehler (${ks.length})` }, box);
            ks.forEach(x => {
                const z = h(d, 'div', { class: 'rot', style: 'display:flex;gap:4px;align-items:flex-start;margin:2px 0' }, box);
                h(d, 'div', { text: '• ' + keyName(m, x) + ': ' + fehlerText(m, x), style: 'flex:1' }, z);
                h(d, 'button', { class: 'elm-x', text: '✕', title: 'Fehler entfernen', onclick: () => setzen(x, null) }, z);
            });
            const st = h(d, 'button', { class: 'start', text: '▶ Fehlersuche starten', onclick: () => { F.fehlersuche = true; F.verdacht = []; F.behoben = []; F.fehlversuche = 0; meldung = ''; auswahl = null; geaendert(); } }, box);
            if (!ks.length) st.disabled = true;
        }
    }
    function fehlerMarken() {
        const svg = ORTE.steck.svg(); if (!svg) return;
        const d = svg.ownerDocument;
        let g = svg.querySelector(':scope > #elm-fehler');
        if (!g) g = s(d, 'g', { id: 'elm-fehler', 'pointer-events': 'none' }, svg);
        g.innerHTML = '';
        const m = modell(); if (!m) return;
        const zeige = FS_OFFEN && !F.fehlersuche;
        // Auswahl hervorheben
        if (FS_OFFEN && auswahl) {
            if (auswahl.buchse) { const q = buchsePos(svg, auswahl.buchse); if (q) s(d, 'circle', { cx: q.x, cy: q.y, r: 11, fill: 'none', stroke: '#ffb300', 'stroke-width': 2.5, 'stroke-dasharray': '4 3' }, g); }
            if (auswahl.kabel) kabelPfade(svg).filter(p => kabelIdVon(p) === auswahl.kabel).forEach(p => { const c = s(d, 'path', { d: p.getAttribute('d'), fill: 'none', stroke: '#ffb300', 'stroke-width': 6, opacity: 0.45, 'stroke-linecap': 'round' }, g); const o = versatz(p, svg); if (o.x || o.y) c.setAttribute('transform', `translate(${o.x},${o.y})`); });
        }
        if (!zeige) return;
        for (const k of Object.keys(F.fehler)) {
            if (!gibtEs(m, k)) continue;
            if (k.startsWith('K:')) {
                kabelPfade(svg).filter(p => kabelIdVon(p) === k.slice(2)).forEach(p => { const c = s(d, 'path', { d: p.getAttribute('d'), fill: 'none', stroke: '#d50000', 'stroke-width': 3.5, 'stroke-dasharray': '6 4', 'stroke-linecap': 'round' }, g); const o = versatz(p, svg); if (o.x || o.y) c.setAttribute('transform', `translate(${o.x},${o.y})`); });
            } else {
                const e = m.nachId.get(k.slice(2)); const q = e && (buchsePos(svg, e.a) || buchsePos(svg, e.b)); if (!q) continue;
                const t = s(d, 'text', { x: q.x + 9, y: q.y - 7, 'font-size': 14, fill: '#d50000', 'font-weight': 'bold', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, g);
                t.textContent = '⚡';
            }
        }
    }
    function setzen(k, art) { if (art) F.fehler[k] = art; else delete F.fehler[k]; geaendert(); }
    function verdacht(k) {
        const i = F.verdacht.indexOf(k);
        if (i >= 0) F.verdacht.splice(i, 1); else F.verdacht.push(k);
        geaendert();
    }
    function befundPruefen() {
        const m = modell();
        const treffer = F.verdacht.filter(k => F.fehler[k]), falsch = F.verdacht.filter(k => !F.fehler[k]);
        F.behoben = Array.from(new Set(F.behoben.concat(treffer)));
        F.fehlversuche += falsch.length;
        F.verdacht = [];
        const ks = fehlerKeys(), gef = ks.filter(k => F.behoben.includes(k)).length;
        let txt = treffer.length ? `Richtig: ${treffer.map(k => keyName(m, k) + ' (' + fehlerText(m, k) + ')').join(', ')}. Instand gesetzt. ` : '';
        if (falsch.length) txt += `${falsch.length} Meldung${falsch.length > 1 ? 'en waren' : ' war'} kein Fehler. `;
        txt += gef >= ks.length ? `Alle ${ks.length} Fehler gefunden!` : `Noch ${ks.length - gef} von ${ks.length} Fehlern versteckt.`;
        meldung = txt;
        geaendert();
        return { treffer: treffer.length, falsch: falsch.length, offen: ks.length - gef };
    }
    function geaendert() {
        try { if (typeof saveFactoryState === 'function') saveFactoryState(); } catch (e) {}
        if (FS_OFFEN) fsZeigen();
        fehlerMarken();
        aktualisieren();
    }

    // ---------- Klicks abfangen ----------
    const EREIGNISSE = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'contextmenu', 'touchstart', 'dblclick'];
    function anbinden(ort) {
        const svg = ORTE[ort].svg(); if (!svg || svg._elmGebunden) return;
        svg._elmGebunden = true;
        EREIGNISSE.forEach(typ => svg.addEventListener(typ, ev => klick(ort, svg, ev), true));
    }
    function klick(ort, svg, ev) {
        const mess = MESS[ort].an, fs = ort === 'steck' && FS_OFFEN;
        if (!mess && !fs) return;
        if (ev.button === 1) return;    // mittlere Taste: verschieben
        let ziel = null;
        if (ort === 'steck') {
            const b = buchseAus(ev, svg);
            if (b) ziel = { buchse: b };
            else if (!mess) { const k = kabelAus(ev, svg); if (k) ziel = { kabel: k }; }
        } else {
            const cc = planInhalt(); const p = cc && zuSvg(cc, ev.clientX, ev.clientY);
            const t = p && planTreffer(p.x, p.y);
            if (t) ziel = { plan: t };
        }
        if (!ziel) return;   // Hintergrund: verschieben/zoomen wie gewohnt
        ev.stopPropagation(); ev.stopImmediatePropagation && ev.stopImmediatePropagation();
        if (ev.type === 'contextmenu' || ev.type === 'mousedown' || ev.type === 'touchstart') ev.preventDefault();
        const schwarz = ev.type === 'contextmenu' || ((ev.type === 'click') && (ev.shiftKey || ev.ctrlKey || ev.altKey));
        if (ev.type !== 'click' && ev.type !== 'contextmenu') return;
        if (mess) {
            const st = MESS[ort];
            let p;
            if (ort === 'steck') p = { key: ziel.buchse, name: buchse(ziel.buchse) };
            else p = { key: ziel.plan.key, x: ziel.plan.x, y: ziel.plan.y, name: planName(ziel.plan) };
            if (schwarz) st.schwarz = p;
            else if (st.modus === 'ohm' && st.rot && !st.schwarz) st.schwarz = p;
            else st.rot = p;
            zeigen(ort);
            return;
        }
        auswahl = ziel; meldung = '';
        fsZeigen(); fehlerMarken();
    }

    // ---------- Ein/aus ----------
    function knopf(ort) {
        const d = dok(ort), b = d.getElementById(ORTE[ort].knopf);
        if (b) b.classList.toggle('an', MESS[ort].an);
        const f = dok('steck').getElementById('festo-btn-fehler');
        if (f) f.classList.toggle('an', FS_OFFEN);
    }
    function umschalten(ort, an) {
        ort = ort === 'plan' ? 'plan' : 'steck';
        const st = MESS[ort];
        st.an = an == null ? !st.an : !!an;
        if (st.an) {
            if (ort === 'steck') {
                const w = ORTE.steck.wrap();
                if (w && w.style.display === 'none' && typeof window.toggleWorkspaceView === 'function') { try { window.toggleWorkspaceView('festo-wrapper'); } catch (e) {} }
            }
            anbinden(ort); zeigen(ort);
        } else {
            const box = dok(ort).getElementById('elm-mm-' + ort); if (box) box.remove();
            spitzenZeichnen(ort);
        }
        knopf(ort); takt();
    }
    function fehlersucheUmschalten(an) {
        FS_OFFEN = an == null ? !FS_OFFEN : !!an;
        if (FS_OFFEN) {
            const w = ORTE.steck.wrap();
            if (w && w.style.display === 'none' && typeof window.toggleWorkspaceView === 'function') { try { window.toggleWorkspaceView('festo-wrapper'); } catch (e) {} }
            anbinden('steck'); fsZeigen();
        } else { const b = dok('steck').getElementById('elm-fs'); if (b) b.remove(); auswahl = null; }
        fehlerMarken(); knopf('steck'); takt();
    }
    // Laufende Anzeige (Werte, Spitzen nach neuem Zeichnen, Fehlermarken)
    let uhr = null;
    function takt() {
        const noetig = MESS.steck.an || MESS.plan.an || FS_OFFEN;
        if (noetig && !uhr) uhr = setInterval(aktualisieren, 200);
        if (!noetig && uhr) { clearInterval(uhr); uhr = null; }
    }
    function aktualisieren() {
        for (const ort of ['steck', 'plan']) {
            if (!MESS[ort].an) continue;
            anbinden(ort);   // Panel abgekoppelt → neues Dokument
            // Schaltplan neu gezeichnet: Spitzen wieder auf ihren Anschluss setzen
            if (ort === 'plan') for (const w of ['rot', 'schwarz']) {
                const p = MESS.plan[w]; if (!p || !p.elem || p.elem.isConnected) continue;
                const q = planPunkte(modell()).find(x => x.key === p.key);
                if (q) Object.assign(p, { x: q.x, y: q.y, elem: q.elem });
            }
            zeigen(ort);
        }
        if (FS_OFFEN) { anbinden('steck'); const svg = ORTE.steck.svg(); if (svg && !svg.querySelector(':scope > #elm-fehler')) fehlerMarken(); else if (svg && svg.lastElementChild && svg.lastElementChild.id !== 'elm-fehler' && svg.lastElementChild.id !== 'elm-spitzen') fehlerMarken(); }
    }

    // ------------------------------------------------------------
    // Schnittstelle
    // ------------------------------------------------------------
    window.ElMessen = {
        umschalten, fehlersucheUmschalten,
        modell: () => modell(),
        neuAufbauen: () => { cacheVer = null; return modell(); },
        // Messen per Programm (Prüfungen, Brücke): Punkte sind Buchsen bzw. '__BUS_24V__'/'__BUS_0V__'
        spannung: (k, gegen) => { const r = messen(k, gegen || null, 'volt'); return r.wert != null ? r.wert : null; },
        widerstand: (a, b) => { const m = modell(); return m ? widerstand(m, a, b, { fehler: true }) : null; },
        messen: (rot, schwarz, modus) => messen(rot, schwarz, modus || 'volt'),
        anlegen: (ort, rot, schwarz, m) => { ort = ort === 'plan' ? 'plan' : 'steck'; if (!MESS[ort].an) umschalten(ort, true); if (m) MESS[ort].modus = m; MESS[ort].rot = rot ? { key: rot, name: buchse(rot) } : null; MESS[ort].schwarz = schwarz ? { key: schwarz, name: buchse(schwarz) } : null; zeigen(ort); return MESS[ort].anzeige; },
        anzeige: ort => MESS[ort === 'plan' ? 'plan' : 'steck'].anzeige || null,
        planTreffer: (x, y) => planTreffer(x, y),
        planPunkte: () => planPunkte(modell()),
        bestromt: (v, mitFehlern) => { const m = modell(); if (!m) return null; const sp = spannungen(m, { an: true, fehler: mitFehlern !== false }); return m.elemente.filter(e => e.art === 'last' && e.v === v).some(e => sp.bestromt(e)); },
        // Fehlersuche
        FEHLER,
        setzen: (k, art) => setzen(k, art),
        fehler: () => Object.assign({}, F.fehler),
        fehlersucheStarten: () => { F.fehlersuche = true; F.verdacht = []; F.behoben = []; F.fehlversuche = 0; meldung = ''; geaendert(); },
        fehlersucheBeenden: () => { F.fehlersuche = false; F.verdacht = []; geaendert(); },
        verdacht: k => verdacht(k),
        befundPruefen: () => befundPruefen(),
        fehlerGefunden: () => fehlerGefunden(),
        kandidaten: sel => kandidaten(sel),
        zustand: () => JSON.parse(JSON.stringify(F)),
        exportieren: () => (Object.keys(F.fehler).length || F.fehlersuche ? JSON.parse(JSON.stringify(F)) : null),
        importieren: roh => {
            F = leer();
            if (roh && typeof roh === 'object') {
                F.fehler = Object.assign({}, roh.fehler || {}); F.fehlersuche = !!roh.fehlersuche;
                F.verdacht = Array.isArray(roh.verdacht) ? roh.verdacht.slice() : [];
                F.behoben = Array.isArray(roh.behoben) ? roh.behoben.slice() : [];
                F.fehlversuche = roh.fehlversuche | 0;
            }
            meldung = ''; auswahl = null;
            if (FS_OFFEN) fsZeigen();
            fehlerMarken();
        }
    };
    if (window._elRoh) { try { window.ElMessen.importieren(window._elRoh); } catch (e) {} }
})();
