/* =====================================================================
 * VALIS – Fluidplan
 * ---------------------------------------------------------------------
 * Freier Pneumatikplan nach DIN ISO 1219: Bauteile aus der Palette
 * setzen, Leitungen von Anschluss zu Anschluss ziehen, simulieren.
 * Rein pneumatische Steuerungen (Taster-, Rollen-, Pneumatikventile,
 * Wechsel-, Zweidruck-, Zeit- und Folgeventil) laufen ohne Code.
 * Magnetspulen lesen VALIS-Ausgänge, Endlagen-Sensoren und Druck-
 * schalter schreiben VALIS-Eingänge, ein Zylinder kann einen Zylinder
 * der 2D-Anlage mitnehmen.
 *
 * Der Plan wird mit der 2D-Anlage gespeichert (getFactoryStateObj →
 * `fluidplan`), reist also in .valisave, #state, Aufgaben und Undo mit.
 *
 * Rechenmodell: Jede Leitung (zusammenhängende Anschlüsse) ist ein
 * Knoten mit Volumen und Luftmenge (Normliter), p = M / V − 1 (bar Ü).
 * Bauteile verbinden Knoten mit Leitwerten g (Nl/(s·bar)). Je Teil-
 * schritt (1 ms) wird jede Kante paarweise ausgeglichen, höchstens bis
 * zum Druckgleichgewicht: dadurch stabil auch bei kleinen Volumen.
 * Kolben: F = 10 · (pK · AK − pS · AS) − Feder − Last, m·dv/dt = F − d·v.
 * ===================================================================== */
