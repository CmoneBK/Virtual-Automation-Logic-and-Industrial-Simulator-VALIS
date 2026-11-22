// plansatz.js – „Plansatz drucken“ im Datei-Fenster: alle Pläne der Anlage in einem PDF.
//
// Deckblatt, Inhaltsverzeichnis, Stromlaufplan (Auto-Schaltplan, mehrseitig mit
// Kontaktspiegeln und Querverweisen), Elektroplan (Schaltplan-Editor), Fluidplan,
// Logikplan, Schrittkette, Zuordnungs- und Betriebsmittelliste, Stückliste des
// Fluidplans. Alle Blätter haben dasselbe Format, dasselbe Schriftfeld und eine
// durchgehende Blattnummer; Querverweise zeigen auf die Blattnummer im Plansatz.
// Man wählt, welche Teile hinein sollen. Der bisherige PDF-Bericht bleibt daneben
// für schnelle Ausdrucke.
(function () {
    'use strict';
    const B = () => window.Blatt;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const FBS_CSS = `.fbs-block{fill:#fff;stroke-width:2.5px}.fbs-text{font-family:'Segoe UI',Tahoma,sans-serif;font-size:13px;fill:#000;font-weight:bold}
.fbs-pin-text{font-family:'Segoe UI',Tahoma,sans-serif;font-size:10px;fill:#555}.fbs-line-halo{display:none}
.fbs-line{fill:none;stroke-width:2.5px;stroke-linejoin:round;stroke-linecap:round}.fbs-io-box{fill:#f0f0f0;stroke-width:2px}.fbs-bubble{fill:#fff;stroke-width:2px}
text{font-family:'Segoe UI',Tahoma,sans-serif}`;
    // Schrittkette schwarz auf weiß wie auf dem Papier (am Bildschirm hat sie Farben für den dunklen Hintergrund)
    const SK_CSS = `text{font-family:'Segoe UI',Tahoma,sans-serif;fill:#000}
.sk-step rect{fill:#fff;stroke:#000;stroke-width:1.5}.sk-step.init .sk-inner-rect{fill:none;stroke:#000;stroke-width:1.5}
.sk-step .sk-step-num{font-weight:bold;font-size:13px}.sk-step .sk-step-label{font-size:11px;fill:#333}
.sk-trans-line{stroke:#000;stroke-width:1.5;fill:none}.sk-trans-bar{stroke:#000;stroke-width:3}.sk-jump{stroke:#000;stroke-width:1.5;fill:none}.sk-jump-arrow{fill:#000;stroke:none}
.sk-trans-cond{fill:#000;font-family:Consolas,'Courier New',monospace;font-size:11px}
.sk-action-box rect{fill:#fff;stroke:#000;stroke-width:1}.sk-action-box text{fill:#000;font-family:Consolas,monospace;font-size:10px}
.sk-qual-badge{fill:#000;font-weight:bold;font-size:11px;font-family:Consolas,'Courier New',monospace}
.sk-step-il-badge,.sk-step-sv-badge{font-family:Consolas,monospace;font-size:10px;fill:#000;font-weight:bold}`;
    // Bedienknöpfe und „hinzufügen“-Stellen gehören nicht aufs Blatt
    const NUR_BILDSCHIRM = '.sk-tool-btn, .sk-tool-label, .sk-il-add, .sk-sv-add, [data-tool]';
    // Teile in der Reihenfolge des Plansatzes
    const TEILE = [
        ['deckblatt', 'Deckblatt'], ['inhalt', 'Inhaltsverzeichnis'], ['stromlauf', 'Stromlaufplan (Auto-Schaltplan)'],
        ['elektro', 'Elektroplan (Schaltplan-Editor)'], ['fluid', 'Fluidplan'], ['logik', 'Logikplan (FUP)'],
        ['schritt', 'Schrittkette'], ['zuordnung', 'Zuordnungs- und Betriebsmittelliste'], ['stueckliste', 'Betriebsmittel- und Stückliste des Fluidplans']
    ];

    // Was hat die Anlage? Danach richten sich die Vorschläge im Dialog.
    function vorhanden() {
        const fp = window.Fluidplan, cs = window._cedState;
        let fluid = false; try { fluid = !!(fp && fp.plan && fp.plan().teile.length); } catch (e) {}
        let schritt = false; try { const s = document.getElementById('sk-svg'); schritt = !!(s && s.querySelector('rect, text')); } catch (e) {}
        let zuord = false; try { const d = window._spsZuordnungData(); zuord = !!(d.inputs.length || d.outputs.length); } catch (e) {}
        let logik = false; try { logik = !!(typeof currentGraph !== 'undefined' && currentGraph && currentGraph.nodes && currentGraph.nodes.size); } catch (e) {}
        return {
            deckblatt: true, inhalt: true, stromlauf: logik, elektro: !!(cs && cs.components && cs.components.length),
            fluid, logik, schritt, zuordnung: zuord, stueckliste: fluid
        };
    }
    function vorschlag(v) {
        // Der Elektroplan entsteht meist „Aus Code“ und doppelt dann den Stromlaufplan
        return Object.assign({}, v, { elektro: v.elektro && !v.stromlauf });
    }

    // Ein SVG des Bildschirms als ganzes Bild (Logikplan, Schrittkette)
    function svgBild(svg, css) {
        if (!svg) return '';
        const w = svg.closest('[id$="-wrapper"]'), zu = w && w.style.display === 'none';
        if (zu) w.style.display = 'flex';
        try {
            const ziel = svg.querySelector('.svg-pan-zoom_viewport') || svg;
            const kl = svg.cloneNode(true);
            kl.querySelectorAll('[id^="svg-pan-zoom"], ' + NUR_BILDSCHIRM).forEach(n => n.remove());
            const kv = kl.querySelector('.svg-pan-zoom_viewport'); if (kv) { kv.removeAttribute('transform'); kv.style.transform = ''; }
            let bb = null; try { bb = ziel.getBBox(); } catch (e) {}
            if (!bb || bb.width < 5 || bb.height < 5) {
                // Verdecktes Fenster (z. B. Schrittkette zu): die Kopie unsichtbar einhängen und messen
                const box = document.createElement('div');
                box.style.cssText = 'position:absolute;left:-99999px;top:0;width:4000px;height:4000px;visibility:hidden';
                const m = kl.cloneNode(true); m.removeAttribute('viewBox'); m.setAttribute('width', 4000); m.setAttribute('height', 4000);
                box.appendChild(m); document.body.appendChild(box);
                try { const z = m.querySelector('.svg-pan-zoom_viewport') || m; bb = z.getBBox(); } catch (e) { bb = null; }
                box.remove();
            }
            if (!bb || bb.width < 5 || bb.height < 5) return '';
            const p = 20, vb = [bb.x - p, bb.y - p, bb.width + 2 * p, bb.height + 2 * p].map(v => Math.round(v * 10) / 10);
            kl.setAttribute('viewBox', vb.join(' ')); kl.setAttribute('width', vb[2]); kl.setAttribute('height', vb[3]);
            kl.removeAttribute('style'); kl.removeAttribute('id');
            kl.querySelectorAll('.active, .firing').forEach(n => n.classList.remove('active', 'firing'));
            kl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            if (css) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'style'); s.textContent = css; kl.insertBefore(s, kl.firstChild); }
            return new XMLSerializer().serializeToString(kl);
        } finally { if (zu) w.style.display = 'none'; }
    }
    function zuordnungHtml() {
        let d; try { d = window._spsZuordnungData(); } catch (e) { return ''; }
        const lage = (window.SchaltplanBlatt && window.SchaltplanBlatt.lage) || {};
        const zeilen = (titel, rows) => !rows.length ? '' : `<h3>${esc(titel)}</h3><table class="vb-tab"><tr><th>Kennzeichen</th><th>Variable</th><th>Adresse</th><th>Art</th><th>Kontakt</th><th>Lage (Blatt.Spalte)</th><th>Kommentar</th></tr>`
            + rows.map(r => `<tr><td>${esc(r.kz || '–')}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.addr)}</td><td>${esc(r.type)}</td><td>${esc(r.contact)}</td><td>${esc(lage[r.name] || '–')}</td><td>${esc(r.comment)}</td></tr>`).join('') + '</table>';
        return zeilen('Eingänge', d.inputs) + zeilen('Ausgänge', d.outputs) + zeilen('Merker und Hilfsrelais', d.merker);
    }

    // Blattbeschreibungen des ganzen Plansatzes. auswahl = {deckblatt: true, …}
    function blaetter(auswahl, o) {
        o = o || {};
        const f = o.format || B().format(), sf = o.sf || B().schriftfeld();
        const a = Object.assign({}, auswahl || vorschlag(vorhanden()));
        const liste = [];
        let nr = 1 + (a.deckblatt ? 1 : 0) + (a.inhalt ? 1 : 0);
        const dazu = (teil, bl) => { bl.forEach(b => { b.teil = teil; liste.push(b); }); nr += bl.length; };
        if (a.stromlauf && window.SchaltplanBlatt) dazu('stromlauf', window.SchaltplanBlatt.blaetter({ format: f, erstes: nr }));
        if (a.elektro && window.ElektroplanBlatt) dazu('elektro', window.ElektroplanBlatt.blaetter({ format: f, erstes: nr }));
        if (a.fluid && window.Fluidplan && window.Fluidplan.blaetter) dazu('fluid', window.Fluidplan.blaetter({ format: f, erstes: nr, mitListen: false }));
        if (a.logik) { let s = ''; try { s = svgBild(typeof customSvg !== 'undefined' ? customSvg : document.getElementById('custom-svg'), FBS_CSS); } catch (e) {} if (s) dazu('logik', [{ titel: 'Logikplan', art: 'Funktionsplan (FUP)', inhalt: s, mitte: true }]); }
        if (a.schritt) { const s = svgBild(document.getElementById('sk-svg'), SK_CSS); if (s) dazu('schritt', [{ titel: 'Schrittkette', art: 'GRAFCET / Funktionsplan', inhalt: s, mitte: true }]); }
        if (a.zuordnung) { const h = zuordnungHtml(); if (h) dazu('zuordnung', [{ titel: 'Zuordnungsliste', art: 'Ein- und Ausgänge, Betriebsmittel, Lage im Stromlaufplan', inhalt: '<h2 class="vb-h">Zuordnungs- und Betriebsmittelliste</h2>' + h, fluss: true, leiste: false }]); }
        if (a.stueckliste && window.Fluidplan && window.Fluidplan.blaetter) {
            const l = window.Fluidplan.blaetter({ format: f, erstes: nr, mitListen: true }).filter(b => b.fluss);
            dazu('stueckliste', l);
        }
        // Inhaltsverzeichnis und Deckblatt kennen jetzt alle Blätter
        const vorne = [];
        const gesamt = liste.length + (a.deckblatt ? 1 : 0) + (a.inhalt ? 1 : 0);
        const titelSatz = sf.titel || sf.anlage || 'Plansatz';
        if (a.deckblatt) {
            const heute = new Date().toLocaleDateString('de-DE');
            const z = [['Anlage / Projekt', sf.anlage], ['Zeichnungsnummer', sf.nummer], ['Erstellt von', sf.ersteller], ['Geprüft von', sf.geprueft], ['Klasse / Abteilung', sf.klasse], ['Schule / Firma', sf.schule], ['Änderung', sf.aenderung], ['Datum', heute], ['Blätter', gesamt]]
                .filter(r => r[1] !== '' && r[1] != null);
            vorne.push({ titel: 'Deckblatt', leiste: false, inhalt: `<div class="vb-deck"><h1>${esc(titelSatz)}</h1><div class="anl">Plansatz${sf.anlage && sf.anlage !== titelSatz ? ' · ' + esc(sf.anlage) : ''}</div><table>${z.map(r => `<tr><td>${esc(r[0])}</td><td><b>${esc(r[1])}</b></td></tr>`).join('')}</table></div>` });
        }
        if (a.inhalt) {
            const erste = (a.deckblatt ? 1 : 0) + (a.inhalt ? 1 : 0);
            const zeilen = [];
            if (a.deckblatt) zeilen.push([1, 'Deckblatt', '']);
            zeilen.push([erste, 'Inhaltsverzeichnis', '']);
            liste.forEach((b, i) => zeilen.push([erste + 1 + i, b.titel || '', b.art || '']));
            vorne.push({ titel: 'Inhaltsverzeichnis', leiste: false, fluss: true,
                inhalt: `<h2 class="vb-h">Inhaltsverzeichnis</h2><table class="vb-tab"><tr><th style="width:18mm">Blatt</th><th>Inhalt</th><th>Teil</th></tr>${zeilen.map(z => `<tr><td>${z[0]}</td><td>${esc(z[1])}</td><td>${esc(z[2])}</td></tr>`).join('')}</table>` });
        }
        return vorne.concat(liste);
    }
    function dokument(auswahl, o) {
        o = o || {};
        const f = o.format || B().format(), sf = o.sf || B().schriftfeld();
        const liste = blaetter(auswahl, { format: f, sf });
        const sfBlatt = Object.assign({}, sf); delete sfBlatt.titel;
        return { liste, html: B().dokument({ titel: sf.titel || sf.anlage || 'Plansatz', format: f, blaetter: B().rendern(liste, { format: f, sf: Object.assign({ titel: 'Plansatz' }, sfBlatt) }) }) };
    }
    // Dialog: Format, Schriftfeld und die Teile des Plansatzes
    function oeffnen() {
        if (!B()) return;
        const v = vorhanden(), vs = vorschlag(v);
        const extra = `<div style="margin:8px 0 2px;font-weight:bold">Teile des Plansatzes</div>`
            + TEILE.map(([k, n]) => `<label class="fp-sf-zeile" style="display:flex;gap:6px;align-items:center;margin:2px 0${v[k] ? '' : ';color:#9e9e9e'}"><input type="checkbox" data-plansatz="${k}"${vs[k] ? ' checked' : ''}${v[k] ? '' : ' disabled'}> ${esc(n)}${v[k] ? '' : ' (leer)'}</label>`).join('');
        let box = null;
        box = B().dialog({ doc: document, ueberschrift: '🗂 Plansatz drucken – Format und Schriftfeld', knopf: '🖨 Plansatz drucken', titelGemeinsam: true, extra, los: () => {
            const auswahl = {}; box.querySelectorAll('[data-plansatz]').forEach(i => { auswahl[i.getAttribute('data-plansatz')] = i.checked && !i.disabled; });
            const d = dokument(auswahl);
            if (!d.liste.length) { try { _showToast && _showToast('Für den Plansatz ist nichts ausgewählt.', '#e65100'); } catch (e) {} return; }
            if (!B().drucken(d.html, window)) { try { _showToast && _showToast('Das Druckfenster wurde blockiert. Bitte Pop-ups für VALIS erlauben.', '#e65100'); } catch (e) {} }
        } });
        return box;
    }
    window.Plansatz = { TEILE, vorhanden, blaetter, dokument, oeffnen };
})();
