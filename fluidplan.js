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
    // Drossel: Öffnung % = Anteil am Nenndurchfluss der voll geöffneten Drossel,
    // linear, wie in der 2D-Anlage (dort 100 % = 200 l/min bei 6 bar).
    const G_DROSSEL = window._fpGDr || 8;
    const gDrossel = o => G_DROSSEL * Math.max(0, o) / 100;
    const gDrosselT = (t, o) => istHyd(t) ? G_HV * Math.max(0, o) / 100 : gDrossel(o);
    const G_LEITUNG = 60;      // Leitwert zwischen Knoten (nur intern)
    const V_LEITUNG = window._fpVL || 0.0015;  // Volumen je Leitung (l), kurzer 4er-Schlauch
    // Hydraulik (Christoph, 15.11.2026): dasselbe Netzmodell, aber Öl. p = E · (M/V − 1),
    // E = Ersatz-Kompressionsmodul aus Öl und Schläuchen (bar), M = Ölmenge bei 0 bar (l).
    // Leitwerte in l/(s·√bar): ein offener Ventilweg schafft 8 l/min bei etwa 2 bar.
    const E_OEL = window._fpEOel || 600;
    const P_AN_H = 2;             // ab hier gilt eine Hydraulikleitung als unter Druck (bar)
    const G_HV = 0.05;            // Leitwert offener Ventilweg (Öl)
    const V_LEITUNG_H = 0.03;     // Ölvolumen je Leitung (l), Hydraulikschlauch
    const istHyd = t => !!(t && t.o && t.o.hyd);
    // Hydraulikzylinder: der Plan baut dafür die 2D-Hydraulik (valve_hyd …), sonst Pneumatik
    const hydZylT = t => !!t && (t.typ === 'zyl_dw' || t.typ === 'zyl_ew') && istHyd(t);

    // ------------------------------------------------------------
    // Hilfen
    // ------------------------------------------------------------
    // Das Panel kann in ein abgekoppeltes Fenster wandern: Elemente, Ereignisse
    // und Dialoge immer im Dokument suchen, in dem der Plan gerade steht.
    let bildDok = null;   // gesetzt, solange der Plan als Bild in den Auto-Schaltplan gezeichnet wird
    const D = () => bildDok || (fenster && fenster.ownerDocument) || document;
    const W = () => D().defaultView || window;
    const el = (tag, attrs, parent) => {
        const e = D().createElementNS(NS, tag);
        if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    };
    const h = (tag, attrs, parent) => {
        const e = D().createElement(tag);
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
    // Laufzeitwerte eines Planteils aus der 2D-Anlage (Last, Anschlag, Förderstrom): nicht gespeichert
    const LW = new WeakMap(), lw = t => LW.get(t) || {};
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
        '5/3': { oben: { '4': 10, '2': 30 }, unten: { '5': 6, '1': 20, '3': 34 } },
        '4/3': { oben: { '4': 10, '2': 30 }, unten: { '1': 10, '3': 30 } }
    };
    // Hydraulik benennt die Anschlüsse mit Buchstaben (DIN ISO 1219): P Pumpe, T Tank, A und B Arbeitsanschlüsse
    const HYD_NR = { '1': 'P', '3': 'T', '4': 'A', '2': 'B' };
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
        if (w === '4/3') {
            // Mittelstellungen der Hydraulik: gesperrt, Umlauf (P→T, Pumpe drucklos), Schwimm (A, B → T), offen (alles verbunden)
            const mitte = o.mitte === 'umlauf' ? { w: [['1', '3']], zu: ['2', '4'] }
                : o.mitte === 'schwimm' ? { w: [['4', '3'], ['2', '3']], zu: ['1'] }
                : o.mitte === 'offen' ? { w: [['1', '3'], ['4', '3'], ['2', '3']], zu: [] }
                : { w: [], zu: ['1', '2', '3', '4'] };
            return [{ w: [['1', '4'], ['2', '3']], zu: [] }, mitte, { w: [['1', '2'], ['4', '3']], zu: [] }];
        }
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
            el('line', { x1: x + s * 6, y1: cy, x2: x2, y2: cy - 10, stroke: 'currentColor', 'stroke-width': lw, class: 'fp-griff', 'data-dreh': `${x + s * 6},${cy},${-s * 30}` }, g);
            el('circle', { cx: x2, cy: cy - 10, r: 2.5, fill: 'currentColor', class: 'fp-griff', 'data-dreh': `${x + s * 6},${cy},${-s * 30}` }, g);
            // Raste
            el('path', { d: `M${x + s * 3},${cy + 4} l${s * 2},4 l${s * 2},-4`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }, g);
        } else if (b === 'pedal') {
            el('line', { x1: x, y1: cy, x2: x + s * 8, y2: cy, stroke: 'currentColor', 'stroke-width': lw }, g);
            el('line', { x1: x + s * 8, y1: cy + 8, x2: x2, y2: cy - 8, stroke: 'currentColor', 'stroke-width': 2.2, class: 'fp-griff', 'data-dreh': `${x + s * 8},${cy + 8},${-s * 20}` }, g);
        } else if (b === 'rolle' || b === 'rolle_leer') {
            el('line', { x1: x, y1: cy, x2: x + s * 10, y2: cy, stroke: 'currentColor', 'stroke-width': lw }, g);
            el('circle', { cx: x + s * 14, cy: cy, r: 4, fill: aktiv ? 'var(--fp-aktiv)' : 'none', stroke: 'currentColor', 'stroke-width': lw, class: 'fp-rolle' }, g);
            if (b === 'rolle_leer') el('path', { d: `M${x + s * 7},${cy - 6} l${s * 3},6 l${-s * 3},6`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
        }
        return w;
    }

    // Betätiger in Bewegung zeigen (alle Darstellungen): Taster, Pilz und Rolle werden zum
    // Ventil hin eingedrückt, Hebel und Pedal kippen; farbe = Farbe der betätigten Seite.
    function betZeigen(g, b, s, an, farbe) {
        if (!g || b === 'magnet' || b === 'feder') return;
        const k = an ? '1' : '0'; if (g.getAttribute('data-an') === k) return;
        g.setAttribute('data-an', k);
        const kippt = b === 'hebel' || b === 'pedal';
        g.style.transition = 'transform .12s ease';
        g.style.transform = an && !kippt ? `translate(${-s * 3}px,0)` : '';
        g.style.color = an ? farbe : '';
        g.querySelectorAll('.fp-griff[data-dreh]').forEach(e => {
            const [px, py, w] = e.getAttribute('data-dreh').split(',');
            if (an) e.setAttribute('transform', `rotate(${w} ${px} ${py})`); else e.removeAttribute('transform');
        });
        g.querySelectorAll('.fp-rolle').forEach(e => e.setAttribute('fill', an ? farbe : 'none'));
    }

    // Katalog: je Typ Name, Grundoptionen, Geometrie (Anschlüsse), Zeichnung
    const TYP = {};

    // ---------- Ventil (Wegeventil) ----------
    TYP.ventil = {
        name: 'Wegeventil', buchstabe: 'V',
        optionen: { wege: '3/2', ruhe: 'zu', mitte: 'gesperrt', links: 'taster', rechts: 'feder', varL: '', varR: '', zyl: '', pos: 'hinten', richt: 'aus', zylR: '', posR: 'vorne', richtR: 'ein', schaltweg: 3 },
        geometrie(t) {
            const o = t.o, st = ventilStellungen(o), n = st.length, heim = n === 3 ? 1 : 1;
            const lage = VLAGE[o.wege] || VLAGE['3/2'];
            const ports = [];
            for (const id in lage.oben) ports.push({ id, x: heim * KASTEN + lage.oben[id], y: -10, dir: [0, -1], art: (id === '2' || id === '4') ? 'a' : 'v' });
            for (const id in lage.unten) ports.push({ id, x: heim * KASTEN + lage.unten[id], y: KASTEN + 10, dir: [0, 1], art: id === '1' ? 'v' : 'r' });
            if (o.hyd) ports.forEach(p => { if (HYD_NR[p.id]) p.nr = HYD_NR[p.id]; });
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
                const pos = id => lage.oben[id] != null ? [x0 + lage.oben[id], 0] : [x0 + lage.unten[id], KASTEN];
                for (const [a, b] of st.w) {
                    const [x1, y1] = pos(a), [x2, y2] = pos(b);
                    if (y1 === y2) {
                        // Weg auf derselben Seite (Umlauf P→T): Bogen ohne Pfeil
                        const dy = y1 < 20 ? 12 : -12;
                        el('path', { d: `M${x1},${y1} V${y1 + dy} H${x2} V${y2}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                        continue;
                    }
                    const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
                    el('line', { x1, y1, x2: x2 - ux * 5, y2: y2 - uy * 5, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                    el('path', { d: `M${x2},${y2} L${x2 - ux * 7 - uy * 3.5},${y2 - uy * 7 + ux * 3.5} L${x2 - ux * 7 + uy * 3.5},${y2 - uy * 7 - ux * 3.5} Z`, fill: 'currentColor' }, block);
                }
                for (const z of st.zu) {
                    const [x, y] = pos(z), dy = y < 20 ? 1 : -1;
                    el('line', { x1: x, y1: y, x2: x, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
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
            return { ports: [{ id: 'K', x: 10, y: ZYL_H + 10, dir: [0, 1], art: 'a', ohneNr: true }, { id: 'S', x: ZYL_L - 10, y: ZYL_H + 10, dir: [0, 1], art: 'a', ohneNr: true }],
                box: [-2, -16, ZYL_L * 2 - 10, ZYL_H + 12] };
        },
        zeichne(t, g, geo) { zylinderZeichnen(t, g, true); }
    };
    TYP.zyl_ew = {
        name: 'Zylinder, einfachwirkend', buchstabe: 'A', antrieb: true,
        optionen: { d: 20, dStange: 8, hub: 50, last: 0, start: 'hinten', sensH: '', sensV: '', anlage: '' },
        geometrie() {
            return { ports: [{ id: 'K', x: 10, y: ZYL_H + 10, dir: [0, 1], art: 'a', ohneNr: true }], box: [-2, -16, ZYL_L * 2 - 10, ZYL_H + 12] };
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
            el('line', { x1: -10, y1: 8, x2: -10, y2: 30, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: 10, y1: 8, x2: 10, y2: 30, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
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
        optionen: { p: 6, kurz: false },
        geometrie() { return { ports: [{ id: '1', x: -40, y: 0, dir: [-1, 0], art: 'v' }, { id: '2', x: 40, y: 0, dir: [1, 0], art: 'a' }], box: [-42, -26, 42, 18] }; },
        zeichne(t, g) {
            if (t.o.kurz) {
                // Kurzform (vereinfachtes Zeichen der Aufbereitungseinheit, DIN ISO 1219-1): Rahmen,
                // Filter mit Ablass (gestrichelt, Pfeil nach unten), Manometer, Druckregler (Strich von oben)
                const bw = 46, bh = 26, bx = -bw / 2, by = -bh / 2;
                el('rect', { x: bx, y: by, width: bw, height: bh, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
                el('line', { x1: -40, y1: 0, x2: bx, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
                el('line', { x1: bx + bw, y1: 0, x2: 40, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
                const fx = bx + 6, mx = 0, rx = bx + bw - 6;
                el('line', { x1: fx, y1: by, x2: fx, y2: by + bh + 7, stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '3 2' }, g);
                el('path', { d: `M${fx - 2.5},${by + bh + 6} L${fx},${by + bh + 10} L${fx + 2.5},${by + bh + 6} Z`, fill: 'currentColor' }, g);
                el('circle', { cx: mx, cy: 0, r: 7.5, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.1 }, g);
                el('line', { x1: mx + 4, y1: 4, x2: mx - 3, y2: -3, stroke: 'currentColor', 'stroke-width': 1.1 }, g);
                el('path', { d: `M${mx - 4.5},${-4.5} L${mx - 0.6},${-3.4} L${mx - 3.4},${-0.6} Z`, fill: 'currentColor' }, g);
                el('line', { x1: rx, y1: by, x2: rx, y2: by + 9, stroke: 'currentColor', 'stroke-width': 1.3 }, g);
                return;
            }
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
        geometrie() { return { ports: [{ id: '1', x: 0, y: -14, dir: [0, -1], art: 'r', ohneNr: true }], box: [-10, -16, 10, 22] }; },
        zeichne(t, g) {
            // DIN ISO 1219-1: Rechteck mit Prallwänden, Austritt als offenes Dreieck (hier senkrecht unter dem Anschluss)
            el('line', { x1: 0, y1: -4, x2: 0, y2: -14, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('rect', { x: -5, y: -4, width: 10, height: 20, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('path', { d: 'M-5,1 H0 M-5,11 H0 M5,6 H0', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1 }, g);
            el('path', { d: 'M-3.5,16 L0,20.5 L3.5,16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            if (t.o.drossel) el('line', { x1: -9, y1: 14, x2: 9, y2: -2, stroke: 'currentColor', 'stroke-width': 1, 'marker-end': 'url(#fp-pfeil)' }, g);
        }
    };
    TYP.stopfen = {
        name: 'Blindstopfen', buchstabe: '', ohneBez: true,
        optionen: {},
        geometrie() { return { ports: [{ id: '1', x: 0, y: -12, dir: [0, -1], art: 'a', ohneNr: true }], box: [-9, -14, 9, 4] }; },
        zeichne(t, g) {
            // verschlossener Anschluss (DIN ISO 1219-1): Leitung endet an einem Querstrich
            el('line', { x1: 0, y1: 0, x2: 0, y2: -12, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('line', { x1: -7, y1: 0, x2: 7, y2: 0, stroke: 'currentColor', 'stroke-width': 2 }, g);
        }
    };
    // Abschluss eines freien Anschlusses: offen, Schalldämpfer, Drosselschalldämpfer, Blindstopfen.
    // Im Plan sind das echte Teile an einer Leitung; die 2D-Anlage führt sie als ventil.abschluss.
    const ABSCHLUSS = [['offen', 'offen (bläst frei ab)'], ['daempfer', 'Schalldämpfer'], ['drossel', 'Drosselschalldämpfer'], ['stopfen', 'Blindstopfen (verschlossen)']];
    function abschlussBauen(vt, pid, a, nid) {
        if (!a || !a.art || a.art === 'offen') return null;
        const p = TYP[vt.typ].geometrie(vt).ports.find(q => q.id === pid); if (!p) return null;
        const [x, y] = trafo(vt, p.x, p.y), d = trafoDir(vt, p.dir) || [0, 1];
        const typ = a.art === 'stopfen' ? 'stopfen' : 'daempfer';
        const rot = d[1] > 0 ? 0 : d[1] < 0 ? 180 : d[0] > 0 ? 270 : 90;
        const abst = typ === 'stopfen' ? 40 : 46;   // unter der Beschriftung der Spulen
        const t = { id: nid(), typ, x: x + d[0] * abst, y: y + d[1] * abst, rot, bez: '',
            o: typ === 'daempfer' ? Object.assign({}, TYP.daempfer.optionen, { drossel: a.art === 'drossel', offen: a.art === 'drossel' ? Math.max(1, Math.min(100, zahl(a.offen, 50))) : 100 }) : {} };
        return { t, l: { id: nid(), a: { t: vt.id, p: pid }, b: { t: t.id, p: '1' } } };
    }
    // Was hängt an diesem Anschluss? null = eine richtige Leitung (kein Abschluss)
    function abschlussVon(vt, pid) {
        const ls = plan.leitungen.filter(l => (l.a.t === vt.id && l.a.p === pid) || (l.b.t === vt.id && l.b.p === pid));
        if (!ls.length) return { art: 'offen' };
        if (ls.length > 1) return null;
        const l = ls[0], ot = l.a.t === vt.id && l.a.p === pid ? l.b.t : l.a.t;
        const t = plan.teile.find(q => q.id === ot); if (!t) return null;
        if (t.typ === 'stopfen') return { art: 'stopfen', teil: t.id, leitung: l.id };
        if (t.typ === 'daempfer') return t.o.drossel ? { art: 'drossel', offen: zahl(t.o.offen, 100), teil: t.id, leitung: l.id } : { art: 'daempfer', teil: t.id, leitung: l.id };
        return null;
    }
    function abschlussSetzen(vt, pid, a) {
        const alt = abschlussVon(vt, pid); if (!alt) return false;
        if (alt.art === (a && a.art || 'offen') && (alt.art !== 'drossel' || alt.offen === zahl(a.offen, 50))) return false;
        if (alt.teil) console.log("ABSCHLUSS-WEG " + new Error().stack.split("\n").slice(1,5).join(" / "));
        if (alt.teil) { plan.teile = plan.teile.filter(q => q.id !== alt.teil); plan.leitungen = plan.leitungen.filter(l => l.id !== alt.leitung); }
        const n = abschlussBauen(vt, pid, a, neueId);
        if (n) { plan.teile.push(n.t); plan.leitungen.push(n.l); }
        return true;
    }
    // Abluftanschluss der 2D-Anlage → Anschluss im Plan. Die 2D-Anlage schaltet beim Ausfahren
    // 1→2 und entlüftet 2 über 3; im Plan (ISO 5599) liegt der Kolbenraum an 4 mit Abluft 5.
    const planAbluft = (vt, p2d) => /^5/.test(vt.o.wege || '') ? ({ '3': '5', '5': '3' })[p2d] : p2d;
    // Abschlüsse der Abluftanschlüsse eines Planventils in der Form der 2D-Anlage
    function abschluss2D(vt, ports) {
        const ab = {};
        for (const pid of ports) { const a = abschlussVon(vt, planAbluft(vt, pid)); if (a && a.art !== 'offen') ab[pid] = a.art === 'drossel' ? { art: 'drossel', offen: a.offen } : { art: a.art }; }
        return Object.keys(ab).length ? ab : null;
    }
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
        zeichne(t, g) { el('line', { x1: 0, y1: 8, x2: 0, y2: 24, stroke: 'currentColor', 'stroke-width': 1.6 }, g); el('line', { x1: 0, y1: -5, x2: 0, y2: -24, stroke: 'currentColor', 'stroke-width': 1.6 }, g); rueckZeichnen(g, 0, 0, -1); }
    };
    function rueckZeichnen(g, x, y, s) {
        // Kugel im kegeligen Sitz (DIN ISO 1219-1). s = +1: Sitz oben, frei von oben nach unten;
        // s = -1: Sitz unten, frei von unten nach oben. Strömt es frei, hebt die Kugel vom Sitz ab
        // (Klasse fp-kugel, wird in der Simulation verschoben).
        el('path', { d: `M${x - 7},${y - s} L${x},${y - s * 8} L${x + 7},${y - s}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
        el('circle', { class: 'fp-kugel', 'data-frei': s, cx: x, cy: y, r: 5, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
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
        optionen: { offen: 10 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 24, dir: [0, 1], art: 'a' }, { id: '2', x: 0, y: -24, dir: [0, -1], art: 'a' }], box: [-14, -26, 14, 26] }; },
        zeichne(t, g) {
            el('line', { x1: 0, y1: 24, x2: 0, y2: -24, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M-6,-10 Q-1,0 -6,10 M6,-10 Q1,0 6,10', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('line', { x1: -10, y1: 10, x2: 10, y2: -10, stroke: 'currentColor', 'stroke-width': 1.1, 'marker-end': 'url(#fp-pfeil)' }, g);
        }
    };
    TYP.drv = {
        name: 'Drosselrückschlagventil', buchstabe: 'V',
        optionen: { offen: 10 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 34, dir: [0, 1], art: 'a' }, { id: '2', x: 0, y: -34, dir: [0, -1], art: 'a' }], box: [-16, -36, 34, 36] }; },
        zeichne(t, g) {
            el('rect', { x: -12, y: -22, width: 42, height: 44, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '8 3 2 3' }, g);
            el('line', { x1: 0, y1: 34, x2: 0, y2: -34, stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('path', { d: 'M-6,-10 Q-1,0 -6,10 M6,-10 Q1,0 6,10', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('line', { x1: -9, y1: 10, x2: 9, y2: -10, stroke: 'currentColor', 'stroke-width': 1.1, 'marker-end': 'url(#fp-pfeil)' }, g);
            el('path', { d: 'M0,16 H20 V6 M20,-7 V-16 H0', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            rueckZeichnen(g, 20, 1, 1);
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
                const pos = id => lage.oben[id] != null ? [x0 + lage.oben[id], 0] : [x0 + lage.unten[id], KASTEN];
                for (const [a, b] of st.w) {
                    const [x1, y1] = pos(a), [x2, y2] = pos(b);
                    const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
                    el('line', { x1, y1, x2: x2 - ux * 5, y2: y2 - uy * 5, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                    el('path', { d: `M${x2},${y2} L${x2 - ux * 7 - uy * 3.5},${y2 - uy * 7 + ux * 3.5} L${x2 - ux * 7 + uy * 3.5},${y2 - uy * 7 - ux * 3.5} Z`, fill: 'currentColor' }, block);
                }
                for (const z of st.zu) {
                    const [x, y] = pos(z), dy = y < 20 ? 1 : -1;
                    el('line', { x1: x, y1: y, x2: x, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
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
            const pos = id => lage.oben[id] != null ? [x0 + lage.oben[id], 0] : [x0 + lage.unten[id], KASTEN];
            for (const [a, b] of st.w) {
                const [x1, y1] = pos(a), [x2, y2] = pos(b);
                const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
                el('line', { x1, y1, x2: x2 - ux * 5, y2: y2 - uy * 5, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
                el('path', { d: `M${x2},${y2} L${x2 - ux * 7 - uy * 3.5},${y2 - uy * 7 + ux * 3.5} L${x2 - ux * 7 + uy * 3.5},${y2 - uy * 7 - ux * 3.5} Z`, fill: 'currentColor' }, block);
            }
            for (const z of st.zu) {
                const [x, y] = pos(z), dy = y < 20 ? 1 : -1;
                el('line', { x1: x, y1: y, x2: x, y2: y + dy * 7, stroke: 'currentColor', 'stroke-width': 1.4 }, block);
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


    // ---------- Hydraulik (DIN ISO 1219-1) ----------
    const L16 = (g, x1, y1, x2, y2, w) => el('line', { x1, y1, x2, y2, stroke: 'currentColor', 'stroke-width': w || 1.6 }, g);
    // Tank: oben offener Behälter, die Leitung taucht ein
    function tankZeichnen(g, x, y, b) {
        el('path', { d: `M${x - b / 2},${y - 6} V${y + 4} H${x + b / 2} V${y - 6}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, g);
    }
    function federVerstellbar(g, x, y, s) {
        el('polyline', { points: `${x},${y} ${x + s * 3},${y - 5} ${x + s * 6},${y + 5} ${x + s * 9},${y - 5} ${x + s * 12},${y}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
        L16(g, x + s * 1, y + 8, x + s * 11, y - 8, 1);
    }
    TYP.aggregat = {
        name: 'Hydraulikaggregat', buchstabe: 'Z', kette: 0,
        optionen: { hyd: true, q: 8, p: 60 },
        geometrie() { return { ports: [{ id: 'P', x: -10, y: -30, dir: [0, -1], art: 'v' }, { id: 'T', x: 20, y: -30, dir: [0, -1], art: 'r' }], box: [-48, -32, 36, 52] }; },
        zeichne(t, g) {
            el('rect', { x: -46, y: -18, width: 80, height: 68, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '8 3 2 3' }, g);
            // Motor, Welle, Pumpe (Dreieck zeigt nach außen: fördert)
            el('circle', { cx: -34, cy: 10, r: 8, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('text', { x: -34, y: 13.5, 'text-anchor': 'middle', 'font-size': 10, fill: 'currentColor' }, g).textContent = 'M';
            L16(g, -26, 8.5, -20, 8.5, 1.1); L16(g, -26, 11.5, -20, 11.5, 1.1);
            el('circle', { class: 'fp-pumpe', cx: -10, cy: 10, r: 10, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.5 }, g);
            el('path', { d: 'M-10,0 L-14.5,7 L-5.5,7 Z', fill: 'currentColor' }, g);
            L16(g, -10, 0, -10, -30);
            L16(g, -10, 20, -10, 40, 1.4);            // Saugleitung
            // eingebautes Druckbegrenzungsventil P → T
            L16(g, -10, -8, 8, -8, 1.2);
            el('rect', { x: 2, y: -2, width: 12, height: 22, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.2 }, g);
            L16(g, 8, -8, 8, -2, 1.2);
            L16(g, 10, 16, 10, 2, 1.1); el('path', { d: 'M10,1 L8,5 L12,5 Z', fill: 'currentColor' }, g);
            L16(g, 8, 20, 8, 40, 1.2);
            L16(g, 20, -30, 20, 40);                  // Rücklauf
            tankZeichnen(g, 4, 42, 50);
        }
    };
    TYP.tank = {
        name: 'Tank', buchstabe: 'Z', ohneBez: true,
        optionen: { hyd: true },
        geometrie() { return { ports: [{ id: '1', x: 0, y: -14, dir: [0, -1], art: 'r', ohneNr: true }], box: [-12, -16, 12, 8] }; },
        zeichne(t, g) { L16(g, 0, -14, 0, 2); tankZeichnen(g, 0, 2, 20); }
    };
    TYP.dbv = {
        name: 'Druckbegrenzungsventil', buchstabe: 'V',
        optionen: { hyd: true, p: 60 },
        geometrie() { return { ports: [{ id: 'P', x: 0, y: -30, dir: [0, -1], art: 'v' }, { id: 'T', x: 0, y: 30, dir: [0, 1], art: 'r' }], box: [-20, -32, 26, 32] }; },
        zeichne(t, g) {
            L16(g, 0, -30, 0, -18); L16(g, 0, 18, 0, 30);
            el('rect', { x: -10, y: -18, width: 20, height: 36, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            // Pfeil gegen die Anschlusslinie versetzt: in Ruhe geschlossen
            const k = el('g', { class: 'fp-dbv-pfeil' }, g);
            L16(k, 4, -14, 4, 10, 1.3); el('path', { d: 'M4,14 L1,7 L7,7 Z', fill: 'currentColor' }, k);
            // Steuerleitung vom Eingang auf den Kolben
            el('path', { d: 'M0,-24 H-16 V-12 H-10', fill: 'none', stroke: 'currentColor', 'stroke-width': 1, 'stroke-dasharray': '3 2' }, g);
            federVerstellbar(g, 10, 6, 1);
        }
    };
    TYP.stromregel = {
        name: 'Stromregelventil', buchstabe: 'V',
        optionen: { hyd: true, q: 4 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 30, dir: [0, 1], art: 'a' }, { id: '2', x: 0, y: -30, dir: [0, -1], art: 'a' }], box: [-18, -32, 18, 32] }; },
        zeichne(t, g) {
            L16(g, 0, 30, 0, -30);
            el('rect', { x: -14, y: -18, width: 28, height: 36, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            el('path', { d: 'M-5,-9 Q-1,0 -5,9 M5,-9 Q1,0 5,9', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }, g);
            L16(g, -9, 9, 9, -9, 1.1); el('path', { d: 'M10,-10 L5,-8 L8,-5 Z', fill: 'currentColor' }, g);
            // Druckwaage: Pfeil in Strömungsrichtung (hält den Durchfluss trotz Lastdruck konstant)
            L16(g, -10, 12, -10, -8, 1); el('path', { d: 'M-10,-12 L-12,-7 L-8,-7 Z', fill: 'currentColor' }, g);
        }
    };
    TYP.speicher = {
        name: 'Hydrospeicher', buchstabe: 'Z',
        optionen: { hyd: true, V0: 0.7, p0: 30 },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 30, dir: [0, 1], art: 'a', ohneNr: true }], box: [-14, -22, 14, 32] }; },
        zeichne(t, g) {
            L16(g, 0, 16, 0, 30);
            el('rect', { x: -11, y: -20, width: 22, height: 36, rx: 11, fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.6 }, g);
            el('rect', { class: 'fp-oelstand', x: -10, y: 15, width: 20, height: 0, fill: 'var(--fp-druck)', opacity: 0.35 }, g);
            L16(g, -11, -2, 11, -2, 1.3);              // Trennung Gas / Öl (Blase)
            el('path', { d: 'M0,-15 L-4,-8 L4,-8 Z', fill: 'currentColor' }, g);   // Gasseite
        }
    };
    TYP.entsperr = {
        name: 'Rückschlagventil, entsperrbar', buchstabe: 'V',
        optionen: { hyd: true },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 30, dir: [0, 1], art: 'a' }, { id: '2', x: 0, y: -30, dir: [0, -1], art: 'a' }, { id: 'X', x: -30, y: 10, dir: [-1, 0], art: 's' }], box: [-32, -32, 16, 32] }; },
        zeichne(t, g) {
            el('rect', { x: -14, y: -18, width: 28, height: 36, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '8 3 2 3' }, g);
            L16(g, 0, 8, 0, 30); L16(g, 0, -5, 0, -30);
            rueckZeichnen(g, 0, 0, -1);
            el('path', { d: 'M-30,10 H-8 L-4,4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-dasharray': '4 3' }, g);
        }
    };
    TYP.filter = {
        name: 'Filter', buchstabe: 'V',
        optionen: { hyd: true },
        geometrie() { return { ports: [{ id: '1', x: 0, y: 24, dir: [0, 1], art: 'a', ohneNr: true }, { id: '2', x: 0, y: -24, dir: [0, -1], art: 'a', ohneNr: true }], box: [-12, -26, 12, 26] }; },
        zeichne(t, g) {
            L16(g, 0, 24, 0, 11); L16(g, 0, -11, 0, -24);
            el('path', { d: 'M0,-11 L11,0 L0,11 L-11,0 Z', fill: 'var(--fp-papier)', stroke: 'currentColor', 'stroke-width': 1.4 }, g);
            L16(g, -11, 0, 11, 0, 1).setAttribute('stroke-dasharray', '2 1.5');
        }
    };

    // ------------------------------------------------------------
    // Palette (Vorlagen)
    // ------------------------------------------------------------
    const PALETTE = [
        { kat: 'Versorgung', teile: [
            { name: 'Druckluftquelle', typ: 'quelle' },
            { name: 'Wartungseinheit', typ: 'wartung' },
            { name: 'Wartungseinheit (Kurzform)', typ: 'wartung', o: { kurz: true } },
            { name: 'Druckregelventil', typ: 'druckregel' },
            { name: 'Manometer', typ: 'manometer' },
            { name: 'Schalldämpfer', typ: 'daempfer' },
            { name: 'Blindstopfen', typ: 'stopfen' },
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
    // Hydraulik-Palette: dieselben Teile mit o.hyd (Öl), dazu Aggregat, Tank, Druck- und Stromventile
    const HY = o => Object.assign({ hyd: true }, o || {});
    const PALETTE_H = [
        { kat: 'Versorgung', teile: [
            { name: 'Hydraulikaggregat', typ: 'aggregat' },
            { name: 'Tank', typ: 'tank' },
            { name: 'Druckbegrenzungsventil', typ: 'dbv' },
            { name: 'Hydrospeicher', typ: 'speicher' },
            { name: 'Filter', typ: 'filter' },
            { name: 'Manometer (bis 160 bar)', typ: 'manometer', o: HY() },
            { name: 'Verbindung (T-Stück)', typ: 'knoten' }
        ] },
        { kat: 'Antriebe', teile: [
            { name: 'Zylinder doppeltwirkend', typ: 'zyl_dw', o: HY({ d: 40, dStange: 20, hub: 200, lastArt: 'gewicht' }) },
            { name: 'Zylinder einfachwirkend', typ: 'zyl_ew', o: HY({ d: 40, dStange: 30, hub: 150, lastArt: 'gewicht' }) }
        ] },
        { kat: 'Wegeventile', teile: [
            { name: '4/3 Hebel, Mitte gesperrt', typ: 'ventil', o: HY({ wege: '4/3', links: 'hebel', rechts: 'hebel', mitte: 'gesperrt' }) },
            { name: '4/3 Magnet, Umlauf', typ: 'ventil', o: HY({ wege: '4/3', links: 'magnet', rechts: 'magnet', mitte: 'umlauf' }) },
            { name: '4/3 Magnet, Mitte gesperrt', typ: 'ventil', o: HY({ wege: '4/3', links: 'magnet', rechts: 'magnet', mitte: 'gesperrt' }) },
            { name: '4/3 Magnet, Schwimmstellung', typ: 'ventil', o: HY({ wege: '4/3', links: 'magnet', rechts: 'magnet', mitte: 'schwimm' }) },
            { name: '4/2 Magnet, Feder', typ: 'ventil', o: HY({ wege: '4/2', links: 'magnet', rechts: 'feder' }) },
            { name: '4/2 Hebel (rastend)', typ: 'ventil', o: HY({ wege: '4/2', links: 'hebel', rechts: 'feder' }) }
        ] },
        { kat: 'Sperr-, Strom- und Druckventile', teile: [
            { name: 'Rückschlagventil', typ: 'rueck', o: HY() },
            { name: 'Rückschlagventil, entsperrbar', typ: 'entsperr' },
            { name: 'Drosselventil', typ: 'drossel', o: HY({ offen: 30 }) },
            { name: 'Drosselrückschlagventil', typ: 'drv', o: HY({ offen: 30 }) },
            { name: 'Stromregelventil', typ: 'stromregel' },
            { name: 'Druckschalter (elektrisch)', typ: 'dschalter', o: HY({ p: 40 }) }
        ] }
    ];
    let palMedium = 'pneu';

    // ------------------------------------------------------------
    // Zustand
    // ------------------------------------------------------------
    let plan = { v: 2, teile: [], leitungen: [] };
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
    let bild = null;                  // Bildmodus (Auto-Schaltplan): { spule(var) → Kennzeichen, map: teilId → 2D-Id }

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
    // Schalldämpfer und Blindstopfen sitzen ohne Leitung direkt am Anschluss (Christoph,
    // 14.11.2026). Im Plan bleibt es eine Leitung (für Rechenkern und 2D-Abgleich),
    // nur liegt der Anschluss des Gastes genau auf dem des Wirts und wird nicht gezeichnet.
    const ANDOCK = { daempfer: 1, stopfen: 1 };
    function andockVon(l) {
        const ta = teil(l.a.t), tb = teil(l.b.t); if (!ta || !tb) return null;
        const frei = t => !ANDOCK[t.typ] && t.typ !== 'knoten';
        if (ANDOCK[ta.typ] && frei(tb)) return { gast: ta, wirt: tb, wp: l.b.p };
        if (ANDOCK[tb.typ] && frei(ta)) return { gast: tb, wirt: ta, wp: l.a.p };
        return null;
    }
    // Lage der Gäste aus ihrem Wirt (vor dem Zeichnen). ohne: Gast-Ids, die gerade gezogen werden
    function andocken(ohne) {
        for (const l of plan.leitungen) {
            const a = andockVon(l); if (!a) continue;
            if (ohne && ohne[a.gast.id] && !ohne[a.wirt.id]) continue;
            if (plan.leitungen.filter(q => q.a.t === a.gast.id || q.b.t === a.gast.id).length > 1) continue;
            const W2 = portLage(a.wirt, a.wp); if (!W2 || !W2.dir) continue;
            const d = W2.dir, g = a.gast;
            g.sp = false;
            g.rot = d[1] > 0 ? 0 : d[1] < 0 ? 180 : d[0] > 0 ? 270 : 90;
            const p = TYP[g.typ].geometrie(g).ports[0];
            const [ox, oy] = trafo({ x: 0, y: 0, rot: g.rot }, p.x, p.y);
            g.x = W2.x - ox; g.y = W2.y - oy;
        }
    }
    const angedockt = l => { const a = andockVon(l); return !!a && plan.leitungen.filter(q => q.a.t === a.gast.id || q.b.t === a.gast.id).length === 1; };
    // Gast nach dem Ablegen: an einem freien Anschluss in der Nähe andocken, sonst lösen
    function andockAblegen(g) {
        if (!g || !ANDOCK[g.typ]) return;
        const pl = portLage(g, '1'); if (!pl) return;
        const meine = plan.leitungen.filter(q => q.a.t === g.id || q.b.t === g.id);
        let best = null, bd = 14;
        for (const t of plan.teile) {
            if (t.id === g.id || ANDOCK[t.typ] || t.typ === 'knoten') continue;
            for (const p of geo(t).ports) {
                const belegt = plan.leitungen.some(q => ((q.a.t === t.id && q.a.p === p.id) || (q.b.t === t.id && q.b.p === p.id)) && q.a.t !== g.id && q.b.t !== g.id);
                if (belegt || !p.dir) continue;
                const [x, y] = trafo(t, p.x, p.y), d = Math.hypot(x - pl.x, y - pl.y);
                if (d < bd) { bd = d; best = { t: t.id, p: p.id }; }
            }
        }
        if (best) {
            plan.leitungen = plan.leitungen.filter(q => !meine.includes(q));
            plan.leitungen.push({ id: neueId(), a: { t: best.t, p: best.p }, b: { t: g.id, p: '1' } });
        } else if (meine.length === 1 && angedockt(meine[0])) {
            // weggezogen: Gast hängt frei, ohne Leitung
            plan.leitungen = plan.leitungen.filter(q => q !== meine[0]);
        }
    }

    // ------------------------------------------------------------
    // Kennzeichen (DIN EN 81346-2, wie im Auto-Schaltplan): -MM1, -QM1, -RN1 …
    // ------------------------------------------------------------
    // Kennbuchstaben Pneumatik nach Tabellenbuch Metall, Kennzeichnung im Schaltplan (DIN EN 81346-2)
    const KENN = { zyl_dw: 'MM', zyl_ew: 'MM', schwenk: 'MM', quelle: 'GQA', wartung: 'GQ', druckregel: 'QN', manometer: 'PG',
        aggregat: 'GPA', tank: 'CLA', dbv: 'QNA', stromregel: 'RNA', speicher: 'CMA', entsperr: 'RMA', filter: 'HQ',
        rueck: 'RMB', wechsel: 'KH', zweidruck: 'KH', zeit: 'KH', folge: 'KH', schnell: 'QM', drossel: 'RNB', drv: 'RN', dschalter: 'BP' };
    // Hydraulik nach Tabellenbuch Metall, Hydraulikzylinder und hydraulische Grundschaltungen:
    // -MMA1 Zylinder, -QMA1 Wegeventil, -RNA1 Stromregelventil, -RMA1 Rückschlagventil (entsperrbar),
    // -QNA1 Druckbegrenzungsventil, -GPA1 Pumpe/Aggregat, -CLA1 Tank, -CMA1 Speicher, -BPB1 Druckschalter
    const KENN_H = { zyl_dw: 'MMA', zyl_ew: 'MMA', ventil: 'QMA', aggregat: 'GPA', tank: 'CLA', dbv: 'QNA', stromregel: 'RNA', drossel: 'RNA', drv: 'RNA',
        speicher: 'CMA', entsperr: 'RMA', rueck: 'RMA', dschalter: 'BPB', filter: 'HQ', manometer: 'PG' };
    function kennCode(typ, o) {
        if (o && o.hyd && KENN_H[typ]) return KENN_H[typ];
        if (typ === 'ventil') {
            // Signalglieder: Rollenventile erfassen eine Lage (BG), handbetätigte sind Bedienteile (SJ)
            if (o && o.wege === '3/2' && (o.links === 'rolle' || o.links === 'rolle_leer')) return 'BG';
            if (o && o.wege === '3/2' && MANUELL[o.links]) return 'SJ';
            return 'QM';
        }
        return KENN[typ] || 'Q';
    }
    const ALT_BEZ = /^\d+[A-Z]\d+$/;   // altes Schema 1A1, 1V2, 0Z1 (DIN ISO 1219-2)
    // Kennzeichen, die der Elektroplan schon vergibt (-BG1 für S_METALL, -SJ1 für START …)
    function elektroKennzeichen() {
        try {
            if (typeof window._spsIoLabels !== 'function' || typeof currentGraph === 'undefined' || !currentGraph) return [];
            const r = window._spsIoLabels(currentGraph, typeof globalInputs !== 'undefined' ? globalInputs : [], typeof globalOutputs !== 'undefined' ? globalOutputs : []);
            return Object.values(r.labels || {});
        } catch (e) { return []; }
    }
    // Plan-Kennzeichen, die mit dem Elektroplan zusammenfallen, neu nummerieren
    function kennKonflikteLoesen() {
        const el = new Set(elektroKennzeichen());
        if (!el.size) return false;
        const doppelt = plan.teile.filter(t => t.bez && el.has(t.bez) && /^-(BG|SJ|BP|KH)\d+$/.test(t.bez));
        if (!doppelt.length) return false;
        const belegt = new Set(plan.teile.map(t => t.bez).concat([...el]));
        doppelt.forEach(t => { t.bez = freiesKennzeichen(kennCode(t.typ, t.o), belegt); });
        return true;
    }
    function freiesKennzeichen(code, belegt) {
        let n = 1;
        while (belegt.has('-' + code + n)) n++;
        const k = '-' + code + n; belegt.add(k); return k;
    }
    function neueBezeichnung(typ, o) {
        const T = TYP[typ];
        if (T.ohneBez) return '';
        return freiesKennzeichen(kennCode(typ, o), new Set(plan.teile.map(t => t.bez).concat(elektroKennzeichen())));
    }
    function bezFuer(typ, o) { return neueBezeichnung(typ, o); }
    // Wechselt ein Ventil seine Art (Taster → Magnet …), wechselt das automatische Kennzeichen mit
    function kennNachArt(t) {
        if (t.typ !== 'ventil') return;
        const m = String(t.bez || '').match(/^-([A-Z]+)\d+$/);
        if (m && ['QM', 'SJ', 'BG'].includes(m[1]) && m[1] !== kennCode(t.typ, t.o)) { t.bez = ''; t.bez = neueBezeichnung(t.typ, t.o); }
    }
    // Teile ohne Kennzeichen oder mit altem Schema bekommen ein neues. Liefert alt → neu.
    function kennzeichenAuffrischen(p) {
        const map = {};
        const belegt = new Set(p.teile.filter(t => t.bez && !ALT_BEZ.test(t.bez)).map(t => t.bez).concat(elektroKennzeichen()));
        // Zylinder links zuerst, damit -MM1 links steht
        const reihe = p.teile.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
        for (const t of reihe) {
            if (!TYP[t.typ] || TYP[t.typ].ohneBez) continue;
            if (t.bez && !ALT_BEZ.test(t.bez)) continue;
            const neu = freiesKennzeichen(kennCode(t.typ, t.o), belegt);
            if (t.bez) map[t.bez] = neu;
            t.bez = neu;
        }
        return map;
    }
    const kennTextNeu = (txt, map) => String(txt || '').replace(/\b\d+[A-Z]\d+\b/g, m => map[m] || m);

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
    // Pläne bis v1 rechneten die Drossel als Querschnitt (Leitwert ~ Öffnung²), ab v2
    // linear wie die 2D-Anlage: gleiche Wirkung bei neu = alt² / 800.
    function drosselnUmstellen(p) {
        if ((p.v || 1) >= 2) return;
        const alt = { drossel: 50, drv: 50, daempfer: 100 };
        for (const t of p.teile || []) {
            if (!(t.typ in alt)) continue;
            t.o = t.o || {};
            if (t.typ === 'daempfer' && !t.o.drossel) continue;
            const o = Number(t.o.offen != null ? t.o.offen : alt[t.typ]);
            t.o.offen = Math.max(1, Math.min(100, Math.round(o * o / 800)));
        }
        p.v = 2;
    }
    function planImport(p) {
        plan = (p && Array.isArray(p.teile)) ? kopie(p) : { v: 2, teile: [], leitungen: [] };
        if (!Array.isArray(plan.leitungen)) plan.leitungen = [];
        drosselnUmstellen(plan);
        plan.teile.forEach(t => { t.o = Object.assign({}, TYP[t.typ] ? TYP[t.typ].optionen : {}, t.o || {}); });
        plan.teile = plan.teile.filter(t => TYP[t.typ]);
        kennzeichenAuffrischen(plan);   // alte Bezeichnungen 1A1/1V1 → -MM1/-QM1
        auswahl.clear(); geoCache.clear(); undoStapel = []; redoStapel = []; sim = null;
        // Spiegel gehören zum alten Plan (sonst hielte der Abgleich gleich benannte 2D-Teile für gelöscht)
        try { spiegel.clear(); spiegel2D.clear(); kennSpiegel.clear(); hydSpiegel.clear(); gesehen2D = null; } catch (e) {}
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
    function rohPunkte(l) {
        const ta = teil(l.a.t), tb = teil(l.b.t);
        if (!ta || !tb) return null;
        if (angedockt(l)) return null;
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
            else {
                // L-Weg; läge die Ecke in einem Bauteil, außen herum (Z-Weg über den Stich des Anschlusses)
                const drin = (q, t) => { const w = boxWelt(t); return q[0] > w[0] && q[0] < w[2] && q[1] > w[1] && q[1] < w[3]; };
                if (vA) {
                    const ecke = [a1[0], b1[1]], w = boxWelt(tb);
                    if ((drin(ecke, tb) || drin(ecke, ta)) && (a1[1] > w[3] || a1[1] < w[1])) {
                        const my = snap((a1[1] + (a1[1] > w[3] ? w[3] : w[1])) / 2);
                        pts.push([a1[0], my], [b1[0], my], b1);
                    } else pts.push(ecke, b1);
                } else {
                    const ecke = [b1[0], a1[1]], w = boxWelt(ta);
                    if ((drin(ecke, ta) || drin(ecke, tb)) && (b1[1] > w[3] || b1[1] < w[1])) {
                        const my = snap((b1[1] + (b1[1] > w[3] ? w[3] : w[1])) / 2);
                        pts.push([a1[0], my], [b1[0], my], b1);
                    } else pts.push(ecke, b1);
                }
            }
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
    // Alle Leitungswege gemeinsam: Leitungen verschiedener Netze laufen nie aufeinander
    // (ein Mittelstück weicht um ein Raster aus), Kreuzungen fremder Netze bekommen einen
    // Bogen, Abzweige im selben Netz einen Punkt (DIN ISO 1219).
    // ------------------------------------------------------------
    const wegSpeicher = { p: null, sig: '', wege: new Map(), netz: new Map() };
    function wegSignatur() {
        let s = '';
        for (const t of plan.teile) s += t.id + ',' + t.x + ',' + t.y + ',' + (t.rot || 0) + ',' + (t.sp ? 1 : 0) + (t.typ === 'ventil' ? ',' + ventilStellungen(t.o).length + (t.o.links || '') + (t.o.rechts || '') : '') + ';';
        for (const l of plan.leitungen) s += l.id + ':' + l.a.t + l.a.p + '>' + l.b.t + l.b.p + (l.pkt ? JSON.stringify(l.pkt) : '') + ';';
        return s;
    }
    function leitungsNetze() {
        const vater = new Map(), f = k => { while (vater.has(k) && vater.get(k) !== k) k = vater.get(k); return k; };
        const vereine = (a, b) => { if (!vater.has(a)) vater.set(a, a); if (!vater.has(b)) vater.set(b, b); const ra = f(a), rb = f(b); if (ra !== rb) vater.set(ra, rb); };
        for (const l of plan.leitungen) vereine(l.a.t + ':' + l.a.p, l.b.t + ':' + l.b.p);
        const m = new Map(); for (const l of plan.leitungen) m.set(l.id, f(l.a.t + ':' + l.a.p));
        return m;
    }
    // Leitungen mit Öl (ihr Netz berührt ein Hydraulikteil)
    function oelLeitungen() {
        const netz = leitungsNetze(), hydN = new Set(), aus = new Set();
        for (const l of plan.leitungen) if (istHyd(teil(l.a.t)) || istHyd(teil(l.b.t))) hydN.add(netz.get(l.id));
        for (const l of plan.leitungen) if (hydN.has(netz.get(l.id))) aus.add(l.id);
        return aus;
    }
    // Medium an einem Anschluss: 'hyd', 'pneu' oder null (Verbindungspunkt ohne Leitung)
    function mediumAn(e) {
        const t = teil(e.t); if (!t) return null;
        if (t.typ !== 'knoten') return istHyd(t) ? 'hyd' : 'pneu';
        const gesehen = new Set([t.id]), offen2 = [t.id];
        while (offen2.length) {
            const id = offen2.pop();
            for (const l of plan.leitungen) {
                const o = l.a.t === id ? l.b.t : l.b.t === id ? l.a.t : null; if (!o || gesehen.has(o)) continue;
                gesehen.add(o); const q = teil(o); if (!q) continue;
                if (q.typ !== 'knoten') return istHyd(q) ? 'hyd' : 'pneu';
                offen2.push(o);
            }
        }
        return null;
    }
    const segH = (a, b) => a[1] === b[1] && a[0] !== b[0];
    const segV = (a, b) => a[0] === b[0] && a[1] !== b[1];
    function ueberlappen(a, b, c, d) {   // kollinear und mehr als 1 Einheit gemeinsam
        if (segH(a, b) && segH(c, d) && Math.abs(a[1] - c[1]) < 0.5) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 1;
        if (segV(a, b) && segV(c, d) && Math.abs(a[0] - c[0]) < 0.5) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 1;
        return false;
    }
    function kreuzen(h0, h1, v0, v1, rand) {   // waagrecht h × senkrecht v, beide im Inneren
        const x = v0[0], y = h0[1];
        return x > Math.min(h0[0], h1[0]) + rand && x < Math.max(h0[0], h1[0]) - rand && y > Math.min(v0[1], v1[1]) + 0.5 && y < Math.max(v0[1], v1[1]) - 0.5;
    }
    function kreuzungen(pts, fremde) {
        let n = 0;
        for (let i = 0; i < pts.length - 1; i++) for (const q of fremde) for (let j = 0; j < q.length - 1; j++) {
            if (segH(pts[i], pts[i + 1]) && segV(q[j], q[j + 1]) && kreuzen(pts[i], pts[i + 1], q[j], q[j + 1], 0)) n++;
            else if (segV(pts[i], pts[i + 1]) && segH(q[j], q[j + 1]) && kreuzen(q[j], q[j + 1], pts[i], pts[i + 1], 0)) n++;
        }
        return n;
    }
    function alleWege() {
        const sig = wegSignatur();
        if (wegSpeicher.p === plan && wegSpeicher.sig === sig) return wegSpeicher;
        const netz = leitungsNetze(), wege = new Map();
        for (const l of plan.leitungen) {
            let pts = rohPunkte(l); if (!pts) continue;
            const fremd = [...wege].filter(([id]) => netz.get(id) !== netz.get(l.id)).map(([, q]) => q);
            const stoesst = (pp, i) => fremd.some(q => q.some((_, j) => j < q.length - 1 && ueberlappen(pp[i], pp[i + 1], q[j], q[j + 1])));
            if (!(Array.isArray(l.pkt) && l.pkt.length)) {
                // Kosten eines Mittelstücks: auf fremder Leitung (schwer), durch ein Bauteil, Kreuzungen
                const boxen = plan.teile.filter(t => t.typ !== 'knoten').map(t => boxWelt(t));
                const durch = (a, b) => boxen.some(w => Math.max(a[0], b[0]) > w[0] + 1 && Math.min(a[0], b[0]) < w[2] - 1 && Math.max(a[1], b[1]) > w[1] + 1 && Math.min(a[1], b[1]) < w[3] - 1);
                const kosten = (pp, i) => [i - 1, i, i + 1].reduce((k, j) => k + (stoesst(pp, j) ? 100 : 0) + (j > 0 && j + 2 < pp.length && durch(pp[j], pp[j + 1]) ? 10 : 0), 0) + kreuzungen(pp, fremd);
                for (let i = 1; i + 2 < pts.length; i++) {
                    let best = { pp: pts, k: kosten(pts, i) };
                    if (!stoesst(pts, i) && !durch(pts[i], pts[i + 1])) continue;
                    const h = segH(pts[i], pts[i + 1]);
                    for (const dv of [10, -10, 20, -20, 30, -30, 40, -40, 50, -50]) {
                        const pp = pts.map(q => q.slice());
                        if (h) { pp[i][1] += dv; pp[i + 1][1] += dv; } else { pp[i][0] += dv; pp[i + 1][0] += dv; }
                        // das Mittelstück darf nicht hinter die Stiche der Anschlüsse rutschen
                        if (h ? (Math.sign(pp[i][1] - pp[i - 1][1]) !== Math.sign(pts[i][1] - pts[i - 1][1]) || Math.sign(pp[i + 2][1] - pp[i + 1][1]) !== Math.sign(pts[i + 2][1] - pts[i + 1][1]))
                              : (Math.sign(pp[i][0] - pp[i - 1][0]) !== Math.sign(pts[i][0] - pts[i - 1][0]) || Math.sign(pp[i + 2][0] - pp[i + 1][0]) !== Math.sign(pts[i + 2][0] - pts[i + 1][0]))) continue;
                        const k = kosten(pp, i);
                        if (k < best.k) best = { pp, k };
                        if (k === 0) break;
                    }
                    pts = best.pp;
                }
            }
            wege.set(l.id, pts);
        }
        Object.assign(wegSpeicher, { p: plan, sig, wege, netz });
        return wegSpeicher;
    }
    function leitungPunkte(l) {
        if (!l) return null;
        const W = alleWege();
        return W.wege.has(l.id) ? W.wege.get(l.id) : rohPunkte(l);
    }
    // Pfad einer Leitung mit Bögen über fremde senkrechte Leitungen
    const BOGEN = 4;
    function leitungPfad(l, pts) {
        const W = alleWege(), mein = W.netz.get(l.id);
        const fremd = []; for (const [id, q] of W.wege) if (W.netz.get(id) !== mein) fremd.push(q);
        let d = 'M' + pts[0].join(',');
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            if (segH(a, b)) {
                const sg = b[0] > a[0] ? 1 : -1, xs = [];
                for (const q of fremd) for (let j = 0; j < q.length - 1; j++) if (segV(q[j], q[j + 1]) && kreuzen(a, b, q[j], q[j + 1], BOGEN + 0.5)) xs.push(q[j][0]);
                [...new Set(xs)].sort((u, v) => sg * (u - v)).forEach(x => { d += ` L${x - sg * BOGEN},${a[1]} A${BOGEN},${BOGEN} 0 0 ${sg > 0 ? 1 : 0} ${x + sg * BOGEN},${a[1]}`; });
            }
            d += ' L' + b.join(',');
        }
        return d;
    }
    // Abzweigpunkte: wo die Leitungen eines Netzes in drei oder mehr Richtungen auseinandergehen
    function abzweigPunkte() {
        const W = alleWege(), proNetz = new Map(), punkte = [];
        for (const [id, q] of W.wege) { const n = W.netz.get(id); if (!proNetz.has(n)) proNetz.set(n, []); proNetz.get(n).push(q); }
        for (const wege of proNetz.values()) {
            if (wege.length < 2) continue;
            const segs = []; wege.forEach(q => { for (let i = 0; i < q.length - 1; i++) segs.push([q[i], q[i + 1]]); });
            const kand = new Map();
            wege.forEach(q => q.forEach(p => kand.set(p.join(','), p)));
            for (const [a, b] of segs) for (const [c, e] of segs) {
                if (segH(a, b) && segV(c, e) && kreuzen(a, b, c, e, 0.5)) { const p = [c[0], a[1]]; kand.set(p.join(','), p); }
            }
            for (const p of kand.values()) {
                const r = new Set();
                for (const [a, b] of segs) {
                    if (segH(a, b) && Math.abs(a[1] - p[1]) < 0.5) {
                        const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
                        if (p[0] >= lo - 0.5 && p[0] <= hi + 0.5) { if (hi > p[0] + 0.5) r.add('r'); if (lo < p[0] - 0.5) r.add('l'); }
                    } else if (segV(a, b) && Math.abs(a[0] - p[0]) < 0.5) {
                        const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
                        if (p[1] >= lo - 0.5 && p[1] <= hi + 0.5) { if (hi > p[1] + 0.5) r.add('u'); if (lo < p[1] - 0.5) r.add('o'); }
                    }
                }
                if (r.size >= 3) punkte.push(p);
            }
        }
        return punkte;
    }

    // ------------------------------------------------------------
    // Fenster und Oberfläche
    // ------------------------------------------------------------
    const CSS = `
    #fp-fenster{position:fixed;left:8vw;top:9vh;width:min(1100px,84vw);height:min(720px,80vh);z-index:9000;display:none;flex-direction:column;
        background:#1e1e1e;border:1px solid #555;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.55);font-family:'Segoe UI',system-ui,sans-serif;color:#ddd;
        --fp-papier:#fff;--fp-linie:#263238;--fp-druck:#1565c0;--fp-aktiv:#ffb300;--fp-wahl:#ff6f00;}
    #fp-fenster.fp-max{left:0!important;top:0!important;width:100vw!important;height:100vh!important;border-radius:0}
    #fp-fenster.fp-panel{position:relative;left:auto;top:auto;width:100%;height:100%;flex:1 1 auto;min-width:0;min-height:0;z-index:auto;display:flex;border:none;border-radius:0;box-shadow:none}
    #fp-fenster.fp-panel .fp-kopf{cursor:default;border-radius:0}
    #fp-fenster.fp-panel .fp-griffecke,#fp-fenster.fp-panel .fp-nur-fenster{display:none}
    #fp-fenster .fp-leiste{flex-wrap:wrap}
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
    .fp-reiter{display:flex;gap:3px;padding:3px 6px 2px}.fp-reiter-k{flex:1;background:#333;color:#bbb;border:1px solid #555;border-radius:4px;font-size:11px;padding:3px 2px;cursor:pointer}.fp-reiter-k.an{background:#ff6f00;border-color:#ff8f00;color:#fff}
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
    svg.fp-svg .fp-leitung.oel{stroke-width:2}
    svg.fp-svg .fp-leitung.oel.druck{stroke:#c62828;stroke-width:2.8}
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

    // Stil im Dokument, in dem der Plan gerade steht (Hauptfenster oder abgekoppelt)
    function cssSicher() {
        const d = D();
        if (d.getElementById('fp-css')) return;
        const st = d.createElement('style'); st.id = 'fp-css'; st.textContent = CSS; d.head.appendChild(st);
    }
    // Als Panel (#fluid-wrapper im Arbeitsbereich), sonst als schwebendes Fenster
    const panelEl = () => document.getElementById('fluid-wrapper') || (fenster && fenster.ownerDocument.getElementById('fluid-wrapper'));
    function fensterBauen() {
        if (fenster) return;
        const host = panelEl();
        fenster = h('div', { id: 'fp-fenster', tabindex: '-1' }, host || document.body);
        if (host) fenster.classList.add('fp-panel');
        cssSicher();
        const kopf = h('div', { class: 'fp-kopf' }, fenster);
        h('b', { text: '💨 Fluidplan' }, kopf);
        h('span', { class: 'fp-sub', text: 'Pneumatik nach DIN ISO 1219 · zeichnen und simulieren' }, kopf);
        const r = h('div', { class: 'fp-r' }, kopf);
        h('button', { class: 'fp-btn', title: 'Bedienung kurz erklärt', text: 'ℹ️ Hilfe', onclick: hilfeZeigen }, r);
        h('button', { class: 'fp-btn fp-nur-fenster', title: 'Fenster groß / klein', text: '⛶', onclick: () => { fenster.classList.toggle('fp-max'); } }, r);
        if (host) h('button', { class: 'fp-btn', title: 'In ein eigenes Fenster abkoppeln (Multi-Screen). Simulation und Abgleich laufen dort weiter.', text: '⏏ Abkoppeln', id: 'fp-abk', onclick: abkoppeln }, r);
        h('button', { class: 'fp-btn', title: 'Schließen (der Plan bleibt gespeichert und läuft in der Simulation weiter)', text: '✕', onclick: schliessen }, r);
        if (!host) ziehbar(kopf);

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
        k('📈 Diagramm', 'Weg-Schritt-Diagramm der Zylinder ein-/ausblenden. Es zeichnet während der Simulation mit.', () => { diagBox.classList.toggle('offen'); const b = D().getElementById('fp-diagk'); if (b) b.classList.toggle('an', diagBox.classList.contains('offen')); diagZeichnen(true); }, 'fp-diagk');
        k('🧹 Leeren', 'Ganzen Plan löschen', () => { if (plan.fehlersuche && fehlerAnzahl()) { status('In der Fehlersuche bleibt der Plan, wie er ist.'); return; } if (plan.teile.length && W().confirm('Den ganzen Fluidplan löschen?')) aendern(() => { plan.teile = []; plan.leitungen = []; auswahl.clear(); }); });
        h('span', { class: 'fp-trenner' }, leiste);
        k('🏭 2D-Anlage: aus', 'Plan mit der 2D-Anlage verbinden: Zylinder, Stellglieder, Drosseln und Versorgung entstehen dort als 2D-Teile, der Auto-Schaltplan passt dann zum Fluidplan. Eine Wahrheit: Änderungen hier, in der 2D-Anlage und im Auto-Schaltplan gleichen sich gegenseitig ab.', anlageUmschalten, 'fp-anlage');
        k('⇐ Aus 2D-Anlage', 'Pneumatik oder Hydraulik der 2D-Anlage als Plan übernehmen und verbinden (ersetzt den Plan)', () => { const n = ausAnlage(); if (n) status(n + ' Zylinder aus der 2D-Anlage übernommen.'); });
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
            const up = () => { W().removeEventListener('pointermove', mv); W().removeEventListener('pointerup', up); };
            W().addEventListener('pointermove', mv); W().addEventListener('pointerup', up);
        });
    }
    function groesseZiehen(e) {
        e.preventDefault();
        const r = fenster.getBoundingClientRect();
        const mv = ev => { fenster.style.width = Math.max(520, ev.clientX - r.left) + 'px'; fenster.style.height = Math.max(360, ev.clientY - r.top) + 'px'; ansichtSetzen(); };
        const up = () => { W().removeEventListener('pointermove', mv); W().removeEventListener('pointerup', up); };
        W().addEventListener('pointermove', mv); W().addEventListener('pointerup', up);
    }

    function paletteBauen(pal) {
        pal.innerHTML = '';
        const reiter = h('div', { class: 'fp-reiter' }, pal);
        [['pneu', '💨 Pneumatik'], ['hyd', '🛢 Hydraulik']].forEach(([m, txt]) => h('button', { class: 'fp-reiter-k' + (palMedium === m ? ' an' : ''), 'data-m': m, text: txt,
            title: m === 'hyd' ? 'Hydraulik: Aggregat, 4/3-Wegeventile, Druck- und Stromventile. Öl und Luft lassen sich nicht verbinden.' : 'Pneumatik',
            onclick: () => { palMedium = m; paletteBauen(pal); } }, reiter));
        for (const kat of (palMedium === 'hyd' ? PALETTE_H : PALETTE)) {
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
        andocken(zug && zug.art === 'teile' ? zug.start : null);
        if (!svg) return;
        ebLeitungen.innerHTML = ''; ebTeile.innerHTML = ''; ebUi.innerHTML = '';
        dyn.clear();
        if (!bild) svg.classList.toggle('sim', simLaeuft());
        // Leitungen
        const belegt = new Map();
        const oel = oelLeitungen();
        for (const l of plan.leitungen) {
            const pts = leitungPunkte(l);
            if (!pts) { if (angedockt(l)) for (const e of [l.a, l.b]) { const k = e.t + ':' + e.p; belegt.set(k, (belegt.get(k) || 0) + 1); } continue; }
            const d = leitungPfad(l, pts);
            const gw = auswahl.has('L:' + l.id);
            const istSteuer = [l.a, l.b].some(e => { const tt = teil(e.t); const pl = tt && portLage(tt, e.p); return pl && pl.art === 's'; });
            const pfad = el('path', { d, class: 'fp-leitung' + (istSteuer ? ' steuer' : '') + (oel.has(l.id) ? ' oel' : '') + (gw ? ' gewaehlt' : ''), 'data-l': l.id }, ebLeitungen);
            if (!bild) el('path', { d, class: 'fp-treffer', 'data-l': l.id }, ebLeitungen);
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
            if (bild && bild.map[t.id]) g.setAttribute('data-obj-id', bild.map[t.id]);
            el('rect', { x: gg.box[0], y: gg.box[1], width: gg.box[2] - gg.box[0], height: gg.box[3] - gg.box[1], fill: 'transparent' }, g);
            T.zeichne(t, g, gg);
            const ref = { g, block: g.querySelector('.fp-block'), kolben: g.querySelector('.fp-kolben'), feder: g.querySelector('.fp-feder'),
                nadel: g.querySelector('.fp-nadel'), wert: g.querySelector('.fp-wert'), kugel: g.querySelector('.fp-kugel'), schieber: g.querySelector('.fp-schieber'),
                zeiger: g.querySelector('.fp-zeiger'), marken: g.querySelector('.fp-marken'), speicher: g.querySelector('.fp-speicher'), geo: gg };
            dyn.set(t.id, ref);
            // Handbetätiger anklickbar machen (Fläche über dem Betätiger)
            if (t.typ === 'ventil' && !bild) {
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
                const oben = t.typ === 'zyl_dw' || t.typ === 'zyl_ew' || t.typ === 'ventil' || t.typ === 'zeit' || t.typ === 'folge' || t.typ === 'wartung' || t.typ === 'quelle';
                if (oben) el('text', { class: 'fp-bez', x: bb[0] + (t.typ === 'ventil' ? 10 : 0), y: bb[1] - 2 }, ebTeile).textContent = t.bez;
                else el('text', { class: 'fp-bez', x: bb[2] + 2, y: bb[1] + 10 }, ebTeile).textContent = t.bez;
            }
            // Variablen an Spulen / Druckschalter
            if (t.typ === 'ventil') {
                const bb = boxWelt(t);
                const vs = [];
                const sp = v => bild && v && bild.spule && bild.spule(v) ? bild.spule(v) + ' ' + v : (v || '?');
                if (t.o.links === 'magnet') vs.push(sp(t.o.varL));
                if (t.o.rechts === 'magnet') vs.push(sp(t.o.varR));
                // unter angedockten Schalldämpfern und Stopfen
                let unten = bb[3];
                for (const l of plan.leitungen) { const a = angedockt(l) && andockVon(l); if (a && a.wirt === t) unten = Math.max(unten, boxWelt(a.gast)[3]); }
                if (vs.length) el('text', { class: 'fp-var', x: bb[0], y: unten + 12 }, ebTeile).textContent = vs.join(' · ');
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
        if (!bild) for (const t of plan.teile) {
            for (const p of geo(t).ports) {
                const [x, y] = trafo(t, p.x, p.y);
                const n = belegt.get(t.id + ':' + p.id) || 0;
                if (t.typ === 'knoten' && n) continue;
                el('circle', { class: 'fp-port' + (n ? '' : ' frei'), cx: x, cy: y, r: n ? 2.5 : 3.5, 'data-t': t.id, 'data-p': p.id }, ebUi);
            }
        }
        // Abzweigpunkte auf den Leitungen
        for (const p of abzweigPunkte()) el('circle', { class: 'fp-abzweig', cx: p[0], cy: p[1], r: 3.2, fill: 'currentColor' }, ebLeitungen);
        // Verzweigungspunkte an Anschlüssen mit mehreren Leitungen
        for (const [k, n] of belegt) if (n > 1) {
            const [tid, pid] = k.split(':');
            const tt = teil(tid); if (!tt || tt.typ === 'knoten') continue;
            const pl = portLage(tt, pid); if (pl) el('circle', { cx: pl.x, cy: pl.y, r: 3.2, fill: 'currentColor' }, ebLeitungen);
        }
        if (bild) { darstellen(); return; }
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
    // Lage einer Rolle am Zylinder: 'hinten' (0 %), 'vorne' (100 %) oder eine Zahl in % vom Hub
    const posProzent = pos => pos === 'hinten' ? 0 : pos === 'vorne' ? 100 : Math.max(0, Math.min(100, zahl(pos, 0)));
    function posAnteil(z, pos) { void z; return posProzent(pos) / 100; }
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
        ['auswahl', 'loeschen'].forEach(x => { const b = D().getElementById('fp-w-' + x); if (b) b.classList.toggle('an', x === w); });
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
                if (z.bewegt) {
                    for (const id in z.start) { const t = teil(id); if (t && ANDOCK[t.typ]) andockAblegen(t); }
                    undoStapel.push(z.vorher); redoStapel = []; geoCache.clear(); speichern(); zeichnen();
                }
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
            if (tg && !simLaeuft()) { auswahl.clear(); auswahl.add(tg.getAttribute('data-t')); zeichnen(); const f = D().querySelector('#fp-eigen input, #fp-eigen select'); if (f) f.focus(); }
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
        const ma = mediumAn(a), mb = mediumAn(b);
        if (ma && mb && ma !== mb) { status('Öl und Druckluft lassen sich nicht verbinden: Hydraulik und Pneumatik bleiben getrennte Kreise.'); zeichnen(); return; }
        if (plan.leitungen.some(l => (l.a.t === a.t && l.a.p === a.p && l.b.t === b.t && l.b.p === b.p) || (l.a.t === b.t && l.a.p === b.p && l.b.t === a.t && l.b.p === a.p))) { zeichnen(); return; }
        aendern(() => { plan.leitungen.push({ id: neueId(), a: { t: a.t, p: a.p }, b: { t: b.t, p: b.p } }); });
    }
    function abzweig(von, tr, x, y) {
        const mv = mediumAn(von), ml = mediumAn(tr.l.a.t && teil(tr.l.a.t) && teil(tr.l.a.t).typ !== 'knoten' ? tr.l.a : tr.l.b);
        if (mv && ml && mv !== ml) { status('Öl und Druckluft lassen sich nicht verbinden: Hydraulik und Pneumatik bleiben getrennte Kreise.'); zeichnen(); return; }
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
        const geist = h('div', { style: 'position:fixed;pointer-events:none;z-index:9999;background:#fff;border:1px solid #ff6f00;border-radius:4px;padding:2px 6px;font-size:11px;color:#263238', text: v.name }, D().body);
        const bewege = ev => { geist.style.left = ev.clientX + 8 + 'px'; geist.style.top = ev.clientY + 8 + 'px'; };
        bewege(e);
        let gezogen = false; const sx = e.clientX, sy = e.clientY;
        const mv = ev => { bewege(ev); if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) gezogen = true; };
        const up = ev => {
            W().removeEventListener('pointermove', mv); W().removeEventListener('pointerup', up);
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
        W().addEventListener('pointermove', mv); W().addEventListener('pointerup', up);
    }
    function setzen(v, x, y) {
        let neu = null;
        aendern(() => {
            const o = Object.assign({}, TYP[v.typ].optionen, v.o || {});
            const t = neu = { id: neueId(), typ: v.typ, x, y, rot: 0, bez: bezFuer(v.typ, o), o };
            plan.teile.push(t);
            andockAblegen(t);
            auswahl.clear(); auswahl.add(t.id);
        });
        // Hydraulikzylinder: auf Wunsch gleich die Grundschaltung dazu (sichtbar im Plan)
        if (neu && hydZylT(neu)) grundschaltungFragen(neu.id);
    }
    function grundschaltungFragen(id) {
        const mach = w => { if (w === 'ja') aendern(() => grundschaltung(teil(id))); };
        const dlg = window.showValisChoiceDialog;
        if (typeof dlg === 'function') {
            dlg('Hydraulikzylinder gesetzt', 'Soll der Plan gleich die Grundschaltung dazu bekommen? Alles erscheint im Fluidplan und, wenn er verbunden ist, auch in der 2D-Anlage.', [
                { value: 'ja', icon: '⚙', title: 'Mit Grundschaltung', desc: 'Aggregat, Tank und Wegeventil (doppeltwirkend 4/3 mit Sperrmitte, einfachwirkend 3/2) samt Leitungen.' },
                { value: 'nein', icon: '▭', title: 'Nur der Zylinder', desc: 'Den Rest zeichnest du selbst.' }
            ], mach);
        } else if (W().confirm('Grundschaltung (Aggregat, Tank, Wegeventil) gleich dazu?')) mach('ja');
    }
    function grundschaltung(zt) {
        if (!zt) return;
        const dw = zt.typ === 'zyl_dw', H = { hyd: true };
        const neuT = (typ, x, y, o) => { const oo = Object.assign({}, TYP[typ].optionen, H, o || {}); const t = { id: neueId(), typ, x: snap(x), y: snap(y), rot: 0, bez: bezFuer(typ, oo), o: oo }; plan.teile.push(t); return t; };
        const L = (a, ap, b, bp) => plan.leitungen.push({ id: neueId(), a: { t: a.id, p: ap }, b: { t: b.id, p: bp } });
        const vt = neuT('ventil', 0, zt.y + 310, dw ? { wege: '4/3', mitte: 'gesperrt', links: 'magnet', rechts: 'magnet' } : { wege: '3/2', links: 'magnet', rechts: 'feder' });
        const g = TYP.ventil.geometrie(vt), px = pid => (g.ports.find(q => q.id === pid) || { x: 0 }).x;
        const kX = zt.x + 10, sX = dw ? zt.x + ZYL_L - 10 : kX;
        vt.x = snap((kX + sX) / 2 - (dw ? (px('4') + px('2')) / 2 : px('2')));
        let ag = plan.teile.find(t => t.typ === 'aggregat' && istHyd(t));
        if (!ag) ag = neuT('aggregat', vt.x - 60, zt.y + 440, { q: 20, p: 100 });
        let tk = plan.teile.find(t => t.typ === 'tank' && istHyd(t));
        if (!tk) tk = neuT('tank', vt.x + 260, zt.y + 480);
        L(ag, 'P', vt, '1'); L(vt, '3', tk, '1');
        if (dw) { L(vt, '4', zt, 'K'); L(vt, '2', zt, 'S'); } else L(vt, '2', zt, 'K');
        zt.y = snap(zt.y);
    }

    // ------------------------------------------------------------
    // Eigenschaften
    // ------------------------------------------------------------
    function eigenschaften() {
        const box = D().getElementById('fp-eigen'); if (!box) return;
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
        // Ändert sich die Art des Ventils (z. B. Taster → Magnet), passt das automatische Kennzeichen mit
        const setze = (fn) => aendern(() => { fn(); kennNachArt(t); });
        if (!T.ohneBez) {
            const i = fld('Kennzeichen (DIN EN 81346-2)', h('input', { value: t.bez || '' }));
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
            let dl = D().getElementById(id);
            if (!dl) dl = h('datalist', { id }, D().body);
            dl.innerHTML = ''; varListe(art).forEach(v => h('option', { value: v }, dl));
            const i = fld(lbl, h('input', { value: t.o[key] || '', list: id, placeholder: art === 'in' ? 'z. B. B1' : 'z. B. Y1' }));
            i.onchange = () => setze(() => { t.o[key] = i.value.trim().replace(/\s+/g, '_'); });
        };
        const zylWahl = (lbl, key) => {
            const opts = [['', '– kein Zylinder –']].concat(plan.teile.filter(z => z.typ === 'zyl_dw' || z.typ === 'zyl_ew').map(z => [z.id, z.bez || TYP[z.typ].name]));
            wahl(lbl, key, opts);
        };
        const lage = (key) => {
            const i = fld('Lage der Rolle (% vom Hub, 100 = vordere Endlage)', h('input', { type: 'number', min: 0, max: 100, step: 1, value: posProzent(t.o[key]) }));
            i.onchange = () => setze(() => { const v = Math.max(0, Math.min(100, zahl(i.value, posProzent(t.o[key])))); t.o[key] = v === 0 ? 'hinten' : v === 100 ? 'vorne' : v; });
        };
        if (t.typ === 'ventil') {
            const s = wahl('Wegeventil', 'wege', istHyd(t) ? [['2/2', '2/2-Wege'], ['3/2', '3/2-Wege'], ['4/2', '4/2-Wege'], ['4/3', '4/3-Wege']]
                : [['2/2', '2/2-Wege'], ['3/2', '3/2-Wege'], ['4/2', '4/2-Wege'], ['5/2', '5/2-Wege'], ['5/3', '5/3-Wege']]);
            void s;
            if (t.o.wege === '4/3') wahl('Mittelstellung', 'mitte', [['gesperrt', 'gesperrt (alle zu)'], ['umlauf', 'Umlauf (P → T, A und B zu)'], ['schwimm', 'Schwimmstellung (A und B → T)'], ['offen', 'offen (alle verbunden)']]);
            if (t.o.wege === '2/2' || t.o.wege === '3/2') wahl('Ruhestellung', 'ruhe', [['zu', 'gesperrt (Öffner: zu)'], ['offen', 'Durchfluss (offen)']]);
            if (t.o.wege === '5/3') wahl('Mittelstellung', 'mitte', [['gesperrt', 'gesperrt'], ['entlueftet', 'entlüftet (2, 4 → Abluft)'], ['belueftet', 'belüftet (1 → 2 und 4)']]);
            const bets = Object.keys(BETAETIGUNG).filter(b => b !== 'feder').map(b => [b, BETAETIGUNG[b]]);
            wahl('Betätigung links', 'links', bets);
            if (t.o.links === 'magnet') variable('Spule links: VALIS-Ausgang', 'varL', 'out');
            if (t.o.links === 'rolle' || t.o.links === 'rolle_leer') {
                zylWahl('Rolle betätigt von Zylinder', 'zyl');
                lage('pos');
                num('Schaltweg der Rolle', 'schaltweg', 0.5, 20, 0.5, 'mm');
                if (t.o.links === 'rolle_leer') wahl('betätigt beim', 'richt', [['aus', 'Ausfahren'], ['ein', 'Einfahren']]);
            }
            wahl('Betätigung rechts', 'rechts', [['feder', 'Feder (Rückstellung)']].concat(bets));
            if (t.o.rechts === 'magnet') variable('Spule rechts: VALIS-Ausgang', 'varR', 'out');
            if (t.o.rechts === 'rolle' || t.o.rechts === 'rolle_leer') {
                zylWahl('Rolle rechts betätigt von Zylinder', 'zylR');
                lage('posR');
                if (t.o.links !== 'rolle' && t.o.links !== 'rolle_leer') num('Schaltweg der Rolle', 'schaltweg', 0.5, 20, 0.5, 'mm');
                if (t.o.rechts === 'rolle_leer') wahl('betätigt beim', 'richtR', [['aus', 'Ausfahren'], ['ein', 'Einfahren']]);
            }
            const st = ventilStellungen(t.o);
            // Freie Anschlüsse: was kommt dran?
            for (const p of geo(t).ports) {
                if (p.art === 's') continue;
                const a = abschlussVon(t, p.id); if (!a) continue;
                const s2 = fld('Anschluss ' + (p.nr || p.id) + (istHyd(t) ? (p.art === 'r' ? ' (Tank)' : p.art === 'v' ? ' (Pumpe)' : ' (Arbeitsanschluss)') : p.art === 'r' ? ' (Abluft)' : p.art === 'v' ? ' (Versorgung)' : ' (Arbeitsanschluss)') + ': Abschluss', h('select'));
                for (const [v2, n2] of ABSCHLUSS) if (!istHyd(t) || v2 === 'offen' || v2 === 'stopfen') h('option', { value: v2, text: n2 }, s2);
                s2.value = a.art;
                s2.onchange = () => setze(() => { abschlussSetzen(t, p.id, { art: s2.value, offen: a.offen || 50 }); });
                if (a.art === 'drossel') {
                    const i2 = fld('Drosselschalldämpfer ' + p.id + ': Öffnung (%)', h('input', { type: 'number', min: 1, max: 100, value: a.offen }));
                    i2.onchange = () => setze(() => { const d = teil(a.teil); if (d) d.o.offen = Math.max(1, Math.min(100, zahl(i2.value, 50))); });
                }
            }
            if (istHyd(t)) h('div', { class: 'fp-hinw', html: 'Hydraulik: P von der Pumpe, T zum Tank, A und B zum Zylinder. ' + (t.o.wege === '4/3' ? 'Ohne Betätigung steht das Ventil in der Mitte.' : '') }, box);
            else h('div', { class: 'fp-hinw', html: `Steueranschlüsse heißen nach ISO 5599-3 so, wie sie das Ventil schalten: links <b>${steuerNummer(st[0])}</b>, rechts <b>${steuerNummer(st[st.length - 1])}</b>. ` + (t.o.rechts !== 'feder' && t.o.wege !== '5/3' ? 'Ohne Feder bleibt das Ventil in der zuletzt geschalteten Stellung (Impulsventil).' : '') }, box);
        } else if (t.typ === 'zyl_dw' || t.typ === 'zyl_ew') {
            num('Kolbendurchmesser', 'd', 8, 200, 1, 'mm');
            if (t.typ === 'zyl_dw') num('Stangendurchmesser', 'dStange', 4, 100, 1, 'mm');
            num('Hub', 'hub', 10, 1000, 5, 'mm');
            num('Last gegen das Ausfahren', 'last', 0, istHyd(t) ? 200000 : 20000, 10, 'N');
            if (istHyd(t)) {
                if (!t.o.lastArt) t.o.lastArt = 'gewicht';
                wahl('Art der Last', 'lastArt', [['gewicht', 'Gewicht (wirkt über den ganzen Hub)'], ['presse', 'Werkstück (wirkt ab einer Stelle im Hub)']]);
                if (t.o.lastArt === 'presse') num('Werkstück ab', 'lastAb', 0, 100, 1, '% Hub');
            }
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
            if (t.typ === 'wartung') {
                const c = fld('Darstellung', h('select', {}));
                [['0', 'ausführlich (Filter, Regler, Manometer)'], ['1', 'Kurzform']].forEach(([v, n]) => h('option', { value: v, text: n }, c));
                c.value = t.o.kurz ? '1' : '0';
                c.onchange = () => setze(() => { t.o.kurz = c.value === '1'; });
            }
        } else if (t.typ === 'drossel' || t.typ === 'drv') {
            const i = fld('Öffnung: ' + t.o.offen + ' %', h('input', { type: 'range', min: 1, max: 100, value: t.o.offen }));
            i.oninput = () => { i.previousSibling.textContent = 'Öffnung: ' + i.value + ' %'; t.o.offen = +i.value; };
            i.onchange = () => setze(() => { t.o.offen = +i.value; });
            h('div', { class: 'fp-hinw', text: t.typ === 'drv' ? 'Gedrosselt wird von 1 nach 2, von 2 nach 1 öffnet das Rückschlagventil. Für Abluftdrosselung kommt die 1 an den Zylinder. Auch während der Simulation verstellbar.' : 'Auch während der Simulation verstellbar.' }, box);
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
        } else if (t.typ === 'aggregat') {
            num('Förderstrom der Pumpe', 'q', 0.5, 100, 0.5, 'l/min');
            num('Druckbegrenzung (eingebaut)', 'p', 5, 315, 5, 'bar');
            h('div', { class: 'fp-hinw', text: 'Die Pumpe fördert immer. Steht der Zylinder oder ist das Wegeventil gesperrt, steigt der Druck bis zur Druckbegrenzung, das Öl fließt dann über das Ventil in den Tank (Wärme).' }, box);
        } else if (t.typ === 'dbv') {
            num('Öffnungsdruck', 'p', 5, 315, 5, 'bar');
            h('div', { class: 'fp-hinw', text: 'Das Druckbegrenzungsventil öffnet, sobald der Druck an P den eingestellten Wert erreicht, und leitet das Öl in den Tank.' }, box);
        } else if (t.typ === 'stromregel') {
            num('Durchfluss', 'q', 0.1, 100, 0.1, 'l/min');
            h('div', { class: 'fp-hinw', text: 'Von 1 nach 2 hält die Druckwaage den Durchfluss fest, auch wenn sich die Last ändert (anders als die Drossel). Von 2 nach 1 strömt das Öl ungeregelt zurück.' }, box);
        } else if (t.typ === 'speicher') {
            num('Gasvolumen', 'V0', 0.1, 50, 0.1, 'l');
            num('Vorfülldruck (Stickstoff)', 'p0', 1, 250, 1, 'bar');
            h('div', { class: 'fp-hinw', text: 'Über dem Vorfülldruck nimmt der Speicher Öl auf und gibt es wieder ab, wenn der Druck fällt.' }, box);
        } else if (t.typ === 'entsperr') {
            h('div', { class: 'fp-hinw', text: 'Von 1 nach 2 frei. Zurück von 2 nach 1 nur, wenn an X Steuerdruck anliegt (Last halten, z. B. beim senkrechten Zylinder).' }, box);
        } else if (t.typ === 'dschalter') {
            num('Schaltdruck', 'p', 0.2, istHyd(t) ? 315 : 10, istHyd(t) ? 1 : 0.1, 'bar');
            if (istHyd(t)) {
                num('Schaltdifferenz (Hysterese)', 'hyst', 0.5, 50, 0.5, 'bar');
                const c = fld('Öffner (meldet, solange der Druck fehlt)', h('input', { type: 'checkbox' })); c.checked = !!t.o.oeffner; c.onchange = () => setze(() => { t.o.oeffner = c.checked; });
            }
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
                if (p.art === 'r' || t.typ === 'daempfer' || t.typ === 'stopfen') continue;
                if (t.typ === 'knoten') { meld.push(`Verbindungspunkt ohne Leitung`); continue; }
                if (p.art === 's') meld.push(`${n}: Steueranschluss ${p.id} ist frei – das Ventil bekommt nie Steuerdruck.`);
                else if (istHyd(t)) { if (t.typ !== 'tank' && t.typ !== 'speicher') meld.push(`${n}: Anschluss ${p.nr || p.id} ist offen – hier tritt Öl aus.`); }
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
        const pneuTeile = plan.teile.filter(t => !istHyd(t) && t.typ !== 'knoten'), hydTeile = plan.teile.filter(istHyd);
        if (pneuTeile.length && !plan.teile.some(t => t.typ === 'quelle')) meld.push('Es gibt keine Druckluftquelle.');
        if (hydTeile.length && !plan.teile.some(t => t.typ === 'aggregat')) meld.push('Es gibt kein Hydraulikaggregat.');
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
        const a = D().createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' })); a.download = datei; a.click();
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
        const f = D().getElementById('fp-fuss'); if (!f) return;
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
            d1 = T('drv', 50, -60, '1V2', { offen: 2 }), d2 = T('drv', 170, -60, '1V3', { offen: 2 }),
            s1 = T('ventil', -160, 240, '1S1', { wege: '3/2', links: 'taster' }), s2 = T('ventil', 260, 240, '1S2', { wege: '3/2', links: 'taster' });
            d1.rot = d2.rot = 180;   // Anschluss 1 oben zum Zylinder, 2 unten zum Ventil
            d1.x = 54; d2.x = 136;   // senkrecht unter K und S
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
            L(q, '1', v, '1'); L(v, '4', z, 'K'); L(v, '2', z, 'S'); } },
        { name: 'Hydraulik: Presse mit 4/3-Handhebel', text: 'Hebel 1S1 links: der Zylinder fährt aus, rechts: ein, Mitte: er bleibt stehen. Am Ende steigt der Druck bis zur Druckbegrenzung (Manometer).',
          bau(T, L) { const H = o => Object.assign({ hyd: true }, o || {});
            const ag = T('aggregat', 40, 400, '0P1'), z = T('zyl_dw', 20, -160, '1M1', H({ d: 40, dStange: 20, hub: 200, last: 2000 })),
            v = T('ventil', 20, 60, '1S1', H({ wege: '4/3', links: 'hebel', rechts: 'hebel', mitte: 'gesperrt' })), m = T('manometer', -100, 240, '0P2', H());
            L(ag, 'P', v, '1'); L(ag, 'T', v, '3'); L(m, '1', ag, 'P'); L(v, '4', z, 'K'); L(v, '2', z, 'S'); } },
        { name: 'Hydraulik: Vorschub mit Stromregelventil', text: '1M1 (Y1) fährt aus, gleichmäßig langsam über das Stromregelventil, auch mit Last. 1M2 (Y2) fährt im Eilgang zurück. In der Mitte läuft die Pumpe drucklos um.',
          bau(T, L) { const H = o => Object.assign({ hyd: true }, o || {});
            const ag = T('aggregat', 60, 460, '0P1'), z = T('zyl_dw', 40, -240, '1M1', H({ d: 40, dStange: 20, hub: 200, last: 3000 })),
            v = T('ventil', 40, 160, '1Q1', H({ wege: '4/3', links: 'magnet', rechts: 'magnet', mitte: 'umlauf', varL: 'Y1', varR: 'Y2' })),
            sr = T('stromregel', 50, 0, '1R1', H({ q: 3 })), d = T('dbv', 240, 390, '0F1', H({ p: 50 })), tk = T('tank', 320, 430, ''), m = T('manometer', -80, 300, '0P2', H());
            d.rot = 270; L(ag, 'P', v, '1'); L(ag, 'T', v, '3'); L(d, 'P', ag, 'P'); L(d, 'T', tk, '1'); L(m, '1', ag, 'P');
            L(v, '4', sr, '1'); L(sr, '2', z, 'K'); L(v, '2', z, 'S'); } },
        { name: 'Hydraulik: Last halten mit entsperrbarem Rückschlagventil', text: 'Der Zylinder trägt eine Last. In der Mitte (Schwimmstellung) hält das entsperrbare Rückschlagventil 1R1 sie fest. Erst Druck an B (1M2, Y2) entsperrt es und der Zylinder fährt ein.',
          bau(T, L) { const H = o => Object.assign({ hyd: true }, o || {});
            const ag = T('aggregat', 60, 460, '0P1'), z = T('zyl_dw', 40, -260, '1M1', H({ d: 40, dStange: 20, hub: 200, last: -4000 })),
            v = T('ventil', 40, 160, '1Q1', H({ wege: '4/3', links: 'magnet', rechts: 'magnet', mitte: 'schwimm', varL: 'Y1', varR: 'Y2' })),
            e = T('entsperr', 50, 0, '1R1');
            L(ag, 'P', v, '1'); L(ag, 'T', v, '3'); L(v, '4', e, '1'); L(e, '2', z, 'K'); L(v, '2', z, 'S'); L(v, '2', e, 'X'); } }
    ];
    function beispielBauen(b) {
        const neu = { v: 2, teile: [], leitungen: [] };
        const T = (typ, x, y, bez, o) => { const t = { id: neueId(), typ, x: snap(x), y: snap(y), rot: 0, bez: bez || '', o: Object.assign({}, TYP[typ].optionen, o || {}) }; neu.teile.push(t); return t; };
        const L = (a, ap, c, cp) => neu.leitungen.push({ id: neueId(), a: { t: a.id, p: ap }, b: { t: c.id, p: cp } });
        b.bau(T, L);
        return { neu, map: kennzeichenAuffrischen(neu) };
    }
    const beispielText = b => kennTextNeu(b.text, beispielBauen(b).map);
    function beispielLaden(i) {
        const b = BEISPIELE[i]; if (!b) return;
        if (plan.teile.length && !W().confirm('Der aktuelle Fluidplan wird durch das Beispiel ersetzt. Weiter?')) return;
        const { neu, map } = beispielBauen(b);
        aendern(() => { plan = neu; auswahl.clear(); geoCache.clear(); });
        sim = null; einpassen(); status('Beispiel: ' + b.name + '. ' + kennTextNeu(b.text, map));
    }
    function beispieleZeigen() {
        const box = D().getElementById('fp-eigen'); if (!box) return;
        box.innerHTML = ''; box.classList.add('offen');
        h('h4', { text: '📂 Beispiele' }, box);
        h('div', { class: 'fp-hinw', text: 'Ein Beispiel ersetzt den aktuellen Plan. Danach ▶ Simulation starten und Taster oder Hebel im Plan anklicken.' }, box);
        BEISPIELE.forEach((b, i) => {
            const d = h('div', { style: 'margin:7px 0;padding:6px 7px;border:1px solid #444;border-radius:4px;cursor:pointer', title: beispielText(b), onclick: () => beispielLaden(i) }, box);
            h('div', { text: b.name, style: 'color:#ffb74d;font-weight:600' }, d);
            h('div', { text: beispielText(b), style: 'color:#9e9e9e;font-size:10.5px;margin-top:2px' }, d);
        });
    }
    // ------------------------------------------------------------
    // Messen: Manometer an eine Leitung anstecken (bleibt, bis man es abzieht)
    // ------------------------------------------------------------
    let ebMess = null, messModus = false, messpunkte = [];
    const MESS_MAX = 3;
    function messUmschalten() {
        messModus = !messModus;
        const b = D().getElementById('fp-mess'); if (b) b.classList.toggle('an', messModus);
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
        if (!plan.anlage && plan.teile.some(hydZylT) && !plan.teile.some(t => t.typ === 'aggregat')) { status('Erst ein Hydraulikaggregat in den Plan setzen.'); return; }
        if (plan.anlage && plan.erzeugt && plan.erzeugt.length && !W().confirm('Verbindung lösen? Die vom Plan in der 2D-Anlage erzeugten Zylinder bleiben stehen.')) return;
        aendern(() => { plan.anlage = !plan.anlage; if (!plan.anlage) { plan.erzeugt = []; hydSpiegel.clear(); } });
    }
    function knopfZustand() {
        const ab = D().getElementById('fp-anlage');
        if (ab) { ab.textContent = plan.anlage ? '🏭 2D-Anlage: verbunden' : '🏭 2D-Anlage: aus'; ab.classList.toggle('an', !!plan.anlage); }
        const s = D().getElementById('fp-sim');
        if (s) { const an = simLaeuft(); s.classList.add('sim'); s.classList.toggle('an', an); s.textContent = an ? '■ Stopp' : '▶ Simulation'; }
        const u = D().getElementById('fp-undo'); if (u) u.disabled = !undoStapel.length;
        const r = D().getElementById('fp-redo'); if (r) r.disabled = !redoStapel.length;
        // Den Ansicht-Knopf oben (aktiv / abgekoppelt) setzt updateWorkspace
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
        // Wartungseinheit aus der 2D-Anlage: nur Bild, rechnet als durchgehende Leitung
        for (const t of plan.teile) if (t.typ === 'wartung' && t.o.durch) vereine(t.id + ':1', t.id + ':2');
        const netzVon = {}, netze = [];
        const idx = {};
        for (const k of alle) {
            const r = finde(k);
            if (idx[r] == null) { idx[r] = netze.length; netze.push({ V: 0.0005, M: 0.0005, E: 1, hyd: false, leitungen: 0, offen: [] }); }
            netzVon[k] = idx[r];
        }
        // Öl oder Luft: ein Netz mit einem Hydraulikteil ist ein Ölnetz
        for (const t of plan.teile) if (istHyd(t)) for (const p of geo(t).ports) { const N0 = netze[netzVon[t.id + ':' + p.id]]; if (N0) { N0.hyd = true; N0.E = E_OEL; } }
        for (const l of plan.leitungen) { const n = netzVon[l.a.t + ':' + l.a.p]; if (n != null) netze[n].V += netze[n].hyd ? V_LEITUNG_H : V_LEITUNG; }
        netze.forEach(n => { if (n.hyd) n.V += 0.01; n.M = n.V; });
        // Offene Anschlüsse (ohne Leitung) blasen ab
        for (const t of plan.teile) for (const p of geo(t).ports) {
            const k = t.id + ':' + p.id;
            if (anzahl[k]) continue;
            if (t.typ === 'knoten' || t.typ === 'daempfer' || t.typ === 'stopfen') continue;
            if (t.typ === 'quelle' || t.typ === 'manometer' || t.typ === 'dschalter') continue;
            if (t.typ === 'tank' || t.typ === 'speicher') continue;
            if (p.art === 's') continue; // freier Steueranschluss: kein Druck
            const G0 = netze[netzVon[k]].hyd ? G_HV : G_VENTIL;   // Öl tritt aus (in die Wanne)
            netze[netzVon[k]].offen.push({ t: t.id, p: p.id, g: p.art === 'r' ? G0 : G0 * 0.8 });
        }
        // Undichte Leitungen blasen ab
        for (const l of plan.leitungen) if (fehlerAktiv('L:' + l.id) === 'leck') { const n = netzVon[l.a.t + ':' + l.a.p]; if (n != null) netze[n].offen.push({ t: l.a.t, p: l.a.p, g: (netze[n].hyd ? G_HV : G_VENTIL) * 0.6 }); }
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
                z.pulsL = 0; z.pulsR = 0; z.pulsLH = z.pulsRH = false; z.pulsLX = z.pulsRX = null;
            }
            if (t.typ === 'zeit') { z.pr = 0; z.an = false; }
            if (t.typ === 'folge' || t.typ === 'dschalter') z.an = false;
            if (t.typ === 'wechsel') z.seite = 'X';
            if (t.typ === 'speicher') z.voil = 0;
            zust[t.id] = z;
        }
        sim = { netze, netzVon, zust, zeit: 0, schreib: {} };
        // Kammervolumen der Antriebe gleich mit Füllung (drucklos) ins Netz, sonst saugt der erste Schritt ein Vakuum
        for (const t of plan.teile) {
            if (t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew' && t.typ !== 'schwenk') continue;
            const z = zust[t.id], k = flaechen(t);
            const vk = k.tot + k.AK * z.x * 1e-4, vs = k.tot + k.AS * (zylHub(t) - z.x) * 1e-4;
            const nk = netzVon[t.id + ':K'], ns = netzVon[t.id + ':S'];
            if (nk != null) { netze[nk].V += vk; netze[nk].M += vk; }
            if (ns != null) { netze[ns].V += vs; netze[ns].M += vs; }
            z.vk = vk; z.vs = vs;
        }
        return sim;
    }
    const druckVon = n => {
        const N = sim.netze[n];
        return N ? N.E * (N.M / N.V - 1) : 0;
    };
    const pPort = (t, pid) => { const n = sim.netzVon[t.id + ':' + pid]; return n == null ? 0 : druckVon(n); };
    const netz = (t, pid) => sim.netzVon[t.id + ':' + pid];

    // Kante zwischen zwei Netzen (oder Netz und Atmosphäre/Quelle) ausgleichen
    // g in Nl/(s·bar); nur = 1: nur von a nach b
    // qMax: höchstens diese Menge je Teilschritt (Stromregelventil, Druckbegrenzung)
    function fluss(na, nb, g, nur, pQuelle, qMax) {
        if (g <= 0 || na == null) return 0;
        const A = sim.netze[na];
        const pa = A.E * (A.M / A.V - 1);
        let pb, Vb, Eb = 1;
        if (nb === 'ATM') { pb = 0; Vb = Infinity; }
        else if (nb === 'Q') { pb = pQuelle; Vb = Infinity; }
        else { if (nb == null || nb === na) return 0; const B = sim.netze[nb]; Eb = B.E; pb = B.E * (B.M / B.V - 1); Vb = B.V; }
        let dp = pa - pb;
        if (nur && dp <= 0) return 0;
        if (nur === -1 && dp >= 0) return 0;
        // Durchfluss mit leichtem Wurzel-Gesetz (realistischer bei großen Druckdifferenzen)
        let q = g * Math.sign(dp) * Math.min(Math.abs(dp), 2 * Math.sqrt(Math.abs(dp) + 0.0001)) * DT;
        const gl = dp / (A.E / A.V + (isFinite(Vb) ? Eb / Vb : 0));   // Menge bis Gleichgewicht
        if (Math.abs(q) > Math.abs(gl)) q = gl;
        if (qMax != null && Math.abs(q) > qMax) q = Math.sign(q) * qMax;
        A.M -= q;
        if (isFinite(Vb)) sim.netze[nb].M += q;
        const unten = A.V * (1 - 0.95 / A.E);   // nicht unter Vakuum ~ −0,95 bar (Öl: Kavitation)
        if (A.M < unten) A.M = unten;
        return q;
    }
    // Menge, die ein Netz abgeben muss, um auf den Druck p zu fallen
    const mengeBis = (n, p) => { const N = sim.netze[n]; return N ? Math.max(0, N.M - N.V * (1 + p / N.E)) : 0; };

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
            // Der Nocken drückt die Rolle, solange der Kolben höchstens den Schaltweg (mm) von ihrer
            // Lage entfernt ist; am Anschlag (0 % / 100 %) reicht der Bereich nur nach innen.
            const nah = Math.abs(zz.x - ziel) <= Math.max(0.5, zahl(t.o.schaltweg, 3));
            if (b === 'rolle') {
                // schnell überfahren (zwischen zwei Bildern): kurz betätigt wie in echt
                const key = seite === 'L' ? 'pulsL' : 'pulsR', kx = key + 'X';
                const vorher = z[kx]; z[kx] = zz.x;
                if (!nah && vorher != null && (vorher - ziel) * (zz.x - ziel) < 0) z[key] = 0.02;
                return nah || z[key] > 0;
            }
            // Leerrücklauf: betätigt nur, wenn der Nocken in Wirkrichtung auf die
            // Rolle fährt. Bleibt er darauf stehen (Endlage), bleibt das Ventil
            // betätigt, bis er zurückfährt (dann klappt die Rolle weg). Wird die
            // Rolle in einem Bild überfahren, gibt es einen kurzen Impuls.
            const richt = seite === 'L' ? t.o.richt : t.o.richtR;
            const key = seite === 'L' ? 'pulsL' : 'pulsR', kx = key + 'X', kh = key + 'H';
            // Richtung aus dem Weg seit dem letzten Bild (in der Endlage ist v schon 0)
            const vorher = z[kx]; z[kx] = zz.x;
            const dx = vorher != null ? zz.x - vorher : zz.v * 0.016;
            const fahrt = richt === 'ein' ? dx < -0.01 : dx > 0.01;
            const gegen = richt === 'ein' ? dx > 0.01 : dx < -0.01;
            if (!nah || gegen) z[kh] = false;
            else if (fahrt) z[kh] = true;
            if (!nah && fahrt && vorher != null && (vorher - ziel) * (zz.x - ziel) < 0) z[key] = 0.1;
            return !!z[kh] || z[key] > 0;
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
                z.betL = L; z.betR = R;   // für die Anzeige (Taster gedrückt, Rolle eingedrückt …)
                let neu = z.stellung;
                if (n === 3) neu = L && !R ? 0 : R && !L ? 2 : 1;
                else if (t.o.rechts === 'feder') neu = L ? 0 : 1;
                else if (t.o.links === 'feder') neu = R ? 1 : 0;
                else { if (L && !R) neu = 0; else if (R && !L) neu = 1; }
                if (t.o._stellung != null) neu = t.o._stellung;   // Schattenplan: Stellung aus der 2D-Anlage
                if (fehlerAktiv(t.id) === 'klemmt') neu = n === 3 ? 1 : (t.o.links === 'feder' ? 0 : n - 1);
                if (neu !== z.stellung) { z.stellung = neu; if (!schattenLauf) klick(); }
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
                const p = pPort(t, '1'), ps = zahl(t.o.p, 4), hy = istHyd(t) ? Math.max(0.3, zahl(t.o.hyst, Math.max(2, ps * 0.05))) : 0.3;
                z.an = fehlerAktiv(t.id) === 'defekt' ? false : z.an ? p > ps - hy : p >= ps;
                if (t.o.var && S.schreib) S.schreib[t.o.var] = t.o.oeffner ? !z.an : z.an;
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
            if (t.typ === 'aggregat') {
                // Pumpe fördert Q in P, das eingebaute Druckbegrenzungsventil lässt über p in den Tank ab
                const nP = netz(t, 'P'), fe = fehlerAktiv(t.id);
                const ps = fe === 'druck' ? zahl(t.o.p, 60) * 0.3 : zahl(t.o.p, 60);
                if (nP != null && fe !== 'aus' && !t.o._aus && !lw(t).aus) {
                    N[nP].M += (lw(t).q != null ? lw(t).q : zahl(t.o.q, 8)) / 60 * DT * (fe === 'verschleiss' ? 0.4 : 1);
                    const zuviel = mengeBis(nP, ps); if (zuviel > 0) { N[nP].M -= zuviel; if (S.zust[t.id]) S.zust[t.id].qdbv = (S.zust[t.id].qdbv || 0) + zuviel; }
                }
                fluss(netz(t, 'T'), 'ATM', G_HV * 6, 1);
            }
            if (t.typ === 'tank') fluss(netz(t, '1'), 'ATM', G_HV * 6, 1);
        }
        // Bauteile
        for (const t of plan.teile) {
            const z = S.zust[t.id];
            switch (t.typ) {
                case 'ventil': {
                    const st = ventilStellungen(t.o)[z.stellung], G = istHyd(t) ? G_HV : G_VENTIL;
                    for (const [a, b] of st.w) fluss(netz(t, a), netz(t, b), G, 0);
                    if (fehlerAktiv(t.id) === 'leck') { if (istHyd(t)) { fluss(netz(t, '4'), netz(t, '3'), G * 0.15, 0); fluss(netz(t, '2'), netz(t, '3'), G * 0.15, 0); } else fluss(netz(t, '1'), 'ATM', G * 0.3, 1); }
                    break;
                }
                case 'dbv': {
                    const nP = netz(t, 'P'), nT = netz(t, 'T'), fe = fehlerAktiv(t.id);
                    if (fe === 'klemmt') break;
                    const ps = fe === 'druck' ? zahl(t.o.p, 60) * 0.3 : zahl(t.o.p, 60);
                    const pP = nP != null ? druckVon(nP) : 0;
                    z.auf = pP > ps;
                    if (z.auf) fluss(nP, nT == null ? 'ATM' : nT, G_HV * 8, 1, 0, mengeBis(nP, ps) * 0.7 + 1e-7);
                    break;
                }
                case 'stromregel': {
                    // 1 → 2 geregelt (Druckwaage hält q, solange genug Druckgefälle da ist), 2 → 1 frei wie eine Drossel
                    const qm = Math.max(0, zahl(t.o.q, 4)) / 60 * DT * (fehlerAktiv(t.id) === 'zu' ? 0.01 : 1);
                    fluss(netz(t, '1'), netz(t, '2'), G_HV * 2, 1, 0, qm);
                    fluss(netz(t, '2'), netz(t, '1'), G_HV, 1);
                    break;
                }
                case 'entsperr': {
                    fluss(netz(t, '1'), netz(t, '2'), G_HV, 1);
                    const p2 = pPort(t, '2'), pX = pPort(t, 'X');
                    z.entsperrt = fehlerAktiv(t.id) !== 'klemmt' && pX > 0.3 * Math.max(0, p2) + 2;
                    if (z.entsperrt) fluss(netz(t, '2'), netz(t, '1'), G_HV, 1);
                    break;
                }
                case 'filter': fluss(netz(t, '1'), netz(t, '2'), G_HV * 2 * (fehlerAktiv(t.id) === 'zu' ? 0.02 : 1), 0); break;
                case 'speicher': {
                    // Gaspolster isotherm: pGas = (p0 + 1) · V0 / (V0 − vÖl) − 1
                    const n1 = netz(t, '1'); if (n1 == null) break;
                    const V0 = Math.max(0.05, zahl(t.o.V0, 0.7)), p0 = Math.max(0, zahl(t.o.p0, 30));
                    const pG = z.voil > 0 ? (p0 + 1) * V0 / Math.max(V0 * 0.05, V0 - z.voil) - 1 : p0;
                    const A = N[n1], pN = druckVon(n1), dp = pN - pG;
                    if (dp < 0 && z.voil <= 0) break;
                    let q = G_HV * 2 * Math.sign(dp) * Math.min(Math.abs(dp), 2 * Math.sqrt(Math.abs(dp))) * DT;
                    const steif = A.E / A.V + (pG + 1) / Math.max(V0 * 0.05, V0 - z.voil);
                    if (Math.abs(q) > Math.abs(dp / steif)) q = dp / steif;
                    if (q < -z.voil) q = -z.voil;
                    A.M -= q; z.voil += q;
                    break;
                }
                case 'zeit': case 'folge': {
                    const o = { wege: '3/2', ruhe: t.o.ruhe === 'offen' ? 'offen' : 'zu' };
                    const st = ventilStellungen(o)[z.an ? 0 : 1];
                    for (const [a, b] of st.w) fluss(netz(t, a), netz(t, b), G_VENTIL, 0);
                    break;
                }
                case 'wartung': case 'druckregel': {
                    if (t.o.durch) break;
                    const fe = fehlerAktiv(t.id);
                    const n1 = netz(t, '1'), n2 = netz(t, '2'), ps = fe === 'druck' ? 2.5 : zahl(t.o.p, 6);
                    const p2 = n2 != null ? druckVon(n2) : 0;
                    const off = Math.max(0, Math.min(1, (ps - p2) / 0.4));
                    if (off > 0) fluss(n1, n2, G_VENTIL * 1.5 * off * (fe === 'zu' ? 0.001 : 1), 1);
                    else if (p2 > ps + 0.15) fluss(n2, 'ATM', G_VENTIL * 0.5 * Math.min(1, (p2 - ps) / 0.4), 1);
                    break;
                }
                case 'drossel': fluss(netz(t, '1'), netz(t, '2'), gDrosselT(t, fehlerAktiv(t.id) === 'zu' ? 0.001 : zahl(t.o.offen, 10)), 0); break;
                case 'drv': {
                    const fe = fehlerAktiv(t.id);
                    let n1 = netz(t, '1'), n2 = netz(t, '2');
                    if (fe === 'verkehrt') [n1, n2] = [n2, n1];
                    fluss(n1, n2, gDrosselT(t, fe === 'zu' ? 0.001 : zahl(t.o.offen, 10)), 0);
                    fluss(n2, n1, istHyd(t) ? G_HV : G_VENTIL, 1);   // Rückschlag: frei von 2 nach 1
                    break;
                }
                case 'rueck': { const G = istHyd(t) ? G_HV : G_VENTIL; if (fehlerAktiv(t.id) === 'verkehrt') fluss(netz(t, '2'), netz(t, '1'), G, 1); else fluss(netz(t, '1'), netz(t, '2'), G, 1); break; }
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
                    let g = t.o.drossel ? Math.min(G_VENTIL * 2, gDrossel(zahl(t.o.offen, 100))) : G_VENTIL * 2;
                    if (fehlerAktiv(t.id) === 'zu') g *= 0.002;
                    fluss(netz(t, '1'), 'ATM', g, 1);
                    break;
                }
            }
        }
        // Schlauch in der 2D-Anlage abgezogen (verbundener Plan): die Leitung bläst ab
        const lf = laufFehler.get(plan);
        if (lf) for (const k in lf) if (lf[k] === 'ab') { const l = plan.leitungen.find(q => 'L:' + q.id === k); const n = l && sim.netzVon[l.a.t + ':' + l.a.p]; if (n != null) fluss(n, 'ATM', G_VENTIL * 3, 1); }
        // Offene Anschlüsse
        for (let i = 0; i < N.length; i++) for (const o of N[i].offen) fluss(i, 'ATM', o.g, 0);
        // Kolben bewegen
        for (const t of plan.teile) {
            if (t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew' && t.typ !== 'schwenk') continue;
            const z = S.zust[t.id], k = flaechen(t), hub = zylHub(t);
            const fz = fehlerAktiv(t.id);
            if (fz === 'dichtung') { const G = istHyd(t) ? G_HV * 0.2 : G_VENTIL * 0.35; if (t.typ === 'zyl_ew') fluss(netz(t, 'K'), 'ATM', G, 1); else fluss(netz(t, 'K'), netz(t, 'S'), G, 0); }
            const pk = pPort(t, 'K'), ps = t.typ === 'zyl_ew' ? 0 : pPort(t, 'S');
            let F = 10 * (pk * k.AK - ps * k.AS);
            if (t.typ === 'zyl_ew') F -= k.feder0 + k.federC * z.x;
            if (t.typ === 'schwenk') F -= zahl(t.o.moment, 2) * 10 * Math.sign(F || 1) * 0; // Moment als Last unten
            const last = t.typ === 'schwenk' ? zahl(t.o.moment, 2) * 25 : lw(t).last != null ? lw(t).last : zahl(t.o.last, 0);
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
            const ans = t.o._anschlag != null ? t.o._anschlag : lw(t).anschlag;
            if (ans != null && x > ans && z.x <= ans + 0.01) { x = ans; if (v > 0) v = 0; }
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
        if (istHyd(t)) {
            // Hydraulikzylinder: auf 100 bar ausgelegt, schwerer, mehr Totvolumen (Schlauchanschluss)
            const Fh = 10 * 100 * AK;
            return { AK, AS, tot: 0.02 + AK * 2e-4, m: 8 + d / 10, d: Fh / 4, reib: 0.01 * Fh + 20,
                feder0: 0.004 * Fh, federC: 0.004 * Fh / Math.max(10, zahl(t.o.hub, 50)) };
        }
        const Fmax = 10 * 6 * AK;
        return { AK, AS, tot: 0.0015 + AK * 0.5e-4, m: (window._fpMasse || 0.3) + d / 80, d: Fmax / (window._fpDmp || 10), reib: 0.04 * Fmax + 3,
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
        if (b === 'hebel') { if (an) { if (seite === 'L') { z.rasteL = !z.rasteL; if (z.rasteL) z.rasteR = false; } else { z.rasteR = !z.rasteR; if (z.rasteR) z.rasteL = false; } } return; }   // ein Hebel: Einrasten auf einer Seite löst die andere
        const key = id + ':' + seite;
        if (an) gedrueckt.add(key); else gedrueckt.delete(key);
        try { if (an && typeof SoundEngine !== 'undefined') SoundEngine.click(); } catch (e) {}
    }

    // Darstellung des Simulationszustands (je Bild)
    function darstellen() {
        if (!svg || !offen) return;
        const an = !!sim;
        if (!bild) messDarstellen();
        for (const l of plan.leitungen) {
            const p = dyn.get('L:' + l.id); if (!p) continue;
            const n = an ? sim.netzVon[l.a.t + ':' + l.a.p] : null;
            const N0 = n != null ? sim.netze[n] : null;
            p.classList.toggle('druck', an && !!N0 && druckVon(n) > (N0.hyd ? P_AN_H : P_AN));
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
                betZeigen(r.g.querySelector('.fp-bet-l'), t.o.links, -1, !!(z && z.betL), 'var(--fp-aktiv)');
                betZeigen(r.g.querySelector('.fp-bet-r'), t.o.rechts, 1, !!(z && z.betR), 'var(--fp-aktiv)');
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
                const p = an ? pPort(t, '1') : 0, voll = istHyd(t) ? 160 : 10;
                const w = (-135 + Math.max(0, Math.min(voll, p)) / voll * 270) * Math.PI / 180;
                r.nadel.setAttribute('x2', 9 * Math.sin(w)); r.nadel.setAttribute('y2', -9 * Math.cos(w));
                if (r.wert) r.wert.textContent = an ? p.toFixed(istHyd(t) ? 0 : 1) + ' bar' : '';
            }
            if (t.typ === 'dbv') { const k = r.g.querySelector('.fp-dbv-pfeil'); if (k) k.setAttribute('transform', z && z.auf ? 'translate(-4,0)' : ''); }
            if (t.typ === 'speicher') { const k = r.g.querySelector('.fp-oelstand'); if (k) { const a = z ? Math.max(0, Math.min(1, z.voil / Math.max(0.05, zahl(t.o.V0, 0.7)))) : 0; k.setAttribute('height', 16 * a); k.setAttribute('y', 15 - 16 * a); } }
            if (t.typ === 'entsperr' && r.kugel) {
                const auf = an && (z.entsperrt || pPort(t, '1') > pPort(t, '2') + 0.05);
                r.kugel.setAttribute('transform', auf ? 'translate(0,-5)' : '');
            }
            if (t.typ === 'wechsel' && r.kugel) r.kugel.setAttribute('cx', z ? (z.seite === 'X' ? 9 : -9) : 0);
            if (t.typ === 'zweidruck' && r.schieber) r.schieber.setAttribute('transform', `translate(${z ? (z.seite === 'X' ? 3 : -3) : 0},0)`);
            if (t.typ === 'schnell' && r.kugel) r.kugel.setAttribute('cy', z && z.ab ? 6 : -2);
            if ((t.typ === 'drv' || t.typ === 'rueck') && r.kugel) {
                // Rückschlag: frei bei drv von 2 nach 1, bei rueck von 1 nach 2 (verkehrt eingebaut: umgekehrt)
                let auf = false;
                if (an) {
                    let [vor, nach] = t.typ === 'drv' ? ['2', '1'] : ['1', '2'];
                    if (fehlerAktiv(t.id) === 'verkehrt') [vor, nach] = [nach, vor];
                    auf = pPort(t, vor) > pPort(t, nach) + 0.005;
                }
                const sk = Number(r.kugel.getAttribute('data-frei')) || 1;
                r.kugel.setAttribute('transform', auf ? `translate(0,${sk * 5})` : '');
            }
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
        const sb = D().getElementById('fp-d-schritt'), zb = D().getElementById('fp-d-zeit');
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
        const a = D().createElement('a'); a.href = URL.createObjectURL(blob); a.download = (diagArt === 'schritt' ? 'weg-schritt-diagramm' : 'weg-zeit-diagramm') + '.svg';
        D().body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    let taktZeit = -1e9;
    // Werkstück (Hydraulik, Last „presse"): wirkt erst ab lastAb % Hub und nur gegen das Ausfahren.
    // Ist es stärker als der Zylinder beim höchsten Aggregatdruck, wirkt es als fester Anschlag.
    function presseLasten() {
        let pMax = 0;
        for (const t of plan.teile) if (t.typ === 'aggregat') pMax = Math.max(pMax, zahl(t.o.p, 60));
        for (const t of plan.teile) {
            if (!hydZylT(t)) continue;
            if (t.o.lastArt !== 'presse') { LW.delete(t); continue; }
            const z = sim.zust[t.id]; if (!z) continue;
            const Fl = Math.max(0, zahl(t.o.last, 0)), hub = zylHub(t), ab = Math.max(0, Math.min(100, zahl(t.o.lastAb, 0))) / 100 * hub;
            const fMax = (pMax || 100) * Math.PI * Math.pow(zahl(t.o.d, 20), 2) / 4 / 100 * 10;
            const anschlag = Fl > fMax ? ab : null;
            LW.set(t, { last: anschlag != null || z.v < -0.5 || z.x < ab - 0.01 ? 0 : Fl, anschlag });
        }
    }
    function planTakt(dt) {
        if (!sim) simInit();
        try { presseLasten(); } catch (e) {}
        sim.schreib = {};
        simSchritt(dt);
        // VALIS-Eingänge schreiben
        const s = sps(); let geaendert = false;
        for (const v in sim.schreib) { const w = !!sim.schreib[v]; if (s[v] !== w) { s[v] = w; geaendert = true; } }
        if (geaendert && typeof runSimulationTick === 'function') { try { runSimulationTick(); } catch (e) {} }
    }
    // Aufruf aus der 2D-Anlage vor der Zylinder-Mechanik, dt in s (schon mit simSpeed)
    window._fpTakt = function (dt) {
        if (!simLaeuft() || !(dt > 0)) return;
        if (plan.anlage && plan.teile.length && warLaufend) {
            taktZeit = performance.now();
            try { laufFehlerSetzen(); } catch (e) { console.warn('Fluidplan ← 2D (Fehler)', e); }
            let hv = null;
            try { hv = hydSichtbarVor(); } catch (e) { console.warn('Hydraulik (verbunden)', e); }
            planTakt(Math.min(0.1, dt));
            if (hv) try { hydSichtbarNach(hv, Math.min(0.1, dt), dt); } catch (e) { console.warn('Hydraulik (verbunden)', e); }
        }
        try { hydSchattenTakt(dt); } catch (e) { hschatten = null; console.warn('Hydraulik (Schattenplan)', e); }
        if (window._fpOhneSchatten) { schatten = null; return; }
        try { schattenTakt(dt); } catch (e) { schatten = null; console.warn('Pneumatik (Schattenplan)', e); }
    };
    function schleife(ts) {
        requestAnimationFrame(schleife);
        // Panel beim Laden schon sichtbar (gespeicherte Ansicht): Inhalt jetzt bauen
        if (!fenster && document.getElementById('fluid-wrapper') && panelSichtbar()) sichtbarGeworden();
        if (fenster) {
            const war = offen;
            offen = panelSichtbar();
            if (offen && (!war || D() !== letztesDok)) sichtbarGeworden();
            else if (offen && svg) {
                const r = svg.getBoundingClientRect(), g = Math.round(r.width) + 'x' + Math.round(r.height);
                if (g !== letzteGroesse) { letzteGroesse = g; if (r.width > 50) { if (!fenster._eingepasst) { einpassen(); fenster._eingepasst = true; } else ansichtSetzen(); } }
            }
        }
        const laeuft = simLaeuft();
        if (laeuft !== warLaufend) {
            warLaufend = laeuft;
            schatten = null; hschatten = null; hydGlatt.qdbv = 0;
            if (laeuft) { sim = null; simInit(); gedrueckt.clear(); aufzNeu(); }
            if (svg) { svg.classList.toggle('sim', laeuft); eigenschaften(); }
            knopfZustand(); status();
        }
        if (plan.anlage && ts - rueckZeit > 300) { rueckZeit = ts; try { rueckAbgleich(); } catch (e) { console.warn('Fluidplan ← 2D', e); } }
        else if (!plan.anlage) gesehen2D = null;
        if (ts - plakettenZeit > 500) { plakettenZeit = ts; try { plaketten2D(); } catch (e) {} }
        if (!plan.teile.length) { letzte = ts; return; }
        const dt = Math.min(0.05, Math.max(0, (ts - letzte) / 1000)) * (window.simSpeed || 1);
        letzte = ts;
        // Mit der 2D-Anlage verbunden rechnet die 2D-Anlage den Takt (window._fpTakt),
        // damit ihr Zylinder im selben Bild steht wie der Planzylinder.
        const vomTakt = plan.anlage && performance.now() - taktZeit < 250;
        if (laeuft && dt > 0 && !vomTakt) planTakt(dt);
        if (laeuft && sim) aufzeichnen();
        if (offen) { darstellen(); diagZeichnen(); }
    }

    // Zylinder an freien Schläuchen: die Spulen-Plakette (▶ AUS | EIN ◀) des 2D-Magnetventils
    // gibt es dort nicht, die Ventile stehen als eigene Teile daneben.
    let plakettenZeit = 0;
    function plaketten2D() {
        const F = fabrik(); if (!F) return;
        for (const o of F) {
            if (!/^zylinder_/.test(o.type) || !o.el) continue;
            const frei = o.hasPneumatics && !F.some(v => v.type === 'valve_pneu' && v.targetCylinderId === o.id);
            const b = o.el.querySelector('.f2d-valve'); if (b) { const d = frei ? 'none' : ''; if (b.style.display !== d) b.style.display = d; }
            if (frei && o.normLabel) { const l = o.el.querySelector(':scope > .f2d-label'); if (l && l.textContent !== o.normLabel) l.textContent = o.normLabel; }
        }
    }
    // Zylinder der 2D-Anlage, der einem Planzylinder folgt (Hook in der Zylinder-Mechanik)
    window._fpZylinder = function (obj) {
        if (!simLaeuft()) return null;
        let r = null;
        if (sim && plan.anlage) {
            const t = plan.teile.find(q => (q.typ === 'zyl_dw' || q.typ === 'zyl_ew') && q.o.anlage === obj.id);
            const z = t && sim.zust[t.id];
            if (z) r = { ziel: z.x / zylHub(t) * 100, v: Math.abs(z.v) / zylHub(t) * (obj.stroke || 100) };
        }
        if (!r) r = schattenZiel(obj) || hydSchattenZiel(obj);
        if (!r) return null;
        const diff = r.ziel - (obj.extension || 0);
        if (Math.abs(diff) < 0.05) return { dir: 0, v: 0 };
        // Die 2D-Anlage übernimmt die Stellung des Planzylinders in jedem Bild genau
        // (ziel), damit Zeitpunkte wie beim Auswerfen eines fallenden Teils stimmen.
        return { dir: diff > 0 ? 1 : -1, v: r.v, ziel: r.ziel };
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
    // Laufzeit-Fehler aus der 2D-Anlage (abgezogener Schlauch, Leckage) für den verbundenen Plan
    const laufFehler = new WeakMap();
    const fehlerVon = id => (plan.fehler && plan.fehler[id]) || (laufFehler.get(plan) || {})[id] || null;
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
        const box = D().getElementById('fp-eigen'); if (!box) return;
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
            h('button', { class: 'fp-btn', text: 'Lehrkraft: Fehler zeigen', style: 'margin-top:14px', title: 'Fehlersuche beenden und die Fehler wieder einblenden', onclick: () => { if (W().confirm('Fehlersuche beenden und die versteckten Fehler zeigen?')) aendern(() => { plan.fehlersuche = false; plan.verdacht = []; }); } }, box);
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
    // Drosselöffnung: Plan und 2D-Anlage verstehen sie gleich (Anteil am Nenndurchfluss
    // der voll geöffneten Drossel, linear), also wird sie 1:1 übernommen.
    const drosselNach2D = o => Math.max(1, Math.min(100, Math.round(o)));
    const drosselAus2D = drosselNach2D;
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
        let offen = null, zu = null, ab = null, zuT = null, abT = null;
        const min = (a, b) => a == null ? b : Math.min(a, b);
        const stapel = [zyl.id + ':' + port];
        while (stapel.length) {
            const k = stapel.pop();
            if (gesehen.has(k)) continue; gesehen.add(k);
            for (const n of nb[k] || []) {
                if (gesehen.has(n)) continue;
                const [tid, pid] = n.split(':');
                const t = teil(tid); if (!t) continue;
                if (t.typ === 'ventil' && (pid === '2' || pid === '4')) return { ventil: t, port: pid, offen, zu, ab, zuT, abT };
                if (t.typ === 'knoten') { gesehen.add(n); for (const w of nb[n] || []) stapel.push(w); continue; }
                if (['drossel', 'drv', 'rueck', 'schnell'].includes(t.typ) && (pid === '1' || pid === '2')) {
                    const w = zahl(t.o.offen, 10);
                    const zuM = () => { if (zu == null || w < zu) { zu = w; zuT = t.id; } };
                    const abM = () => { if (ab == null || w < ab) { ab = w; abT = t.id; } };
                    if (t.typ === 'drossel') { zuM(); abM(); }
                    // DRV drosselt von 1 nach 2: von der Zylinderseite an 1 betreten = Abluft gedrosselt
                    else if (t.typ === 'drv') { if (pid === '1') abM(); else zuM(); }
                    if ((t.typ === 'drossel' || t.typ === 'drv') && offen == null) offen = w;
                    gesehen.add(n);
                    stapel.push(tid + ':' + (pid === '1' ? '2' : '1'));
                }
            }
        }
        return { ventil: null, offen, zu, ab, zuT, abT };
    }
    // Änderungen in der 2D-Anlage (Kontextmenü: Maße, Drosseln) gehen zurück in den Plan,
    // statt beim nächsten Abgleich still überschrieben zu werden.
    const spiegel = new Map();
    let rueckZeit = 0;
    // 2D-Ids, die nach dem letzten Abgleich da waren: fehlt eins davon, wurde es in der 2D-Anlage gelöscht
    let gesehen2D = null;
    const gesehenNeu = () => { const F = fabrik(); gesehen2D = F ? new Set(F.map(o => o.id)) : null; };
    // In der 2D-Anlage gelöscht (einzeln, ganze Anlage oder „Alles löschen“) → auch im Plan weg.
    // Eine Wahrheit: was in 2D fehlt, kommt beim nächsten Abgleich nicht still zurück.
    function weg2D(F) {
        const da = new Set(F.map(o => o.id));
        if (!gesehen2D) { gesehen2D = da; return false; }
        const fehlt = id => !!id && gesehen2D.has(id) && !da.has(id);
        const weg = new Set(), auch2D = new Set();
        const KETTE = ['valve_pneu', 'valve_hyd', 'throttle', 'throttle_hyd', 'check_valve_hyd', 'pressure_switch_hyd', 'manometer_hyd'];
        // Zylinder weg: was in 2D an ihm hing (Ventil, Drosseln, Rückschlagventile …) geht mit
        const zylWeg = new Set();
        for (const [id, w] of spiegel) if (w.reed != null && fehlt(id)) zylWeg.add(id);
        for (const [id, w] of hydSpiegel) if (w.teil && fehlt(id)) zylWeg.add(id);
        for (const t of plan.teile) if ((t.typ === 'zyl_dw' || t.typ === 'zyl_ew') && fehlt(t.o.anlage)) zylWeg.add(t.o.anlage);
        for (const q of F) if (zylWeg.has(q.targetCylinderId) && KETTE.includes(q.type)) auch2D.add(q.id);
        // Pneumatik: Ventil und Drosseln des Zylinders (die Drosseln verlieren in 2D ihren Zylinder)
        for (const id of zylWeg) {
            const z = spiegel.get(id); if (!z || z.reed == null) continue;
            if (z.vt) weg.add(z.vt);
            const dr = [z.drT && z.drT.ext, z.drT && z.drT.ret].filter(Boolean);
            dr.forEach(d => weg.add(d));
            for (const [tid, x] of spiegel) if (x.offen != null && dr.includes(x.teil)) auch2D.add(tid);
        }
        const gone = id => fehlt(id) || auch2D.has(id);
        // Planteile, deren 2D-Gegenstück fehlt (Fluidplan-Teile mit Gästen macht rueck2D)
        for (const t of plan.teile) if (t.o && t.o.anlage && !spiegel2D.has(t.o.anlage) && gone(t.o.anlage)) weg.add(t.id);
        let quelleWeg = false;
        for (const [id, w] of spiegel) {
            if (!gone(id)) continue;
            if (w.ventil) {
                weg.add(w.ventil);
                // Ventil weg, Zylinder bleibt: seine Drosseln bleiben im Plan und kommen als Fluidplan-Teile zurück
                for (const [zid, z] of spiegel) if (z.vt === w.ventil && !gone(zid) && z.drT)
                    for (const [tid, x] of spiegel) if (x.offen != null && (x.teil === z.drT.ext || x.teil === z.drT.ret)) { auch2D.add(tid); spiegel.delete(tid); }
            } else if (w.quelle) { weg.add(w.quelle); quelleWeg = true; }
            else if (w.teil && (w.reed != null || w.offen != null)) weg.add(w.teil);
        }
        if (!weg.size && !auch2D.size) { gesehen2D = da; return false; }
        if (quelleWeg && !F.some(q => q.type === 'manifold' && da.has(q.id))) plan.teile.filter(t => t.typ === 'wartung').forEach(t => weg.add(t.id));
        // Aggregat weg und kein Hydraulikaggregat mehr in 2D: der Tank gehört dazu
        if (plan.teile.some(t => weg.has(t.id) && t.typ === 'aggregat') && !F.some(q => q.type === 'hydraulic_unit' && da.has(q.id)))
            plan.teile.filter(t => t.typ === 'tank').forEach(t => weg.add(t.id));
        for (const id of [...spiegel.keys()]) if (gone(id)) spiegel.delete(id);
        for (const id of [...hydSpiegel.keys()]) if (gone(id)) hydSpiegel.delete(id);
        aendern(() => {
            F.filter(q => auch2D.has(q.id)).forEach(q => { try { deleteObjRecursive(q); } catch (e) {} });
            // Teile in der Leitung (Drosseln, Rückschlagventile) zuerst: die Leitung bleibt durchgehend
            const inLeitung = id => { const t = teil(id); return t && (HYD_DROSSEL.includes(t.typ) || HYD_RUECK.includes(t.typ)); };
            for (const id of weg) if (inLeitung(id)) drvEntfernen(id);
            for (const id of weg) if (teil(id)) teilEntfernen(id);
            plan.erzeugt = (plan.erzeugt || []).filter(id => !gone(id));
        });
        gesehenNeu();
        if (weg.size) status('In der 2D-Anlage gelöscht – auch im Plan entfernt (Rückgängig holt es zurück).');
        return true;
    }
    // DRV in die Leitung zwischen Zylinderanschluss und Ventil setzen (1 zum Zylinder: Abluftdrosselung)
    function drvEinsetzen(zt, port, offen) {
        const l = plan.leitungen.find(q => (q.a.t === zt.id && q.a.p === port) || (q.b.t === zt.id && q.b.p === port));
        if (!l) return;
        const an = l.a.t === zt.id && l.a.p === port ? l.b : l.a;
        const ot = teil(an.t); if (!ot) return;
        const A = portLage(zt, port), B = portLage(ot, an.p); if (!A || !B) return;
        const d = { id: neueId(), typ: 'drv', x: snap(A.x), y: snap((A.y + B.y) / 2), rot: A.y <= B.y ? 180 : 0, bez: neueBezeichnung('drv'), o: Object.assign({}, TYP.drv.optionen, { offen: Math.max(1, Math.min(100, offen)) }) };
        plan.teile.push(d);
        plan.leitungen = plan.leitungen.filter(q => q.id !== l.id);
        plan.leitungen.push({ id: neueId(), a: { t: an.t, p: an.p }, b: { t: d.id, p: '2' } }, { id: neueId(), a: { t: d.id, p: '1' }, b: { t: zt.id, p: port } });
    }
    function drvEntfernen(id) {
        const an = pid => plan.leitungen.filter(q => (q.a.t === id && q.a.p === pid) || (q.b.t === id && q.b.p === pid));
        const l1 = an('1'), l2 = an('2');
        const ende = (l, pid) => l.a.t === id && l.a.p === pid ? l.b : l.a;
        plan.teile = plan.teile.filter(q => q.id !== id);
        plan.leitungen = plan.leitungen.filter(q => q.a.t !== id && q.b.t !== id);
        if (l1.length === 1 && l2.length === 1) {
            const x = ende(l1[0], '1'), y = ende(l2[0], '2');
            plan.leitungen.push({ id: neueId(), a: { t: y.t, p: y.p }, b: { t: x.t, p: x.p } });
        }
    }
    function laufFehlerSetzen() {
        const F = fabrik(); if (!F) return;
        const m = {};
        for (const t of plan.teile) {
            if ((t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew') || !t.o.anlage) continue;
            const o = F.find(q => q.id === t.o.anlage); if (!o) continue;
            if ((o.leakRate || 0) > 0) m[t.id] = 'dichtung';
            for (const [p2d, pp] of [['1', 'K'], ['2', 'S']]) {
                const ab = (window.pneuConnections || []).some(c => c._broken && ((c.aObjId === o.id && String(c.aPortId) === p2d) || (c.bObjId === o.id && String(c.bPortId) === p2d)));
                if (ab) plan.leitungen.filter(l => (l.a.t === t.id && l.a.p === pp) || (l.b.t === t.id && l.b.p === pp)).forEach(l => { m['L:' + l.id] = 'ab'; });
            }
            const v2 = F.find(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id);
            const w = v2 && spiegel.get(v2.id);
            if (w && w.ventil && (v2.leakRate || 0) > 0) m[w.ventil] = 'leck';
            // Hydraulik: Kolbendichtung und innere Leckage des Wegeventils aus dem 2D-Kontextmenü
            if (o.hasHydraulics) {
                if ((Number((o.hyd || {}).dichtung) || 0) > 0 && t.typ === 'zyl_dw') m[t.id] = 'dichtung';
                const vh = F.find(q => q.type === 'valve_hyd' && q.targetCylinderId === o.id), hw = hydSpiegel.get(o.id);
                if (vh && hw && hw.vt && (Number((vh.hyd || {}).innenLeck) || 0) > 0) m[hw.vt] = 'leck';
            }
        }
        laufFehler.set(plan, m);
    }
    // Reed-Schalter eines 2D-Zylinders: H = hintere Endlage (links), V = vordere
    function reeds2D(o, F) {
        const r = {};
        for (const q of F) {
            if (q.type !== 'sensor_reed' || q.parent !== o) continue;
            const w = (o.rotation || 0) * Math.PI / 180;
            const dx = (q.x + q.width / 2) - (o.x + o.width / 2), dy = (q.y + q.height / 2) - (o.y + o.height / 2);
            const lx = dx * Math.cos(w) + dy * Math.sin(w);
            const seite = lx < 0 ? 'H' : 'V';
            if (!r[seite]) r[seite] = { obj: q, var: q.linkedVar || '' };
        }
        return r;
    }
    const ventilTyp2D = q => q.isTriple ? 'triple' : q.isDouble ? 'double' : 'single';
    // Kennzeichen: Plan → 2D (normLabel); ändert jemand das Kennzeichen in der 2D-Anlage
    // oder im Auto-Schaltplan, holt rueckAbgleich es in den Plan zurück.
    const kennSpiegel = new Map();
    function kennNach2D(obj, t) {
        if (!obj || !t || !t.bez) return;
        if (obj.normLabel !== t.bez) obj.normLabel = t.bez;
        kennSpiegel.set(obj.id, { teil: t.id, kz: t.bez });
    }
    function rueckAbgleich() {
        const F = fabrik(); if (!F || !plan.anlage) return;
        if (weg2D(F)) return;
        if (hydSpiegel.size) hydRueckAbgleich(F);
        if ((!spiegel.size && !spiegel2D.size && !F.some(q => q.type === 'pneu_fp'))) return;
        const neu = []; let masse = false;
        if (rueck2D(F, neu)) masse = true;
        for (const [id, w] of kennSpiegel) {
            const o = F.find(q => q.id === id), t = teil(w.teil);
            if (!o || !t) { kennSpiegel.delete(id); continue; }
            const jetzt = String(o.normLabel || '').trim();
            if (jetzt && jetzt !== w.kz) { w.kz = jetzt; neu.push(() => { t.bez = jetzt; }); }
        }
        for (const [id, w] of spiegel) {
            const o = F.find(q => q.id === id); if (!o) continue;
            if (w.ventil) {
                const vt = plan.teile.find(q => q.id === w.ventil); if (!vt) continue;
                const typ = ventilTyp2D(o);
                if (typ !== w.typ) {
                    // Ventiltyp in der 2D-Anlage oder im Auto-Schaltplan geändert (5/2 ↔ 5/3, Impuls ↔ Feder)
                    masse = true; w.typ = typ;
                    neu.push(() => {
                        if (typ === 'triple') { vt.o.wege = '5/3'; if (vt.o.rechts === 'feder') vt.o.rechts = 'magnet'; }
                        else {
                            if (vt.o.wege === '5/3') vt.o.wege = '5/2';
                            if (typ === 'double' && vt.o.rechts === 'feder') vt.o.rechts = 'magnet';
                            if (typ === 'single' && vt.o.wege !== '3/2') vt.o.rechts = 'feder';
                        }
                        if (vt.o.rechts === 'magnet' && !vt.o.varR) vt.o.varR = o.linkedVarRet || '';
                    });
                }
                const now = JSON.stringify(o.abschluss || null);
                if (now !== w.ab) {
                    masse = true; w.ab = now;
                    neu.push(() => { for (const pid of ['3', '5']) { const pp = planAbluft(vt, pid); if (geo(vt).ports.some(p => p.id === pp)) abschlussSetzen(vt, pp, (o.abschluss || {})[pid] || { art: 'offen' }); } });
                }
                continue;
            }
            if (w.quelle) {
                const qu = plan.teile.find(q => q.id === w.quelle);
                if (qu && o.pressure != null && o.pressure !== w.p) { w.p = o.pressure; masse = true; neu.push(() => { qu.o.p = o.pressure; }); }
                continue;
            }
            const t = plan.teile.find(q => q.id === w.teil); if (!t) continue;
            if (w.reed != null) {
                const R = reeds2D(o, F), jetzt = JSON.stringify({ H: R.H ? R.H.var : '', V: R.V ? R.V.var : '' });
                if (jetzt !== w.reed) { w.reed = jetzt; neu.push(() => { t.o.sensH = R.H ? R.H.var : ''; t.o.sensV = R.V ? R.V.var : ''; }); }
            }
            if (w.dr) {
                const dw = t.typ === 'zyl_dw';
                // Spulen-Variablen
                const ext = dw ? o.linkedVarExt || '' : o.linkedVar || o.linkedVarExt || '', ret = dw ? o.linkedVarRet || '' : '';
                const vt = w.vt && plan.teile.find(q => q.id === w.vt);
                if (vt && (ext !== w.ext || ret !== w.ret)) {
                    w.ext = ext; w.ret = ret;
                    neu.push(() => {
                        const [l, r] = w.linksExt ? [ext, ret] : [ret, ext];
                        if (vt.o.links === 'magnet') vt.o.varL = l;
                        if (vt.o.rechts === 'magnet') vt.o.varR = r;
                    });
                }
                // Drosseln in der 2D-Anlage eingebaut oder entfernt
                for (const rolle of ['ext', 'ret']) {
                    if (rolle === 'ret' && !dw) continue;
                    const th = F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === rolle);
                    if (!!th === w.dr[rolle]) continue;
                    w.dr[rolle] = !!th; masse = true;
                    const port = !dw || rolle === 'ret' ? 'K' : 'S';
                    if (th) neu.push(() => drvEinsetzen(t, port, th.opening != null ? th.opening : 50));
                    else if (w.drT[rolle]) { const id = w.drT[rolle]; neu.push(() => drvEntfernen(id)); }
                }
            }
            if (w.offen != null) { if (o.opening != null && o.opening !== w.offen) neu.push(() => { t.o.offen = o.opening; }); }
            else if (o.pistonD !== w.d || o.rodD !== w.ds || o.stroke !== w.hub) { masse = true; neu.push(() => { t.o.d = o.pistonD || 20; t.o.dStange = o.rodD || t.o.dStange; t.o.hub = o.stroke || 100; }); }
        }
        if (!neu.length) return;
        if (masse) aendern(() => { neu.forEach(f => f()); });
        else {
            // Nur Drosseln: die laufende Simulation behält ihre Drücke
            undoStapel.push(JSON.stringify(plan)); if (undoStapel.length > 100) undoStapel.shift(); redoStapel = [];
            neu.forEach(f => f()); speichern(); zeichnen();
        }
        status('Änderung aus der 2D-Anlage in den Plan übernommen.');
    }
    // Kann die 2D-Anlage diesen Zylinder mit ihrem eigenen Magnetventil (valve_pneu) und
    // ihren Drosseln zeigen? Nur wenn der Plan genau das ist: Magnetventil am Verteiler,
    // dazwischen höchstens eine Drossel je Leitung, Abluft offen oder mit Schalldämpfer.
    // Sonst steht jedes Planteil in 2D als 'pneu_fp', jede Leitung als Schlauch.
    // o.frei: in der 2D-Anlage frei konfigurierbares Fluidplan-Teil, auch als reines Magnetventil
    const magnetVentil = v => !!v && v.typ === 'ventil' && !v.o.frei && v.o.links === 'magnet' && (v.o.rechts === 'magnet' || v.o.rechts === 'feder') && ['3/2', '5/2', '5/3'].includes(v.o.wege);
    function altbau(t, v, dw) {
        if (!magnetVentil(v)) return null;
        const nb = nachbarn(), teile = new Set([t.id, v.id]);
        const weg = port => {
            let k = t.id + ':' + port, dr = 0;
            for (let i = 0; i < 4; i++) {
                const ns = nb[k] || []; if (ns.length !== 1) return false;
                const [tid, pid] = ns[0].split(':'), q = teil(tid); if (!q) return false;
                if (q === v) return (pid === '2' || pid === '4') && (nb[ns[0]] || []).length === 1;
                if ((q.typ === 'drv' || q.typ === 'drossel') && !dr && (pid === '1' || pid === '2')) {
                    dr++; teile.add(q.id);
                    const weiter = tid + ':' + (pid === '1' ? '2' : '1');
                    if ((nb[ns[0]] || []).length !== 1) return false;
                    k = weiter; continue;
                }
                return false;
            }
            return false;
        };
        if (!weg('K') || (dw && !weg('S'))) return null;
        // Versorgung: über T-Stücke nur Quelle, Wartungseinheit und Anschlüsse 1 anderer Magnetventile
        const gesehen = new Set(), stapel = [v.id + ':1']; let quelle = false;
        while (stapel.length) {
            const k = stapel.pop(); if (gesehen.has(k)) continue; gesehen.add(k);
            for (const n of nb[k] || []) {
                if (gesehen.has(n)) continue;
                const [tid, pid] = n.split(':'), q = teil(tid); if (!q) return null;
                if (q.typ === 'knoten') { gesehen.add(n); teile.add(q.id); (nb[n] || []).forEach(w => stapel.push(w)); continue; }
                if ((q.typ === 'quelle' && pid === '1') || (q.typ === 'wartung' && pid === '2')) { quelle = true; continue; }
                if (q.typ === 'ventil' && pid === '1' && magnetVentil(q)) continue;
                return null;
            }
        }
        if (!quelle) return null;
        // Abluft: offen oder Schalldämpfer/Stopfen direkt am Ventil
        for (const p of geo(v).ports) {
            if (p.art !== 'r') continue;
            const a = abschlussVon(v, p.id); if (!a) return null;
            if (a.teil) teile.add(a.teil);
        }
        // Kein weiterer Abzweig an den Arbeitsanschlüssen
        for (const p of ['2', '4']) if ((nb[v.id + ':' + p] || []).length > 1) return null;
        return teile;
    }
    // Ein Planteil in der Form, die die 2D-Anlage speichert (Rollen zeigen auf 2D-Zylinder)
    function fpAusTeil(t, alt) {
        const o = Object.assign({}, t.o); delete o.anlage;
        for (const k of ['zyl', 'zylR']) if (o[k]) { const z = teil(o[k]); o[k] = z && z.o.anlage ? z.o.anlage : ''; }
        const ab = {};
        if (t.typ === 'ventil') for (const p of geo(t).ports) {
            if (p.art !== 'r') continue;
            const a = abschlussVon(t, p.id);
            if (a && a.teil && a.art !== 'offen') ab[p.id] = a.art === 'drossel' ? { art: 'drossel', offen: a.offen } : { art: a.art };
        }
        const r = { typ: t.typ, o, rot: alt ? alt.rot || 0 : 0, ab };
        if (alt && alt.bild) r.bild = alt.bild;   // Darstellung gehört der 2D-Anlage
        return r;
    }
    const spiegel2D = new Map();   // pneu_fp-Id → { teil, sig }
    function anlageAbgleichen() {
        const F = fabrik();
        if (!plan.anlage || !F || typeof createFactoryObject !== 'function') return;
        // Hydraulikzylinder bekommen eigene 2D-Teile (valve_hyd, throttle_hyd …), Pneumatik wie bisher
        if (plan.teile.some(hydZylT) || hydSpiegel.size) hydAbgleichen(F);
        kennKonflikteLoesen();
        plan.erzeugt = plan.erzeugt || [];
        const benutzt = new Set();
        const abgedeckt = new Set();
        const zylNeu = [];
        for (const t of plan.teile) {
            if (t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew') continue;
            if (hydZylT(t)) { if (t.o.anlage) benutzt.add(t.o.anlage); continue; }
            const dw = t.typ === 'zyl_dw';
            const K0 = stellgliedVon(t, 'K'), S0 = dw ? stellgliedVon(t, 'S') : null;
            const v0 = (K0 && K0.ventil) || (S0 && S0.ventil) || null;
            const alt = altbau(t, v0, dw);
            if (alt) alt.forEach(id => abgedeckt.add(id));
            const K = alt ? K0 : null, S = alt ? S0 : null;
            const v = alt ? v0 : null;
            // Drosseln: Ausfahren bremst die Zuluft an K oder die Abluft an S, Einfahren umgekehrt
            const mn = (...a) => { const b = a.filter(x => x != null); return b.length ? Math.min(...b) : null; };
            const drExt = mn(K && K.zu, S && S.ab), drRet = dw ? mn(K && K.ab, S && S.zu) : null;
            // Welches Planteil liefert den Wert (für Änderungen aus der 2D-Anlage zurück in den Plan)
            const quelleVon = (a, at, b, bt) => (a != null && (b == null || a <= b)) ? at : (b != null ? bt : null);
            const drExtT = quelleVon(K && K.zu, K && K.zuT, S && S.ab, S && S.abT);
            const drRetT = dw ? quelleVon(K && K.ab, K && K.abT, S && S.zu, S && S.zuT) : null;
            // Variablen der Spulen: Seite, die den Kolbenraum belüftet = Ausfahren
            let ext = '', ret = '', linksExt = true;
            if (v) {
                const linksBeluftetK = K && K.ventil && K.ventil === v ? K.port === '4' || v.o.wege === '3/2' || v.o.wege === '2/2' : !(S && S.port === '4');
                const vl = v.o.links === 'magnet' ? v.o.varL || '' : '', vr = v.o.rechts === 'magnet' ? v.o.varR || '' : '';
                ext = linksBeluftetK ? vl : vr; ret = linksBeluftetK ? vr : vl; linksExt = linksBeluftetK;
            }
            const wahl = !v ? 'single' : v.o.wege === '5/3' ? 'triple' : (v.o.links !== 'feder' && v.o.rechts !== 'feder') ? 'double' : 'single';
            let o = t.o.anlage ? F.find(q => q.id === t.o.anlage) : null;
            const typ2d = dw ? 'zylinder_double' : 'zylinder_single';
            if (o && ((o.type !== typ2d && o.type !== 'gate_pneu') || o.hasHydraulics)) { o = null; }
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
            if (!alt) {
                // Zylinder hängt an freien Schläuchen (Ventile als Fluidplan-Teile)
                F.filter(q => (q.type === 'valve_pneu' || q.type === 'throttle') && q.targetCylinderId === o.id).forEach(q => { try { deleteObjRecursive(q); } catch (e) {} });
                o.hasPneumatics = true; o.linkedVarExt = null; o.linkedVarRet = null; if (!dw) o.linkedVar = null;
                kennNach2D(o, t);
                zylNeu.push([t, o]);
            }
            if (alt) {
            let ventil = F.find(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id);
            const hat = rolle => !!F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === rolle);
            const passt = ventil && (wahl === 'triple' ? ventil.isTriple : wahl === 'double' ? (ventil.isDouble && !ventil.isTriple) : !ventil.isDouble)
                && hat('ext') === (drExt != null) && hat('ret') === (drRet != null);
            if (ventil && !passt) {
                F.filter(q => (q.type === 'valve_pneu' || q.type === 'throttle') && q.targetCylinderId === o.id).forEach(q => { try { deleteObjRecursive(q); } catch (e) {} });
                o.hasPneumatics = false; ventil = null;
            }
            if (!ventil && typeof window.generatePneumaticSetup === 'function') { o.hasPneumatics = false; try { window.generatePneumaticSetup(o, wahl, { drosseln: { ext: drExt != null, ret: drRet != null } }); } catch (e) { console.warn('Fluidplan → 2D', e); } }
            ventil = F.find(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id);
            if (ventil) { ventil.linkedVarExt = o.linkedVarExt; ventil.linkedVarRet = o.linkedVarRet; }
            if (ventil && v) {
                ventil.abschluss = abschluss2D(v, ventil.isDouble ? ['3', '5'] : ['3']);
                spiegel.set(ventil.id, { ventil: v.id, ab: JSON.stringify(ventil.abschluss || null), typ: ventilTyp2D(ventil) });
            }
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
            // Kennzeichen wandern in die 2D-Anlage (und damit in den Auto-Schaltplan)
            kennNach2D(o, t);
            if (v) kennNach2D(ventil, v);
            for (const [rolle, wt] of [['ext', drExtT], ['ret', drRetT]]) {
                const tp = wt && teil(wt);
                if (tp) kennNach2D(F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === rolle), tp);
            }
            }
            // Spiegel: was der Plan in die 2D-Anlage geschrieben hat
            // Endlagensensoren des Plans = Reed-Schalter am 2D-Zylinder
            let R = reeds2D(o, F);
            for (const [key, seite, pos] of [['sensH', 'H', 'left'], ['sensV', 'V', 'right']]) {
                const soll = t.o[key] || '', ist = R[seite];
                if (soll && !ist && typeof window.attachReed === 'function') { try { window.attachReed(o, soll, pos); } catch (e) {} }
                else if (soll && ist && ist.var !== soll && typeof window.attachReed === 'function') { try { deleteObjRecursive(ist.obj); window.attachReed(o, soll, pos); } catch (e) {} }
                else if (!soll && ist) { try { deleteObjRecursive(ist.obj); } catch (e) {} }
            }
            R = reeds2D(o, fabrik() || F);
            const reed = JSON.stringify({ H: R.H ? R.H.var : '', V: R.V ? R.V.var : '' });
            spiegel.set(o.id, { teil: t.id, d: o.pistonD, ds: o.rodD, hub: o.stroke, vt: v ? v.id : null, linksExt, reed,
                ext: dw ? o.linkedVarExt || '' : o.linkedVar || '', ret: dw ? o.linkedVarRet || '' : '',
                dr: alt ? { ext: drExt != null, ret: drRet != null } : null, drT: { ext: drExtT, ret: drRetT } });
            if (alt) for (const [rolle, wt] of [['ext', drExtT], ['ret', drRetT]]) {
                const th = F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === rolle);
                if (th && wt) spiegel.set(th.id, { teil: wt, offen: th.opening });
            }
        }
        // Druck der Quelle = Druck des Kompressors
        const komp = F.find(q => q.type === 'compressor'), qu = plan.teile.find(q => q.typ === 'quelle');
        if (komp && qu) { komp.pressure = zahl(qu.o.p, 6); kennNach2D(komp, qu); spiegel.set(komp.id, { quelle: qu.id, p: komp.pressure }); }
        const wa = plan.teile.find(q => q.typ === 'wartung');
        if (wa) kennNach2D(F.find(q => q.type === 'manifold'), wa);
        teileNach2D(F, abgedeckt, benutzt);
        // Aus der 2D-Anlage übernommene Zylinder, die im Plan gelöscht wurden, gehen auch in 2D
        for (const [id, w] of [...spiegel]) {
            if (w.reed == null || benutzt.has(id) || teil(w.teil)) continue;
            spiegel.delete(id);
            const o = F.find(q => q.id === id);
            if (o && !plan.erzeugt.includes(id)) {
                F.filter(q => ['valve_pneu', 'throttle'].includes(q.type) && q.targetCylinderId === id).forEach(q => { try { deleteObjRecursive(q); } catch (e) {} });
                try { deleteObjRecursive(o); } catch (e) {}
            }
        }
        // Vom Plan erzeugte 2D-Zylinder, die es im Plan nicht mehr gibt, wieder entfernen
        plan.erzeugt = plan.erzeugt.filter(id => {
            if (benutzt.has(id)) return true;
            const o = F.find(q => q.id === id);
            if (o) { try { deleteObjRecursive(o); } catch (e) {} }
            // Kein Rückweg mehr: sonst hielte der Rückabgleich das Teil für in 2D gelöscht
            // (z. B. ein Schalldämpfer, der erst frei stand und jetzt am Ventil andockt)
            spiegel2D.delete(id);
            for (const t of plan.teile) if (t.o && t.o.anlage === id) delete t.o.anlage;
            return false;
        });
        schlaeucheNach2D(fabrik() || F, abgedeckt);
        try { if (window._syncCircuitFromFactory) window._syncCircuitFromFactory(); } catch (e) {}
        gesehenNeu();
    }
    // Gäste (Schalldämpfer/Stopfen), die direkt an einem Teil sitzen: Gast-Id → Wirt-Id
    function gaesteKarte() {
        const m = {};
        for (const l of plan.leitungen) if (angedockt(l)) { const a = andockVon(l); m[a.gast.id] = a.wirt.id; }
        return m;
    }
    // Planteile ohne eigenes 2D-Bauteil → 'pneu_fp'
    function teileNach2D(F, abgedeckt, benutzt) {
        const gast = gaesteKarte();
        const zone = F.find(q => q.type === 'pneumatic_zone');
        const zx = zone ? zone.x : 20, zy = zone ? zone.y : 600;
        let nr = 0;
        for (const t of plan.teile) {
            if (abgedeckt.has(t.id) || istHyd(t) || ['zyl_dw', 'zyl_ew', 'quelle', 'wartung', 'knoten'].includes(t.typ)) continue;
            if (gast[t.id] && !abgedeckt.has(gast[t.id])) continue;   // sitzt im Symbol seines Wirts
            let o = t.o.anlage ? F.find(q => q.id === t.o.anlage) : null;
            if (o && o.type !== 'pneu_fp') o = null;
            const fp = fpAusTeil(t, o && o.pneu && o.pneu.fp);
            const rolleAlt = o && o.pneu && o.pneu.fp ? rollenSchluessel(o.pneu.fp) : null;
            if (!o) {
                o = createFactoryObject('pneu_fp', fp);
                if (!rolleAnZylinder(o, F)) { o.x = zx + 30 + (nr % 5) * 110; o.y = zy + 20 + Math.floor(nr / 5) * 80; nr++; }
                t.o.anlage = o.id; plan.erzeugt.push(o.id);
                try { updateObjTransform(o); } catch (e) {}
            }
            benutzt.add(o.id);
            fp.rot = fp2d(o).rot || 0;   // Lage in der 2D-Anlage gehört der 2D-Anlage
            if (fp2d(o).bild) fp.bild = fp2d(o).bild; else delete fp.bild;
            const sig = JSON.stringify(fp);
            if (JSON.stringify(o.pneu && o.pneu.fp) !== sig) {
                o.pneu = o.pneu || {}; o.pneu.fp = JSON.parse(sig); symbol2D(o);
                // Rolle an eine andere Stelle des Hubs gesetzt: Ventil wandert mit
                if (rolleAlt !== null && rolleAlt !== rollenSchluessel(fp) && rolleAnZylinder(o, F)) { try { updateObjTransform(o); } catch (e) {} }
            }
            if (t.bez && o.normLabel !== t.bez) { kennNach2D(o, t); symbol2D(o); } else if (t.bez) kennNach2D(o, t);
            spiegel2D.set(o.id, { teil: t.id, sig });
        }
    }
    // Rollenventil in der 2D-Anlage: steht unter der Kolbenstange, die Rolle zeigt zur
    // Stange, an der Stelle des Hubs, an der der Nocken (Stangenende) sie überfährt.
    const rollenSchluessel = fp => fp.typ !== 'ventil' ? '' : JSON.stringify([fp.o.zyl, fp.o.pos, fp.o.zylR, fp.o.posR]);
    function rolleAnZylinder(o, F) {
        const fp = fp2d(o);
        if (fp.typ !== 'ventil') return false;
        const L = (fp.o.links === 'rolle' || fp.o.links === 'rolle_leer') && fp.o.zyl ? 'L' : (fp.o.rechts === 'rolle' || fp.o.rechts === 'rolle_leer') && fp.o.zylR ? 'R' : null;
        if (!L) return false;
        const z = F.find(q => q.id === (L === 'L' ? fp.o.zyl : fp.o.zylR)); if (!z) return false;
        const anteil = posProzent(L === 'L' ? fp.o.pos : fp.o.posR) / 100;
        const zr = ((z.rotation || 0) % 360 + 360) % 360;
        fp.rot = ((L === 'L' ? 90 : 270) + zr) % 360;
        symbol2D(o);
        // Mitte der Rolle im Symbol (2D-Pixel, ungedreht)
        const t = teilAus2D(o), w = betBreite(L === 'L' ? fp.o.links : fp.o.rechts), n = ventilStellungen(t.o).length;
        const [px, py] = punkt2D(o, L === 'L' ? -14 : n * KASTEN + 14, 20);
        void w;
        // Nocken am Stangenende, Rolle knapp unter der Stange
        const h = z.height || 30, lx = z.width * (1 + anteil) - 3, ly = h / 2 + 9;
        const c = { x: z.x + z.width / 2, y: z.y + h / 2 }, r = zr * Math.PI / 180;
        const dx = lx - z.width / 2, dy = ly - h / 2;
        const wx = c.x + dx * Math.cos(r) - dy * Math.sin(r), wy = c.y + dx * Math.sin(r) + dy * Math.cos(r);
        o.x = Math.round(wx - px); o.y = Math.round(wy - py);
        nockenSetzen(z);
        return true;
    }
    // Schaltnocken am Ende der Kolbenstange (sichtbar, sobald ein Rollenventil den Zylinder abfragt)
    function nockenSetzen(z) {
        if (!z || !z.rodEl || z.rodEl.querySelector('.f2d-nocken')) return;
        const d = z.rodEl.ownerDocument.createElement('div');
        d.className = 'f2d-nocken';
        d.style.cssText = 'position:absolute;right:-1px;top:50%;width:6px;height:13px;margin-top:-1px;background:#37474f;border-radius:1px 1px 3px 3px;pointer-events:none';
        z.rodEl.appendChild(d);
    }
    // Anschluss eines Planteils → Anschluss in der 2D-Anlage (oder null: liegt im Symbol)
    function ende2D(F, e, gast) {
        const t = teil(e.t); if (!t) return null;
        if (gast[t.id]) { const w = teil(gast[t.id]); if (w && w.o.anlage && F.some(q => q.id === w.o.anlage && q.type === 'pneu_fp')) return null; }
        const mf = F.find(q => q.type === 'manifold'), comp = F.find(q => q.type === 'compressor');
        if (t.typ === 'quelle') return mf ? [mf.id, '1'] : comp ? [comp.id, '1'] : null;
        if (t.typ === 'wartung') return e.p === '1' ? (comp ? [comp.id, '1'] : null) : (mf ? [mf.id, '1'] : null);
        if (t.typ === 'zyl_dw' || t.typ === 'zyl_ew') return t.o.anlage ? [t.o.anlage, e.p === 'S' ? '2' : '1'] : null;
        if (t.o.anlage && F.some(q => q.id === t.o.anlage)) return [t.o.anlage, e.p];
        // Teil eines 2D-Magnetventils (valve_pneu) oder seiner Drossel
        for (const [id, w] of spiegel) {
            if (w.ventil === t.id) { const v2 = F.find(q => q.id === id); if (v2) return [id, /^5/.test(t.o.wege || '') ? ({ '4': '2', '2': '4', '5': '3', '3': '5' })[e.p] || e.p : e.p]; }
            if (w.offen != null && w.teil === t.id && F.some(q => q.id === id)) return [id, e.p];
        }
        return null;
    }
    // Leitungen des Plans → Schläuche der 2D-Anlage (_fp); T-Stücke werden zu mehreren
    // Schläuchen am selben Anschluss. Was die 2D-Anlage schon selbst verschlaucht, bleibt.
    function schlaeucheNach2D(F, abgedeckt) {
        const gast = gaesteKarte();
        // Netze über T-Stücke
        const vater = {};
        const finde = k => { if (!vater[k]) vater[k] = k; while (vater[k] !== k) { vater[k] = vater[vater[k]]; k = vater[k]; } return k; };
        const eins = (a, b) => { a = finde(a); b = finde(b); if (a !== b) vater[a] = b; };
        const knot = e => { const t = teil(e.t); return t && t.typ === 'knoten'; };
        for (const l of plan.leitungen) {
            const a = l.a.t + ':' + l.a.p, b = l.b.t + ':' + l.b.p;
            vater[a] = vater[a] || a; vater[b] = vater[b] || b;
            if (knot(l.a) || knot(l.b)) eins(a, b);
        }
        const gruppen = new Map(), gLeit = new Map();
        for (const l of plan.leitungen) {
            const a = l.a.t + ':' + l.a.p;
            if (knot(l.a) && knot(l.b)) continue;
            if (istHyd(teil(l.a.t)) || istHyd(teil(l.b.t))) continue;   // Öl: Schläuche baut der Hydraulik-Abgleich
            if (!knot(l.a) && !knot(l.b)) { gruppen.set('L' + l.id, [l.a, l.b]); gLeit.set('L' + l.id, [l]); continue; }
            const g = finde(knot(l.a) ? a : l.b.t + ':' + l.b.p), liste = gruppen.get(g) || [];
            for (const e of [l.a, l.b]) if (!knot(e) && !liste.some(x => x.t === e.t && x.p === e.p)) liste.push(e);
            gruppen.set(g, liste); gLeit.set(g, (gLeit.get(g) || []).concat([l]));
        }
        const soll = [];
        const da = (A, B) => (window.pneuConnections || []).some(c => !c._broken && !c._fp && ((c.aObjId === A[0] && String(c.aPortId) === A[1] && c.bObjId === B[0] && String(c.bPortId) === B[1]) || (c.aObjId === B[0] && String(c.aPortId) === B[1] && c.bObjId === A[0] && String(c.bPortId) === A[1])));
        for (const [g, ends] of gruppen) {
            if (ends.every(e => abgedeckt.has(e.t) || ['quelle', 'wartung'].includes((teil(e.t) || {}).typ))) continue;
            const eind = [];
            for (const e of ends) {
                const x = ende2D(F, e, gast); if (!x) continue;
                const d = eind.find(y => y.k[0] === x[0] && y.k[1] === x[1]);
                if (d) d.e.push(e); else eind.push({ k: x, e: [e] });
            }
            // Stern vom Verteiler/Kompressor aus, sonst vom ersten Anschluss
            eind.sort((x, y) => { const r = q => { const o = F.find(z => z.id === q.k[0]); return o && (o.type === 'manifold' || o.type === 'compressor') ? 0 : 1; }; return r(x) - r(y); });
            for (let i = 1; i < eind.length; i++) {
                // Leitungen des Plans hinter diesem Schlauch (zum Löschen aus der 2D-Anlage)
                const ls = g.startsWith('L') ? gLeit.get(g).map(l => l.id)
                    : gLeit.get(g).filter(l => eind[i].e.some(e => (l.a.t === e.t && l.a.p === e.p) || (l.b.t === e.t && l.b.p === e.p))).map(l => l.id);
                if (!da(eind[0].k, eind[i].k)) soll.push([eind[0].k, eind[i].k, ls]);
            }
        }
        const key = (A, B) => [A.join(':'), B.join(':')].sort().join('|');
        const sollK = new Set(soll.map(([A, B]) => key(A, B)));
        const C = window.pneuConnections = window.pneuConnections || [];
        let anders = false;
        for (let i = C.length - 1; i >= 0; i--) if (C[i]._fp && !sollK.has(key([C[i].aObjId, String(C[i].aPortId)], [C[i].bObjId, String(C[i].bPortId)]))) { C.splice(i, 1); anders = true; }
        const ist = new Set(C.filter(c => c._fp).map(c => key([c.aObjId, String(c.aPortId)], [c.bObjId, String(c.bPortId)])));
        for (const [A, B] of soll) if (!ist.has(key(A, B))) { C.push({ aObjId: A[0], aPortId: A[1], bObjId: B[0], bPortId: B[1], _fp: true }); ist.add(key(A, B)); anders = true; }
        schlauchLeit = new Map(soll.map(([A, B, ls]) => [key(A, B), ls]));
        if (anders) try { if (typeof window.drawPneumaticHoses === 'function') window.drawPneumaticHoses(); } catch (e) {}
    }
    let schlauchLeit = new Map();   // Schlüssel des Schlauchs → Leitungen im Plan
    const schlauchKey = c => [c.aObjId + ':' + c.aPortId, c.bObjId + ':' + c.bPortId].sort().join('|');
    // Anschluss in der 2D-Anlage → Anschluss im verbundenen Plan
    function planEnde(F, oid, port) {
        const o = F.find(q => q.id === oid); if (!o) return null;
        port = String(port);
        const mit = f => plan.teile.find(f);
        if (o.type === 'pneu_fp') { const t = mit(q => q.o && q.o.anlage === o.id); return t ? { t: t.id, p: port } : null; }
        if (/^zylinder_/.test(o.type) || o.type === 'gate_pneu') { const t = mit(q => (q.typ === 'zyl_dw' || q.typ === 'zyl_ew') && q.o.anlage === o.id); return t ? { t: t.id, p: port === '2' ? 'S' : 'K' } : null; }
        if (o.type === 'manifold') { const w = mit(q => q.typ === 'wartung'); if (w) return { t: w.id, p: '2' }; const q = mit(x => x.typ === 'quelle'); return q ? { t: q.id, p: '1' } : null; }
        if (o.type === 'compressor') { const q = mit(x => x.typ === 'quelle'); return q ? { t: q.id, p: '1' } : null; }
        const w = spiegel.get(o.id); if (!w) return null;
        if (w.ventil) { const vt = teil(w.ventil); return vt ? { t: vt.id, p: /^5/.test(vt.o.wege || '') ? ({ '4': '2', '2': '4', '5': '3', '3': '5' })[port] || port : port } : null; }
        if (w.offen != null) return { t: w.teil, p: port };
        return null;
    }
    // 2D-Teil → Optionen des Planteils (Rollen zeigen wieder auf Planzylinder)
    function oAus2D(fp) {
        const o = Object.assign({}, (TYP[fp.typ] || {}).optionen, fp.o || {});
        for (const k of ['zyl', 'zylR']) if (o[k]) { const z = plan.teile.find(q => (q.typ === 'zyl_dw' || q.typ === 'zyl_ew') && q.o.anlage === o[k]); o[k] = z ? z.id : ''; }
        return o;
    }
    const ohneRot = sig => { try { const f = JSON.parse(sig); delete f.rot; delete f.bild; return JSON.stringify(f); } catch (e) { return sig; } };
    // Änderungen an Fluidplan-Teilen und Schläuchen der 2D-Anlage → Plan
    function rueck2D(F, neu) {
        let masse = false;
        for (const [id, w] of spiegel2D) {
            const o = F.find(q => q.id === id), t = teil(w.teil);
            if (!t) { spiegel2D.delete(id); continue; }
            if (!o) {
                // in der 2D-Anlage gelöscht
                spiegel2D.delete(id); masse = true;
                neu.push(() => {
                    const gast = gaesteKarte(), weg = new Set([t.id].concat(Object.keys(gast).filter(g => gast[g] === t.id)));
                    plan.teile = plan.teile.filter(q => !weg.has(q.id));
                    plan.leitungen = plan.leitungen.filter(l => !weg.has(l.a.t) && !weg.has(l.b.t));
                    plan.erzeugt = (plan.erzeugt || []).filter(x => x !== id);
                });
                continue;
            }
            const jetzt = JSON.stringify(fp2d(o));
            if (ohneRot(jetzt) === ohneRot(w.sig)) continue;
            w.sig = jetzt; masse = true;
            const fp = JSON.parse(jetzt);
            neu.push(() => {
                t.typ = fp.typ; const anlage = t.o.anlage; t.o = oAus2D(fp); t.o.anlage = anlage;
                if (t.typ === 'ventil') for (const p of geo(t).ports) if (p.art === 'r') abschlussSetzen(t, p.id, (fp.ab || {})[p.id] || { art: 'offen' });
            });
        }
        // neue Fluidplan-Teile, in der 2D-Anlage gesetzt
        for (const o of F) {
            if (o.type !== 'pneu_fp' || spiegel2D.has(o.id) || plan.teile.some(q => q.o && q.o.anlage === o.id)) continue;
            masse = true;
            const fp = JSON.parse(JSON.stringify(fp2d(o)));
            spiegel2D.set(o.id, { teil: null, sig: JSON.stringify(fp) });
            neu.push(() => {
                let b = [Infinity, -Infinity, -Infinity]; for (const q of plan.teile) { const w2 = boxWelt(q); b = [Math.min(b[0], w2[1]), Math.max(b[1], w2[2]), Math.max(b[2], w2[3])]; }
                const x = isFinite(b[1]) ? snap(b[1] + 80) : 0, y = isFinite(b[0]) ? snap(b[0] + 40) : 0;
                const t = { id: neueId(), typ: fp.typ, x, y, rot: 0, bez: o.normLabel || bezFuer(fp.typ, fp.o), o: oAus2D(fp) };
                t.o.anlage = o.id; plan.teile.push(t); (plan.erzeugt = plan.erzeugt || []).push(o.id);
                spiegel2D.get(o.id).teil = t.id;
                if (t.typ === 'ventil') for (const p of geo(t).ports) if (p.art === 'r' && (fp.ab || {})[p.id]) abschlussSetzen(t, p.id, fp.ab[p.id]);
            });
        }
        // Schläuche: abgezogen/gelöscht → Leitung weg; neu gesteckt → Leitung neu
        const C = window.pneuConnections || [];
        const da = new Set(C.filter(c => c._fp).map(schlauchKey));
        for (const [k, ls] of [...schlauchLeit]) {
            if (da.has(k)) continue;
            schlauchLeit.delete(k); masse = true;
            neu.push(() => { plan.leitungen = plan.leitungen.filter(l => !ls.includes(l.id)); });
        }
        for (const c of C) {
            if (c._fp || c._auto || c._broken) continue;
            const a = F.find(q => q.id === c.aObjId), b2 = F.find(q => q.id === c.bObjId);
            const frei = q => q && (q.type === 'pneu_fp' || ((/^zylinder_/.test(q.type)) && !F.some(v => v.type === 'valve_pneu' && v.targetCylinderId === q.id)));
            if (!frei(a) && !frei(b2)) continue;
            const A = planEnde(F, c.aObjId, c.aPortId), B = planEnde(F, c.bObjId, c.bPortId);
            if (!A || !B) continue;
            c._fp = true; masse = true;
            const k = schlauchKey(c), lid = neueId();
            schlauchLeit.set(k, [lid]);
            neu.push(() => { plan.leitungen.push({ id: lid, a: A, b: B }); });
        }
        return masse;
    }
    // Umgekehrt: vorhandene 2D-Pneumatik als Startplan übernehmen
    // Plan aus der Pneumatik der 2D-Anlage (für „⇐ Aus 2D-Anlage“ und den Schattenplan).
    // karte: je 2D-Zylinder { zyl, ventil, drv: {ext, ret}, seite: {ext: [Leitungen], ret: [...]} }
    function planAus2D(F, zyl, comp, ab, fpListe) {
        const teile = [], leitungen = [], karte = {}, karte2 = {};
        const nid = () => neueId();
        const q = { id: nid(), typ: 'quelle', x: 0, y: 360, rot: 0, bez: (comp && comp.normLabel) || '', o: Object.assign({}, TYP.quelle.optionen, { p: comp && comp.pressure || 6 }) };
        teile.push(q);
        const L = (a, ap, b, bp) => { const l = { id: nid(), a: { t: a, p: ap }, b: { t: b, p: bp } }; leitungen.push(l); return l.id; };
        const versorgung = [];
        // Wartungseinheit der 2D-Anlage (Verteiler): Kurzform im Bild, rechnet wie eine Leitung
        const mf = F.find(q2 => q2.type === 'manifold');
        const wa = mf ? { id: nid(), typ: 'wartung', x: 0, y: 360, rot: 0, bez: mf.normLabel || '', o: Object.assign({}, TYP.wartung.optionen, { kurz: true, durch: true, p: comp && comp.pressure || 6 }) } : null;
        if (wa) teile.push(wa);
        const vsrc = wa ? [wa.id, '2'] : [q.id, '1'];
        zyl.forEach((o, i) => {
            const dw = o.type === 'zylinder_double', x = 140 + i * 260, nr = i + 1;
            const v = F.find(q2 => q2.type === 'valve_pneu' && q2.targetCylinderId === o.id);
            const zt = { id: nid(), typ: dw ? 'zyl_dw' : 'zyl_ew', x, y: -40, rot: 0, bez: o.normLabel || '',
                o: Object.assign({}, TYP[dw ? 'zyl_dw' : 'zyl_ew'].optionen, { d: o.pistonD || 20, dStange: o.rodD || (dw ? 8 : 6), hub: o.stroke || 100, anlage: o.id }) };
            if (!v) {
                // Zylinder an freien Schläuchen (Ventile als Fluidplan-Teile)
                teile.push(zt);
                karte[o.id] = { zyl: zt.id, ventil: null, ventil2d: null, drv: {}, seite: { ext: [], ret: [] } };
                return;
            }
            const wege = !dw ? '3/2' : (v && v.isTriple) ? '5/3' : '5/2';
            const doppelt = v && v.isDouble;
            const vt = { id: nid(), typ: 'ventil', x: x - 20, y: 200, rot: 0, bez: (v && v.normLabel) || '',
                o: Object.assign({}, TYP.ventil.optionen, { wege, links: 'magnet', rechts: doppelt ? 'magnet' : 'feder', varL: o.linkedVarExt || o.linkedVar || '', varR: doppelt ? (o.linkedVarRet || '') : '' }) };
            // Sauberes Bild: Der Ventilanschluss zur Kolbenseite steht genau unter Anschluss K,
            // die Drosseln stehen aufrecht senkrecht unter ihrem Zylinderanschluss.
            const zgeo = TYP[zt.typ].geometrie(zt), vgeo = TYP.ventil.geometrie(vt);
            const zpx = pid => x + zgeo.ports.find(p => p.id === pid).x;
            const vK = vgeo.ports.find(p => p.id === (dw ? '4' : '2'));
            if (vK) vt.x = zpx('K') - vK.x;
            // Quelle senkrecht unter dem Anschluss 1 des ersten Ventils
            const v1 = vgeo.ports.find(p => p.id === '1');
            if (i === 0 && v1) { q.x = vt.x + v1.x; q.y = 330; }
            teile.push(zt, vt);
            versorgung.push(L(vsrc[0], vsrc[1], vt.id, '1'));
            const k = karte[o.id] = { zyl: zt.id, ventil: vt.id, ventil2d: v ? v.id : null, drv: {}, seite: { ext: [], ret: [] } };
            const thr = rolle => F.find(q2 => q2.type === 'throttle' && q2.targetCylinderId === o.id && q2.role === rolle);
            // Abluftdrosselung: Drossel der Ausfahrbewegung sitzt in der Stangenseite.
            // seite: Leitungen der Kammer, die die jeweilige Bewegung antreibt (2D: Schlauch ab)
            // Schlauch in der 2D-Anlage abgezogen: Leitung zum Zylinder fehlt, beide Enden blasen ab
            const los = antrieb => !!(ab && ab[o.id] && ab[o.id][antrieb]);
            const zuweg = (vp, zp, th, rolle, antrieb) => {
                if (!th) { if (!los(antrieb)) k.seite[antrieb].push(L(vt.id, vp, zt.id, zp)); return; }
                // rot 180: Anschluss 1 oben zum Zylinder, 2 unten zum Ventil
                const d = { id: nid(), typ: 'drv', x: zpx(zp), y: 100, rot: 180, bez: th.normLabel || '', o: Object.assign({}, TYP.drv.optionen, { offen: drosselAus2D(th.opening || 6) }) };
                teile.push(d); k.drv[rolle] = { id: d.id, th: th.id };
                k.seite[antrieb].push(L(vt.id, vp, d.id, '2'));
                if (!los(antrieb)) k.seite[antrieb].push(L(d.id, '1', zt.id, zp));
            };
            if (dw) { zuweg('4', 'K', thr('ret'), 'ret', 'ext'); zuweg('2', 'S', thr('ext'), 'ext', 'ret'); }
            else zuweg('2', 'K', thr('ext'), 'ext', 'ext');
            // Abschlüsse der Abluftanschlüsse (Schalldämpfer, Blindstopfen …) aus der 2D-Anlage
            if (v && v.abschluss) for (const pid of ['3', '5']) {
                const n = v.abschluss[pid] && abschlussBauen(vt, planAbluft(vt, pid), v.abschluss[pid], nid);
                if (n) { teile.push(n.t); leitungen.push(n.l); }
            }
        });
        if (wa) {
            // Quelle links neben der Wartungseinheit, deren Ausgang unter dem ersten Ventil
            wa.x = q.x - 60; wa.y = q.y; q.x = wa.x - 80; q.rot = 90;
            L(q.id, '1', wa.id, '1');
        }
        // Fluidplan-Teile der 2D-Anlage (pneu_fp) und ihre Schläuche
        const fpo = fpListe || [];
        fpo.forEach((o, i) => {
            const fp = fp2d(o), T = TYP[fp.typ]; if (!T) return;
            const oo = Object.assign({}, T.optionen, JSON.parse(JSON.stringify(fp.o || {})));
            for (const k of ['zyl', 'zylR']) if (oo[k]) oo[k] = karte[oo[k]] ? karte[oo[k]].zyl : '';
            const t = { id: nid(), typ: fp.typ, x: 140 + zyl.length * 260 + (i % 4) * 140, y: 60 + Math.floor(i / 4) * 140, rot: 0, bez: o.normLabel || '', o: oo };
            teile.push(t); karte2[o.id] = t.id;
            for (const pid of Object.keys(fp.ab || {})) { const n = abschlussBauen(t, pid, fp.ab[pid], nid); if (n) { teile.push(n.t); leitungen.push(n.l); } }
        });
        if (fpo.length) {
            const fpIds = new Set(fpo.map(o => o.id));
            const ende = (oid, port) => {
                port = String(port);
                if (karte2[oid]) return [karte2[oid], port];
                const o = F.find(x => x.id === oid); if (!o) return null;
                if (karte[oid]) return [karte[oid].zyl, port === '2' ? 'S' : '1' === port ? 'K' : 'K'];
                if (o.type === 'manifold') return wa ? [wa.id, '2'] : [q.id, '1'];
                if (o.type === 'compressor') return [q.id, '1'];
                if (o.type === 'valve_pneu' && karte[o.targetCylinderId] && karte[o.targetCylinderId].ventil) {
                    const vt = teile.find(x => x.id === karte[o.targetCylinderId].ventil);
                    return [vt.id, /^5/.test(vt.o.wege || '') ? ({ '4': '2', '2': '4', '5': '3', '3': '5' })[port] || port : port];
                }
                if (o.type === 'throttle' && karte[o.targetCylinderId] && karte[o.targetCylinderId].drv[o.role]) return [karte[o.targetCylinderId].drv[o.role].id, port];
                return null;
            };
            const gesehenL = new Set();
            for (const c of window.pneuConnections || []) {
                if (c._broken) continue;
                const frei = id => fpIds.has(id) || (karte[id] && !karte[id].ventil);
                if (!frei(c.aObjId) && !frei(c.bObjId)) continue;
                const A = ende(c.aObjId, c.aPortId), B = ende(c.bObjId, c.bPortId);
                if (!A || !B) continue;
                const k = [A.join(':'), B.join(':')].sort().join('|'); if (gesehenL.has(k)) continue; gesehenL.add(k);
                L(A[0], A[1], B[0], B[1]);
            }
            fpAnordnen(teile, leitungen, new Set(Object.values(karte2)), q, wa);
        }
        // Kennzeichen aus der 2D-Anlage (-MM1, -QM1, -RN1 …); fehlende und doppelte neu vergeben
        const gesehen = new Set();
        teile.forEach(t => { if (!/^-[A-Z]+\d+$/.test(t.bez || '') || gesehen.has(t.bez)) t.bez = ''; else gesehen.add(t.bez); });
        kennzeichenAuffrischen({ teile });
        return { teile, leitungen, karte, karte2, quelle: q.id, versorgung };
    }
    // Fluidplan-Teile aus der 2D-Anlage wie im Schaltplan anordnen: Zylinder oben, darunter Schicht
    // für Schicht, was an ihnen hängt (Drosseln, Stellglied, Signalglieder), jedes Teil senkrecht
    // unter dem Anschluss, an dem es hängt; die Versorgung ganz unten.
    function fpAnordnen(teile, leitungen, frei, q, wa) {
        const T = id => teile.find(t => t.id === id);
        const welt = (t, pid) => { const p = geo(t).ports.find(x => x.id === pid); if (!p) return null; const [x, y] = trafo(t, p.x, p.y); return { x, y, dir: trafoDir(t, p.dir) || [0, 0] }; };
        const nachbarn = id => leitungen.filter(l => l.a.t === id || l.b.t === id).map(l => l.a.t === id ? { mein: l.a.p, t: l.b.t, p: l.b.p } : { mein: l.b.p, t: l.a.t, p: l.a.p });
        const gesetzt = new Set(teile.filter(t => (t.typ === 'zyl_dw' || t.typ === 'zyl_ew' || t.typ === 'schwenk') && !frei.has(t.id)).map(t => t.id));
        const reihe = [...gesetzt];
        const belegt = [];
        teile.forEach(t => { if (gesetzt.has(t.id)) belegt.push(boxWelt(t)); });
        const ueberlappt = b => belegt.some(w => b[0] < w[2] + 12 && b[2] > w[0] - 12 && b[1] < w[3] + 8 && b[3] > w[1] - 8);
        let unten = -Infinity;
        while (reihe.length) {
            const pid = reihe.shift(), par = T(pid);
            // Kinder links nach rechts nach der Lage ihres Elternanschlusses
            const kinder = nachbarn(pid).filter(n => frei.has(n.t) && !gesetzt.has(n.t)).map(n => Object.assign(n, { w: welt(par, n.mein) })).filter(n => n.w).sort((a, b) => a.w.x - b.w.x);
            for (const n of kinder) {
                if (gesetzt.has(n.t)) continue;
                const t = T(n.t); if (!t) continue;
                // Anschluss zum Elternteil soll nach oben zeigen (0° oder 180°)
                t.x = 0; t.y = 0; t.rot = 0;
                let w = welt(t, n.p); if (w && w.dir[1] > 0) { t.rot = 180; w = welt(t, n.p); }
                if (!w) continue;
                t.x = snap(n.w.x - w.x); t.y = snap(n.w.y + 50 - w.y);
                let b = boxWelt(t), k = 0;
                while (ueberlappt(b) && k++ < 30) { t.x += 20 * (k % 2 ? k : -k); b = boxWelt(t); }
                belegt.push(b); gesetzt.add(t.id); reihe.push(t.id); unten = Math.max(unten, b[3]);
            }
        }
        // Versorgung unter allen Teilen; Ausgang unter dem Anschluss 1 des ersten versorgten Teils
        if (unten > -Infinity) {
            const src = wa || q, sp = wa ? '2' : '1';
            const ziel = nachbarn(src.id).map(n => ({ t: T(n.t), p: n.p })).find(n => n.t && frei.has(n.t.id));
            const y0 = snap(unten + 70);
            if (q.y < y0) q.y = y0;
            if (wa) { wa.y = q.y; }
            if (ziel) {
                const w = welt(ziel.t, ziel.p);
                if (w) { if (wa) { const g2 = welt(wa, '2'); wa.x = snap(wa.x + (w.x - g2.x) - 40); q.x = wa.x - 80; q.y = wa.y; } else { const g1 = welt(q, '1'); q.x = snap(q.x + (w.x - g1.x) - 60); } }
            }
            void sp;
        }
    }
    function ausAnlage() {
        const F = fabrik(); if (!F) return 0;
        const zyl = F.filter(o => (o.type === 'zylinder_double' || o.type === 'zylinder_single') && o.hasPneumatics);
        if (!zyl.length && F.some(o => o.type === 'hydraulic_unit') && hydZylinder(F).length) return ausAnlageHyd(F);
        if (!zyl.length) { status('In der 2D-Anlage gibt es keinen Zylinder mit Pneumatik oder Hydraulik.'); return 0; }
        // Pneumatik und Hydraulik in derselben 2D-Anlage: beide kommen in den Plan, die Hydraulik rechts daneben
        const hz = F.some(o => o.type === 'hydraulic_unit') ? hydZylinder(F) : [];
        if (plan.teile.length && !W().confirm(`Der Fluidplan wird durch die ${hz.length ? 'Pneumatik und Hydraulik' : 'Pneumatik'} der 2D-Anlage ersetzt. Weiter?`)) return 0;
        if (hz.length) hydSpiegel.clear();
        aendern(() => {
            const r = planAus2D(F, zyl, F.find(o => o.type === 'compressor'), null, F.filter(o => o.type === 'pneu_fp'));
            // Fluidplan-Teile der 2D-Anlage gehören jetzt zum Plan
            r.teile.forEach(t => { for (const id in r.karte2) if (r.karte2[id] === t.id) t.o.anlage = id; });
            // Reed-Schalter der 2D-Zylinder werden Endlagensensoren im Plan (sonst
            // würde der Abgleich sie in der 2D-Anlage wieder entfernen)
            zyl.forEach(o => {
                const k = r.karte[o.id], t = k && r.teile.find(q => q.id === k.zyl);
                if (!t) return;
                const R = reeds2D(o, F);
                t.o.sensH = R.H ? R.H.var : ''; t.o.sensV = R.V ? R.V.var : '';
            });
            plan.teile = r.teile; plan.leitungen = r.leitungen; plan.erzeugt = []; plan.anlage = true;
            if (hz.length) {
                const h = planAusHyd2D(F, hz);
                let maxX = -Infinity; for (const t of plan.teile) maxX = Math.max(maxX, boxWelt(t)[2]);
                let minX = Infinity; for (const t of h.plan.teile) minX = Math.min(minX, t.x - 80);
                const dx = isFinite(maxX) && isFinite(minX) ? snap(maxX + 160 - minX) : 0;
                h.plan.teile.forEach(t => { t.x += dx; });
                hz.forEach(o => {
                    const k = h.karte[o.id], t = k && h.plan.teile.find(q => q.id === k.zyl);
                    if (!t) return;
                    const R = reeds2D(o, F);
                    t.o.sensH = R.H ? R.H.var : ''; t.o.sensV = R.V ? R.V.var : '';
                });
                plan.teile = plan.teile.concat(h.plan.teile); plan.leitungen = plan.leitungen.concat(h.plan.leitungen);
                F.filter(istMess2D).forEach(m => { if ((m.role || 'P') === 'P' || hz.some(o => o.id === m.targetCylinderId)) hydMessNeu(m); });
            }
        });
        einpassen();
        return zyl.length + hz.length;
    }

    // Hydraulik der 2D-Anlage als Plan übernehmen und verbinden
    function ausAnlageHyd(F) {
        const zyl = hydZylinder(F);
        if (plan.teile.length && !W().confirm('Der Fluidplan wird durch die Hydraulik der 2D-Anlage ersetzt. Weiter?')) return 0;
        hydSpiegel.clear();
        aendern(() => {
            const r = planAusHyd2D(F, zyl);
            zyl.forEach(o => {
                const k = r.karte[o.id], t = k && r.plan.teile.find(q => q.id === k.zyl);
                if (!t) return;
                const R = reeds2D(o, F);
                t.o.sensH = R.H ? R.H.var : ''; t.o.sensV = R.V ? R.V.var : '';
            });
            plan.teile = r.plan.teile; plan.leitungen = r.plan.leitungen; plan.erzeugt = []; plan.anlage = true;
            F.filter(istMess2D).forEach(m => { if ((m.role || 'P') === 'P' || zyl.some(o => o.id === m.targetCylinderId)) hydMessNeu(m); });
        });
        einpassen();
        return zyl.length;
    }

    // ------------------------------------------------------------
    // Schattenplan: Die Pneumatik der 2D-Anlage läuft mit diesem Rechenkern,
    // auch ohne sichtbaren Fluidplan (eine Wahrheit). VALIS baut dafür unsichtbar
    // denselben Plan wie „⇐ Aus 2D-Anlage“ und stellt die Ventile nach der 2D-Anlage.
    // ------------------------------------------------------------
    let schatten = null, schattenLauf = false;
    function mitPlan(p, s, fn) {
        const ap = plan, as = sim;
        plan = p; sim = s; schattenLauf = true;
        try { return fn(); } finally { const ns = sim; plan = ap; sim = as; schattenLauf = false; if (schatten && schatten.plan === p) schatten.sim = ns; }
    }
    const pneuAb = (a, ap, b, bp) => {
        if (!a || !b) return false;
        const m = (window.pneuConnections || []).filter(c =>
            (c.aObjId === a.id && String(c.aPortId) === ap && c.bObjId === b.id && String(c.bPortId) === bp) ||
            (c.aObjId === b.id && String(c.aPortId) === bp && c.bObjId === a.id && String(c.bPortId) === ap));
        return m.length > 0 && m.every(c => c._broken);
    };
    function schattenZylinder(F) {
        const eigen = plan.anlage ? new Set(plan.teile.filter(t => t.o && t.o.anlage).map(t => t.o.anlage)) : new Set();
        return F.filter(o => (o.type === 'zylinder_double' || o.type === 'zylinder_single') && o.hasPneumatics && !eigen.has(o.id)
            && (F.some(v => v.type === 'valve_pneu' && v.targetCylinderId === o.id)
                || (window.pneuConnections || []).some(c => !c._broken && (c.aObjId === o.id || c.bObjId === o.id))));
    }
    function schattenFp(F) {
        const eigen = plan.anlage ? new Set(plan.teile.filter(t => t.o && t.o.anlage).map(t => t.o.anlage)) : new Set();
        return F.filter(o => o.type === 'pneu_fp' && !eigen.has(o.id));
    }
    function schattenTakt(dt) {
        const F = fabrik(); if (!F) return;
        const zyl = schattenZylinder(F);
        if (!zyl.length) { schatten = null; return; }
        const comp = F.find(o => o.type === 'compressor');
        const mf = F.find(o => o.type === 'manifold');
        // Aufbau-Schlüssel: ändert er sich, wird der Schattenplan neu gebaut
        const lage = o => {
            const v = F.find(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id);
            const tE = F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === 'ext');
            const tR = F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === 'ret');
            const ab = (vp, th, cp) => th ? (pneuAb(v, vp, th, '2') || pneuAb(th, '1', o, cp)) : pneuAb(v, vp, o, cp);
            return [o.id, o.type, o.pistonD, o.rodD, o.stroke, v && v.id, v && v.isDouble, v && v.isTriple, tE && tE.id, tR && tR.id,
                // Abluftdrosselung: doppeltwirkend sitzt ext in der Stangenleitung (2D-Ventil 4)
                ab('2', o.type !== 'zylinder_single' ? tR : tE, '1'), o.type !== 'zylinder_single' && ab('4', tE, '2'), (o.leakRate || 0) > 0, v && (v.leakRate || 0) > 0, v && JSON.stringify(v.abschluss || null)].join(',');
        };
        const versorgungAb = pneuAb(comp, '1', mf, '1') || zyl.some(o => pneuAb(mf, '1', F.find(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id), '1'));
        const fpo = schattenFp(F);
        const fpSig = fpo.map(o => o.id + JSON.stringify(o.pneu && o.pneu.fp && Object.assign({}, o.pneu.fp, { rot: 0, bild: 0 }))).join(';') + '#'
            + (fpo.length ? (window.pneuConnections || []).filter(c => !c._broken).map(c => schlauchKey(c)).sort().join(',') : '');
        const sig = (comp ? comp.id : '-') + '|' + versorgungAb + '|' + zyl.map(lage).join('|') + '|' + fpSig;
        const neu = !schatten || schatten.sig !== sig;
        if (neu) {
            const abK = {};
            const fehlerVorher = [];
            zyl.forEach(o => {
                const v = F.find(q => q.type === 'valve_pneu' && q.targetCylinderId === o.id);
                const tE = F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === 'ext');
                const tR = F.find(q => q.type === 'throttle' && q.targetCylinderId === o.id && q.role === 'ret');
                const ab = (vp, th, cp) => th ? (pneuAb(v, vp, th, '2') || pneuAb(th, '1', o, cp)) : pneuAb(v, vp, o, cp);
                const dw = o.type !== 'zylinder_single';
                abK[o.id] = { ext: ab('2', dw ? tR : tE, '1'), ret: dw && ab('4', tE, '2') };
                fehlerVorher.push([o, v]);
            });
            const r = planAus2D(F, zyl, comp, abK, fpo);
            const p = { v: 2, teile: r.teile, leitungen: r.leitungen, fehler: {} };
            // Undichte Kolbendichtung und Ventile der 2D-Anlage als Fehler im Schattenplan
            fehlerVorher.forEach(([o, v]) => {
                const k = r.karte[o.id];
                if ((o.leakRate || 0) > 0) p.fehler[k.zyl] = 'dichtung';
                if (v && (v.leakRate || 0) > 0) p.fehler[k.ventil] = 'leck';
            });
            schatten = { plan: p, sim: null, sig, karte: r.karte, fp2d: r.karte2, quelle: r.quelle, versorgungAb };
        }
        const S = schatten;
        // Werte, die sich ohne Umbau ändern: Netzdruck, Drosseln, Ventilstellungen
        const q = S.plan.teile.find(t => t.id === S.quelle);
        let p = comp ? (comp.pressure || 6) : 0;
        try { if (comp && typeof window._pneuNetzAktiv === 'function' && window._pneuNetzAktiv(comp) && comp._pNetz != null) p = comp._pNetz; } catch (e) {}
        if (S.versorgungAb) p = 0;
        q.o.p = Math.max(0, p);
        for (const o of zyl) {
            const k = S.karte[o.id]; if (!k) continue;
            for (const rolle of ['ext', 'ret']) {
                const d = k.drv[rolle]; if (!d) continue;
                const th = F.find(x => x.id === d.th), t = S.plan.teile.find(x => x.id === d.id);
                if (th && t) t.o.offen = drosselAus2D(th.opening != null ? th.opening : 100);
            }
            const v = F.find(x => x.id === k.ventil2d), vt = S.plan.teile.find(x => x.id === k.ventil);
            if (v && vt) vt.o._stellung = (v.isTriple && v.valveState === 'center') ? 1 : v.isActive ? 0 : (v.isTriple ? 2 : 1);
        }
        mitPlan(S.plan, S.sim, () => {
            if (!sim) {
                // Start: Stellungen aus der 2D-Anlage, Leitungen bei stehendem Kolben füllen
                simInit();
                const lage0 = () => { for (const o of zyl) { const k = S.karte[o.id], t = plan.teile.find(x => x.id === k.zyl), z = sim.zust[k.zyl]; z.x = (o.extension || 0) / 100 * zylHub(t); z.v = 0; } };
                lage0(); for (let i = 0; i < 25; i++) { simSchritt(0.02); lage0(); }
            }
            simSchritt(Math.min(0.1, dt));
        });
    }
    // 2D-Zylinder, den der Schattenplan bewegt: Stellung in % (oder null)
    function schattenZiel(obj) {
        if (!schatten || !schatten.sim) return null;
        const k = schatten.karte[obj.id]; if (!k) return null;
        const t = schatten.plan.teile.find(x => x.id === k.zyl), z = schatten.sim.zust[k.zyl];
        if (!t || !z) return null;
        return { ziel: z.x / zylHub(t) * 100, v: Math.abs(z.v) / zylHub(t) * (obj.stroke || 100) };
    }


    // ------------------------------------------------------------
    // Hydraulik-Schattenplan: Die Hydraulik der 2D-Anlage (Aggregat, Wegeventile,
    // Drosseln, Rückschlagventile, Speicher, Zylinder mit Last) rechnet mit diesem
    // Rechenkern, wie die Pneumatik (eine Wahrheit). Die Live-Werte für Anzeigen,
    // Lektionen und valisBruecke (hydP, hydPA, hydKraft, hydTemp …) kommen von hier.
    // ------------------------------------------------------------
    let hschatten = null;
    const hydAktor2D = o => o && o.hasHydraulics && (o.type === 'zylinder_double' || o.type === 'zylinder_single');
    function hydZylinder(F) {
        return F.filter(o => hydAktor2D(o) && F.some(v => v.type === 'valve_hyd' && v.targetCylinderId === o.id));
    }
    // Läuft der Hydraulik-Schattenplan? Dann rechnet die alte 2D-Hydraulik nicht mehr.
    window._fpHydSchatten = function () {
        if (window._fpOhneHydSchatten || !simLaeuft()) return false;
        const F = fabrik(); if (!F) return false;
        if (F.some(o => o.hasHydraulics && o.type === 'gate_pneu')) return false;   // Tor: alte Rechnung
        if (hydEigen(F).length) return true;   // sichtbarer, verbundener Hydraulikplan rechnet
        return !!F.find(o => o.type === 'hydraulic_unit') && hydZylinder(F).length > 0;
    };
    function planAusHyd2D(F, zyl) {
        const teile = [], leitungen = [], karte = {}, nid = () => neueId();
        const unit = F.find(o => o.type === 'hydraulic_unit');
        const H = Object.assign({}, { hyd: true });
        const L = (a, ap, b, bp) => { const l = { id: nid(), a: { t: a, p: ap }, b: { t: b, p: bp } }; leitungen.push(l); return l.id; };
        const ag = { id: nid(), typ: 'aggregat', x: 0, y: 400, rot: 0, bez: unit.normLabel || '', o: Object.assign({}, TYP.aggregat.optionen, H, { q: unit.maxFlow || 20, p: unit.pressure || 100, anlage: unit.id }) };
        // Tank gleich neben dem Aggregat (in 2D steckt er im Aggregat), mit Kennzeichen
        const tk = { id: nid(), typ: 'tank', x: 90, y: 460, rot: 0, bez: '-CLA1', o: Object.assign({}, TYP.tank.optionen, H) };
        teile.push(ag, tk);
        const cfg = o => o.hyd || {};
        F.filter(o => o.type === 'accumulator_hyd').forEach((a, i) => {
            const h = cfg(a), pD = unit.pressure || 100;
            const t = { id: nid(), typ: 'speicher', x: -120 - i * 60, y: 360, rot: 0, bez: a.normLabel || '', o: Object.assign({}, TYP.speicher.optionen, H, { V0: Math.max(0.05, Number(h.volumen) || 1), p0: Math.max(1, Math.min(pD * 0.95, Number(h.vordruck) || Math.round(pD * 0.6))), anlage: a.id }) };
            teile.push(t); L(ag.id, 'P', t.id, '1'); karte['sp:' + a.id] = t.id;
        });
        zyl.forEach((o, i) => {
            const dw = o.type === 'zylinder_double', x = 140 + i * 340;
            const v = F.find(q => q.type === 'valve_hyd' && q.targetCylinderId === o.id);
            const zt = { id: nid(), typ: dw ? 'zyl_dw' : 'zyl_ew', x, y: -40, rot: 0, bez: o.normLabel || '',
                o: Object.assign({}, TYP[dw ? 'zyl_dw' : 'zyl_ew'].optionen, H, { d: o.pistonD || 20, dStange: o.rodD || (dw ? 8 : 6), hub: o.stroke || 100, anlage: o.id,
                    last: Math.max(0, Number(cfg(o).last) || 0), lastArt: cfg(o).lastArt || 'presse', lastAb: Math.max(0, Number(cfg(o).lastAb) || 0) }) };
            const wege = !dw ? '3/2' : v.isTriple ? '4/3' : '4/2';
            const vt = { id: nid(), typ: 'ventil', x, y: 200, rot: 0, bez: v.normLabel || '',
                o: Object.assign({}, TYP.ventil.optionen, H, { wege, mitte: 'gesperrt', links: 'magnet', rechts: v.isDouble || v.isTriple ? 'magnet' : 'feder', varL: o.linkedVarExt || o.linkedVar || '', varR: dw && (v.isDouble || v.isTriple) ? o.linkedVarRet || '' : '', anlage: v.id }) };
            teile.push(zt, vt);
            L(ag.id, 'P', vt.id, '1'); L(vt.id, '3', tk.id, '1');
            const k = karte[o.id] = { zyl: zt.id, ventil: vt.id, ventil2d: v.id, sr: {}, rv: {} };
            const thr = r => F.find(q => q.type === 'throttle_hyd' && q.targetCylinderId === o.id && q.role === r);
            const rv = s => F.find(q => q.type === 'check_valve_hyd' && q.targetCylinderId === o.id && (q.role || 'A') === s);
            // Weg Ventil → Zylinder: Stromregelventil (2D-Drossel hält Q), Rückschlagventil
            const weg = (vp, zp, th, rolle, rvo, seite) => {
                let von = [vt.id, vp];
                if (th) {
                    const s = { id: nid(), typ: 'stromregel', x, y: 100, rot: 0, bez: th.normLabel || '', o: Object.assign({}, TYP.stromregel.optionen, H, { q: Math.max(0.1, Math.round((th.opening != null ? th.opening : 100) / 100 * (window.DROSSEL_QN_HYD || 20) * 10) / 10), anlage: th.id }) };
                    teile.push(s); L(von[0], von[1], s.id, '1'); von = [s.id, '2']; k.sr[rolle] = { id: s.id, th: th.id };
                }
                if (rvo) {
                    const ent = cfg(rvo).entsperrbar !== false;
                    const r = { id: nid(), typ: ent ? 'entsperr' : 'rueck', x, y: 40, rot: 0, bez: rvo.normLabel || '', o: Object.assign({}, (TYP[ent ? 'entsperr' : 'rueck'] || {}).optionen || {}, H, { anlage: rvo.id }) };
                    teile.push(r); L(von[0], von[1], r.id, '1'); von = [r.id, '2']; k.rv[seite] = { id: r.id, ent };
                }
                L(von[0], von[1], zt.id, zp);
            };
            if (dw) { weg('4', 'K', thr('ext'), 'ext', rv('A'), 'A'); weg('2', 'S', thr('ret'), 'ret', rv('B'), 'B'); }
            else weg('2', 'K', thr('ext'), 'ext', rv('A'), 'A');
            // Steuerleitung der entsperrbaren Rückschlagventile: von der Gegenseite (Ventilanschluss)
            if (dw) for (const [s, gp] of [['A', '2'], ['B', '4']]) if (k.rv[s] && k.rv[s].ent) L(vt.id, gp, k.rv[s].id, 'X');
            // Anordnung wie im Schaltplan: Zylinder oben, darunter Rückschlagventil, Drossel, Wegeventil;
            // die Kolbenseite (A) steht über dem Ventilanschluss A, die Stangenseite darüber versetzt
            const g = TYP.ventil.geometrie(vt), px = id => (g.ports.find(q => q.id === id) || { x: 0 }).x;
            const kX = x + 10, sX = dw ? x + ZYL_L - 10 : kX;
            vt.x = snap((kX + sX) / 2 - (dw ? (px('4') + px('2')) / 2 : px('2'))); vt.y = 270;
            const setze = (id, sx, sy) => { const t = teile.find(q => q.id === id); if (t) { t.x = snap(sx); t.y = sy; } };
            for (const [rolle, seite, sx] of [['ext', 'A', kX], ['ret', 'B', sX]]) {
                if (k.sr[rolle]) setze(k.sr[rolle].id, sx, 190);
                if (k.rv[seite]) setze(k.rv[seite].id, sx, 100);
            }
        });
        return { plan: { v: 2, teile, leitungen, fehler: {} }, karte, ag: ag.id };
    }
    // Aggregat der 2D-Anlage: Förderstrom mit Verschleiß (wärmeres Öl verliert mehr), Pumpe ein/aus, Öl im Tank
    function hydAggregatEin(unit, qNenn, zyl, pDBV) {
        const H = unit.hyd || (unit.hyd = {});
        if (unit.hydTemp == null) unit.hydTemp = Number(H.umgebung) || 20;
        const visk = Math.max(0.6, 1 + (unit.hydTemp - 40) / 40);
        const w = Math.min(0.95, Math.max(0, (Number(H.verschleiss) || 0) / 100) * visk);
        const pumpe = unit.linkedVarMotor ? !!(sps()[unit.linkedVarMotor]) : true;
        const q = Math.max(0, qNenn) * (1 - w * (unit.hydP || 0) / pDBV);
        const aus = !pumpe || zyl.some(o => typeof window._hydOelDa === 'function' && !window._hydOelDa(o));
        return { q, aus, pumpe };
    }
    // Last am 2D-Zylinder: Presse ab lastAb % (nur beim Ausfahren und Halten), Gewicht über den ganzen Hub.
    // Ein Werkstück drückt nicht zurück: ist es stärker als der Zylinder beim DBV-Druck, wirkt es als Anschlag.
    // sichtbar: ohne Last in der 2D-Anlage gilt die Last des Planzylinders.
    function hydLastEin(o, zt, raus, pDBV, sichtbar) {
        const h = o.hyd || {}, Fl = Math.max(0, Number(h.last) || 0);
        if (!Fl && sichtbar) { LW.delete(zt); return; }
        const presse = (h.lastArt || 'presse') !== 'gewicht', ab = Math.max(0, Number(h.lastAb) || 0);
        const fMax = pDBV * Math.PI * Math.pow(o.pistonD || 20, 2) / 4 / 100 * 10;
        const anschlag = presse && Fl > fMax ? ab / 100 * (o.stroke || 100) : null;
        const last = !Fl ? 0 : !presse ? Fl : (anschlag != null ? 0 : (raus && (o.extension || 0) >= ab - 0.01 ? Fl : 0));
        LW.set(zt, { last, anschlag });
    }
    // Messwerte aus dem gerade gerechneten Plan (im Kontext von plan/sim)
    function hydMessen(karte, agId, zyl, glatt, d) {
        const ag = agId && plan.teile.find(x => x.id === agId), za = ag && sim.zust[ag.id];
        const qRoh = za && d > 0 ? (za.qdbv || 0) / d * 60 : 0; if (za) za.qdbv = 0;   // l/min
        const qDbv = glatt.qdbv = (glatt.qdbv || 0) + (qRoh - (glatt.qdbv || 0)) * Math.min(1, d * 8);   // geglättet für die Anzeige
        const pP = ag ? pPort(ag, 'P') : 0;
        const zylW = {};
        let verlustDrossel = 0;
        for (const o of zyl) {
            const k = karte[o.id], zt = k && plan.teile.find(x => x.id === k.zyl), z = zt && sim.zust[k.zyl];
            if (!z) continue;
            const f = flaechen(zt);
            const pA = pPort(zt, 'K'), pB = zt.typ === 'zyl_dw' ? pPort(zt, 'S') : 0;
            const last = lw(zt).last != null ? lw(zt).last : zahl(zt.o.last, 0);
            zylW[o.id] = { pA: Math.max(0, pA), pB: Math.max(0, pB), v: z.v, x: z.x, hub: zylHub(zt), F: Math.abs(10 * (Math.max(0, pA) * f.AK - Math.max(0, pB) * f.AS)) * 0.95, last };
            for (const rolle of ['ext', 'ret']) {
                const s = k.sr[rolle]; if (!s) continue;
                const st = plan.teile.find(x => x.id === s.id); if (!st) continue;
                const dp = pPort(st, '1') - pPort(st, '2');
                if (dp > 0 && Math.abs(z.v) > 0.5) verlustDrossel += Math.min(zahl(st.o.q, 4), Math.abs(z.v) * (rolle === 'ext' ? f.AK : f.AS) * 6e-3) * dp;
            }
        }
        const sp = {};
        for (const id in karte) if (id.startsWith('sp:')) {
            const t = plan.teile.find(x => x.id === karte[id]), z = t && sim.zust[t.id];
            if (z) sp[id.slice(3)] = { p: pPort(t, '1'), oel: z.voil || 0 };
        }
        return { pP, qDbv, zylW, verlustDrossel, sp };
    }
    // Live-Werte in die 2D-Anlage (Anzeigen, Lektionen, valisBruecke: hydP, hydPA, hydKraft, hydTemp …)
    function hydLiveWerte(F, unit, zyl, karte, ergebnis, Qp, pDBV, pumpe, dt, mess) {
        const R = (x, n) => { const f = Math.pow(10, n || 0); return Math.round(x * f) / f; };
        const s = sps(), H = unit.hyd || (unit.hyd = {});
        for (const o of zyl) {
            const z = ergebnis.zylW[o.id]; if (!z) continue;
            const dir = karte[o.id].dir();
            const faehrt = Math.abs(z.v) > 0.5;
            const rolle = faehrt ? 'fahrt' : dir === 0 ? 'halt' : ((dir > 0 && z.x >= z.hub - 0.5) || (dir < 0 && z.x <= 0.5)) ? 'ende' : 'stau';
            o._hydSt = { dir: faehrt ? Math.sign(z.v) : 0, v: Math.abs(z.v), rolle };
            o.hydPA = R(z.pA, 1); o.hydPB = R(z.pB, 1); o.hydKraft = Math.round(z.F); o.hydLast = Math.round(z.last);
            o.hydV = R(Math.abs(z.v), 2); o.hydRolle = rolle;
        }
        const pSys = Math.max(0, ergebnis.pP);
        const verlustKW = (ergebnis.qDbv * pSys + ergebnis.verlustDrossel) / 600;
        const tankL = Math.max(5, Number(H.tankLiter) || 40), C = tankL * 1.65, kuehl = tankL * 0.004, tUmg = Number(H.umgebung) || 20;
        if (unit.hydTemp == null) unit.hydTemp = tUmg;
        if (dt > 0) {
            const dtZ = dt * (window._zeitraffer || 1), n = Math.max(1, Math.ceil(dtZ / 5));
            for (let i = 0; i < n; i++) {
                const extra = typeof window._oelKuehler === 'function' ? window._oelKuehler(unit, dtZ / n) : 0;
                unit.hydTemp += dtZ / n * (verlustKW + extra - kuehl * (unit.hydTemp - tUmg)) / C;
            }
        }
        unit.hydP = R(pSys, 1); unit.hydPcap = R(pDBV, 1);
        unit.hydQ = R(Qp, 2); unit.hydQdbv = R(ergebnis.qDbv, 2);
        unit.hydLeistung = R(Qp * pSys / 600, 2); unit.hydVerlust = R(verlustKW, 2);
        unit.hydPumpe = pumpe; unit.hydDbvOffen = ergebnis.qDbv > 0.05; unit.hydTempC = R(unit.hydTemp, 1);
        F.forEach(o => {
            if (o.type === 'accumulator_hyd' && ergebnis.sp[o.id]) { o.hydP = R(ergebnis.sp[o.id].p, 1); o.hydOelL = R(ergebnis.sp[o.id].oel, 3); }
        });
        // Druckschalter und Manometer: am P-Anschluss oder an Zylinderseite A/B
        const pAn = o => {
            if (!o.targetCylinderId || o.role === 'P') return pSys;
            const c = F.find(x => x.id === o.targetCylinderId);
            if (!c) return pSys;
            return o.role === 'B' ? (c.hydPB || 0) : (c.hydPA || 0);
        };
        F.forEach(o => {
            if (mess && mess[o.id]) { o.hydP = R(mess[o.id].p, 1); if (o.type === 'pressure_switch_hyd') o.hydSchaltet = !!mess[o.id].an; return; }
            if (o.type === 'pressure_switch_hyd') {
                const h = o.hyd || (o.hyd = {}), p = pAn(o);
                const ps = Math.max(1, Number(h.schaltdruck) || 80), hy = Math.max(1, Number(h.hysterese) || Math.max(2, ps * 0.05));
                if (p >= ps) o.hydSchaltet = true; else if (p < ps - hy) o.hydSchaltet = false; else o.hydSchaltet = !!o.hydSchaltet;
                o.hydP = R(p, 1);
                if (o.linkedVar) s[o.linkedVar] = h.oeffner ? !o.hydSchaltet : !!o.hydSchaltet;
            } else if (o.type === 'manometer_hyd') o.hydP = R(pAn(o), 1);
        });
        try { if (typeof window._hydAnzeigen === 'function') window._hydAnzeigen(); } catch (e) {}
    }
    function hydSchattenTakt(dt) {
        const F = fabrik();
        if (!window._fpHydSchatten() || !F || hydEigen(F).length) { hschatten = null; return; }
        const unit = F.find(o => o.type === 'hydraulic_unit'), zyl = hydZylinder(F);
        const cfg = o => o.hyd || (o.hyd = {});
        const sig = unit.id + '|' + zyl.map(o => {
            const v = F.find(q => q.type === 'valve_hyd' && q.targetCylinderId === o.id);
            const an = F.filter(q => (q.type === 'throttle_hyd' || q.type === 'check_valve_hyd') && q.targetCylinderId === o.id)
                .map(q => q.id + q.type + (q.role || '') + (q.type === 'check_valve_hyd' ? String(cfg(q).entsperrbar !== false) : '')).sort().join('+');
            return [o.id, o.type, o.pistonD, o.rodD, o.stroke, v.id, v.isDouble, v.isTriple, an, (Number(cfg(o).dichtung) || 0) > 0, (Number(cfg(v).innenLeck) || 0) > 0].join(',');
        }).join('|') + '|' + F.filter(o => o.type === 'accumulator_hyd').map(a => a.id + JSON.stringify(cfg(a))).join(';');
        if (!hschatten || hschatten.sig !== sig) {
            const r = planAusHyd2D(F, zyl);
            zyl.forEach(o => {
                const k = r.karte[o.id];
                if ((Number(cfg(o).dichtung) || 0) > 0 && o.type === 'zylinder_double') r.plan.fehler[k.zyl] = 'dichtung';
                const v = F.find(x => x.id === k.ventil2d);
                if (v && (Number(cfg(v).innenLeck) || 0) > 0) r.plan.fehler[k.ventil] = 'leck';
                // Fahrtrichtung aus dem 2D-Ventil: 1 aus, −1 ein, 0 Mittelstellung
                k.dir = () => { const v2 = (fabrik() || []).find(x => x.id === k.ventil2d); return !v2 ? 0 : (v2.isTriple && v2.valveState === 'center') ? 0 : v2.isActive ? 1 : -1; };
            });
            hschatten = { plan: r.plan, sim: null, sig, karte: r.karte, ag: r.ag, qdbv: 0 };
        }
        const S = hschatten, T = id => S.plan.teile.find(t => t.id === id);
        const ag = T(S.ag);
        const pDBV = Math.max(1, Number(unit.pressure) || 100);
        ag.o.p = pDBV;
        const A = hydAggregatEin(unit, Number(unit.maxFlow) || 20, zyl, pDBV);
        LW.set(ag, { q: A.q, aus: A.aus });
        for (const o of zyl) {
            const k = S.karte[o.id];
            const v = F.find(x => x.id === k.ventil2d), vt = T(k.ventil), zt = T(k.zyl);
            vt.o._stellung = (v.isTriple && v.valveState === 'center') ? 1 : v.isActive ? 0 : (v.isTriple ? 2 : 1);
            for (const rolle of ['ext', 'ret']) {
                const s = k.sr[rolle]; if (!s) continue;
                const th = F.find(x => x.id === s.th);
                if (th) T(s.id).o.q = (th.opening != null ? th.opening : 100) / 100 * (window.DROSSEL_QN_HYD || 20);
            }
            hydLastEin(o, zt, k.dir() >= 0, pDBV, false);
        }
        let ergebnis = null;
        mitPlan(S.plan, S.sim, () => {
            if (!sim) {
                simInit();
                const lage0 = () => { for (const o of zyl) { const k = S.karte[o.id], t = plan.teile.find(x => x.id === k.zyl), z = sim.zust[k.zyl]; z.x = (o.extension || 0) / 100 * zylHub(t); z.v = 0; } };
                lage0(); for (let i = 0; i < 25; i++) { simSchritt(0.02); lage0(); }
                sim.zust[S.ag].qdbv = 0;
            }
            const d = Math.min(0.1, dt);
            simSchritt(d);
            S.sim = sim;
            ergebnis = hydMessen(S.karte, S.ag, zyl, S, d);
        });
        if (!ergebnis) return;
        hydLiveWerte(F, unit, zyl, S.karte, ergebnis, A.aus ? 0 : A.q, pDBV, A.pumpe, dt);
    }
    function hydSchattenZiel(obj) {
        if (!hschatten || !hschatten.sim) return null;
        const k = hschatten.karte[obj.id]; if (!k) return null;
        const t = hschatten.plan.teile.find(x => x.id === k.zyl), z = hschatten.sim.zust[k.zyl];
        if (!t || !z) return null;
        return { ziel: z.x / zylHub(t) * 100, v: Math.abs(z.v) / zylHub(t) * (obj.stroke || 100) };
    }
    window._fpHydPlan = () => hschatten && { plan: hschatten.plan, karte: hschatten.karte };

    // ------------------------------------------------------------
    // Hydraulikplan mit der 2D-Anlage verbunden (eine Wahrheit wie bei der Pneumatik):
    // Der sichtbare Plan rechnet, die 2D-Anlage zeigt dieselben Teile (Aggregat, Wegeventil,
    // Drosseln, Rückschlagventile, Speicher, Zylinder) und gleicht Änderungen zurück.
    // ------------------------------------------------------------
    const hydVerbunden = () => !!plan.anlage && plan.teile.some(hydZylT);
    const QN_HYD = () => window.DROSSEL_QN_HYD || 20;
    const HYD_DROSSEL = ['stromregel', 'drossel', 'drv'], HYD_RUECK = ['rueck', 'entsperr'];
    function hydEigen(F) {
        if (!hydVerbunden()) return [];
        return plan.teile.filter(t => (t.typ === 'zyl_dw' || t.typ === 'zyl_ew') && t.o.anlage).map(t => F.find(q => q.id === t.o.anlage)).filter(hydAktor2D);
    }
    // Vom Zylinderanschluss zum Wegeventil: Drossel/Stromregelventil und Rückschlagventil unterwegs
    function hydWeg(zt, port) {
        const nb = nachbarn(), gesehen = new Set(), r = { ventil: null, port: null, sr: null, rv: null };
        const stapel = [zt.id + ':' + port];
        while (stapel.length) {
            const k = stapel.pop();
            if (gesehen.has(k)) continue; gesehen.add(k);
            for (const n of nb[k] || []) {
                if (gesehen.has(n)) continue;
                const [tid, pid] = n.split(':'), t = teil(tid); if (!t) continue;
                if (t.typ === 'ventil' && (pid === '2' || pid === '4')) { r.ventil = t; r.port = pid; return r; }
                if (t.typ === 'knoten') { gesehen.add(n); for (const w of nb[n] || []) stapel.push(w); continue; }
                if ((HYD_DROSSEL.includes(t.typ) || HYD_RUECK.includes(t.typ)) && (pid === '1' || pid === '2')) {
                    if (HYD_DROSSEL.includes(t.typ)) r.sr = r.sr || t; else r.rv = r.rv || t;
                    gesehen.add(n); stapel.push(tid + ':' + (pid === '1' ? '2' : '1'));
                }
            }
        }
        return r;
    }
    // Fährt der Zylinder aus, wenn das Ventil links (Stellung 0) geschaltet ist?
    function hydLinksExt(v, K, S) {
        if (!v) return true;
        if (v.o.wege === '3/2' || v.o.wege === '2/2') return v.o.ruhe !== 'offen';
        return K.ventil === v ? K.port === '4' : !(S && S.port === '4');
    }
    // Öffnung der 2D-Drossel (%) ↔ Planteil (Stromregelventil: l/min, Drossel: %)
    const srNach2D = t => Math.max(1, Math.min(100, Math.round(t.typ === 'stromregel' ? zahl(t.o.q, 4) / QN_HYD() * 100 : zahl(t.o.offen, 50))));
    const srAus2D = (t, offen) => { if (t.typ === 'stromregel') t.o.q = Math.round(offen / 100 * QN_HYD() * 10) / 10; else t.o.offen = offen; };
    function hydKarteSichtbar(F) {
        const karte = {}, zyl = [];
        for (const t of plan.teile) {
            if ((t.typ !== 'zyl_dw' && t.typ !== 'zyl_ew') || !t.o.anlage) continue;
            const o = F.find(q => q.id === t.o.anlage); if (!hydAktor2D(o)) continue;
            const K = hydWeg(t, 'K'), S = t.typ === 'zyl_dw' ? hydWeg(t, 'S') : {};
            const v = K.ventil || S.ventil, linksExt = hydLinksExt(v, K, S);
            const k = karte[o.id] = { zyl: t.id, ventil: v && v.id, sr: {}, rv: {} };
            if (K.sr) k.sr.ext = { id: K.sr.id };
            if (S.sr) k.sr.ret = { id: S.sr.id };
            k.dir = () => {
                const z = v && sim && sim.zust[v.id]; if (!z) return 0;
                if (ventilStellungen(v.o).length === 3 && z.stellung === 1) return 0;
                return (z.stellung === 0) === linksExt ? 1 : -1;
            };
            zyl.push(o);
        }
        for (const t of plan.teile) if (t.typ === 'speicher' && t.o.anlage) karte['sp:' + t.o.anlage] = t.id;
        return { karte, zyl, ag: plan.teile.find(t => t.typ === 'aggregat') };
    }
    const hydGlatt = { qdbv: 0 };
    // Vor dem Takt des sichtbaren Plans: Last und Aggregat aus der 2D-Anlage
    function hydSichtbarVor() {
        const F = fabrik(); if (!F || !hydVerbunden()) return null;
        const unit = F.find(o => o.type === 'hydraulic_unit'); if (!unit) return null;
        const c = hydKarteSichtbar(F); if (!c.zyl.length) return null;
        c.unit = unit; c.F = F;
        c.pDBV = c.ag ? Math.max(1, zahl(c.ag.o.p, 60)) : Math.max(1, Number(unit.pressure) || 100);
        c.A = hydAggregatEin(unit, c.ag ? zahl(c.ag.o.q, 8) : Number(unit.maxFlow) || 20, c.zyl, c.pDBV);
        if (c.ag) LW.set(c.ag, { q: c.A.q, aus: c.A.aus });
        return c;
    }
    function hydSichtbarNach(c, d, dt) {
        if (!sim) return;
        const e = hydMessen(c.karte, c.ag && c.ag.id, c.zyl, hydGlatt, d);
        const mess = {};
        for (const t of plan.teile) if (MESS_2D[t.typ] && istHyd(t) && t.o.anlage) mess[t.o.anlage] = { p: Math.max(0, pPort(t, '1')), an: !!(sim.zust[t.id] || {}).an };
        hydLiveWerte(c.F, c.unit, c.zyl, c.karte, e, c.A.aus ? 0 : c.A.q, c.pDBV, c.A.pumpe, dt, mess);
    }

    // ---- Plan → 2D-Anlage ----
    const hydSpiegel = new Map();   // 2D-Id → was der Plan zuletzt geschrieben hat
    const hydAn2D = (F, o, typ) => F.filter(q => q.type === typ && q.targetCylinderId === o.id);
    function hydVentilUmstellen(v, wahl) {
        const ist = v.isTriple ? 'triple' : v.isDouble ? 'double' : 'single';
        if (ist === wahl) return;
        v.isTriple = wahl === 'triple'; v.isDouble = wahl !== 'single';
        const reg = typeof ComponentRegistry !== 'undefined' && ComponentRegistry[v.type];
        if (reg && v.el) {
            const kz = v.normLabel;
            v.el.innerHTML = ''; v.el.className = '';
            try { reg.build(v, v.el, '', wahl); } catch (e) {}
            if (kz) { v.normLabel = kz; const l = v.el.querySelector('.f2d-norm-label'); if (l) l.textContent = kz; }
            try { updateObjTransform(v); } catch (e) {}
        }
    }
    function drosselHyd2D(th, offen) {
        th.opening = offen;
        const tv = th.el && th.el.querySelector('.f2d-throttle-val-hyd'), kn = th.el && th.el.querySelector('.f2d-throttle-knob-hyd');
        if (tv) tv.textContent = offen + '%';
        if (kn) kn.style.transform = `rotate(${offen * 2.7}deg)`;
    }
    const hydSchlaeuche = () => { const C = window.fluidPipeConnections || (window.fluidPipeConnections = []); return C; };
    // 2D-Teil mit IN/OUT aus der Leitung nehmen und die Enden wieder verbinden
    function hydAusKette(obj) {
        const C = hydSchlaeuche();
        const an = C.filter(c => c._sys === 'hyd' && (c.aObjId === obj.id || c.bObjId === obj.id));
        const ende = c => c.aObjId === obj.id ? { id: c.bObjId, p: c.bPortId, mein: c.aPortId } : { id: c.aObjId, p: c.aPortId, mein: c.bPortId };
        const e = an.map(ende), aus = e.find(x => x.mein === 'OUT'), ein = e.find(x => x.mein === 'IN');
        an.forEach(c => C.splice(C.indexOf(c), 1));
        try { deleteObjRecursive(obj); } catch (er) {}
        if (aus && ein) C.push({ aObjId: aus.id, aPortId: aus.p, bObjId: ein.id, bPortId: ein.p, _sys: 'hyd', _auto: true });
    }
    // Drossel zwischen Zylinderanschluss (A/B) und dem, was dort hängt, einsetzen
    function hydDrosselNeu(F, o, rolle, offen) {
        const C = hydSchlaeuche(), cp = rolle === 'ext' ? 'A' : 'B';
        const th = createFactoryObject('throttle_hyd', '');
        th.targetCylinderId = o.id; th.role = rolle;
        const v = F.find(q => q.type === 'valve_hyd' && q.targetCylinderId === o.id);
        th.x = (v ? v.x : o.x) + (rolle === 'ext' ? -10 : 35); th.y = (v ? v.y : o.y) - 70;
        const k = C.find(c => c._sys === 'hyd' && !c._broken && ((c.aObjId === o.id && c.aPortId === cp) || (c.bObjId === o.id && c.bPortId === cp)));
        if (k) {
            const aid = k.aObjId === o.id ? k.bObjId : k.aObjId, ap = k.aObjId === o.id ? k.bPortId : k.aPortId;
            C.splice(C.indexOf(k), 1);
            C.push({ aObjId: aid, aPortId: ap, bObjId: th.id, bPortId: 'OUT', _sys: 'hyd', _auto: true });
        }
        C.push({ aObjId: th.id, aPortId: 'IN', bObjId: o.id, bPortId: cp, _sys: 'hyd', _auto: true });
        drosselHyd2D(th, offen);
        try { updateObjTransform(th); } catch (e) {}
        return th;
    }
    // Ventil, Drosseln und Aggregat für einen neuen 2D-Zylinder (wie im Kontextmenü, ohne Rückfrage)
    function hydSetup2D(o, wahl) {
        if (typeof window.generateHydraulicSetup !== 'function') return;
        const bereich = D().getElementById && D().getElementById('factory-canvas-area');
        const sx = bereich ? bereich.scrollLeft : 0, sy = bereich ? bereich.scrollTop : 0;
        const alt = window.showValisChoiceDialog;
        try { window.showValisChoiceDialog = (a, b, c, fertig) => fertig(wahl); window.generateHydraulicSetup(o); }
        catch (e) { console.warn('Fluidplan → 2D (Hydraulik)', e); }
        finally { window.showValisChoiceDialog = alt; }
        if (bereich) try { bereich.scrollTo({ left: sx, top: sy, behavior: 'instant' }); } catch (e) {}
    }
    function hydZyl2DLoeschen(F, o) {
        F.filter(q => ['valve_hyd', 'throttle_hyd', 'check_valve_hyd', 'pressure_switch_hyd', 'manometer_hyd', 'valve_pneu', 'throttle'].includes(q.type) && q.targetCylinderId === o.id)
            .forEach(q => { try { deleteObjRecursive(q); } catch (e) {} });
        const C = hydSchlaeuche();
        for (let i = C.length - 1; i >= 0; i--) if (C[i]._sys === 'hyd' && (C[i].aObjId === o.id || C[i].bObjId === o.id)) C.splice(i, 1);
        try { deleteObjRecursive(o); } catch (e) {}
    }
    function hydAbgleichen(F) {
        kennKonflikteLoesen();
        plan.erzeugt = plan.erzeugt || [];
        const benutzt = new Set(), qn = QN_HYD();
        const ag = plan.teile.find(t => t.typ === 'aggregat');
        let nr = 0;
        for (const t of plan.teile) {
            if (!hydZylT(t)) continue;
            const dw = t.typ === 'zyl_dw';
            const K = hydWeg(t, 'K'), S = dw ? hydWeg(t, 'S') : {};
            const v = K.ventil || S.ventil;
            const linksExt = hydLinksExt(v, K, S);
            const vl = v && v.o.links === 'magnet' ? v.o.varL || '' : '', vr = v && v.o.rechts === 'magnet' ? v.o.varR || '' : '';
            const ext = linksExt ? vl : vr, ret = dw ? (linksExt ? vr : vl) : '';
            // 2D kennt am doppeltwirkenden Zylinder nur Impuls- (4/2) und Sperrmittel-Ventil (4/3)
            const wahl = !dw ? 'single' : v && v.o.wege === '4/3' ? 'triple' : 'double';
            let o = t.o.anlage ? F.find(q => q.id === t.o.anlage) : null;
            const typ2d = dw ? 'zylinder_double' : 'zylinder_single';
            // Ventil gelöscht (Plan oder 2D): der 2D-Zylinder bleibt ein Hydraulikzylinder
            if (o && o.type === typ2d && !o.hasHydraulics && hydSpiegel.has(o.id)) o.hasHydraulics = true;
            if (o && (o.type !== typ2d || !o.hasHydraulics)) {
                if (plan.erzeugt.includes(o.id)) { hydZyl2DLoeschen(F, o); plan.erzeugt = plan.erzeugt.filter(id => id !== o.id); F = fabrik(); }
                o = null;
            }
            if (!o) {
                o = createFactoryObject(typ2d, ext, dw ? ret : undefined);
                const zone = F.find(q => q.type === 'hydraulic_zone');
                const zx = zone ? zone.x : 20, zy = zone ? zone.y : 1000;
                const n = plan.erzeugt.length + nr++;
                o.x = zx + 30 + (n % 4) * 230; o.y = zy - 150 - Math.floor(n / 4) * 90;
                o.pistonD = zahl(t.o.d, 20); o.rodD = zahl(t.o.dStange, dw ? 8 : 6); o.stroke = zahl(t.o.hub, 100);
                o.linkedVarExt = ext || null; o.linkedVarRet = dw ? (ret || null) : null; if (!dw) o.linkedVar = ext || null;
                try { updateObjTransform(o); } catch (e) {}
                // Nur was im Plan steht: ohne Wegeventil im Plan bleibt der 2D-Zylinder allein
                if (v) hydSetup2D(o, wahl); else o.hasHydraulics = true;
                t.o.anlage = o.id; plan.erzeugt.push(o.id);
                F = fabrik();
            }
            if (v && !F.some(q => q.type === 'valve_hyd' && q.targetCylinderId === o.id)) { hydSetup2D(o, wahl); F = fabrik(); }
            // Kein Wegeventil im Plan: in 2D steht nur der Zylinder (Drosseln und Rückschlagventile
            // brauchen in 2D ein Ventil); im Plan bleiben sie stehen und kommen mit dem Ventil zurück
            if (!v) {
                const ids = new Set([K.sr, K.rv, S.sr, S.rv].filter(Boolean).map(q => q.o.anlage).filter(Boolean));
                F.filter(q => ['valve_hyd', 'throttle_hyd', 'check_valve_hyd'].includes(q.type) && (q.targetCylinderId === o.id || ids.has(q.id))).forEach(q => { try { deleteObjRecursive(q); } catch (e) {} });
                [K.sr, K.rv, S.sr, S.rv].forEach(q => { if (q) delete q.o.anlage; });
                o.hasHydraulics = true; F = fabrik();
            }
            benutzt.add(o.id);
            o.pistonD = zahl(t.o.d, 20); o.rodD = zahl(t.o.dStange, dw ? 8 : 6); o.stroke = zahl(t.o.hub, 100);
            o.linkedVarExt = ext || null; o.linkedVarRet = dw ? (ret || null) : null;
            if (!dw) o.linkedVar = ext || null;
            const oh = o.hyd || (o.hyd = {});
            oh.last = Math.max(0, zahl(t.o.last, 0)); oh.lastArt = t.o.lastArt || 'gewicht'; oh.lastAb = Math.max(0, zahl(t.o.lastAb, 0));
            kennNach2D(o, t);
            const ventil = F.find(q => q.type === 'valve_hyd' && q.targetCylinderId === o.id);
            if (ventil) {
                hydVentilUmstellen(ventil, wahl);
                ventil.linkedVarExt = o.linkedVarExt; ventil.linkedVarRet = o.linkedVarRet;
                if (v) { kennNach2D(ventil, v); v.o.anlage = ventil.id; }
            }
            // Drosseln: Plan hat eine → 2D-Drossel mit derselben Öffnung, sonst keine
            const dr = {};
            for (const [rolle, W] of [['ext', K], ['ret', S]]) {
                if (rolle === 'ret' && !dw) continue;
                let th = hydAn2D(F, o, 'throttle_hyd').find(q => q.role === rolle);
                if (W.sr && v) {
                    if (!th) th = hydDrosselNeu(F, o, rolle, srNach2D(W.sr));
                    else drosselHyd2D(th, srNach2D(W.sr));
                    W.sr.o.anlage = th.id; kennNach2D(th, W.sr);
                    dr[rolle] = th.opening;
                } else {
                    if (th) hydAusKette(th);
                    dr[rolle] = null;
                }
                F = fabrik();
            }
            // Rückschlagventile: Seite A = Kolbenseite, B = Stangenseite
            const rv = {};
            for (const [seite, W] of [['A', K], ['B', S]]) {
                if (seite === 'B' && !dw) continue;
                let cv = hydAn2D(F, o, 'check_valve_hyd').find(q => (q.role || 'A') === seite);
                if (W.rv && v) {
                    if (!cv && typeof window._hydAnbauen === 'function') { const id = window._hydAnbauen(o.id, 'check_valve_hyd', seite); F = fabrik(); cv = F.find(q => q.id === id); }
                    if (cv) { (cv.hyd || (cv.hyd = {})).entsperrbar = W.rv.typ === 'entsperr'; W.rv.o.anlage = cv.id; kennNach2D(cv, W.rv); }
                    rv[seite] = W.rv.typ;
                } else {
                    if (cv) hydAusKette(cv);
                    rv[seite] = null;
                }
                F = fabrik();
            }
            // Endlagensensoren des Plans = Reed-Schalter am 2D-Zylinder
            let R = reeds2D(o, F);
            for (const [key, seite, pos] of [['sensH', 'H', 'left'], ['sensV', 'V', 'right']]) {
                const soll = t.o[key] || '', ist = R[seite];
                if (soll && !ist && typeof window.attachReed === 'function') { try { window.attachReed(o, soll, pos); } catch (e) {} }
                else if (soll && ist && ist.var !== soll && typeof window.attachReed === 'function') { try { deleteObjRecursive(ist.obj); window.attachReed(o, soll, pos); } catch (e) {} }
                else if (!soll && ist) { try { deleteObjRecursive(ist.obj); } catch (e) {} }
            }
            F = fabrik(); R = reeds2D(o, F);
            hydSpiegel.set(o.id, { teil: t.id, vt: v ? v.id : null, linksExt, d: o.pistonD, ds: o.rodD, hub: o.stroke,
                ext: o.linkedVarExt || '', ret: o.linkedVarRet || '', wahl, dr, rv, last: JSON.stringify([oh.last, oh.lastArt, oh.lastAb]),
                reed: JSON.stringify({ H: R.H ? R.H.var : '', V: R.V ? R.V.var : '' }) });
        }
        // Aggregat: Druck (DBV) und Förderstrom
        const unit = F.find(q => q.type === 'hydraulic_unit');
        if (unit && ag) {
            unit.pressure = Math.max(1, zahl(ag.o.p, 60)); unit.maxFlow = Math.max(0.1, zahl(ag.o.q, 8));
            kennNach2D(unit, ag); ag.o.anlage = unit.id;
            hydSpiegel.set(unit.id, { ag: ag.id, p: unit.pressure, q: unit.maxFlow });
        }
        // Speicher
        const spIds = new Set();
        for (const t of plan.teile) {
            if (t.typ !== 'speicher') continue;
            let a = t.o.anlage ? F.find(q => q.id === t.o.anlage && q.type === 'accumulator_hyd') : null;
            if (!a && unit && typeof window._hydAnbauen === 'function') { const id = window._hydAnbauen(unit.id, 'accumulator_hyd', 'P'); F = fabrik(); a = F.find(q => q.id === id); }
            if (!a) continue;
            const h = a.hyd || (a.hyd = {});
            h.volumen = Math.max(0.05, zahl(t.o.V0, 0.7)); h.vordruck = Math.max(1, zahl(t.o.p0, 30));
            t.o.anlage = a.id; kennNach2D(a, t); spIds.add(a.id);
            hydSpiegel.set(a.id, { sp: t.id, V0: h.volumen, p0: h.vordruck });
        }
        F.filter(q => q.type === 'accumulator_hyd' && !spIds.has(q.id) && hydSpiegel.has(q.id)).forEach(q => { hydSpiegel.delete(q.id); hydAusKette(q); });
        F = hydMessAbgleichen(fabrik());
        // Zylinder, die der Plan erzeugt oder übernommen hat und die es im Plan nicht mehr gibt
        F = fabrik();
        const weg = new Set();
        for (const [id, w] of [...hydSpiegel]) {
            if (!w.teil || benutzt.has(id)) continue;
            hydSpiegel.delete(id); weg.add(id);
            const o = F.find(q => q.id === id); if (o) hydZyl2DLoeschen(F, o);
        }
        plan.erzeugt = plan.erzeugt.filter(id => !weg.has(id));
        if (typeof _applyHydManualConnections === 'function') try { _applyHydManualConnections(); } catch (e) {}
        if (typeof window.drawHydraulicHoses === 'function') try { window.drawHydraulicHoses(); } catch (e) {}
        try { if (window._syncCircuitFromFactory) window._syncCircuitFromFactory(); } catch (e) {}
        try { if (typeof saveFactoryState === 'function') saveFactoryState(); } catch (e) {}
    }

    // ---- Druckschalter und Manometer: Versorgung (P) oder Zylinderseite (A/B) ----
    const MESS_2D = { dschalter: 'pressure_switch_hyd', manometer: 'manometer_hyd' };
    const istMess2D = q => q.type === 'pressure_switch_hyd' || q.type === 'manometer_hyd';
    // Wo hängt das Messteil im Plan? Am Netz eines Hydraulikzylinders (A = Kolbenseite, B = Stangenseite), sonst P
    function hydMessOrt(t) {
        const nb = nachbarn(), gesehen = new Set([t.id + ':1']), stapel = [t.id + ':1'];
        while (stapel.length) {
            const k = stapel.pop();
            for (const n of nb[k] || []) {
                if (gesehen.has(n)) continue; gesehen.add(n);
                const [tid, pid] = n.split(':'), q = teil(tid); if (!q) continue;
                if (hydZylT(q) && q.o.anlage) return { ziel: q.o.anlage, rolle: pid === 'S' ? 'B' : 'A' };
                if (q.typ === 'knoten') for (const w of nb[n] || []) stapel.push(w);
                if (q.typ === 'knoten') for (const p of geo(q).ports) stapel.push(tid + ':' + p.id);
            }
        }
        return { ziel: null, rolle: 'P' };
    }
    function hydMessSig(m) {
        const h = m.hyd || {};
        return JSON.stringify([m.role || 'P', (m.role || 'P') === 'P' ? null : m.targetCylinderId || null, h.schaltdruck, h.hysterese, !!h.oeffner, m.linkedVar || '']);
    }
    function hydMessWeg(m) {
        const C = hydSchlaeuche();
        for (let i = C.length - 1; i >= 0; i--) if (C[i]._sys === 'hyd' && (C[i].aObjId === m.id || C[i].bObjId === m.id)) C.splice(i, 1);
        try { deleteObjRecursive(m); } catch (e) {}
    }
    // Planteil an P (Aggregat) oder an Zylinderseite A/B anschließen
    function hydMessAnschliessen(t, rolle, ziel2D) {
        plan.leitungen = plan.leitungen.filter(l => l.a.t !== t.id && l.b.t !== t.id);
        let an = null;
        if (rolle !== 'P') { const z = plan.teile.find(q => hydZylT(q) && q.o.anlage === ziel2D); if (z) an = { t: z.id, p: rolle === 'B' && z.typ === 'zyl_dw' ? 'S' : 'K' }; }
        if (!an) { const ag = plan.teile.find(q => q.typ === 'aggregat'); if (ag) an = { t: ag.id, p: 'P' }; }
        if (!an) return;
        const L0 = portLage(teil(an.t), an.p);
        if (L0) { t.x = snap(L0.x + 60 + 40 * plan.teile.filter(q => MESS_2D[q.typ] && q !== t && Math.abs(q.y - (L0.y - 30)) < 5).length); t.y = L0.y - 30; }
        plan.leitungen.push({ id: neueId(), a: { t: t.id, p: '1' }, b: { t: an.t, p: an.p } });
    }
    function hydMessAus2D(t, m) {
        const h = m.hyd || {};
        if (t.typ === 'dschalter') { t.o.p = Math.max(1, Number(h.schaltdruck) || 80); t.o.hyst = Math.max(0.5, Number(h.hysterese) || Math.max(2, t.o.p * 0.05)); t.o.oeffner = !!h.oeffner; t.o.var = m.linkedVar || ''; }
    }
    function hydMessNeu(m) {
        const typ = m.type === 'pressure_switch_hyd' ? 'dschalter' : 'manometer';
        const t = { id: neueId(), typ, x: 0, y: 0, rot: 0, bez: m.normLabel || neueBezeichnung(typ, { hyd: true }), o: Object.assign({}, TYP[typ].optionen, { hyd: true, anlage: m.id }) };
        hydMessAus2D(t, m);
        plan.teile.push(t);
        hydMessAnschliessen(t, m.role || 'P', m.targetCylinderId);
        return t;
    }
    // Plan → 2D
    function hydMessAbgleichen(F) {
        const ids = new Set();
        for (const t of plan.teile) {
            const art = MESS_2D[t.typ];
            if (!art || !istHyd(t)) continue;
            const ort = hydMessOrt(t);
            let m = t.o.anlage ? F.find(q => q.id === t.o.anlage && q.type === art) : null;
            if (m && ((m.role || 'P') !== ort.rolle || (ort.rolle !== 'P' && m.targetCylinderId !== ort.ziel))) { hydSpiegel.delete(m.id); hydMessWeg(m); F = fabrik(); m = null; }
            if (!m && typeof window._hydAnbauen === 'function') { const id = window._hydAnbauen(ort.ziel, art, ort.rolle); F = fabrik(); m = F.find(q => q.id === id); }
            if (!m) continue;
            if (art === 'pressure_switch_hyd') {
                const h = m.hyd || (m.hyd = {}), p = Math.max(1, zahl(t.o.p, 80));
                h.schaltdruck = p; h.hysterese = Math.max(0.5, zahl(t.o.hyst, Math.max(2, p * 0.05))); h.oeffner = !!t.o.oeffner;
                m.linkedVar = t.o.var || null;
            }
            t.o.anlage = m.id; kennNach2D(m, t); ids.add(m.id);
            hydSpiegel.set(m.id, { mess: t.id, sig: hydMessSig(m) });
        }
        for (const [id, w] of [...hydSpiegel]) {
            if (!w.mess || ids.has(id)) continue;
            hydSpiegel.delete(id);
            const m = F.find(q => q.id === id); if (m) hydMessWeg(m);
        }
        return fabrik();
    }
    // 2D → Plan
    function hydMessRueck(F, neu) {
        let masse = false;
        for (const [id, w] of hydSpiegel) {
            if (!w.mess) continue;
            const t = teil(w.mess); if (!t) continue;
            const m = F.find(q => q.id === id);
            if (!m) { masse = true; hydSpiegel.delete(id); neu.push(() => { plan.teile = plan.teile.filter(q => q.id !== t.id); plan.leitungen = plan.leitungen.filter(l => l.a.t !== t.id && l.b.t !== t.id); }); continue; }
            const sig = hydMessSig(m); if (sig === w.sig) continue;
            const alt = JSON.parse(w.sig), jetzt = JSON.parse(sig);
            w.sig = sig; masse = true;
            neu.push(() => { hydMessAus2D(t, m); if (alt[0] !== jetzt[0] || alt[1] !== jetzt[1]) hydMessAnschliessen(t, m.role || 'P', m.targetCylinderId); });
        }
        // in der 2D-Anlage neu angebaut
        for (const m of F) {
            if (!istMess2D(m) || hydSpiegel.has(m.id) || plan.teile.some(t => t.o && t.o.anlage === m.id)) continue;
            if ((m.role || 'P') !== 'P' && !plan.teile.some(q => hydZylT(q) && q.o.anlage === m.targetCylinderId)) continue;
            masse = true; hydSpiegel.set(m.id, { mess: '?', sig: hydMessSig(m) });
            neu.push(() => { const t = hydMessNeu(m); hydSpiegel.set(m.id, { mess: t.id, sig: hydMessSig(m) }); });
        }
        return masse;
    }
    // ---- 2D-Anlage → Plan (Kontextmenü, Auto-Schaltplan) ----
    // Rückschlagventil in die Leitung am Ventilanschluss setzen (entsperrbar: X von der Gegenseite)
    function hydRvEinsetzen(zt, port, typ) {
        const W = hydWeg(zt, port); if (!W.ventil) return;
        const l = plan.leitungen.find(q => (q.a.t === W.ventil.id && q.a.p === W.port) || (q.b.t === W.ventil.id && q.b.p === W.port));
        if (!l) return;
        const an = l.a.t === W.ventil.id && l.a.p === W.port ? l.b : l.a;
        const A = portLage(W.ventil, W.port), B = portLage(teil(an.t), an.p); if (!A || !B) return;
        const r = { id: neueId(), typ, x: snap((A.x + B.x) / 2), y: snap((A.y + B.y) / 2), rot: 0, bez: neueBezeichnung(typ), o: Object.assign({}, (TYP[typ] || {}).optionen || {}, { hyd: true }) };
        plan.teile.push(r);
        plan.leitungen = plan.leitungen.filter(q => q.id !== l.id);
        plan.leitungen.push({ id: neueId(), a: { t: W.ventil.id, p: W.port }, b: { t: r.id, p: '1' } }, { id: neueId(), a: { t: r.id, p: '2' }, b: { t: an.t, p: an.p } });
        if (typ === 'entsperr' && geo(W.ventil).ports.some(p => p.id === '2') && geo(W.ventil).ports.some(p => p.id === '4'))
            plan.leitungen.push({ id: neueId(), a: { t: W.ventil.id, p: W.port === '4' ? '2' : '4' }, b: { t: r.id, p: 'X' } });
    }
    function hydSrEinsetzen(zt, port, offen) {
        const l = plan.leitungen.find(q => (q.a.t === zt.id && q.a.p === port) || (q.b.t === zt.id && q.b.p === port));
        if (!l) return;
        const an = l.a.t === zt.id && l.a.p === port ? l.b : l.a;
        const A = portLage(zt, port), B = portLage(teil(an.t), an.p); if (!A || !B) return;
        const d = { id: neueId(), typ: 'stromregel', x: snap(A.x), y: snap((A.y + B.y) / 2), rot: A.y <= B.y ? 180 : 0, bez: neueBezeichnung('stromregel'), o: Object.assign({}, TYP.stromregel.optionen, { hyd: true }) };
        srAus2D(d, offen);
        plan.teile.push(d);
        plan.leitungen = plan.leitungen.filter(q => q.id !== l.id);
        // Stromregelventil regelt 1 → 2: 1 zum Ventil, 2 zum Zylinder (Zulauf geregelt)
        plan.leitungen.push({ id: neueId(), a: { t: an.t, p: an.p }, b: { t: d.id, p: '1' } }, { id: neueId(), a: { t: d.id, p: '2' }, b: { t: zt.id, p: port } });
    }
    function hydRueckAbgleich(F) {
        if (!hydSpiegel.size) return;
        const neu = [];
        let masse = hydRueck(F, neu);
        if (hydMessRueck(F, neu)) masse = true;
        for (const [id, w] of kennSpiegel) {
            const o = F.find(q => q.id === id), t = teil(w.teil);
            if (!o || !t) { kennSpiegel.delete(id); continue; }
            const jetzt = String(o.normLabel || '').trim();
            if (jetzt && jetzt !== w.kz) { w.kz = jetzt; neu.push(() => { t.bez = jetzt; }); }
        }
        if (!neu.length) return;
        if (masse) aendern(() => { neu.forEach(f => f()); });
        else {
            // Nur Drosseln/Variablen: die laufende Simulation behält ihre Drücke
            undoStapel.push(JSON.stringify(plan)); if (undoStapel.length > 100) undoStapel.shift(); redoStapel = [];
            neu.forEach(f => f()); speichern(); zeichnen();
        }
        status('Änderung aus der 2D-Anlage in den Plan übernommen.');
    }
    function hydRueck(F, neu) {
        let masse = false;
        for (const [id, w] of hydSpiegel) {
            const o = F.find(q => q.id === id); if (!o) continue;
            if (w.ag) {
                const ag = teil(w.ag); if (!ag) continue;
                if (o.pressure !== w.p || o.maxFlow !== w.q) { w.p = o.pressure; w.q = o.maxFlow; masse = true; neu.push(() => { ag.o.p = zahl(o.pressure, 100); ag.o.q = zahl(o.maxFlow, 20); }); }
                continue;
            }
            if (w.mess) continue;
            if (w.sp) {
                const sp = teil(w.sp), h = o.hyd || {}; if (!sp) continue;
                if (h.volumen !== w.V0 || h.vordruck !== w.p0) { w.V0 = h.volumen; w.p0 = h.vordruck; masse = true; neu.push(() => { sp.o.V0 = zahl(h.volumen, 0.7); sp.o.p0 = zahl(h.vordruck, 30); }); }
                continue;
            }
            const t = teil(w.teil); if (!t) continue;
            const dw = t.typ === 'zyl_dw';
            if (o.pistonD !== w.d || o.rodD !== w.ds || o.stroke !== w.hub) {
                w.d = o.pistonD; w.ds = o.rodD; w.hub = o.stroke; masse = true;
                neu.push(() => { t.o.d = o.pistonD || 20; t.o.dStange = o.rodD || t.o.dStange; t.o.hub = o.stroke || 100; });
            }
            const oh = o.hyd || {}, lastJ = JSON.stringify([oh.last, oh.lastArt, oh.lastAb]);
            if (w.last != null && lastJ !== w.last) { w.last = lastJ; neu.push(() => { t.o.last = Math.max(0, Number(oh.last) || 0); t.o.lastArt = oh.lastArt || 'presse'; t.o.lastAb = Math.max(0, Number(oh.lastAb) || 0); }); }
            const vt = w.vt && teil(w.vt);
            const ext = dw ? o.linkedVarExt || '' : o.linkedVar || o.linkedVarExt || '', ret = dw ? o.linkedVarRet || '' : '';
            if (vt && (ext !== w.ext || ret !== w.ret)) {
                w.ext = ext; w.ret = ret;
                neu.push(() => {
                    const [l, r] = w.linksExt ? [ext, ret] : [ret, ext];
                    if (vt.o.links === 'magnet') vt.o.varL = l;
                    if (vt.o.rechts === 'magnet') vt.o.varR = r;
                });
            }
            const ventil = F.find(q => q.type === 'valve_hyd' && q.targetCylinderId === o.id);
            if (vt && ventil && dw) {
                const wahl = ventil.isTriple ? 'triple' : 'double';
                if (wahl !== w.wahl) {
                    w.wahl = wahl; masse = true;
                    neu.push(() => { vt.o.wege = wahl === 'triple' ? '4/3' : '4/2'; if (wahl === 'triple' && !vt.o.mitte) vt.o.mitte = 'gesperrt'; vt.o.links = 'magnet'; vt.o.rechts = 'magnet'; });
                }
            }
            // Ohne Wegeventil im Plan stehen Drosseln und Rückschlagventile nur im Plan
            if (w.vt) for (const rolle of dw ? ['ext', 'ret'] : ['ext']) {
                const th = hydAn2D(F, o, 'throttle_hyd').find(q => q.role === rolle), port = rolle === 'ext' ? 'K' : 'S';
                const jetzt = th ? th.opening : null;
                if (jetzt === w.dr[rolle]) continue;
                const war = w.dr[rolle]; w.dr[rolle] = jetzt;
                if (jetzt != null && war != null) neu.push(() => { const sr = hydWeg(t, port).sr; if (sr) srAus2D(sr, jetzt); });
                else {
                    masse = true;
                    if (jetzt != null) neu.push(() => hydSrEinsetzen(t, port, jetzt));
                    else neu.push(() => { const sr = hydWeg(t, port).sr; if (sr) drvEntfernen(sr.id); });
                }
            }
            if (w.vt) for (const seite of dw ? ['A', 'B'] : ['A']) {
                const cv = hydAn2D(F, o, 'check_valve_hyd').find(q => (q.role || 'A') === seite), port = seite === 'A' ? 'K' : 'S';
                const jetzt = cv ? ((cv.hyd || {}).entsperrbar !== false ? 'entsperr' : 'rueck') : null;
                if (jetzt === w.rv[seite]) continue;
                w.rv[seite] = jetzt; masse = true;
                neu.push(() => {
                    const alt = hydWeg(t, port).rv;
                    if (alt) drvEntfernen(alt.id);
                    if (jetzt) hydRvEinsetzen(t, port, jetzt);
                });
            }
            const R = reeds2D(o, F), reed = JSON.stringify({ H: R.H ? R.H.var : '', V: R.V ? R.V.var : '' });
            if (reed !== w.reed) { w.reed = reed; neu.push(() => { t.o.sensH = R.H ? R.H.var : ''; t.o.sensV = R.V ? R.V.var : ''; }); }
        }
        return masse;
    }

    // Drücke an einem Drosselrückschlagventil der 2D-Anlage (Anschluss 1 Zylinder, 2 Ventil),
    // aus dem verbundenen Plan oder dem Schattenplan. Der Auto-Schaltplan zeigt damit die Kugel.
    window._fpDrv = function (thId) {
        if (!simLaeuft()) return null;
        if (sim && plan.anlage) {
            const m = spiegel.get(thId), t = m && plan.teile.find(x => x.id === m.teil);
            if (t && t.typ === 'drv') return { p1: pPort(t, '1'), p2: pPort(t, '2') };
        }
        if (!schatten || !schatten.sim) return null;
        let id = null;
        for (const k of Object.values(schatten.karte)) for (const r of ['ext', 'ret']) if (k.drv[r] && k.drv[r].th === thId) id = k.drv[r].id;
        const t = id && schatten.plan.teile.find(x => x.id === id);
        if (!t) return null;
        return mitPlan(schatten.plan, schatten.sim, () => ({ p1: pPort(t, '1'), p2: pPort(t, '2') }));
    };

    // Drücke des Rechenkerns an den Anschlüssen der 2D-Teile ('objId:port' → bar), damit Drucksensor,
    // Durchflusssensor, Schlauch- und Schaltplanfarben dieselben Werte zeigen (eine Wahrheit).
    window._fpDruckKarte = function () {
        if (!simLaeuft()) return null;
        const m = {};
        const ventilPorts = vt => /^5/.test(vt.o.wege || '') ? [['1', '1'], ['2', '4'], ['4', '2'], ['3', '5'], ['5', '3']] : [['1', '1'], ['2', '2'], ['3', '3']];
        const eintragen = (zt, o2, vt, v2) => {
            m[o2 + ':1'] = pPort(zt, 'K');
            if (zt.typ === 'zyl_dw') m[o2 + ':2'] = pPort(zt, 'S');
            if (vt && v2) for (const [a, b] of ventilPorts(vt)) if (sim.netzVon[vt.id + ':' + b] != null) m[v2 + ':' + a] = pPort(vt, b);
        };
        if (sim && plan.anlage) {
            for (const [id, w] of spiegel) if (w.ventil) {
                const vt = plan.teile.find(q => q.id === w.ventil);
                const zw = [...spiegel.values()].find(x => x.vt === w.ventil && x.teil);
                const zt = zw && plan.teile.find(q => q.id === zw.teil);
                const o2 = zt && zt.o.anlage;
                if (vt && zt && o2) eintragen(zt, o2, vt, id);
            }
        }
        if (schatten && schatten.sim) mitPlan(schatten.plan, schatten.sim, () => {
            for (const o2 in schatten.karte) {
                const k = schatten.karte[o2];
                const zt = plan.teile.find(q => q.id === k.zyl), vt = plan.teile.find(q => q.id === k.ventil);
                if (zt) eintragen(zt, o2, vt, k.ventil2d);
            }
        });
        return m;
    };

    // ------------------------------------------------------------
    // Öffnen / Schließen, Schnittstelle
    // ------------------------------------------------------------
    const abgekoppelt = () => { const w = window.popOutWindows && window.popOutWindows['fluid-wrapper']; return !!(w && !w.closed); };
    function panelSichtbar() {
        const p = panelEl();
        if (!p) return !!(fenster && fenster.style.display !== 'none' && fenster.style.display !== '');
        if (abgekoppelt()) return true;
        return p.style.display !== 'none' && p.style.getPropertyValue('display') !== 'none';
    }
    // Nach Einblenden, Abkoppeln oder Zurückholen: Stil, Größe, Ansicht neu
    let letztesDok = null, letzteGroesse = '';
    function sichtbarGeworden() {
        if (kennKonflikteLoesen()) { geoCache.clear(); speichern(); }
        fensterBauen();
        cssSicher();
        offen = panelSichtbar();
        letztesDok = D(); letzteGroesse = '';
        const ab = D().getElementById('fp-abk'); if (ab) ab.style.display = abgekoppelt() ? 'none' : '';
        W().requestAnimationFrame(() => {
            ansichtSetzen(); zeichnen(); eigenschaften(); status(); knopfZustand();
            if (!fenster._eingepasst && svg && svg.getBoundingClientRect().width > 50) { einpassen(); fenster._eingepasst = true; }
        });
    }
    function oeffnen() {
        fensterBauen();
        const p = panelEl();
        if (!p) { fenster.style.display = 'flex'; sichtbarGeworden(); return; }
        if (abgekoppelt()) { try { window.popOutWindows['fluid-wrapper'].focus(); } catch (e) {} sichtbarGeworden(); return; }
        if (!panelSichtbar() && typeof window.toggleWorkspaceView === 'function') window.toggleWorkspaceView('fluid-wrapper');
        sichtbarGeworden();
    }
    function schliessen() {
        const p = panelEl();
        if (!p) { if (fenster) fenster.style.display = 'none'; offen = false; return; }
        if (panelSichtbar() && typeof window.toggleWorkspaceView === 'function') window.toggleWorkspaceView('fluid-wrapper');
        offen = panelSichtbar();
    }
    function umschalten() { if (panelSichtbar()) schliessen(); else oeffnen(); }
    function abkoppeln() {
        fensterBauen();
        if (abgekoppelt()) { try { window.popOutWindows['fluid-wrapper'].focus(); } catch (e) {} return; }
        if (typeof window.detachPanel !== 'function') return;
        window.detachPanel('fluid-wrapper', 'Fluidplan');
        sichtbarGeworden();
    }

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
        const a = document.getElementById('detach-fluid-item');
        if (a) a.style.display = freigeschaltet() ? '' : 'none';
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopfSichtbar); else knopfSichtbar();

    // ------------------------------------------------------------
    // Bild für den Auto-Schaltplan: Der Pneumatikteil dort IST der Fluidplan
    // (eigener, verbundener Plan und Schattenplan der übrigen 2D-Zylinder),
    // mit denselben Symbolen, Kennzeichen und dem laufenden Zustand.
    // ------------------------------------------------------------
    function schattenFuerBild(F) {
        const zyl = schattenZylinder(F);
        if (!zyl.length) return null;
        if (schatten && schatten.plan && zyl.every(o => schatten.karte[o.id]) && Object.keys(schatten.karte).length === zyl.length) return schatten;
        // ohne laufende Simulation: Bild aus der 2D-Anlage, gemerkt bis sich dort etwas ändert
        const comp = F.find(o => o.type === 'compressor'), mf = F.find(o => o.type === 'manifold');
        const rel = o => o && [o.id, o.type, o.normLabel, o.pistonD, o.rodD, o.stroke, o.isDouble, o.isTriple, o.role, o.opening, o.pressure, JSON.stringify(o.abschluss || null)].join('/');
        const sig = [rel(comp), rel(mf)].concat(zyl.map(o => [rel(o)].concat(F.filter(q => (q.type === 'valve_pneu' || q.type === 'throttle') && q.targetCylinderId === o.id).map(rel)).join('+'))).join('|');
        if (bildSchatten && bildSchatten.sig === sig) return bildSchatten;
        const r = planAus2D(F, zyl, comp);
        bildSchatten = { sig, plan: { v: 2, teile: r.teile, leitungen: r.leitungen, fehler: {} }, sim: null, karte: r.karte, quelle: r.quelle };
        return bildSchatten;
    }
    let bildSchatten = null;
    function schaltbild(ziel, opts) {
        opts = opts || {};
        const F = fabrik() || [];
        const quellen = [];
        if (plan.anlage && plan.teile.length) {
            const map = {};
            plan.teile.forEach(t => { if (t.o && t.o.anlage) map[t.id] = t.o.anlage; });
            for (const [id, w] of kennSpiegel) if (F.some(o => o.id === id)) map[w.teil] = id;
            quellen.push({ p: plan, s: sim, map });
        }
        const sch = schattenFuerBild(F);
        if (sch) {
            const map = {};
            for (const oid in sch.karte) {
                const k = sch.karte[oid];
                map[k.zyl] = oid; if (k.ventil2d) map[k.ventil] = k.ventil2d;
                for (const r in k.drv) if (k.drv[r]) map[k.drv[r].id] = k.drv[r].th;
            }
            const comp = F.find(o => o.type === 'compressor'); if (comp && sch.quelle) map[sch.quelle] = comp.id;
            for (const oid in (sch.fp2d || {})) map[sch.fp2d[oid]] = oid;
            quellen.push({ p: sch.plan, s: sch.sim, map });
        }
        if (!quellen.length) return null;
        const doc = ziel.ownerDocument || document;
        const G = doc.createElementNS(NS, 'g');
        const laeuft = quellen.some(q => q.s);
        G.setAttribute('class', 'fp-sb' + (laeuft ? ' sim' : ''));
        G.setAttribute('style', 'color:#000;--fp-papier:#fff;--fp-aktiv:#ffb300');
        const st = doc.createElementNS(NS, 'style');
        st.textContent = '.fp-sb .fp-leitung{fill:none;stroke:#000;stroke-width:1.5}.fp-sb.sim .fp-leitung{stroke:#1565c0}'
            + '.fp-sb .fp-leitung.steuer{stroke-dasharray:6 4;stroke-width:1.2}.fp-sb .fp-leitung.druck{stroke:#c62828;stroke-width:2}'
            + '.fp-sb .fp-bez{font:bold 10px monospace;fill:#000}.fp-sb .fp-pnr{font:8px monospace;fill:#000}'
            + '.fp-sb .fp-var{font:8px monospace;fill:#0288d1}.fp-sb .fp-wert{font:8px monospace;fill:#c62828}.fp-sb .fp-marke{font:8px monospace;fill:#000}'
            + '.fp-sb .fp-druckwert{font:bold 8px monospace;fill:#c62828}';
        G.appendChild(st);
        const alt = { svg, ebLeitungen, ebTeile, ebUi, plan, sim, offen, auswahl, bild, bildDok };
        let x0 = 0, hoehe = 0;
        try {
            for (const q of quellen) {
                plan = q.p; sim = q.s; offen = true; auswahl = new Set(); bildDok = doc;
                bild = { map: q.map, spule: opts.spule };
                const sub = el('g', {}, G);
                svg = sub; ebLeitungen = el('g', {}, sub); ebTeile = el('g', {}, sub); ebUi = el('g', {}, sub);
                const dynAlt = new Map(dyn);
                try {
                    zeichnen();
                    // Drücke an den Leitungen (Pneumatik-Optionen: Drücke anzeigen)
                    if (opts.druecke && sim) for (const l of plan.leitungen) {
                        const n = sim.netzVon[l.a.t + ':' + l.a.p], pts = leitungPunkte(l);
                        if (n == null || !pts || pts.length < 2) continue;
                        const i = Math.floor((pts.length - 1) / 2), a = pts[i], b = pts[i + 1];
                        el('text', { class: 'fp-druckwert', x: (a[0] + b[0]) / 2 + 3, y: (a[1] + b[1]) / 2 - 3 }, ebUi).textContent = druckVon(n).toFixed(2) + ' bar';
                    }
                    let b = [Infinity, Infinity, -Infinity, -Infinity];
                    for (const t of plan.teile) { const w = boxWelt(t); b = [Math.min(b[0], w[0]), Math.min(b[1], w[1] - 16), Math.max(b[2], w[2] + 30), Math.max(b[3], w[3] + 16)]; }
                    if (!isFinite(b[0])) { sub.remove(); continue; }
                    sub.setAttribute('transform', `translate(${x0 - b[0]},${-b[1]})`);
                    x0 += b[2] - b[0] + 60; hoehe = Math.max(hoehe, b[3] - b[1]);
                } finally { dyn.clear(); dynAlt.forEach((v, k) => dyn.set(k, v)); }
            }
        } finally {
            ({ svg, ebLeitungen, ebTeile, ebUi, plan, sim, offen, auswahl, bild, bildDok } = alt);
        }
        if (!x0) return null;
        ziel.appendChild(G);
        return { g: G, breite: x0 - 60, hoehe };
    }

    // ------------------------------------------------------------
    // 2D-Anlage: EIN Bauteil für alle Fluidplan-Teile ('pneu_fp')
    // ------------------------------------------------------------
    // Was die 2D-Anlage nicht als eigenes Bauteil kennt (Ventile mit Rolle, Taster,
    // Hebel, Pedal oder Steuerdruck, Rückschlag-, Wechsel-, Zweidruck-, Schnellent-
    // lüftungsventil, Zeitglied, Drossel, Druckregler, Manometer, Druckschalter …),
    // steht dort als 'pneu_fp' mit demselben Symbol und denselben Anschlüssen wie im
    // Plan. obj.pneu.fp = { typ, o, rot, ab } (ab: Abschlüsse an Abluftanschlüssen).
    const S2D = 0.6;
    const fp2d = obj => { const p = obj.pneu || (obj.pneu = {}); if (!p.fp) p.fp = { typ: 'ventil', o: {}, rot: 0 }; return p.fp; };
    function teilAus2D(obj) {
        const f = fp2d(obj), T = TYP[f.typ] || TYP.rueck;
        return { id: '2d:' + obj.id, typ: TYP[f.typ] ? f.typ : 'rueck', x: 0, y: 0, rot: f.rot || 0, sp: !!f.sp, bez: obj.normLabel || '', o: Object.assign({}, T.optionen, f.o || {}) };
    }
    // Kleiner Plan aus dem Teil und seinen angedockten Schalldämpfern/Stopfen
    function miniPlan(obj) {
        const t = teilAus2D(obj), teile = [t], leitungen = [];
        const ab = fp2d(obj).ab || {};
        for (const pid of Object.keys(ab).sort()) {
            const n = abschlussBauen(t, pid, ab[pid], () => '2d:' + obj.id + ':' + pid + ':' + (teile.length + leitungen.length));
            if (n) { teile.push(n.t); leitungen.push(n.l); }
        }
        return { teile, leitungen };
    }
    function mitMini(obj, doc, fn) {
        const alt = { plan, bildDok, bild };
        try { plan = miniPlan(obj); bildDok = doc || document; bild = { map: {} }; andocken(); return fn(plan); }
        finally { plan = alt.plan; bildDok = alt.bildDok; bild = alt.bild; }
    }
    // Box (Planeinheiten) und Anschlüsse in 2D-Pixeln, links oben = 0,0
    // Wegeventile zeigen in der 2D-Anlage (Standard) das Gehäuse: EIN Fenster (die
    // Ruhestellung, Kasten 1) mit den Kammern dahinter, die Betätigungen sitzen fest am
    // Gehäuse. f.bild === 'symbol' zeigt stattdessen das Normsymbol wie im Plan.
    const G2D = 1;
    const gehaeuse = obj => fp2d(obj).typ === 'ventil' && darst(obj) === 'gehaeuse';
    // Planpunkt des Ventils (ungedreht) → Gehäusepunkt: Betätiger rücken ans Fenster
    function gLokal(t, x, y) {
        const n = ventilStellungen(t.o).length;
        if (x < 0) return [x + KASTEN, y];
        if (x > n * KASTEN) return [x - (n - 2) * KASTEN, y];
        return [x, y];
    }
    function gehaeuseRoh(obj) {
        const t = teilAus2D(obj), o = t.o, f = fp2d(obj), ab = f.ab || {};
        const wl = betBreite(o.links), wr = betBreite(o.rechts);
        let unten = KASTEN + 12;
        for (const pid of Object.keys(ab)) if (ab[pid] && ab[pid].art && ab[pid].art !== 'offen') unten = Math.max(unten, KASTEN + 10 + (ab[pid].art === 'stopfen' ? 14 : 36));
        const ecken = [[KASTEN - wl - 14, -14], [2 * KASTEN + wr + 14, -14], [KASTEN - wl - 14, unten], [2 * KASTEN + wr + 14, unten]].map(([x, y]) => trafo(t, x, y));
        const b = [Math.min(...ecken.map(e => e[0])), Math.min(...ecken.map(e => e[1])), Math.max(...ecken.map(e => e[0])), Math.max(...ecken.map(e => e[1]))];
        return { t, o, ab, wl, wr, b };
    }
    // Planpunkt des Ventils (ungedreht, Teilkoordinaten) → Pixel im 2D-Element
    function punkt2D(obj, x, y) {
        if (echt(obj)) {
            const R = echtRoh(obj), [gx, gy] = echtLokal(R, x, y), [wx, wy] = trafo(R.t, gx, gy);
            return [(wx - R.b[0]) * G2D, (wy - R.b[1]) * G2D];
        }
        if (gehaeuse(obj)) {
            const R = gehaeuseRoh(obj), [gx, gy] = gLokal(R.t, x, y), [wx, wy] = trafo(R.t, gx, gy);
            return [(wx - R.b[0]) * G2D, (wy - R.b[1]) * G2D];
        }
        const t = teilAus2D(obj), [rx, ry] = trafo(t, x, y), L0 = lage2D(obj), B = L0.b, sk = L0.bau ? G2D : S2D;
        return [(rx - B[0]) * sk, (ry - B[1]) * sk];
    }
    function lage2D(obj) {
        if (echt(obj)) {
            const R = echtRoh(obj), t = R.t;
            const ports = geo(t).ports.filter(p => !(R.ab[p.id] && R.ab[p.id].art && R.ab[p.id].art !== 'offen')).map(p => {
                const [gx, gy] = R.portXY(p), [x, y] = trafo(t, gx, gy);
                return { id: p.id, nr: p.nr || p.id, lx: (x - R.b[0]) * G2D, ly: (y - R.b[1]) * G2D, art: p.art, dir: trafoDir(t, p.dir) };
            });
            return { b: R.b, w: (R.b[2] - R.b[0]) * G2D, h: (R.b[3] - R.b[1]) * G2D, ports, echt: true };
        }
        if (gehaeuse(obj)) {
            const R = gehaeuseRoh(obj), t = R.t;
            const ports = geo(t).ports.filter(p => !(R.ab[p.id] && R.ab[p.id].art && R.ab[p.id].art !== 'offen')).map(p => {
                const [gx, gy] = gLokal(t, p.x, p.y), [x, y] = trafo(t, gx, gy);
                return { id: p.id, nr: p.nr || p.id, lx: (x - R.b[0]) * G2D, ly: (y - R.b[1]) * G2D, art: p.art, dir: trafoDir(t, p.dir) };
            });
            return { b: R.b, w: (R.b[2] - R.b[0]) * G2D, h: (R.b[3] - R.b[1]) * G2D, ports, gehaeuse: true };
        }
        if (bau(obj)) {
            const t = teilAus2D(obj), G = geo(t), Rr = BAU[t.typ].rand;
            const pk = [[Rr[0] - 2, Rr[1] - 2], [Rr[2] + 2, Rr[1] - 2], [Rr[0] - 2, Rr[3] + 2], [Rr[2] + 2, Rr[3] + 2]];
            for (const p of G.ports) pk.push([p.x - 5, p.y - 5], [p.x + 5, p.y + 5]);
            const w = pk.map(([x, y]) => trafo(t, x, y));
            const b = [Math.min(...w.map(e => e[0])), Math.min(...w.map(e => e[1])), Math.max(...w.map(e => e[0])), Math.max(...w.map(e => e[1]))];
            const ports = G.ports.map(p => { const [x, y] = trafo(t, p.x, p.y); return { id: p.id, nr: p.nr || p.id, lx: (x - b[0]) * G2D, ly: (y - b[1]) * G2D, art: p.art, dir: trafoDir(t, p.dir) }; });
            return { b, w: (b[2] - b[0]) * G2D, h: (b[3] - b[1]) * G2D, ports, bau: true };
        }
        return mitMini(obj, null, P => {
            let b = [Infinity, Infinity, -Infinity, -Infinity];
            for (const t of P.teile) { const w = boxWelt(t); b = [Math.min(b[0], w[0]), Math.min(b[1], w[1]), Math.max(b[2], w[2]), Math.max(b[3], w[3])]; }
            const t = P.teile[0], belegt = new Set(P.leitungen.map(l => l.a.t === t.id ? l.a.p : l.b.p));
            const ports = geo(t).ports.filter(p => !belegt.has(p.id)).map(p => {
                const [x, y] = trafo(t, p.x, p.y);
                return { id: p.id, nr: p.nr || p.id, lx: (x - b[0]) * S2D, ly: (y - b[1]) * S2D, art: p.art, dir: trafoDir(t, p.dir) };
            });
            return { b, w: Math.max(12, (b[2] - b[0]) * S2D), h: Math.max(12, (b[3] - b[1]) * S2D), ports };
        });
    }
    function pfeilSicher(doc) {
        if (!doc || doc.getElementById('fp-pfeil')) return;
        const s = doc.createElementNS(NS, 'svg');
        s.setAttribute('width', 0); s.setAttribute('height', 0); s.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
        const d = doc.createElementNS(NS, 'defs'), m = doc.createElementNS(NS, 'marker');
        for (const [k, v] of Object.entries({ id: 'fp-pfeil', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' })) m.setAttribute(k, v);
        const p = doc.createElementNS(NS, 'path'); p.setAttribute('d', 'M0,0 L10,5 L0,10 z'); p.setAttribute('fill', 'currentColor');
        m.appendChild(p); d.appendChild(m); s.appendChild(d); (doc.body || doc.documentElement).appendChild(s);
    }
    // Symbol in das 2D-Element zeichnen
    function symbol2D(obj) {
        const elx = obj.el; if (!elx) return;
        const doc = elx.ownerDocument || document;
        pfeilSicher(doc);
        const L = lage2D(obj);
        // Der Körper bleibt stehen, wenn das Bild wächst (Schalldämpfer, Betätigung, Darstellung):
        // Weltlage des Teilursprungs festhalten
        const flach = L.gehaeuse || L.echt || L.bau, sk = flach ? G2D : S2D, ur = [-L.b[0] * sk, -L.b[1] * sk];
        if (obj._fpUr && (obj._fpUr[0] !== ur[0] || obj._fpUr[1] !== ur[1]) && typeof obj.x === 'number') {
            obj.x = Math.round(obj.x + obj._fpUr[0] - ur[0]); obj.y = Math.round(obj.y + obj._fpUr[1] - ur[1]);
            try { updateObjTransform(obj); } catch (e) {}
        }
        obj._fpUr = ur;
        obj.width = Math.round(L.w); obj.height = Math.round(L.h);
        elx.style.width = obj.width + 'px'; elx.style.height = obj.height + 'px';
        let s = elx.querySelector('svg.fp2d'); if (s) s.remove();
        elx.style.background = flach ? 'transparent' : 'rgba(255,255,255,.92)';
        elx.style.border = flach ? 'none' : '1px solid #90a4ae';
        elx.style.boxShadow = flach ? 'none' : '';
        elx.classList.toggle('fp-geh', !!flach);
        obj._echtR = null; obj._fpSig = null; obj._echtLuft = null;
        if (L.echt) { const alt = bildDok; bildDok = doc; try { s = echtZeichnen(obj, doc, L); } finally { bildDok = alt; } }
        else if (L.gehaeuse) { const alt = bildDok; bildDok = doc; try { s = gehaeuseZeichnen(obj, doc, L); } finally { bildDok = alt; } }
        else if (L.bau) { const alt = bildDok; bildDok = doc; try { s = bauSvg(obj, doc, L); } finally { bildDok = alt; } }
        else mitMini(obj, doc, P => {
            s = el('svg', { class: 'fp2d', width: obj.width, height: obj.height, viewBox: `${L.b[0]} ${L.b[1]} ${L.b[2] - L.b[0]} ${L.b[3] - L.b[1]}`,
                style: 'position:absolute;left:0;top:0;overflow:visible;color:#263238;--fp-papier:#fff;--fp-aktiv:#ffb300;pointer-events:none' });
            for (const t of P.teile) {
                const r = ((t.rot || 0) % 360 + 360) % 360;
                const g = el('g', { transform: `translate(${t.x},${t.y}) rotate(${r})${t.sp ? ' scale(-1,1)' : ''}`, 'data-t': t.id }, s);
                TYP[t.typ].zeichne(t, g, geo(t));
            }
        });
        elx.insertBefore(s, elx.firstChild);
        let lb = elx.querySelector('.f2d-norm-label');
        if (!lb) { lb = doc.createElement('div'); lb.className = 'f2d-label f2d-norm-label'; lb.style.top = '-16px'; elx.appendChild(lb); }
        lb.textContent = obj.normLabel || (TYP[fp2d(obj).typ] || {}).name || '';
        obj._fpStand = null;
    }
    // Gehäusebild eines Wegeventils (wie das alte 2D-Magnetventil, für jede Betätigung)
    const KAMMER = [['#e8f5e9', '#2e7d32'], ['#fff3e0', '#e65100'], ['#fff8e1', '#f57f17']];
    function gehaeuseZeichnen(obj, doc, L) {
        const R = gehaeuseRoh(obj), t = R.t, o = R.o, G = geo(t), n = G.n;
        const pfeilId = 'fpg-' + String(obj.id).replace(/[^\w-]/g, '');
        const mk = (tag, a, p) => { const e = doc.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
        const s = mk('svg', { class: 'fp2d fp-gehaeuse', width: Math.round(L.w), height: Math.round(L.h), viewBox: `${L.b[0]} ${L.b[1]} ${L.b[2] - L.b[0]} ${L.b[3] - L.b[1]}`,
            style: 'position:absolute;left:0;top:0;overflow:visible;color:#333;--fp-papier:#fff;--fp-aktiv:#ff9800;pointer-events:none' });
        const r = ((t.rot || 0) % 360 + 360) % 360;
        const g = mk('g', { transform: `rotate(${r})${t.sp ? ' scale(-1,1)' : ''}`, 'data-t': t.id }, s);
        const cp = mk('clipPath', { id: pfeilId }, mk('defs', {}, s));
        mk('rect', { x: KASTEN, y: 0, width: KASTEN, height: KASTEN }, cp);
        // Anschlussstutzen (fest am Gehäuse)
        for (const p of G.ports) {
            if (p.art === 's') continue;
            const [x, y] = gLokal(t, p.x, p.y);
            mk('line', { x1: x, y1: y < 0 ? 0 : KASTEN, x2: x, y2: y, stroke: '#333', 'stroke-width': 2 }, g);
            mk('rect', { x: x - 2.5, y: y < 0 ? y - 1 : y - 5, width: 5, height: 6, fill: '#333' }, g);
        }
        // Gehäuse mit Fenster; dahinter der Kammerblock, der beim Schalten durchwandert
        mk('rect', { x: KASTEN + 2, y: 2, width: KASTEN, height: KASTEN, fill: 'rgba(0,0,0,.25)', rx: 2 }, g);
        mk('rect', { x: KASTEN, y: 0, width: KASTEN, height: KASTEN, fill: '#eceff1' }, g);
        const fenster = mk('g', { 'clip-path': `url(#${pfeilId})` }, g);
        const block = mk('g', { class: 'fp-block', style: 'transition:transform .15s cubic-bezier(.4,0,.2,1)' }, fenster);
        const lage = VLAGE[o.wege] || VLAGE['3/2'];
        G.st.forEach((st, i) => {
            const x0 = i * KASTEN, [bg, fg] = KAMMER[n === 3 ? [0, 2, 1][i] : i] || KAMMER[0];
            const k = mk('g', { style: 'color:' + fg }, block);
            mk('rect', { x: x0, y: 0, width: KASTEN, height: KASTEN, fill: bg, stroke: '#333', 'stroke-width': 1 }, k);
            const pos = id => lage.oben[id] != null ? [x0 + lage.oben[id], 0] : [x0 + lage.unten[id], KASTEN];
            for (const [a, b] of st.w) {
                const [x1, y1] = pos(a), [x2, y2] = pos(b);
                const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
                mk('line', { x1, y1, x2: x2 - ux * 5, y2: y2 - uy * 5, stroke: 'currentColor', 'stroke-width': 2 }, k);
                mk('path', { d: `M${x2},${y2} L${x2 - ux * 7 - uy * 3.5},${y2 - uy * 7 + ux * 3.5} L${x2 - ux * 7 + uy * 3.5},${y2 - uy * 7 - ux * 3.5} Z`, fill: 'currentColor' }, k);
            }
            for (const z of st.zu) {
                const [x, y] = pos(z), dy = y < 20 ? 1 : -1;
                mk('path', { d: `M${x},${y} v${dy * 8} m-5,0 h10`, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, k);
            }
        });
        mk('rect', { x: KASTEN, y: 0, width: KASTEN, height: KASTEN, fill: 'none', stroke: '#333', 'stroke-width': 2, rx: 2 }, g);
        // Betätigungen links und rechts, fest am Gehäuse
        for (const [seite, b, x, sg, v] of [['L', o.links, KASTEN, -1, o.varL], ['R', o.rechts, 2 * KASTEN, 1, o.varR]]) {
            const bg = mk('g', { class: 'fp-g-bet', 'data-seite': seite }, g);
            if (b === 'magnet') {
                const w = betBreite(b), x0 = sg < 0 ? x - w : x;
                mk('rect', { class: 'fp-g-spule', x: x0, y: 8, width: w, height: 24, fill: '#fff', stroke: '#333', 'stroke-width': 2, rx: 2 }, bg);
                mk('line', { x1: x0, y1: 30, x2: x0 + w, y2: 10, stroke: '#333', 'stroke-width': 1 }, bg);
                if (v) { const tx = mk('text', { x: x + sg * w / 2, y: -4, 'text-anchor': 'middle', 'font-size': 8, 'font-family': 'sans-serif', fill: '#1565c0', transform: r ? `rotate(${-r} ${x + sg * w / 2} -4)` : '' }, bg); tx.textContent = v; }
            } else {
                const gg = mk('g', { style: 'color:#333' }, bg);
                const ziel = b === 'feder' ? mk('g', { class: 'fp-g-feder', style: `transform-box:view-box;transform-origin:${x}px 20px;transition:transform .15s ease` }, gg) : gg;
                betSymbol(ziel, b, x, sg, false);
                gg.querySelectorAll('line,polyline,path,rect,circle').forEach(e => { if (e.getAttribute('stroke')) e.setAttribute('stroke-width', 2); });
            }
            // Steuerleitung vom Steueranschluss
            for (const p of G.ports) if (p.art === 's' && p.seite === seite) {
                const [px] = gLokal(t, p.x, p.y);
                mk('line', { x1: px, y1: 20, x2: x + sg * betBreite(b), y2: 20, stroke: '#333', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }, g);
                mk('rect', { x: px - 3, y: 17, width: 6, height: 6, fill: '#333' }, g);
            }
        }
        // Angedockte Schalldämpfer und Blindstopfen sitzen direkt am Stutzen
        for (const pid of Object.keys(R.ab)) {
            const a = R.ab[pid]; if (!a || !a.art || a.art === 'offen') continue;
            const p = G.ports.find(q => q.id === pid); if (!p) continue;
            const [x, y] = gLokal(t, p.x, p.y);
            abschlussBild(gg => g.appendChild(gg), x, y, a, 'gehaeuse', '', doc, pid);
        }
        return s;
    }
    // ------------------------------------------------------------
    // Darstellung 3/4: das Ventil, wie es wirklich aussieht – aufgeschnitten ('schnitt', mit
    // Kolbenschieber, Dichtungen, Luftwegen und Endlagen) oder geschlossen ('aussen').
    // Der Schieber ist EIN Teil, das beim Schalten um eine Teilung wandert.
    // ------------------------------------------------------------
    const RP = 14, RBH = 2.6, RG = 0.25, RW = 26;   // Teilung, halbe Bohrung, Nutüberstand (Teilungen), Betätigerbreite
    // Schieber je Wegeart: Reihenfolge der Anschlüsse entlang der Achse, je Stellung Verschiebung s
    // (Teilungen) und Nuten n (relativ zum Schieber, in Teilungen)
    function schieber(o) {
        const w = o.wege || '3/2', n = ventilStellungen(o).length;
        if (w === '2/2') return { ord: ['1', '2'], pos: o.ruhe === 'offen' ? [{ s: 1, n: [[0, 1]] }, { s: 0, n: [[0, 1]] }] : [{ s: 0, n: [[0, 1]] }, { s: -1, n: [[0, 1]] }] };
        if (w === '3/2') return o.ruhe === 'offen' ? { ord: ['1', '2', '3'], pos: [{ s: 1, n: [[0, 1]] }, { s: 0, n: [[0, 1]] }] }
            : { ord: ['3', '2', '1'], pos: [{ s: 0, n: [[1, 2]] }, { s: -1, n: [[1, 2]] }] };
        // 4/2 wie 5/2: der zweite Abluftkanal (vorn) ist innen mit 3 verbunden
        const ord = ['5', '4', '1', '2', '3'], a = { s: 0, n: [[1, 2], [3, 4]] }, b = { s: -1, n: [[1, 2], [3, 4]] };
        if (n !== 3) return { ord, pos: [a, b] };
        const m = o.mitte === 'entlueftet' ? { s: -0.5, n: [[0.5, 1.5], [3.5, 4.5]] } : o.mitte === 'belueftet' ? { s: -0.5, n: [[1.5, 3.5]] } : { s: -0.5, n: [[1, 2], [3, 4]] };
        return { ord, pos: [a, m, b] };
    }
    // Darstellung eines Wegeventils: eigene Wahl (fp.bild) oder der zentrale Umschalter der 2D-Anlage
    const BILDER = ['gehaeuse', 'symbol', 'schnitt', 'aussen'];
    const bildStandard = () => { try { const b = localStorage.getItem('valisVentilBild'); return BILDER.includes(b) ? b : 'gehaeuse'; } catch (e) { return 'gehaeuse'; } };
    const darst = obj => { const f = fp2d(obj); if (f.typ !== 'ventil' && !BAU[f.typ]) return 'symbol'; return BILDER.includes(f.bild) ? f.bild : bildStandard(); };
    const bau = obj => { const f = fp2d(obj); return f.typ !== 'ventil' && !!BAU[f.typ] && darst(obj) !== 'symbol'; };
    const mitBild = obj => { const f = obj && obj.type === 'pneu_fp' && obj.pneu && obj.pneu.fp; return !!f && (f.typ === 'ventil' || !!BAU[f.typ]); };
    // Zentraler Umschalter: alle Wegeventile der 2D-Anlage in einer Darstellung; alte 2D-Magnetventile
    // werden dafür (wie bei der ersten Menüänderung) zum frei konfigurierbaren Fluidplan-Teil.
    window._fpAlleVentile = function (bild) {
        if (!BILDER.includes(bild)) return 0;
        try { localStorage.setItem('valisVentilBild', bild); } catch (e) {}
        const F = fabrik() || [];
        let umbau = false;
        if (bild !== 'gehaeuse') for (const v of F.filter(q => q.type === 'valve_pneu')) { const r = ventilUmbauen(v, fpVonVentil(v)); if (r === true) umbau = true; }
        if (umbau) { try { anlageAbgleichen(); } catch (e) {} }
        let n = 0;
        for (const o of (fabrik() || [])) {
            if (!mitBild(o)) continue;
            o.pneu.fp.bild = bild; n++;
            try { symbol2D(o); updateObjTransform(o); } catch (e) {}
        }
        for (const o of (fabrik() || [])) if (zylArt(o)) { (o.pneu = o.pneu || {}).bild = bild; n++; try { window._fpZylBild(o); } catch (e) {} }
        for (const o of (fabrik() || [])) if (hydBildArt(o)) { (o.pneu = o.pneu || {}).bild = bild; n++; try { window._fpHydBild(o); } catch (e) {} }
        knopfBild();
        try { if (typeof window.drawPneumaticHoses === 'function') window.drawPneumaticHoses(); } catch (e) {}
        try { if (typeof saveFactoryState === 'function') saveFactoryState(); } catch (e) {}
        return n;
    };
    window._fpBildStandard = bildStandard;
    // Kleiner Knopf in der 2D-Anlage: zeigt die aktuelle Form als Bildchen, Klick = nächste Form
    const BILD_NAME = { gehaeuse: 'Gehäuse (anschaulich)', symbol: 'Normsymbol (wie im Plan)', schnitt: 'echt, aufgeschnitten', aussen: 'echt, geschlossen' };
    const BILD_ICON = {
        gehaeuse: '<rect x="3" y="4" width="16" height="12" rx="1.5" fill="#ffe0b2" stroke="#fff" stroke-width="1.4"/><path d="M6,13 L15,7" stroke="#e65100" stroke-width="1.8"/><path d="M15,7 l-3.5,0.3 l1.6,2.5 z" fill="#e65100"/>',
        symbol: '<rect x="2" y="5" width="9" height="10" fill="none" stroke="#fff" stroke-width="1.3"/><rect x="11" y="5" width="9" height="10" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M4,14 L9,7 M13,7 V14" stroke="#fff" stroke-width="1.1"/><path d="M9,7 l-2.6,0.6 l1.6,1.6 z M13,7 l-1.4,2.4 h2.8 z" fill="#fff"/>',
        schnitt: '<defs><pattern id="pbs" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M-1,1 L1,-1 M0,3 L3,0" stroke="#90a4ae" stroke-width="0.7"/></pattern></defs><rect x="2" y="4" width="18" height="12" fill="url(#pbs)" stroke="#fff" stroke-width="1.3"/><rect x="3.5" y="8" width="15" height="4" fill="#eceff1"/><rect x="6" y="8" width="3" height="4" fill="#78909c"/><rect x="13" y="8" width="3" height="4" fill="#78909c"/><rect x="5" y="7" width="12" height="1" fill="#29b6f6"/>',
        aussen: '<defs><linearGradient id="pba" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eceff1"/><stop offset="1" stop-color="#78909c"/></linearGradient></defs><rect x="2" y="5" width="18" height="10" rx="1.5" fill="url(#pba)" stroke="#fff" stroke-width="1"/><rect x="6" y="1.5" width="3" height="3.5" fill="#b0bec5"/><rect x="13" y="1.5" width="3" height="3.5" fill="#b0bec5"/><rect x="9.5" y="15" width="3" height="3.5" fill="#b0bec5"/>'
    };
    function knopfBild() {
        const k = document.getElementById('btn-pneubild'); if (!k) return;
        const b = bildStandard(), i = BILDER.indexOf(b), n = BILDER[(i + 1) % BILDER.length];
        k.innerHTML = `<svg width="22" height="20" viewBox="0 0 22 20" style="display:block">${BILD_ICON[b]}</svg>`;
        k.title = `Pneumatik- und Hydraulikteile: ${BILD_NAME[b]}. Klick: alle Teile als ${BILD_NAME[n]}. Einzelne Teile per Rechtsklick → Darstellung.`;
        k.setAttribute('data-bild', b);
    }
    window._fpBildWeiter = () => { const i = BILDER.indexOf(bildStandard()); return window._fpAlleVentile(BILDER[(i + 1) % BILDER.length]); };
    (function knopfSetzen() { if (document.getElementById('btn-pneubild')) knopfBild(); else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopfSetzen, { once: true }); })();
    const echt = obj => { if (fp2d(obj).typ !== 'ventil') return false; const d = darst(obj); return d === 'schnitt' || d === 'aussen'; };
    function echtRoh(obj) {
        const t = teilAus2D(obj), o = t.o, f = fp2d(obj), ab = f.ab || {};
        const S = schieber(o), N = S.ord.length;
        const xi = i => 60 + (i - (N - 1) / 2) * RP;
        const sh = S.pos.map(p => p.s), sMin = Math.min(...sh), sMax = Math.max(...sh);
        const spL = -0.9, spR = N - 1 + 0.9;
        const boL = xi(spL + sMin - 0.15), boR = xi(spR + sMax + 0.15);
        const kL = boL - 5, kR = boR + 5;
        const lage = VLAGE[o.wege] || VLAGE['3/2'];
        const oben = id => lage.oben[id] != null;
        let unten = 52;
        for (const pid of Object.keys(ab)) if (ab[pid] && ab[pid].art && ab[pid].art !== 'offen') unten = Math.max(unten, 50 + (ab[pid].art === 'stopfen' ? 14 : 36));
        const ecken = [[kL - RW - 14, -16], [kR + RW + 14, -16], [kL - RW - 14, unten], [kR + RW + 14, unten]].map(([x, y]) => trafo(t, x, y));
        const b = [Math.min(...ecken.map(e => e[0])), Math.min(...ecken.map(e => e[1])), Math.max(...ecken.map(e => e[0])), Math.max(...ecken.map(e => e[1]))];
        const portXY = p => {
            if (p.art === 's') return p.seite === 'L' ? [kL - RW - 10, 20] : [kR + RW + 10, 20];
            const i = S.ord.indexOf(p.id); return [xi(i), oben(p.id) ? -10 : 50];
        };
        return { t, o, ab, S, N, xi, sMin, sMax, spL, spR, boL, boR, kL, kR, oben, b, portXY };
    }
    // Planpunkt (Rolle) → lokaler Punkt der echten Darstellung
    function echtLokal(R, x, y) {
        const n = ventilStellungen(R.o).length;
        const rad = b => b === 'rolle' || b === 'rolle_leer';
        if (x < 0) return rad(R.o.links) ? [R.kL - 17, 38] : [R.kL - 18, 20];
        if (x > n * KASTEN) return rad(R.o.rechts) ? [R.kR + 17, 38] : [R.kR + 18, 20];
        return [(R.kL + R.kR) / 2, y];
    }
    // Luft blau nach Druck (bis 6 bar), Öl bernstein in Ruhe und rot nach Druck (bis 100 bar)
    const fluidFarbe = (p, hyd, geh) => hyd ? (p > P_AN_H ? `rgba(229,57,53,${(0.35 + 0.6 * Math.min(1, p / 100)).toFixed(2)})` : '#ffe082')
        : p > P_AN ? `rgba(41,182,246,${(0.35 + 0.6 * Math.min(1, p / 6)).toFixed(2)})` : (geh ? '#fff' : '#eceff1');
    const luftFarbe = (p, hyd) => fluidFarbe(p, hyd, false);
    const pAn = hyd => hyd ? P_AN_H : P_AN;
    function echtZeichnen(obj, doc, L) {
        const R = echtRoh(obj), t = R.t, o = R.o, G = geo(t), S = R.S, schnitt = darst(obj) === 'schnitt';
        const uid = String(obj.id).replace(/[^\w-]/g, '');
        const mk = (tag, a, p) => { const e = doc.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
        const s = mk('svg', { class: 'fp2d fp-echt', width: Math.round(L.w), height: Math.round(L.h), viewBox: `${L.b[0]} ${L.b[1]} ${L.b[2] - L.b[0]} ${L.b[3] - L.b[1]}`,
            style: 'position:absolute;left:0;top:0;overflow:visible;color:#37474f;--fp-papier:#fff;--fp-aktiv:#2196f3;pointer-events:none' });
        const defs = mk('defs', {}, s);
        const pat = mk('pattern', { id: 'fps-' + uid, patternUnits: 'userSpaceOnUse', width: 4, height: 4 }, defs);
        mk('rect', { width: 4, height: 4, fill: '#cfd8dc' }, pat);
        mk('path', { d: 'M-1,1 L1,-1 M0,4 L4,0 M3,5 L5,3', stroke: '#78909c', 'stroke-width': 0.6 }, pat);
        const grad = mk('linearGradient', { id: 'fpa-' + uid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        mk('stop', { offset: '0', 'stop-color': '#eceff1' }, grad); mk('stop', { offset: '0.45', 'stop-color': '#b0bec5' }, grad); mk('stop', { offset: '1', 'stop-color': '#78909c' }, grad);
        const fuell = schnitt ? `url(#fps-${uid})` : `url(#fpa-${uid})`;
        const r = ((t.rot || 0) % 360 + 360) % 360;
        const g = mk('g', { transform: `rotate(${r})${t.sp ? ' scale(-1,1)' : ''}`, 'data-t': t.id }, s);
        const txt = (x, y, str, a) => { const e = mk('text', Object.assign({ x, y, 'font-size': 7, 'font-family': 'sans-serif', 'text-anchor': 'middle', fill: '#263238', transform: r ? `rotate(${-r} ${x} ${y})` : '' }, a || {}), g); e.textContent = str; return e; };
        // Anschlüsse: Verschraubung außen, Kanal im Gehäuse
        for (const p of G.ports) {
            if (p.art === 's') continue;
            const [x, y] = R.portXY(p), ob = y < 20;
            mk('rect', { x: x - 2, y: ob ? y : 38, width: 4, height: ob ? 2 - y : y - 38, fill: '#90a4ae', stroke: '#455a64', 'stroke-width': 0.6 }, g);
            mk('rect', { class: 'fp-r-ring', 'data-p': p.id, x: x - 5, y: ob ? -3 : 38, width: 10, height: 5, rx: 1, fill: '#b0bec5', stroke: '#455a64', 'stroke-width': 0.8 }, g);
            txt(x + 9, ob ? 0 : 45, p.nr || p.id, { 'font-weight': 'bold' });
        }
        // Gehäuse
        mk('rect', { x: R.kL, y: 2, width: R.kR - R.kL, height: 36, rx: schnitt ? 1 : 3, fill: fuell, stroke: '#37474f', 'stroke-width': 1.4 }, g);
        if (!schnitt) {
            mk('line', { x1: R.kL + 2, y1: 4, x2: R.kR - 2, y2: 4, stroke: '#fff', 'stroke-opacity': 0.7, 'stroke-width': 1 }, g);
            // Deckelfugen und Schrauben
            for (const x of [R.boL - 1, R.boR + 1]) mk('line', { x1: x, y1: 2, x2: x, y2: 38, stroke: '#546e7a', 'stroke-width': 0.8 }, g);
            for (const x of [R.kL + 2.5, R.kR - 2.5]) for (const y of [7, 33]) mk('circle', { cx: x, cy: y, r: 1.3, fill: '#546e7a' }, g);
            txt((R.kL + R.kR) / 2, 23, (o.wege || '') + '-Wegeventil', { fill: '#546e7a', 'font-size': 6.5 });
        }
        if (schnitt) {
            // Kanäle (Farbe = Druck), Bohrung, Endlagen
            S.ord.forEach((id, i) => {
                const innen = !G.ports.some(p => p.id === id);
                const ob = !innen && R.oben(id), x = R.xi(i);
                mk('rect', { class: 'fp-r-kanal', 'data-p': innen ? '3' : id, x: x - RBH, y: ob ? 2 : 27, width: RBH * 2, height: 11, fill: '#eceff1', stroke: '#455a64', 'stroke-width': 0.5 }, g);
                if (innen) {
                    // innen mit 3 verbunden
                    mk('path', { class: 'fp-r-kanal', 'data-p': '3', d: `M${x - RBH},38 V41 H${R.xi(S.ord.indexOf('3')) + RBH} V38`, fill: 'none', stroke: '#90a4ae', 'stroke-width': 1.5, 'stroke-dasharray': '2 1.5' }, g);
                }
            });
            mk('rect', { x: R.boL, y: 13, width: R.boR - R.boL, height: 14, fill: '#f5f5f5', stroke: '#37474f', 'stroke-width': 0.8 }, g);
            for (const x of [R.boL, R.boR - 1.6]) mk('rect', { class: 'fp-r-anschlag', x, y: 13, width: 1.6, height: 14, fill: '#455a64' }, g);
            // Schieber (wandert als Ganzes)
            const nS = R.S.pos.length, ruhe = nS === 3 ? 1 : nS - 1;
            const sg = mk('g', { class: 'fp-r-schieber', style: `transform:translateX(${R.S.pos[ruhe].s * RP}px);transition:transform .25s cubic-bezier(.4,0,.2,1)` }, g);
            schieberInhalt(R, sg, ruhe, doc, mk);
        }
        // Betätiger links und rechts
        for (const [seite, b, x0, sg, v] of [['L', o.links, R.kL, -1, o.varL], ['R', o.rechts, R.kR, 1, o.varR]]) {
            const bg = mk('g', { class: 'fp-g-bet', 'data-seite': seite }, g);
            echtBetaetiger(bg, b, x0, sg, schnitt, fuell, mk, R, seite);
            if (b === 'magnet' && v) txt(x0 + sg * FR / 2, -7, v, { fill: '#1565c0', 'font-size': 8 });
        }
        // Schieber samt Stößel, Anker und Federteller über die Betätigerräume legen
        const sgr = g.querySelector('.fp-r-schieber'); if (sgr) g.appendChild(sgr);
        // Angedockte Schalldämpfer und Stopfen
        for (const pid of Object.keys(R.ab)) {
            const a = R.ab[pid]; if (!a || !a.art || a.art === 'offen') continue;
            const p = G.ports.find(q => q.id === pid); if (!p) continue;
            const [x, y] = R.portXY(p);
            abschlussBild(gg => g.appendChild(gg), x, y, a, schnitt ? 'schnitt' : 'aussen', uid, doc, pid);
        }
        return s;
    }
    // Kolbenschieber für Stellung k: Nuten (Luft), Steuerkolben mit O-Ringen, Stößel, Federteller
    function schieberInhalt(R, sg, k, doc, mk) {
        while (sg.firstChild) sg.removeChild(sg.firstChild);
        const P = R.S.pos[k] || R.S.pos[0], nut = P.n.slice().sort((a, b) => a[0] - b[0]);
        sg.setAttribute('data-nut', JSON.stringify(nut));
        for (const [a, c] of nut) mk('rect', { class: 'fp-r-nut', 'data-a': a, 'data-c': c, x: R.xi(a - RG), y: 13.6, width: (c - a + 2 * RG) * RP, height: 12.8, fill: '#eceff1' }, sg);
        mk('rect', { x: R.xi(R.spL), y: 17.6, width: (R.spR - R.spL) * RP, height: 4.8, fill: '#78909c', stroke: '#37474f', 'stroke-width': 0.6 }, sg);
        // Kolben (Stege) zwischen den Nuten
        const stege = []; let x = R.spL;
        for (const [a, c] of nut) { if (a - RG > x) stege.push([x, a - RG]); x = Math.max(x, c + RG); }
        if (x < R.spR) stege.push([x, R.spR]);
        for (const [a, c] of stege) {
            const x1 = R.xi(a), x2 = R.xi(c);
            mk('rect', { x: x1, y: 13.7, width: x2 - x1, height: 12.6, rx: 0.8, fill: '#90a4ae', stroke: '#37474f', 'stroke-width': 0.8 }, sg);
            mk('line', { x1: x1 + 0.8, y1: 15, x2: x2 - 0.8, y2: 15, stroke: '#fff', 'stroke-opacity': 0.8, 'stroke-width': 0.8 }, sg);
            // O-Ringe an beiden Enden des Kolbens
            for (const xr of (x2 - x1 > 7 ? [x1 + 2.4, x2 - 2.4] : [(x1 + x2) / 2])) for (const yr of [14.4, 25.6]) mk('ellipse', { cx: xr, cy: yr, rx: 1.4, ry: 1.1, fill: '#212121' }, sg);
        }
        // Stößel durch die Deckel zu den Betätigern
        mk('rect', { x: R.kL - 3 - Math.max(0, R.sMax) * RP, y: 18.5, width: R.xi(R.spL) - R.kL + 3 + Math.max(0, R.sMax) * RP, height: 3, fill: '#90a4ae', stroke: '#546e7a', 'stroke-width': 0.5 }, sg);
        mk('rect', { x: R.xi(R.spR), y: 18.5, width: R.kR + 3 - R.xi(R.spR) - Math.min(0, R.sMin) * RP, height: 3, fill: '#90a4ae', stroke: '#546e7a', 'stroke-width': 0.5 }, sg);
        // Federteller am Stößelende: drückt die Feder beim Umschalten zusammen
        for (const [seite, b] of [['L', R.o.links], ['R', R.o.rechts]]) {
            if (b === 'magnet') {
                // Anker am Stößelende: wandert mit dem Schieber im Polrohr
                const xe = seite === 'R' ? R.kR + 3 - Math.min(0, R.sMin) * RP : R.kL - 3 - Math.max(0, R.sMax) * RP, sd = seite === 'R' ? 1 : -1, la = 9;
                mk('rect', { class: 'fp-r-anker', 'data-seite': seite, x: Math.min(xe, xe + sd * la), y: 16, width: la, height: 8, rx: 0.6, fill: '#90a4ae', stroke: '#37474f', 'stroke-width': 0.7 }, sg);
                mk('line', { x1: xe + sd * 1.5, y1: 17.2, x2: xe + sd * (la - 1.5), y2: 17.2, stroke: '#fff', 'stroke-opacity': 0.8, 'stroke-width': 0.7 }, sg);
                continue;
            }
            if (b !== 'feder') continue;
            const xe = seite === 'R' ? R.kR + 3 - Math.min(0, R.sMin) * RP : R.kL - 3 - Math.max(0, R.sMax) * RP, sd = seite === 'R' ? 1 : -1;
            mk('rect', { class: 'fp-r-teller', x: Math.min(xe, xe + sd * 2.2), y: 12.6, width: 2.2, height: 14.8, rx: 0.5, fill: '#78909c', stroke: '#37474f', 'stroke-width': 0.6 }, sg);
            mk('rect', { x: Math.min(xe + sd * 2.2, xe + sd * 4.2), y: 17, width: 2, height: 6, fill: '#90a4ae', stroke: '#546e7a', 'stroke-width': 0.4 }, sg);   // Führungszapfen in der Feder
        }
    }
    // Federraum: Abstand Deckelkante -> Federteller in Ruhe und Federlänge
    const FR = 34;   // Länge Federraum außen
    function federMass(R, seite) {
        const nS = R.S.pos.length, sR = R.S.pos[nS === 3 ? 1 : nS - 1].s;
        const rest = 3 + 2.2 + (seite === 'R' ? sR - Math.min(0, R.sMin) : Math.max(0, R.sMax) - sR) * RP;
        return { rest, L: Math.max(6, FR - 2 - rest) };
    }
    function echtBetaetiger(bg, b, x0, s, schnitt, fuell, mk, R, seite) {
        const X = d => x0 + s * d, rx = (a, c) => Math.min(X(a), X(c)), bw = (a, c) => Math.abs(c - a);
        const bew = mk('g', { class: 'fp-r-bew' }, bg);
        if (b === 'magnet') {
            mk('rect', { x: rx(0, FR), y: 6, width: FR, height: 28, rx: 2, fill: schnitt ? fuell : '#37474f', stroke: '#263238', 'stroke-width': 1.2 }, bg);
            if (schnitt) {
                // Polrohr mit beweglichem Anker (sitzt am Stößel, siehe schieberInhalt) und festem Polkern
                mk('rect', { x: rx(0, FR - 2), y: 15.2, width: FR - 2, height: 9.6, fill: '#f5f5f5', stroke: '#455a64', 'stroke-width': 0.5 }, bg);
                for (const y of [9, 25]) {
                    mk('rect', { class: 'fp-r-wicklung', x: rx(3, FR - 3), y, width: FR - 6, height: 6, fill: '#b87333', stroke: '#6d4c41', 'stroke-width': 0.6 }, bg);
                    for (let d = 5; d < FR - 3; d += 2.5) mk('line', { x1: X(d), y1: y, x2: X(d), y2: y + 6, stroke: '#6d4c41', 'stroke-width': 0.4 }, bg);
                }
                mk('rect', { class: 'fp-r-polkern', x: rx(0.5, 3), y: 15.6, width: 2.5, height: 8.8, fill: '#607d8b', stroke: '#37474f', 'stroke-width': 0.6 }, bg);
            } else {
                mk('rect', { x: rx(FR / 2 - 6, FR / 2 + 6), y: -2, width: 12, height: 8, rx: 1, fill: '#212121' }, bg);
                mk('circle', { class: 'fp-r-led', cx: X(FR - 6), cy: 11, r: 2.2, fill: '#5d4037', stroke: '#212121', 'stroke-width': 0.5 }, bg);
                mk('circle', { cx: X(FR - 6), cy: 28, r: 2.4, fill: '#ffb300', stroke: '#6d4c41', 'stroke-width': 0.5 }, bg);   // Handhilfsbetätigung
            }
        } else if (b === 'feder') {
            mk('rect', { x: rx(0, FR), y: 8, width: FR, height: 24, rx: 3, fill: schnitt ? fuell : '#b0bec5', stroke: '#37474f', 'stroke-width': 1.2 }, bg);
            if (schnitt) {
                const M = federMass(R, seite), L = M.L, xa = FR - 2, n = 10, pts = [];
                mk('rect', { x: rx(0, xa), y: 12, width: xa, height: 16, fill: '#f5f5f5', stroke: '#455a64', 'stroke-width': 0.5 }, bg);
                for (let i = 0; i <= n; i++) pts.push((X(xa) - s * i * L / n) + ',' + (20 + (i === 0 || i === n ? 0 : (i % 2 ? -6.5 : 6.5))));
                mk('polyline', { class: 'fp-r-feder', 'data-l': L, points: pts.join(' '), fill: 'none', stroke: '#455a64', 'stroke-width': 1.4, 'stroke-linejoin': 'round', style: `transform-box:view-box;transform-origin:${X(xa)}px 20px;transition:transform .25s cubic-bezier(.4,0,.2,1)` }, bg);
                mk('rect', { x: rx(xa - 3, xa), y: 15, width: 3, height: 10, fill: '#78909c', stroke: '#455a64', 'stroke-width': 0.5 }, bg);   // Federsitz im Deckel
            } else {
                mk('line', { x1: X(FR - 3), y1: 10, x2: X(FR - 3), y2: 30, stroke: '#546e7a', 'stroke-width': 0.8 }, bg);
                mk('circle', { cx: X(FR - 1.5), cy: 20, r: 1.2, fill: '#37474f' }, bg);
            }
        } else if (b === 'pneu') {
            mk('rect', { x: rx(0, RW - 4), y: 8, width: RW - 4, height: 24, rx: 2, fill: schnitt ? fuell : '#b0bec5', stroke: '#37474f', 'stroke-width': 1.2 }, bg);
            if (schnitt) {
                mk('rect', { class: 'fp-r-steuer', x: rx(2, RW - 7), y: 11, width: RW - 9, height: 18, fill: '#eceff1', stroke: '#455a64', 'stroke-width': 0.5 }, bg);
                mk('rect', { x: rx(3, 6), y: 11.5, width: 3, height: 17, fill: '#78909c', stroke: '#455a64', 'stroke-width': 0.5 }, bew);
                for (const y of [12.3, 27.7]) mk('ellipse', { cx: X(4.5), cy: y, rx: 1.1, ry: 0.9, fill: '#212121' }, bew);
            }
            mk('rect', { x: rx(RW - 4, RW + 10), y: 18, width: 14, height: 4, fill: '#90a4ae', stroke: '#455a64', 'stroke-width': 0.6 }, bg);
            mk('rect', { class: 'fp-r-ring', 'data-p': (geo(R.t).ports.find(p => p.art === 's' && p.seite === seite) || {}).id || '', x: rx(RW + 4, RW + 9), y: 15, width: 5, height: 10, rx: 1, fill: '#b0bec5', stroke: '#455a64', 'stroke-width': 0.8 }, bg);
        } else if (b === 'rolle' || b === 'rolle_leer') {
            // Rollenhebel wie in echt: Kopfstück mit Stößel, Blechhebel mit Drehpunkt oben,
            // Laufrolle unten. Fährt der Nocken die Rolle an, kippt der Hebel und drückt den Stößel.
            mk('rect', { x: rx(0, 8), y: 4, width: 8, height: 32, rx: 1, fill: schnitt ? fuell : '#cfd8dc', stroke: '#37474f', 'stroke-width': 1 }, bg);
            if (schnitt) mk('rect', { x: rx(0, 8), y: 16.5, width: 8, height: 7, fill: '#f5f5f5', stroke: '#455a64', 'stroke-width': 0.4 }, bg);
            mk('rect', { class: 'fp-r-stoessel', x: rx(0, 11.5), y: 17.5, width: 11.5, height: 5, rx: 1, fill: '#b0bec5', stroke: '#546e7a', 'stroke-width': 0.6, style: 'transition:transform .12s ease' }, bg);
            const hb = mk('g', { class: 'fp-r-hebel', 'data-dreh': `${X(9)},3,${s * 9}`, style: 'transition:transform .12s ease' }, bg);
            mk('path', { d: `M${X(6)},0 L${X(12)},0 L${X(20)},35 L${X(14)},37 Z`, fill: '#b0bec5', stroke: '#546e7a', 'stroke-width': 0.9, 'stroke-linejoin': 'round' }, hb);
            mk('line', { x1: X(8), y1: 2, x2: X(15.5), y2: 33, stroke: '#eceff1', 'stroke-width': 0.8, 'stroke-opacity': 0.9 }, hb);
            for (const [dx, dy] of [[10, 9], [13.5, 22]]) mk('circle', { cx: X(dx), cy: dy, r: 1.3, fill: '#eceff1', stroke: '#78909c', 'stroke-width': 0.4 }, hb);
            if (b === 'rolle_leer') {
                // Gelenk für den Leerrücklauf: die Rolle knickt in Gegenrichtung weg
                mk('circle', { cx: X(15.8), cy: 27, r: 1.8, fill: '#78909c', stroke: '#37474f', 'stroke-width': 0.6 }, hb);
                mk('path', { d: `M${X(19)},25 q${s * 3},2 ${s * 1},6`, fill: 'none', stroke: '#37474f', 'stroke-width': 0.8, 'marker-end': 'url(#fp-pfeil)' }, hb);
            }
            mk('circle', { class: 'fp-r-rad', cx: X(17), cy: 38, r: 6, fill: '#212121', stroke: '#37474f', 'stroke-width': 1.4 }, hb);
            mk('circle', { cx: X(17), cy: 38, r: 2.2, fill: '#90a4ae', stroke: '#455a64', 'stroke-width': 0.5 }, hb);
            mk('circle', { cx: X(9), cy: 3, r: 2.2, fill: '#78909c', stroke: '#37474f', 'stroke-width': 0.7 }, bg);   // Drehpunkt
        } else {
            // Handbetätigung: Führungsbuchse, Stößel, Kopf
            mk('rect', { x: rx(0, 7), y: 14, width: 7, height: 12, fill: schnitt ? fuell : '#90a4ae', stroke: '#37474f', 'stroke-width': 1 }, bg);
            mk('rect', { x: rx(1, 14), y: 18, width: 13, height: 4, fill: '#b0bec5', stroke: '#546e7a', 'stroke-width': 0.6 }, bew);
            if (b === 'taster') mk('rect', { x: rx(13, 19), y: 10, width: 6, height: 20, rx: 2, fill: '#1565c0', stroke: '#0d47a1', 'stroke-width': 0.8 }, bew);
            else if (b === 'pilz') mk('path', { d: `M${X(13)},8 A12,12 0 0 ${s < 0 ? 0 : 1} ${X(13)},32 Z`, fill: '#c62828', stroke: '#8e0000', 'stroke-width': 0.8 }, bew);
            else if (b === 'hebel') {
                mk('circle', { cx: X(14), cy: 20, r: 2.2, fill: '#455a64' }, bew);
                mk('line', { class: 'fp-griff', 'data-dreh': `${X(14)},20,${-s * 25}`, x1: X(14), y1: 20, x2: X(24), y2: 2, stroke: '#455a64', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, bew);
                mk('circle', { class: 'fp-griff', 'data-dreh': `${X(14)},20,${-s * 25}`, cx: X(24), cy: 2, r: 3.4, fill: '#212121' }, bew);
            } else if (b === 'pedal') {
                mk('rect', { x: rx(10, 26), y: 32, width: 16, height: 3, fill: '#455a64' }, bg);
                mk('line', { class: 'fp-griff', 'data-dreh': `${X(14)},20,${-s * 15}`, x1: X(10), y1: 30, x2: X(26), y2: 12, stroke: '#37474f', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, bew);
            }
        }
    }
    // Drücke an den Anschlüssen aus dem Rechenkern (verbundener Plan oder Schattenplan)
    function echtDruecke(st, ids) {
        const f = () => ids.map(id => { const nz = sim && sim.netzVon[st.t.id + ':' + id]; return nz != null ? Math.max(0, druckVon(nz)) : 0; });
        return st.p === plan && st.s === sim ? f() : mitPlan(st.p, st.s, f);
    }
    function echtAnimieren(obj, st, k, ruhe, n, o, anL, anR) {
        const el2 = obj.el, R = obj._echtR || (obj._echtR = echtRoh(obj));
        const schnitt = darst(obj) === 'schnitt';
        const sig = k + '|' + anL + anR;
        if (obj._fpSig !== sig) {
            const altK = obj._fpStand;
            obj._fpStand = k; obj._fpSig = sig;
            const sg = el2.querySelector('.fp-r-schieber');
            if (sg) {
                const P = R.S.pos[k] || R.S.pos[0];
                if (sg.getAttribute('data-nut') !== JSON.stringify(P.n.slice().sort((a, b) => a[0] - b[0]))) {
                    const doc = el2.ownerDocument;
                    schieberInhalt(R, sg, k, doc, (tag, a, p) => { const e = doc.createElementNS(NS, tag); for (const kk in a) e.setAttribute(kk, a[kk]); if (p) p.appendChild(e); return e; });
                }
                sg.style.transform = `translateX(${P.s * RP}px)`;
                // Feder: zwischen Federteller (am Schieber) und Deckel gestaucht
                el2.querySelectorAll('.fp-g-bet').forEach(gb => {
                    const fd = gb.querySelector('.fp-r-feder'); if (!fd) return;
                    const PR = R.S.pos[ruhe] || P, Lf = +fd.getAttribute('data-l') || 20;
                    const d = (gb.getAttribute('data-seite') === 'R' ? P.s - PR.s : PR.s - P.s) * RP;   // >0: Teller fährt in den Federraum
                    fd.style.transform = `scaleX(${Math.min(1, Math.max(0.25, (Lf - d) / Lf))})`;
                });
            }
            el2.querySelectorAll('.fp-g-bet').forEach(g => {
                const L = g.getAttribute('data-seite') === 'L', an = L ? anL : anR, b = L ? o.links : o.rechts;
                if (b === 'magnet') {
                    g.querySelectorAll('.fp-r-wicklung').forEach(w => { w.setAttribute('fill', an ? '#ff9800' : '#b87333'); w.style.filter = an ? 'drop-shadow(0 0 3px #ff9800)' : ''; });
                    const a = el2.querySelector(`.fp-r-anker[data-seite="${L ? 'L' : 'R'}"]`); if (a) { a.setAttribute('fill', an ? '#ffcc80' : '#90a4ae'); a.style.filter = an ? 'drop-shadow(0 0 2px #ff9800)' : ''; }
                    const led = g.querySelector('.fp-r-led'); if (led) { led.setAttribute('fill', an ? '#ffeb3b' : '#5d4037'); led.style.filter = an ? 'drop-shadow(0 0 3px #ffeb3b)' : ''; }
                } else if (b === 'rolle' || b === 'rolle_leer') {
                    const s2 = L ? -1 : 1, hb = g.querySelector('.fp-r-hebel'), st2 = g.querySelector('.fp-r-stoessel'), rd = g.querySelector('.fp-r-rad');
                    if (hb) { const [px, py, w] = hb.getAttribute('data-dreh').split(','); hb.style.transformOrigin = `${px}px ${py}px`; hb.style.transformBox = 'view-box'; hb.style.transform = an ? `rotate(${w}deg)` : ''; }
                    if (st2) st2.style.transform = an ? `translateX(${-s2 * 2.5}px)` : '';
                    if (rd) { rd.setAttribute('stroke', an ? '#2196f3' : '#37474f'); rd.style.filter = an ? 'drop-shadow(0 0 3px #2196f3)' : ''; }
                } else if (b !== 'feder') betZeigen(g.querySelector('.fp-r-bew'), b, L ? -1 : 1, an, '#2196f3');
            });
            if (altK != null && altK !== k && st && typeof SoundEngine !== 'undefined') { try { SoundEngine.clack(); } catch (e) {} }
            obj.isActive = k !== ruhe;
        }
        // Luft: Kanäle, Nuten und Steuerkammern nach Druck färben (jedes dritte Bild)
        obj._echtTakt = ((obj._echtTakt || 0) + 1) % 3;
        if (obj._echtTakt && obj._echtLuft) return;
        const ids = geo(R.t).ports.map(p => p.id), pd = st ? echtDruecke(st, ids) : ids.map(() => 0), P = {};
        ids.forEach((id, i) => { P[id] = pd[i]; });
        const H = istHyd(R.t), PA = pAn(H);
        const key = ids.map(id => (P[id] > PA ? Math.round(P[id] * (H ? 0.25 : 4)) : 0)).join(',') + '|' + k;
        if (obj._echtLuft === key) return;
        obj._echtLuft = key;
        el2.querySelectorAll('.fp-r-kanal').forEach(e => { const f = luftFarbe(P[e.getAttribute('data-p')] || 0, H); if (e.tagName === 'path') e.setAttribute('stroke', P[e.getAttribute('data-p')] > PA || H ? f : '#90a4ae'); else e.setAttribute('fill', f); });
        el2.querySelectorAll('.fp-r-ring').forEach(e => { const p = P[e.getAttribute('data-p')] || 0; e.setAttribute('stroke', p > PA ? (H ? '#c62828' : '#0288d1') : '#455a64'); e.setAttribute('stroke-width', p > PA ? 1.6 : 0.8); });
        const Ps = R.S.pos[k] || R.S.pos[0];
        el2.querySelectorAll('.fp-r-nut').forEach(e => {
            const a = +e.getAttribute('data-a') + Ps.s, c = +e.getAttribute('data-c') + Ps.s;
            let p = 0; R.S.ord.forEach((id, i) => { if (i >= a - 0.01 && i <= c + 0.01) p = Math.max(p, P[G2Dport(R, id)] || 0); });
            e.setAttribute('fill', luftFarbe(p, H));
        });
        el2.querySelectorAll('.fp-r-steuer').forEach(e => { const g = e.closest('.fp-g-bet'), sd = g && g.getAttribute('data-seite'); const pp = geo(R.t).ports.find(q => q.art === 's' && q.seite === sd); e.setAttribute('fill', luftFarbe(pp ? P[pp.id] || 0 : 0, H)); });
    }
    const G2Dport = (R, id) => R.S.ord.indexOf(id) >= 0 && !geo(R.t).ports.some(p => p.id === id) ? '3' : id;
    // Zustand aus dem Rechenkern: verbundener Plan oder Schattenplan
    // ------------------------------------------------------------
    // Alle übrigen Pneumatik-Teile in der 2D-Anlage: Gehäuse (anschaulich, flach), aufgeschnitten
    // ('schnitt', schraffiert mit Luftwegen, Kugeln, Federn) oder geschlossen ('aussen').
    // Gezeichnet in Planeinheiten (Maßstab 1); die Anschlüsse liegen wie im Normsymbol.
    // ------------------------------------------------------------
    function bauStift(mode, uid, g, hyd) {
        const innen = mode !== 'aussen', geh = mode === 'gehaeuse';
        const D = {
            mode, innen, geh,
            kontur: geh ? '#333' : '#37474f', sw: geh ? 1.8 : 1.2,
            koerper: mode === 'schnitt' ? `url(#fps-${uid})` : mode === 'aussen' ? `url(#fpa-${uid})` : '#ffe0b2',
            luft: p => fluidFarbe(p, hyd, geh), hyd: !!hyd,
            mk: (tag, a, p) => el(tag, a, p || g),
            g, uid
        };
        D.body = (x, y, w, h, rx, p) => D.mk('rect', { x, y, width: w, height: h, rx: rx == null ? (mode === 'schnitt' ? 1 : 2.5) : rx, fill: D.koerper, stroke: D.kontur, 'stroke-width': D.sw }, p);
        D.glanz = (x1, y, x2, p) => { if (mode === 'aussen') D.mk('line', { x1, y1: y, x2, y2: y, stroke: '#fff', 'stroke-opacity': 0.7, 'stroke-width': 1 }, p); };
        // Luftraum (Kammer) mit Anschluss-ID: färbt sich mit dem Druck
        D.kammer = (pid, x, y, w, h, p) => innen ? D.mk('rect', { class: 'fp-b-luft', 'data-p': pid, x, y, width: w, height: h, fill: D.luft(0), stroke: '#455a64', 'stroke-width': 0.5 }, p) : null;
        // Luftkanal als dicker Linienzug
        D.kanal = (pid, d, b, p) => innen ? D.mk('path', { class: 'fp-b-luft fp-b-kanal', 'data-p': pid, d, fill: 'none', stroke: D.luft(0), 'stroke-width': b || 4, 'stroke-linejoin': 'miter' }, p) : null;
        D.kanalRand = (d, b, p) => innen ? D.mk('path', { d, fill: 'none', stroke: '#455a64', 'stroke-width': (b || 4) + 1, 'stroke-linejoin': 'miter' }, p) : null;
        D.luftweg = (pid, d, b, p) => { D.kanalRand(d, b, p); return D.kanal(pid, d, b, p); };
        D.metall = (x, y, w, h, cls, p, rx) => D.mk('rect', Object.assign({ x, y, width: w, height: h, rx: rx || 0.5, fill: '#90a4ae', stroke: '#37474f', 'stroke-width': 0.6 }, cls ? { class: cls } : {}), p);
        D.kugel = (cx, cy, r, cls, p) => D.mk('circle', { class: cls || 'fp-b-kugel', cx, cy, r, fill: '#263238', stroke: '#000', 'stroke-width': 0.5 }, p);
        D.lippe = (x, y, w, h, p) => D.mk('rect', { x, y, width: w, height: h, fill: '#212121' }, p);
        D.feder = (x1, y1, x2, y2, amp, n, cls, p) => {
            const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, pts = [];
            for (let i = 0; i <= n; i++) { const a = i === 0 || i === n ? 0 : (i % 2 ? amp : -amp); pts.push((x1 + ux * L * i / n - uy * a).toFixed(2) + ',' + (y1 + uy * L * i / n + ux * a).toFixed(2)); }
            return D.mk('polyline', { class: cls || 'fp-b-feder', points: pts.join(' '), fill: 'none', stroke: '#455a64', 'stroke-width': 1.1, 'stroke-linejoin': 'round', style: `transform-box:view-box;transform-origin:${x1}px ${y1}px;transition:transform .2s ease` }, p);
        };
        D.knopf = (x, y, w, h, p) => {   // Einstellknopf, gerändelt
            const k = D.mk('rect', { x, y, width: w, height: h, rx: 1.2, fill: '#455a64', stroke: '#263238', 'stroke-width': 0.8 }, p);
            for (let i = 1; i < (w > h ? w : h) / 2; i++) { if (w > h) D.mk('line', { x1: x + i * 2, y1: y + 0.6, x2: x + i * 2, y2: y + h - 0.6, stroke: '#263238', 'stroke-width': 0.5 }, p); else D.mk('line', { x1: x + 0.6, y1: y + i * 2, x2: x + w - 0.6, y2: y + i * 2, stroke: '#263238', 'stroke-width': 0.5 }, p); }
            return k;
        };
        D.pfeil = (x1, y1, x2, y2, p) => {   // eingeprägter Durchflusspfeil (geschlossen)
            const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
            D.mk('line', { x1, y1, x2: x2 - ux * 3, y2: y2 - uy * 3, stroke: '#37474f', 'stroke-width': 1 }, p);
            D.mk('path', { d: `M${x2},${y2} L${x2 - ux * 4 - uy * 2},${y2 - uy * 4 + ux * 2} L${x2 - ux * 4 + uy * 2},${y2 - uy * 4 - ux * 2} Z`, fill: '#37474f' }, p);
        };
        return D;
    }
    // Anschlussverschraubung vom Körperrand bis zum Anschlusspunkt, mit Nummer
    function bauStutzen(D, t, p, rand, rot) {
        const [dx, dy] = p.dir || [0, 1];
        let x0 = p.x, y0 = p.y;
        if (dy > 0) y0 = rand[3]; else if (dy < 0) y0 = rand[1]; else if (dx > 0) x0 = rand[2]; else x0 = rand[0];
        const L = Math.abs(p.x - x0) + Math.abs(p.y - y0), senk = dx === 0;
        const r = (x, y, w, h, f, cls) => D.mk('rect', Object.assign({ x, y, width: w, height: h, fill: f, stroke: '#455a64', 'stroke-width': 0.6 }, cls ? { class: cls } : {}));
        if (L > 0.5) {
            if (senk) r(p.x - 2.2, Math.min(y0, p.y), 4.4, L, '#90a4ae'); else r(Math.min(x0, p.x), p.y - 2.2, L, 4.4, '#90a4ae');
            if (D.innen) { if (senk) D.mk('line', { class: 'fp-b-luft fp-b-kanal', 'data-p': p.id, x1: p.x, y1: y0, x2: p.x, y2: p.y, stroke: D.luft(0), 'stroke-width': 2 }); else D.mk('line', { class: 'fp-b-luft fp-b-kanal', 'data-p': p.id, x1: x0, y1: p.y, x2: p.x, y2: p.y, stroke: D.luft(0), 'stroke-width': 2 }); }
        }
        // Mutter am Ende
        if (senk) r(p.x - 4, dy > 0 ? p.y - 4 : p.y, 8, 4, '#b0bec5', 'fp-r-ring'); else r(dx > 0 ? p.x - 4 : p.x, p.y - 4, 4, 8, '#b0bec5', 'fp-r-ring');
        if (!p.ohneNr) {
            const tx = p.x + (senk ? 7 : dx * -2), ty = p.y + (senk ? (dy > 0 ? -2 : 6) : -6);
            const e = D.mk('text', { x: tx, y: ty, 'font-size': 6, 'font-family': 'sans-serif', 'font-weight': 'bold', 'text-anchor': 'middle', fill: '#263238', transform: rot ? `rotate(${-rot} ${tx} ${ty})` : '' });
            e.textContent = p.nr || p.id;
        }
    }
    const BAU = {};
    // Rückschlagventil: Kugel, von einer Feder auf den Sitz gedrückt; frei von 1 nach 2
    BAU.rueck = {
        rand: [-9, -15, 9, 15],
        zeichne(t, D) {
            D.body(-9, -15, 18, 30);
            if (D.innen) {
                D.kammer('2', -6, -12, 12, 14); D.kammer('1', -3, 4, 6, 11);
                D.lippe(-6, 2, 3.2, 2); D.lippe(2.8, 2, 3.2, 2);
                const k = D.mk('g', { class: 'fp-b-ventil', style: 'transition:transform .12s' });
                D.kugel(0, 0, 3.4, null, k);
                D.feder(0, -12, 0, -3.4, 2.6, 6);
                D.kammer('2', -2, -15, 4, 3);
            } else { D.glanz(-7, -13, 7); D.pfeil(0, 9, 0, -9); }
        },
        anim(r, t, z, P, D) {
            let [vor, nach] = ['1', '2']; if (z && z.fehler === 'verkehrt') [vor, nach] = [nach, vor];
            const auf = !!z && P(vor) > P(nach) + 0.005;
            const k = r.querySelector('.fp-b-ventil'); if (k) k.style.transform = auf ? 'translateY(-3px)' : '';
            const f = r.querySelector('.fp-b-feder'); if (f) f.style.transform = auf ? 'scaleY(0.66)' : '';
        }
    };
    // Drosselventil: Nadel verengt den Kanal je nach Öffnung
    function nadel(D, xKnopf, s, offen, y) {
        // s = +1 Nadel kommt von rechts, -1 von links; Spitze bei offen 0 % über die Kanalmitte hinaus
        const tip = s * (-2.6 + 5.2 * Math.max(0, Math.min(100, offen)) / 100);
        if (D.innen) {
            const xe = xKnopf - s * 0.5;
            D.mk('rect', { x: Math.min(tip + s * 2.4, xe), y: y - 1.3, width: Math.abs(xe - tip - s * 2.4), height: 2.6, fill: '#b0bec5', stroke: '#455a64', 'stroke-width': 0.5 });
            D.mk('path', { d: `M${tip},${y} L${tip + s * 2.6},${y - 1.6} L${tip + s * 2.6},${y + 1.6} Z`, fill: '#90a4ae', stroke: '#455a64', 'stroke-width': 0.5 });
        }
        D.knopf(s > 0 ? xKnopf : xKnopf - 7, y - 4, 7, 8);
    }
    BAU.drossel = {
        rand: [-9, -15, 9, 15],
        zeichne(t, D) {
            D.body(-9, -15, 18, 30);
            if (D.innen) { D.kammer('2', -2.6, -15, 5.2, 13.5); D.kammer('1', -2.6, 1.5, 5.2, 13.5); D.lippe(-2.6, -1.5, 0.9, 3); }
            else { D.glanz(-7, -13, 7); D.pfeil(-4, 8, -4, -8); D.pfeil(-6, -8, -6, 8); }
            nadel(D, 9, 1, t.o.offen, 0);
        }
    };
    // Drosselrückschlagventil: Drossel im Hauptkanal, Rückschlag im Umgehungskanal (frei von 2 nach 1)
    BAU.drv = {
        rand: [-10, -22, 30, 22],
        zeichne(t, D) {
            D.body(-10, -22, 40, 44);
            if (D.innen) {
                D.kammer('2', -2.6, -22, 5.2, 20.5); D.kammer('1', -2.6, 1.5, 5.2, 20.5); D.lippe(-2.6, -1.5, 0.9, 3);
                D.luftweg('2', 'M0,-15 H20 V-3', 4); D.luftweg('1', 'M0,15 H20 V4', 4);
                D.kammer('2', 15, -8, 10, 6); D.kammer('1', 15, 0.5, 10, 14);
                D.lippe(15, -2.5, 3, 2); D.lippe(22, -2.5, 3, 2);
                const k = D.mk('g', { class: 'fp-b-ventil', style: 'transition:transform .12s' });
                D.kugel(20, 0.8, 3.3, null, k);
                D.feder(20, 14.5, 20, 4.1, 2.6, 6);
            } else { D.glanz(-8, -20, 28); D.pfeil(24, -10, 24, 10); }
            nadel(D, -10, -1, t.o.offen, 0);
        },
        anim(r, t, z, P) {
            let [vor, nach] = ['2', '1']; if (z && z.fehler === 'verkehrt') [vor, nach] = [nach, vor];
            const auf = !!z && P(vor) > P(nach) + 0.005;
            const k = r.querySelector('.fp-b-ventil'); if (k) k.style.transform = auf ? 'translateY(3px)' : '';
            const f = r.querySelector('.fp-b-feder'); if (f) f.style.transform = auf ? 'scaleY(0.7)' : '';
        }
    };
    // Wechselventil (ODER): Kugel schließt die drucklose Seite
    BAU.wechsel = {
        rand: [-24, -10, 24, 10],
        zeichne(t, D) {
            D.body(-24, -10, 48, 20);
            if (D.innen) {
                D.kammer('X', -24, -2, 10, 4); D.kammer('Y', 14, -2, 10, 4);
                D.kammer('M', -14, -4.5, 28, 9); D.kammer('2', -2, -10, 4, 6);
                for (const x of [-14.6, 13.4]) { D.lippe(x, -4.5, 1.2, 2.5); D.lippe(x, 2, 1.2, 2.5); }
                D.kugel(0, 0, 4, 'fp-b-kugel', D.mk('g', { class: 'fp-b-ventil', style: 'transition:transform .15s' }));
            } else { D.glanz(-22, -8, 22); D.pfeil(-18, 4, -8, 4); D.pfeil(18, 4, 8, 4); }
        },
        // Innenraum: verbunden mit dem offenen Eingang (die Kugel sperrt den anderen)
        druck(id, P, z) { if (id !== 'M' && id !== '2') return P(id); return Math.max(P('2'), z ? P(z.seite === 'X' ? 'X' : 'Y') : 0); },
        anim(r, t, z) { const k = r.querySelector('.fp-b-ventil'); if (k) k.style.transform = z ? `translateX(${z.seite === 'X' ? 9.5 : -9.5}px)` : ''; }
    };
    // Zweidruckventil (UND): Die Teller sitzen in den Eingangskammern vor den Sitzen. Der Druck
    // eines Eingangs drückt seinen eigenen Teller auf den Sitz und schließt sich so selbst ab.
    // Erst wenn auch der andere Eingang Druck hat, strömt Luft am anderen (offenen) Teller vorbei
    // durch die Bohrung zum Ausgang 2 – es kommt der niedrigere Druck durch.
    BAU.zweidruck = {
        rand: [-24, -10, 24, 10],
        zeichne(t, D) {
            D.body(-24, -10, 48, 20);
            if (D.innen) {
                D.kammer('X', -24, -6, 12, 12); D.kammer('Y', 12, -6, 12, 12);
                D.kammer('M', -12, -2, 24, 4); D.kammer('M', -8, -6, 16, 12); D.kammer('2', -2, -10, 4, 4);
                for (const x of [-12.6, 12]) { D.lippe(x, -4, 0.6, 2); D.lippe(x, 2, 0.6, 2); }
                const s = D.mk('g', { class: 'fp-b-ventil', style: 'transition:transform .15s' });
                D.metall(-18, -0.9, 36, 1.8, null, s);
                D.metall(-18.2, -4, 2.5, 8, null, s, 0.6); D.mk('rect', { x: -15.7, y: -3.2, width: 0.6, height: 6.4, fill: '#212121' }, s);
                D.metall(15.7, -4, 2.5, 8, null, s, 0.6); D.mk('rect', { x: 15.1, y: -3.2, width: 0.6, height: 6.4, fill: '#212121' }, s);
                // Strömungspfeile: vom offenen Eingang um den Teller, durch die Bohrung, nach oben zu 2
                for (const [sd, d] of [['X', 'M-23,-5 H-13.6 V-1.4 H-6 V-4 H0 V-8.4'], ['Y', 'M23,-5 H13.6 V-1.4 H6 V-4 H0 V-8.4']]) {
                    const g = D.mk('g', { class: 'fp-b-strom', 'data-s': sd, style: 'display:none' });
                    D.mk('path', { d, fill: 'none', stroke: '#0d47a1', 'stroke-width': 0.8, 'stroke-dasharray': '2 1.2', 'stroke-linejoin': 'round' }, g);
                    D.mk('polygon', { points: '-1.4,-7.6 0,-10 1.4,-7.6', fill: '#0d47a1' }, g);
                }
            } else { D.glanz(-22, -8, 22); D.pfeil(-18, 4, -8, 4); D.pfeil(18, 4, 8, 4); D.mk('text', { x: 0, y: 7, 'font-size': 5, 'text-anchor': 'middle', fill: '#37474f', 'font-family': 'sans-serif' }).textContent = '&'; }
        },
        druck(id, P) { if (id !== 'M' && id !== '2') return P(id); return Math.max(P('2'), Math.min(P('X'), P('Y'))); },
        // z.seite = offener Eingang: der andere Teller liegt auf seinem Sitz
        anim(r, t, z, P) {
            const k = r.querySelector('.fp-b-ventil'); if (k) k.style.transform = z ? `translateX(${z.seite === 'X' ? -2.5 : 2.5}px)` : '';
            const fliesst = !!z && P('X') > P_AN && P('Y') > P_AN;
            r.querySelectorAll('.fp-b-strom').forEach(e => { e.style.display = fliesst && e.getAttribute('data-s') === z.seite ? '' : 'none'; });
        }
    };
    // Schnellentlüftungsventil: Membranscheibe schließt beim Belüften die Abluft, beim Entlüften den Zulauf
    BAU.schnell = {
        rand: [-14, -18, 14, 18],
        zeichne(t, D) {
            D.body(-14, -18, 28, 36);
            if (D.innen) {
                D.kammer('2', -9, -7, 18, 14);
                D.luftweg('1', 'M0,18 V7', 5); D.lippe(-4.5, 6, 2, 1.5); D.lippe(2.5, 6, 2, 1.5);
                D.luftweg('2', 'M-6,-7 V-12 H0 V-18', 4);
                D.luftweg('3', 'M5,-7 V-12 H11 V0 H14', 4); D.lippe(2.5, -8.5, 1.5, 1.5); D.lippe(7.5, -8.5, 1.5, 1.5);
                const m = D.mk('g', { class: 'fp-b-ventil', style: 'transition:transform .12s' });
                D.mk('rect', { x: -3, y: -6.8, width: 12.5, height: 2.6, rx: 1, fill: '#37474f', stroke: '#000', 'stroke-width': 0.4 }, m);
            } else { D.glanz(-12, -16, 12); D.pfeil(-6, 10, -6, -10); D.pfeil(6, -6, 11, -6); }
        },
        anim(r, t, z) { const k = r.querySelector('.fp-b-ventil'); if (k) k.style.transform = z && z.ab ? 'translateY(10.4px)' : ''; }
    };
    // Druckregelventil: Feder (Stellknopf) gegen Membran, die den Ventilteller vom Sitz hebt
    BAU.druckregel = {
        rand: [-11, -20, 22, 20],
        zeichne(t, D) {
            D.body(-11, -20, 22, 40);
            D.body(11, -9, 9, 18, 1.5);
            if (D.innen) {
                D.kammer('2', -7, -16, 15, 15); D.kammer('2', -2, -20, 4, 4);
                D.luftweg('1', 'M0,20 V6', 5); D.lippe(-6, 3, 3.5, 2); D.lippe(2.5, 3, 3.5, 2);
                D.metall(-3.2, 0.2, 6.4, 3, 'fp-b-teller');
                D.mk('line', { x1: 0, y1: 0.2, x2: 0, y2: -9, stroke: '#78909c', 'stroke-width': 1.4 });
                D.mk('path', { d: 'M0,-9 H8', stroke: '#78909c', 'stroke-width': 1.4, fill: 'none' });
                D.mk('rect', { class: 'fp-b-membran', x: 8, y: -15, width: 1.6, height: 13, fill: '#212121' });
                D.mk('rect', { x: 12, y: -7, width: 7, height: 14, fill: '#f5f5f5', stroke: '#455a64', 'stroke-width': 0.4 });
                D.feder(9.6, 0, 18.5, 0, 3, 7);
            } else { D.glanz(-9, -18, 9); D.pfeil(-5, 10, -5, -10); }
            D.knopf(20, -5, 3, 10);
            const tx = D.mk('text', { x: 17.5, y: 15.5, 'font-size': 5, 'text-anchor': 'middle', fill: '#37474f', 'font-family': 'sans-serif' }); tx.textContent = (t.o.p != null ? t.o.p : 4) + ' bar';
        }
    };
    // Manometer: Rohrfeder (aufgeschnitten) und Zeiger
    BAU.manometer = {
        rand: [-12, -12, 12, 12],
        zeichne(t, D) {
            D.mk('rect', { x: -2.5, y: 10, width: 5, height: 8, fill: '#c0a060', stroke: '#6d4c41', 'stroke-width': 0.5 });
            D.mk('rect', { x: -4.5, y: 12.5, width: 9, height: 4, fill: '#d4b46a', stroke: '#6d4c41', 'stroke-width': 0.5 });
            D.mk('circle', { cx: 0, cy: 0, r: 12, fill: D.mode === 'gehaeuse' ? '#ffe0b2' : '#263238', stroke: D.kontur, 'stroke-width': D.sw });
            D.mk('circle', { cx: 0, cy: 0, r: 10, fill: '#fff', stroke: '#90a4ae', 'stroke-width': 0.5 });
            for (let i = 0; i <= 10; i++) { const w = (-135 + i * 27) * Math.PI / 180, a = i % 5 ? 8.3 : 7.2; D.mk('line', { x1: 9.4 * Math.sin(w), y1: -9.4 * Math.cos(w), x2: a * Math.sin(w), y2: -a * Math.cos(w), stroke: '#263238', 'stroke-width': i % 5 ? 0.4 : 0.8 }); }
            for (const [i, s] of (istHyd(t) ? [[0, '0'], [5, '80'], [10, '160']] : [[0, '0'], [5, '5'], [10, '10']])) { const w = (-135 + i * 27) * Math.PI / 180; D.mk('text', { x: 5.3 * Math.sin(w), y: -5.3 * Math.cos(w) + 1.6, 'font-size': 3.6, 'text-anchor': 'middle', fill: '#263238', 'font-family': 'sans-serif' }).textContent = s; }
            if (D.innen) D.mk('path', { class: 'fp-b-luft', 'data-p': '1', d: 'M0,10 C-7,10 -7.5,-2 -3,-5.5 C0,-7.5 4,-6 5,-3', fill: 'none', stroke: '#c0a060', 'stroke-width': 1.6, 'stroke-opacity': 0.8 });
            D.mk('line', { class: 'fp-b-nadel', x1: 0, y1: 0, x2: 0, y2: -8.6, stroke: '#c62828', 'stroke-width': 0.9, style: 'transform-box:view-box;transform-origin:0px 0px;transform:rotate(-135deg);transition:transform .2s' });
            D.mk('circle', { cx: 0, cy: 0, r: 1.1, fill: '#263238' });
            D.mk('text', { class: 'fp-b-wert', x: 0, y: 6.5, 'font-size': 3.4, 'text-anchor': 'middle', fill: '#1565c0', 'font-family': 'sans-serif' });
        },
        anim(r, t, z, P) {
            const p = z ? P('1') : 0, n = r.querySelector('.fp-b-nadel');
            const voll = istHyd(t) ? 160 : 10;
            if (n) n.style.transform = `rotate(${-135 + Math.max(0, Math.min(voll, p)) / voll * 270}deg)`;
            const w = r.querySelector('.fp-b-wert'); if (w) w.textContent = z ? p.toFixed(istHyd(t) ? 0 : 1) + ' bar' : 'bar';
        }
    };
    // Druckschalter: Membran gegen Stellfeder, Stößel betätigt den Mikroschalter
    BAU.dschalter = {
        rand: [-12, -14, 28, 14],
        zeichne(t, D) {
            D.body(-12, -14, 24, 28);
            D.mk('rect', { x: 12, y: -12, width: 16, height: 14, rx: 1.5, fill: '#37474f', stroke: '#263238', 'stroke-width': D.sw });
            if (D.innen) {
                D.kammer('1', -8, 5, 16, 5); D.luftweg('1', 'M0,14 V10', 4);
                D.mk('rect', { class: 'fp-b-membran', x: -8, y: 3.6, width: 16, height: 1.4, fill: '#212121' });
                D.mk('rect', { x: -6, y: -11, width: 12, height: 14, fill: '#f5f5f5', stroke: '#455a64', 'stroke-width': 0.4 });
                const st = D.mk('g', { class: 'fp-b-ventil', style: 'transition:transform .1s' });
                D.metall(-4, 1.2, 8, 2, null, st); D.metall(-0.8, -9, 1.6, 10.5, null, st); D.metall(-0.8, -9, 14, 1.6, null, st);
                D.feder(-3.5, 1.2, -3.5, -10.5, 2, 6, 'fp-b-feder'); D.feder(3.5, 1.2, 3.5, -10.5, 2, 6, 'fp-b-feder');
            } else D.glanz(-10, -12, 10);
            D.mk('path', { class: 'fp-b-kontakt', d: 'M15,-3 L25,-7', stroke: '#ffca28', 'stroke-width': 1.2, fill: 'none' });
            D.mk('circle', { cx: 15, cy: -3, r: 0.9, fill: '#ffca28' }); D.mk('rect', { x: 23.5, y: -10, width: 3, height: 1.5, fill: '#ffca28' });
            D.mk('circle', { class: 'fp-b-led', cx: 24.5, cy: -1, r: 1.6, fill: '#5d4037', stroke: '#212121', 'stroke-width': 0.4 });
            D.knopf(-4, -17, 8, 3);
        },
        anim(r, t, z) {
            const an = !!(z && z.an), k = r.querySelector('.fp-b-kontakt'); if (k) k.setAttribute('d', an ? 'M15,-3 L25,-8.5' : 'M15,-3 L25,-6');
            const s = r.querySelector('.fp-b-ventil'); if (s) s.style.transform = an ? 'translateY(-2px)' : '';
            r.querySelectorAll('.fp-b-feder').forEach(f => { f.style.transform = an ? 'scaleY(0.83)' : ''; });
            const l = r.querySelector('.fp-b-led'); if (l) { l.setAttribute('fill', an ? '#ffeb3b' : '#5d4037'); l.style.filter = an ? 'drop-shadow(0 0 2px #ffeb3b)' : ''; }
        }
    };
    // Schalldämpfer: Gewinde, Sechskant, Sinterbronze-Körper
    BAU.daempfer = {
        rand: [-5, -12, 5, 16],
        zeichne(t, D) {
            D.mk('rect', { x: -6, y: -9, width: 12, height: 4, fill: D.mode === 'gehaeuse' ? '#ffe0b2' : '#b0bec5', stroke: D.kontur, 'stroke-width': 0.8 });
            D.mk('rect', { x: -5, y: -5, width: 10, height: 20, rx: 2, fill: '#b08d57', stroke: '#6d4c41', 'stroke-width': D.sw * 0.8 });
            for (let y = -3; y < 14; y += 2) for (let x = -3.5 + (y % 4 ? 1 : 0); x < 4; x += 2) D.mk('circle', { cx: x, cy: y, r: 0.45, fill: '#7a5a2e' });
            if (D.innen) D.kammer('1', -1.8, -9, 3.6, 21);
            if (t.o.drossel) D.knopf(-1.5, 15, 3, 3);
        }
    };
    // Blindstopfen: Gewindezapfen mit Sechskantkopf
    BAU.stopfen = {
        rand: [-6, -12, 6, 1],
        zeichne(t, D) {
            D.mk('rect', { x: -3, y: -12, width: 6, height: 7, fill: '#b0bec5', stroke: '#455a64', 'stroke-width': 0.6 });
            for (let y = -11; y < -5; y += 1.5) D.mk('line', { x1: -3, y1: y, x2: 3, y2: y + 0.8, stroke: '#455a64', 'stroke-width': 0.4 });
            D.body(-6, -5, 12, 6, 1);
            D.mk('line', { x1: -2, y1: -5, x2: -2, y2: 1, stroke: '#546e7a', 'stroke-width': 0.5 }); D.mk('line', { x1: 2, y1: -5, x2: 2, y2: 1, stroke: '#546e7a', 'stroke-width': 0.5 });
        }
    };
    // Zeit- und Druckfolgeventil: kleines 3/2-Schieberventil, links der Steuerteil
    // (Zeit: Drosselrückschlag + Speicher; Folge: Druckstufe mit Stellfeder)
    function kleinVentil(t, D) {
        const ports = geo(t).ports, P = id => ports.find(p => p.id === id);
        const p1 = P('1'), p3 = P('3'), p2 = P('2'), ps = ports.find(p => p.art === 's');
        D.body(30, 0, 86, 40);
        if (D.innen) {
            D.mk('rect', { x: 34, y: 14, width: 80, height: 12, fill: '#f5f5f5', stroke: '#37474f', 'stroke-width': 0.6 });
            for (const p of [p1, p3, p2]) if (p) D.luftweg(p.id, p.y < 0 ? `M${p.x},0 V14` : `M${p.x},40 V26`, 4);
            const sg = D.mk('g', { class: 'fp-b-schieber', style: 'transition:transform .25s cubic-bezier(.4,0,.2,1)' });
            // Kolben (Stege): schaltet beim Verschieben um 10 nach rechts
            const steg = (a, c) => { D.metall(a, 14.6, c - a, 10.8, null, sg, 0.6); for (const xr of (c - a > 6 ? [a + 1.5, c - 1.5] : [(a + c) / 2])) for (const yr of [15.2, 24.8]) D.mk('ellipse', { cx: xr, cy: yr, rx: 1, ry: 0.8, fill: '#212121' }, sg); };
            D.metall(36, 18.5, 66, 3, null, sg);
            if (t.o.ruhe === 'offen') { steg(44, 64); steg(84, 87); steg(95, 100); } else { steg(40, 56); steg(74, 77); steg(95, 100); }
            D.mk('rect', { x: 36, y: 14.6, width: 2.4, height: 10.8, fill: '#455a64' }, sg);
            D.feder(114, 20, 100, 20, 4, 6, 'fp-b-vfeder');
            D.kammer(ps ? ps.id : '12', 30.5, 16, 5, 8);
        } else { D.glanz(32, 2, 114); }
        D.body(116, 8, 8, 24, 1.5);
    }
    BAU.zeit = {
        rand: [-26, 0, 124, 40],
        zeichne(t, D) {
            const ps = geo(t).ports.find(p => p.art === 's');
            D.body(-26, 12, 56, 16);
            D.body(-10, 26, 22, 16, 4);
            if (D.innen) {
                D.luftweg(ps.id, `M-26,20 H-3`, 4); D.lippe(-3, 18, 1, 4);
                D.luftweg(ps.id, `M-2,20 H30`, 4);
                D.mk('rect', { class: 'fp-b-speicher', x: -7, y: 29, width: 16, height: 10, rx: 3, fill: D.luft(0), stroke: '#455a64', 'stroke-width': 0.5 });
                D.luftweg(ps.id, 'M1,20 V29', 3);
                D.luftweg(ps.id, 'M-21,20 V25 H-7 V20', 2.5);
                D.kugel(-12, 25, 1.5, 'fp-b-kugel2');
                D.mk('rect', { x: -15.3, y: 12, width: 2.6, height: 5.5, fill: '#b0bec5', stroke: '#455a64', 'stroke-width': 0.5 });
                D.mk('path', { d: 'M-15.3,17.5 L-14,20.5 L-12.7,17.5 Z', fill: '#90a4ae', stroke: '#455a64', 'stroke-width': 0.5 });
            } else { D.glanz(-24, 14, 28); D.mk('text', { x: 1, y: 37, 'font-size': 5, 'text-anchor': 'middle', fill: '#37474f', 'font-family': 'sans-serif' }).textContent = (t.o.zeit != null ? t.o.zeit : 3) + ' s'; }
            D.knopf(-18, 8, 8, 4);
            kleinVentil(t, D);
        },
        anim(r, t, z) {
            const s = r.querySelector('.fp-b-schieber'); if (s) s.style.transform = z && z.an ? 'translateX(10px)' : '';
            const f = r.querySelector('.fp-b-vfeder'); if (f) f.style.transform = z && z.an ? 'scaleX(0.4)' : '';
            const sp = r.querySelector('.fp-b-speicher'); if (sp) sp.setAttribute('fill', z && z.pr > 0.3 ? `rgba(41,182,246,${(0.3 + 0.6 * Math.min(1, z.pr / 6)).toFixed(2)})` : '#eceff1');
        }
    };
    BAU.folge = {
        rand: [-26, 0, 124, 40],
        zeichne(t, D) {
            const ps = geo(t).ports.find(p => p.art === 's');
            D.body(-26, 12, 56, 16);
            D.body(-20, 26, 16, 18, 1.5);
            if (D.innen) {
                D.luftweg(ps.id, 'M-26,20 H30', 4);
                D.mk('rect', { x: -17, y: 30, width: 10, height: 12, fill: '#f5f5f5', stroke: '#455a64', 'stroke-width': 0.4 });
                D.luftweg(ps.id, 'M-12,20 V27', 3);
                D.mk('rect', { class: 'fp-b-membran', x: -17, y: 28, width: 10, height: 1.6, fill: '#212121' });
                D.feder(-12, 29.6, -12, 41.5, 3, 6);
            } else D.glanz(-24, 14, 28);
            D.knopf(-15, 44, 6, 3);
            D.mk('text', { x: -12, y: 52, 'font-size': 5, 'text-anchor': 'middle', fill: '#37474f', 'font-family': 'sans-serif' }).textContent = (t.o.p != null ? t.o.p : 4) + ' bar';
            kleinVentil(t, D);
        },
        anim(r, t, z) {
            const s = r.querySelector('.fp-b-schieber'); if (s) s.style.transform = z && z.an ? 'translateX(10px)' : '';
            const f = r.querySelector('.fp-b-vfeder'); if (f) f.style.transform = z && z.an ? 'scaleX(0.4)' : '';
        }
    };
    // Wartungseinheit: Filter mit Wasserabscheider (Behälter, Ablass) und Druckregler mit Manometer
    BAU.wartung = {
        rand: [-30, -22, 30, 22],
        zeichne(t, D) {
            D.body(-30, -14, 28, 10, 1.5); D.body(-2, -14, 32, 20, 1.5);
            D.mk('rect', { x: -27, y: -4, width: 22, height: 22, rx: 4, fill: D.innen ? 'rgba(227,242,253,.9)' : 'rgba(207,216,220,.85)', stroke: D.kontur, 'stroke-width': D.sw });   // Behälter
            D.mk('rect', { x: -17.5, y: 18, width: 3, height: 3.5, fill: '#455a64' });   // Ablass
            D.knopf(8, -22, 12, 8);
            if (D.innen) {
                D.luftweg('1', 'M-30,-9 H-19 V2', 4);
                D.mk('rect', { x: -22, y: 0, width: 6, height: 12, fill: `url(#fps-${D.uid})`, stroke: '#8d6e63', 'stroke-width': 0.6, 'stroke-dasharray': '1 1' });
                D.mk('rect', { x: -26, y: 13, width: 20, height: 4, fill: '#64b5f6', opacity: 0.6 });   // Kondensat
                D.luftweg('1', 'M-11,0 V-9 H5', 4); D.lippe(5, -12, 1.2, 1.8); D.lippe(5, -7.8, 1.2, 1.8);
                D.luftweg('2', 'M7,-9 H30', 4);
                D.mk('rect', { x: 5.4, y: -11, width: 3, height: 4, fill: '#90a4ae', stroke: '#455a64', 'stroke-width': 0.4 });
                D.feder(8, -14, 20, -14, 2, 6);
            } else { D.glanz(-28, -12, -4); D.glanz(0, -12, 28); D.pfeil(-26, -9, -20, -9); }
            D.mk('circle', { cx: 14, cy: 0, r: 5.6, fill: '#fff', stroke: '#263238', 'stroke-width': 1 });
            D.mk('line', { class: 'fp-b-nadel', x1: 14, y1: 0, x2: 14, y2: -4.5, stroke: '#c62828', 'stroke-width': 0.8, style: 'transform-box:view-box;transform-origin:14px 0px;transform:rotate(-135deg);transition:transform .2s' });
            D.mk('text', { x: 14, y: 4, 'font-size': 2.6, 'text-anchor': 'middle', fill: '#263238', 'font-family': 'sans-serif' }).textContent = (t.o.p != null ? t.o.p : 6) + ' bar';
        },
        anim(r, t, z, P) {
            const p = z ? P('2') : 0, n = r.querySelector('.fp-b-nadel');
            if (n) n.style.transform = `rotate(${-135 + Math.max(0, Math.min(10, p)) / 10 * 270}deg)`;
        }
    };
    // Druckluftquelle als kleiner Kolbenkompressor mit Kessel
    BAU.quelle = {
        rand: [-16, -14, 16, 14],
        zeichne(t, D) {
            D.mk('rect', { x: -16, y: -2, width: 32, height: 14, rx: 7, fill: D.mode === 'gehaeuse' ? '#ffcdd2' : D.innen ? D.koerper : '#c62828', stroke: D.kontur, 'stroke-width': D.sw });   // Kessel
            if (D.innen) D.kammer('1', -12, 1, 24, 8);
            D.body(-9, -12, 12, 10, 1.2);   // Verdichter
            D.mk('rect', { x: 4, y: -10, width: 9, height: 8, rx: 1.5, fill: '#37474f', stroke: '#263238', 'stroke-width': 0.6 });   // Motor
            if (D.innen) { D.mk('rect', { x: -6, y: -10, width: 6, height: 6, fill: '#f5f5f5', stroke: '#455a64', 'stroke-width': 0.4 }); D.metall(-6, -6, 6, 2, 'fp-b-kolbenq'); D.luftweg('1', 'M0,-22 V-12', 3); }
            for (const x of [-11, 11]) D.mk('rect', { x: x - 1.5, y: 12, width: 3, height: 2, fill: '#263238' });
        }
    };
    // Schwenkantrieb: Drehflügel zwischen zwei Kammern, Welle mit Zeiger
    BAU.schwenk = {
        rand: [-20, -20, 20, 20],
        zeichne(t, D) {
            D.body(-20, -20, 40, 40, 4);
            D.mk('circle', { cx: 0, cy: 0, r: 15, fill: D.innen ? '#f5f5f5' : 'none', stroke: D.kontur, 'stroke-width': 0.8 });
            if (D.innen) {
                D.mk('path', { class: 'fp-b-luft', 'data-p': 'K', d: 'M0,0 L-15,0 A15,15 0 0 1 0,-15 Z', fill: D.luft(0) });
                D.mk('path', { class: 'fp-b-luft', 'data-p': 'S', d: 'M0,0 L0,-15 A15,15 0 0 1 15,0 Z', fill: D.luft(0) });
                D.mk('rect', { x: -15, y: -0.8, width: 30, height: 15.8, fill: '#cfd8dc' });   // Anschlag (unterer Halbkreis fest)
                D.luftweg('K', 'M-10,20 V2', 3); D.luftweg('S', 'M10,20 V2', 3);
            }
            const fl = D.mk('g', { class: 'fp-b-fluegel', style: 'transform-box:view-box;transform-origin:0px 0px;transition:transform .1s linear' });
            if (D.innen) D.metall(-15, -1.5, 15, 3, null, fl, 0.6);
            else D.mk('line', { x1: 0, y1: 0, x2: -13, y2: 0, stroke: '#c62828', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, fl);
            D.mk('circle', { cx: 0, cy: 0, r: 3.2, fill: '#546e7a', stroke: '#263238', 'stroke-width': 0.6 });
        },
        anim(r, t, z) {
            const s = z && z.x != null ? Math.max(0, Math.min(1, z.x / zylHub(t))) : (t.o.start === 'vorne' ? 1 : 0);
            const f = r.querySelector('.fp-b-fluegel'); if (f) f.style.transform = `rotate(${s * 180}deg)`;
        }
    };
    // ---------- Hydraulik-Teile in der 2D-Anlage (Gehäuse, Schnitt, geschlossen) ----------
    // Öl ist immer da: in Ruhe bernstein, unter Druck rot (D.luft).
    // Druckbegrenzungsventil: Kegel auf dem Sitz, von der Feder gegen den Druck an P gehalten
    BAU.dbv = {
        rand: [-11, -20, 22, 20],
        zeichne(t, D) {
            D.body(-11, -20, 22, 40);
            D.body(11, -2, 9, 16, 1.5);
            if (D.innen) {
                D.luftweg('P', 'M0,-20 V-5', 5);
                D.kammer('T', -8, -3, 16, 15); D.luftweg('T', 'M0,12 V20', 5);
                D.lippe(-6, -5, 3.5, 2); D.lippe(2.5, -5, 3.5, 2);
                const k = D.mk('g', { class: 'fp-b-ventil', style: 'transition:transform .1s' });
                D.mk('path', { d: 'M-3.5,-1 L0,-5 L3.5,-1 Z', fill: '#90a4ae', stroke: '#37474f', 'stroke-width': 0.6 }, k);
                D.metall(-4, -1, 8, 2, null, k);
                D.feder(-4.5, 1, -4.5, 11, 2, 6, 'fp-b-feder'); D.feder(4.5, 1, 4.5, 11, 2, 6, 'fp-b-feder');
                D.mk('rect', { x: 12, y: 0, width: 7, height: 12, fill: '#f5f5f5', stroke: '#455a64', 'stroke-width': 0.4 });
            } else { D.glanz(-9, -18, 9); D.pfeil(-5, -10, -5, 10); }
            D.knopf(20, 2, 3, 8);
            const tx = D.mk('text', { x: 15.5, y: 19, 'font-size': 4.6, 'text-anchor': 'middle', fill: '#37474f', 'font-family': 'sans-serif' }); tx.textContent = (t.o.p != null ? t.o.p : 60) + ' bar';
        },
        anim(r, t, z) {
            const auf = !!(z && z.auf), k = r.querySelector('.fp-b-ventil'); if (k) k.style.transform = auf ? 'translateY(2.5px)' : '';
            r.querySelectorAll('.fp-b-feder').forEach(f => { f.style.transform = auf ? 'scaleY(0.78)' : ''; });
        }
    };
    // Stromregelventil: Druckwaage (Kolben mit Feder) vor der einstellbaren Drossel
    BAU.stromregel = {
        rand: [-12, -20, 12, 20],
        zeichne(t, D) {
            D.body(-12, -20, 24, 40);
            if (D.innen) {
                D.luftweg('1', 'M0,20 V9', 5);
                D.kammer('1', -8, 5, 16, 4);
                D.metall(-8, 2.2, 16, 2.8, 'fp-b-waage');
                D.feder(-5, 2.2, -5, -4, 1.6, 5); D.feder(5, 2.2, 5, -4, 1.6, 5);
                D.kammer('M', -8, -6, 16, 8);
                D.lippe(-2.6, -8.5, 0.9, 2.5);
                D.kammer('2', -2.6, -20, 5.2, 12);
            } else { D.glanz(-10, -18, 10); D.pfeil(-6, 12, -6, -12); }
            nadel(D, 12, 1, Math.min(100, zahl(t.o.q, 4) * 8), -10);
            const tx = D.mk('text', { x: 0, y: 25.5, 'font-size': 4.4, 'text-anchor': 'middle', fill: '#37474f', 'font-family': 'sans-serif' }); tx.textContent = (t.o.q != null ? t.o.q : 4) + ' l/min';
        },
        druck(id, P) { return id === 'M' ? (P('1') + P('2')) / 2 : P(id); },
        anim(r, t, z, P) {
            const d = z ? Math.max(0, Math.min(1, (P('1') - P('2')) / 40)) : 0, w = r.querySelector('.fp-b-waage');
            if (w) w.style.transform = `translateY(${-2 * d}px)`;
        }
    };
    // Entsperrbares Rückschlagventil: Kugel frei von 1 nach 2; der Steuerkolben X drückt sie für 2 → 1 auf
    BAU.entsperr = {
        rand: [-12, -18, 10, 18],
        zeichne(t, D) {
            D.body(-12, -18, 22, 36);
            if (D.innen) {
                D.kammer('2', -6, -14, 12, 14); D.kammer('1', -1, 4, 4, 14);
                D.lippe(-6, 2, 3.2, 2); D.lippe(2.8, 2, 3.2, 2);
                const k = D.mk('g', { class: 'fp-b-ventil', style: 'transition:transform .12s' });
                D.kugel(0, 0, 3.4, null, k);
                D.feder(0, -12, 0, -3.4, 2.6, 6, 'fp-b-feder');
                D.kammer('X', -10, 12, 8, 5); D.luftweg('X', 'M-12,14.5 H-10', 3);
                D.metall(-5.5, 3.6, 3, 8.4, 'fp-b-stoessel');
            } else { D.glanz(-10, -16, 8); D.pfeil(0, 12, 0, -10); }
        },
        anim(r, t, z, P) {
            const ent = !!(z && z.entsperrt), auf = !!z && (ent || P('1') > P('2') + 0.05);
            const k = r.querySelector('.fp-b-ventil'); if (k) k.style.transform = auf ? 'translateY(-3px)' : '';
            const f = r.querySelector('.fp-b-feder'); if (f) f.style.transform = auf ? 'scaleY(0.7)' : '';
            const s = r.querySelector('.fp-b-stoessel'); if (s) s.style.transform = ent ? 'translateY(-3px)' : '';
        }
    };
    // Filter: Gehäuse mit Faltenfilterelement
    BAU.filter = {
        rand: [-10, -14, 10, 14],
        zeichne(t, D) {
            D.body(-10, -14, 20, 28);
            if (D.innen) {
                D.kammer('1', -7, 2, 14, 9); D.kammer('2', -7, -11, 14, 9);
                D.mk('polyline', { points: '-7,0 -5.5,-2 -4,0 -2.5,-2 -1,0 0.5,-2 2,0 3.5,-2 5,0 6.5,-2 7,-1', fill: 'none', stroke: '#6d4c41', 'stroke-width': 1.2 });
            } else { D.glanz(-8, -12, 8); D.pfeil(0, 9, 0, -9); }
        }
    };
    // Hydrospeicher: Stahlflasche, oben Stickstoff in der Blase, unten Öl
    BAU.speicher = {
        rand: [-11, -20, 11, 18],
        zeichne(t, D) {
            D.body(-11, -20, 22, 38, 10);
            if (D.innen) {
                D.mk('rect', { x: -8, y: -17, width: 16, height: 32, rx: 7, fill: '#cfd8dc', stroke: '#455a64', 'stroke-width': 0.5 });
                D.mk('rect', { class: 'fp-b-luft fp-b-oel', 'data-p': '1', x: -8, y: 13, width: 16, height: 2, fill: D.luft(0), stroke: 'none' });
                D.mk('path', { class: 'fp-b-blase', d: 'M-7,13 Q0,11 7,13', fill: 'none', stroke: '#212121', 'stroke-width': 1 });
                const tx = D.mk('text', { x: 0, y: -6, 'font-size': 4.4, 'text-anchor': 'middle', fill: '#455a64', 'font-family': 'sans-serif' }); tx.textContent = 'N₂';
                D.kammer('1', -2.5, 15, 5, 3);
            } else { D.glanz(-8, -17, 8); }
            const tx = D.mk('text', { x: 0, y: 4, 'font-size': 4, 'text-anchor': 'middle', fill: D.innen ? '#455a64' : '#eceff1', 'font-family': 'sans-serif' }); tx.textContent = (t.o.p0 != null ? t.o.p0 : 30) + ' bar';
        },
        anim(r, t, z) {
            const a = z ? Math.max(0, Math.min(1, (z.voil || 0) / Math.max(0.05, zahl(t.o.V0, 0.7)))) : 0, h = 2 + 26 * a;
            const o = r.querySelector('.fp-b-oel'); if (o) { o.setAttribute('y', 15 - h); o.setAttribute('height', h); }
            const b = r.querySelector('.fp-b-blase'); if (b) b.setAttribute('d', `M-7,${15 - h} Q0,${13 - h} 7,${15 - h}`);
        }
    };
    // Tank: Behälter mit Ölstand, die Rücklaufleitung taucht ein
    BAU.tank = {
        rand: [-14, -10, 14, 8],
        zeichne(t, D) {
            D.body(-14, -10, 28, 18, 1.5);
            if (D.innen) { D.kammer('1', -12, -3, 24, 9); D.luftweg('1', 'M0,-10 V3', 3); }
            else D.glanz(-12, -8, 12);
        }
    };
    // Hydraulikaggregat: Tank, Motor, Zahnradpumpe, eingebautes Druckbegrenzungsventil, Rücklauf
    BAU.aggregat = {
        rand: [-46, -18, 34, 50],
        zeichne(t, D) {
            D.body(-46, 20, 80, 30, 2);                                    // Tank
            if (D.innen) D.kammer('T', -43, 27, 74, 20);
            D.mk('rect', { x: -44, y: -12, width: 22, height: 30, rx: 2, fill: D.mode === 'gehaeuse' ? '#90caf9' : '#1565c0', stroke: D.kontur, 'stroke-width': D.sw });   // Motor
            for (let y = -8; y < 16; y += 4) D.mk('line', { x1: -42, y1: y, x2: -24, y2: y, stroke: D.mode === 'gehaeuse' ? '#1565c0' : '#0d47a1', 'stroke-width': 0.8 });
            const m = D.mk('text', { x: -33, y: 6, 'font-size': 9, 'text-anchor': 'middle', fill: '#fff', 'font-family': 'sans-serif', 'font-weight': 'bold' }); m.textContent = 'M';
            D.body(-20, -6, 22, 24);                                       // Pumpe
            if (D.innen) {
                D.kammer('P', -18, -4, 18, 6);
                for (const cx of [-13, -5]) {
                    const z = D.mk('g', { class: 'fp-b-rad' });
                    D.mk('circle', { cx, cy: 10, r: 4.2, fill: '#90a4ae', stroke: '#37474f', 'stroke-width': 0.6 }, z);
                    for (let i = 0; i < 8; i++) { const w = i * Math.PI / 4; D.mk('line', { x1: cx + 3.6 * Math.cos(w), y1: 10 + 3.6 * Math.sin(w), x2: cx + 5.2 * Math.cos(w), y2: 10 + 5.2 * Math.sin(w), stroke: '#37474f', 'stroke-width': 1.2 }, z); }
                }
                D.luftweg('T', 'M-9,18 V34', 3);                           // Saugrohr
                D.luftweg('P', 'M-10,-6 V-18', 4);
                D.luftweg('P', 'M-10,-12 H10 V-4', 3);                     // zur Druckbegrenzung
            } else D.glanz(-18, -4, 0);
            D.body(5, -4, 12, 18, 1);                                      // eingebautes DBV
            if (D.innen) {
                D.kammer('P', 8, -4, 6, 5);
                D.metall(8, 1, 6, 2, 'fp-b-ventil');
                D.feder(11, 3, 11, 12, 2, 5, 'fp-b-feder');
                D.luftweg('T', 'M11,14 V30', 2.5);
                D.luftweg('T', 'M20,-18 V34', 4);                          // Rücklauf taucht ein
            }
            D.knopf(9, 14, 4, 4);
            const tx = D.mk('text', { x: -6, y: 46, 'font-size': 5, 'text-anchor': 'middle', fill: '#37474f', 'font-family': 'sans-serif' });
            tx.textContent = (t.o.q != null ? t.o.q : 8) + ' l/min · ' + (t.o.p != null ? t.o.p : 60) + ' bar';
        },
        anim(r, t, z, P) {
            const laeuft = !!z;
            // Zahnräder drehen gegenläufig, solange die Pumpe läuft (SMIL, braucht kein CSS im 2D-Dokument)
            r.querySelectorAll('.fp-b-rad').forEach((e, i) => {
                const da = e.querySelector('animateTransform');
                if (laeuft && !da) {
                    const c = e.querySelector('circle'), cx = c ? c.getAttribute('cx') : 0, cy = c ? c.getAttribute('cy') : 0;
                    const an = e.ownerDocument.createElementNS(NS, 'animateTransform');
                    [['attributeName', 'transform'], ['type', 'rotate'], ['from', `0 ${cx} ${cy}`], ['to', `${i ? -360 : 360} ${cx} ${cy}`], ['dur', '0.5s'], ['repeatCount', 'indefinite']].forEach(([k, v]) => an.setAttribute(k, v));
                    e.appendChild(an);
                } else if (!laeuft && da) da.remove();
            });
            const auf = laeuft && P('P') >= zahl(t.o.p, 60) - 1;
            const k = r.querySelector('.fp-b-ventil'); if (k) k.style.transform = auf ? 'translateY(2px)' : '';
            const f = r.querySelector('.fp-b-feder'); if (f) f.style.transform = auf ? 'scaleY(0.8)' : '';
        }
    };
    // Bild eines Teils (Maßstab 1, Planeinheiten) in g zeichnen
    // Angedockter Schalldämpfer/Blindstopfen am Wegeventil in der Darstellung des Ventils
    // (Gehäuse, Schnitt, geschlossen): eingeschraubt am Anschlusspunkt, Luftraum färbt sich mit dem Anschluss.
    function abschlussBild(anhaengen, x, y, a, mode, uid, doc, pid) {
        const typ = a.art === 'stopfen' ? 'stopfen' : 'daempfer';
        const gt = { typ, o: Object.assign({}, TYP[typ].optionen, { drossel: a.art === 'drossel' }) };
        const altB = bildDok; bildDok = doc || document;
        try {
            const gg = el('g', { transform: `translate(${x},${y + (typ === 'stopfen' ? 12 : 9)})`, class: 'fp-dock' });
            anhaengen(gg);
            BAU[typ].zeichne(gt, bauStift(mode, uid, gg));
            gg.querySelectorAll('.fp-b-luft').forEach(e => { e.setAttribute('class', 'fp-r-kanal'); e.setAttribute('data-p', pid); });
        } finally { bildDok = altB; }
    }
    function bauZeichnen(t, g, mode, uid, rot) {
        const B = BAU[t.typ]; if (!B) return false;
        const D = bauStift(mode, uid, g, istHyd(t));
        const G = geo(t);
        for (const p of G.ports) bauStutzen(D, t, p, B.rand, rot);
        B.zeichne(t, D);
        return true;
    }
    function bauSvg(obj, doc, L) {
        const t = teilAus2D(obj), uid = String(obj.id).replace(/[^\w-]/g, ''), mode = darst(obj);
        const s = el('svg', { class: 'fp2d fp-bau fp-bau-' + mode, width: Math.round(L.w), height: Math.round(L.h), viewBox: `${L.b[0]} ${L.b[1]} ${L.b[2] - L.b[0]} ${L.b[3] - L.b[1]}`,
            style: 'position:absolute;left:0;top:0;overflow:visible;color:#37474f;--fp-papier:#fff;pointer-events:none' });
        const defs = el('defs', {}, s);
        const pat = el('pattern', { id: 'fps-' + uid, patternUnits: 'userSpaceOnUse', width: 4, height: 4 }, defs);
        el('rect', { width: 4, height: 4, fill: '#cfd8dc' }, pat);
        el('path', { d: 'M-1,1 L1,-1 M0,4 L4,0 M3,5 L5,3', stroke: '#78909c', 'stroke-width': 0.6 }, pat);
        const grad = el('linearGradient', { id: 'fpa-' + uid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el('stop', { offset: '0', 'stop-color': '#eceff1' }, grad); el('stop', { offset: '0.45', 'stop-color': '#b0bec5' }, grad); el('stop', { offset: '1', 'stop-color': '#78909c' }, grad);
        const r = ((t.rot || 0) % 360 + 360) % 360;
        const g = el('g', { transform: `translate(${t.x},${t.y}) rotate(${r})${t.sp ? ' scale(-1,1)' : ''}`, 'data-t': t.id }, s);
        bauZeichnen(t, g, mode, uid, r);
        return s;
    }
    // Normsymbol in der 2D-Anlage: Kugeln, Schieber, Zeiger, Kontakte wie im Plan
    function symbolAnimieren(obj, st) {
        const t0 = teilAus2D(obj), g = obj.el && obj.el.querySelector('svg.fp2d g[data-t]'); if (!g) return;
        const ids = geo(t0).ports.map(p => p.id);
        const pr = st ? echtDruecke(st, ids) : ids.map(() => 0);
        const P = id => { const i = ids.indexOf(id); return i < 0 ? 0 : pr[i]; };
        const z = st ? st.z : null;
        const sig = 's' + pr.map(p => p.toFixed(1)).join(',') + '|' + (z ? [z.seite, z.an, z.ab, z.x != null ? z.x.toFixed(3) : ''].join() : '-');
        if (obj._fpSig === sig) return;
        obj._fpSig = sig;
        const typ = t0.typ, kugel = g.querySelector('.fp-kugel');
        if ((typ === 'drv' || typ === 'rueck') && kugel) {
            let [vor, nach] = typ === 'drv' ? ['2', '1'] : ['1', '2'];
            try { if (st && st.p === plan && fehlerAktiv(st.t.id) === 'verkehrt') [vor, nach] = [nach, vor]; } catch (e) {}
            const auf = !!z && P(vor) > P(nach) + 0.005, sk = Number(kugel.getAttribute('data-frei')) || 1;
            kugel.setAttribute('transform', auf ? `translate(0,${sk * 5})` : '');
            kugel.setAttribute('fill', auf ? 'var(--fp-aktiv)' : 'var(--fp-papier)');
        }
        if (typ === 'wechsel' && kugel) kugel.setAttribute('cx', z ? (z.seite === 'X' ? 9 : -9) : 0);
        if (typ === 'zweidruck') { const sc = g.querySelector('.fp-schieber'); if (sc) sc.setAttribute('transform', `translate(${z ? (z.seite === 'X' ? 3 : -3) : 0},0)`); }
        if (typ === 'schnell' && kugel) kugel.setAttribute('cy', z && z.ab ? 6 : -2);
        if (typ === 'zeit' || typ === 'folge') { const b = g.querySelector('.fp-block'); if (b) b.setAttribute('transform', `translate(${z && z.an ? KASTEN : 0},0)`); const sp = g.querySelector('.fp-speicher'); if (sp) sp.setAttribute('fill', z && z.pr > 0.3 ? `rgba(21,101,192,${Math.min(0.85, z.pr / 6)})` : 'var(--fp-papier)'); }
        if (typ === 'manometer') {
            const voll = istHyd(t0) ? 160 : 10;
            const p = z ? P('1') : 0, w = (-135 + Math.max(0, Math.min(voll, p)) / voll * 270) * Math.PI / 180, n = g.querySelector('.fp-nadel'), wt = g.querySelector('.fp-wert');
            if (n) { n.setAttribute('x2', 9 * Math.sin(w)); n.setAttribute('y2', -9 * Math.cos(w)); }
            if (wt) wt.textContent = z ? p.toFixed(istHyd(t0) ? 0 : 1) + ' bar' : '';
        }
        if (typ === 'dbv') { const k = g.querySelector('.fp-dbv-pfeil'); if (k) k.setAttribute('transform', z && z.auf ? 'translate(-4,0)' : ''); }
        if (typ === 'entsperr' && kugel) kugel.setAttribute('transform', z && (z.entsperrt || P('1') > P('2') + 0.05) ? 'translate(0,-5)' : '');
        if (typ === 'speicher') { const k = g.querySelector('.fp-oelstand'); if (k) { const a = z ? Math.max(0, Math.min(1, (z.voil || 0) / Math.max(0.05, zahl(t0.o.V0, 0.7)))) : 0; k.setAttribute('height', 16 * a); k.setAttribute('y', 15 - 16 * a); } }
        if (typ === 'dschalter') { const k = g.querySelector('.fp-kontakt'); if (k) k.setAttribute('d', z && z.an ? 'M12,2 H18 L26,-4' : 'M12,2 H18 L26,-8'); }
        if (typ === 'schwenk') { const zg = g.querySelector('.fp-zeiger'); if (zg) { const s2 = z && z.x != null ? z.x / zylHub(t0) : 0, w = Math.PI - s2 * Math.PI; zg.setAttribute('x2', 16 * Math.cos(w)); zg.setAttribute('y2', 8 - 16 * Math.sin(w)); } }
        // Leitungsstriche des Symbols färben sich mit dem Druck des nächsten Anschlusses
        const an = pr.some(p => p > pAn(istHyd(t0)));
        obj.el.style.boxShadow = an ? (istHyd(t0) ? '0 0 0 1px rgba(229,57,53,.6)' : '0 0 0 1px rgba(41,182,246,.6)') : '';
    }
    // Animation: Druck in den Luftwegen und bewegte Teile
    function bauAnimieren(obj, st) {
        const t0 = teilAus2D(obj), B = BAU[t0.typ], el2 = obj.el; if (!B || !el2) return;
        const ids = geo(t0).ports.map(p => p.id);
        const pr = st ? echtDruecke(st, ids) : ids.map(() => 0);
        const P = id => { const i = ids.indexOf(id); return i < 0 ? 0 : pr[i]; };
        const z = st ? Object.assign({ fehler: (() => { try { return st.p === plan ? fehlerAktiv(st.t.id) : null; } catch (e) { return null; } })() }, st.z) : null;
        const sig = pr.map(p => p.toFixed(1)).join(',') + '|' + (z ? [z.seite, z.an, z.ab, z.auf, z.entsperrt, z.voil != null ? z.voil.toFixed(3) : '', z.pr != null ? z.pr.toFixed(1) : '', z.x != null ? z.x.toFixed(3) : ''].join() : '-');
        if (obj._fpSig === sig) return;
        obj._fpSig = sig;
        const geh = darst(obj) === 'gehaeuse';
        const Pv = id => B.druck ? B.druck(id, P, z) : P(id);
        el2.querySelectorAll('.fp-b-luft').forEach(e => {
            const H = istHyd(t0), f = fluidFarbe(Pv(e.getAttribute('data-p')), H, geh);
            if (e.tagName === 'rect') e.setAttribute('fill', f); else if (e.classList.contains('fp-b-kanal')) e.setAttribute('stroke', f);
            else e.setAttribute('stroke', Pv(e.getAttribute('data-p')) > pAn(H) ? (H ? '#e53935' : '#29b6f6') : '#c0a060');
        });
        if (B.anim) B.anim(el2, t0, z, P);
    }
    // ------------------------------------------------------------
    // Zylinder der 2D-Anlage in den Darstellungen: 'gehaeuse' = das gewohnte 2D-Bild (unverändert),
    // 'aussen' = Profilzylinder wie echt, 'schnitt' = aufgeschnitten (Kammern, Kolben, Dichtungen,
    // Magnetring, Feder), 'symbol' = Normsymbol. Gezeichnet als Bild über dem Gehäuse; Kolben und
    // Kammerdruck laufen in jedem Bild mit (window._fpZylBild je Bild der Simulation).
    // ------------------------------------------------------------
    const zylArt = obj => !!obj && typeof obj.type === 'string' && obj.type.startsWith('zylinder');
    const zylMode = obj => { const b = obj.pneu && obj.pneu.bild; return BILDER.includes(b) ? b : bildStandard(); };
    function zylDruck(obj) {
        if (obj.hasHydraulics) return [Number(obj.hydPA) || 0, Number(obj.hydPB) || 0];
        const m = (window._fluidPressures && window._fluidPressures.pneu) || {};
        return [Number(m[obj.id + ':1']) || 0, Number(m[obj.id + ':2']) || 0];
    }
    function zylBauen(obj, mode, W) {
        const hs = obj.el.querySelector('.f2d-zylinder'); if (!hs) return null;
        let s = hs.querySelector('svg.f2d-zyl-bild'); if (s) s.remove();
        const doc = obj.el.ownerDocument || document, uid = 'z' + String(obj.id).replace(/[^\w-]/g, '');
        const mk = (tag, a, p) => { const e = doc.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
        s = mk('svg', { class: 'f2d-zyl-bild', width: W, height: 30, viewBox: `0 0 ${W} 30`, style: 'position:absolute;left:-1px;top:-1px;overflow:visible;pointer-events:none;z-index:1' });
        const defs = mk('defs', {}, s);
        const pat = mk('pattern', { id: 'fps-' + uid, patternUnits: 'userSpaceOnUse', width: 4, height: 4 }, defs);
        mk('rect', { width: 4, height: 4, fill: '#cfd8dc' }, pat); mk('path', { d: 'M-1,1 L1,-1 M0,4 L4,0 M3,5 L5,3', stroke: '#78909c', 'stroke-width': 0.6 }, pat);
        const gr = mk('linearGradient', { id: 'fpa-' + uid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        [['0', '#f5f7f8'], ['0.3', '#cfd8dc'], ['0.75', '#90a4ae'], ['1', '#607d8b']].forEach(([o, c]) => mk('stop', { offset: o, 'stop-color': c }, gr));
        const gk = mk('linearGradient', { id: 'fpk-' + uid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        [['0', '#546e7a'], ['0.4', '#37474f'], ['1', '#263238']].forEach(([o, c]) => mk('stop', { offset: o, 'stop-color': c }, gk));
        const ew = obj.type === 'zylinder_single';
        const R = { s, mode, W, ew };
        if (mode === 'symbol') {
            mk('rect', { x: 0.8, y: 0.8, width: W - 1.6, height: 28.4, fill: '#fff', stroke: '#000', 'stroke-width': 1.6 }, s);
            R.kolben = mk('rect', { x: 0, y: 1.6, width: 2.4, height: 26.8, fill: '#000' }, s);
            R.stange = mk('rect', { x: 0, y: 13.4, width: 0, height: 3.2, fill: '#000' }, s);
            if (ew) R.feder = mk('polyline', { points: '', fill: 'none', stroke: '#000', 'stroke-width': 1.1 }, s);
            hs.appendChild(s);
            return R;
        }
        const schnitt = mode === 'schnitt';
        const wand = schnitt ? `url(#fps-${uid})` : `url(#fpa-${uid})`;
        // Rohr bzw. Profil
        mk('rect', { x: 0, y: 0, width: W, height: 30, rx: 1.5, fill: wand, stroke: '#37474f', 'stroke-width': 1 }, s);
        if (schnitt) {
            R.kA = mk('rect', { x: 7, y: 4, width: 1, height: 22, fill: '#eceff1' }, s);
            R.kB = mk('rect', { x: 7, y: 4, width: 1, height: 22, fill: '#eceff1' }, s);
            mk('rect', { x: 7, y: 4, width: W - 14, height: 22, fill: 'none', stroke: '#37474f', 'stroke-width': 0.7 }, s);
            // Anschlusskanäle durch den Deckel
            R.pA = mk('path', { d: `M10,0 V6 H7`, fill: 'none', stroke: '#eceff1', 'stroke-width': 2.4 }, s);
            if (!ew) R.pB = mk('path', { d: `M${W - 10},0 V6 H${W - 7}`, fill: 'none', stroke: '#eceff1', 'stroke-width': 2.4 }, s);
            else mk('path', { d: `M${W - 10},0 V4`, stroke: '#eceff1', 'stroke-width': 1.6 }, s);   // Entlüftung
            if (ew) R.feder = mk('polyline', { points: '', fill: 'none', stroke: '#455a64', 'stroke-width': 1.1 }, s);
            // Kolbenstange innen (durch den vorderen Deckel mit Stangendichtung)
            R.stange = mk('rect', { x: 0, y: 11.5, width: 0, height: 7, fill: '#cfd8dc', stroke: '#546e7a', 'stroke-width': 0.5 }, s);
            for (const y of [10.2, 18.6]) mk('rect', { x: W - 5.5, y, width: 2.4, height: 1.2, fill: '#212121' }, s);
            R.kolben = mk('g', {}, s);
            mk('rect', { x: 0, y: 4.3, width: 7, height: 21.4, rx: 0.6, fill: '#90a4ae', stroke: '#37474f', 'stroke-width': 0.6 }, R.kolben);
            if (!obj.hasHydraulics) mk('rect', { x: 2, y: 4.3, width: 3, height: 21.4, fill: '#c62828', opacity: 0.85 }, R.kolben);   // Magnetring
            else for (const x of [1.6, 4.2]) mk('rect', { x, y: 4.3, width: 1.2, height: 21.4, fill: '#37474f' }, R.kolben);   // Führungsband
            for (const x of [0.4, 5.4]) for (const y of [4.3, 23.9]) mk('rect', { x, y, width: 1.2, height: 1.8, fill: '#212121' }, R.kolben);
            // Deckel (Endlagen)
            for (const x of [0, W - 7]) mk('rect', { x, y: 0, width: 7, height: 30, fill: `url(#fpk-${uid})`, opacity: 0.35 }, s);
        } else if (obj.hasHydraulics) {
            // geschlossen, Hydraulik: Stahlrohr, kräftige Köpfe mit Zugankern
            for (const y of [3, 27]) mk('line', { x1: 9, y1: y, x2: W - 9, y2: y, stroke: '#455a64', 'stroke-width': 1.4 }, s);   // Zuganker
            for (const x of [0, W - 10]) {
                mk('rect', { x, y: -2, width: 10, height: 34, rx: 0.8, fill: `url(#fpk-${uid})`, stroke: '#1c262b', 'stroke-width': 0.8 }, s);
                for (const y of [3, 27]) mk('circle', { cx: x + 5, cy: y, r: 1.8, fill: '#b0bec5', stroke: '#1c262b', 'stroke-width': 0.5 }, s);   // Mutter
            }
            mk('rect', { x: W - 2, y: 9, width: 4, height: 12, rx: 1, fill: '#78909c', stroke: '#263238', 'stroke-width': 0.5 }, s);
            const tx = mk('text', { x: W / 2, y: 17.5, 'font-size': 6, 'text-anchor': 'middle', fill: '#37474f', 'font-family': 'sans-serif' }, s);
            tx.textContent = `Ø${obj.pistonD || 20} × ${obj.stroke || 100}`;
        } else {
            // geschlossen: Aluprofil mit Sensornuten, Deckel mit Schrauben
            for (const y of [6, 24]) { mk('line', { x1: 8, y1: y, x2: W - 8, y2: y, stroke: '#455a64', 'stroke-width': 0.8 }, s); mk('line', { x1: 8, y1: y + 1, x2: W - 8, y2: y + 1, stroke: '#fff', 'stroke-opacity': 0.6, 'stroke-width': 0.6 }, s); }
            mk('line', { x1: 8, y1: 2, x2: W - 8, y2: 2, stroke: '#fff', 'stroke-opacity': 0.8, 'stroke-width': 1 }, s);
            for (const x of [0, W - 8]) {
                mk('rect', { x, y: -1, width: 8, height: 32, rx: 1.2, fill: `url(#fpk-${uid})`, stroke: '#1c262b', 'stroke-width': 0.8 }, s);
                for (const y of [3, 27]) mk('circle', { cx: x + 4, cy: y, r: 1.4, fill: '#90a4ae', stroke: '#1c262b', 'stroke-width': 0.4 }, s);
            }
            mk('rect', { x: W - 3, y: 10, width: 4, height: 10, rx: 1, fill: '#78909c', stroke: '#263238', 'stroke-width': 0.5 }, s);   // Stangenführung
            const tx = mk('text', { x: W / 2, y: 17.5, 'font-size': 6, 'text-anchor': 'middle', fill: '#455a64', 'font-family': 'sans-serif' }, s);
            tx.textContent = `Ø${obj.pistonD || 20} × ${obj.stroke || 100}`;
        }
        hs.appendChild(s);
        return R;
    }
    window._fpZylBild = function (obj) {
        if (!obj || !obj.el || !zylArt(obj)) return;
        const mode = zylMode(obj), W = Math.round(obj.width || 80);
        const key = mode + '|' + W + '|' + obj.type;
        if (obj._zylKey !== key) {
            obj._zylKey = key;
            BILDER.forEach(b => obj.el.classList.toggle('zyl-bild-' + b, b === mode && b !== 'gehaeuse'));
            if (mode === 'gehaeuse') { const s = obj.el.querySelector('svg.f2d-zyl-bild'); if (s) s.remove(); obj._zylR = null; return; }
            obj._zylR = zylBauen(obj, mode, W);
        }
        const R = obj._zylR; if (!R || !R.kolben) return;
        const e = Math.max(0, Math.min(100, obj.extension || 0)) / 100, kw = R.mode === 'symbol' ? 2.4 : 7;
        const x = 7 + e * (W - 14 - kw);
        R.kolben.setAttribute(R.mode === 'symbol' ? 'x' : 'transform', R.mode === 'symbol' ? x : `translate(${x},0)`);
        if (R.mode === 'symbol') { R.stange.setAttribute('x', x + kw); R.stange.setAttribute('width', Math.max(0, W - x - kw)); }
        else if (R.stange) { R.stange.setAttribute('x', x + kw); R.stange.setAttribute('width', Math.max(0, W - x - kw + 1)); }
        if (R.feder) {
            const x0 = x + kw + 0.5, x1 = W - (R.mode === 'symbol' ? 2 : 7.5), pts = [];
            for (let i = 0; i <= 8; i++) pts.push((x0 + (x1 - x0) * i / 8).toFixed(1) + ',' + (15 + (i === 0 || i === 8 ? 0 : (i % 2 ? -7 : 7))));
            R.feder.setAttribute('points', pts.join(' '));
        }
        if (R.kA) {
            const H = !!obj.hasHydraulics, [pa, pb] = zylDruck(obj), fa = luftFarbe(pa, H), fb = luftFarbe(pb, H);
            R.kA.setAttribute('x', 7); R.kA.setAttribute('width', Math.max(0, x - 7)); R.kA.setAttribute('fill', fa);
            R.kB.setAttribute('x', x + kw); R.kB.setAttribute('width', Math.max(0, W - 7 - x - kw)); R.kB.setAttribute('fill', R.ew ? '#eceff1' : fb);
            if (R.pA) R.pA.setAttribute('stroke', fa); if (R.pB) R.pB.setAttribute('stroke', fb);
        }
    };
    window._fpZylAlle = () => { for (const o of (fabrik() || [])) if (zylArt(o)) { try { window._fpZylBild(o); } catch (e) {} } };
    // ------------------------------------------------------------
    // Hydraulikteile der 2D-Anlage in den vier Darstellungen: 'gehaeuse' = gewohntes 2D-Bild,
    // 'symbol' = Normsymbol, 'schnitt'/'aussen' = echt (dieselben Bilder wie die Fluidplan-Teile).
    // Als Bild über dem Teil; Anschlüsse, Kennzeichen und Messwert bleiben die des 2D-Teils.
    // ------------------------------------------------------------
    const HYD_BILD = {
        valve_hyd: o => {
            const zyl = (fabrik() || []).find(q => q.id === o.targetCylinderId), ew = zyl && zyl.type === 'zylinder_single';
            if (o.isTriple) return { typ: 'ventil', o: { wege: '4/3', mitte: 'gesperrt', links: 'magnet', rechts: 'magnet' } };
            if (ew || !o.isDouble && !(zyl && zyl.type === 'zylinder_double')) return { typ: 'ventil', o: { wege: '3/2', links: 'magnet', rechts: 'feder' } };
            return { typ: 'ventil', o: { wege: '4/2', links: 'magnet', rechts: o.isDouble ? 'magnet' : 'feder' } };
        },
        throttle_hyd: o => ({ typ: 'stromregel', o: { q: Math.round(zahl(o.opening, 50) / 5) } }),
        check_valve_hyd: o => ({ typ: (o.hyd || {}).entsperrbar === false ? 'rueck' : 'entsperr', o: {} }),
        hydraulic_unit: o => ({ typ: 'aggregat', o: { p: zahl(o.pressure, 100), q: zahl(o.maxFlow, 20) } }),
        accumulator_hyd: o => ({ typ: 'speicher', o: { V0: zahl((o.hyd || {}).volumen, 0.7), p0: zahl((o.hyd || {}).vordruck, 30) } }),
        pressure_switch_hyd: o => ({ typ: 'dschalter', o: { p: zahl((o.hyd || {}).schaltdruck, 50) } }),
        manometer_hyd: o => ({ typ: 'manometer', o: {} })
    };
    const hydBildArt = obj => !!obj && !!HYD_BILD[obj.type];
    const hydMode = obj => { const b = obj.pneu && obj.pneu.bild; return BILDER.includes(b) ? b : bildStandard(); };
    window._fpHydBildArt = hydBildArt;
    function hydBildBauen(obj, mode) {
        const f = HYD_BILD[obj.type](obj);
        f.o = Object.assign({ hyd: true }, f.o); f.rot = 0; f.bild = mode;
        const doc = obj.el.ownerDocument || document, halter = doc.createElement('div');
        const schein = { id: 'hb' + obj.id, el: halter, type: 'pneu_fp', pneu: { fp: f }, normLabel: '' };
        symbol2D(schein);
        const svg = halter.querySelector('svg'); if (!svg) return null;
        // Höhe des 2D-Teils, Breite nach dem Bild (ein Wegeventil ragt seitlich über)
        const W = Math.max(1, obj.el.offsetWidth || obj.width || 40), H = Math.max(1, obj.el.offsetHeight || obj.height || 40), w = Math.max(1, schein.width || W), h = Math.max(1, schein.height || H);
        const k = Math.min(1.3 * H / h, (obj.type === 'valve_hyd' ? 2.8 : 1.6) * W / w), bw = w * k, bh = h * k;
        svg.setAttribute('width', bw.toFixed(1)); svg.setAttribute('height', bh.toFixed(1));
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('class', (svg.getAttribute('class') || '') + ' f2d-hyd-bild');
        svg.style.cssText = `position:absolute;left:${((W - bw) / 2).toFixed(1)}px;top:${((H - bh) / 2).toFixed(1)}px;width:${bw.toFixed(1)}px;height:${bh.toFixed(1)}px;max-width:none;max-height:none;overflow:visible;pointer-events:none;z-index:1;color:#263238;--fp-papier:#fff;--fp-aktiv:#ffb300`;
        if (mode === 'symbol') svg.style.background = 'rgba(255,255,255,.92)';
        return svg;
    }
    window._fpHydBild = function (obj) {
        if (!obj || !obj.el || !hydBildArt(obj)) return;
        const mode = hydMode(obj), f = HYD_BILD[obj.type](obj);
        const key = mode + '|' + (obj.el.offsetWidth || 0) + 'x' + (obj.el.offsetHeight || 0) + '|' + JSON.stringify(f);
        if (obj._hydKey !== key) {
            obj._hydKey = key;
            const alt = obj.el.querySelector('svg.f2d-hyd-bild'); if (alt) alt.remove();
            BILDER.forEach(b => obj.el.classList.toggle('hyd-bild-' + b, b === mode && b !== 'gehaeuse'));
            obj.el.classList.toggle('hyd-bild', mode !== 'gehaeuse');
            if (mode === 'gehaeuse') return;
            const svg = hydBildBauen(obj, mode);
            if (svg) obj.el.insertBefore(svg, obj.el.firstChild);
        }
        // Wegeventil: geschaltete Stellung wie in der 2D-Anlage (Kastenblock verschieben)
        if (obj.type === 'valve_hyd' && mode === 'symbol') {
            const b = obj.el.querySelector('svg.f2d-hyd-bild .fp-block'); if (!b) return;
            const ext = obj.el.classList.contains('active-ext'), ret = obj.el.classList.contains('active-ret');
            const dx = obj.isTriple ? (ext ? KASTEN : ret ? -KASTEN : 0) : (ext ? KASTEN : 0);
            b.setAttribute('transform', dx ? `translate(${dx},0)` : '');
        }
    };
    window._fpHydAlle = () => { for (const o of (fabrik() || [])) if (hydBildArt(o)) { try { window._fpHydBild(o); } catch (e) {} } };
    setInterval(() => { try { window._fpHydAlle(); } catch (e) {} }, 250);
    setInterval(() => { try { if (!simLaeuft()) window._fpZylAlle(); } catch (e) {} }, 500);
    function stand2D(obj) {
        if (!simLaeuft()) return null;
        if (sim && plan.anlage) {
            const t = plan.teile.find(q => q.o && q.o.anlage === obj.id);
            if (t && sim.zust[t.id]) return { t, z: sim.zust[t.id], p: plan, s: sim };
        }
        const k = schatten && schatten.sim && schatten.fp2d && schatten.fp2d[obj.id];
        if (k) { const t = schatten.plan.teile.find(q => q.id === k); if (t && schatten.sim.zust[k]) return { t, z: schatten.sim.zust[k], p: schatten.plan, s: schatten.sim }; }
        return null;
    }
    function animate2D(obj) {
        const f = fp2d(obj); if (!obj.el) return;
        if (f.typ !== 'ventil') { if (bau(obj)) bauAnimieren(obj, stand2D(obj)); else symbolAnimieren(obj, stand2D(obj)); return; }
        const st = stand2D(obj);
        const o = Object.assign({}, TYP.ventil.optionen, f.o), n = ventilStellungen(o).length, ruhe = n === 3 ? 1 : n - 1;
        const k = st ? st.z.stellung : ruhe;
        // Betätigt? Aus dem Rechenkern; ohne Simulation aus der Stellung
        const anL = st ? !!st.z.betL : false, anR = st ? !!st.z.betR : false;
        if (echt(obj)) { echtAnimieren(obj, st, k, ruhe, n, o, anL, anR); return; }
        const sig = k + '|' + anL + anR;
        if (obj._fpStand === k && obj._fpSig === sig) return;
        obj._fpStand = k; obj._fpSig = sig;
        const b = obj.el.querySelector('svg.fp2d g[data-t="2d:' + obj.id + '"] .fp-block');
        if (b) {
            if (gehaeuse(obj)) b.style.transform = `translateX(${(ruhe - k) * KASTEN}px)`;
            else b.setAttribute('transform', `translate(${(ruhe - k) * KASTEN},0)`);
        }
        // Gehäuse: Spule leuchtet orange, Handbetätigung/Rolle wird blau eingedrückt, Feder gestaucht
        if (gehaeuse(obj)) obj.el.querySelectorAll('.fp-g-bet').forEach(g => {
            const L = g.getAttribute('data-seite') === 'L', an = L ? anL : anR;
            const sp = g.querySelector('.fp-g-spule');
            if (sp) { sp.setAttribute('fill', an ? '#ff9800' : '#fff'); sp.setAttribute('stroke', an ? '#e65100' : '#333'); sp.style.filter = an ? 'drop-shadow(0 0 4px #ff9800)' : ''; }
            else { const c = g.firstChild; betZeigen(c, L ? o.links : o.rechts, L ? -1 : 1, an, '#2196f3'); if (c) c.style.filter = an ? 'drop-shadow(0 0 3px #2196f3)' : ''; }
            const fd = g.querySelector('.fp-g-feder');
            if (fd) { const gedr = L ? k !== 0 && ruhe === 0 : k !== n - 1 && ruhe === n - 1; fd.style.transform = gedr ? 'scaleX(0.5)' : ''; fd.style.color = gedr ? '#2196f3' : ''; }
        });
        else {
            betZeigen(obj.el.querySelector('.fp-bet-l'), o.links, -1, anL, 'var(--fp-aktiv)');
            betZeigen(obj.el.querySelector('.fp-bet-r'), o.rechts, 1, anR, 'var(--fp-aktiv)');
            obj.el.querySelectorAll('.fp-bet-magnet').forEach(m => { const an = m.closest('.fp-bet-l') ? anL : anR; m.setAttribute('fill', an ? 'var(--fp-aktiv)' : 'none'); });
        }
        if (obj.isActive !== (k !== ruhe) && st && typeof SoundEngine !== 'undefined') { try { SoundEngine.clack(); } catch (e) {} }
        obj.isActive = k !== ruhe;
    }
    // Handbetätigung in der laufenden Simulation (Taster, Pilz, Pedal: solange gedrückt; Hebel rastet)
    function klick2D(obj, e) {
        const f = fp2d(obj); if (f.typ !== 'ventil') return;
        const o = f.o || {};
        let seite = MANUELL[o.links] ? 'L' : MANUELL[o.rechts] ? 'R' : null; if (!seite) return;
        // Beidseitig von Hand: die Seite, auf deren Betätiger (näher) geklickt wurde
        if (MANUELL[o.links] && MANUELL[o.rechts] && e && e.clientX != null) seite = klickSeite(obj, e) || seite;
        const st = stand2D(obj); if (!st) return;
        const tun = an => { if (st.p === plan) handDruck(st.t.id, seite, an); else mitPlan(st.p, st.s, () => handDruck(st.t.id, seite, an)); };
        tun(true);
        const b = seite === 'L' ? o.links : o.rechts;
        if (b === 'hebel') return;
        const W2 = (obj.el.ownerDocument && obj.el.ownerDocument.defaultView) || window;
        const los = () => { tun(false); W2.removeEventListener('mouseup', los); W2.removeEventListener('pointerup', los); };
        W2.addEventListener('mouseup', los); W2.addEventListener('pointerup', los);
    }
    function klickSeite(obj, e) {
        let best = null, d0 = Infinity;
        for (const [sel, sd] of [['.fp-g-bet[data-seite="L"], .fp-bet-l', 'L'], ['.fp-g-bet[data-seite="R"], .fp-bet-r', 'R']]) {
            const g = obj.el.querySelector(sel); if (!g) continue;
            const r = g.getBoundingClientRect(); if (!r.width && !r.height) continue;
            const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
            if (d < d0) { d0 = d; best = sd; }
        }
        return best;
    }
    const ART2D = { v: 'pressure', r: 'exhaust', a: 'work', s: 'work', k: 'work' };
    window._fpPorts2D = obj => lage2D(obj).ports.map(p => ({ id: p.id, label: String(p.nr), lx: p.lx, ly: p.ly, ptype: ART2D[p.art] || 'work', rot: true }));
    // 3D-Werkstatt (valisBruecke.zustand().objekte[id].fp): Art, Einstellungen, Anschlüsse,
    // Zustand aus dem Rechenkern (Stellung, betätigte Seiten, Kugel/Teller, Speicherdruck,
    // Schwenkwinkel) und die Drücke je Anschluss in bar. Ohne Simulation: z = null, Drücke 0.
    window._fp3d = function (obj) {
        try {
            const f = fp2d(obj), t = teilAus2D(obj), G = geo(t), st = simLaeuft() ? stand2D(obj) : null;
            const ids = G.ports.map(p => p.id), pr = st ? echtDruecke(st, ids) : ids.map(() => 0);
            const p = {}; ids.forEach((id, i) => { p[id] = +(Number(pr[i]) || 0).toFixed(2); });
            const r = { typ: t.typ, o: kopie(t.o), ab: kopie(f.ab || {}), rot: f.rot || 0, sp: !!f.sp, p,
                ports: G.ports.map(q => ({ id: q.id, nr: String(q.nr || q.id), art: q.art, x: q.x, y: q.y, dir: q.dir })), z: null };
            if (t.typ === 'ventil') { const n = ventilStellungen(t.o).length; r.n = n; r.ruhe = n === 3 ? 1 : n - 1; }
            if (st && st.z) {
                r.z = {};
                for (const k of ['stellung', 'betL', 'betR', 'seite', 'an', 'ab', 'pr', 'x', 'v', 'rasteL', 'rasteR']) {
                    const v = st.z[k]; if (v != null && typeof v !== 'object' && typeof v !== 'function') r.z[k] = v;
                }
                if (st.z.x != null) r.z.anteil = Math.max(0, Math.min(1, st.z.x / (zylHub(t) || 1)));
                try { if (st.p === plan) { const fe = fehlerAktiv(st.t.id); if (fe) r.fehler = fe; } } catch (e) {}
            }
            return r;
        } catch (e) { return null; }
    };
    // Handbetätigung aus der 3D-Werkstatt (Taster, Pilz, Pedal: an/aus; Hebel: an rastet um)
    window._fpHand3D = function (id, seite, an) {
        const obj = (fabrik() || []).find(q => q.id === id); if (!obj || obj.type !== 'pneu_fp') return false;
        const f = fp2d(obj); if (f.typ !== 'ventil') return false;
        const o = Object.assign({}, TYP.ventil.optionen, f.o || {});
        if (seite !== 'L' && seite !== 'R') seite = MANUELL[o.links] ? 'L' : 'R';
        if (!MANUELL[seite === 'L' ? o.links : o.rechts]) return false;
        const st = stand2D(obj); if (!st) return false;
        const tun = () => handDruck(st.t.id, seite, an !== false);
        if (st.p === plan) tun(); else mitPlan(st.p, st.s, tun);
        return true;
    };
    // Einstellung eines Teils aus der 3D-Werkstatt (z. B. offen der Drossel, p des Druckreglers)
    window._fpOption3D = function (id, werte) {
        const obj = (fabrik() || []).find(q => q.id === id); if (!obj || obj.type !== 'pneu_fp' || !werte) return false;
        const f = fp2d(obj), T = TYP[f.typ]; if (!T) return false;
        let n = 0;
        for (const k of Object.keys(werte)) {
            if (!(k in T.optionen) || typeof werte[k] !== typeof T.optionen[k]) continue;
            f.o = f.o || {}; f.o[k] = werte[k]; n++;
        }
        if (!n) return false;
        try { symbol2D(obj); } catch (e) {}
        geaendert2D(obj);
        try { if (typeof saveFactoryState === 'function') saveFactoryState(); } catch (e) {}
        return true;
    };
    // Einstellungen im Rechtsklickmenü der 2D-Anlage
    const OPT_NAME = { p: ['Druck', 'bar', 0.5, 10, 0.5], offen: ['Öffnung', '%', 1, 100, 1], zeit: ['Zeit', 's', 0.1, 60, 0.1] };
    function menue2D(obj, ctx, sichern, umbau, platz) {
        const f = fp2d(obj), doc = ctx.ownerDocument || document;
        const mk = (tag, txt, st) => { const e = doc.createElement(tag); if (txt != null) e.textContent = txt; if (st) e.style.cssText = st; return e; };
        const box = mk('div', null, 'padding:5px 15px;border-top:1px solid #555;margin-top:5px');
        box.onclick = e => e.stopPropagation(); box.onmousedown = e => e.stopPropagation();
        box.appendChild(mk('div', '⚙️ ' + ((TYP[f.typ] || {}).name || 'Bauteil'), 'color:#03a9f4;font-size:10px;font-weight:bold;margin-bottom:4px'));
        const neu = () => {
            if (umbau) return umbau();
            symbol2D(obj);
            try { if (rolleAnZylinder(obj, fabrik() || [])) updateObjTransform(obj); } catch (e) {}
            try { if (typeof _updatePneuPortLayer === 'function') _updatePneuPortLayer(); if (typeof window.drawPneumaticHoses === 'function') window.drawPneumaticHoses(); } catch (e) {}
            sichern && sichern(); geaendert2D(obj);
        };
        const zeile = (label, inp) => { const r = mk('label', null, 'display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:#ddd;margin:3px 0'); r.appendChild(mk('span', label)); r.appendChild(inp); box.appendChild(r); return r; };
        const auswahl = (label, liste, wert, setze) => {
            const s = mk('select', null, 'font-size:11px;max-width:150px'); liste.forEach(([v, n]) => { const op = mk('option', n); op.value = v; s.appendChild(op); });
            s.value = wert; s.onchange = () => { setze(s.value); neu(); menueNeu(); }; return zeile(label, s);
        };
        const zahlFeld = (label, key, min, max, step, einheit) => {
            const i = mk('input', null, 'width:60px;font-size:11px'); i.type = 'number'; i.min = min; i.max = max; i.step = step;
            i.value = f.o[key] != null ? f.o[key] : (TYP[f.typ].optionen[key]);
            i.onchange = () => { f.o[key] = Math.max(min, Math.min(max, parseFloat(i.value) || 0)); neu(); };
            return zeile(label + (einheit ? ' (' + einheit + ')' : ''), i);
        };
        const textFeld = (label, key, liste) => {
            const s = mk('select', null, 'font-size:11px;max-width:150px');
            [''].concat(liste).forEach(v => { const op = mk('option', v || '–'); op.value = v; s.appendChild(op); });
            s.value = f.o[key] || ''; s.onchange = () => { f.o[key] = s.value; neu(); }; return zeile(label, s);
        };
        const ausg = () => { try { return (globalOutputs || []).slice(); } catch (e) { return []; } };
        const eing = () => { try { return (globalInputs || []).slice(); } catch (e) { return []; } };
        // Neu zeichnen an derselben Stelle (das Menü kann mehrspaltig umbrochen sein)
        function menueNeu() { const ph = doc.createElement('div'); box.parentNode ? box.parentNode.insertBefore(ph, box) : ctx.appendChild(ph); box.remove(); menue2D(obj, ctx, sichern, umbau, ph); }
        if (f.typ === 'ventil') {
            const o = f.o = Object.assign({}, TYP.ventil.optionen, f.o);
            auswahl('Wege', Object.keys(VLAGE).map(w => [w, w + '-Wegeventil']), o.wege, v => { o.wege = v; });
            const bets = Object.entries(BETAETIGUNG).map(([k, n]) => [k, n]);
            auswahl('Betätigung links', bets.filter(([k]) => k !== 'feder'), o.links, v => { o.links = v; });
            if (o.links === 'magnet') textFeld('Spule links', 'varL', ausg());
            auswahl('Betätigung rechts', bets, o.rechts, v => { o.rechts = v; });
            if (o.rechts === 'magnet') textFeld('Spule rechts', 'varR', ausg());
            const F = fabrik() || [];
            const zyl = F.filter(q => /^zylinder_/.test(q.type)).map(q => [q.id, q.normLabel || q.linkedVarExt || q.linkedVar || q.id]);
            for (const [seite, kz, kp, kr] of [['links', 'zyl', 'pos', 'richt'], ['rechts', 'zylR', 'posR', 'richtR']]) {
                const b = seite === 'links' ? o.links : o.rechts;
                if (b !== 'rolle' && b !== 'rolle_leer') continue;
                auswahl('Rolle ' + seite + ': Zylinder', [['', '–']].concat(zyl), o[kz] || '', v => { o[kz] = v; });
                const i = mk('input', null, 'width:60px;font-size:11px'); i.type = 'number'; i.min = 0; i.max = 100; i.step = 1; i.value = posProzent(o[kp]);
                i.onchange = () => { const v = Math.max(0, Math.min(100, parseFloat(i.value) || 0)); o[kp] = v === 0 ? 'hinten' : v === 100 ? 'vorne' : v; neu(); };
                zeile('Lage (% vom Hub)', i);
                auswahl('betätigt beim', [['aus', 'Ausfahren'], ['ein', 'Einfahren']], o[kr], v => { o[kr] = v; });
            }
            if (o.links === 'rolle' || o.links === 'rolle_leer' || o.rechts === 'rolle' || o.rechts === 'rolle_leer') zahlFeld('Schaltweg', 'schaltweg', 0.5, 20, 0.5, 'mm');
            if (o.wege === '5/3') auswahl('Mittelstellung', [['gesperrt', 'gesperrt'], ['entlueftet', 'entlüftet'], ['belueftet', 'belüftet']], o.mitte, v => { o.mitte = v; });
            if (o.wege === '2/2' || o.wege === '3/2') auswahl('Ruhestellung', [['zu', 'gesperrt'], ['offen', 'offen']], o.ruhe, v => { o.ruhe = v; });
            // Abluftanschlüsse: Schalldämpfer oder Stopfen sitzen direkt am Ventil
            const ab = f.ab || (f.ab = {});
            for (const p of TYP.ventil.geometrie({ o }).ports.filter(q => q.art === 'r')) {
                auswahl('Anschluss ' + p.id, ABSCHLUSS.filter(([k]) => k !== 'drossel'), (ab[p.id] && ab[p.id].art) || 'offen', v => { if (v === 'offen') delete ab[p.id]; else ab[p.id] = { art: v }; });
            }
        } else {
            const T = TYP[f.typ];
            f.o = Object.assign({}, T.optionen, f.o);
            for (const k of Object.keys(T.optionen)) {
                if (OPT_NAME[k]) zahlFeld(OPT_NAME[k][0], k, OPT_NAME[k][2], OPT_NAME[k][3], OPT_NAME[k][4], OPT_NAME[k][1]);
                else if (k === 'ruhe') auswahl('Ruhestellung', [['zu', 'gesperrt'], ['offen', 'offen']], f.o.ruhe, v => { f.o.ruhe = v; });
                else if (k === 'var') textFeld('Variable (Eingang)', 'var', eing());
                else if (k === 'drossel') auswahl('Drossel', [['n', 'ohne'], ['j', 'mit']], f.o.drossel ? 'j' : 'n', v => { f.o.drossel = v === 'j'; });
                else if (k === 'kurz') auswahl('Darstellung', [['n', 'ausführlich'], ['j', 'Kurzform']], f.o.kurz ? 'j' : 'n', v => { f.o.kurz = v === 'j'; });
            }
        }
        if (f.typ === 'ventil' || BAU[f.typ]) auswahl('Darstellung', [['gehaeuse', 'Gehäuse (anschaulich)'], ['symbol', 'Normsymbol (wie im Plan)'], ['schnitt', 'Echt, aufgeschnitten'], ['aussen', 'Echt, geschlossen']], darst(obj), v => { f.bild = v; });
        auswahl('Drehen', [['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']], String(f.rot || 0), v => { f.rot = +v; });
        if (platz && platz.parentNode) platz.replaceWith(box); else ctx.appendChild(box);
    }
    // Ein 2D-Teil wurde in der Anlage geändert: im verbundenen Plan nachziehen
    function geaendert2D(obj) { void obj; rueckZeit = 0; }
    // Die 2D-Anlage kennt 'pneu_fp' schon beim Laden (ComponentRegistry in index.html) und
    // ruft hierher durch; Teile, die vor diesem Skript geladen wurden, zeichnen wir jetzt nach.
    function bau2D(obj, elx, var1) {
        elx.className = 'f2d-obj f2d-pneu-fp';
        elx.style.background = 'rgba(255,255,255,.92)'; elx.style.border = '1px solid #90a4ae'; elx.style.borderRadius = '3px';
        const pn = obj.pneu || (obj.pneu = {});
        if (var1 && typeof var1 === 'object') pn.fp = JSON.parse(JSON.stringify(var1));
        else if (typeof var1 === 'string' && TYP[var1]) pn.fp = { typ: var1, o: Object.assign({}, TYP[var1].optionen), rot: 0 };
        fp2d(obj);
        obj.useCollision = false;
        symbol2D(obj);
        if (!obj.normLabel && !TYP[fp2d(obj).typ].ohneBez && !obj._ladend) {
            const belegt = new Set((fabrik() || []).map(q => q.normLabel).filter(Boolean));
            obj.normLabel = freiesKennzeichen(kennCode(fp2d(obj).typ, teilAus2D(obj).o), belegt);
            symbol2D(obj);
        }
    }
    // Rollenhebel in der 2D-Anlage: welcher Zylinder und welche Stelle des Hubs ergibt sich aus der
    // Lage der Rolle. Außerhalb jedes Stangenwegs schaltet sie nicht (zyl = '').
    let mausUnten = false;
    function rolleWelt(o, L) {
        const t = teilAus2D(o), n = ventilStellungen(t.o).length;
        const [px, py] = punkt2D(o, L === 'L' ? -14 : n * KASTEN + 14, 20);
        const r = (o.rotation || 0) * Math.PI / 180, cx = (o.width || 0) / 2, cy = (o.height || 0) / 2;
        const dx = px - cx, dy = py - cy;
        return [o.x + cx + dx * Math.cos(r) - dy * Math.sin(r), o.y + cy + dx * Math.sin(r) + dy * Math.cos(r)];
    }
    function rolleAmZylinder(F, wx, wy) {
        let best = null;
        for (const z of F) {
            if (!/^zylinder_/.test(z.type) || !z.width) continue;
            const h = z.height || 30, c = { x: z.x + z.width / 2, y: z.y + h / 2 }, r = -(z.rotation || 0) * Math.PI / 180;
            const dx = wx - c.x, dy = wy - c.y;
            const lx = z.width / 2 + dx * Math.cos(r) - dy * Math.sin(r), ly = h / 2 + dx * Math.sin(r) + dy * Math.cos(r);
            const anteil = (lx - (z.width - 3)) / z.width, quer = Math.abs(ly - h / 2);
            // Rolle muss den Nocken am Stangenende treffen: entlang des Stangenwegs, quer nah an der Stange
            if (anteil < -0.06 || anteil > 1.06 || quer > h / 2 + 12) continue;
            if (!best || quer < best.quer) best = { z, quer, pos: Math.max(0, Math.min(100, Math.round(anteil * 100))) };
        }
        return best;
    }
    function rollenLage2D() {
        if (mausUnten) return;
        const F = fabrik(); if (!F) return;
        let geaendert = false;
        // Nur wenn Ventil oder Zylinder bewegt wurden (Einstellungen im Menü setzen die Lage selbst)
        const zk = F.filter(z => /^zylinder_/.test(z.type)).map(z => [z.id, Math.round(z.x), Math.round(z.y), z.rotation || 0, z.width].join(':')).join(';');
        for (const o of F) {
            if (o.type !== 'pneu_fp' || !o.el) continue;
            const f = fp2d(o); if (f.typ !== 'ventil') continue;
            if (!['rolle', 'rolle_leer'].includes(f.o.links) && !['rolle', 'rolle_leer'].includes(f.o.rechts)) continue;
            const key = [Math.round(o.x), Math.round(o.y), o.rotation || 0, f.rot || 0, o.width, o.height, zk].join('|');
            if (o._rolleOrt === key) continue;
            o._rolleOrt = key;
            for (const [L, kb, kz, kp] of [['L', 'links', 'zyl', 'pos'], ['R', 'rechts', 'zylR', 'posR']]) {
                const b = f.o[kb]; if (b !== 'rolle' && b !== 'rolle_leer') continue;
                const [wx, wy] = rolleWelt(o, L), m = rolleAmZylinder(F, wx, wy);
                const zyl = m ? m.z.id : '', alt = f.o[kz] || '';
                const posAlt = posProzent(f.o[kp]);
                if (zyl === alt && (!m || Math.abs(m.pos - posAlt) < 2)) continue;
                f.o[kz] = zyl; if (m) f.o[kp] = m.pos === 0 ? 'hinten' : m.pos === 100 ? 'vorne' : m.pos;
                geaendert = true;
                if (m) nockenSetzen(m.z);
            }
        }
        if (geaendert) { rueckZeit = 0; try { if (typeof saveFactoryState === 'function') saveFactoryState(); } catch (e) {} }
    }
    function registrieren2D() {
        if (!window._fpRolleTakt) {
            window._fpRolleTakt = setInterval(() => { try { rollenLage2D(); } catch (e) {} }, 400);
            const W = window;
            W.addEventListener('pointerdown', () => { mausUnten = true; }, true);
            W.addEventListener('pointerup', () => { mausUnten = false; }, true);
            W.addEventListener('mousedown', () => { mausUnten = true; }, true);
            W.addEventListener('mouseup', () => { mausUnten = false; }, true);
        }
        window._fp2d = {
            build: bau2D,
            onLoadState(obj) { symbol2D(obj); },
            animate(obj) { try { animate2D(obj); } catch (e) {} },
            clickSimulate(obj, e) { klick2D(obj, e); },
            contextMenu(obj, ctx, sichern) { menue2D(obj, ctx, sichern); },
            refreshLabel(obj) { symbol2D(obj); }
        };
        (fabrik() || []).forEach(o => { if (o.type === 'pneu_fp' && o.el) { try { if (!o.el.className.includes('f2d-pneu-fp')) bau2D(o, o.el); else symbol2D(o); } catch (e) {} } });
        return true;
    }
    if (!registrieren2D()) document.addEventListener('DOMContentLoaded', registrieren2D);
    // Neues Fluidplan-Teil aus dem Menü Pneumatik der 2D-Anlage
    function neu2D(typ, oo) {
        if (!TYP[typ] || typeof createFactoryObject !== 'function') return null;
        const o = createFactoryObject('pneu_fp', oo ? { typ, o: Object.assign({}, TYP[typ].optionen, oo) } : typ);
        try { if (typeof saveFactoryState === 'function') saveFactoryState(); } catch (e) {}
        try { if (typeof _updatePneuPortLayer === 'function') _updatePneuPortLayer(); } catch (e) {}
        return o;
    }
    // Wegeventil der 2D-Anlage auf eine andere Betätigung umbauen (Rechtsklickmenü).
    // Magnetventile bleiben das 2D-Wegeventil; alles andere wird ein Fluidplan-Teil,
    // die Schläuche bleiben stecken.
    // Das alte 2D-Magnetventil als Fluidplan-Teil beschrieben (Spulen = Zylindervariablen)
    function fpVonVentil(v) {
        const F = fabrik() || [];
        const wege = v.isTriple ? '5/3' : v.isDouble ? '5/2' : '3/2';
        const zyl0 = v.targetCylinderId && F.find(q => q.id === v.targetCylinderId);
        const varL = (zyl0 && zyl0.linkedVarExt) || v.linkedVarExt || '';
        const varR = v.isDouble ? ((zyl0 && zyl0.linkedVarRet) || v.linkedVarRet || '') : '';
        const ab = {};
        for (const [p2d, a] of Object.entries(v.abschluss || {})) { const pp = /^5/.test(wege) ? ({ '3': '5', '5': '3' })[p2d] || p2d : p2d; if (a && a.art && a.art !== 'offen') ab[pp] = a.art === 'drossel' ? { art: 'drossel', offen: a.offen || 50 } : { art: a.art }; }
        return { typ: 'ventil', o: Object.assign({}, TYP.ventil.optionen, { wege, links: 'magnet', rechts: v.isDouble ? 'magnet' : 'feder', varL, varR, frei: true }), rot: 0, ab };
    }
    // Wegeventil der 2D-Anlage umbauen: arg = neue Betätigung links (Text) oder ein ganzes
    // Fluidplan-Teil { typ: 'ventil', o, ab }. Danach ist es ein frei konfigurierbares Fluidplan-Teil.
    function ventilUmbauen(v, arg) {
        const F = fabrik(); if (!F || !v || v.type !== 'valve_pneu' || !arg) return null;
        const wege = v.isTriple ? '5/3' : v.isDouble ? '5/2' : '3/2';
        let fp = fpVonVentil(v);
        if (typeof arg === 'string') { fp.o.links = arg; if (arg !== 'magnet') { fp.o.rechts = wege === '5/3' ? arg : 'feder'; fp.o.varL = ''; fp.o.varR = ''; } }
        else fp = JSON.parse(JSON.stringify(arg));
        fp.o.frei = true;
        // Mit dem Fluidplan verbunden: der Plan ist die Wahrheit, der Abgleich baut die 2D-Anlage um
        const w = plan.anlage && spiegel.get(v.id);
        if (w && w.ventil && teil(w.ventil)) {
            aendern(() => {
                const vt = teil(w.ventil), alt = kennCode('ventil', vt.o);
                vt.o = Object.assign(oAus2D(fp), { frei: true });
                for (const p of geo(vt).ports) if (p.art === 'r') abschlussSetzen(vt, p.id, (fp.ab || {})[p.id] || { art: 'offen' });
                if (kennCode('ventil', vt.o) !== alt) vt.bez = '';
                kennzeichenAuffrischen(plan);
            });
            return true;
        }
        const ab = fp.ab || {};
        const n = createFactoryObject('pneu_fp', fp);
        n.x = v.x; n.y = v.y; try { updateObjTransform(n); } catch (e) {}
        const tauschV = p => /^5/.test(wege) ? ({ '2': '4', '4': '2', '3': '5', '5': '3' })[p] || p : p;
        const C = window.pneuConnections = window.pneuConnections || [];
        // Drosseln des Zylinders werden Drosselrückschlagventile als Fluidplan-Teile
        const thr = F.filter(q => q.type === 'throttle' && v.targetCylinderId && q.targetCylinderId === v.targetCylinderId);
        const ersatz = { [v.id]: [n.id, tauschV] };
        for (const th of thr) {
            const d = createFactoryObject('pneu_fp', { typ: 'drv', o: { offen: drosselAus2D(th.opening != null ? th.opening : 50) }, rot: 180 });
            d.x = th.x; d.y = th.y; d.normLabel = th.normLabel || d.normLabel; try { symbol2D(d); updateObjTransform(d); } catch (e) {}
            ersatz[th.id] = [d.id, p => p];
        }
        for (const c of C) {
            for (const [ob, pp] of [['aObjId', 'aPortId'], ['bObjId', 'bPortId']]) {
                const e = ersatz[c[ob]]; if (!e) continue;
                c[ob] = e[0]; c[pp] = e[1](String(c[pp]));
                delete c._auto;
            }
        }
        const zyl = v.targetCylinderId && F.find(q => q.id === v.targetCylinderId);
        // Kennzeichen bleibt, wenn der Kennbuchstabe passt (-QM1 bleibt -QM1)
        if (v.normLabel && v.normLabel.startsWith('-' + kennCode('ventil', fp.o))) { n.normLabel = v.normLabel; symbol2D(n); }
        [v].concat(thr).forEach(q => { try { deleteObjRecursive(q); } catch (e) {} });
        if (zyl) zyl.hasPneumatics = true;   // hängt jetzt an freien Schläuchen
        try { if (typeof _applyPneuManualConnections === 'function') _applyPneuManualConnections(); } catch (e) {}
        try { if (typeof window.drawPneumaticHoses === 'function') window.drawPneumaticHoses(); } catch (e) {}
        try { if (typeof saveFactoryState === 'function') saveFactoryState(); } catch (e) {}
        return n;
    }
    window._fpVentilUmbauen = ventilUmbauen;
    // Rechtsklickmenü des alten 2D-Magnetventils: dasselbe volle Menü wie bei jedem Wegeventil.
    // Die erste Änderung baut es zum Fluidplan-Teil um und öffnet dessen Menü wieder.
    window._fpVentilMenue = function (v, ctx, sichern) {
        const vorlage = { id: v.id, el: v.el, pneu: { fp: fpVonVentil(v) } };
        menue2D(vorlage, ctx, sichern, () => {
            try { ctx.style.display = 'none'; } catch (e) {}
            const w = plan.anlage && spiegel.get(v.id), vid = w && w.ventil;
            const n = ventilUmbauen(v, vorlage.pneu.fp);
            const oeffne = q => { if (!q || !q.el) return; const r = q.el.getBoundingClientRect(); q.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
            if (n && n.el) setTimeout(() => oeffne(n), 60);
            // Mit dem Plan verbunden: der Abgleich baut das Teil, danach sein Menü öffnen
            else if (n === true && vid) setTimeout(() => { try { anlageAbgleichen(); } catch (e) {} const t = teil(vid); oeffne(t && t.o.anlage && (fabrik() || []).find(q => q.id === t.o.anlage)); }, 80);
        });
    };

    window.Fluidplan = {
        oeffnen, schliessen, umschalten,
        _sichtbar: () => { if (panelEl() || fenster) sichtbarGeworden(); },
        _abkoppeln: abkoppeln,
        _neu2D: neu2D, _ventilUmbauen: ventilUmbauen,
        _schaltbild: schaltbild, _posProzent: posProzent, _portLage: (id, p) => { const t = teil(id); return t ? portLage(t, p) : null; }, _andockAblegen: id => aendern(() => andockAblegen(teil(id))),
        exportieren: planExport,
        importieren: planImport,
        plan: () => kopie(plan),
        _schatten: () => schatten,
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
        _ablegen: (typ, x, y, o) => setzen({ typ, o }, x, y),
        _rueckgaengig: () => rueckgaengig(),
        aendern: (id, o) => { const t = teil(id); if (t) aendern(() => { Object.assign(t.o, o); kennNachArt(t); }); },
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
        _wege: () => { const W = alleWege(); return { wege: Object.fromEntries(W.wege), netz: Object.fromEntries(W.netz), punkte: abzweigPunkte() }; },
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