(function () {
    'use strict';
    if (window.Fluidplan) return;

    const NS = 'http://www.w3.org/2000/svg';
    const RASTER = 10;
    const P_AN = 0.3;          // ab hier gilt eine Leitung als belüftet (bar)
    const DT = 0.001;          // Teilschritt (s)
    const G_VENTIL = 1.0;        // Leitwert offener Ventilweg
    const G_QUELLE = 40;       // Leitwert der Druckluftquelle
    const G_LEITUNG = 60;      // Leitwert zwischen Knoten (nur intern)
    const V_LEITUNG = 0.004;   // Volumen je Leitung (l)

    // ------------------------------------------------------------
    // Hilfen
    // ------------------------------------------------------------
    const el = (tag, attrs, parent) => {
        const e = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    };
    const h = (tag, attrs, parent) => {
        const e = document.createElement(tag);
        if (attrs) for (const k in attrs) {
            if (k === 'text') e.textContent = attrs[k];
            else if (k === 'html') e.innerHTML = attrs[k];
            else if (k.startsWith('on')) e[k] = attrs[k];
            else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
        }
        if (parent) parent.appendChild(e);
        return e;
    };
    const snap = v => Math.round(v / RASTER) * RASTER;
    const kopie = o => JSON.parse(JSON.stringify(o));
    const neueId = () => 'f' + Math.random().toString(36).slice(2, 9);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const zahl = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
    const simLaeuft = () => { try { return !!isSimulationActive; } catch (e) { return false; } };
    const sps = () => { try { return spsState; } catch (e) { return window.spsState || {}; } };
    const varListe = (art) => {
        try {
            const l = art === 'in' ? globalInputs : globalOutputs;
            return Array.isArray(l) ? l.slice() : [];
        } catch (e) { return []; }
    };

    // ------------------------------------------------------------
    // Bauteil-Katalog
    // ------------------------------------------------------------
    // Wegeventile: Stellungen von links nach rechts. Jede Stellung:
    //   w  = Wege [von, nach] (Pfeil zeigt auf „nach")
    //   zu = gesperrte Anschlüsse
    // Die Anschlüsse liegen fest an der Ruhestellung (Kasten `heim`),
    // beim Schalten wandert der Kastenblock darunter durch.
    const VLAGE = {
        '2/2': { oben: { '2': 20 }, unten: { '1': 20 } },
        '3/2': { oben: { '2': 20 }, unten: { '1': 10, '3': 30 } },
        '4/2': { oben: { '4': 10, '2': 30 }, unten: { '1': 10, '3': 30 } },
        '5/2': { oben: { '4': 10, '2': 30 }, unten: { '5': 6, '1': 20, '3': 34 } },
        '5/3': { oben: { '4': 10, '2': 30 }, unten: { '5': 6, '1': 20, '3': 34 } }
    };
    function ventilStellungen(o) {
        const w = o.wege || '3/2';
        if (w === '2/2') {
            const auf = { w: [['1', '2']], zu: [] }, sp = { w: [], zu: ['1', '2'] };
            return o.ruhe === 'offen' ? [sp, auf] : [auf, sp];
        }
        if (w === '3/2') {
            const a = { w: [['1', '2']], zu: ['3'] }, b = { w: [['2', '3']], zu: ['1'] };
            return o.ruhe === 'offen' ? [b, a] : [a, b];
        }
        if (w === '4/2') return [{ w: [['1', '4'], ['2', '3']], zu: [] }, { w: [['1', '2'], ['4', '3']], zu: [] }];
        if (w === '5/2') return [{ w: [['1', '4'], ['2', '3']], zu: ['5'] }, { w: [['1', '2'], ['4', '5']], zu: ['3'] }];
        // 5/3
        const mitte = o.mitte === 'entlueftet' ? { w: [['2', '3'], ['4', '5']], zu: ['1'] }
            : o.mitte === 'belueftet' ? { w: [['1', '2'], ['1', '4']], zu: ['3', '5'] }
            : { w: [], zu: ['1', '2', '3', '4', '5'] };
        return [{ w: [['1', '4'], ['2', '3']], zu: ['5'] }, mitte, { w: [['1', '2'], ['4', '5']], zu: ['3'] }];
    }
    // Steueranschluss nach ISO 5599-3: 12 verbindet 1→2, 14 verbindet 1→4, 10 sperrt 1
    function steuerNummer(st) {
        if (st.w.some(([a, b]) => a === '1' && b === '4')) return '14';
        if (st.w.some(([a, b]) => a === '1' && b === '2')) return '12';
        return '10';
    }
    const BETAETIGUNG = {
        magnet: 'Magnetspule (VALIS-Ausgang)',
        taster: 'Taster (Muskelkraft)',
        pilz: 'Pilztaster',
        hebel: 'Hebel mit Raste (rastend)',
        pedal: 'Pedal',
        rolle: 'Rollenhebel',
        rolle_leer: 'Rollenhebel mit Leerrücklauf',
        pneu: 'Pneumatisch (Steuerdruck)',
        feder: 'Feder'
    };
    const MANUELL = { taster: 1, pilz: 1, hebel: 1, pedal: 1 };
    const KASTEN = 40;

    // Breite des Betätigungssymbols
    const betBreite = b => b === 'feder' ? 16 : b === 'pneu' ? 16 : b === 'magnet' ? 12 : b === 'rolle' || b === 'rolle_leer' ? 18 : 16;

    // Zeichnet ein Betätigungssymbol an x (Kastenkante), Seite s = −1 links / +1 rechts
    function betSymbol(g, b, x, s, aktiv) {
        const w = betBreite(b), x2 = x + s * w, cy = 20;
        const lw = 1.6;
        if (b === 'feder') {
            const pts = [];
            for (let i = 0; i <= 6; i++) pts.push((x + s * (i * w / 6)) + ',' + (cy + (i === 0 || i === 6 ? 0 : (i % 2 ? -7 : 7))));
            el('polyline', { points: pts.join(' '), fill: 'none', stroke: 'currentColor', 'stroke-width': lw }, g);
        } else if (b === 'magnet') {
            const x0 = Math.min(x, x2);
            el('rect', { x: x0, y: cy - 8, width: w, height: 16, fill: aktiv ? 'var(--fp-aktiv)' : 'none', stroke: 'currentColor', 'stroke-width': lw, class: 'fp-bet-magnet' }, g);
            el('line', { x1: x0 + (s < 0 ? w : 0), y1: cy + 8, x2: x0 + (s < 0 ? 0 : w), y2: cy - 8, stroke: 'currentColor', 'stroke-width': lw }, g);
        } else if (b === 'pneu') {
            el('line', { x1: x, y1: cy, x2: x + s * 6, y2: cy, stroke: 'currentColor', 'stroke-width': lw }, g);
            el('rect', { x: Math.min(x + s * 6, x + s * 16), y: cy - 6, width: 10, height: 12, fill: 'none', stroke: 'currentColor', 'stroke-width': lw }, g);
            const tx = x + s * 8;
            el('path', { d: `M${tx},${cy} L${tx + s * 6},${cy - 4} L${tx + s * 6},${cy + 4} Z`, fill: aktiv ? 'var(--fp-aktiv)' : 'currentColor' }, g);
        } else if (b === 'taster') {
            el('line', { x1: x, y1: cy, x2: x2 + s * -2, y2: cy, stroke: 'currentColor', 'stroke-width': lw }, g);
            el('line', { x1: x2 - s * 2, y1: cy - 8, x2: x2 - s * 2, y2: cy + 8, stroke: 'currentColor', 'stroke-width': 2.2, class: 'fp-griff' }, g);
        } else if (b === 'pilz') {
            el('line', { x1: x, y1: cy, x2: x2 - s * 4, y2: cy, stroke: 'currentColor', 'stroke-width': lw }, g);
            el('path', { d: `M${x2 - s * 4},${cy - 8} A8,8 0 0 ${s < 0 ? 0 : 1} ${x2 - s * 4},${cy + 8} Z`, fill: aktiv ? 'var(--fp-aktiv)' : 'none', stroke: 'currentColor', 'stroke-width': lw, class: 'fp-griff' }, g);
        } else if (b === 'hebel') {
            el('line', { x1: x, y1: cy, x2: x + s * 6, y2: cy, stroke: 'currentColor', 'stroke-width': lw }, g);
            el('line', { x1: x + s * 6, y1: cy, x2: x2, y2: cy - 10, stroke: 'currentColor', 'stroke-width': lw, class: 'fp-griff' }, g);
            el('circle', { cx: x2, cy: cy - 10, r: 2.5, fill: 'currentColor' }, g);
            // Raste
            el('path', { d: `M${x + s * 3},${cy + 4} l${s * 2},4 l${s * 2},-4`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }, g);
        } else if (b === 'pedal') {
            el('line', { x1: x, y1: cy, x2: x + s * 8, y2: cy, stroke: 'currentColor', 'stroke-width': lw }, g);
            el('line', { x1: x + s * 8, y1: cy + 8, x2: x2, y2: cy - 8, stroke: 'currentColor', 'stroke-width': 2.2, class: 'fp-griff' }, g);
        } else if (b === 'rolle' || b === 'rolle_leer') {
            el('line', { x1: x, y1: cy, x2: x + s * 10, y2: cy, stroke: 'currentColor', 'stroke-width': lw }, g);
            el('circle', { cx: x + s * 14, cy: cy, r: 4, fill: aktiv ? 'var(--fp-aktiv)' : 'none', stroke: 'currentColor', 'stroke-width': lw }, g);
            if (b === 'rolle_leer') el('path', { d: `M${x + s * 7},${cy - 6} l${s * 3},6 l${-s * 3},6`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
        }
        return w;
    }

    // Katalog: je Typ Name, Grundoptionen, Geometrie (Anschlüsse), Zeichnung
    const TYP = {};

    // ---------- Ventil (Wegeventil) ----------
    TYP.ventil = {
        name: 'Wegeventil', buchstabe: 'V',
        optionen: { wege: '3/2', ruhe: 'zu', mitte: 'gesperrt', links: 'taster', rechts: 'feder', varL: '', varR: '', zyl: '', pos: 'hinten', richt: 'aus', zylR: '', posR: 'vorne', richtR: 'ein' },
        geometrie(t) {
            const o = t.o, st = ventilStellungen(o), n = st.length, heim = n === 3 ? 1 : 1;
            const lage = VLAGE[o.wege] || VLAGE['3/2'];
            const ports = [];
            for (const id in lage.oben) ports.push({ id, x: heim * KASTEN + lage.oben[id], y: -10, dir: [0, -1], art: (id === '2' || id === '4') ? 'a' : 'v' });
            for (const id in lage.unten) ports.push({ id, x: heim * KASTEN + lage.unten[id], y: KASTEN + 10, dir: [0, 1], art: id === '1' ? 'v' : 'r' });
            const wl = betBreite(o.links), wr = betBreite(o.rechts);
            if (o.links === 'pneu') ports.push({ id: steuerNummer(st[0]), x: -wl - 10, y: 20, dir: [-1, 0], art: 's', seite: 'L' });
            if (o.rechts === 'pneu') ports.push({ id: steuerNummer(st[n - 1]), x: n * KASTEN + wr + 10, y: 20, dir: [1, 0], art: 's', seite: 'R' });
            return { ports, box: [-wl - 10, -12, n * KASTEN + wr + 10, KASTEN + 12], heim, n, st };
        },
        zeichne(t, g, geo) {
            const o = t.o;
            // Zuleitungen der Anschlüsse (fest) – Kastenblock beweglich
            for (const p of geo.ports) {
                if (p.art === 's') continue;
                el('line', { x1: p.x, y1: p.y < 0 ? 0 : KASTEN, x2: p.x, y2: p.y, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            }
            const block = el('g', { class: 'fp-block' }, g);
            geo.st.forEach((st, i) => {
                const x0 = i * KASTEN;
                el('rect', { x: x0, y: 0, width: KASTEN, height: KASTEN, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, block);
                const lage = VLAGE[o.wege] || VLAGE['3/2'];
                const pos = id => lage.oben[id] != null ? [x0 + lage.oben[id], 3] : [x0 + lage.unten[id], KASTEN - 3];
                for (const [a, b] of st.w) {
                    const [x1, y1] = pos(a), [x2, y2] = pos(b);
                    const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
                    el('line', { x1, y1, x2: x2 - ux * 5, y2: y2 - uy * 5, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                    el('path', { d: `M${x2},${y2} L${x2 - ux * 7 - uy * 3.5},${y2 - uy * 7 + ux * 3.5} L${x2 - ux * 7 + uy * 3.5},${y2 - uy * 7 - ux * 3.5} Z`, fill: 'currentColor' }, block);
                }
                for (const z of st.zu) {
                    const [x, y] = pos(z), dy = y < 20 ? 1 : -1;
                    el('line', { x1: x, y1: y - dy * 3, x2: x, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                    el('line', { x1: x - 5, y1: y + dy * 7, x2: x + 5, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                }
            });
            const bl = el('g', { class: 'fp-bet-l', 'data-seite': 'L' }, block);
            betSymbol(bl, o.links, 0, -1, false);
            const br = el('g', { class: 'fp-bet-r', 'data-seite': 'R' }, block);
            betSymbol(br, o.rechts, geo.n * KASTEN, 1, false);
            // Steuerleitung vom festen Anschluss zum (wandernden) Betätiger
            for (const p of geo.ports) if (p.art === 's') {
                el('line', { class: 'fp-steuerstich', 'data-seite': p.seite, x1: p.x, y1: 20, x2: p.seite === 'L' ? -betBreite(o.links) : geo.n * KASTEN + betBreite(o.rechts), y2: 20, stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, g);
            }
        }
    };

    // ---------- Zylinder ----------
    const ZYL_L = 110, ZYL_H = 24;
    function kolbenX(s) { return 6 + s * (ZYL_L - 18); }
    TYP.zyl_dw = {
        name: 'Zylinder, doppeltwirkend', buchstabe: 'A', antrieb: true,
        optionen: { d: 20, dStange: 8, hub: 100, last: 0, start: 'hinten', daempfung: false, sensH: '', sensV: '', anlage: '' },
        geometrie() {
            return { ports: [{ id: 'K', x: 14, y: ZYL_H + 10, dir: [0, 1], art: 'a', ohneNr: true }, { id: 'S', x: ZYL_L - 14, y: ZYL_H + 10, dir: [0, 1], art: 'a', ohneNr: true }],
                box: [-2, -16, ZYL_L * 2 - 10, ZYL_H + 12] };
        },
        zeichne(t, g, geo) { zylinderZeichnen(t, g, true); }
    };
    TYP.zyl_ew = {
        name: 'Zylinder, einfachwirkend', buchstabe: 'A', antrieb: true,
        optionen: { d: 20, dStange: 8, hub: 50, last: 0, start: 'hinten', sensH: '', sensV: '', anlage: '' },
        geometrie() {
            return { ports: [{ id: 'K', x: 14, y: ZYL_H + 10, dir: [0, 1], art: 'a', ohneNr: true }], box: [-2, -16, ZYL_L * 2 - 10, ZYL_H + 12] };
        },
        zeichne(t, g, geo) { zylinderZeichnen(t, g, false); }
    };
    function zylinderZeichnen(t, g, dw) {
        el('rect', { x: 0, y: 0, width: ZYL_L, height: ZYL_H, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.8 }, g);
        for (const p of TYP[t.typ].geometrie(t).ports) el('line', { x1: p.x, y1: ZYL_H, x2: p.x, y2: p.y, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
        if (!dw) el('line', { x1: ZYL_L - 8, y1: 0, x2: ZYL_L - 8, y2: -4, stroke: 'currentColor', 'stroke-width': 1.4 }, g);
        if (dw && t.o.daempfung) {
            el('rect', { x: 2, y: ZYL_H / 2 - 4, width: 6, height: 8, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }, g);
            el('rect', { x: ZYL_L - 8, y: ZYL_H / 2 - 4, width: 6, height: 8, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }, g);
        }
        const k = el('g', { class: 'fp-kolben' }, g);
        el('rect', { x: 0, y: 1, width: 4, height: ZYL_H - 2, fill: 'currentColor' }, k);
        el('rect', { x: 4, y: ZYL_H / 2 - 3, width: ZYL_L, height: 6, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, k);
        if (!dw) el('polyline', { class: 'fp-feder', points: '', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
        el('g', { class: 'fp-marken' }, g);
    }
    TYP.schwenk = {
        name: 'Schwenkantrieb', buchstabe: 'A', antrieb: true,
        optionen: { winkel: 180, moment: 2, start: 'hinten', sensH: '', sensV: '' },
        geometrie() {
            return { ports: [{ id: 'K', x: -10, y: 30, dir: [0, 1], art: 'a', ohneNr: true }, { id: 'S', x: 10, y: 30, dir: [0, 1], art: 'a', ohneNr: true }], box: [-22, -24, 22, 32] };
        },
        zeichne(t, g) {
            el('path', { d: 'M-18,8 A18,18 0 0 1 18,8 Z', fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.8 }, g);
            el('line', { x1: -10, y1: 8, x2: -10, y2: 20, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 10, y1: 8, x2: 10, y2: 20, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M-8,-4 A10,10 0 0 1 8,-4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2, 'marker-end': 'url(#fp-pfeil)' }, g);
            el('line', { class: 'fp-zeiger', x1: 0, y1: 8, x2: -16, y2: 8, stroke: 'currentColor', 'stroke-width': 2.2 }, g);
            el('g', { class: 'fp-marken' }, g);
        }
    };

    // ---------- Versorgung ----------
    TYP.quelle = {
        name: 'Druckluftquelle', buchstabe: 'Z', kette: 0,
        optionen: { p: 6 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: -22, dir: [0, -1], art: 'v', ohneNr: true }], box: [-14, -24, 14, 14] }; },
        zeichne(t, g) {
            el('line', { x1: 0, y1: -12, x2: 0, y2: -22, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('circle', { cx: 0, cy: 0, r: 12, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M0,-7 L6,4 L-6,4 Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
        }
    };
    TYP.wartung = {
        name: 'Wartungseinheit', buchstabe: 'Z', kette: 0,
        optionen: { p: 6 },
        geometrie() { return { ports: [{ id: '1', x: -40, y: 0, dir: [-1, 0], art: 'v' }, { id: '2', x: 40, y: 0, dir: [1, 0], art: 'a' }], box: [-42, -26, 42, 18] }; },
        zeichne(t, g) {
            el('rect', { x: -30, y: -18, width: 60, height: 32, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '8 3 2 3' }, g);
            el('line', { x1: -40, y1: 0, x2: -30, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 30, y1: 0, x2: 40, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            // Filter (Raute mit Strich)
            el('path', { d: 'M-24,0 L-17,-8 L-10,0 L-17,8 Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            el('line', { x1: -17, y1: -8, x2: -17, y2: 8, stroke: 'currentColor', 'stroke-width': 1, 'stroke-dasharray': '2 1.5' }, g);
            el('line', { x1: -30, y1: 0, x2: -24, y2: 0, stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            // Druckregler
            el('rect', { x: -6, y: -8, width: 14, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            el('line', { x1: -3, y1: 6, x2: 6, y2: -6, stroke: 'currentColor', 'stroke-width': 1.2, 'marker-end': 'url(#fp-pfeil)' }, g);
            el('line', { x1: -10, y1: 0, x2: -6, y2: 0, stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            el('line', { x1: 8, y1: 0, x2: 30, y2: 0, stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            // Manometer
            el('circle', { cx: 19, cy: -9, r: 5, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
            el('line', { x1: 19, y1: -4, x2: 19, y2: 0, stroke: 'currentColor', 'stroke-width': 1.2 }, g);
            el('line', { x1: 16, y1: -7, x2: 22, y2: -11, stroke: 'currentColor', 'stroke-width': 1 }, g);
        }
    };
    TYP.druckregel = {
        name: 'Druckregelventil', buchstabe: 'V',
        optionen: { p: 4 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 30, dir: [0, 1], art: 'v' }, { id: '2', x: 0, y: -30, dir: [0, -1], art: 'a' }], box: [-16, -32, 22, 32] }; },
        zeichne(t, g) {
            el('line', { x1: 0, y1: 20, x2: 0, y2: 30, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 0, y1: -20, x2: 0, y2: -30, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('rect', { x: -10, y: -20, width: 20, height: 40, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: -3, y1: 16, x2: -3, y2: -14, stroke: 'currentColor', 'stroke-width': 1.3, 'marker-end': 'url(#fp-pfeil)' }, g);
            el('path', { d: 'M3,-20 v6 h-6', fill: 'none', stroke: 'currentColor', 'stroke-width': 1, 'stroke-dasharray': '2 2' }, g);
            el('polyline', { points: '10,4 13,0 17,8 20,0 22,4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
            el('line', { x1: 13, y1: 10, x2: 21, y2: -2, stroke: 'currentColor', 'stroke-width': 1 }, g);
        }
    };
    TYP.manometer = {
        name: 'Manometer', buchstabe: 'Z',
        optionen: {},
        geometrie() { return { ports: [{ id: '1', x: 0, y: 24, dir: [0, 1], art: 'a', ohneNr: true }], box: [-14, -14, 14, 26] }; },
        zeichne(t, g) {
            el('line', { x1: 0, y1: 12, x2: 0, y2: 24, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('circle', { cx: 0, cy: 0, r: 12, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { class: 'fp-nadel', x1: 0, y1: 0, x2: 0, y2: -9, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('text', { class: 'fp-wert', x: 16, y: 4, 'font-size': 9 }, g);
        }
    };
    TYP.daempfer = {
        name: 'Schalldämpfer', buchstabe: '', ohneBez: true,
        optionen: { drossel: false, offen: 100 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: -14, dir: [0, -1], art: 'r', ohneNr: true }], box: [-10, -16, 10, 10] }; },
        zeichne(t, g) {
            el('line', { x1: 0, y1: -4, x2: 0, y2: -14, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M0,-4 L8,4 L0,12 L-8,4 Z', fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('line', { x1: -4, y1: 4, x2: 4, y2: 4, stroke: 'currentColor', 'stroke-width': 1 }, g);
            el('line', { x1: -2, y1: 7, x2: 2, y2: 7, stroke: 'currentColor', 'stroke-width': 1 }, g);
            if (t.o.drossel) el('line', { x1: -9, y1: 10, x2: 9, y2: -2, stroke: 'currentColor', 'stroke-width': 1, 'marker-end': 'url(#fp-pfeil)' }, g);
        }
    };
    TYP.knoten = {
        name: 'Verbindung', buchstabe: '', ohneBez: true,
        optionen: {},
        geometrie() { return { ports: [{ id: 'P', x: 0, y: 0, dir: null, art: 'k', ohneNr: true }], box: [-5, -5, 5, 5] }; },
        zeichne(t, g) { el('circle', { cx: 0, cy: 0, r: 3.2, fill: 'currentColor', class: 'fp-punkt' }, g); }
    };

    // ---------- Sperrventile ----------
    TYP.rueck = {
        name: 'Rückschlagventil', buchstabe: 'V',
        optionen: {},
        geometrie() { return { ports: [{ id: '1', x: 0, y: 24, dir: [0, 1], art: 'a' }, { id: '2', x: 0, y: -24, dir: [0, -1], art: 'a' }], box: [-12, -26, 12, 26] }; },
        zeichne(t, g) { rueckZeichnen(g, 0, 0); el('line', { x1: 0, y1: 6, x2: 0, y2: 24, stroke: 'currentColor', 'stroke-width': 1.6 }, g); el('line', { x1: 0, y1: -7, x2: 0, y2: -24, stroke: 'currentColor', 'stroke-width': 1.6 }, g); }
    };
    function rueckZeichnen(g, x, y) {
        // Kugel auf Sitz: Durchfluss von unten nach oben
        el('circle', { cx: x, cy: y, r: 5, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
        el('path', { d: `M${x - 7},${y - 9} L${x},${y - 2} M${x + 7},${y - 9} L${x},${y - 2}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
        el('line', { x1: x, y1: y + 5, x2: x, y2: y + 6, stroke: 'currentColor', 'stroke-width': 1.4 }, g);
    }
    TYP.wechsel = {
        name: 'Wechselventil (ODER)', buchstabe: 'V',
        optionen: {},
        geometrie() { return { ports: [{ id: 'X', nr: '1', x: -34, y: 0, dir: [-1, 0], art: 'v' }, { id: 'Y', nr: '1', x: 34, y: 0, dir: [1, 0], art: 'v' }, { id: '2', x: 0, y: -22, dir: [0, -1], art: 'a' }], box: [-36, -24, 36, 12] }; },
        zeichne(t, g) {
            el('rect', { x: -24, y: -10, width: 48, height: 20, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: -34, y1: 0, x2: -24, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 24, y1: 0, x2: 34, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 0, y1: -10, x2: 0, y2: -22, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M-20,-7 L-14,0 L-20,7 M20,-7 L14,0 L20,7', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            el('circle', { class: 'fp-kugel', cx: 0, cy: 0, r: 5, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
        }
    };
    TYP.zweidruck = {
        name: 'Zweidruckventil (UND)', buchstabe: 'V',
        optionen: {},
        geometrie() { return { ports: [{ id: 'X', nr: '1', x: -34, y: 0, dir: [-1, 0], art: 'v' }, { id: 'Y', nr: '1', x: 34, y: 0, dir: [1, 0], art: 'v' }, { id: '2', x: 0, y: -22, dir: [0, -1], art: 'a' }], box: [-36, -24, 36, 12] }; },
        zeichne(t, g) {
            el('rect', { x: -24, y: -10, width: 48, height: 20, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: -34, y1: 0, x2: -24, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 24, y1: 0, x2: 34, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 0, y1: -10, x2: 0, y2: -22, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M-16,-10 v20 M16,-10 v20', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            const s = el('g', { class: 'fp-schieber' }, g);
            el('rect', { x: -12, y: -4, width: 24, height: 8, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.3 }, s);
            el('line', { x1: -7, y1: -4, x2: -7, y2: 4, stroke: 'currentColor', 'stroke-width': 1 }, s);
            el('line', { x1: 7, y1: -4, x2: 7, y2: 4, stroke: 'currentColor', 'stroke-width': 1 }, s);
        }
    };
    TYP.schnell = {
        name: 'Schnellentlüftungsventil', buchstabe: 'V',
        optionen: {},
        geometrie() { return { ports: [{ id: '1', x: 0, y: 30, dir: [0, 1], art: 'v' }, { id: '2', x: 0, y: -30, dir: [0, -1], art: 'a' }, { id: '3', x: 30, y: 0, dir: [1, 0], art: 'r' }], box: [-16, -32, 32, 32] }; },
        zeichne(t, g) {
            el('rect', { x: -14, y: -18, width: 28, height: 36, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 0, y1: 18, x2: 0, y2: 30, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 0, y1: -18, x2: 0, y2: -30, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 14, y1: 0, x2: 30, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M-8,12 L0,6 L8,12 M6,-8 L6,8', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            el('circle', { class: 'fp-kugel', cx: 0, cy: 0, r: 5, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('path', { d: 'M17,-4 L22,0 L17,4', fill: 'currentColor' }, g);
        }
    };

    // ---------- Strom- und Druckventile ----------
    TYP.drossel = {
        name: 'Drosselventil', buchstabe: 'V',
        optionen: { offen: 50 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 24, dir: [0, 1], art: 'a' }, { id: '2', x: 0, y: -24, dir: [0, -1], art: 'a' }], box: [-14, -26, 14, 26] }; },
        zeichne(t, g) {
            el('line', { x1: 0, y1: 24, x2: 0, y2: -24, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M-6,-10 Q-1,0 -6,10 M6,-10 Q1,0 6,10', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('line', { x1: -10, y1: 10, x2: 10, y2: -10, stroke: 'currentColor', 'stroke-width': 1.1, 'marker-end': 'url(#fp-pfeil)' }, g);
        }
    };
    TYP.drv = {
        name: 'Drosselrückschlagventil', buchstabe: 'V',
        optionen: { offen: 50 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 34, dir: [0, 1], art: 'a' }, { id: '2', x: 0, y: -34, dir: [0, -1], art: 'a' }], box: [-16, -36, 34, 36] }; },
        zeichne(t, g) {
            el('rect', { x: -12, y: -22, width: 42, height: 44, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '8 3 2 3' }, g);
            el('line', { x1: 0, y1: 34, x2: 0, y2: -34, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M-6,-10 Q-1,0 -6,10 M6,-10 Q1,0 6,10', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('line', { x1: -9, y1: 10, x2: 9, y2: -10, stroke: 'currentColor', 'stroke-width': 1.1, 'marker-end': 'url(#fp-pfeil)' }, g);
            el('path', { d: 'M0,16 H20 V6 M20,-7 V-16 H0', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            rueckZeichnen(g, 20, 1);
        }
    };
    TYP.zeit = {
        name: 'Zeitverzögerungsventil', buchstabe: 'V',
        optionen: { zeit: 3, ruhe: 'zu' },
        geometrie() {
            return { ports: [{ id: '1', x: 50, y: 52, dir: [0, 1], art: 'v' }, { id: '3', x: 70, y: 52, dir: [0, 1], art: 'r' }, { id: '2', x: 60, y: -12, dir: [0, -1], art: 'a' }, { id: '12', x: -36, y: 20, dir: [-1, 0], art: 's' }],
                box: [-38, -14, 98, 54] };
        },
        zeichne(t, g) {
            el('rect', { x: -26, y: -4, width: 118, height: 50, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '8 3 2 3' }, g);
            // Drossel-Rückschlag im Steuerweg
            el('line', { x1: -36, y1: 20, x2: -20, y2: 20, stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, g);
            el('path', { d: 'M-18,14 Q-13,18 -8,14 M-18,26 Q-13,22 -8,26', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
            el('line', { x1: -19, y1: 28, x2: -7, y2: 12, stroke: 'currentColor', 'stroke-width': 1, 'marker-end': 'url(#fp-pfeil)' }, g);
            el('line', { x1: -20, y1: 20, x2: 4, y2: 20, stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, g);
            // Speicher
            el('rect', { class: 'fp-speicher', x: -6, y: 30, width: 14, height: 10, rx: 3, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
            el('line', { x1: 1, y1: 20, x2: 1, y2: 30, stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '3 2' }, g);
            // 3/2-Ventil mit pneumatischer Ansteuerung und Feder
            const o = { wege: '3/2', ruhe: t.o.ruhe === 'offen' ? 'offen' : 'zu', links: 'pneu', rechts: 'feder' };
            const vg = el('g', { transform: 'translate(20,0)' }, g);
            const geo = TYP.ventil.geometrie({ o });
            const fake = { o };
            for (const p of geo.ports) if (p.art !== 's') el('line', { x1: p.x, y1: p.y < 0 ? 0 : KASTEN, x2: p.x, y2: p.y, stroke: 'currentColor', 'stroke-width': 1.6 }, vg);
            const block = el('g', { class: 'fp-block' }, vg);
            const stl = ventilStellungen(o);
            stl.forEach((st, i) => {
                const x0 = i * KASTEN;
                el('rect', { x: x0, y: 0, width: KASTEN, height: KASTEN, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, block);
                const lage = VLAGE['3/2'];
                const pos = id => lage.oben[id] != null ? [x0 + lage.oben[id], 3] : [x0 + lage.unten[id], KASTEN - 3];
                for (const [a, b] of st.w) {
                    const [x1, y1] = pos(a), [x2, y2] = pos(b);
                    const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
                    el('line', { x1, y1, x2: x2 - ux * 5, y2: y2 - uy * 5, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                    el('path', { d: `M${x2},${y2} L${x2 - ux * 7 - uy * 3.5},${y2 - uy * 7 + ux * 3.5} L${x2 - ux * 7 + uy * 3.5},${y2 - uy * 7 - ux * 3.5} Z`, fill: 'currentColor' }, block);
                }
                for (const z of st.zu) {
                    const [x, y] = pos(z), dy = y < 20 ? 1 : -1;
                    el('line', { x1: x, y1: y - dy * 3, x2: x, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                    el('line', { x1: x - 5, y1: y + dy * 7, x2: x + 5, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                }
            });
            betSymbol(block, 'pneu', 0, -1, false);
            betSymbol(block, 'feder', 2 * KASTEN, 1, false);
            void fake;
        }
    };
    // Die Anschlüsse des inneren 3/2-Ventils liegen um 20 nach rechts versetzt
    (function () {
        const g0 = TYP.zeit.geometrie;
        TYP.zeit.geometrie = function (t) {
            const o = { wege: '3/2', ruhe: t && t.o && t.o.ruhe === 'offen' ? 'offen' : 'zu', links: 'pneu', rechts: 'feder' };
            const v = TYP.ventil.geometrie({ o });
            const ports = v.ports.filter(p => p.art !== 's').map(p => Object.assign({}, p, { x: p.x + 20 }));
            ports.push({ id: o.ruhe === 'offen' ? '10' : '12', x: -36, y: 20, dir: [-1, 0], art: 's' });
            const geo = g0();
            geo.ports = ports;
            return geo;
        };
    })();
    TYP.folge = {
        name: 'Druckfolgeventil', buchstabe: 'V',
        optionen: { p: 4, ruhe: 'zu' },
        geometrie(t) {
            const o = { wege: '3/2', ruhe: t && t.o && t.o.ruhe === 'offen' ? 'offen' : 'zu', links: 'pneu', rechts: 'feder' };
            const v = TYP.ventil.geometrie({ o });
            const ports = v.ports.filter(p => p.art !== 's').map(p => Object.assign({}, p, { x: p.x + 20 }));
            ports.push({ id: o.ruhe === 'offen' ? '10' : '12', x: -36, y: 20, dir: [-1, 0], art: 's' });
            return { ports, box: [-38, -14, 98, 54] };
        },
        zeichne(t, g) {
            el('rect', { x: -26, y: -4, width: 118, height: 50, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '8 3 2 3' }, g);
            el('line', { x1: -36, y1: 20, x2: 4, y2: 20, stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, g);
            // Druckventil (Kasten mit Pfeil und einstellbarer Feder)
            el('rect', { x: -22, y: 26, width: 16, height: 16, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
            el('line', { x1: -14, y1: 40, x2: -14, y2: 28, stroke: 'currentColor', 'stroke-width': 1.1, 'marker-end': 'url(#fp-pfeil)' }, g);
            el('line', { x1: -14, y1: 20, x2: -14, y2: 26, stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '2 2' }, g);
            const o = { wege: '3/2', ruhe: t.o.ruhe === 'offen' ? 'offen' : 'zu', links: 'pneu', rechts: 'feder' };
            const vg = el('g', { transform: 'translate(20,0)' }, g);
            ventilInnen(vg, o);
        }
    };
    // Gemeinsame Zeichnung eines kleinen 3/2-Ventils (Zeit-, Folgeventil)
    function ventilInnen(vg, o) {
        const geo = TYP.ventil.geometrie({ o });
        for (const p of geo.ports) if (p.art !== 's') el('line', { x1: p.x, y1: p.y < 0 ? 0 : KASTEN, x2: p.x, y2: p.y, stroke: 'currentColor', 'stroke-width': 1.6 }, vg);
        const block = el('g', { class: 'fp-block' }, vg);
        ventilStellungen(o).forEach((st, i) => {
            const x0 = i * KASTEN;
            el('rect', { x: x0, y: 0, width: KASTEN, height: KASTEN, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, block);
            const lage = VLAGE['3/2'];
            const pos = id => lage.oben[id] != null ? [x0 + lage.oben[id], 3] : [x0 + lage.unten[id], KASTEN - 3];
            for (const [a, b] of st.w) {
                const [x1, y1] = pos(a), [x2, y2] = pos(b);
                const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
                el('line', { x1, y1, x2: x2 - ux * 5, y2: y2 - uy * 5, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                el('path', { d: `M${x2},${y2} L${x2 - ux * 7 - uy * 3.5},${y2 - uy * 7 + ux * 3.5} L${x2 - ux * 7 + uy * 3.5},${y2 - uy * 7 - ux * 3.5} Z`, fill: 'currentColor' }, block);
            }
            for (const z of st.zu) {
                const [x, y] = pos(z), dy = y < 20 ? 1 : -1;
                el('line', { x1: x, y1: y - dy * 3, x2: x, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                el('line', { x1: x - 5, y1: y + dy * 7, x2: x + 5, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
            }
        });
        betSymbol(block, 'pneu', 0, -1, false);
        betSymbol(block, 'feder', 2 * KASTEN, 1, false);
    }
    TYP.zeit.zeichne = function (t, g) {
        el('rect', { x: -26, y: -4, width: 118, height: 50, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '8 3 2 3' }, g);
        el('line', { x1: -36, y1: 20, x2: -20, y2: 20, stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, g);
        el('path', { d: 'M-18,14 Q-13,18 -8,14 M-18,26 Q-13,22 -8,26', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
        el('line', { x1: -19, y1: 28, x2: -7, y2: 12, stroke: 'currentColor', 'stroke-width': 1, 'marker-end': 'url(#fp-pfeil)' }, g);
        el('line', { x1: -8, y1: 20, x2: 4, y2: 20, stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, g);
        el('rect', { class: 'fp-speicher', x: -8, y: 30, width: 16, height: 11, rx: 4, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
        el('line', { x1: 0, y1: 20, x2: 0, y2: 30, stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-dasharray': '3 2' }, g);
        const o = { wege: '3/2', ruhe: t.o.ruhe === 'offen' ? 'offen' : 'zu', links: 'pneu', rechts: 'feder' };
        ventilInnen(el('g', { transform: 'translate(20,0)' }, g), o);
    };
    TYP.dschalter = {
        name: 'Druckschalter (pneumatisch-elektrisch)', buchstabe: 'B',
        optionen: { p: 4, var: '' },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 30, dir: [0, 1], art: 'a', ohneNr: true }], box: [-22, -24, 30, 32] }; },
        zeichne(t, g) {
            el('line', { x1: 0, y1: 30, x2: 0, y2: 12, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('rect', { x: -12, y: -8, width: 24, height: 20, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('polyline', { points: '-8,8 -4,0 0,8 4,0 8,8', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1 }, g);
            // elektrischer Wechsler
            el('path', { class: 'fp-kontakt', d: 'M12,2 H18 L26,-8', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('line', { x1: 26, y1: -12, x2: 26, y2: -4, stroke: 'currentColor', 'stroke-width': 1.4 }, g);
        }
    };

    // ------------------------------------------------------------
    // Palette (Vorlagen)
    // ------------------------------------------------------------
    const PALETTE = [
        { kat: 'Versorgung', teile: [
            { name: 'Druckluftquelle', typ: 'quelle' },
            { name: 'Wartungseinheit', typ: 'wartung' },
            { name: 'Druckregelventil', typ: 'druckregel' },
            { name: 'Manometer', typ: 'manometer' },
            { name: 'Schalldämpfer', typ: 'daempfer' },
            { name: 'Verbindung (T-Stück)', typ: 'knoten' }
        ] },
        { kat: 'Antriebe', teile: [
            { name: 'Zylinder einfachwirkend', typ: 'zyl_ew' },
            { name: 'Zylinder doppeltwirkend', typ: 'zyl_dw' },
            { name: 'Schwenkantrieb', typ: 'schwenk' }
        ] },
        { kat: 'Signalglieder (3/2)', teile: [
            { name: '3/2 Taster', typ: 'ventil', o: { wege: '3/2', links: 'taster', rechts: 'feder' } },
            { name: '3/2 Pilztaster', typ: 'ventil', o: { wege: '3/2', links: 'pilz', rechts: 'feder' } },
            { name: '3/2 Wahlschalter (rastend)', typ: 'ventil', o: { wege: '3/2', links: 'hebel', rechts: 'feder' } },
            { name: '3/2 Rollenhebel', typ: 'ventil', o: { wege: '3/2', links: 'rolle', rechts: 'feder' } },
            { name: '3/2 Rollenhebel, Leerrücklauf', typ: 'ventil', o: { wege: '3/2', links: 'rolle_leer', rechts: 'feder' } },
            { name: '3/2 Taster, offen', typ: 'ventil', o: { wege: '3/2', ruhe: 'offen', links: 'taster', rechts: 'feder' } }
        ] },
        { kat: 'Stellglieder', teile: [
            { name: '3/2 pneumatisch', typ: 'ventil', o: { wege: '3/2', links: 'pneu', rechts: 'feder' } },
            { name: '5/2 pneumatisch, Feder', typ: 'ventil', o: { wege: '5/2', links: 'pneu', rechts: 'feder' } },
            { name: '5/2 Impulsventil (pneum.)', typ: 'ventil', o: { wege: '5/2', links: 'pneu', rechts: 'pneu' } },
            { name: '3/2 Magnet', typ: 'ventil', o: { wege: '3/2', links: 'magnet', rechts: 'feder' } },
            { name: '5/2 Magnet, Feder', typ: 'ventil', o: { wege: '5/2', links: 'magnet', rechts: 'feder' } },
            { name: '5/2 Impulsventil (Magnet)', typ: 'ventil', o: { wege: '5/2', links: 'magnet', rechts: 'magnet' } },
            { name: '5/3 Magnet, Mitte gesperrt', typ: 'ventil', o: { wege: '5/3', links: 'magnet', rechts: 'magnet', mitte: 'gesperrt' } },
            { name: '4/2 Hebel (rastend)', typ: 'ventil', o: { wege: '4/2', links: 'hebel', rechts: 'feder' } },
            { name: '2/2 Taster', typ: 'ventil', o: { wege: '2/2', links: 'taster', rechts: 'feder' } }
        ] },
        { kat: 'Sperrventile', teile: [
            { name: 'Wechselventil (ODER)', typ: 'wechsel' },
            { name: 'Zweidruckventil (UND)', typ: 'zweidruck' },
            { name: 'Rückschlagventil', typ: 'rueck' },
            { name: 'Schnellentlüftungsventil', typ: 'schnell' }
        ] },
        { kat: 'Strom- und Druckventile', teile: [
            { name: 'Drosselventil', typ: 'drossel' },
            { name: 'Drosselrückschlagventil', typ: 'drv' },
            { name: 'Zeitverzögerungsventil', typ: 'zeit' },
            { name: 'Druckfolgeventil', typ: 'folge' },
            { name: 'Druckschalter (elektrisch)', typ: 'dschalter' }
        ] }
    ];

    // ------------------------------------------------------------
    // Zustand
    // ------------------------------------------------------------
    let plan = { v: 1, teile: [], leitungen: [] };
    let auswahl = new Set();          // Teile-IDs und 'L:'+Leitungs-ID
    let undoStapel = [], redoStapel = [];
    let ansicht = { x: -40, y: -40, z: 1 };
    let fenster = null, svg = null, welt = null, ebLeitungen = null, ebTeile = null, ebUi = null;
    let werkzeug = 'auswahl';
    let geoCache = new Map();
    let sim = null;                   // Laufzeitzustand der Simulation
    let gedrueckt = new Set();        // gehaltene Handbetätiger (teilId:Seite)
    let zwischenablage = null;
    let offen = false;

    function geo(t) {
        const key = t.id + '|' + JSON.stringify(t.o) + '|' + t.typ;
        let g = geoCache.get(t.id);
        if (!g || g.key !== key) { g = { key, ...TYP[t.typ].geometrie(t) }; geoCache.set(t.id, g); }
        return g;
    }
    // Lokale Koordinaten → Plan (Drehen in 90°-Schritten, Spiegeln an der y-Achse)
    function trafo(t, x, y) {
        if (t.sp) x = -x;
        const r = ((t.rot || 0) % 360 + 360) % 360;
        let X = x, Y = y;
        if (r === 90) { X = -y; Y = x; } else if (r === 180) { X = -x; Y = -y; } else if (r === 270) { X = y; Y = -x; }
        return [t.x + X, t.y + Y];
    }
    function trafoDir(t, d) {
        if (!d) return null;
        const [x, y] = trafo({ x: 0, y: 0, rot: t.rot, sp: t.sp }, d[0], d[1]);
        return [Math.round(x), Math.round(y)];
    }
    function portLage(t, pid) {
        const p = geo(t).ports.find(q => q.id === pid);
        if (!p) return null;
        const [x, y] = trafo(t, p.x, p.y);
        return { x, y, dir: trafoDir(t, p.dir), art: p.art, p };
    }
    const teil = id => plan.teile.find(t => t.id === id);

    // ------------------------------------------------------------
    // Bezeichnungen (DIN ISO 1219-2: Kette, Buchstabe, Nummer)
    // ------------------------------------------------------------
    function neueBezeichnung(typ) {
        const T = TYP[typ];
        if (T.ohneBez) return '';
        const kette = T.kette != null ? T.kette : 1;
        const b = T.buchstabe || 'V';
        let n = 1;
        const vorhanden = new Set(plan.teile.map(t => t.bez));
        while (vorhanden.has(kette + b + n)) n++;
        // Signalglieder (handbetätigte und Rollenventile) heißen S
        return kette + b + n;
    }
    function bezFuer(typ, o) {
        if (typ === 'ventil' && o && (MANUELL[o.links] || o.links === 'rolle' || o.links === 'rolle_leer') && o.wege === '3/2') {
            let n = 1; const v = new Set(plan.teile.map(t => t.bez));
            while (v.has('1S' + n)) n++;
            return '1S' + n;
        }
        return neueBezeichnung(typ);
    }

    // ------------------------------------------------------------
    // Ändern, Rückgängig, Speichern
    // ------------------------------------------------------------
    function aendern(fn, ohneUndo) {
        if (!ohneUndo) { undoStapel.push(JSON.stringify(plan)); if (undoStapel.length > 100) undoStapel.shift(); redoStapel = []; }
        fn();
        geoCache.clear();
        speichern();
        zeichnen();
        if (sim) sim = null;
    }
    function rueckgaengig() {
        if (!undoStapel.length) return;
        redoStapel.push(JSON.stringify(plan));
        plan = JSON.parse(undoStapel.pop());
        auswahl.clear(); geoCache.clear(); speichern(); zeichnen(); sim = null;
    }
    function wiederholen() {
        if (!redoStapel.length) return;
        undoStapel.push(JSON.stringify(plan));
        plan = JSON.parse(redoStapel.pop());
        auswahl.clear(); geoCache.clear(); speichern(); zeichnen(); sim = null;
    }
    let speicherTimer = null;
    function speichern() {
        if (plan.anlage) { try { anlageAbgleichen(); } catch (e) { console.warn('Fluidplan → 2D', e); } }
        window._fpRoh = planExport();
        clearTimeout(speicherTimer);
        speicherTimer = setTimeout(() => { try { if (typeof saveFactoryState === 'function') saveFactoryState(); } catch (e) {} }, 150);
        status();
    }
    function planExport() {
        if (!plan.teile.length && !plan.leitungen.length) return null;
        return kopie(plan);
    }
    function planImport(p) {
        plan = (p && Array.isArray(p.teile)) ? kopie(p) : { v: 1, teile: [], leitungen: [] };
        if (!Array.isArray(plan.leitungen)) plan.leitungen = [];
        plan.teile.forEach(t => { t.o = Object.assign({}, TYP[t.typ] ? TYP[t.typ].optionen : {}, t.o || {}); });
        plan.teile = plan.teile.filter(t => TYP[t.typ]);
        auswahl.clear(); geoCache.clear(); undoStapel = []; redoStapel = []; sim = null;
        window._fpRoh = planExport();
        if (fenster) { zeichnen(); }
        knopfZustand();
    }

    // ------------------------------------------------------------
    // Leitungsführung
    // ------------------------------------------------------------
    function stich(pl) {
        const d = pl.dir || [0, 0];
        return [pl.x + d[0] * 10, pl.y + d[1] * 10];
    }
    function orthoVerbinden(pts, a, b, dirA) {
        // fügt zwischen a und b Ecken ein, damit nur waagrecht/senkrecht
        if (a[0] === b[0] || a[1] === b[1]) { pts.push(b); return; }
        const senkrecht = dirA ? dirA[0] === 0 : true;
        if (senkrecht) pts.push([a[0], b[1]], b); else pts.push([b[0], a[1]], b);
    }
    function leitungPunkte(l) {
        const ta = teil(l.a.t), tb = teil(l.b.t);
        if (!ta || !tb) return null;
        const A = portLage(ta, l.a.p), B = portLage(tb, l.b.p);
        if (!A || !B) return null;
        const a0 = [A.x, A.y], b0 = [B.x, B.y];
        const a1 = A.dir ? stich(A) : a0, b1 = B.dir ? stich(B) : b0;
        const pts = [a0];
        if (a1 !== a0) pts.push(a1);
        if (Array.isArray(l.pkt) && l.pkt.length) {
            let last = a1, dir = A.dir;
            for (const q of l.pkt) { orthoVerbinden(pts, last, q, dir); dir = last[0] === q[0] ? [0, 1] : [1, 0]; last = q; }
            orthoVerbinden(pts, last, b1, last[0] === b1[0] ? [0, 1] : [1, 0]);
        } else {
            const da = A.dir || [0, 0], db = B.dir || [0, 0];
            const vA = da[0] === 0 && da[1] !== 0, vB = db[0] === 0 && db[1] !== 0;
            if (a1[0] === b1[0] || a1[1] === b1[1]) pts.push(b1);
            else if (vA && vB) { const my = snap((a1[1] + b1[1]) / 2); pts.push([a1[0], my], [b1[0], my], b1); }
            else if (!vA && !vB && (da[0] || db[0])) { const mx = snap((a1[0] + b1[0]) / 2); pts.push([mx, a1[1]], [mx, b1[1]], b1); }
            else if (vA) pts.push([a1[0], b1[1]], b1);
            else pts.push([b1[0], a1[1]], b1);
        }
        if (b1 !== b0) pts.push(b0);
        // doppelte Punkte entfernen, gerade Zwischenpunkte zusammenfassen
        const out = [];
        for (const p of pts) {
            const l2 = out[out.length - 1];
            if (l2 && l2[0] === p[0] && l2[1] === p[1]) continue;
            if (out.length >= 2) {
                const p0 = out[out.length - 2], p1 = out[out.length - 1];
                if ((p0[0] === p1[0] && p1[0] === p[0]) || (p0[1] === p1[1] && p1[1] === p[1])) out.pop();
            }
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------
    // Fenster und Oberfläche
    // ------------------------------------------------------------
    const CSS = `
    #fp-fenster{position:fixed;left:8vw;top:9vh;width:min(1100px,84vw);height:min(720px,80vh);z-index:9000;display:none;flex-direction:column;
        background:#1e1e1e;border:1px solid #555;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.55);font-family:'Segoe UI',system-ui,sans-serif;color:#ddd;
        --fp-papier:#fff;--fp-linie:#263238;--fp-druck:#1565c0;--fp-aktiv:#ffb300;--fp-wahl:#ff6f00;}
    #fp-fenster.fp-max{left:0!important;top:0!important;width:100vw!important;height:100vh!important;border-radius:0}
    #fp-fenster *{box-sizing:border-box}
    .fp-kopf{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#2d2d30;border-bottom:1px solid #444;cursor:move;border-radius:8px 8px 0 0;user-select:none}
    .fp-kopf b{font-size:13px;color:#fff}
    .fp-kopf .fp-sub{font-size:11px;color:#9e9e9e}
    .fp-kopf .fp-r{margin-left:auto;display:flex;gap:4px}
    .fp-btn{background:#3a3a3d;color:#eee;border:1px solid #555;border-radius:4px;padding:3px 9px;font-size:12px;cursor:pointer;white-space:nowrap}
    .fp-btn:hover{background:#4a4a4f}
    .fp-btn.an{background:#ff6f00;border-color:#ff8f00;color:#fff}
    .fp-btn.sim{background:#e6194B;border-color:#e6194B;color:#fff}
    .fp-btn.sim.an{background:#555;border-color:#777}
    .fp-btn:disabled{opacity:.4;cursor:default}
    .fp-leiste{display:flex;flex-wrap:wrap;gap:4px;padding:5px 8px;background:#252526;border-bottom:1px solid #3a3a3a;align-items:center}
    .fp-trenner{width:1px;align-self:stretch;background:#444;margin:0 3px}
    .fp-haupt{flex:1;display:flex;min-height:0;position:relative}
    .fp-palette{width:200px;overflow-y:auto;background:#252526;border-right:1px solid #3a3a3a;padding:4px 0}
    .fp-kat{padding:6px 10px 3px;color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-weight:bold}
    .fp-pal{display:flex;align-items:center;gap:6px;margin:2px 6px;padding:3px 5px;border-radius:4px;cursor:grab;font-size:11.5px;color:#ddd;border:1px solid transparent;user-select:none}
    .fp-pal:hover{background:#37373d;border-color:#555}
    .fp-pal svg{flex:none;width:46px;height:30px;background:#fff;border-radius:3px;color:#263238}
    .fp-flaeche{flex:1;position:relative;min-width:0;background:#fafafa}
    .fp-flaeche svg.fp-svg{width:100%;height:100%;display:block;color:var(--fp-linie);user-select:none;touch-action:none}
    .fp-eigen{position:absolute;right:0;top:0;bottom:0;z-index:3;box-shadow:-4px 0 12px rgba(0,0,0,.25);width:230px;box-sizing:border-box;overflow-y:auto;background:#252526;border-left:1px solid #3a3a3a;padding:8px 10px;font-size:12px;display:none}
    .fp-eigen.offen{display:block}
    .fp-eigen h4{margin:0 0 6px;font-size:12px;color:#ffb74d}
    .fp-eigen label{display:block;color:#aaa;font-size:10.5px;margin:7px 0 2px}
    .fp-eigen input,.fp-eigen select{width:100%;padding:3px 5px;background:#1e1e1e;color:#fff;border:1px solid #555;border-radius:3px;font-size:12px}
    .fp-eigen input[type=checkbox]{width:auto}
    .fp-eigen .fp-hinw{color:#888;font-size:10.5px;margin-top:8px;line-height:1.35}
    .fp-diag{display:none;height:170px;flex:none;background:#fff;border-top:1px solid #3a3a3a;position:relative;overflow:hidden}
    .fp-diag.offen{display:block}
    .fp-diag > svg{width:100%;height:100%;display:block;font-family:'Segoe UI',sans-serif}
    .fp-diag .fp-dkopf{position:absolute;right:6px;bottom:3px;display:flex;gap:4px;z-index:1}
    .fp-diag .fp-dkopf button{all:unset;box-sizing:border-box;font:11px/1.5 'Segoe UI',sans-serif;padding:1px 8px;border:1px solid #b0bec5;background:#eceff1;border-radius:3px;cursor:pointer;color:#263238}
    .fp-diag .fp-dkopf button.an{background:#ff6f00;border-color:#ff6f00;color:#fff}
    .fp-fuss{padding:4px 10px;font-size:11px;color:#9e9e9e;background:#252526;border-top:1px solid #3a3a3a;min-height:22px;border-radius:0 0 8px 8px}
    .fp-fuss b{color:#ffb74d}
    .fp-griffecke{position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;
        background:linear-gradient(135deg,transparent 50%,#666 50%,#666 58%,transparent 58%,transparent 70%,#666 70%,#666 78%,transparent 78%)}
    svg.fp-svg .fp-teil{cursor:move}
    svg.fp-svg .fp-teil.gewaehlt{color:var(--fp-wahl)}
    svg.fp-svg .fp-port{fill:#fff;stroke:#90a4ae;stroke-width:1;cursor:crosshair}
    svg.fp-svg .fp-port:hover,svg.fp-svg .fp-port.ziel{fill:#ffb300;stroke:#ff6f00}
    svg.fp-svg .fp-port.frei{fill:#fff}
    svg.fp-svg.sim .fp-port{display:none}
    svg.fp-svg .fp-leitung{fill:none;stroke:var(--fp-linie);stroke-width:1.6}
    svg.fp-svg .fp-leitung.steuer{stroke-dasharray:6 4}
    svg.fp-svg .fp-leitung.druck{stroke:var(--fp-druck);stroke-width:2.6}
    svg.fp-svg .fp-leitung.gewaehlt{stroke:var(--fp-wahl)}
    svg.fp-svg .fp-treffer{fill:none;stroke:transparent;stroke-width:10;cursor:pointer}
    svg.fp-svg .fp-bez{font:bold 11px 'Segoe UI',sans-serif;fill:#263238}
    svg.fp-svg .fp-pnr{font:9px 'Segoe UI',sans-serif;fill:#607d8b}
    svg.fp-svg .fp-var{font:10px Consolas,monospace;fill:#1565c0}
    svg.fp-svg .fp-wert{font:10px Consolas,monospace;fill:#1565c0}
    svg.fp-svg .fp-marke{font:10px 'Segoe UI',sans-serif;fill:#263238}
    svg.fp-svg.sim .fp-griff,svg.fp-svg.sim .fp-hand{cursor:pointer}
    svg.fp-svg .fp-hand{fill:transparent}
    svg.fp-svg .fp-hand:hover{fill:rgba(255,179,0,.25)}
    svg.fp-svg .fp-ablass{fill:#90caf9;opacity:.8}
    svg.fp-svg .fp-warnung{fill:#e53935;font:bold 11px sans-serif}
    .fp-pruef{position:absolute;right:10px;top:10px;max-width:340px;max-height:60%;overflow:auto;background:#fff;color:#263238;border:1px solid #b0bec5;border-radius:6px;padding:8px 10px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.2)}
    .fp-pruef h5{margin:0 0 4px;font-size:12px}
    .fp-pruef li{margin:2px 0}
    .fp-hilfe{position:absolute;left:10px;bottom:10px;max-width:440px;background:#fff;color:#263238;border:1px solid #b0bec5;border-radius:6px;padding:8px 12px;font-size:12px;line-height:1.45;box-shadow:0 4px 16px rgba(0,0,0,.2)}
    .fp-hilfe kbd{background:#eceff1;border:1px solid #b0bec5;border-radius:3px;padding:0 4px;font-size:11px}
    `;

    function fensterBauen() {
        if (fenster) return;
        const st = h('style', { id: 'fp-css' }); st.textContent = CSS; document.head.appendChild(st);
        fenster = h('div', { id: 'fp-fenster', tabindex: '-1' }, document.body);
        const kopf = h('div', { class: 'fp-kopf' }, fenster);
        h('b', { text: '💨 Fluidplan' }, kopf);
        h('span', { class: 'fp-sub', text: 'Pneumatik nach DIN ISO 1219 · zeichnen und simulieren' }, kopf);
        const r = h('div', { class: 'fp-r' }, kopf);
        h('button', { class: 'fp-btn', title: 'Bedienung kurz erklärt', text: 'ℹ️ Hilfe', onclick: hilfeZeigen }, r);
        h('button', { class: 'fp-btn', title: 'Fenster groß / klein', text: '⛶', onclick: () => { fenster.classList.toggle('fp-max'); } }, r);
        h('button', { class: 'fp-btn', title: 'Schließen (der Plan bleibt gespeichert und läuft in der Simulation weiter)', text: '✕', onclick: schliessen }, r);
        ziehbar(kopf);

        const leiste = h('div', { class: 'fp-leiste' }, fenster);
        const k = (txt, title, fn, id) => h('button', { class: 'fp-btn', title, text: txt, onclick: fn, id }, leiste);
        k('🖱 Auswahl', 'Auswählen und verschieben. Leitungen ziehst du immer von einem Anschluss (kleiner Kreis) zum nächsten.', () => werkzeugSetzen('auswahl'), 'fp-w-auswahl');
        k('🩹 Löschen', 'Klick auf Bauteil oder Leitung löscht es', () => werkzeugSetzen('loeschen'), 'fp-w-loeschen');
        h('span', { class: 'fp-trenner' }, leiste);
        k('⟳ Drehen', 'Auswahl um 90° drehen (Taste R)', () => drehen(90));
        k('⇋ Spiegeln', 'Auswahl spiegeln (Taste M)', spiegeln);
        k('🗑', 'Auswahl löschen (Entf)', auswahlLoeschen);
        k('↶', 'Rückgängig (Strg+Z)', rueckgaengig, 'fp-undo');
        k('↷', 'Wiederholen (Strg+Y)', wiederholen, 'fp-redo');
        h('span', { class: 'fp-trenner' }, leiste);
        k('−', 'Verkleinern', () => zoom(1 / 1.2));
        k('⊡', 'Plan einpassen', einpassen);
        k('+', 'Vergrößern', () => zoom(1.2));
        h('span', { class: 'fp-trenner' }, leiste);
        k('✓ Prüfen', 'Plan prüfen: offene Anschlüsse, fehlende Variablen, Rollen ohne Zylinder', pruefen);
        k('📸 SVG', 'Plan als SVG-Bild speichern', svgSpeichern);
        k('📂 Beispiele', 'Fertige Beispielschaltungen laden', () => { auswahl.clear(); zeichnen(); beispieleZeigen(); });
        k('🩺 Messen', 'Manometer an Leitungen anstecken und den Druck ablesen (auch während der Simulation und in der Fehlersuche)', messUmschalten, 'fp-mess');
        k('🔍 Fehlersuche', 'Versteckte Fehler einbauen (Lehrkraft) oder suchen und melden (Lernende)', () => { auswahl.clear(); zeichnen(); fehlersucheZeigen(); }, 'fp-fs');
        k('📈 Diagramm', 'Weg-Schritt-Diagramm der Zylinder ein-/ausblenden. Es zeichnet während der Simulation mit.', () => { diagBox.classList.toggle('offen'); const b = document.getElementById('fp-diagk'); if (b) b.classList.toggle('an', diagBox.classList.contains('offen')); diagZeichnen(true); }, 'fp-diagk');
        k('🧹 Leeren', 'Ganzen Plan löschen', () => { if (plan.fehlersuche && fehlerAnzahl()) { status('In der Fehlersuche bleibt der Plan, wie er ist.'); return; } if (plan.teile.length && confirm('Den ganzen Fluidplan löschen?')) aendern(() => { plan.teile = []; plan.leitungen = []; auswahl.clear(); }); });
        h('span', { class: 'fp-trenner' }, leiste);
        k('🏭 2D-Anlage: aus', 'Plan mit der 2D-Anlage verbinden: Zylinder, Stellglieder, Drosseln und Versorgung entstehen dort als 2D-Teile, der Auto-Schaltplan passt dann zum Fluidplan. Eine Wahrheit: geändert wird nur hier.', anlageUmschalten, 'fp-anlage');
        k('⇐ Aus 2D-Anlage', 'Pneumatik der 2D-Anlage als Startplan übernehmen (ersetzt den Plan)', () => { const n = ausAnlage(); if (n) status(n + ' Zylinder aus der 2D-Anlage übernommen.'); });
        h('span', { class: 'fp-trenner' }, leiste);
        k('▶ Simulation', 'Simulation starten/stoppen (wie der Knopf oben rechts). Beim Start beginnt der Plan in der Grundstellung.', () => { if (typeof window.toggleSimulation === 'function') window.toggleSimulation(); }, 'fp-sim');
        k('⟲ Grundstellung', 'Drücke, Zylinder und Ventile auf den Anfang zurücksetzen', () => { sim = null; simInit(); aufzNeu(); darstellen(); diagZeichnen(true); });

        const haupt = h('div', { class: 'fp-haupt' }, fenster);
        const pal = h('div', { class: 'fp-palette' }, haupt);
        paletteBauen(pal);
        const fl = h('div', { class: 'fp-flaeche' }, haupt);
        svg = el('svg', { class: 'fp-svg' }, fl);
        const defs = el('defs', {}, svg);
        const m = el('marker', { id: 'fp-pfeil', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor' }, m);
        const pat = el('pattern', { id: 'fp-raster', width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, defs);
        el('circle', { cx: 0.5, cy: 0.5, r: 0.7, fill: '#cfd8dc' }, pat);
        el('rect', { class: 'fp-hg', x: -5000, y: -5000, width: 10000, height: 10000, fill: 'url(#fp-raster)' }, svg);
        welt = el('g', { class: 'fp-welt' }, svg);
        ebLeitungen = el('g', {}, welt);
        ebTeile = el('g', {}, welt);
        ebUi = el('g', {}, welt);
        ebMess = el('g', { class: 'fp-messen' }, welt);
        const eigen = h('div', { class: 'fp-eigen', id: 'fp-eigen' }, haupt);
        void eigen;
        diagBox = h('div', { class: 'fp-diag', id: 'fp-diag' }, fenster);
        const dk = h('div', { class: 'fp-dkopf' }, diagBox);
        h('button', { text: 'Weg-Schritt', id: 'fp-d-schritt', class: 'an', title: 'Waagrecht die Schritte: ein neuer Schritt beginnt, sobald ein Zylinder eine Endlage erreicht', onclick: () => { diagArt = 'schritt'; diagZeichnen(true); } }, dk);
        h('button', { text: 'Weg-Zeit', id: 'fp-d-zeit', title: 'Waagrecht die Zeit in Sekunden', onclick: () => { diagArt = 'zeit'; diagZeichnen(true); } }, dk);
        h('button', { text: '📸 SVG', title: 'Diagramm als SVG-Bild speichern', onclick: diagSvgSpeichern }, dk);
        diagSvg = el('svg', {}, diagBox);
        h('div', { class: 'fp-fuss', id: 'fp-fuss' }, fenster);
        h('div', { class: 'fp-griffecke' }, fenster).addEventListener('pointerdown', groesseZiehen);
        zeigerEinrichten();
        fenster.addEventListener('keydown', tasten);
        svg.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e); }, { passive: false });
        werkzeugSetzen('auswahl');
    }

    function ziehbar(kopf) {
        kopf.addEventListener('pointerdown', e => {
            if (e.target.closest('button') || fenster.classList.contains('fp-max')) return;
            const r = fenster.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
            const mv = ev => { fenster.style.left = Math.max(0, ev.clientX - dx) + 'px'; fenster.style.top = Math.max(0, ev.clientY - dy) + 'px'; };
            const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        });
    }
    function groesseZiehen(e) {
        e.preventDefault();
        const r = fenster.getBoundingClientRect();
        const mv = ev => { fenster.style.width = Math.max(520, ev.clientX - r.left) + 'px'; fenster.style.height = Math.max(360, ev.clientY - r.top) + 'px'; ansichtSetzen(); };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    }

    function paletteBauen(pal) {
        for (const kat of PALETTE) {
            h('div', { class: 'fp-kat', text: kat.kat }, pal);
            for (const v of kat.teile) {
                const d = h('div', { class: 'fp-pal', title: v.name + ' – ziehen oder anklicken und in den Plan klicken' }, pal);
                const ic = el('svg', {}, d);
                const t = { id: 'vorschau', typ: v.typ, x: 0, y: 0, rot: 0, o: Object.assign({}, TYP[v.typ].optionen, v.o || {}) };
                const gg = TYP[v.typ].geometrie(t);
                const b = gg.box;
                ic.setAttribute('viewBox', `${b[0] - 4} ${b[1] - 4} ${b[2] - b[0] + 8} ${b[3] - b[1] + 8}`);
                TYP[v.typ].zeichne(t, el('g', {}, ic), gg);
                h('span', { text: v.name }, d);
                d.addEventListener('pointerdown', e => paletteZiehen(e, v));
            }
        }
    }

    // ------------------------------------------------------------
    // Zeichnen
    // ------------------------------------------------------------
    const dyn = new Map();   // teilId -> Referenzen für die Live-Anzeige
    function zeichnen() {
        if (!svg) return;
        ebLeitungen.innerHTML = ''; ebTeile.innerHTML = ''; ebUi.innerHTML = '';
        dyn.clear();
        svg.classList.toggle('sim', simLaeuft());
        // Leitungen
        const belegt = new Map();
        for (const l of plan.leitungen) {
            const pts = leitungPunkte(l);
            if (!pts) continue;
            const d = 'M' + pts.map(p => p.join(',')).join(' L');
            const gw = auswahl.has('L:' + l.id);
            const istSteuer = [l.a, l.b].some(e => { const tt = teil(e.t); const pl = tt && portLage(tt, e.p); return pl && pl.art === 's'; });
            const pfad = el('path', { d, class: 'fp-leitung' + (istSteuer ? ' steuer' : '') + (gw ? ' gewaehlt' : ''), 'data-l': l.id }, ebLeitungen);
            el('path', { d, class: 'fp-treffer', 'data-l': l.id }, ebLeitungen);
            dyn.set('L:' + l.id, pfad);
            for (const e of [l.a, l.b]) { const k = e.t + ':' + e.p; belegt.set(k, (belegt.get(k) || 0) + 1); }
        }
        // Teile
        for (const t of plan.teile) {
            const T = TYP[t.typ]; if (!T) continue;
            const gg = geo(t);
            const r = ((t.rot || 0) % 360 + 360) % 360;
            const tr = `translate(${t.x},${t.y}) rotate(${r})${t.sp ? ' scale(-1,1)' : ''}`;
            const g = el('g', { class: 'fp-teil' + (auswahl.has(t.id) ? ' gewaehlt' : ''), transform: tr, 'data-t': t.id }, ebTeile);
            el('rect', { x: gg.box[0], y: gg.box[1], width: gg.box[2] - gg.box[0], height: gg.box[3] - gg.box[1], fill: 'transparent' }, g);
            T.zeichne(t, g, gg);
            const ref = { g, block: g.querySelector('.fp-block'), kolben: g.querySelector('.fp-kolben'), feder: g.querySelector('.fp-feder'),
                nadel: g.querySelector('.fp-nadel'), wert: g.querySelector('.fp-wert'), kugel: g.querySelector('.fp-kugel'), schieber: g.querySelector('.fp-schieber'),
                zeiger: g.querySelector('.fp-zeiger'), marken: g.querySelector('.fp-marken'), speicher: g.querySelector('.fp-speicher'), geo: gg };
            dyn.set(t.id, ref);
            // Handbetätiger anklickbar machen (Fläche über dem Betätiger)
            if (t.typ === 'ventil') {
                for (const seite of ['L', 'R']) {
                    const b = seite === 'L' ? t.o.links : t.o.rechts;
                    if (!MANUELL[b] && b !== 'magnet') continue;
                    const w = betBreite(b) + 6;
                    const x = seite === 'L' ? -w : gg.n * KASTEN;
                    const bet = g.querySelector(seite === 'L' ? '.fp-bet-l' : '.fp-bet-r');
                    if (bet) el('rect', { class: 'fp-hand', x, y: 4, width: w, height: 32, 'data-t': t.id, 'data-seite': seite }, bet);
                }
            }
            // Beschriftung (nicht mitgedreht)
            if (t.bez) {
                const bb = boxWelt(t);
                // Zylinder und Wegeventile: links über dem Symbol, kleine Teile rechts daneben
                const oben = t.typ === 'zyl_dw' || t.typ === 'zyl_ew' || t.typ === 'ventil' || t.typ === 'zeit' || t.typ === 'folge';
                if (oben) el('text', { class: 'fp-bez', x: bb[0] + (t.typ === 'ventil' ? 10 : 0), y: bb[1] - 2 }, ebTeile).textContent = t.bez;
                else el('text', { class: 'fp-bez', x: bb[2] + 2, y: bb[1] + 10 }, ebTeile).textContent = t.bez;
            }
            // Variablen an Spulen / Druckschalter
            if (t.typ === 'ventil') {
                const bb = boxWelt(t);
                const vs = [];
                if (t.o.links === 'magnet') vs.push(t.o.varL || '?');
                if (t.o.rechts === 'magnet') vs.push(t.o.varR || '?');
                if (vs.length) el('text', { class: 'fp-var', x: bb[0], y: bb[3] + 12 }, ebTeile).textContent = vs.join(' · ');
            }
            if (t.typ === 'dschalter') {
                const bb = boxWelt(t);
                el('text', { class: 'fp-var', x: bb[0], y: bb[3] + 12 }, ebTeile).textContent = (t.o.var || '?') + ' ≥ ' + t.o.p + ' bar';
            }
            // Anschlussnummern
            for (const p of gg.ports) {
                if (p.ohneNr) continue;
                const [x, y] = trafo(t, p.x, p.y);
                const d = trafoDir(t, p.dir) || [0, 0];
                const nx = x - d[0] * 6 + (d[1] !== 0 ? 4 : 0), ny = y - d[1] * 6 + (d[0] !== 0 ? -3 : 3);
                el('text', { class: 'fp-pnr', x: nx, y: ny }, ebTeile).textContent = p.nr || p.id;
            }
        }
        // Rollen- und Sensormarken an den Zylindern
        markenZeichnen();
        // Anschlusskreise
        for (const t of plan.teile) {
            for (const p of geo(t).ports) {
                const [x, y] = trafo(t, p.x, p.y);
                const n = belegt.get(t.id + ':' + p.id) || 0;
                if (t.typ === 'knoten' && n) continue;
                el('circle', { class: 'fp-port' + (n ? '' : ' frei'), cx: x, cy: y, r: n ? 2.5 : 3.5, 'data-t': t.id, 'data-p': p.id }, ebUi);
            }
        }
        // Verzweigungspunkte an Anschlüssen mit mehreren Leitungen
        for (const [k, n] of belegt) if (n > 1) {
            const [tid, pid] = k.split(':');
            const tt = teil(tid); if (!tt || tt.typ === 'knoten') continue;
            const pl = portLage(tt, pid); if (pl) el('circle', { cx: pl.x, cy: pl.y, r: 3.2, fill: 'currentColor' }, ebLeitungen);
        }
        fehlerMarken();
        ansichtSetzen();
        eigenschaften();
        knopfZustand();
        status();
        darstellen();
    }
    // Fehlersuche: Lehrkraft sieht die Fehler (rot), Lernende ihre Meldungen (orange)
    // und gefundene Fehler (grün)
    function fehlerMarken() {
        const markiere = (key, farbe, text) => {
            let b;
            if (key.startsWith('L:')) {
                const l = plan.leitungen.find(q => 'L:' + q.id === key); const pts = l && leitungPunkte(l); if (!pts) return;
                el('path', { d: 'M' + pts.map(p => p.join(',')).join(' L'), fill: 'none', stroke: farbe, 'stroke-width': 6, opacity: 0.35, 'pointer-events': 'none' }, ebUi);
                const m = pts[Math.floor(pts.length / 2)]; b = [m[0] - 4, m[1] - 4, m[0] + 4, m[1] + 4];
            } else {
                const t = teil(key); if (!t) return;
                b = boxWelt(t);
                el('rect', { x: b[0] - 4, y: b[1] - 4, width: b[2] - b[0] + 8, height: b[3] - b[1] + 8, rx: 5, fill: 'none', stroke: farbe, 'stroke-width': 2, 'stroke-dasharray': '5 3', 'pointer-events': 'none' }, ebUi);
            }
            if (text) { const e = el('text', { x: b[0], y: b[3] + 14, 'font-size': 10, 'font-weight': 'bold', fill: farbe, 'pointer-events': 'none' }, ebUi); e.textContent = text; }
        };
        if (!plan.fehlersuche) { for (const k of Object.keys(plan.fehler || {})) markiere(k, '#d32f2f', '⚡ ' + fehlerName(k)); return; }
        for (const k of plan.verdacht || []) markiere(k, '#ff6f00', '? Verdacht');
        for (const k of plan.behoben || []) if ((plan.fehler || {})[k]) markiere(k, '#2e7d32', '✓ ' + fehlerName(k));
    }
    function boxWelt(t) {
        const b = geo(t).box;
        const c = [trafo(t, b[0], b[1]), trafo(t, b[2], b[1]), trafo(t, b[0], b[3]), trafo(t, b[2], b[3])];
        return [Math.min(...c.map(p => p[0])), Math.min(...c.map(p => p[1])), Math.max(...c.map(p => p[0])), Math.max(...c.map(p => p[1]))];
    }
    // Marken (Rollenventile, Sensoren) an der Kolbenstange
    function markenFuer(z) {
        const m = [];
        for (const t of plan.teile) {
            if (t.typ !== 'ventil') continue;
            if ((t.o.links === 'rolle' || t.o.links === 'rolle_leer') && t.o.zyl === z.id) m.push({ pos: t.o.pos, name: t.bez || '?', leer: t.o.links === 'rolle_leer', richt: t.o.richt });
            if ((t.o.rechts === 'rolle' || t.o.rechts === 'rolle_leer') && t.o.zylR === z.id) m.push({ pos: t.o.posR, name: t.bez || '?', leer: t.o.rechts === 'rolle_leer', richt: t.o.richtR });
        }
        if (z.o.sensH) m.push({ pos: 'hinten', name: z.o.sensH, el: true });
        if (z.o.sensV) m.push({ pos: 'vorne', name: z.o.sensV, el: true });
        return m;
    }
    function posAnteil(z, pos) {
        if (pos === 'hinten') return 0;
        if (pos === 'vorne') return 1;
        const hub = zylHub(z);
        return Math.max(0, Math.min(1, zahl(pos, 0) / hub));
    }
    const zylHub = z => z.typ === 'schwenk' ? zahl(z.o.winkel, 180) : zahl(z.o.hub, 100);
    function markenZeichnen() {
        for (const z of plan.teile) {
            if (z.typ !== 'zyl_dw' && z.typ !== 'zyl_ew') continue;
            const ref = dyn.get(z.id); if (!ref || !ref.marken) continue;
            const ms = markenFuer(z);
            // gleiche Position nebeneinander
            const zaehl = {};
            for (const m of ms) {
                const s = posAnteil(z, m.pos);
                const x = kolbenX(s) + ZYL_L + 4;
                const key = Math.round(x);
                const k = zaehl[key] = (zaehl[key] || 0) + 1;
                const y = -6 - (k - 1) * 12;
                el('line', { x1: x, y1: -2, x2: x, y2: y - 2, stroke: 'currentColor', 'stroke-width': 1.2 }, ref.marken);
                if (m.leer) el('path', { d: `M${x - 3},${y + 1} l3,-4 l3,4`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }, ref.marken);
                const tx = el('text', { class: 'fp-marke', x: x + 3, y: y, transform: z.sp ? `scale(-1,1) translate(${-2 * (x + 3)},0)` : null }, ref.marken);
                tx.textContent = m.name;
                if (m.el) tx.setAttribute('fill', '#1565c0');
            }
        }
    }

    // ------------------------------------------------------------
    // Ansicht (Zoom, Verschieben)
    // ------------------------------------------------------------
    function ansichtSetzen() {
        if (!svg) return;
        const r = svg.getBoundingClientRect();
        const w = Math.max(50, r.width) / ansicht.z, hh = Math.max(50, r.height) / ansicht.z;
        svg.setAttribute('viewBox', `${ansicht.x} ${ansicht.y} ${w} ${hh}`);
    }
    function zoom(f, e) {
        const r = svg.getBoundingClientRect();
        const cx = e ? e.clientX - r.left : r.width / 2, cy = e ? e.clientY - r.top : r.height / 2;
        const wx = ansicht.x + cx / ansicht.z, wy = ansicht.y + cy / ansicht.z;
        ansicht.z = Math.max(0.25, Math.min(5, ansicht.z * f));
        ansicht.x = wx - cx / ansicht.z; ansicht.y = wy - cy / ansicht.z;
        ansichtSetzen();
    }
    function einpassen() {
        if (!svg) return;
        if (!plan.teile.length) { ansicht = { x: -40, y: -40, z: 1 }; ansichtSetzen(); return; }
        let b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const t of plan.teile) { const q = boxWelt(t); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1] - 30), Math.max(b[2], q[2] + 30), Math.max(b[3], q[3] + 16)]; }
        const r = svg.getBoundingClientRect();
        const z = Math.min(2, Math.max(0.3, Math.min(r.width / (b[2] - b[0] + 80), r.height / (b[3] - b[1] + 80))));
        ansicht.z = z;
        ansicht.x = (b[0] + b[2]) / 2 - r.width / z / 2;
        ansicht.y = (b[1] + b[3]) / 2 - r.height / z / 2;
        ansichtSetzen();
    }
    function weltPunkt(e) {
        const r = svg.getBoundingClientRect();
        return [ansicht.x + (e.clientX - r.left) / ansicht.z, ansicht.y + (e.clientY - r.top) / ansicht.z];
    }

    // ------------------------------------------------------------
    // Bedienung mit Maus / Stift / Finger
    // ------------------------------------------------------------
    let zug = null;   // laufende Zieh-Aktion
    function werkzeugSetzen(w) {
        werkzeug = w;
        ['auswahl', 'loeschen'].forEach(x => { const b = document.getElementById('fp-w-' + x); if (b) b.classList.toggle('an', x === w); });
        status();
    }
    function zeigerEinrichten() {
        svg.addEventListener('contextmenu', e => e.preventDefault());
        svg.addEventListener('pointerdown', e => {
            fenster.focus({ preventScroll: true });
            const [wx, wy] = weltPunkt(e);
            // Verschieben der Ansicht: mittlere/rechte Taste
            if (e.button === 1 || e.button === 2) {
                zug = { art: 'pan', sx: e.clientX, sy: e.clientY, ax: ansicht.x, ay: ansicht.y };
                svg.setPointerCapture(e.pointerId); return;
            }
            const ziel = e.target;
            if (messModus || (ziel.closest && ziel.closest('.fp-messgeraet'))) {
                const lt1 = ziel.getAttribute && ziel.getAttribute('data-l');
                if (messKlick(lt1, wx, wy, ziel)) return;
            }
            // Fehlersuche: Klick auf Bauteil/Leitung = Verdacht melden (Handbetätiger bleiben bedienbar)
            if (plan.fehlersuche && fehlerAnzahl() && !(ziel.closest && ziel.closest('.fp-hand') && simLaeuft())) {
                const lt0 = ziel.getAttribute && ziel.getAttribute('data-l');
                const tg0 = ziel.closest && ziel.closest('.fp-teil');
                const key = lt0 ? 'L:' + lt0 : tg0 ? tg0.getAttribute('data-t') : null;
                if (key && !(plan.behoben || []).includes(key)) { verdachtUmschalten(key); return; }
                if (!simLaeuft()) { zug = { art: 'pan', sx: e.clientX, sy: e.clientY, ax: ansicht.x, ay: ansicht.y }; svg.setPointerCapture(e.pointerId); return; }
            }
            // Während der Simulation: nur Handbetätigung
            if (simLaeuft()) {
                const hand = ziel.closest && ziel.closest('.fp-hand');
                if (hand) { handDruck(hand.getAttribute('data-t'), hand.getAttribute('data-seite'), true); zug = { art: 'hand', t: hand.getAttribute('data-t'), s: hand.getAttribute('data-seite') }; svg.setPointerCapture(e.pointerId); return; }
                zug = { art: 'pan', sx: e.clientX, sy: e.clientY, ax: ansicht.x, ay: ansicht.y };
                svg.setPointerCapture(e.pointerId); return;
            }
            const port = ziel.classList && ziel.classList.contains('fp-port') ? ziel : null;
            const lt = ziel.getAttribute && ziel.getAttribute('data-l');
            const tg = ziel.closest && ziel.closest('.fp-teil');
            if (werkzeug === 'loeschen') {
                if (lt) aendern(() => { plan.leitungen = plan.leitungen.filter(l => l.id !== lt); });
                else if (tg) { const id = tg.getAttribute('data-t'); aendern(() => teilEntfernen(id)); }
                return;
            }
            if (port) {
                zug = { art: 'leitung', von: { t: port.getAttribute('data-t'), p: port.getAttribute('data-p') }, x: wx, y: wy };
                svg.setPointerCapture(e.pointerId); return;
            }
            if (lt) {
                if (!e.shiftKey) auswahl.clear();
                auswahl.add('L:' + lt);
                const l = plan.leitungen.find(q => q.id === lt);
                const pts = leitungPunkte(l);
                const seg = naechstesSegment(pts, wx, wy);
                zug = { art: 'segment', l: lt, seg, pts, sx: wx, sy: wy, start: JSON.stringify(plan), bewegt: false };
                svg.setPointerCapture(e.pointerId); zeichnen(); return;
            }
            if (tg) {
                const id = tg.getAttribute('data-t');
                if (e.shiftKey) { if (auswahl.has(id)) auswahl.delete(id); else auswahl.add(id); }
                else if (!auswahl.has(id)) { auswahl.clear(); auswahl.add(id); }
                const start = {};
                for (const a of auswahl) { const t = teil(a); if (t) start[a] = [t.x, t.y]; }
                zug = { art: 'teile', sx: wx, sy: wy, start, vorher: JSON.stringify(plan), bewegt: false };
                svg.setPointerCapture(e.pointerId); zeichnen(); return;
            }
            // Hintergrund: Auswahlrahmen
            if (!e.shiftKey) auswahl.clear();
            zug = { art: 'rahmen', sx: wx, sy: wy, rect: el('rect', { x: wx, y: wy, width: 0, height: 0, fill: 'rgba(255,111,0,.08)', stroke: '#ff6f00', 'stroke-dasharray': '4 3' }, ebUi) };
            svg.setPointerCapture(e.pointerId);
            zeichnenLeicht();
        });
        svg.addEventListener('pointermove', e => {
            if (!zug) { hoverStatus(e); return; }
            const [wx, wy] = weltPunkt(e);
            if (zug.art === 'pan') {
                ansicht.x = zug.ax - (e.clientX - zug.sx) / ansicht.z; ansicht.y = zug.ay - (e.clientY - zug.sy) / ansicht.z; ansichtSetzen();
            } else if (zug.art === 'teile') {
                const dx = snap(wx - zug.sx), dy = snap(wy - zug.sy);
                if (dx || dy) zug.bewegt = true;
                for (const id in zug.start) { const t = teil(id); if (t) { t.x = zug.start[id][0] + dx; t.y = zug.start[id][1] + dy; } }
                zeichnen();
            } else if (zug.art === 'leitung') {
                if (zug.vorschau) zug.vorschau.remove();
                const tt = teil(zug.von.t), A = portLage(tt, zug.von.p);
                const [sx, sy] = A.dir ? stich(A) : [A.x, A.y];
                const pts = [[A.x, A.y], [sx, sy]];
                if (Math.abs(wx - sx) > Math.abs(wy - sy)) pts.push([wx, sy], [wx, wy]); else pts.push([sx, wy], [wx, wy]);
                zug.vorschau = el('path', { d: 'M' + pts.map(p => p.join(',')).join(' L'), fill: 'none', stroke: '#ff6f00', 'stroke-width': 1.6, 'stroke-dasharray': '5 3' }, ebUi);
                svg.querySelectorAll('.fp-port.ziel').forEach(p => p.classList.remove('ziel'));
                const z = portNahe(wx, wy, zug.von);
                if (z) { const c = svg.querySelector(`.fp-port[data-t="${z.t}"][data-p="${z.p}"]`); if (c) c.classList.add('ziel'); }
            } else if (zug.art === 'segment') {
                const dx = snap(wx - zug.sx), dy = snap(wy - zug.sy);
                if (!dx && !dy) return;
                const pts = zug.pts.map(p => p.slice());
                const i = zug.seg;
                if (i <= 0 || i >= pts.length - 2) return; // Anschluss-Stiche bleiben fest
                const waag = pts[i][1] === pts[i + 1][1];
                if (waag) { pts[i][1] += dy; pts[i + 1][1] += dy; } else { pts[i][0] += dx; pts[i + 1][0] += dx; }
                const l = plan.leitungen.find(q => q.id === zug.l);
                l.pkt = pts.slice(2, pts.length - 2).map(p => [snap(p[0]), snap(p[1])]);
                zug.bewegt = true;
                zeichnen();
            } else if (zug.art === 'rahmen') {
                const x = Math.min(zug.sx, wx), y = Math.min(zug.sy, wy);
                zug.rect.setAttribute('x', x); zug.rect.setAttribute('y', y);
                zug.rect.setAttribute('width', Math.abs(wx - zug.sx)); zug.rect.setAttribute('height', Math.abs(wy - zug.sy));
                zug.ende = [wx, wy];
            }
        });
        const ende = e => {
            if (!zug) return;
            const z = zug; zug = null;
            try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
            const [wx, wy] = weltPunkt(e);
            if (z.art === 'hand') { handDruck(z.t, z.s, false); return; }
            if (z.art === 'teile') {
                if (z.bewegt) { undoStapel.push(z.vorher); redoStapel = []; geoCache.clear(); speichern(); zeichnen(); }
                return;
            }
            if (z.art === 'segment') {
                if (z.bewegt) { undoStapel.push(z.start); redoStapel = []; speichern(); }
                zeichnen(); return;
            }
            if (z.art === 'leitung') {
                if (z.vorschau) z.vorschau.remove();
                const ziel = portNahe(wx, wy, z.von);
                if (ziel) { leitungAnlegen(z.von, ziel); return; }
                // Auf eine Leitung gezogen → T-Stück einsetzen
                const tr = leitungNahe(wx, wy);
                if (tr) { abzweig(z.von, tr, wx, wy); return; }
                zeichnen(); return;
            }
            if (z.art === 'rahmen') {
                if (z.ende) {
                    const x1 = Math.min(z.sx, z.ende[0]), x2 = Math.max(z.sx, z.ende[0]), y1 = Math.min(z.sy, z.ende[1]), y2 = Math.max(z.sy, z.ende[1]);
                    for (const t of plan.teile) { const b = boxWelt(t); if (b[0] >= x1 && b[2] <= x2 && b[1] >= y1 && b[3] <= y2) auswahl.add(t.id); }
                }
                zeichnen();
            }
        };
        svg.addEventListener('pointerup', ende);
        svg.addEventListener('pointercancel', ende);
        svg.addEventListener('dblclick', e => {
            const tg = e.target.closest && e.target.closest('.fp-teil');
            if (tg && !simLaeuft()) { auswahl.clear(); auswahl.add(tg.getAttribute('data-t')); zeichnen(); const f = document.querySelector('#fp-eigen input, #fp-eigen select'); if (f) f.focus(); }
        });
    }
    function zeichnenLeicht() { /* Rahmen bleibt in ebUi stehen */ }
    function naechstesSegment(pts, x, y) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
            const d = abstandSegment(pts[i], pts[i + 1], x, y);
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }
    function abstandSegment(a, b, x, y) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
        return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
    }
    function portNahe(x, y, ausser) {
        let best = null, bd = 9 / Math.min(1, ansicht.z);
        for (const t of plan.teile) for (const p of geo(t).ports) {
            if (ausser && t.id === ausser.t && p.id === ausser.p) continue;
            const [px, py] = trafo(t, p.x, p.y);
            const d = Math.hypot(px - x, py - y);
            if (d < bd) { bd = d; best = { t: t.id, p: p.id }; }
        }
        return best;
    }
    function leitungNahe(x, y) {
        let best = null, bd = 6;
        for (const l of plan.leitungen) {
            const pts = leitungPunkte(l); if (!pts) continue;
            for (let i = 0; i < pts.length - 1; i++) {
                const d = abstandSegment(pts[i], pts[i + 1], x, y);
                if (d < bd) { bd = d; best = { l, i, pts }; }
            }
        }
        return best;
    }
    function leitungAnlegen(a, b) {
        if (a.t === b.t && a.p === b.p) return;
        if (plan.leitungen.some(l => (l.a.t === a.t && l.a.p === a.p && l.b.t === b.t && l.b.p === b.p) || (l.a.t === b.t && l.a.p === b.p && l.b.t === a.t && l.b.p === a.p))) { zeichnen(); return; }
        aendern(() => { plan.leitungen.push({ id: neueId(), a: { t: a.t, p: a.p }, b: { t: b.t, p: b.p } }); });
    }
    function abzweig(von, tr, x, y) {
        // Punkt auf das Segment legen
        const a = tr.pts[tr.i], b = tr.pts[tr.i + 1];
        let px = snap(x), py = snap(y);
        if (a[1] === b[1]) py = a[1]; else px = a[0];
        aendern(() => {
            const k = { id: neueId(), typ: 'knoten', x: px, y: py, rot: 0, bez: '', o: {} };
            plan.teile.push(k);
            const alt = tr.l;
            plan.leitungen = plan.leitungen.filter(l => l !== alt && l.id !== alt.id);
            plan.leitungen.push({ id: neueId(), a: alt.a, b: { t: k.id, p: 'P' } });
            plan.leitungen.push({ id: neueId(), a: { t: k.id, p: 'P' }, b: alt.b });
            plan.leitungen.push({ id: neueId(), a: von, b: { t: k.id, p: 'P' } });
        });
    }
    function teilEntfernen(id) {
        plan.teile = plan.teile.filter(t => t.id !== id);
        plan.leitungen = plan.leitungen.filter(l => l.a.t !== id && l.b.t !== id);
        // Rollen-/Sensor-Verweise auf diesen Zylinder lösen
        plan.teile.forEach(t => { if (t.o && t.o.zyl === id) t.o.zyl = ''; if (t.o && t.o.zylR === id) t.o.zylR = ''; });
        auswahl.delete(id);
    }
    function auswahlLoeschen() {
        if (!auswahl.size || simLaeuft()) return;
        aendern(() => {
            for (const a of [...auswahl]) {
                if (a.startsWith('L:')) plan.leitungen = plan.leitungen.filter(l => l.id !== a.slice(2));
                else teilEntfernen(a);
            }
            auswahl.clear();
        });
    }
    function drehen(w) {
        const ids = [...auswahl].filter(a => !a.startsWith('L:'));
        if (!ids.length || simLaeuft()) return;
        aendern(() => { ids.forEach(id => { const t = teil(id); t.rot = ((t.rot || 0) + w) % 360; }); });
    }
    function spiegeln() {
        const ids = [...auswahl].filter(a => !a.startsWith('L:'));
        if (!ids.length || simLaeuft()) return;
        aendern(() => { ids.forEach(id => { const t = teil(id); t.sp = !t.sp; }); });
    }
    function kopieren() {
        const ids = new Set([...auswahl].filter(a => !a.startsWith('L:')));
        if (!ids.size) return;
        zwischenablage = { teile: plan.teile.filter(t => ids.has(t.id)).map(kopie), leitungen: plan.leitungen.filter(l => ids.has(l.a.t) && ids.has(l.b.t)).map(kopie) };
    }
    function einfuegen() {
        if (!zwischenablage || simLaeuft()) return;
        aendern(() => {
            const map = {};
            auswahl.clear();
            for (const t of zwischenablage.teile) {
                const n = kopie(t); n.id = neueId(); n.x += 40; n.y += 40; map[t.id] = n.id;
                if (n.bez) n.bez = bezFuer(n.typ, n.o);
                plan.teile.push(n); auswahl.add(n.id);
            }
            for (const l of zwischenablage.leitungen) plan.leitungen.push({ id: neueId(), a: { t: map[l.a.t], p: l.a.p }, b: { t: map[l.b.t], p: l.b.p }, pkt: l.pkt ? l.pkt.map(p => [p[0] + 40, p[1] + 40]) : undefined });
            zwischenablage.teile.forEach(t => { t.x += 40; t.y += 40; });
        });
    }
    function tasten(e) {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
        if (plan.fehlersuche && fehlerAnzahl()) return;   // Fehlersuche: Plan bleibt unverändert
        const strg = e.ctrlKey || e.metaKey;
        if (e.key === 'Delete' || e.key === 'Backspace') { auswahlLoeschen(); e.preventDefault(); }
        else if (e.key === 'r' || e.key === 'R') { drehen(90); e.preventDefault(); }
        else if (e.key === 'm' || e.key === 'M') { spiegeln(); e.preventDefault(); }
        else if (strg && e.key.toLowerCase() === 'z') { rueckgaengig(); e.preventDefault(); }
        else if (strg && e.key.toLowerCase() === 'y') { wiederholen(); e.preventDefault(); }
        else if (strg && e.key.toLowerCase() === 'c') { kopieren(); e.preventDefault(); }
        else if (strg && e.key.toLowerCase() === 'v') { einfuegen(); e.preventDefault(); }
        else if (e.key === 'Escape') { auswahl.clear(); zeichnen(); }
        e.stopPropagation();
    }
    // Aus der Palette ziehen
    function paletteZiehen(e, v) {
        if (simLaeuft()) { status('Während der Simulation lässt sich der Plan nicht ändern.'); return; }
        if (plan.fehlersuche && fehlerAnzahl()) { status('In der Fehlersuche bleibt der Plan, wie er ist.'); return; }
        e.preventDefault();
        const geist = h('div', { style: 'position:fixed;pointer-events:none;z-index:9999;background:#fff;border:1px solid #ff6f00;border-radius:4px;padding:2px 6px;font-size:11px;color:#263238', text: v.name }, document.body);
        const bewege = ev => { geist.style.left = ev.clientX + 8 + 'px'; geist.style.top = ev.clientY + 8 + 'px'; };
        bewege(e);
        let gezogen = false; const sx = e.clientX, sy = e.clientY;
        const mv = ev => { bewege(ev); if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) gezogen = true; };
        const up = ev => {
            window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
            geist.remove();
            const r = svg.getBoundingClientRect();
            const drin = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
            if (drin && gezogen) { const [wx, wy] = weltPunkt(ev); setzen(v, snap(wx), snap(wy)); }
            else if (!gezogen) {
                // Anklicken: in die Mitte der Ansicht setzen
                const mx = ansicht.x + r.width / ansicht.z / 2, my = ansicht.y + r.height / ansicht.z / 2;
                setzen(v, snap(mx + (plan.teile.length % 5) * 20), snap(my + (plan.teile.length % 5) * 20));
            }
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    }
    function setzen(v, x, y) {
        aendern(() => {
            const o = Object.assign({}, TYP[v.typ].optionen, v.o || {});
            const t = { id: neueId(), typ: v.typ, x, y, rot: 0, bez: bezFuer(v.typ, o), o };
            plan.teile.push(t);
            auswahl.clear(); auswahl.add(t.id);
        });
    }

    // ------------------------------------------------------------
    // Eigenschaften
    // ------------------------------------------------------------
    function eigenschaften() {
        const box = document.getElementById('fp-eigen'); if (!box) return;
        if (plan.fehlersuche && fehlerAnzahl()) { fehlersucheZeigen(); return; }
        const ids = [...auswahl].filter(a => !a.startsWith('L:'));
        box.innerHTML = '';
        if (ids.length !== 1) {
            if (auswahl.size && [...auswahl].every(a => a.startsWith('L:'))) {
                box.classList.add('offen');
                h('h4', { text: 'Leitung' }, box);
                const l = plan.leitungen.find(q => 'L:' + q.id === [...auswahl][0]);
                h('button', { class: 'fp-btn', text: 'Verlauf zurücksetzen', title: 'Knicke wieder automatisch legen', onclick: () => aendern(() => { if (l) delete l.pkt; }) }, box);
                h('div', { class: 'fp-hinw', text: 'Ein gerades Stück der Leitung kannst du mit der Maus verschieben. Entf löscht die Leitung.' }, box);
                if (l) fehlerFeld(box, 'L:' + l.id);
            } else box.classList.remove('offen');
            return;
        }
        const t = teil(ids[0]); if (!t) return;
        box.classList.add('offen');
        const T = TYP[t.typ];
        h('h4', { text: T.name }, box);
        const fld = (lbl, el2) => { h('label', { text: lbl }, box); box.appendChild(el2); return el2; };
        const setze = (fn) => aendern(fn);
        if (!T.ohneBez) {
            const i = fld('Bezeichnung (DIN ISO 1219-2)', h('input', { value: t.bez || '' }));
            i.onchange = () => setze(() => { t.bez = i.value.trim(); });
        }
        const num = (lbl, key, min, max, step, einheit) => {
            const i = fld(lbl + (einheit ? ' (' + einheit + ')' : ''), h('input', { type: 'number', min, max, step, value: t.o[key] }));
            i.onchange = () => setze(() => { t.o[key] = Math.max(min, Math.min(max, zahl(i.value, t.o[key]))); });
        };
        const wahl = (lbl, key, opts) => {
            const s = fld(lbl, h('select'));
            for (const [v, n] of opts) h('option', { value: v, text: n }, s);
            s.value = t.o[key]; s.onchange = () => setze(() => { t.o[key] = s.value; });
            return s;
        };
        const variable = (lbl, key, art) => {
            const id = 'fp-dl-' + art;
            let dl = document.getElementById(id);
            if (!dl) dl = h('datalist', { id }, document.body);
            dl.innerHTML = ''; varListe(art).forEach(v => h('option', { value: v }, dl));
            const i = fld(lbl, h('input', { value: t.o[key] || '', list: id, placeholder: art === 'in' ? 'z. B. B1' : 'z. B. Y1' }));
            i.onchange = () => setze(() => { t.o[key] = i.value.trim().replace(/\s+/g, '_'); });
        };
        const zylWahl = (lbl, key) => {
            const opts = [['', '– kein Zylinder –']].concat(plan.teile.filter(z => z.typ === 'zyl_dw' || z.typ === 'zyl_ew').map(z => [z.id, z.bez || TYP[z.typ].name]));
            wahl(lbl, key, opts);
        };
        if (t.typ === 'ventil') {
            const s = wahl('Wegeventil', 'wege', [['2/2', '2/2-Wege'], ['3/2', '3/2-Wege'], ['4/2', '4/2-Wege'], ['5/2', '5/2-Wege'], ['5/3', '5/3-Wege']]);
            void s;
            if (t.o.wege === '2/2' || t.o.wege === '3/2') wahl('Ruhestellung', 'ruhe', [['zu', 'gesperrt (Öffner: zu)'], ['offen', 'Durchfluss (offen)']]);
            if (t.o.wege === '5/3') wahl('Mittelstellung', 'mitte', [['gesperrt', 'gesperrt'], ['entlueftet', 'entlüftet (2, 4 → Abluft)'], ['belueftet', 'belüftet (1 → 2 und 4)']]);
            const bets = Object.keys(BETAETIGUNG).filter(b => b !== 'feder').map(b => [b, BETAETIGUNG[b]]);
            wahl('Betätigung links', 'links', bets);
            if (t.o.links === 'magnet') variable('Spule links: VALIS-Ausgang', 'varL', 'out');
            if (t.o.links === 'rolle' || t.o.links === 'rolle_leer') {
                zylWahl('Rolle betätigt von Zylinder', 'zyl');
                wahl('an der Stelle', 'pos', [['hinten', 'hintere Endlage'], ['vorne', 'vordere Endlage']]);
                if (t.o.links === 'rolle_leer') wahl('betätigt beim', 'richt', [['aus', 'Ausfahren'], ['ein', 'Einfahren']]);
            }
            wahl('Betätigung rechts', 'rechts', [['feder', 'Feder (Rückstellung)']].concat(bets));
            if (t.o.rechts === 'magnet') variable('Spule rechts: VALIS-Ausgang', 'varR', 'out');
            if (t.o.rechts === 'rolle' || t.o.rechts === 'rolle_leer') {
                zylWahl('Rolle rechts betätigt von Zylinder', 'zylR');
                wahl('an der Stelle', 'posR', [['hinten', 'hintere Endlage'], ['vorne', 'vordere Endlage']]);
                if (t.o.rechts === 'rolle_leer') wahl('betätigt beim', 'richtR', [['aus', 'Ausfahren'], ['ein', 'Einfahren']]);
            }
            const st = ventilStellungen(t.o);
            h('div', { class: 'fp-hinw', html: `Steueranschlüsse heißen nach ISO 5599-3 so, wie sie das Ventil schalten: links <b>${steuerNummer(st[0])}</b>, rechts <b>${steuerNummer(st[st.length - 1])}</b>. ` + (t.o.rechts !== 'feder' && t.o.wege !== '5/3' ? 'Ohne Feder bleibt das Ventil in der zuletzt geschalteten Stellung (Impulsventil).' : '') }, box);
        } else if (t.typ === 'zyl_dw' || t.typ === 'zyl_ew') {
            num('Kolbendurchmesser', 'd', 8, 200, 1, 'mm');
            if (t.typ === 'zyl_dw') num('Stangendurchmesser', 'dStange', 4, 100, 1, 'mm');
            num('Hub', 'hub', 10, 1000, 5, 'mm');
            num('Last gegen das Ausfahren', 'last', 0, 20000, 10, 'N');
            if (t.typ === 'zyl_dw') {
                wahl('Grundstellung', 'start', [['hinten', 'eingefahren'], ['vorne', 'ausgefahren']]);
                const c = fld('Endlagendämpfung', h('input', { type: 'checkbox' })); c.checked = !!t.o.daempfung; c.onchange = () => setze(() => { t.o.daempfung = c.checked; });
            }
            variable('Sensor hintere Endlage: VALIS-Eingang', 'sensH', 'in');
            variable('Sensor vordere Endlage: VALIS-Eingang', 'sensV', 'in');
            const anl = (() => { try { return factoryObjects.filter(o => o.type === 'zylinder_double' || o.type === 'zylinder_single' || o.type === 'gate_pneu'); } catch (e) { return []; } })();
            wahl('2D-Anlage: Zylinder fährt mit', 'anlage', [['', '– keiner –']].concat(anl.map(o => [o.id, (o.normLabel ? o.normLabel + ' ' : '') + (o.linkedVarExt || o.linkedVar || o.id)])));
            h('div', { class: 'fp-hinw', text: 'Sensoren schreiben den VALIS-Eingang wie ein Reed-Schalter an der Endlage. Ein Zylinder der 2D-Anlage, der hier mitfährt, folgt diesem Zylinder statt seinem eigenen Ventil.' }, box);
        } else if (t.typ === 'schwenk') {
            num('Schwenkwinkel', 'winkel', 10, 360, 5, '°');
            num('Drehmoment-Last', 'moment', 0, 200, 0.5, 'Nm');
            variable('Sensor Anfang: VALIS-Eingang', 'sensH', 'in');
            variable('Sensor Ende: VALIS-Eingang', 'sensV', 'in');
        } else if (t.typ === 'quelle') {
            num('Druck', 'p', 1, 12, 0.5, 'bar');
        } else if (t.typ === 'wartung' || t.typ === 'druckregel') {
            num('Ausgangsdruck', 'p', 0.5, 10, 0.5, 'bar');
        } else if (t.typ === 'drossel' || t.typ === 'drv') {
            const i = fld('Öffnung: ' + t.o.offen + ' %', h('input', { type: 'range', min: 1, max: 100, value: t.o.offen }));
            i.oninput = () => { i.previousSibling.textContent = 'Öffnung: ' + i.value + ' %'; t.o.offen = +i.value; };
            i.onchange = () => setze(() => { t.o.offen = +i.value; });
            h('div', { class: 'fp-hinw', text: t.typ === 'drv' ? 'Gedrosselt wird von 1 nach 2, von 2 nach 1 öffnet das Rückschlagventil. Für Abluftdrosselung kommt die 2 an den Zylinder. Auch während der Simulation verstellbar.' : 'Auch während der Simulation verstellbar.' }, box);
        } else if (t.typ === 'daempfer') {
            const c = fld('Drosselschalldämpfer', h('input', { type: 'checkbox' })); c.checked = !!t.o.drossel; c.onchange = () => setze(() => { t.o.drossel = c.checked; });
            if (t.o.drossel) num('Öffnung', 'offen', 1, 100, 1, '%');
        } else if (t.typ === 'zeit') {
            num('Verzögerung', 'zeit', 0.2, 60, 0.1, 's');
            wahl('Ruhestellung', 'ruhe', [['zu', 'gesperrt (Einschaltverzögerung)'], ['offen', 'offen (schaltet nach der Zeit ab)']]);
            h('div', { class: 'fp-hinw', text: 'Der Steuerdruck an 12 füllt über die Drossel einen kleinen Speicher. Erreicht er etwa 3 bar, schaltet das 3/2-Ventil. Die Zeit gilt für 6 bar Steuerdruck.' }, box);
        } else if (t.typ === 'folge') {
            num('Schaltdruck', 'p', 0.5, 10, 0.1, 'bar');
            wahl('Ruhestellung', 'ruhe', [['zu', 'gesperrt'], ['offen', 'offen']]);
            h('div', { class: 'fp-hinw', text: 'Erreicht der Druck am Steueranschluss den Schaltdruck, schaltet das 3/2-Ventil (Druckschaltventil).' }, box);
        } else if (t.typ === 'dschalter') {
            num('Schaltdruck', 'p', 0.2, 10, 0.1, 'bar');
            variable('VALIS-Eingang', 'var', 'in');
        }
        fehlerFeld(box, t.id);
        if (simLaeuft()) box.querySelectorAll('input,select').forEach(i => { if (!(i.type === 'range')) i.disabled = true; });
    }

    // ------------------------------------------------------------
    // Prüfen, SVG, Hilfe, Status
    // ------------------------------------------------------------
    function pruefen() {
        const meld = [];
        const belegt = new Set();
        plan.leitungen.forEach(l => { belegt.add(l.a.t + ':' + l.a.p); belegt.add(l.b.t + ':' + l.b.p); });
        for (const t of plan.teile) {
            const n = t.bez || TYP[t.typ].name;
            for (const p of geo(t).ports) {
                if (belegt.has(t.id + ':' + p.id)) continue;
                if (p.art === 'r' || t.typ === 'daempfer') continue;
                if (t.typ === 'knoten') { meld.push(`Verbindungspunkt ohne Leitung`); continue; }
                if (p.art === 's') meld.push(`${n}: Steueranschluss ${p.id} ist frei – das Ventil bekommt nie Steuerdruck.`);
                else meld.push(`${n}: Anschluss ${p.nr || p.id} ist offen – hier bläst Luft ab.`);
            }
            if (t.typ === 'ventil') {
                if (t.o.links === 'magnet' && !t.o.varL) meld.push(`${n}: Spule links hat keinen VALIS-Ausgang.`);
                if (t.o.rechts === 'magnet' && !t.o.varR) meld.push(`${n}: Spule rechts hat keinen VALIS-Ausgang.`);
                if ((t.o.links === 'rolle' || t.o.links === 'rolle_leer') && !teil(t.o.zyl)) meld.push(`${n}: Rollenhebel ist keinem Zylinder zugeordnet.`);
                if ((t.o.rechts === 'rolle' || t.o.rechts === 'rolle_leer') && !teil(t.o.zylR)) meld.push(`${n}: Rollenhebel rechts ist keinem Zylinder zugeordnet.`);
            }
            if (t.typ === 'dschalter' && !t.o.var) meld.push(`${n}: Druckschalter hat keinen VALIS-Eingang.`);
        }
        if (plan.teile.length && !plan.teile.some(t => t.typ === 'quelle')) meld.push('Es gibt keine Druckluftquelle.');
        const bez = {};
        plan.teile.forEach(t => { if (t.bez) bez[t.bez] = (bez[t.bez] || 0) + 1; });
        Object.keys(bez).forEach(b => { if (bez[b] > 1) meld.push(`Die Bezeichnung ${b} kommt ${bez[b]}-mal vor.`); });
        const fl = svg.parentNode;
        const alt = fl.querySelector('.fp-pruef'); if (alt) alt.remove();
        const box = h('div', { class: 'fp-pruef' }, fl);
        h('h5', { text: meld.length ? `Prüfung: ${meld.length} Hinweis${meld.length > 1 ? 'e' : ''}` : 'Prüfung: alles verbunden ✓' }, box);
        if (meld.length) { const ul = h('ul', { style: 'margin:0;padding-left:16px' }, box); meld.forEach(m => h('li', { text: m }, ul)); }
        h('button', { class: 'fp-btn', style: 'margin-top:6px;background:#eceff1;color:#263238;border-color:#b0bec5', text: 'Schließen', onclick: () => box.remove() }, box);
        return meld;
    }
    function svgSpeichern() {
        if (!plan.teile.length) return;
        const c = svg.cloneNode(true);
        c.querySelectorAll('.fp-port,.fp-treffer,.fp-hg,.fp-hand').forEach(n => n.remove());
        c.classList.remove('sim');
        let b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const t of plan.teile) { const q = boxWelt(t); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1] - 30), Math.max(b[2], q[2] + 40), Math.max(b[3], q[3] + 16)]; }
        c.setAttribute('viewBox', `${b[0] - 20} ${b[1] - 20} ${b[2] - b[0] + 40} ${b[3] - b[1] + 40}`);
        c.setAttribute('width', b[2] - b[0] + 40); c.setAttribute('height', b[3] - b[1] + 40);
        c.setAttribute('xmlns', NS);
        c.setAttribute('style', 'color:#263238;background:#fff');
        const st = document.createElementNS(NS, 'style');
        st.textContent = `.fp-leitung{fill:none;stroke:#263238;stroke-width:1.6}.fp-leitung.steuer{stroke-dasharray:6 4}.fp-bez{font:bold 11px sans-serif;fill:#263238}.fp-pnr{font:9px sans-serif;fill:#607d8b}.fp-var,.fp-wert{font:10px monospace;fill:#1565c0}.fp-marke{font:10px sans-serif;fill:#263238}`;
        c.insertBefore(st, c.firstChild);
        c.innerHTML = c.innerHTML.replace(/var\(--fp-papier\)/g, '#fff').replace(/var\(--fp-aktiv\)/g, '#ffb300');
        c.querySelectorAll('.fp-leitung.druck').forEach(n => n.classList.remove('druck'));
        const txt = new XMLSerializer().serializeToString(c);
        const datei = 'fluidplan.svg';
        if (typeof window._saveAsFile === 'function') { try { window._saveAsFile(txt, datei, 'image/svg+xml', [{ description: 'SVG-Bild', ext: '.svg' }]); return; } catch (e) {} }
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' })); a.download = datei; a.click();
    }
    function hilfeZeigen() {
        const fl = svg.parentNode;
        const alt = fl.querySelector('.fp-hilfe'); if (alt) { alt.remove(); return; }
        h('div', { class: 'fp-hilfe', html: `<b>So geht's</b><br>
            • Bauteil aus der Palette in den Plan ziehen (oder anklicken).<br>
            • Leitung: vom Anschluss (kleiner Kreis) zum nächsten ziehen. Auf eine Leitung gezogen, entsteht ein T-Stück.<br>
            • Doppelklick oder Auswahl zeigt rechts die Eigenschaften: Betätigung, Rolle am Zylinder, Spule mit VALIS-Ausgang …<br>
            • <kbd>R</kbd> drehen, <kbd>M</kbd> spiegeln, <kbd>Entf</kbd> löschen, <kbd>Strg</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd>, <kbd>Strg</kbd>+<kbd>C</kbd>/<kbd>V</kbd>.<br>
            • Mausrad zoomt, rechte Maustaste verschiebt die Ansicht.<br>
            • <b>▶ Simulation</b>: Taster und Hebel im Plan anklicken (Taster gedrückt halten). Leitungen mit Druck werden blau.<br>
            • Offene Anschlüsse blasen ab (wie in echt). <b>✓ Prüfen</b> zeigt sie.<br>
            <span style="color:#78909c">Klick auf diesen Kasten schließt ihn.</span>`, onclick: function () { this.remove(); } }, fl);
    }
    function status(txt) {
        const f = document.getElementById('fp-fuss'); if (!f) return;
        if (txt) { f.innerHTML = txt; return; }
        if (simLaeuft()) f.innerHTML = '<b>Simulation läuft</b> · Taster und Hebel im Plan anklicken · blaue Leitungen stehen unter Druck';
        else if (werkzeug === 'loeschen') f.innerHTML = '<b>Löschen</b> · Bauteil oder Leitung anklicken';
        else f.innerHTML = `${plan.teile.length} Bauteile, ${plan.leitungen.length} Leitungen · Leitung: von Anschluss zu Anschluss ziehen · Doppelklick: Eigenschaften`;
    }


    // ------------------------------------------------------------
    // Beispielpläne
    // ------------------------------------------------------------
    // Jeder Bau bekommt T(typ, x, y, bez, o) und L(a, ap, b, bp) und baut den Plan auf.
    const BEISPIELE = [
        { name: 'Direkt: Taster fährt einfachwirkenden Zylinder', text: 'Solange 1S1 gedrückt ist, fährt 1A1 aus.',
          bau(T, L) { const q = T('quelle', 0, 300, '0Z1'), s = T('ventil', -20, 140, '1S1', { wege: '3/2', links: 'taster' }), z = T('zyl_ew', -20, -60, '1A1');
            L(q, '1', s, '1'); L(s, '2', z, 'K'); } },
        { name: 'Indirekt: Impulsventil mit Abluftdrosselung', text: '1S1 fährt aus, 1S2 fährt ein. Die Drosselrückschlagventile bremsen die Abluft.',
          bau(T, L) { const q = T('quelle', 60, 420, '0Z1'), z = T('zyl_dw', 40, -200, '1A1'), v = T('ventil', 40, 80, '1V1', { wege: '5/2', links: 'pneu', rechts: 'pneu' }),
            d1 = T('drv', 50, -60, '1V2', { offen: 40 }), d2 = T('drv', 170, -60, '1V3', { offen: 40 }),
            s1 = T('ventil', -160, 240, '1S1', { wege: '3/2', links: 'taster' }), s2 = T('ventil', 260, 240, '1S2', { wege: '3/2', links: 'taster' });
            [v, s1, s2].forEach(x => L(q, '1', x, '1')); L(s1, '2', v, '14'); L(s2, '2', v, '12');
            L(v, '4', d1, '2'); L(d1, '1', z, 'K'); L(v, '2', d2, '2'); L(d2, '1', z, 'S'); } },
        { name: 'UND: Zweihandbedienung', text: 'Nur wenn 1S1 und 1S2 gedrückt sind, fährt 1A1 aus (Zweidruckventil).',
          bau(T, L) { const q = T('quelle', 40, 420, '0Z1'), z = T('zyl_dw', 20, -200, '1A1'), v = T('ventil', 20, 0, '1V1', { wege: '5/2', links: 'pneu', rechts: 'feder' }),
            u = T('zweidruck', 40, 140, '1V2'), s1 = T('ventil', -170, 240, '1S1', { wege: '3/2', links: 'taster' }), s2 = T('ventil', 200, 240, '1S2', { wege: '3/2', links: 'taster' });
            [v, s1, s2].forEach(x => L(q, '1', x, '1')); L(s1, '2', u, 'X'); L(s2, '2', u, 'Y'); L(u, '2', v, '14'); L(v, '4', z, 'K'); L(v, '2', z, 'S'); } },
        { name: 'ODER: von zwei Stellen', text: '1S1 oder 1S2 fährt den einfachwirkenden Zylinder aus (Wechselventil).',
          bau(T, L) { const q = T('quelle', 40, 400, '0Z1'), z = T('zyl_ew', 20, -100, '1A1'), w = T('wechsel', 40, 60, '1V1'),
            s1 = T('ventil', -170, 220, '1S1', { wege: '3/2', links: 'taster' }), s2 = T('ventil', 200, 220, '1S2', { wege: '3/2', links: 'pilz' });
            L(q, '1', s1, '1'); L(q, '1', s2, '1'); L(s1, '2', w, 'X'); L(s2, '2', w, 'Y'); L(w, '2', z, 'K'); } },
        { name: 'Pendelhub mit Rollenventilen', text: 'Hebel 1S1 rastet: 1A1 pendelt zwischen den Endlagen, bis der Hebel wieder aus ist.',
          bau(T, L) { const q = T('quelle', 60, 460, '0Z1'), z = T('zyl_dw', 40, -200, '1A1'), v = T('ventil', 40, 20, '1V1', { wege: '5/2', links: 'pneu', rechts: 'pneu' }),
            u = T('zweidruck', -80, 170, '1V2'), s1 = T('ventil', -260, 280, '1S1', { wege: '3/2', links: 'hebel' }),
            s2 = T('ventil', -60, 280, '1S2', { wege: '3/2', links: 'rolle', pos: 'hinten' }), s3 = T('ventil', 240, 280, '1S3', { wege: '3/2', links: 'rolle', pos: 'vorne' });
            s2.o.zyl = z.id; s3.o.zyl = z.id;
            [v, s1, s2, s3].forEach(x => L(q, '1', x, '1')); L(s1, '2', u, 'X'); L(s2, '2', u, 'Y'); L(u, '2', v, '14'); L(s3, '2', v, '12');
            L(v, '4', z, 'K'); L(v, '2', z, 'S'); } },
        { name: 'Zeitverzögerung: vorne 2 s halten', text: '1S1 startet. Vorne betätigt 1A1 die Rolle 1S2, nach 2 s schaltet 1V2 und 1A1 fährt zurück.',
          bau(T, L) { const q = T('quelle', 60, 460, '0Z1'), z = T('zyl_dw', 40, -200, '1A1'), v = T('ventil', 40, 20, '1V1', { wege: '5/2', links: 'pneu', rechts: 'pneu' }),
            s1 = T('ventil', -200, 280, '1S1', { wege: '3/2', links: 'taster' }), s2 = T('ventil', 60, 280, '1S2', { wege: '3/2', links: 'rolle', pos: 'vorne' }),
            zt = T('zeit', 250, 160, '1V2', { zeit: 2 });
            s2.o.zyl = z.id;
            [v, s1, s2, zt].forEach(x => L(q, '1', x, '1')); L(s1, '2', v, '14'); L(s2, '2', zt, '12'); L(zt, '2', v, '12');
            L(v, '4', z, 'K'); L(v, '2', z, 'S'); } },
        { name: 'Ablauf A+ B+ A− B−', text: 'Zwei Zylinder nacheinander, Signale von Rollenventilen. Mit dem Diagramm ansehen.',
          bau(T, L) { const q = T('quelle', 260, 520, '0Z1'), A = T('zyl_dw', 0, -220, '1A1'), B = T('zyl_dw', 420, -220, '2A1'),
            vA = T('ventil', 0, 0, '1V1', { wege: '5/2', links: 'pneu', rechts: 'pneu' }), vB = T('ventil', 420, -40, '2V1', { wege: '5/2', links: 'pneu', rechts: 'pneu' }),
            u = T('zweidruck', -60, 170, '1V2'), st = T('ventil', -260, 300, '1S1', { wege: '3/2', links: 'taster' }),
            a0 = T('ventil', -40, 380, '1S2', { wege: '3/2', links: 'rolle', pos: 'hinten' }), a1 = T('ventil', 140, 380, '1S3', { wege: '3/2', links: 'rolle', pos: 'vorne' }),
            b0 = T('ventil', 320, 380, '2S1', { wege: '3/2', links: 'rolle', pos: 'hinten' }), b1 = T('ventil', 500, 380, '2S2', { wege: '3/2', links: 'rolle', pos: 'vorne' });
            a0.o.zyl = A.id; a1.o.zyl = A.id; b0.o.zyl = B.id; b1.o.zyl = B.id;
            [vA, vB, st, a0, a1, b0, b1].forEach(x => L(q, '1', x, '1'));
            L(st, '2', u, 'X'); L(b0, '2', u, 'Y'); L(u, '2', vA, '14'); L(b1, '2', vA, '12'); L(a1, '2', vB, '14'); L(a0, '2', vB, '12');
            L(vA, '4', A, 'K'); L(vA, '2', A, 'S'); L(vB, '4', B, 'K'); L(vB, '2', B, 'S'); } },
        { name: 'Elektropneumatik: Magnetventil mit Sensoren', text: '1M1 hängt an der VALIS-Variable Y1, die Endlagen melden B1 (hinten) und B2 (vorne). Im Code z. B. Y1 := START.',
          bau(T, L) { const q = T('quelle', 40, 300, '0Z1'), z = T('zyl_dw', 20, -160, '1A1', { sensH: 'B1', sensV: 'B2' }), v = T('ventil', 20, 80, '1M1', { wege: '5/2', links: 'magnet', rechts: 'feder', varL: 'Y1' });
            L(q, '1', v, '1'); L(v, '4', z, 'K'); L(v, '2', z, 'S'); } }
    ];
    function beispielLaden(i) {
        const b = BEISPIELE[i]; if (!b) return;
        if (plan.teile.length && !confirm('Der aktuelle Fluidplan wird durch das Beispiel ersetzt. Weiter?')) return;
        const neu = { v: 1, teile: [], leitungen: [] };
        const T = (typ, x, y, bez, o) => { const t = { id: neueId(), typ, x: snap(x), y: snap(y), rot: 0, bez: bez || '', o: Object.assign({}, TYP[typ].optionen, o || {}) }; neu.teile.push(t); return t; };
        const L = (a, ap, c, cp) => neu.leitungen.push({ id: neueId(), a: { t: a.id, p: ap }, b: { t: c.id, p: cp } });
        b.bau(T, L);
        aendern(() => { plan = neu; auswahl.clear(); geoCache.clear(); });
        sim = null; einpassen(); status('Beispiel: ' + b.name + '. ' + b.text);
    }
    function beispieleZeigen() {
        const box = document.getElementById('fp-eigen'); if (!box) return;
        box.innerHTML = ''; box.classList.add('offen');
        h('h4', { text: '📂 Beispiele' }, box);
        h('div', { class: 'fp-hinw', text: 'Ein Beispiel ersetzt den aktuellen Plan. Danach ▶ Simulation starten und Taster oder Hebel im Plan anklicken.' }, box);
        BEISPIELE.forEach((b, i) => {
            const d = h('div', { style: 'margin:7px 0;padding:6px 7px;border:1px solid #444;border-radius:4px;cursor:pointer', title: b.text, onclick: () => beispielLaden(i) }, box);
            h('div', { text: b.name, style: 'color:#ffb74d;font-weight:600' }, d);
            h('div', { text: b.text, style: 'color:#9e9e9e;font-size:10.5px;margin-top:2px' }, d);
        });
    }
    // ------------------------------------------------------------
    // Messen: Manometer an eine Leitung anstecken (bleibt, bis man es abzieht)
    // ------------------------------------------------------------
    let ebMess = null, messModus = false, messpunkte = [];
    const MESS_MAX = 3;
    function messUmschalten() {
        messModus = !messModus;
        const b = document.getElementById('fp-mess'); if (b) b.classList.toggle('an', messModus);
        status(messModus ? `<b>Messen</b>: Leitung anklicken steckt ein Manometer an (höchstens ${MESS_MAX}), Klick aufs Manometer zieht es ab.` : '');
    }
    function messKlick(lt, wx, wy, ziel) {
        const m = ziel && ziel.closest && ziel.closest('.fp-messgeraet');
        if (m) { messpunkte.splice(+m.getAttribute('data-i'), 1); messDarstellen(); return true; }
        if (!lt) return false;
        const l = plan.leitungen.find(q => q.id === lt); const pts = l && leitungPunkte(l); if (!pts) return false;
        const tr = naechstesSegment(pts, wx, wy), a = pts[tr], b = pts[tr + 1];
        const x = a[1] === b[1] ? Math.max(Math.min(a[0], b[0]), Math.min(Math.max(a[0], b[0]), wx)) : a[0];
        const y = a[1] === b[1] ? a[1] : Math.max(Math.min(a[1], b[1]), Math.min(Math.max(a[1], b[1]), wy));
        if (messpunkte.length >= MESS_MAX) messpunkte.shift();
        messpunkte.push({ l: lt, x, y });
        messDarstellen(); return true;
    }
    function messDarstellen() {
        if (!ebMess) return;
        ebMess.innerHTML = '';
        messpunkte = messpunkte.filter(m => plan.leitungen.some(l => l.id === m.l));
        messpunkte.forEach((m, i) => {
            const l = plan.leitungen.find(q => q.id === m.l);
            const n = sim ? sim.netzVon[l.a.t + ':' + l.a.p] : null;
            const p = n != null ? Math.max(0, druckVon(n)) : 0;
            const g = el('g', { class: 'fp-messgeraet', 'data-i': i, transform: `translate(${m.x},${m.y})`, style: 'cursor:pointer' }, ebMess);
            el('line', { x1: 0, y1: 0, x2: 0, y2: -14, stroke: '#263238', 'stroke-width': 1.4 }, g);
            el('circle', { cx: 0, cy: 0, r: 2.6, fill: '#263238' }, g);
            el('circle', { cx: 0, cy: -27, r: 13, fill: '#fff', stroke: '#263238', 'stroke-width': 1.6 }, g);
            const w = Math.min(10, p) / 10 * 270 - 135, r = w * Math.PI / 180;
            el('line', { x1: 0, y1: -27, x2: Math.sin(r) * 10, y2: -27 - Math.cos(r) * 10, stroke: '#d32f2f', 'stroke-width': 1.6 }, g);
            el('rect', { x: -25, y: -58, width: 50, height: 16, rx: 3, fill: '#263238' }, g);
            const t = el('text', { x: 0, y: -46.5, 'text-anchor': 'middle', 'font-size': 10.5, 'font-family': 'monospace', fill: '#fff' }, g);
            t.textContent = sim ? p.toFixed(2).replace('.', ',') + ' bar' : '– bar';
        });
    }
    function hoverStatus(e) {
        if (!simLaeuft() || !sim || (plan.fehlersuche && fehlerAnzahl())) return;
        const lt = e.target.getAttribute && e.target.getAttribute('data-l');
        if (lt) {
            const l = plan.leitungen.find(q => q.id === lt);
            const k = l && sim.netzVon[l.a.t + ':' + l.a.p];
            if (k != null) status(`<b>Leitung</b>: ${druckVon(k).toFixed(2)} bar`);
        }
    }
    function anlageUmschalten() {
        if (!plan.anlage && !plan.teile.some(t => t.typ === 'zyl_dw' || t.typ === 'zyl_ew')) { status('Erst einen Zylinder in den Plan setzen.'); return; }
        if (plan.anlage && plan.erzeugt && plan.erzeugt.length && !confirm('Verbindung lösen? Die vom Plan in der 2D-Anlage erzeugten Zylinder bleiben stehen.')) return;
        aendern(() => { plan.anlage = !plan.anlage; if (!plan.anlage) plan.erzeugt = []; });
    }
    function knopfZustand() {
        const ab = document.getElementById('fp-anlage');
        if (ab) { ab.textContent = plan.anlage ? '🏭 2D-Anlage: verbunden' : '🏭 2D-Anlage: aus'; ab.classList.toggle('an', !!plan.anlage); }
        const s = document.getElementById('fp-sim');
        if (s) { const an = simLaeuft(); s.classList.add('sim'); s.classList.toggle('an', an); s.textContent = an ? '■ Stopp' : '▶ Simulation'; }
        const u = document.getElementById('fp-undo'); if (u) u.disabled = !undoStapel.length;
        const r = document.getElementById('fp-redo'); if (r) r.disabled = !redoStapel.length;
        const vb = document.getElementById('btn-view-fluid');
        if (vb) vb.classList.toggle('active', offen);
    }

    // ------------------------------------------------------------
    // Simulation
    // ------------------------------------------------------------
    // Netz: Volumen V (l) und Luftmenge M (Normliter), p = M/V − 1.
    // Spezialknoten: 'ATM' (0 bar, unendlich groß), Quellen (fester Druck).
    function simInit() {
        // Anschlüsse zu Netzen zusammenfassen (Union-Find)
        const vater = {};
        const finde = k => { while (vater[k] !== k) { vater[k] = vater[vater[k]]; k = vater[k]; } return k; };
        const vereine = (a, b) => { a = finde(a); b = finde(b); if (a !== b) vater[a] = b; };
        const alle = [];
        for (const t of plan.teile) for (const p of geo(t).ports) { const k = t.id + ':' + p.id; vater[k] = k; alle.push(k); }
        const anzahl = {};
        for (const l of plan.leitungen) {
            const a = l.a.t + ':' + l.a.p, b = l.b.t + ':' + l.b.p;
            if (vater[a] == null || vater[b] == null) continue;
            if (fehlerAktiv('L:' + l.id) !== 'zu') vereine(a, b);
            anzahl[a] = (anzahl[a] || 0) + 1; anzahl[b] = (anzahl[b] || 0) + 1;
        }
        const netzVon = {}, netze = [];
        const idx = {};
        for (const k of alle) {
            const r = finde(k);
            if (idx[r] == null) { idx[r] = netze.length; netze.push({ V: 0.0005, M: 0.0005, leitungen: 0, offen: [] }); }
            netzVon[k] = idx[r];
        }
        for (const l of plan.leitungen) { const n = netzVon[l.a.t + ':' + l.a.p]; if (n != null) netze[n].V += V_LEITUNG; }
        netze.forEach(n => { n.M = n.V; });
        // Offene Anschlüsse (ohne Leitung) blasen ab
        for (const t of plan.teile) for (const p of geo(t).ports) {
            const k = t.id + ':' + p.id;
            if (anzahl[k]) continue;
            if (t.typ === 'knoten' || t.typ === 'daempfer') continue;
            if (t.typ === 'quelle' || t.typ === 'manometer' || t.typ === 'dschalter') continue;
            if (p.art === 's') continue; // freier Steueranschluss: kein Druck
            netze[netzVon[k]].offen.push({ t: t.id, p: p.id, g: p.art === 'r' ? G_VENTIL : G_VENTIL * 0.8 });
        }
        // Undichte Leitungen blasen ab
        for (const l of plan.leitungen) if (fehlerAktiv('L:' + l.id) === 'leck') { const n = netzVon[l.a.t + ':' + l.a.p]; if (n != null) netze[n].offen.push({ t: l.a.t, p: l.a.p, g: G_VENTIL * 0.6 }); }
        const zust = {};
        for (const t of plan.teile) {
            const z = { };
            if (t.typ === 'zyl_dw' || t.typ === 'zyl_ew' || t.typ === 'schwenk') {
                z.x = (t.typ !== 'zyl_ew' && t.o.start === 'vorne') ? zylHub(t) : 0; z.v = 0;
            }
            if (t.typ === 'ventil') {
                const n = ventilStellungen(t.o).length;
                z.stellung = n === 3 ? 1 : n - 1;   // Ruhestellung (rechter Kasten bzw. Mitte)
                z.kasten = z.stellung;
                if (t.o.links === 'hebel') z.rasteL = false;
                if (t.o.rechts === 'hebel') z.rasteR = false;
                z.pulsL = 0; z.pulsR = 0;
            }
            if (t.typ === 'zeit') { z.pr = 0; z.an = false; }
            if (t.typ === 'folge' || t.typ === 'dschalter') z.an = false;
            if (t.typ === 'wechsel') z.seite = 'X';
            zust[t.id] = z;
        }
        sim = { netze, netzVon, zust, zeit: 0, schreib: {} };
        return sim;
    }
    const druckVon = n => {
        const N = sim.netze[n];
        return N ? N.M / N.V - 1 : 0;
    };
    const pPort = (t, pid) => { const n = sim.netzVon[t.id + ':' + pid]; return n == null ? 0 : druckVon(n); };
    const netz = (t, pid) => sim.netzVon[t.id + ':' + pid];

    // Kante zwischen zwei Netzen (oder Netz und Atmosphäre/Quelle) ausgleichen
    // g in Nl/(s·bar); nur = 1: nur von a nach b
    function fluss(na, nb, g, nur, pQuelle) {
        if (g <= 0 || na == null) return 0;
        const A = sim.netze[na];
        const pa = A.M / A.V - 1;
        let pb, Vb;
        if (nb === 'ATM') { pb = 0; Vb = Infinity; }
        else if (nb === 'Q') { pb = pQuelle; Vb = Infinity; }
        else { if (nb == null || nb === na) return 0; const B = sim.netze[nb]; pb = B.M / B.V - 1; Vb = B.V; }
        let dp = pa - pb;
        if (nur && dp <= 0) return 0;
        if (nur === -1 && dp >= 0) return 0;
        // Durchfluss mit leichtem Wurzel-Gesetz (realistischer bei großen Druckdifferenzen)
        let q = g * Math.sign(dp) * Math.min(Math.abs(dp), 2 * Math.sqrt(Math.abs(dp) + 0.0001)) * DT;
        const gl = dp / (1 / A.V + (isFinite(Vb) ? 1 / Vb : 0));   // Menge bis Gleichgewicht
        if (Math.abs(q) > Math.abs(gl)) q = gl;
        A.M -= q;
        if (isFinite(Vb)) sim.netze[nb].M += q;
        if (A.M < A.V * 0.05) A.M = A.V * 0.05;   // nicht unter Vakuum ~ −0,95 bar
        return q;
    }

    function betaetigt(t, z, seite, aktuell) {
        const b = seite === 'L' ? t.o.links : t.o.rechts;
        if (b === 'feder') return false;
        const fe = fehlerAktiv(t.id);
        if (fe === 'spule' && b === 'magnet') return false;
        if (fe === 'rolle' && b !== 'magnet' && b !== 'pneu') return false;
        if (b === 'magnet') {
            const v = seite === 'L' ? t.o.varL : t.o.varR;
            const s = sps();
            return !!(v && s[v]) || gedrueckt.has(t.id + ':' + seite);
        }
        if (b === 'hebel') return !!(seite === 'L' ? z.rasteL : z.rasteR);
        if (MANUELL[b]) return gedrueckt.has(t.id + ':' + seite);
        if (b === 'pneu') {
            const geoT = geo(t);
            const pp = geoT.ports.find(p => p.art === 's' && p.seite === seite);
            const p = pp ? pPort(t, pp.id) : 0;
            return aktuell ? p > 1.0 : p > 1.6;   // Schalthysterese
        }
        if (b === 'rolle' || b === 'rolle_leer') {
            const zid = seite === 'L' ? t.o.zyl : t.o.zylR;
            const pos = seite === 'L' ? t.o.pos : t.o.posR;
            const zyl = teil(zid); if (!zyl || !sim.zust[zid]) return false;
            const zz = sim.zust[zid], hub = zylHub(zyl);
            const ziel = posAnteil(zyl, pos) * hub;
            const nah = Math.abs(zz.x - ziel) <= Math.max(1.5, hub * 0.02);
            if (b === 'rolle') return nah;
            // Leerrücklauf: nur in einer Richtung, kurzer Impuls beim Überfahren
            const richt = seite === 'L' ? t.o.richt : t.o.richtR;
            const key = seite === 'L' ? 'pulsL' : 'pulsR';
            const fahrt = richt === 'ein' ? zz.v < -1 : zz.v > 1;
            if (nah && fahrt) z[key] = 0.12;
            return z[key] > 0;
        }
        return false;
    }

    function simSchritt(dtGesamt) {
        if (!sim) simInit();
        const S = sim;
        // --- Ventilstellungen (einmal je Bild) ---
        for (const t of plan.teile) {
            const z = S.zust[t.id];
            if (t.typ === 'ventil') {
                if (z.pulsL > 0) z.pulsL -= dtGesamt;
                if (z.pulsR > 0) z.pulsR -= dtGesamt;
                const st = ventilStellungen(t.o), n = st.length;
                const L = betaetigt(t, z, 'L', z.stellung === 0);
                const R = betaetigt(t, z, 'R', z.stellung === n - 1);
                let neu = z.stellung;
                if (n === 3) neu = L && !R ? 0 : R && !L ? 2 : 1;
                else if (t.o.rechts === 'feder') neu = L ? 0 : 1;
                else if (t.o.links === 'feder') neu = R ? 1 : 0;
                else { if (L && !R) neu = 0; else if (R && !L) neu = 1; }
                if (fehlerAktiv(t.id) === 'klemmt') neu = n === 3 ? 1 : (t.o.links === 'feder' ? 0 : n - 1);
                if (neu !== z.stellung) { z.stellung = neu; klick(); }
            } else if (t.typ === 'zeit') {
                const p12 = pPort(t, geo(t).ports.find(p => p.art === 's').id);
                const tau = Math.max(0.05, zahl(t.o.zeit, 3) / Math.LN2);
                if (fehlerAktiv(t.id) === 'zu') { /* Zeitdrossel verstopft: Speicher füllt sich nicht */ }
                else if (p12 > z.pr) z.pr += (p12 - z.pr) * Math.min(1, dtGesamt / tau);
                else z.pr += (p12 - z.pr) * Math.min(1, dtGesamt / 0.04);
                const an = z.an ? z.pr > 2.5 : z.pr >= 3;
                if (an !== z.an) { z.an = an; klick(); }
            } else if (t.typ === 'folge') {
                const p12 = pPort(t, geo(t).ports.find(p => p.art === 's').id);
                const ps = zahl(t.o.p, 4);
                const an = fehlerAktiv(t.id) === 'klemmt' ? false : z.an ? p12 > ps - 0.3 : p12 >= ps;
                if (an !== z.an) { z.an = an; klick(); }
            } else if (t.typ === 'dschalter') {
                const p = pPort(t, '1'), ps = zahl(t.o.p, 4);
                z.an = fehlerAktiv(t.id) === 'defekt' ? false : z.an ? p > ps - 0.3 : p >= ps;
                if (t.o.var) S.schreib[t.o.var] = z.an;
            }
        }
        // --- Teilschritte: Strömung und Kolben ---
        const n = Math.max(1, Math.min(60, Math.round(dtGesamt / DT)));
        for (let i = 0; i < n; i++) teilschritt();
        // --- Sensoren ---
        for (const t of plan.teile) {
            if (t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew' && t.typ !== 'schwenk') continue;
            const z = S.zust[t.id], hub = zylHub(t), tol = Math.max(0.6, hub * 0.01);
            const tot = fehlerAktiv(t.id) === 'sensor';
            if (t.o.sensH) S.schreib[t.o.sensH] = !tot && z.x <= tol;
            if (t.o.sensV) S.schreib[t.o.sensV] = !tot && z.x >= hub - tol;
        }
        S.zeit += dtGesamt;
    }

    function teilschritt() {
        const S = sim;
        // Volumen der Zylinderkammern
        const N = S.netze;
        for (const t of plan.teile) {
            if (t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew' && t.typ !== 'schwenk') continue;
            const z = S.zust[t.id];
            const k = flaechen(t);
            const nk = netz(t, 'K'), ns = netz(t, 'S');
            const neuK = k.tot + k.AK * z.x * 1e-4, neuS = k.tot + k.AS * (zylHub(t) - z.x) * 1e-4;
            if (nk != null) { N[nk].V += neuK - (z.vk || 0); }
            if (ns != null) { N[ns].V += neuS - (z.vs || 0); }
            z.vk = neuK; z.vs = neuS;
        }
        // Quellen
        for (const t of plan.teile) {
            if (t.typ === 'quelle') fluss(netz(t, '1'), 'Q', G_QUELLE, 0, fehlerAktiv(t.id) === 'druck' ? 2.5 : zahl(t.o.p, 6));
        }
        // Bauteile
        for (const t of plan.teile) {
            const z = S.zust[t.id];
            switch (t.typ) {
                case 'ventil': {
                    const st = ventilStellungen(t.o)[z.stellung];
                    for (const [a, b] of st.w) fluss(netz(t, a), netz(t, b), G_VENTIL, 0);
                    if (fehlerAktiv(t.id) === 'leck') fluss(netz(t, '1'), 'ATM', G_VENTIL * 0.3, 1);
                    break;
                }
                case 'zeit': case 'folge': {
                    const o = { wege: '3/2', ruhe: t.o.ruhe === 'offen' ? 'offen' : 'zu' };
                    const st = ventilStellungen(o)[z.an ? 0 : 1];
                    for (const [a, b] of st.w) fluss(netz(t, a), netz(t, b), G_VENTIL, 0);
                    break;
                }
                case 'wartung': case 'druckregel': {
                    const fe = fehlerAktiv(t.id);
                    const n1 = netz(t, '1'), n2 = netz(t, '2'), ps = fe === 'druck' ? 2.5 : zahl(t.o.p, 6);
                    const p2 = n2 != null ? druckVon(n2) : 0;
                    const off = Math.max(0, Math.min(1, (ps - p2) / 0.4));
                    if (off > 0) fluss(n1, n2, G_VENTIL * 1.5 * off * (fe === 'zu' ? 0.03 : 1), 1);
                    else if (p2 > ps + 0.15) fluss(n2, 'ATM', G_VENTIL * 0.5 * Math.min(1, (p2 - ps) / 0.4), 1);
                    break;
                }
                case 'drossel': fluss(netz(t, '1'), netz(t, '2'), G_VENTIL * Math.pow((fehlerAktiv(t.id) === 'zu' ? 0.5 : zahl(t.o.offen, 50)) / 100, 2), 0); break;
                case 'drv': {
                    const fe = fehlerAktiv(t.id);
                    let n1 = netz(t, '1'), n2 = netz(t, '2');
                    if (fe === 'verkehrt') [n1, n2] = [n2, n1];
                    fluss(n1, n2, G_VENTIL * Math.pow((fe === 'zu' ? 0.5 : zahl(t.o.offen, 50)) / 100, 2), 0);
                    fluss(n2, n1, G_VENTIL, 1);   // Rückschlag: frei von 2 nach 1
                    break;
                }
                case 'rueck': if (fehlerAktiv(t.id) === 'verkehrt') fluss(netz(t, '2'), netz(t, '1'), G_VENTIL, 1); else fluss(netz(t, '1'), netz(t, '2'), G_VENTIL, 1); break;
                case 'wechsel': case 'zweidruck': {
                    const px = pPort(t, 'X'), py = pPort(t, 'Y');
                    let s;
                    if (t.typ === 'wechsel') s = Math.abs(px - py) < 0.05 ? z.seite : (px > py ? 'X' : 'Y');
                    else s = Math.abs(px - py) < 0.05 ? z.seite : (px < py ? 'X' : 'Y');
                    z.seite = s;
                    if (fehlerAktiv(t.id) !== 'klemmt') fluss(netz(t, s), netz(t, '2'), G_VENTIL, 0);
                    break;
                }
                case 'schnell': {
                    if (fehlerAktiv(t.id) === 'klemmt') break;
                    const p1 = pPort(t, '1'), p2 = pPort(t, '2');
                    if (p1 >= p2 - 0.05) { fluss(netz(t, '1'), netz(t, '2'), G_VENTIL, 1); z.ab = false; }
                    else { fluss(netz(t, '2'), netz(t, '3'), G_VENTIL * 3, 1); z.ab = true; }
                    break;
                }
                case 'daempfer': {
                    let g = t.o.drossel ? G_VENTIL * Math.pow(zahl(t.o.offen, 100) / 100, 2) : G_VENTIL * 2;
                    if (fehlerAktiv(t.id) === 'zu') g *= 0.002;
                    fluss(netz(t, '1'), 'ATM', g, 1);
                    break;
                }
            }
        }
        // Offene Anschlüsse
        for (let i = 0; i < N.length; i++) for (const o of N[i].offen) fluss(i, 'ATM', o.g, 0);
        // Kolben bewegen
        for (const t of plan.teile) {
            if (t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew' && t.typ !== 'schwenk') continue;
            const z = S.zust[t.id], k = flaechen(t), hub = zylHub(t);
            const fz = fehlerAktiv(t.id);
            if (fz === 'dichtung') { if (t.typ === 'zyl_ew') fluss(netz(t, 'K'), 'ATM', G_VENTIL * 0.35, 1); else fluss(netz(t, 'K'), netz(t, 'S'), G_VENTIL * 0.35, 0); }
            const pk = pPort(t, 'K'), ps = t.typ === 'zyl_ew' ? 0 : pPort(t, 'S');
            let F = 10 * (pk * k.AK - ps * k.AS);
            if (t.typ === 'zyl_ew') F -= k.feder0 + k.federC * z.x;
            if (t.typ === 'schwenk') F -= zahl(t.o.moment, 2) * 10 * Math.sign(F || 1) * 0; // Moment als Last unten
            const last = t.typ === 'schwenk' ? zahl(t.o.moment, 2) * 25 : zahl(t.o.last, 0);
            // Last wirkt gegen das Ausfahren, Reibung gegen die Bewegung
            F -= last;
            const reib = fz === 'klemmt' ? k.reib * 9 : k.reib;
            let v = z.v;   // mm/s
            const m = k.m;
            // Haftreibung
            if (Math.abs(v) < 1 && Math.abs(F) <= reib) { v = 0; }
            else {
                const Fr = F - reib * Math.sign(v || F);
                // m·dv/dt = F − d·v  (semi-implizit), v in m/s
                let vm = v / 1000;
                vm = (vm + Fr / m * DT) / (1 + k.d / m * DT);
                v = vm * 1000;
            }
            let x = z.x + v * DT;
            if (x <= 0) { x = 0; if (v < 0) v = 0; }
            if (x >= hub) { x = hub; if (v > 0) v = 0; }
            // Endlagendämpfung: kurz vor dem Ende langsamer
            if (t.o.daempfung) { const rest = v > 0 ? hub - x : x; if (rest < hub * 0.08 && Math.abs(v) > 60) v *= 0.97; }
            z.x = x; z.v = v;
        }
    }
    function flaechen(t) {
        if (t.typ === 'schwenk') {
            // Ersatz: Flügel wie ein Zylinder 32 mm, „Hub" in Grad
            const A = 8;
            return { AK: A, AS: A, tot: 0.003, m: 0.4, d: 120, reib: 6, feder0: 0, federC: 0 };
        }
        const d = zahl(t.o.d, 20), ds = t.typ === 'zyl_dw' ? zahl(t.o.dStange, 8) : zahl(t.o.dStange, 6);
        const AK = Math.PI * d * d / 400;               // cm²
        const AS = AK - Math.PI * ds * ds / 400;
        const Fmax = 10 * 6 * AK;
        return { AK, AS, tot: 0.0015 + AK * 0.5e-4, m: 0.3 + d / 80, d: Fmax / 2.5, reib: 0.04 * Fmax + 3,
            feder0: 0.06 * Fmax, federC: 0.06 * Fmax / Math.max(10, zahl(t.o.hub, 50)) };
    }
    let letzterKlick = 0;
    function klick() {
        const n = performance.now();
        if (n - letzterKlick < 40) return;
        letzterKlick = n;
        try { if (typeof SoundEngine !== 'undefined' && (window.soundMode === 2 || window.soundMode === 3)) SoundEngine.clack(); } catch (e) {}
    }

    // Handbetätigung während der Simulation
    function handDruck(id, seite, an) {
        const t = teil(id); if (!t || !sim) return;
        const b = seite === 'L' ? t.o.links : t.o.rechts;
        const z = sim.zust[id];
        if (b === 'hebel') { if (an) { if (seite === 'L') z.rasteL = !z.rasteL; else z.rasteR = !z.rasteR; } return; }
        const key = id + ':' + seite;
        if (an) gedrueckt.add(key); else gedrueckt.delete(key);
        try { if (an && typeof SoundEngine !== 'undefined') SoundEngine.click(); } catch (e) {}
    }

    // Darstellung des Simulationszustands (je Bild)
    function darstellen() {
        if (!svg || !offen) return;
        const an = !!sim;
        messDarstellen();
        for (const l of plan.leitungen) {
            const p = dyn.get('L:' + l.id); if (!p) continue;
            const n = an ? sim.netzVon[l.a.t + ':' + l.a.p] : null;
            p.classList.toggle('druck', an && n != null && druckVon(n) > P_AN);
        }
        for (const t of plan.teile) {
            const r = dyn.get(t.id); if (!r) continue;
            const z = an ? sim.zust[t.id] : null;
            if (t.typ === 'ventil' && r.block) {
                const n = r.geo.n, ruhe = n === 3 ? 1 : n - 1;
                const k = z ? z.stellung : ruhe;
                r.block.setAttribute('transform', `translate(${(ruhe - k) * KASTEN},0)`);
                // Stich zum Steueranschluss nachziehen
                r.g.querySelectorAll('.fp-steuerstich').forEach(s => {
                    const seite = s.getAttribute('data-seite');
                    const x2 = seite === 'L' ? -betBreite(t.o.links) + (ruhe - k) * KASTEN : n * KASTEN + betBreite(t.o.rechts) + (ruhe - k) * KASTEN;
                    s.setAttribute('x2', x2);
                });
                // aktive Magnetspule hervorheben
                const s = sps();
                r.g.querySelectorAll('.fp-bet-magnet').forEach((m, i) => {
                    const seite = m.closest('.fp-bet-l') ? 'L' : 'R';
                    const v = seite === 'L' ? t.o.varL : t.o.varR;
                    m.setAttribute('fill', an && v && s[v] ? 'var(--fp-aktiv)' : 'none');
                    void i;
                });
            }
            if ((t.typ === 'zeit' || t.typ === 'folge') && r.block) {
                r.block.setAttribute('transform', `translate(${z && z.an ? KASTEN : 0},0)`);
                if (r.speicher) r.speicher.setAttribute('fill', z && z.pr > 0.3 ? `rgba(21,101,192,${Math.min(0.85, z.pr / 6)})` : 'var(--fp-papier)');
            }
            if ((t.typ === 'zyl_dw' || t.typ === 'zyl_ew') && r.kolben) {
                const s = z ? z.x / zylHub(t) : (t.typ !== 'zyl_ew' && t.o.start === 'vorne' ? 1 : 0);
                r.kolben.setAttribute('transform', `translate(${kolbenX(s)},0)`);
                if (r.feder) {
                    const x0 = kolbenX(s) + 4, x1 = ZYL_L - 2, pts = [];
                    for (let i = 0; i <= 8; i++) pts.push((x0 + (x1 - x0) * i / 8) + ',' + (ZYL_H / 2 + (i === 0 || i === 8 ? 0 : (i % 2 ? -7 : 7))));
                    r.feder.setAttribute('points', pts.join(' '));
                }
            }
            if (t.typ === 'schwenk' && r.zeiger) {
                const s = z ? z.x / zylHub(t) : 0;
                const w = Math.PI - s * Math.PI;
                r.zeiger.setAttribute('x2', 16 * Math.cos(w)); r.zeiger.setAttribute('y2', 8 - 16 * Math.sin(w));
            }
            if (t.typ === 'manometer' && r.nadel) {
                const p = an ? pPort(t, '1') : 0;
                const w = (-135 + Math.max(0, Math.min(10, p)) / 10 * 270) * Math.PI / 180;
                r.nadel.setAttribute('x2', 9 * Math.sin(w)); r.nadel.setAttribute('y2', -9 * Math.cos(w));
                if (r.wert) r.wert.textContent = an ? p.toFixed(1) + ' bar' : '';
            }
            if (t.typ === 'wechsel' && r.kugel) r.kugel.setAttribute('cx', z ? (z.seite === 'X' ? 9 : -9) : 0);
            if (t.typ === 'zweidruck' && r.schieber) r.schieber.setAttribute('transform', `translate(${z ? (z.seite === 'X' ? 3 : -3) : 0},0)`);
            if (t.typ === 'schnell' && r.kugel) r.kugel.setAttribute('cy', z && z.ab ? 6 : -2);
            if (t.typ === 'dschalter') { const k = r.g.querySelector('.fp-kontakt'); if (k) k.setAttribute('d', z && z.an ? 'M12,2 H18 L26,-4' : 'M12,2 H18 L26,-8'); }
        }
    }

    // Laufschleife: rechnet, solange die VALIS-Simulation läuft
    let letzte = 0, warLaufend = false;

    // ------------------------------------------------------------
    // Weg-Schritt- und Weg-Zeit-Diagramm (zeichnet während der Simulation mit)
    // ------------------------------------------------------------
    let diagBox = null, diagSvg = null, diagArt = 'schritt', aufz = null, diagBild = 0;
    const antriebe = () => plan.teile.filter(t => t.typ === 'zyl_dw' || t.typ === 'zyl_ew' || t.typ === 'schwenk');
    function aufzNeu() { aufz = { t0: sim ? sim.zeit : 0, proben: [], ids: antriebe().map(t => t.id) }; }
    function aufzeichnen() {
        if (!sim) return;
        if (!aufz) aufzNeu();
        const p = aufz.proben, letzte = p[p.length - 1];
        if (letzte && sim.zeit - letzte.t < 0.02) return;
        const x = {};
        for (const id of aufz.ids) { const t = teil(id), z = sim.zust[id]; if (t && z) x[id] = Math.max(0, Math.min(1, z.x / zylHub(t))); }
        p.push({ t: sim.zeit, x });
        if (p.length > 6000) p.splice(0, p.length - 6000);
    }
    // Schritte: Grenze, sobald ein Zylinder aus der Bewegung eine Endlage erreicht.
    // Ist er zusammen mit dem Zylinder der letzten Grenze losgefahren (gleichzeitige
    // Bewegung), gehört seine Ankunft noch zum selben Schritt.
    function schritte() {
        if (!aufz || !aufz.proben.length) return [];
        const P = aufz.proben, ids = aufz.ids, out = [P[0]];
        const ende = v => v <= 0.01 || v >= 0.99;
        const start = {};          // Zeitpunkt, an dem der Zylinder seine Endlage verlassen hat
        let grenzeStart = null;    // Startzeit der Bewegung, die die letzte Grenze gesetzt hat
        for (let i = 1; i < P.length; i++) {
            const ank = [];
            for (const id of ids) {
                const a = P[i - 1].x[id], b = P[i].x[id];
                if (a == null || b == null) continue;
                if (Math.abs(b - a) > 0.002 && start[id] == null) start[id] = P[i - 1].t;
                if (!ende(a) && ende(b)) ank.push(id);
            }
            if (!ank.length) continue;
            const s0 = Math.min(...ank.map(id => start[id] != null ? start[id] : P[i].t));
            const gleichzeitig = grenzeStart != null && Math.abs(s0 - grenzeStart) < 0.06;
            if (gleichzeitig) out[out.length - 1] = P[i]; else { out.push(P[i]); grenzeStart = s0; }
            ank.forEach(id => { delete start[id]; });
        }
        return out;
    }
    function diagZeichnen(sofort) {
        if (!diagBox || !diagBox.classList.contains('offen')) return;
        if (!sofort && ++diagBild % 6) return;
        const sb = document.getElementById('fp-d-schritt'), zb = document.getElementById('fp-d-zeit');
        if (sb) sb.classList.toggle('an', diagArt === 'schritt'); if (zb) zb.classList.toggle('an', diagArt === 'zeit');
        const svgD = diagSvg; svgD.innerHTML = '';
        diagBox.style.height = Math.min(360, Math.max(170, 54 + antriebe().length * 36)) + 'px';
        const W = diagBox.clientWidth || 600, H = diagBox.clientHeight || 170;
        svgD.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const zyl = antriebe();
        const T = (x, y, txt, a) => { const e = el('text', Object.assign({ x, y, 'font-size': 10.5, fill: '#37474f' }, a || {}), svgD); e.textContent = txt; return e; };
        if (!zyl.length) { T(12, 24, 'Keine Zylinder im Plan.'); return; }
        const L = 70, R = W - 14, O = 26, zeileH = Math.max(28, Math.min(54, (H - O - 28) / zyl.length));
        const hoehe = zeileH * 0.62;
        const st = schritte();
        let n, xVon;
        if (diagArt === 'schritt') {
            n = Math.max(st.length, 2);
            const spalte = (R - L) / Math.max(n - 1, 4);
            xVon = i => L + i * spalte;
            for (let i = 0; i < Math.max(n, 5); i++) {
                const x = xVon(i); if (x > R + 1) break;
                el('line', { x1: x, y1: O - 4, x2: x, y2: O + zeileH * zyl.length, stroke: '#cfd8dc', 'stroke-width': 1 }, svgD);
                T(x, O - 8, String(i + 1), { 'text-anchor': 'middle', 'font-size': 10, fill: '#78909c' });
            }
            T(4, O - 8, 'Schritt', { 'font-size': 10, fill: '#78909c' });
        } else {
            const P = aufz ? aufz.proben : [];
            const t0 = P.length ? P[0].t : 0, t1 = P.length ? P[P.length - 1].t : 1;
            const dauer = Math.max(1, t1 - t0);
            xVon = t => L + (t - t0) / dauer * (R - L);
            const schrittS = dauer > 20 ? 5 : dauer > 8 ? 2 : dauer > 3 ? 1 : 0.5;
            for (let s = 0; s <= dauer + 1e-6; s += schrittS) {
                const x = L + s / dauer * (R - L);
                el('line', { x1: x, y1: O - 4, x2: x, y2: O + zeileH * zyl.length, stroke: '#eceff1', 'stroke-width': 1 }, svgD);
                T(x, O - 8, String(+s.toFixed(1)).replace('.', ',') + ' s', { 'text-anchor': 'middle', 'font-size': 9.5, fill: '#78909c' });
            }
        }
        zyl.forEach((t, k) => {
            const y0 = O + k * zeileH + (zeileH - hoehe) / 2 + hoehe, y1 = y0 - hoehe;
            T(6, y0 - hoehe / 2 + 4, t.bez || '?', { 'font-weight': 'bold', fill: '#263238' });
            T(L - 6, y1 + 4, '1', { 'text-anchor': 'end', 'font-size': 9, fill: '#90a4ae' });
            T(L - 6, y0 + 3, '0', { 'text-anchor': 'end', 'font-size': 9, fill: '#90a4ae' });
            el('line', { x1: L, y1: y0, x2: R, y2: y0, stroke: '#b0bec5', 'stroke-width': 1 }, svgD);
            el('line', { x1: L, y1: y1, x2: R, y2: y1, stroke: '#eceff1', 'stroke-width': 1 }, svgD);
            let pts = [];
            if (diagArt === 'schritt') pts = st.map((p, i) => [xVon(i), y0 - (p.x[t.id] != null ? p.x[t.id] : 0) * hoehe]);
            else if (aufz) pts = aufz.proben.filter(p => p.x[t.id] != null).map(p => [xVon(p.t), y0 - p.x[t.id] * hoehe]);
            if (pts.length) el('path', { d: 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L'), fill: 'none', stroke: '#1565c0', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, svgD);
        });
        if (!aufz || aufz.proben.length < 2) T(L, H - 9, 'Simulation starten: das Diagramm zeichnet mit.', { fill: '#90a4ae' });
    }
    function diagSvgSpeichern() {
        if (!diagSvg) return;
        diagZeichnen(true);
        const k = diagSvg.cloneNode(true);
        k.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const vb = (k.getAttribute('viewBox') || '0 0 600 170').split(' ');
        k.setAttribute('width', vb[2]); k.setAttribute('height', vb[3]);
        el('rect', { x: 0, y: 0, width: vb[2], height: vb[3], fill: '#fff' }, k).parentNode.insertBefore(k.lastChild, k.firstChild);
        const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(k)], { type: 'image/svg+xml' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (diagArt === 'schritt' ? 'weg-schritt-diagramm' : 'weg-zeit-diagramm') + '.svg';
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    function schleife(ts) {
        requestAnimationFrame(schleife);
        const laeuft = simLaeuft();
        if (laeuft !== warLaufend) {
            warLaufend = laeuft;
            if (laeuft) { sim = null; simInit(); gedrueckt.clear(); aufzNeu(); }
            if (svg) { svg.classList.toggle('sim', laeuft); eigenschaften(); }
            knopfZustand(); status();
        }
        if (!plan.teile.length) { letzte = ts; return; }
        const dt = Math.min(0.05, Math.max(0, (ts - letzte) / 1000)) * (window.simSpeed || 1);
        letzte = ts;
        if (laeuft && dt > 0) {
            if (!sim) simInit();
            sim.schreib = {};
            simSchritt(dt);
            // VALIS-Eingänge schreiben
            const s = sps(); let geaendert = false;
            for (const v in sim.schreib) { const w = !!sim.schreib[v]; if (s[v] !== w) { s[v] = w; geaendert = true; } }
            if (geaendert && typeof runSimulationTick === 'function') { try { runSimulationTick(); } catch (e) {} }
        }
        if (laeuft && sim) aufzeichnen();
        if (offen) { darstellen(); diagZeichnen(); }
    }

    // Zylinder der 2D-Anlage, der einem Planzylinder folgt (Hook in der Zylinder-Mechanik)
    window._fpZylinder = function (obj) {
        if (!sim || !simLaeuft() || !plan.anlage) return null;
        const t = plan.teile.find(q => (q.typ === 'zyl_dw' || q.typ === 'zyl_ew') && q.o.anlage === obj.id);
        if (!t) return null;
        const z = sim.zust[t.id]; if (!z) return null;
        const ziel = z.x / zylHub(t) * 100;
        const ist = obj.extension || 0;
        const diff = ziel - ist;
        if (Math.abs(diff) < 0.4) return { dir: 0, v: 0 };
        const stroke = obj.stroke || 100;
        // Planzylinder-Geschwindigkeit plus Aufholen des Rückstands (Zeitkonstante ~0,1 s),
        // höchstens so schnell, dass die Anlage in einem Bild bis zum Ziel fährt
        const vMax = Math.abs(diff) / 100 * stroke * 60;
        const v = Math.abs(z.v) / zylHub(t) * stroke + Math.abs(diff) / 100 * stroke * 10;
        return { dir: diff > 0 ? 1 : -1, v: Math.min(vMax, Math.max(v, 20)) };
    };


    // ------------------------------------------------------------
    // Fehlersuche: versteckte Fehler (Lehrkraft) und Befund (Lernende)
    // ------------------------------------------------------------
    // plan.fehler = { '<teilId>' | 'L:<leitungId>': art }, plan.fehlersuche = true
    // blendet sie aus; plan.verdacht = Liste der Meldungen der Lernenden.
    const FEHLER = {
        leitung: [['leck', 'Leitung undicht (bläst ab)'], ['zu', 'Leitung geknickt (kein Durchgang)']],
        ventil: [['klemmt', 'Ventil klemmt in Ruhestellung'], ['spule', 'Magnetspule defekt'], ['rolle', 'Rolle/Betätigung verstellt'], ['leck', 'Ventil innen undicht']],
        zyl_dw: [['dichtung', 'Kolbendichtung undicht'], ['klemmt', 'Zylinder schwergängig'], ['sensor', 'Endlagensensoren defekt']],
        zyl_ew: [['dichtung', 'Kolbendichtung undicht'], ['klemmt', 'Zylinder schwergängig'], ['sensor', 'Endlagensensoren defekt']],
        schwenk: [['klemmt', 'Schwenkantrieb schwergängig'], ['sensor', 'Sensoren defekt']],
        quelle: [['druck', 'Versorgungsdruck zu niedrig (2,5 bar)']],
        wartung: [['druck', 'Druckregler verstellt (2,5 bar)'], ['zu', 'Filter verstopft']],
        druckregel: [['druck', 'Druckregler verstellt (2,5 bar)']],
        drossel: [['zu', 'Drossel verstopft']],
        drv: [['zu', 'Drossel verstopft'], ['verkehrt', 'verkehrt herum eingebaut']],
        rueck: [['verkehrt', 'verkehrt herum eingebaut']],
        wechsel: [['klemmt', 'Ventil klemmt']],
        zweidruck: [['klemmt', 'Ventil klemmt']],
        schnell: [['klemmt', 'Ventil klemmt']],
        zeit: [['zu', 'Zeitdrossel verstopft (schaltet nie)']],
        folge: [['klemmt', 'Ventil klemmt']],
        dschalter: [['defekt', 'Druckschalter defekt (meldet nie)']],
        daempfer: [['zu', 'Schalldämpfer zugesetzt']]
    };
    const fehlerVon = id => (plan.fehler && plan.fehler[id]) || null;
    const fehlerAktiv = id => { const f = fehlerVon(id); return f && !(plan.behoben || []).includes(id) ? f : null; };
    function fehlerName(key) {
        const f = fehlerVon(key); if (!f) return '';
        const t = key.startsWith('L:') ? null : teil(key);
        const liste = key.startsWith('L:') ? FEHLER.leitung : (t && FEHLER[t.typ]) || [];
        const e = liste.find(x => x[0] === f);
        return e ? e[1] : f;
    }
    function fehlerAnzahl() { return Object.keys(plan.fehler || {}).filter(k => k.startsWith('L:') ? plan.leitungen.some(l => 'L:' + l.id === k) : teil(k)).length; }
    function fehlerGefunden() {
        const n = fehlerAnzahl();
        return n > 0 && Object.keys(plan.fehler).every(k => (plan.behoben || []).includes(k) || !(k.startsWith('L:') ? plan.leitungen.some(l => 'L:' + l.id === k) : teil(k)));
    }
    function verdachtUmschalten(key) {
        plan.verdacht = plan.verdacht || [];
        const i = plan.verdacht.indexOf(key);
        if (i >= 0) plan.verdacht.splice(i, 1); else plan.verdacht.push(key);
        speichern(); zeichnen(); fehlersucheZeigen();
    }
    function befundPruefen() {
        const v = plan.verdacht || [], f = plan.fehler || {};
        const treffer = v.filter(k => f[k]), falsch = v.filter(k => !f[k]);
        plan.behoben = Array.from(new Set((plan.behoben || []).concat(treffer)));
        plan.fehlversuche = (plan.fehlversuche || 0) + falsch.length;
        plan.verdacht = [];
        speichern(); sim = null; zeichnen();
        const n = fehlerAnzahl(), gef = plan.behoben.filter(k => f[k]).length;
        let txt = treffer.length ? `Richtig: ${treffer.map(k => (k.startsWith('L:') ? 'Leitung' : (teil(k) || {}).bez || '?') + ' (' + fehlerName(k) + ')').join(', ')}. Instandgesetzt. ` : '';
        if (falsch.length) txt += `${falsch.length} Meldung${falsch.length > 1 ? 'en waren' : ' war'} kein Fehler. `;
        txt += gef >= n ? `Alle ${n} Fehler gefunden!` : `Noch ${n - gef} von ${n} Fehlern versteckt.`;
        fehlersucheZeigen(txt);
        return { treffer: treffer.length, falsch: falsch.length, offen: n - gef };
    }
    function fehlersucheZeigen(meldung) {
        const box = document.getElementById('fp-eigen'); if (!box) return;
        box.innerHTML = ''; box.classList.add('offen');
        const n = fehlerAnzahl();
        h('h4', { text: '🔍 Fehlersuche' }, box);
        if (plan.fehlersuche) {
            const gef = (plan.behoben || []).filter(k => (plan.fehler || {})[k]).length;
            h('div', { class: 'fp-hinw', text: `In diesem Plan stecken ${n} versteckte Fehler (${gef} gefunden). Starte die Simulation, beobachte, miss mit dem Manometer. Dann klicke auf das Bauteil oder die Leitung, die du für defekt hältst, und prüfe den Befund.` }, box);
            const v = plan.verdacht || [];
            h('label', { text: 'Deine Meldungen' }, box);
            if (!v.length) h('div', { class: 'fp-hinw', text: '– noch keine –' }, box);
            v.forEach(k => h('div', { text: '• ' + (k.startsWith('L:') ? 'Leitung' : ((teil(k) || {}).bez || TYP[(teil(k) || {}).typ] && TYP[teil(k).typ].name || '?')), style: 'color:#ffb74d;margin:2px 0' }, box));
            h('button', { class: 'fp-btn', text: '✓ Befund prüfen', style: 'margin-top:8px', onclick: befundPruefen }, box);
            if (meldung) h('div', { class: 'fp-hinw', text: meldung, style: 'color:#e0e0e0;font-size:11.5px' }, box);
            h('button', { class: 'fp-btn', text: 'Lehrkraft: Fehler zeigen', style: 'margin-top:14px', title: 'Fehlersuche beenden und die Fehler wieder einblenden', onclick: () => { if (confirm('Fehlersuche beenden und die versteckten Fehler zeigen?')) aendern(() => { plan.fehlersuche = false; plan.verdacht = []; }); } }, box);
        } else {
            h('div', { class: 'fp-hinw', text: 'Lehrkraft: Bauteil oder Leitung anklicken und unter „Versteckter Fehler“ einen Fehler wählen. Dann die Fehlersuche starten: Die Fehler sind nicht mehr zu sehen, die Lernenden melden ihren Befund. Als Aufgabe speichern: Bedingung „Fluidplan: alle Fehler gefunden“.' }, box);
            h('label', { text: `Eingebaute Fehler (${n})` }, box);
            for (const k of Object.keys(plan.fehler || {})) {
                const ok = k.startsWith('L:') ? plan.leitungen.some(l => 'L:' + l.id === k) : teil(k);
                if (!ok) continue;
                h('div', { text: '• ' + (k.startsWith('L:') ? 'Leitung' : (teil(k).bez || TYP[teil(k).typ].name)) + ': ' + fehlerName(k), style: 'color:#ef9a9a;margin:2px 0' }, box);
            }
            const st = h('button', { class: 'fp-btn', text: '▶ Fehlersuche starten', style: 'margin-top:8px', onclick: () => aendern(() => { plan.fehlersuche = true; plan.verdacht = []; plan.behoben = []; plan.fehlversuche = 0; }) }, box);
            if (!n) st.disabled = true;
        }
    }
    function fehlerFeld(box, key) {
        if (plan.fehlersuche) return;
        const t = key.startsWith('L:') ? null : teil(key);
        const liste = key.startsWith('L:') ? FEHLER.leitung : (t && FEHLER[t.typ]);
        if (!liste) return;
        h('label', { text: 'Versteckter Fehler (Fehlersuche)' }, box);
        const sel = h('select', {}, box);
        h('option', { value: '', text: '– kein Fehler –' }, sel);
        liste.forEach(([v, n]) => h('option', { value: v, text: n }, sel));
        sel.value = fehlerVon(key) || '';
        sel.onchange = () => aendern(() => { plan.fehler = plan.fehler || {}; if (sel.value) plan.fehler[key] = sel.value; else delete plan.fehler[key]; });
    }

    // ------------------------------------------------------------
    // Eine Wahrheit: Fluidplan baut die Pneumatik der 2D-Anlage auf
    // ------------------------------------------------------------
    // Ist der Plan mit der 2D-Anlage verbunden (plan.anlage), entsteht zu jedem
    // Planzylinder ein 2D-Zylinder mit Ventil, Drosseln und Versorgung. Daraus
    // erzeugt VALIS den Auto-Schaltplan wie gewohnt. Signalglieder ohne 2D-Gegenstück
    // bleiben im Plan; der 2D-Zylinder fährt während der Simulation dem Plan nach.
    const ZYL2D = ['zylinder_double', 'zylinder_single', 'gate_pneu'];
    // Drosselöffnung umrechnen: Die 2D-Anlage rechnet die Öffnung linear als Anteil der
    // Kompressorliefermenge (6 % ≈ normale Geschwindigkeit), der Plan als Querschnitt
    // (Leitwert ~ Öffnung²). Umgerechnet so, dass der Zylinder gleich schnell fährt.
    const DR_KAL = window._fpDrKal || 800;
    const drosselNach2D = o => Math.max(1, Math.min(100, Math.round(o * o / DR_KAL)));
    const drosselAus2D = o => Math.max(1, Math.min(100, Math.round(Math.sqrt(Math.max(1, o) * DR_KAL))));
    const fabrik = () => { try { return factoryObjects; } catch (e) { return null; } };
    function nachbarn() {
        const m = {};
        const add = (a, b) => { (m[a] = m[a] || []).push(b); };
        for (const l of plan.leitungen) { const a = l.a.t + ':' + l.a.p, b = l.b.t + ':' + l.b.p; add(a, b); add(b, a); }
        return m;
    }
    // Vom Zylinderanschluss zum Stellglied: durch T-Stücke, Drosseln, Rückschlag-
    // und Schnellentlüftungsventile hindurch. Liefert Ventil, Anschluss und Drosselöffnung.
    // zu/ab: Öffnung der Drossel, die die Zuluft (zum Zylinder) bzw. Abluft (vom Zylinder) drosselt.
    function stellgliedVon(zyl, port) {
        const nb = nachbarn(), gesehen = new Set();
        let offen = null, zu = null, ab = null;
        const min = (a, b) => a == null ? b : Math.min(a, b);
        const stapel = [zyl.id + ':' + port];
        while (stapel.length) {
            const k = stapel.pop();
            if (gesehen.has(k)) continue; gesehen.add(k);
            for (const n of nb[k] || []) {
                if (gesehen.has(n)) continue;
                const [tid, pid] = n.split(':');
                const t = teil(tid); if (!t) continue;
                if (t.typ === 'ventil' && (pid === '2' || pid === '4')) return { ventil: t, port: pid, offen, zu, ab };
                if (t.typ === 'knoten') { gesehen.add(n); for (const w of nb[n] || []) stapel.push(w); continue; }
                if (['drossel', 'drv', 'rueck', 'schnell'].includes(t.typ) && (pid === '1' || pid === '2')) {
                    const w = zahl(t.o.offen, 50);
                    if (t.typ === 'drossel') { zu = min(zu, w); ab = min(ab, w); }
                    // DRV drosselt von 1 nach 2: von der Zylinderseite an 1 betreten = Abluft gedrosselt
                    else if (t.typ === 'drv') { if (pid === '1') ab = min(ab, w); else zu = min(zu, w); }
                    if ((t.typ === 'drossel' || t.typ === 'drv') && offen == null) offen = w;
                    gesehen.add(n);
                    stapel.push(tid + ':' + (pid === '1' ? '2' : '1'));
                }
            }
        }
        return { ventil: null, offen, zu, ab };
    }
    function anlageAbgleichen() {
        const F = fabrik();
        if (!plan.anlage || !F || typeof createFactoryObject !== 'function') return;
        plan.erzeugt = plan.erzeugt || [];
        const benutzt = new Set();
        for (const t of plan.teile) {
            if (t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew') continue;
            const dw = t.typ === 'zyl_dw';
            const K = stellgliedVon(t, 'K'), S = dw ? stellgliedVon(t, 'S') : null;
            const v = (K && K.ventil) || (S && S.ventil) || null;
            // Drosseln: Ausfahren bremst die Zuluft an K oder die Abluft an S, Einfahren umgekehrt
            const mn = (...a) => { const b = a.filter(x => x != null); return b.length ? Math.min(...b) : null; };
            const drExt = mn(K && K.zu, S && S.ab), drRet = dw ? mn(K && K.ab, S && S.zu) : null;
            // Variablen der Spulen: Seite, die den Kolbenraum belüftet = Ausfahren
            let ext = '', ret = '';
            if (v) {
                const linksBeluftetK = K && K.ventil && K.ventil === v ? K.port === '4' || v.o.wege === '3/2' || v.o.wege === '2/2' : !(S && S.port === '4');
                const vl = v.o.links === 'magnet' ? v.o.varL || '' : '', vr = v.o.rechts === 'magnet' ? v.o.varR || '' : '';
                ext = linksBeluftetK ? vl : vr; ret = linksBeluftetK ? vr : vl;
            }
            const wahl = !v ? 'single' : v.o.wege === '5/3' ? 'triple' : (v.o.links !== 'feder' && v.o.rechts !== 'feder') ? 'double' : 'single';
            let o = t.o.anlage ? F.find(q => q.id === t.o.anlage) : null;
            const typ2d = dw ? 'zylinder_double' : 'zylinder_single';
            if (o && o.type !== typ2d && o.type !== 'gate_pneu') { o = null; }
            if (!o) {
                o = createFactoryObject(typ2d, ext, dw ? ret : undefined);
                // über dem Pneumatik-Bereich, nebeneinander (der Bereich entsteht sonst bei 20/600)
                const zone = F.find(q => q.type === 'pneumatic_zone');
                const zx = zone ? zone.x : 20, zy = zone ? zone.y : 600;
                const nr = plan.erzeugt.length;
                o.x = zx + 30 + (nr % 4) * 230; o.y = zy - 120 - Math.floor(nr / 4) * 90;
                t.o.anlage = o.id; plan.erzeugt.push(o.id);
                try { updateObjTransform(o); } catch (e) {}
            }
            benutzt.add(o.id);
            o.pistonD = zahl(t.o.d, 20); o.rodD = zahl(t.o.dStange, dw ? 8 : 6); o.stroke = zahl(t.o.hub, 100);
            o.linkedVarExt = ext || null; o.linkedVarRet = dw ? (ret || null) : null;
            if (!dw) o.linkedVar = ext || null;
            // Ventil passend zum Stellglied (sonst neu aufbauen)
            let ventil = F.find(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id);
            const hat = rolle => !!F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === rolle);
            const passt = ventil && (wahl === 'triple' ? ventil.isTriple : wahl === 'double' ? (ventil.isDouble && !ventil.isTriple) : !ventil.isDouble)
                && hat('ext') === (drExt != null) && hat('ret') === (drRet != null);
            if (ventil && !passt) {
                F.filter(q => (q.type === 'valve_pneu' || q.type === 'throttle') && q.targetCylinderId === o.id).forEach(q => { try { deleteObjRecursive(q); } catch (e) {} });
                o.hasPneumatics = false; ventil = null;
            }
            if (!o.hasPneumatics && typeof window.generatePneumaticSetup === 'function') { try { window.generatePneumaticSetup(o, wahl, { drosseln: { ext: drExt != null, ret: drRet != null } }); } catch (e) { console.warn('Fluidplan → 2D', e); } }
            ventil = F.find(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id);
            if (ventil) { ventil.linkedVarExt = o.linkedVarExt; ventil.linkedVarRet = o.linkedVarRet; }
            const dr = (rolle, wert) => {
                const th = F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === rolle);
                if (!th || wert == null) return;
                th.opening = drosselNach2D(wert);
                const vd = th.el && th.el.querySelector('.f2d-throttle-val'), kn = th.el && th.el.querySelector('.f2d-throttle-knob');
                if (vd) vd.textContent = th.opening + '%';
                if (kn) kn.style.transform = `rotate(${th.opening * 2.7}deg)`;
            };
            dr('ext', drExt);
            dr('ret', drRet);
        }
        // Vom Plan erzeugte 2D-Zylinder, die es im Plan nicht mehr gibt, wieder entfernen
        plan.erzeugt = plan.erzeugt.filter(id => {
            if (benutzt.has(id)) return true;
            const o = F.find(q => q.id === id);
            if (o) { try { deleteObjRecursive(o); } catch (e) {} }
            return false;
        });
        try { if (window._syncCircuitFromFactory) window._syncCircuitFromFactory(); } catch (e) {}
    }
    // Umgekehrt: vorhandene 2D-Pneumatik als Startplan übernehmen
    function ausAnlage() {
        const F = fabrik(); if (!F) return 0;
        const zyl = F.filter(o => (o.type === 'zylinder_double' || o.type === 'zylinder_single') && o.hasPneumatics);
        if (!zyl.length) { status('In der 2D-Anlage gibt es keinen Zylinder mit Pneumatik.'); return 0; }
        if (plan.teile.length && !confirm('Der Fluidplan wird durch die Pneumatik der 2D-Anlage ersetzt. Weiter?')) return 0;
        aendern(() => {
            plan.teile = []; plan.leitungen = []; plan.erzeugt = []; plan.anlage = true;
            const comp = F.find(o => o.type === 'compressor');
            const nid = () => neueId();
            const q = { id: nid(), typ: 'quelle', x: 0, y: 360, rot: 0, bez: '0Z1', o: Object.assign({}, TYP.quelle.optionen, { p: comp && comp.pressure || 6 }) };
            plan.teile.push(q);
            const L = (a, ap, b, bp) => plan.leitungen.push({ id: nid(), a: { t: a, p: ap }, b: { t: b, p: bp } });
            zyl.forEach((o, i) => {
                const dw = o.type === 'zylinder_double', x = 140 + i * 260, nr = i + 1;
                const v = F.find(q2 => q2.type === 'valve_pneu' && q2.targetCylinderId === o.id);
                const zt = { id: nid(), typ: dw ? 'zyl_dw' : 'zyl_ew', x, y: -40, rot: 0, bez: nr + 'A1',
                    o: Object.assign({}, TYP[dw ? 'zyl_dw' : 'zyl_ew'].optionen, { d: o.pistonD || 20, dStange: o.rodD || (dw ? 8 : 6), hub: o.stroke || 100, anlage: o.id }) };
                const wege = !dw ? '3/2' : (v && v.isTriple) ? '5/3' : '5/2';
                const doppelt = v && v.isDouble;
                const vt = { id: nid(), typ: 'ventil', x: x - 20, y: 200, rot: 0, bez: nr + 'V1',
                    o: Object.assign({}, TYP.ventil.optionen, { wege, links: 'magnet', rechts: doppelt ? 'magnet' : 'feder', varL: o.linkedVarExt || o.linkedVar || '', varR: doppelt ? (o.linkedVarRet || '') : '' }) };
                plan.teile.push(zt, vt);
                L(q.id, '1', vt.id, '1');
                const thr = rolle => F.find(q2 => q2.type === 'throttle' && q2.targetCylinderId === o.id && q2.role === rolle);
                // Abluftdrosselung: Drossel der Ausfahrbewegung sitzt in der Stangenseite
                const zuweg = (vp, zp, th, dx) => {
                    if (!th) { L(vt.id, vp, zt.id, zp); return; }
                    const d = { id: nid(), typ: 'drv', x: x + dx, y: 100, rot: 0, bez: nr + 'V' + (plan.teile.length), o: Object.assign({}, TYP.drv.optionen, { offen: drosselAus2D(th.opening || 6) }) };
                    plan.teile.push(d); L(vt.id, vp, d.id, '2'); L(d.id, '1', zt.id, zp);
                };
                if (dw) { zuweg('4', 'K', thr('ret'), 10); zuweg('2', 'S', thr('ext'), 90); }
                else zuweg('2', 'K', thr('ext'), 10);
            });
        });
        einpassen();
        return zyl.length;
    }

    // ------------------------------------------------------------
    // Öffnen / Schließen, Schnittstelle
    // ------------------------------------------------------------
    function oeffnen() {
        fensterBauen();
        fenster.style.display = 'flex';
        offen = true;
        requestAnimationFrame(() => { zeichnen(); if (!fenster._eingepasst) { einpassen(); fenster._eingepasst = true; } });
        knopfZustand();
    }
    function schliessen() {
        if (fenster) fenster.style.display = 'none';
        offen = false;
        knopfZustand();
    }
    function umschalten() { if (offen) schliessen(); else oeffnen(); }

    // Vorerst nur auf Freischaltung sichtbar: einmal ?fluidplan=1 aufrufen (merkt sich der Browser),
    // ?fluidplan=0 blendet den Knopf wieder aus.
    function freigeschaltet() {
        try {
            const q = new URLSearchParams(location.search).get('fluidplan');
            if (q === '1') localStorage.setItem('valisFluidplan', '1');
            else if (q === '0') localStorage.removeItem('valisFluidplan');
            return localStorage.getItem('valisFluidplan') === '1';
        } catch (e) { return false; }
    }
    function knopfSichtbar() {
        const b = document.getElementById('btn-view-fluid');
        if (b) b.style.display = freigeschaltet() ? '' : 'none';
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopfSichtbar); else knopfSichtbar();

    window.Fluidplan = {
        oeffnen, schliessen, umschalten,
        exportieren: planExport,
        importieren: planImport,
        plan: () => kopie(plan),
        // Für Prüfungen und die Brücke
        zustand: () => sim ? {
            zeit: sim.zeit,
            teile: Object.fromEntries(plan.teile.map(t => {
                const z = sim.zust[t.id] || {};
                const r = { typ: t.typ, bez: t.bez };
                if (z.x != null) { r.x = z.x; r.v = z.v; r.anteil = z.x / zylHub(t); }
                if (z.stellung != null) r.stellung = z.stellung;
                if (z.an != null) r.an = z.an;
                const ports = {};
                for (const p of geo(t).ports) ports[p.id] = +pPort(t, p.id).toFixed(3);
                r.p = ports;
                return [t.id, r];
            }))
        } : null,
        druecken: (id, seite, an) => { if (!sim) simInit(); handDruck(id, seite || 'L', an !== false); },
        pruefen: () => { fensterBauen(); return pruefen(); },
        setzen: (typ, x, y, o, bez) => {
            const oo = Object.assign({}, TYP[typ].optionen, o || {});
            const t = { id: neueId(), typ, x: snap(x), y: snap(y), rot: 0, bez: bez != null ? bez : bezFuer(typ, oo), o: oo };
            aendern(() => { plan.teile.push(t); });
            return t.id;
        },
        verbinden: (a, ap, b, bp) => { leitungAnlegen({ t: a, p: ap }, { t: b, p: bp }); },
        aendern: (id, o) => { const t = teil(id); if (t) aendern(() => { Object.assign(t.o, o); }); },
        _schritt: (sek) => { if (!sim) simInit(); const n = Math.round(sek / 0.016); for (let i = 0; i < n; i++) { sim.schreib = {}; simSchritt(0.016); aufzeichnen(); const s = sps(); for (const v in sim.schreib) s[v] = !!sim.schreib[v]; } },
        _neu: () => { sim = null; simInit(); aufzNeu(); },
        abgleichen: anlageAbgleichen,
        _entfernen: (id) => aendern(() => teilEntfernen(id)),
        ausAnlage,
        verbinden2D: (an) => { aendern(() => { plan.anlage = an !== false; }); },
        _diagramm: () => ({ schritte: schritte().map(p => Object.assign({}, p.x)), proben: aufz ? aufz.proben.length : 0 }),
        _aufzNeu: () => aufzNeu(),
        fehlerGefunden,
        fehlerAnzahl,
        befundPruefen,
        verdacht: (key) => verdachtUmschalten(key),
        messen: (lt, x, y) => messKlick(lt, x, y, null),
        messwerte: () => messpunkte.map(m => { const l = plan.leitungen.find(q => q.id === m.l); const n = sim && l ? sim.netzVon[l.a.t + ':' + l.a.p] : null; return n != null ? +druckVon(n).toFixed(3) : null; }),
        beispiele: () => BEISPIELE.map(b => b.name),
        beispielLaden: (i) => { const c = window.confirm; window.confirm = () => true; try { beispielLaden(i); } finally { window.confirm = c; } },
        _leeren: () => { planImport(null); gedrueckt.clear(); },
        typen: () => Object.keys(TYP),
        offen: () => offen
    };

    // Startzustand aus dem Speicher holen (die 2D-Anlage wurde evtl. schon geladen)
    try {
        if (window._fpRoh) planImport(window._fpRoh);
        else {
            const s = JSON.parse(localStorage.getItem('logikFactoryState') || 'null');
            if (s && s.fluidplan) planImport(s.fluidplan);
        }
    } catch (e) {}
    requestAnimationFrame(schleife);
})();
