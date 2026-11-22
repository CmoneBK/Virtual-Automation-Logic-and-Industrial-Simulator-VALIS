// schaltplan-blatt.js – der Auto-Schaltplan (IEC) auf Blättern nach blatt.js.
//
// Der Bildschirm ordnet die Stränge frei an. Für den Druck rechnet dieses Modul
// eine eigene Aufteilung: Der Plan wird nur in Lücken zwischen den Strängen auf
// Blätter geschnitten (A4 quer 8, A3 quer 10 Spalten), Steuer- und Laststromkreis
// stehen auf eigenen Blättern. Jeder Strompfad hat die Adresse „Blatt.Spalte“.
//   - Kontaktspiegel unter jeder Relais- und Zeitrelais-Spule: Schließer links,
//     Öffner rechts, je Kontakt seine Adresse (z. B. 3.2).
//   - Querverweis an jedem Kontakt zurück zur Spule (z. B. „↑ 1.4“).
//   - +24 V und 0 V laufen bis an den Blattrand und tragen dort den Verweis aufs
//     nächste bzw. vorige Blatt.
// Im Bild gibt es dasselbe auf Wunsch (Knopf „📐 Blatt.Spalte“), im Druck immer.
//
// Grundlage sind die Lagen, die drawCircuitPlan in window._circPlanInfo ablegt
// (Strompfade, Spulen, Kontakte, Schienen), und das gezeichnete SVG selbst.
(function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const SPALTE_SOLL = 110;          // ein Strang ist im Auto-Schaltplan 100 … 140 Einheiten breit
    const AUSBLENDEN = '.circ-dropzone,.circ-dropzone-label,.circ-del-rung-btn,.circ-pfadnr,.circ-titel,.circ-blatt-overlay,[id^="svg-pan-zoom"]';
    // Druckfarben wie im bisherigen PDF-Export: schwarz auf weiß
    const DRUCK_CSS = `text{font-family:'Segoe UI',Tahoma,sans-serif;fill:#222}
.circ-component{fill:#fff;stroke:#333;stroke-width:1.5px}.circ-wire{fill:none;stroke:#333;stroke-width:2px;stroke-linecap:round;stroke-linejoin:round}
.circ-static{fill:none;stroke:#333;stroke-width:1.5px}.circ-moving-contact{fill:none;stroke:#333;stroke-width:1.5px}
rect,line,path,polyline,circle{stroke-linecap:round;stroke-linejoin:round}.circ-qv{font-size:9px;fill:#000}`;

    const B = () => window.Blatt;
    function dok() { try { return (typeof _iecDoc === 'function') ? _iecDoc() : document; } catch (e) { return document; } }
    function teile(content) {
        const el = content.querySelector(':scope > [data-teil="elektro"]') || content;
        const last = el.querySelector(':scope > [data-teil="last"]');
        return { el, last };
    }
    // Plan im Programmbild zeichnen lassen (der Anschlussplan hat keine Strompfade)
    function mitProgrammbild(fn) {
        const anschl = !!window._iecAnschlussView;
        const neu = anschl || !window._circPlanInfo;
        if (neu) {
            if (typeof currentGraph === 'undefined' || !currentGraph) return fn();
            window._iecAnschlussView = false;
            try { drawCircuitPlan(currentGraph, globalInputs, globalOutputs, true); } catch (e) { console.warn('Schaltplan für Blätter', e); }
        }
        try { return fn(); } finally {
            if (anschl) { window._iecAnschlussView = true; try { drawCircuitPlan(currentGraph, globalInputs, globalOutputs, true); } catch (e) {} }
        }
    }
    // getBBox braucht ein sichtbares Fenster
    function sichtbar(svg, fn) {
        const w = svg.closest('[id$="-wrapper"]');
        const zu = w && w.style.display === 'none';
        if (zu) w.style.display = 'flex';
        try { return fn(); } finally { if (zu) w.style.display = 'none'; }
    }

    // Aufteilung des gezeichneten Plans. Ergebnis je Band (1 Steuer-, 2 Laststromkreis):
    // {nr, A (Blatt.aufteilen), erstes (Blattnummer)}; adresse(x, band) = „Blatt.Spalte“.
    function aufteilung(format, erstes) {
        const I = window._circPlanInfo, doc = dok();
        const svg = doc.getElementById('circuit-svg'), content = doc.getElementById('circuit-content');
        if (!I || !svg || !content || !B()) return null;
        const { el, last } = teile(content);
        const y0 = I.yTop - 45, hoehe = I.unten + 10 - y0;
        const baender = [{ nr: 1, wurzeln: [...el.children].filter(c => c !== last) }];
        if (last) baender.push({ nr: 2, wurzeln: [...last.children] });
        let n = erstes || 1;
        sichtbar(svg, () => baender.forEach(b => {
            const belegt = []; let x1 = 0;
            b.wurzeln.forEach(c => {
                if (c.matches && c.matches('.circ-schiene,' + AUSBLENDEN)) return;
                let bb = null; try { bb = c.getBBox(); } catch (e) {}
                if (!bb || (!bb.width && !bb.height)) return;
                if (bb.y + bb.height < I.yTop + 3 || bb.y > I.unten) return;     // Titel, Schienenbeschriftung
                belegt.push([bb.x, bb.x + bb.width]); x1 = Math.max(x1, bb.x + bb.width);
            });
            const pf = I.pfade.filter(p => p.band === b.nr);
            if (!belegt.length) pf.forEach(p => { belegt.push([p.x - 70, p.x + 40]); x1 = Math.max(x1, p.x + 40); });
            // rechts endet das Band am letzten Teil (die Schienen laufen im Bild noch weiter)
            x1 = x1 ? x1 + 20 : (b.nr === 2 && I.last ? I.last.breite : I.breite);
            b.A = B().aufteilen({ format, x0: 0, x1, hoehe, belegt, spalteSoll: SPALTE_SOLL });
            b.erstes = n; n += b.A.blaetter.length;
        }));
        const band = nr => baender.find(b => b.nr === nr) || baender[0];
        const adresse = (x, nr) => { const b = band(nr || 1), i = b.A.blattBei(+x); return (b.erstes + i) + '.' + b.A.spalte(+x, i); };
        return { I, baender, y0, hoehe, adresse, anzahl: n - (erstes || 1), svg, content };
    }

    // Spiegeltexte und Querverweise in einen (geklonten oder lebenden) Plan schreiben
    function verweiseSchreiben(content, auf, mitKlasse) {
        const { el, last } = teile(content);
        content.querySelectorAll('.circ-spiegel-nr').forEach(t => {
            const x = t.getAttribute('data-x'); if (x === '' || x == null) return;
            if (!t.hasAttribute('data-nr')) t.setAttribute('data-nr', t.textContent);
            t.textContent = auf.adresse(x, +t.getAttribute('data-band') || 1);
            // Adressen sind breiter als Pfadnummern: Schließer links, Öffner rechts der Mittellinie
            const m = +t.getAttribute('data-mitte');
            if (isFinite(m) && t.getAttribute('data-art')) {
                const no = t.getAttribute('data-art') === 'no';
                t.setAttribute('x', no ? m - 3 : m + 3); t.setAttribute('text-anchor', no ? 'end' : 'start');
            }
        });
        const doc = content.ownerDocument;
        Object.keys(auf.I.relais).forEach(id => {
            const r = auf.I.relais[id];
            if (!r.spule) return;
            const ziel = auf.adresse(r.spule.x, r.spule.band);
            r.kontakte.forEach(k => {
                const wurzel = (k.band === 2 && last) ? last : el;
                const t = doc.createElementNS(NS, 'text');
                t.setAttribute('x', k.x + 6); t.setAttribute('y', k.y + 28);
                t.setAttribute('font-size', '9'); t.setAttribute('class', 'circ-qv' + (mitKlasse ? ' circ-blatt-overlay' : ''));
                t.setAttribute('data-relais', id);
                t.setAttribute('fill', '#000'); t.setAttribute('font-family', 'Segoe UI, Tahoma, sans-serif');
                t.textContent = '↑ ' + ziel;
                const tt = doc.createElementNS(NS, 'title'); tt.textContent = `Spule ${r.name} steht auf Blatt ${ziel.replace('.', ', Spalte ')}`; t.appendChild(tt);
                wurzel.appendChild(t);
            });
        });
    }
    const text = (doc, x, y, s, a) => { const t = doc.createElementNS(NS, 'text'); Object.entries(Object.assign({ x, y, 'font-size': 10, fill: '#546e7a', 'font-family': 'Segoe UI, Tahoma, sans-serif' }, a || {})).forEach(([k, v]) => t.setAttribute(k, v)); t.textContent = s; return t; };

    // Ansicht im Bild: Blattgrenzen gestrichelt, Spaltennummern, Spiegel mit Adressen, Querverweise
    function ansicht() {
        const doc = dok(), content = doc.getElementById('circuit-content');
        if (!content || !window._circPlanInfo || !B()) return;
        content.querySelectorAll('.circ-blatt-overlay').forEach(n => n.remove());
        if (!window.configBlattAnsicht) {
            content.querySelectorAll('.circ-spiegel-nr[data-nr]').forEach(t => { t.textContent = t.getAttribute('data-nr'); });
            return;
        }
        const auf = aufteilung(B().format(), 1); if (!auf) return;
        const { el, last } = teile(content);
        auf.baender.forEach(b => {
            const wurzel = b.nr === 2 ? last : el;
            const g = doc.createElementNS(NS, 'g'); g.setAttribute('class', 'circ-blatt-overlay'); g.setAttribute('pointer-events', 'none');
            b.A.blaetter.forEach((bl, i) => {
                const nr = b.erstes + i;
                if (i) { const l = doc.createElementNS(NS, 'line'); Object.entries({ x1: bl.von, y1: auf.y0, x2: bl.von, y2: auf.I.unten, stroke: '#90a4ae', 'stroke-width': 1.2, 'stroke-dasharray': '8 5' }).forEach(([k, v]) => l.setAttribute(k, v)); g.appendChild(l); }
                g.appendChild(text(doc, bl.von + 4, auf.y0 - 2, 'Blatt ' + nr, { 'font-weight': 'bold', fill: '#37474f' }));
                for (let j = 0; j < b.A.spalten; j++) {
                    const x = bl.von + j * b.A.C;
                    if (x >= bl.bis - 2) break;
                    g.appendChild(text(doc, x + b.A.C / 2, auf.I.yTop - 34, nr + '.' + (j + 1), { 'text-anchor': 'middle', 'font-size': 9 }));
                }
            });
            wurzel.appendChild(g);
        });
        verweiseSchreiben(content, auf, true);
    }

    // Blattbeschreibungen für blatt.js: [{titel, art, inhalt}]
    //   o.format, o.erstes (Blattnummer im Plansatz), o.mitFluid (Fluid-Schaltplan der 2D-Anlage als eigenes Blatt)
    function blaetter(o) {
        o = o || {};
        if (!B()) return [];
        const f = o.format || B().format(), erstes = o.erstes || 1;
        return mitProgrammbild(() => {
            const doc = dok(), I0 = window._circPlanInfo;
            const fluidDa = !!(I0 && I0.fluidHoehe > 0) && o.mitFluid !== false;
            const auf = aufteilung(f, erstes + (fluidDa ? 1 : 0));
            if (!auf) return [];
            const { I, svg } = auf;
            window.SchaltplanBlatt.info = I;      // die Lagen, nach denen gedruckt wurde (Prüfung)
            if (!I.pfade.length) return [];
            // Lage jedes Betriebsmittels (Spule, sonst erster Kontakt) für die Zuordnungsliste im Plansatz
            const lage = {};
            sichtbar(svg, () => {
                const rang = { coil: 0, 'sensor-box': 1, contact: 2 };
                const best = {};
                auf.content.querySelectorAll('[data-iec-id][data-iec-role]').forEach(g => {
                    const id = g.getAttribute('data-iec-id'), r = rang[g.getAttribute('data-iec-role')];
                    if (r == null || (best[id] != null && best[id] <= r)) return;
                    let bb = null; try { bb = g.getBBox(); } catch (e) {}
                    if (!bb || !bb.width) return;
                    const band = g.closest('[data-teil="last"]') ? 2 : 1;
                    // Kontakte: die Mittellinie liegt 20 rechts vom Treffer-Rechteck (x − 20 … x + 20)
                    const rc = g.querySelector(':scope > rect');
                    const x = rc && g.getAttribute('data-iec-role') !== 'sensor-box' ? +rc.getAttribute('x') + (+rc.getAttribute('width')) / 2 : bb.x + bb.width / 2;
                    best[id] = r; lage[id] = auf.adresse(x, band);
                });
            });
            window.SchaltplanBlatt.lage = lage;
            const kl = svg.cloneNode(true);
            try { if (typeof _bakeContactTransforms === 'function') _bakeContactTransforms(svg, kl); } catch (e) {}
            const kc = kl.querySelector('#circuit-content') || kl;
            kc.removeAttribute('transform');
            kc.querySelectorAll(AUSBLENDEN).forEach(n => n.remove());
            kc.querySelectorAll('.iec-faded,.iec-focused').forEach(n => n.classList.remove('iec-faded', 'iec-focused'));
            verweiseSchreiben(kc, auf, false);
            const { el, last } = teile(kc);
            const ser = new XMLSerializer(), stil = `<style>${DRUCK_CSS}</style>`;
            const liste = [];
            if (fluidDa) {
                // Fluid-Schaltplan aus der 2D-Anlage (steht im Bild über dem Stromlaufplan)
                const fl = [...kc.children].filter(c => c !== el).map(c => ser.serializeToString(c)).join('');
                // Ausdehnung des Fluidteils im lebenden Bild (Kinder vor dem Elektro-Teil)
                const lebend = teile(auf.content).el;
                let r = [Infinity, Infinity, -Infinity, -Infinity];
                sichtbar(svg, () => [...auf.content.children].filter(c => c !== lebend).forEach(c => {
                    let bb = null; try { bb = c.getBBox(); } catch (e) {}
                    if (!bb || (!bb.width && !bb.height)) return;
                    // Gruppen mit translate (Fluidplan-Bild): getBBox liefert lokale Lage
                    const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(c.getAttribute('transform') || '');
                    const dx = m ? +m[1] : 0, dy = m ? +m[2] : 0;
                    r = [Math.min(r[0], bb.x + dx), Math.min(r[1], bb.y + dy), Math.max(r[2], bb.x + dx + bb.width), Math.max(r[3], bb.y + dy + bb.height)];
                }));
                if (!isFinite(r[0])) r = [0, 0, I.breite + 80, I.fluidHoehe];
                const vb = [r[0] - 20, r[1] - 20, r[2] - r[0] + 40, r[3] - r[1] + 40].map(v => Math.round(v * 10) / 10);
                liste.push({ titel: 'Fluid-Schaltplan', art: 'aus der 2D-Anlage (DIN ISO 1219-1)', mitte: true,
                    inhalt: `<svg xmlns="${NS}" viewBox="${vb.join(' ')}" width="${vb[2] * 2}" height="${vb[3] * 2}">${stil}${fl}</svg>` });
            }
            auf.baender.forEach(bd => {
                const w = bd.nr === 2 ? [...last.children] : [...el.children].filter(c => c !== last);
                const innen = stil + w.map(c => ser.serializeToString(c)).join('');
                const k = bd.A.blaetter.length, n = bd.A.spalten;
                const art0 = last ? (bd.nr === 1 ? 'Steuerstromkreis L+ / M (24 V DC)' : 'Laststromkreis L1 / N (230 V AC)') : 'Steuerstromkreis L+ / M';
                bd.A.blaetter.forEach((bl, i) => {
                    const nr = bd.erstes + i;
                    // Schienen über die Blattgrenze: Verweis aufs nächste bzw. vorige Blatt
                    let rand = '';
                    const vw = (x, y, s, anker) => `<text x="${x}" y="${y}" font-size="10" font-weight="bold" text-anchor="${anker}" fill="#000" font-family="Segoe UI, Tahoma, sans-serif" class="circ-blattverweis">${s}</text>`;
                    if (i < k - 1) rand += vw(bl.bis - 3, I.yTop - 5, `→ ${nr + 1}.1`, 'end') + vw(bl.bis - 3, I.yBot - 5, `→ ${nr + 1}.1`, 'end');
                    if (i > 0) rand += vw(bl.von + 3, I.yTop - 5, `${nr - 1}.${n} ←`, 'start') + vw(bl.von + 3, I.yBot - 5, `${nr - 1}.${n} ←`, 'start');
                    liste.push({ titel: 'Stromlaufplan', art: art0 + (k > 1 ? `, Teil ${i + 1} von ${k}` : ''), blatt: nr,
                        inhalt: B().svgAusschnitt(innen + rand, bl.von, auf.y0, bd.A.S, f, ' data-schaltplan-blatt="' + nr + '"', bl.bis - bl.von) });
                });
            });
            return liste;
        });
    }
    // Druck des Schaltplans allein: Dialog (Format, Schriftfeld), dann Druckfenster
    function drucken(direkt) {
        const los = () => {
            const f = B().format();
            const liste = blaetter({ format: f, erstes: 1 });
            if (!liste.length) { try { _showToast && _showToast('Der Schaltplan hat noch keine Strompfade.', '#e65100'); } catch (e) {} return null; }
            const sf = B().schriftfeld();
            const html = B().dokument({ titel: 'Stromlaufplan', format: f, blaetter: B().rendern(liste, { format: f, sf }) });
            if (!B().drucken(html, window)) { try { _showToast && _showToast('Das Druckfenster wurde blockiert. Bitte Pop-ups für VALIS erlauben.', '#e65100'); } catch (e) {} }
            return html;
        };
        if (direkt) return los();
        B().dialog({ doc: document, ueberschrift: '🖨 Schaltplan auf Blättern – Schriftfeld', los });
        return null;
    }

    window.SchaltplanBlatt = { aufteilung, blaetter, ansicht, drucken };
    window.toggleBlattAnsicht = function (an) {
        window.configBlattAnsicht = (typeof an === 'boolean') ? an : !window.configBlattAnsicht;
        try { localStorage.setItem('valisBlattAnsicht', window.configBlattAnsicht ? '1' : '0'); } catch (e) {}
        try { window._syncSchematicNumberingButtons && window._syncSchematicNumberingButtons(); } catch (e) {}
        try { ansicht(); } catch (e) { console.warn('Blatt.Spalte', e); }
    };
    try { window.configBlattAnsicht = localStorage.getItem('valisBlattAnsicht') === '1'; } catch (e) { window.configBlattAnsicht = false; }
})();
