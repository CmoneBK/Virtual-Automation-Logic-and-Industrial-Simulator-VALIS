// elektroplan-blatt.js – der Elektroplan-Editor (Schaltplan-Editor, CED) auf Blättern nach blatt.js.
//
//   - „📐 Blatt“ in der Werkzeugleiste blendet beim Zeichnen die Blattgrenzen
//     (gestrichelt) und die Spaltennummern ein, dazu an jedem Hilfskontakt den
//     Verweis zur Spule und unter jeder Spule ihre Kontakte (Blatt.Spalte).
//   - „🖨 Blätter“ druckt den Plan über so viele Blätter, wie er braucht,
//     geschnitten nur in Lücken zwischen den Strängen, mit Kontaktspiegel unter
//     jeder Relais-, Zeit- und Zählrelais-Spule und Querverweis an jedem Kontakt.
//
// Grundlage: window._cedState (Bauteile, Leitungen), window._cedTypen (Maße der
// Bauteile) und window._cedSchienen (Lage von +24 V und 0 V), alle aus index.html.
(function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const SPALTE_SOLL = 120;
    const SPULEN = new Set(['relais', 'timer_ton', 'timer_tof', 'timer_tp', 'counter_ctu']);
    const DRUCK_CSS = `.ced-comp-bg{display:none}
.ced-wire{stroke:#000;stroke-width:2;fill:none}text{font-family:'Segoe UI',Tahoma,sans-serif}
.ced-comp-label{font:bold 11px 'Segoe UI',sans-serif;fill:#000}.ced-comp-type{font:9px 'Segoe UI',sans-serif;fill:#666}
.ced-qv{font-size:9px;fill:#000}.ced-spiegel text{fill:#000}`;
    const B = () => window.Blatt;
    const st = () => window._cedState;
    const typ = c => (window._cedTypen || {})[c.type] || null;
    const doc = () => { try { return window._cedDoc ? window._cedDoc() : document; } catch (e) { return document; } };
    const schienen = () => window._cedSchienen || { plus: 50, minus: 700, xMin: 40 };
    const name = c => String(c.normLabel || c.varName || '').split(' (')[0] || c.varName || '?';

    // Spulen mit ihren Hilfskontakten (gleiche Variable)
    function relais() {
        const S = st(); if (!S) return [];
        const comps = S.components;
        return comps.filter(c => SPULEN.has(c.type) && c.varName).map(sp => {
            const t = typ(sp);
            return {
                id: sp.id, name: name(sp), varName: sp.varName,
                x: sp.x + t.cx, y: sp.y, h: t.h,
                kontakte: comps.filter(k => k !== sp && k.varName === sp.varName && (typ(k) || {}).kind === 'aux').map(k => {
                    const tk = typ(k);
                    return { id: k.id, x: k.x + tk.cx, y: k.y, h: tk.h, nc: !!tk.nc };
                })
            };
        });
    }
    function sichtbar(svg, fn) {
        const w = svg.closest('[id$="-wrapper"]');
        const zu = w && w.style.display === 'none';
        if (zu) w.style.display = 'flex';
        try { return fn(); } finally { if (zu) w.style.display = 'none'; }
    }
    // Aufteilung des Plans auf Blätter: {A, y0, hoehe, adresse(x)}
    function aufteilung(format, erstes) {
        const S = st(), svg = doc().getElementById('ced-svg');
        if (!S || !svg || !B() || !S.components.length) return null;
        const R = schienen(), rel = relais();
        const maxK = Math.max(0, ...rel.map(r => r.kontakte.length));
        const unten = Math.max(R.minus, ...S.components.map(c => c.y + ((typ(c) || {}).h || 0))) + (rel.length ? 50 + Math.ceil(maxK / 2) * 13 : 20);
        const y0 = R.plus - 45, hoehe = unten - y0;
        const belegt = []; let x1 = 0;
        sichtbar(svg, () => {
            // Bauteile mit ihrem Körper (plus etwas Platz für die Beschriftung rechts daneben); lange
            // Beschriftungen würden sonst ganze Stranggruppen zu einem Block verschmelzen.
            S.components.forEach(c => { const t = typ(c); if (!t) return; belegt.push([c.x - 5, c.x + t.w + 45]); x1 = Math.max(x1, c.x + t.w + 120); });
            svg.querySelectorAll('#ced-wires > .ced-wire').forEach(g => {
                let bb = null; try { bb = g.getBBox(); } catch (e) {}
                if (!bb || (!bb.width && !bb.height)) return;
                const tf = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(g.getAttribute('transform') || '');
                const dx = tf ? +tf[1] : 0;
                belegt.push([bb.x + dx, bb.x + dx + bb.width]); x1 = Math.max(x1, bb.x + dx + bb.width);
            });
        });
        if (!belegt.length) S.components.forEach(c => { const t = typ(c) || { w: 60 }; belegt.push([c.x - 10, c.x + t.w + 90]); x1 = Math.max(x1, c.x + t.w + 90); });
        const A = B().aufteilen({ format, x0: 0, x1: x1 + 30, hoehe, belegt, spalteSoll: SPALTE_SOLL });
        const e = erstes || 1;
        return { A, y0, hoehe, unten, erstes: e, rel, adresse: x => { const i = A.blattBei(x); return (e + i) + '.' + A.spalte(x, i); } };
    }
    // Kontaktspiegel und Querverweise als SVG-Markup
    function verweise(auf, klasse) {
        const R = schienen();
        let out = '';
        const t = (x, y, s, a) => `<text x="${x}" y="${y}" font-size="${(a && a.size) || 9}" text-anchor="${(a && a.anker) || 'start'}" fill="#000" font-family="Segoe UI, Tahoma, sans-serif"${a && a.bold ? ' font-weight="bold"' : ''}${a && a.k ? ` class="${a.k}"` : ''}${a && a.spule ? ` data-spule="${B().esc(a.spule)}"` : ''}>${B().esc(s)}</text>`;
        auf.rel.forEach(r => {
            const ziel = auf.adresse(r.x);
            r.kontakte.forEach(k => { out += t(k.x + 6, k.y + k.h + 10, '↑ ' + ziel, { k: 'ced-qv' + klasse, spule: r.varName }); });
            // Spiegel unter der 0-V-Schiene: Schließer links, Öffner rechts
            const y = R.minus + 22, no = r.kontakte.filter(k => !k.nc), nc = r.kontakte.filter(k => k.nc);
            const zeilen = Math.max(1, no.length, nc.length);
            let g = t(r.x, y, r.name, { anker: 'middle', bold: true, size: 10 });
            g += `<line x1="${r.x - 18}" y1="${y + 4}" x2="${r.x + 18}" y2="${y + 4}" stroke="#000" stroke-width="1"/><line x1="${r.x}" y1="${y + 4}" x2="${r.x}" y2="${y + 10 + zeilen * 12}" stroke="#000" stroke-width="1"/>`;
            g += t(r.x - 9, y + 13, '⊣', { anker: 'middle', size: 8 }) + t(r.x + 9, y + 13, '⊢', { anker: 'middle', size: 8 });
            no.forEach((k, i) => { g += t(r.x - 3, y + 26 + i * 12, auf.adresse(k.x), { anker: 'end', k: 'ced-spiegel-nr' }); });
            nc.forEach((k, i) => { g += t(r.x + 3, y + 26 + i * 12, auf.adresse(k.x), { anker: 'start', k: 'ced-spiegel-nr' }); });
            out += `<g class="ced-spiegel${klasse}" data-spule="${B().esc(r.varName)}">${g}</g>`;
        });
        return out;
    }
    // Hilfe beim Zeichnen: Blattgrenzen, Spaltennummern, Verweise
    function rahmen() {
        const d = doc(), svg = d.getElementById('ced-svg'); if (!svg) return;
        let g = d.getElementById('ced-blatt');
        if (!window.configCedBlatt || !B() || !st() || !st().components.length) { if (g) g.remove(); return; }
        const auf = aufteilung(B().format(), 1); if (!auf) return;
        if (!g) { g = d.createElementNS(NS, 'g'); g.setAttribute('id', 'ced-blatt'); g.setAttribute('pointer-events', 'none'); svg.insertBefore(g, svg.firstChild); }
        const R = schienen();
        let h = '';
        auf.A.blaetter.forEach((bl, i) => {
            if (i) h += `<line x1="${bl.von}" y1="${auf.y0}" x2="${bl.von}" y2="${auf.unten}" stroke="#90a4ae" stroke-width="1.2" stroke-dasharray="8 5"/>`;
            h += `<text x="${bl.von + 4}" y="${auf.y0 + 4}" font-size="10" font-weight="bold" fill="#37474f">Blatt ${i + 1}</text>`;
            for (let j = 0; j < auf.A.spalten; j++) {
                const x = bl.von + j * auf.A.C; if (x >= bl.bis - 2) break;
                h += `<text x="${x + auf.A.C / 2}" y="${R.plus - 14}" font-size="9" text-anchor="middle" fill="#78909c">${i + 1}.${j + 1}</text>`;
                h += `<line x1="${x}" y1="${R.plus - 24}" x2="${x}" y2="${R.plus - 8}" stroke="#cfd8dc" stroke-width="1"/>`;
            }
        });
        g.innerHTML = h + verweise(auf, ' ced-blatt-hilfe');
    }
    // Blattbeschreibungen für blatt.js
    function blaetter(o) {
        o = o || {};
        const f = o.format || B().format();
        const auf = aufteilung(f, o.erstes || 1); if (!auf) return [];
        const svg = doc().getElementById('ced-svg');
        const kl = svg.cloneNode(true);
        kl.querySelectorAll('#ced-overlay, #ced-blatt, .ced-rail-hit, .ced-pin, .ced-wire-hit').forEach(n => n.remove());
        kl.querySelectorAll('.ced-selected').forEach(n => n.classList.remove('ced-selected'));
        kl.querySelectorAll('.ced-comp-bg').forEach(n => n.remove());
        // Hintergrund der Beschriftung (fafafa) auf Weiß
        kl.querySelectorAll('rect[fill="#fafafa"]').forEach(n => n.setAttribute('fill', '#fff'));
        const ser = new XMLSerializer();
        const innen = `<style>${DRUCK_CSS}</style>` + [...kl.children].map(c => ser.serializeToString(c)).join('') + verweise(auf, '');
        const R = schienen(), k = auf.A.blaetter.length, n = auf.A.spalten;
        window.ElektroplanBlatt.info = auf;
        return auf.A.blaetter.map((bl, i) => {
            const nr = auf.erstes + i;
            const vw = (x, y, s, a) => `<text x="${x}" y="${y}" font-size="10" font-weight="bold" text-anchor="${a}" fill="#000" class="ced-blattverweis">${s}</text>`;
            let rand = '';
            if (i < k - 1) rand += vw(bl.bis - 3, R.plus - 5, `→ ${nr + 1}.1`, 'end') + vw(bl.bis - 3, R.minus - 5, `→ ${nr + 1}.1`, 'end');
            if (i > 0) rand += vw(bl.von + 3, R.plus - 5, `${nr - 1}.${n} ←`, 'start') + vw(bl.von + 3, R.minus - 5, `${nr - 1}.${n} ←`, 'start');
            return { titel: 'Stromlaufplan', art: 'Elektroplan (Schaltplan-Editor)' + (k > 1 ? `, Teil ${i + 1} von ${k}` : ''),
                inhalt: B().svgAusschnitt(innen + rand, bl.von, auf.y0, auf.A.S, f, ' data-elektroplan-blatt="' + nr + '"', bl.bis - bl.von) };
        });
    }
    function drucken(direkt) {
        const los = () => {
            const f = B().format(), liste = blaetter({ format: f, erstes: 1 });
            if (!liste.length) { try { _showToast && _showToast('Der Elektroplan ist leer.', '#e65100'); } catch (e) {} return null; }
            const html = B().dokument({ titel: 'Elektroplan', format: f, blaetter: B().rendern(liste, { format: f, sf: B().schriftfeld() }) });
            if (!B().drucken(html, window)) { try { _showToast && _showToast('Das Druckfenster wurde blockiert. Bitte Pop-ups für VALIS erlauben.', '#e65100'); } catch (e) {} }
            return html;
        };
        if (direkt) return los();
        B().dialog({ doc: document, ueberschrift: '🖨 Elektroplan auf Blättern – Schriftfeld', los });
        return null;
    }
    function knopf() {
        const b = doc().getElementById('ced-btn-blatt');
        if (b) { b.style.background = window.configCedBlatt ? '#911eb4' : '#555'; b.setAttribute('aria-pressed', window.configCedBlatt ? 'true' : 'false'); }
    }
    window.ElektroplanBlatt = { relais, aufteilung, blaetter, rahmen, drucken };
    window.cedToggleBlatt = function (an) {
        window.configCedBlatt = (typeof an === 'boolean') ? an : !window.configCedBlatt;
        try { localStorage.setItem('valisCedBlatt', window.configCedBlatt ? '1' : '0'); } catch (e) {}
        knopf();
        try { rahmen(); } catch (e) { console.warn('Elektroplan-Blatt', e); }
    };
    try { window.configCedBlatt = localStorage.getItem('valisCedBlatt') === '1'; } catch (e) { window.configCedBlatt = false; }
    setTimeout(knopf, 0);
})();
