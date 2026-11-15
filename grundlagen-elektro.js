/* =====================================================================
 * VALIS – Grundlagen Elektrotechnik: Messplatz (Steckbrett)
 * ---------------------------------------------------------------------
 * Ein freies Steckbrett mit Netzteil (0 … 24 V, Sicherung), drei
 * Widerständen, einer Lampe, einem Schalter und zwei Verteilerleisten.
 * Lernende stecken Kabel von Buchse zu Buchse und messen mit dem
 * Multimeter Spannung, Strom und Widerstand – in Reihe, parallel und
 * gemischt. Drei Aufgaben prüfen die gemessenen Werte gegen die
 * Rechnung (ohmsches Gesetz, Kirchhoff).
 *
 * Rechenmodell: Kabel, geschlossener Schalter und Verteilerleisten sind
 * ideale Leiter (Union-Find), Widerstände und Lampe ohmsch, Netzteil
 * ideale Quelle mit 0,5 Ω Innenwiderstand. Knotenanalyse G · U = I.
 * Strommessung: Das Messgerät liegt mit 0,05 Ω zwischen den Spitzen –
 * in Reihe misst es den Strom, parallel zur Quelle macht es einen
 * Kurzschluss (Sicherung löst aus). Widerstand nur spannungsfrei:
 * 1 mA in die rote Spitze, R = U / I.
 *
 * Öffnen: Lernzentrum → „Grundlagen Elektrotechnik“ oder
 * window.GrundlagenE.oeffnen(). Prüfung: pruefungen/grundlagen-elektro-pruefung.js
 * ===================================================================== */
(function () {
    'use strict';
    if (window.GrundlagenE) return;
    const NS = 'http://www.w3.org/2000/svg';
    const R_WERTE = [10, 22, 47, 100, 150, 220, 330, 470, 1000, 2200, 4700, 10000];
    const R_LAMPE = 48;          // 12 V / 3 W
    const P_LAMPE = 3;
    const RI = 0.5, R_AMP = 0.05, I_SICHERUNG = 2;

    // ---------- Brett ----------
    // Bauteile mit zwei Buchsen (a oben, b unten); Leisten: vier Buchsen, intern verbunden
    const TEILE = [
        { id: 'R1', art: 'r', x: 250, name: 'R1' },
        { id: 'R2', art: 'r', x: 340, name: 'R2' },
        { id: 'R3', art: 'r', x: 430, name: 'R3' },
        { id: 'L1', art: 'lampe', x: 520, name: 'H1' },
        { id: 'S1', art: 'schalter', x: 610, name: 'S1' }
    ];
    const Y_A = 150, Y_B = 290;
    const BUCHSEN = {};
    function buchse(id, x, y, knoten, farbe) { BUCHSEN[id] = { id, x, y, knoten: knoten || id, farbe: farbe || '#212121' }; }
    buchse('Q+', 90, 170, 'Q+', '#c62828');
    buchse('Q-', 90, 270, 'Q-', '#1565c0');
    TEILE.forEach(t => { buchse(t.id + 'a', t.x, Y_A); buchse(t.id + 'b', t.x, Y_B); });
    for (let i = 1; i <= 6; i++) { buchse('A' + i, 200 + (i - 1) * 86, 70, 'LA'); buchse('B' + i, 200 + (i - 1) * 86, 370, 'LB'); }

    const S = {
        r: { R1: 100, R2: 220, R3: 330 },
        u: 12, an: false, ausgeloest: false, schalter: true,
        kabel: [],                      // [{ a, b, f }]
        rot: null, com: null, modus: 'V', werkzeug: 'kabel', start: null,
        aufgabe: 0
    };
    const FARBEN = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#6d4c41'];

    // ---------- Rechnen ----------
    function netz(extra) {
        // extra: zusätzliche Elemente (Messgerät) [{ a, b, g }]
        const par = {};
        const f = k => { if (BUCHSEN[k]) k = BUCHSEN[k].knoten; while (par[k] !== undefined && par[k] !== k) k = par[k]; return k; };
        const u = (a, b) => { const x = f(a), y = f(b); if (x !== y) par[x] = y; };
        Object.values(BUCHSEN).forEach(b => { par[b.knoten] = par[b.knoten] || b.knoten; });
        S.kabel.forEach(k => u(BUCHSEN[k.a].knoten, BUCHSEN[k.b].knoten));
        if (S.schalter) u('S1a', 'S1b');
        const el = [];
        ['R1', 'R2', 'R3'].forEach(r => el.push({ id: r, a: f(r + 'a'), b: f(r + 'b'), g: 1 / S.r[r] }));
        el.push({ id: 'L1', a: f('L1a'), b: f('L1b'), g: 1 / R_LAMPE });
        (extra || []).forEach(e => el.push({ id: e.id, a: f(e.a), b: f(e.b), g: e.g }));
        return { f, el };
    }
    // Knotenspannungen; quelle: { p, m, u } (ideal mit Ri) oder Stromquelle { p, m, i }
    function loesen(N, quelle) {
        const kn = [...new Set(N.el.flatMap(e => [e.a, e.b]).concat(quelle ? [N.f(quelle.p), N.f(quelle.m)] : []))];
        const masse = quelle ? N.f(quelle.m) : kn[0];
        const idx = {}; kn.filter(k => k !== masse).forEach((k, i) => { idx[k] = i; });
        const n = Object.keys(idx).length;
        const G = Array.from({ length: n }, () => new Float64Array(n + 1));
        const stamp = (a, b, g) => {
            const ia = idx[a], ib = idx[b];
            if (ia !== undefined) G[ia][ia] += g;
            if (ib !== undefined) G[ib][ib] += g;
            if (ia !== undefined && ib !== undefined) { G[ia][ib] -= g; G[ib][ia] -= g; }
        };
        N.el.forEach(e => { if (e.a !== e.b) stamp(e.a, e.b, e.g); });
        kn.forEach(k => { if (idx[k] !== undefined) G[idx[k]][idx[k]] += 1e-9; });   // freie Knoten
        if (quelle) {
            const p = N.f(quelle.p), m = N.f(quelle.m);
            if (quelle.u != null) {
                // Spannungsquelle mit Innenwiderstand = Norton: Strom u/Ri, Leitwert 1/Ri
                stamp(p, m, 1 / RI);
                if (idx[p] !== undefined) G[idx[p]][n] += quelle.u / RI;
                if (idx[m] !== undefined) G[idx[m]][n] -= quelle.u / RI;
            } else {
                if (idx[p] !== undefined) G[idx[p]][n] += quelle.i;
                if (idx[m] !== undefined) G[idx[m]][n] -= quelle.i;
            }
        }
        for (let c = 0; c < n; c++) {
            let pv = c; for (let r = c + 1; r < n; r++) if (Math.abs(G[r][c]) > Math.abs(G[pv][c])) pv = r;
            [G[c], G[pv]] = [G[pv], G[c]];
            const d = G[c][c] || 1e-30;
            for (let r = 0; r < n; r++) if (r !== c) { const k = G[r][c] / d; if (k) for (let j = c; j <= n; j++) G[r][j] -= k * G[c][j]; }
        }
        const U = { [masse]: 0 };
        Object.keys(idx).forEach(k => { const i = idx[k]; U[k] = G[i][n] / (G[i][i] || 1e-30); });
        return U;
    }
    function messgeraetElement() {
        if (S.modus === 'A' && S.rot && S.com) return [{ id: 'AMP', a: S.rot, b: S.com, g: 1 / R_AMP }];
        return [];
    }
    // Zustand der Schaltung bei eingeschaltetem Netzteil
    function zustand() {
        const N = netz(messgeraetElement());
        const aktiv = S.an && !S.ausgeloest;
        const U = aktiv ? loesen(N, { p: 'Q+', m: 'Q-', u: S.u }) : null;
        const V = k => U ? (U[N.f(k)] || 0) : 0;
        const iQ = U ? (S.u - (V('Q+') - V('Q-'))) / RI : 0;
        const strom = {}; N.el.forEach(e => { strom[e.id] = U ? ((U[e.a] || 0) - (U[e.b] || 0)) * e.g : 0; });
        return { N, U, V, iQ, strom };
    }
    function pruefeSicherung() {
        if (!S.an || S.ausgeloest) return;
        const z = zustand();
        if (Math.abs(z.iQ) > I_SICHERUNG) { S.ausgeloest = true; }
    }
    // Anzeige des Multimeters
    function messen() {
        if (!S.rot || !S.com) return { text: '– – –', wert: null, hinweis: 'Rote Spitze und COM an Buchsen anlegen.' };
        if (S.modus === 'V') {
            const z = zustand();
            const u = z.V(S.rot) - z.V(S.com);
            return { text: fmt(u, 2) + ' V', wert: u, einheit: 'V' };
        }
        if (S.modus === 'A') {
            const z = zustand();
            const i = z.strom.AMP || 0;
            if (S.ausgeloest) return { text: '0 mA', wert: 0, einheit: 'A', hinweis: 'Die Sicherung des Netzteils hat ausgelöst.' };
            return { text: Math.abs(i) < 1 ? fmt(i * 1000, 1) + ' mA' : fmt(i, 3) + ' A', wert: i, einheit: 'A' };
        }
        // Ω: nur spannungsfrei
        if (S.an && !S.ausgeloest) {
            const z = zustand();
            if (Math.abs(z.V(S.rot) - z.V(S.com)) > 0.05 || S.u > 0) return { text: 'Err', wert: null, hinweis: 'Widerstand nur spannungsfrei messen: Netzteil ausschalten.' };
        }
        const N = netz([]);
        if (N.f(S.rot) === N.f(S.com)) return { text: '0,0 Ω', wert: 0, einheit: 'Ω' };
        const U = loesen(N, { p: S.rot, m: S.com, i: 0.001 });
        const r = ((U[N.f(S.rot)] || 0) - (U[N.f(S.com)] || 0)) / 0.001;
        if (!(r < 2e6)) return { text: 'OL', wert: Infinity, einheit: 'Ω', hinweis: 'Offen: kein Stromweg zwischen den Spitzen.' };
        return { text: r >= 1000 ? fmt(r / 1000, 3) + ' kΩ' : fmt(r, 1) + ' Ω', wert: r, einheit: 'Ω' };
    }
    const fmt = (v, n) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: n });

    // ---------- Aufgaben ----------
    const AUFGABEN = [
        { titel: 'Reihenschaltung', u: 12, r: { R1: 100, R2: 220, R3: 330 },
          text: 'Schalte R1 und R2 in Reihe an das Netzteil (12 V). Miss den Strom I und die Teilspannungen U1 und U2. Prüfe: U1 + U2 = U.',
          felder: [['I', 'mA', 12 / 320 * 1000], ['U1', 'V', 12 * 100 / 320], ['U2', 'V', 12 * 220 / 320]] },
        { titel: 'Parallelschaltung', u: 12, r: { R1: 100, R2: 220, R3: 330 },
          text: 'Schalte R1 und R2 parallel an 12 V (Verteilerleisten helfen). Miss die Zweigströme I1, I2 und den Gesamtstrom I. Miss danach spannungsfrei den Ersatzwiderstand R.',
          felder: [['I1', 'mA', 120], ['I2', 'mA', 12 / 220 * 1000], ['I', 'mA', 120 + 12 / 220 * 1000], ['R', 'Ω', 1 / (1 / 100 + 1 / 220)]] },
        { titel: 'Gemischte Schaltung', u: 24, r: { R1: 100, R2: 220, R3: 330 },
          text: 'R2 und R3 parallel, dazu R1 in Reihe, an 24 V. Miss den Gesamtstrom I, die Spannung U1 an R1 und U23 an der Parallelschaltung. Miss spannungsfrei den Gesamtwiderstand R.',
          felder: (() => { const rp = 1 / (1 / 220 + 1 / 330), rg = 100 + rp, i = 24 / rg; return [['I', 'mA', i * 1000], ['U1', 'V', i * 100], ['U23', 'V', i * rp], ['R', 'Ω', rg]]; })() }
    ];
    function aufgabeLaden(i) {
        const a = AUFGABEN[i]; if (!a) return;
        S.aufgabe = i; S.u = a.u; Object.assign(S.r, a.r);
        zeichnen();
    }
    // Eingaben prüfen: ±3 % zum Rechenwert
    function aufgabePruefen(i, werte) {
        const a = AUFGABEN[i]; if (!a) return null;
        return a.felder.map(([n, e, soll]) => {
            const ist = Number(String(werte[n] == null ? '' : werte[n]).replace(',', '.'));
            return { n, e, soll, ist, ok: isFinite(ist) && Math.abs(ist - soll) <= Math.abs(soll) * 0.03 + 0.01 };
        });
    }

    // ---------- Vorlagen ----------
    const VORLAGEN = {
        leer: [],
        reihe: [['Q+', 'R1a'], ['R1b', 'R2a'], ['R2b', 'Q-']],
        parallel: [['Q+', 'A1'], ['A2', 'R1a'], ['A3', 'R2a'], ['R1b', 'B2'], ['R2b', 'B3'], ['B1', 'Q-']],
        gemischt: [['Q+', 'R1a'], ['R1b', 'A1'], ['A2', 'R2a'], ['A3', 'R3a'], ['R2b', 'B2'], ['R3b', 'B3'], ['B1', 'Q-']],
        lampe: [['Q+', 'S1a'], ['S1b', 'L1a'], ['L1b', 'Q-']]
    };
    function vorlage(n) {
        S.kabel = (VORLAGEN[n] || []).map((k, i) => ({ a: k[0], b: k[1], f: FARBEN[i % FARBEN.length] }));
        S.rot = S.com = null; S.start = null;
        zeichnen();
    }

    // ---------- Oberfläche ----------
    let fenster = null, svg = null, seite = null;
    const CSS = `
    #ge-fenster{position:fixed;left:6vw;top:7vh;width:1080px;max-width:96vw;height:600px;max-height:90vh;background:#263238;color:#eceff1;border:1px solid #455a64;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.6);z-index:3500;display:flex;flex-direction:column;font:12px 'Segoe UI',sans-serif;resize:both;overflow:hidden}
    #ge-fenster .ge-kopf{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#37474f;cursor:move;user-select:none}
    #ge-fenster .ge-kopf b{font-size:14px}
    #ge-fenster button{background:#455a64;color:#fff;border:1px solid #546e7a;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:12px}
    #ge-fenster button.an{background:#00838f;border-color:#4dd0e1}
    #ge-fenster .ge-haupt{display:flex;flex:1;min-height:0}
    #ge-fenster .ge-brett{flex:1;min-width:0;background:#eceff1;overflow:auto}
    #ge-fenster .ge-seite{width:300px;padding:8px;overflow:auto;border-left:1px solid #455a64;display:flex;flex-direction:column;gap:8px}
    #ge-fenster .ge-box{background:#1e292e;border:1px solid #37474f;border-radius:4px;padding:6px 8px}
    #ge-fenster .ge-box h4{margin:0 0 4px;font-size:12px;color:#80cbc4}
    #ge-fenster .ge-anz{font:bold 26px monospace;background:#0b2e13;color:#76ff03;text-align:right;padding:4px 8px;border-radius:3px;margin:4px 0}
    #ge-fenster .ge-hinw{color:#ffcc80;font-size:11px;min-height:14px}
    #ge-fenster .ge-reihe{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin:3px 0}
    #ge-fenster select,#ge-fenster input{background:#37474f;color:#fff;border:1px solid #546e7a;border-radius:3px;padding:2px 4px}
    #ge-fenster input.ge-wert{width:70px}
    #ge-fenster .ge-ok{color:#69f0ae}#ge-fenster .ge-falsch{color:#ff8a80}
    #ge-fenster svg text{font-family:'Segoe UI',sans-serif}
    #ge-fenster .ge-buchse{cursor:pointer}#ge-fenster .ge-buchse:hover circle{stroke:#ff9800;stroke-width:3}
    #ge-fenster .ge-kabel{cursor:pointer}`;
    function h(tag, attrs, eltern, html) {
        const e = document.createElement(tag);
        for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
        if (html != null) e.innerHTML = html;
        if (eltern) eltern.appendChild(e);
        return e;
    }
    function s(tag, attrs, eltern) {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
        if (eltern) eltern.appendChild(e);
        return e;
    }
    function bauen() {
        if (fenster) return;
        if (!document.getElementById('ge-css')) h('style', { id: 'ge-css' }, document.head, CSS);
        fenster = h('div', { id: 'ge-fenster' }, document.body);
        const kopf = h('div', { class: 'ge-kopf' }, fenster, '<b>⚡ Grundlagen Elektrotechnik – Messplatz</b>');
        const zu = h('button', { type: 'button', title: 'Schließen' }, kopf, '✕'); zu.onclick = schliessen;
        let zug = null;
        kopf.addEventListener('mousedown', e => { if (e.target === zu) return; zug = [e.clientX - fenster.offsetLeft, e.clientY - fenster.offsetTop]; });
        window.addEventListener('mousemove', e => { if (zug) { fenster.style.left = (e.clientX - zug[0]) + 'px'; fenster.style.top = Math.max(0, e.clientY - zug[1]) + 'px'; } });
        window.addEventListener('mouseup', () => { zug = null; });
        const haupt = h('div', { class: 'ge-haupt' }, fenster);
        const brett = h('div', { class: 'ge-brett' }, haupt);
        svg = s('svg', { viewBox: '0 0 740 430', width: '100%', style: 'display:block;min-width:600px' }, brett);
        seite = h('div', { class: 'ge-seite' }, haupt);
        svg.addEventListener('click', klick);
    }
    function klick(e) {
        const b = e.target.closest('.ge-buchse'), k = e.target.closest('.ge-kabel'), sch = e.target.closest('.ge-schalter');
        if (sch) { S.schalter = !S.schalter; pruefeSicherung(); zeichnen(); return; }
        if (b) {
            const id = b.getAttribute('data-b');
            if (S.werkzeug === 'rot') S.rot = id;
            else if (S.werkzeug === 'com') S.com = id;
            else if (!S.start) S.start = id;
            else {
                if (S.start !== id && !S.kabel.some(q => (q.a === S.start && q.b === id) || (q.a === id && q.b === S.start)))
                    S.kabel.push({ a: S.start, b: id, f: FARBEN[S.kabel.length % FARBEN.length] });
                S.start = null;
            }
            pruefeSicherung(); zeichnen(); return;
        }
        if (k && S.werkzeug === 'kabel') { S.kabel.splice(+k.getAttribute('data-k'), 1); pruefeSicherung(); zeichnen(); return; }
        if (S.start) { S.start = null; zeichnen(); }
    }
    function zeichnen() {
        if (!fenster) return;
        const z = zustand();
        svg.innerHTML = '';
        // Netzteil
        s('rect', { x: 20, y: 120, width: 140, height: 190, rx: 8, fill: '#37474f', stroke: '#263238' }, svg);
        s('text', { x: 90, y: 142, 'text-anchor': 'middle', fill: '#fff', 'font-size': 13, 'font-weight': 'bold' }, svg).textContent = 'Netzteil';
        s('rect', { x: 38, y: 196, width: 104, height: 34, rx: 3, fill: '#0b2e13' }, svg);
        const aus = !S.an || S.ausgeloest;
        s('text', { x: 134, y: 220, 'text-anchor': 'end', fill: S.ausgeloest ? '#ff5252' : aus ? '#2e7d32' : '#76ff03', 'font-size': 17, 'font-family': 'monospace', 'font-weight': 'bold' }, svg).textContent = S.ausgeloest ? 'ÜBERLAST' : (aus ? '-- V' : fmt(S.u, 1) + ' V');
        s('text', { x: 90, y: 300, 'text-anchor': 'middle', fill: '#b0bec5', 'font-size': 10 }, svg).textContent = S.an ? (S.ausgeloest ? 'Sicherung ausgelöst' : 'ein') : 'aus';
        // Leisten
        [['A', 70, 'Verteilerleiste'], ['B', 370, 'Verteilerleiste']].forEach(([n, y, t]) => {
            s('rect', { x: 180, y: y - 16, width: 470, height: 32, rx: 4, fill: '#cfd8dc', stroke: '#90a4ae' }, svg);
            s('line', { x1: 200, y1: y, x2: 630, y2: y, stroke: '#78909c', 'stroke-width': 3 }, svg);
            s('text', { x: 660, y: y + 4, fill: '#546e7a', 'font-size': 10 }, svg).textContent = t + ' ' + n;
        });
        // Bauteile
        TEILE.forEach(t => {
            const xa = t.x, ya = Y_A, yb = Y_B;
            s('line', { x1: xa, y1: ya, x2: xa, y2: yb, stroke: '#455a64', 'stroke-width': 2 }, svg);
            if (t.art === 'r') {
                s('rect', { x: xa - 11, y: 190, width: 22, height: 60, fill: '#fff', stroke: '#263238', 'stroke-width': 2 }, svg);
                s('text', { x: xa + 16, y: 210, fill: '#263238', 'font-size': 12, 'font-weight': 'bold' }, svg).textContent = t.name;
                s('text', { x: xa + 16, y: 226, fill: '#455a64', 'font-size': 11 }, svg).textContent = S.r[t.id] >= 1000 ? fmt(S.r[t.id] / 1000, 1) + ' kΩ' : S.r[t.id] + ' Ω';
            } else if (t.art === 'lampe') {
                const p = Math.pow(z.strom.L1 || 0, 2) * R_LAMPE, hell = Math.max(0, Math.min(1, p / P_LAMPE));
                s('circle', { cx: xa, cy: 220, r: 18, fill: `rgba(255,214,0,${(0.08 + 0.9 * hell).toFixed(2)})`, stroke: '#263238', 'stroke-width': 2, 'data-hell': hell.toFixed(2) }, svg).classList.add('ge-lampe');
                s('path', { d: `M${xa - 12} 208 L${xa + 12} 232 M${xa + 12} 208 L${xa - 12} 232`, stroke: '#263238', 'stroke-width': 2 }, svg);
                s('text', { x: xa + 22, y: 206, fill: '#263238', 'font-size': 12, 'font-weight': 'bold' }, svg).textContent = t.name;
                s('text', { x: xa + 22, y: 252, fill: '#455a64', 'font-size': 10 }, svg).textContent = '12 V / 3 W';
            } else {
                const g = s('g', { class: 'ge-schalter', style: 'cursor:pointer' }, svg);
                s('rect', { x: xa - 20, y: 190, width: 40, height: 60, fill: 'transparent' }, g);
                s('line', { x1: xa, y1: 200, x2: xa, y2: 190, stroke: '#eceff1', 'stroke-width': 4 }, g);
                s('line', { x1: xa, y1: 240, x2: S.schalter ? xa : xa + 16, y2: 200, stroke: '#263238', 'stroke-width': 3 }, g);
                s('rect', { x: xa - 3, y: 196, width: 6, height: 48, fill: 'none' }, g);
                s('text', { x: xa + 22, y: 206, fill: '#263238', 'font-size': 12, 'font-weight': 'bold' }, svg).textContent = t.name;
                s('text', { x: xa + 22, y: 222, fill: '#455a64', 'font-size': 10 }, svg).textContent = S.schalter ? 'zu' : 'offen';
            }
        });
        // Kabel
        S.kabel.forEach((k, i) => {
            const a = BUCHSEN[k.a], b = BUCHSEN[k.b];
            const my = Math.max(a.y, b.y) + 40 + (i % 3) * 8;
            s('path', { d: `M${a.x} ${a.y} C ${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`, fill: 'none', stroke: k.f, 'stroke-width': 4, 'stroke-linecap': 'round', class: 'ge-kabel', 'data-k': i, opacity: 0.9 }, svg);
        });
        // Buchsen
        Object.values(BUCHSEN).forEach(b => {
            const g = s('g', { class: 'ge-buchse', 'data-b': b.id }, svg);
            s('circle', { cx: b.x, cy: b.y, r: 8, fill: b.farbe, stroke: S.start === b.id ? '#ff9800' : '#9e9e9e', 'stroke-width': S.start === b.id ? 4 : 2 }, g);
            s('circle', { cx: b.x, cy: b.y, r: 3, fill: '#000' }, g);
        });
        s('text', { x: 108, y: 174, fill: '#fff', 'font-size': 14, 'font-weight': 'bold' }, svg).textContent = '+';
        s('text', { x: 108, y: 275, fill: '#fff', 'font-size': 14, 'font-weight': 'bold' }, svg).textContent = '−';
        // Messspitzen
        [['rot', '#e53935', 'V Ω A'], ['com', '#212121', 'COM']].forEach(([w, f, t]) => {
            const id = S[w]; if (!id) return;
            const b = BUCHSEN[id];
            const dx = w === 'rot' ? -14 : 14;
            s('path', { d: `M${b.x} ${b.y} l${dx} -28 l${dx / 2} -6`, stroke: f, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }, svg);
            s('text', { x: b.x + dx * 1.6, y: b.y - 38, fill: f, 'font-size': 9, 'text-anchor': 'middle', 'font-weight': 'bold' }, svg).textContent = t;
        });
        seiteZeichnen();
    }
    function seiteZeichnen() {
        const m = messen();
        const a = AUFGABEN[S.aufgabe];
        const rSel = r => `<select data-r="${r}">${R_WERTE.map(v => `<option value="${v}"${S.r[r] === v ? ' selected' : ''}>${v >= 1000 ? fmt(v / 1000, 1) + ' kΩ' : v + ' Ω'}</option>`).join('')}</select>`;
        const alt = {}; seite.querySelectorAll('[data-feld]').forEach(i => { alt[i.getAttribute('data-feld')] = i.value; });
        const altErg = seite.querySelector('.ge-erg') ? seite.querySelector('.ge-erg').innerHTML : '';
        seite.innerHTML = `
        <div class="ge-box"><h4>Multimeter</h4>
          <div class="ge-reihe">${['V', 'A', 'Ω'].map(x => `<button type="button" data-modus="${x}" class="${S.modus === x ? 'an' : ''}">${x === 'V' ? 'V Spannung' : x === 'A' ? 'A Strom' : 'Ω Widerstand'}</button>`).join('')}</div>
          <div class="ge-anz" data-anzeige>${m.text}</div>
          <div class="ge-hinw">${m.hinweis || (S.modus === 'A' ? 'Strom: Messgerät in den Stromweg legen (Kabel auftrennen).' : S.modus === 'V' ? 'Spannung: parallel zum Bauteil messen.' : 'Widerstand: Netzteil aus.')}</div>
        </div>
        <div class="ge-box"><h4>Werkzeug</h4>
          <div class="ge-reihe">
            <button type="button" data-w="kabel" class="${S.werkzeug === 'kabel' ? 'an' : ''}" title="Buchse anklicken, dann die zweite Buchse. Kabel anklicken: entfernen">🔌 Kabel</button>
            <button type="button" data-w="rot" class="${S.werkzeug === 'rot' ? 'an' : ''}" title="Rote Messspitze an eine Buchse">🔴 Spitze</button>
            <button type="button" data-w="com" class="${S.werkzeug === 'com' ? 'an' : ''}" title="Schwarze Messspitze (COM) an eine Buchse">⚫ COM</button>
            <button type="button" data-a="spitzen" title="Messspitzen abnehmen">✋ ab</button>
          </div>
        </div>
        <div class="ge-box"><h4>Netzteil und Bauteile</h4>
          <div class="ge-reihe"><button type="button" data-a="netz" class="${S.an ? 'an' : ''}">${S.an ? '⏻ ein' : '⏻ aus'}</button>
            <input type="range" min="0" max="24" step="0.5" value="${S.u}" data-u style="width:110px"> <span>${fmt(S.u, 1)} V</span></div>
          <div class="ge-reihe">R1 ${rSel('R1')} R2 ${rSel('R2')}</div>
          <div class="ge-reihe">R3 ${rSel('R3')} <span style="color:#90a4ae">H1 12 V / 3 W</span></div>
          <div class="ge-reihe">Vorlage: <button type="button" data-v="reihe">Reihe</button><button type="button" data-v="parallel">Parallel</button><button type="button" data-v="gemischt">Gemischt</button><button type="button" data-v="lampe">Lampe</button><button type="button" data-v="leer">🧹 leer</button></div>
        </div>
        <div class="ge-box"><h4>Aufgabe ${S.aufgabe + 1}: ${a.titel}</h4>
          <div class="ge-reihe">${AUFGABEN.map((x, i) => `<button type="button" data-auf="${i}" class="${i === S.aufgabe ? 'an' : ''}">${i + 1}</button>`).join('')} <button type="button" data-a="laden" title="Netzteilspannung und Widerstände der Aufgabe einstellen">⚙ Werte einstellen</button></div>
          <div style="margin:4px 0;line-height:1.4">${a.text}</div>
          ${a.felder.map(([n, e]) => `<div class="ge-reihe"><span style="width:40px">${n} =</span><input class="ge-wert" data-feld="${n}" value="${alt[n] != null ? alt[n] : ''}"> ${e}</div>`).join('')}
          <div class="ge-reihe"><button type="button" data-a="pruefen">✓ Prüfen</button></div>
          <div class="ge-erg">${altErg}</div>
        </div>`;
    }
    function seiteKlick(e) {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.modus) S.modus = b.dataset.modus;
        if (b.dataset.w) { S.werkzeug = b.dataset.w; S.start = null; }
        if (b.dataset.v) vorlage(b.dataset.v);
        if (b.dataset.auf) { S.aufgabe = +b.dataset.auf; seite.querySelectorAll('[data-feld]').forEach(i => { i.value = ''; }); const er = seite.querySelector('.ge-erg'); if (er) er.innerHTML = ''; }
        const a = b.dataset.a;
        if (a === 'netz') { S.an = !S.an; S.ausgeloest = false; pruefeSicherung(); }
        if (a === 'spitzen') { S.rot = S.com = null; }
        if (a === 'laden') aufgabeLaden(S.aufgabe);
        if (a === 'pruefen') {
            const w = {}; seite.querySelectorAll('[data-feld]').forEach(i => { w[i.getAttribute('data-feld')] = i.value; });
            const r = aufgabePruefen(S.aufgabe, w);
            const alle = r.every(x => x.ok);
            const html = r.map(x => `<div class="${x.ok ? 'ge-ok' : 'ge-falsch'}">${x.ok ? '✓' : '✗'} ${x.n}${x.ok ? ' stimmt' : ': passt nicht – nachmessen oder nachrechnen'}</div>`).join('')
                + (alle ? '<div class="ge-ok"><b>Alle Werte stimmen.</b></div>' : '');
            zeichnen(); const er = seite.querySelector('.ge-erg'); if (er) er.innerHTML = html;
            return;
        }
        zeichnen();
    }
    function seiteAendern(e) {
        const t = e.target;
        if (t.dataset.r) { S.r[t.dataset.r] = +t.value; pruefeSicherung(); zeichnen(); }
        if (t.hasAttribute('data-u')) { S.u = +t.value; pruefeSicherung(); zeichnen(); }
    }
    function oeffnen() {
        bauen();
        fenster.style.display = 'flex';
        if (!seite._an) { seite.addEventListener('click', seiteKlick); seite.addEventListener('change', seiteAendern); seite.addEventListener('input', e => { if (e.target.hasAttribute('data-u')) seiteAendern(e); }); seite._an = true; }
        zeichnen();
    }
    function schliessen() { if (fenster) fenster.style.display = 'none'; }

    window.GrundlagenE = {
        oeffnen, schliessen, vorlage, aufgabeLaden, aufgabePruefen,
        AUFGABEN, BUCHSEN,
        // Für Prüfungen und Lektionen
        zustand: () => ({ an: S.an, ausgeloest: S.ausgeloest, u: S.u, r: Object.assign({}, S.r), kabel: S.kabel.map(k => [k.a, k.b]), schalter: S.schalter }),
        setzen: (o) => { if (o.r) Object.assign(S.r, o.r); if (o.u != null) S.u = o.u; if (o.an != null) { S.an = !!o.an; S.ausgeloest = false; } if (o.schalter != null) S.schalter = !!o.schalter; if (o.kabel) S.kabel = o.kabel.map((k, i) => ({ a: k[0], b: k[1], f: FARBEN[i % FARBEN.length] })); pruefeSicherung(); zeichnen(); },
        messen: (modus, rot, com) => { S.modus = modus; S.rot = rot; S.com = com; pruefeSicherung(); zeichnen(); return messen(); },
        lampe: () => { const z = zustand(); return Math.min(1, Math.pow(z.strom.L1 || 0, 2) * R_LAMPE / P_LAMPE); }
    };
})();
