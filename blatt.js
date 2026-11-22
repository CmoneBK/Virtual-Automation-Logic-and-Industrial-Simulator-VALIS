// blatt.js – gemeinsames Zeichenblatt für alle Pläne in VALIS
// (Fluidplan, Auto-Schaltplan, Elektroplan, Plansatz).
//
// Ein Blatt hat ein Format (A4 quer als Voreinstellung, A3 quer als Wahl),
// einen Rahmen mit Heftrand, oben eine Spaltenleiste 1 … n (A4 quer 8, A3 quer
// 10 Spalten), unten rechts das Schriftfeld (angelehnt an DIN EN ISO 7200) und
// eine Blattnummer. Jeder Strompfad hat damit die Adresse „Blatt.Spalte“, z. B.
// 2.4. Das Schriftfeld füllt man einmal aus; es gilt für den ganzen Plansatz und
// reist mit dem Anlagenzustand (.valisave, #state, Undo) als „blatt“.
//
// Gedruckt wird über das Druckfenster des Browsers („Als PDF speichern“), ohne
// fremde Dienste. Ein Plansatz hat ein Format für alle Blätter, weil die
// Druckfenster bei gemischten Formaten unterschiedlich reagieren.
(function (wurzel) {
    'use strict';
    // Maße in mm. Rahmen nach DIN EN ISO 5457: 20 mm Heftrand links, sonst 10 mm.
    const FORMATE = {
        A4: { name: 'A4 quer', b: 297, h: 210, spalten: 8 },
        A3: { name: 'A3 quer', b: 420, h: 297, spalten: 10 }
    };
    const RAND = { l: 20, o: 10, r: 10, u: 10 };
    const LEISTE = 5;          // Spaltenleiste oben
    const SF_ZEILE = 6.5;      // Höhe einer Schriftfeld-Zeile
    const SF_ZEILEN = 4;
    const SF_B = 180;          // Breite des Schriftfelds
    // Felder des Schriftfelds: die heutigen des Fluidplans plus „Änderung“ und „Anlage/Projekt“
    const SF_FELDER = [
        ['titel', 'Benennung (Titel)'], ['anlage', 'Anlage / Projekt'], ['nummer', 'Zeichnungsnummer'],
        ['ersteller', 'Erstellt von'], ['geprueft', 'Geprüft von'], ['klasse', 'Klasse / Abteilung'],
        ['schule', 'Schule / Firma'], ['aenderung', 'Änderung']
    ];
    const SF_LEER = { titel: '', anlage: '', nummer: '', ersteller: '', geprueft: '', klasse: '', schule: '', aenderung: '' };
    // Name, Klasse und Schule merkt sich der Browser für den nächsten Plan (wie bisher im Fluidplan)
    const MERKEN = ['ersteller', 'klasse', 'schule'];
    const MERK_SCHLUESSEL = 'valisSchriftfeld';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const r2 = x => Math.round(x * 100) / 100;

    let zustand = { format: 'A4', schriftfeld: {} };

    function speicher() { try { return wurzel.localStorage || null; } catch (e) { return null; } }
    function gemerkt() {
        const s = speicher(); if (!s) return {};
        try { const o = JSON.parse(s.getItem(MERK_SCHLUESSEL) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
    }
    function geaendert() {
        // Anlagenzustand sichern (Undo, Autosave), wenn VALIS geladen ist
        try { if (typeof wurzel.saveFactoryState === 'function') wurzel.saveFactoryState(); } catch (e) {}
    }

    function format() { return FORMATE[zustand.format] ? zustand.format : 'A4'; }
    function formatSetzen(f) {
        if (!FORMATE[f] || f === zustand.format) return format();
        zustand.format = f; geaendert(); return f;
    }
    // Schriftfeld des Plansatzes: Voreinstellung ← gemerkt ← Anlagenzustand ← eigene Angaben des Plans
    function schriftfeld(extra) {
        const g = gemerkt(), m = {};
        MERKEN.forEach(k => { if (g[k]) m[k] = String(g[k]); });
        const sf = Object.assign({}, SF_LEER, m, zustand.schriftfeld || {});
        if (extra) Object.keys(extra).forEach(k => { if (extra[k] != null && extra[k] !== '') sf[k] = String(extra[k]); });
        return sf;
    }
    // Gemeinsame Angaben des Plansatzes speichern; der Titel gehört dem einzelnen Plan.
    function schriftfeldSetzen(neu, mitTitel) {
        if (!neu) return schriftfeld();
        const alt = JSON.stringify(zustand.schriftfeld || {});
        const sf = Object.assign({}, zustand.schriftfeld || {});
        SF_FELDER.forEach(([k]) => { if (k === 'titel' && !mitTitel) return; if (neu[k] != null) sf[k] = String(neu[k]).trim(); });
        zustand.schriftfeld = sf;
        const s = speicher();
        if (s) { try { const g = gemerkt(); MERKEN.forEach(k => { if (neu[k] != null) g[k] = String(neu[k]).trim(); }); s.setItem(MERK_SCHLUESSEL, JSON.stringify(g)); } catch (e) {} }
        if (JSON.stringify(sf) !== alt) geaendert();
        return schriftfeld();
    }
    function exportieren() {
        const sf = {}; Object.keys(zustand.schriftfeld || {}).forEach(k => { if (zustand.schriftfeld[k]) sf[k] = zustand.schriftfeld[k]; });
        if (format() === 'A4' && !Object.keys(sf).length) return null;
        return { v: 1, format: format(), schriftfeld: sf };
    }
    function importieren(o) {
        zustand = { format: 'A4', schriftfeld: {} };
        if (o && typeof o === 'object') {
            if (FORMATE[o.format]) zustand.format = o.format;
            if (o.schriftfeld && typeof o.schriftfeld === 'object') SF_FELDER.forEach(([k]) => { if (o.schriftfeld[k]) zustand.schriftfeld[k] = String(o.schriftfeld[k]); });
        }
    }

    // Maße eines Blatts in mm
    function masse(f) {
        const F = FORMATE[f || format()] || FORMATE.A4;
        const rahmen = { x: RAND.l, y: RAND.o, b: F.b - RAND.l - RAND.r, h: F.h - RAND.o - RAND.u };
        const sfH = SF_ZEILE * SF_ZEILEN;
        const zeichnung = { x: rahmen.x, y: rahmen.y + LEISTE, b: rahmen.b, h: rahmen.h - LEISTE - sfH };
        return { format: f || format(), name: F.name, b: F.b, h: F.h, rahmen, leiste: LEISTE, sfH, sfB: SF_B, zeichnung, spalten: F.spalten, spaltenB: rahmen.b / F.spalten };
    }

    // Aufteilen einer breiten Zeichnung auf Blätter, Schnitt nur in Lücken.
    //   x0, x1     Inhalt in Zeichnungseinheiten (links, rechts)
    //   hoehe      Höhe des Inhalts in Zeichnungseinheiten
    //   belegt     [[a, b], …] waagerechte Ausdehnung der Teile, die nicht zerschnitten werden sollen
    //   spalteSoll gewünschte Spaltenbreite in Zeichnungseinheiten (z. B. ein Strompfad)
    // Ergebnis: Maßstab (mm je Einheit), Blattbreite S und Spaltenbreite C in Einheiten,
    // Blätter [{von, bis}] und spalte(x, i) = Spalte 1 … n auf Blatt i.
    function aufteilen(o) {
        const M = masse(o.format), n = M.spalten;
        const x0 = Number(o.x0) || 0, x1 = Math.max(x0 + 1, Number(o.x1) || 0);
        const hoehe = Math.max(1, Number(o.hoehe) || 1);
        const soll = Math.max(1, Number(o.spalteSoll) || (x1 - x0) / n);
        let mm = Math.min(M.zeichnung.b / (n * soll), M.zeichnung.h / hoehe);
        if (o.maxMassstab) mm = Math.min(mm, o.maxMassstab);
        const S = M.zeichnung.b / mm, C = S / n;
        // belegte Bereiche zusammenfassen → Lücken
        const iv = (o.belegt || []).filter(p => p && isFinite(p[0]) && isFinite(p[1]) && p[1] > p[0]).map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0]);
        const zus = [];
        iv.forEach(p => { const l = zus[zus.length - 1]; if (l && p[0] <= l[1]) l[1] = Math.max(l[1], p[1]); else zus.push(p.slice()); });
        const frei = x => !zus.some(p => x > p[0] && x < p[1]);
        const blaetter = [];
        let s = x0, sicher = 200;
        while (s < x1 - 0.5 && sicher-- > 0) {
            const grenze = s + S;
            if (grenze >= x1) { blaetter.push({ von: s, bis: x1 }); break; }
            // rechteste Lücke vor der Grenze, aber nicht in der ersten halben Spalte
            let schnitt = null;
            for (let i = 0; i < zus.length; i++) {
                const l = i ? zus[i - 1][1] : -Infinity, r = zus[i][0];
                if (r <= s + C / 2) continue;
                const a = Math.max(l, s + C / 2), b = Math.min(r, grenze);
                if (b > a) schnitt = (a + b) / 2;       // Mitte der Lücke
            }
            // Lücke hinter dem letzten Teil
            const letztes = zus.length ? zus[zus.length - 1][1] : -Infinity;
            if (letztes < grenze && letztes >= s + C / 2) schnitt = Math.max(schnitt == null ? -Infinity : schnitt, Math.min(grenze, letztes + (grenze - letztes) / 2));
            if (schnitt == null || !frei(schnitt)) schnitt = grenze;     // erzwungen: ein Teil ist breiter als das Blatt
            blaetter.push({ von: s, bis: schnitt });
            s = schnitt;
        }
        if (!blaetter.length) blaetter.push({ von: x0, bis: x1 });
        const spalte = (x, i) => {
            const b = blaetter[Math.max(0, Math.min(blaetter.length - 1, i))];
            return Math.max(1, Math.min(n, Math.floor((x - b.von) / C) + 1));
        };
        // Blatt, auf dem x liegt (Grenze gehört zum rechten Blatt)
        const blattBei = x => { for (let i = blaetter.length - 1; i >= 0; i--) if (x >= blaetter[i].von - 1e-6) return i; return 0; };
        return { massstab: mm, S, C, spalten: n, blaetter, spalte, blattBei, adresse: (x, erstes) => { const i = blattBei(x); return ((erstes || 1) + i) + '.' + spalte(x, i); } };
    }

    // Schriftfeld eines Blatts als HTML
    function schriftfeldHtml(sf, nr, von, art) {
        const heute = (sf.datum) || new Date().toLocaleDateString('de-DE');
        return `<table class="vb-sf"><tr><td class="k">Erstellt</td><td>${esc(sf.ersteller)}</td><td class="k">Datum</td><td>${esc(heute)}</td><td rowspan="2" colspan="2" class="titel">${esc(sf.titel)}${art ? `<div class="art">${esc(art)}</div>` : ''}</td></tr>
<tr><td class="k">Geprüft</td><td>${esc(sf.geprueft)}</td><td class="k">Klasse</td><td>${esc(sf.klasse)}</td></tr>
<tr><td class="k">Schule</td><td colspan="3">${esc(sf.schule)}</td><td class="k" colspan="2">Anlage/Projekt ${esc(sf.anlage)}</td></tr>
<tr><td class="k">Änderung</td><td colspan="3">${esc(sf.aenderung)}</td><td class="k">Nr. ${esc(sf.nummer)}</td><td class="k blatt">Blatt ${nr}/${von}</td></tr></table>`;
    }
    // Ein Blatt: Rahmen, Spaltenleiste, Zeichenfläche mit Inhalt, Schriftfeld
    //   o.inhalt   HTML der Zeichenfläche (SVG oder Tabellen)
    //   o.nr, o.von Blattnummer und Blattzahl, o.art Zusatz unter dem Titel (z. B. „Steuerstromkreis“)
    //   o.leiste   false: ohne Spaltenleiste (Deckblatt, Listen)
    //   o.fluss    true: Inhalt fließt als Text (Listen), sonst absolut in der Zeichenfläche
    //   o.mitte    true: ein SVG verkleinert und mittig (ganzer Plan auf einem Blatt)
    function blattHtml(o) {
        const M = masse(o.format), sf = o.sf || schriftfeld();
        let leiste = '';
        if (o.leiste !== false) {
            for (let i = 0; i < M.spalten; i++) leiste += `<div class="vb-sp" style="left:${r2(i * M.spaltenB)}mm;width:${r2(M.spaltenB)}mm">${i + 1}</div>`;
            leiste = `<div class="vb-leiste">${leiste}</div>`;
        }
        return `<div class="vb-blatt" data-blatt="${o.nr}"><div class="vb-rahmen">${leiste}<div class="vb-zeichnung${o.fluss ? ' fluss' : ''}${o.mitte ? ' mitte' : ''}">${o.inhalt || ''}</div>${schriftfeldHtml(sf, o.nr, o.von, o.art)}</div></div>`;
    }
    function css(f) {
        const M = masse(f), R = M.rahmen;
        return `@page{size:${M.format} landscape;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}body{font-family:'Segoe UI',Arial,sans-serif;color:#000}
.vb-blatt{width:${M.b}mm;height:${M.h - 0.5}mm;position:relative;page-break-after:always;break-after:page;overflow:hidden;background:#fff}
.vb-blatt:last-child{page-break-after:auto;break-after:auto}
.vb-rahmen{position:absolute;left:${R.x}mm;top:${R.y}mm;width:${R.b}mm;height:${R.h}mm;border:0.5mm solid #000}
.vb-leiste{position:absolute;left:0;top:0;width:100%;height:${M.leiste}mm;border-bottom:0.25mm solid #000}
.vb-sp{position:absolute;top:0;height:100%;border-right:0.25mm solid #000;font-size:7.5pt;line-height:${M.leiste}mm;text-align:center}
.vb-sp:last-child{border-right:none}
.vb-zeichnung{position:absolute;left:0;top:${M.leiste}mm;width:100%;height:${r2(M.zeichnung.h)}mm;overflow:hidden}
.vb-zeichnung>svg{position:absolute;left:0;top:0;width:100%;height:100%}
.vb-zeichnung.fluss{padding:4mm 5mm;overflow:hidden}
.vb-zeichnung.mitte{display:flex;align-items:center;justify-content:center}.vb-zeichnung.mitte>svg{position:static;max-width:100%;max-height:100%;width:auto;height:auto}
table.vb-sf{position:absolute;right:0;bottom:0;width:${M.sfB}mm;border-collapse:collapse;font-size:8pt;background:#fff;table-layout:fixed}
table.vb-sf td{border:0.3mm solid #000;padding:0.4mm 1.5mm;height:${SF_ZEILE}mm;vertical-align:middle;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
table.vb-sf td.k{font-size:6.5pt;color:#333;width:18mm}table.vb-sf td.blatt{font-weight:bold;font-size:7.5pt}
table.vb-sf td.titel{font-size:12pt;font-weight:bold;text-align:center;width:62mm;white-space:normal}
table.vb-sf td.titel .art{font-size:7.5pt;font-weight:normal}
.vb-unterbrechung{position:absolute;bottom:${M.sfH + 1}mm;font-size:7pt;color:#000}
h2.vb-h{font-size:13pt;margin:0 0 3mm}h3{margin:0 0 2mm;font-size:11pt}
table.vb-tab,table.fp-tab{border-collapse:collapse;width:100%;font-size:8.5pt;margin-bottom:4mm}
table.vb-tab th,table.vb-tab td,table.fp-tab th,table.fp-tab td{border:0.25mm solid #555;padding:0.8mm 2mm;text-align:left;vertical-align:top}
table.vb-tab th,table.fp-tab th{background:#e0e0e0}
.vb-deck{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.vb-deck h1{font-size:26pt;margin:0 0 4mm}.vb-deck .anl{font-size:14pt;margin-bottom:10mm}.vb-deck table{font-size:10pt;border-collapse:collapse}.vb-deck td{padding:1mm 4mm;text-align:left}`;
    }
    // Blattbeschreibungen [{inhalt, art, titel, leiste, fluss}] zu fertigen Blättern mit
    // durchgehender Nummer 1 … n. o.sf = Schriftfeld des Plansatzes, o.format.
    function rendern(liste, o) {
        o = o || {};
        const sf0 = o.sf || schriftfeld(), von = liste.length;
        return liste.map((b, i) => blattHtml({ format: o.format, sf: b.titel ? Object.assign({}, sf0, { titel: b.titel }) : sf0, nr: i + 1, von, art: b.art, inhalt: b.inhalt, leiste: b.leiste, fluss: b.fluss, mitte: b.mitte }));
    }
    // Ganzes Druckdokument aus fertigen Blättern
    function dokument(o) {
        const f = o.format || format();
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(o.titel || 'Plan')}</title><style>${css(f)}${o.css || ''}</style></head><body>${(o.blaetter || []).join('')}</body></html>`;
    }
    // Druckfenster öffnen; Rückgabe false, wenn es blockiert wurde
    function drucken(html, win) {
        const w = win || wurzel;
        const pw = w.open('', '_blank');
        if (!pw) return false;
        pw.document.open(); pw.document.write(html); pw.document.close();
        setTimeout(() => { try { pw.focus(); pw.print(); } catch (e) {} }, 400);
        return true;
    }

    // SVG-Ausschnitt für eine Zeichenfläche: viewBox im Seitenverhältnis der Zeichenfläche,
    // damit das Spaltenraster der Zeichnung mit der Spaltenleiste übereinstimmt.
    //   breite: nur bis x + breite zeichnen (der Rest gehört aufs nächste Blatt)
    let clipNr = 0;
    function svgAusschnitt(innen, x, y, S, f, extraAttr, breite) {
        const M = masse(f), H = S * M.zeichnung.h / M.zeichnung.b;
        let k = innen;
        if (breite != null && breite < S) {
            const id = 'vbclip' + (++clipNr);
            k = `<defs><clipPath id="${id}"><rect x="${r2(x)}" y="${r2(y)}" width="${r2(breite)}" height="${r2(H)}"/></clipPath></defs><g clip-path="url(#${id})">${innen}</g>`;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(S)} ${r2(H)}" preserveAspectRatio="xMinYMin meet"${extraAttr || ''}>${k}</svg>`;
    }

    // Dialog für Format und Schriftfeld (gleich in Fluidplan, Schaltplan und Plansatz)
    //   o.doc, o.parent   Dokument und Elternelement (ohne parent: schwebend über der Seite)
    //   o.ueberschrift, o.sf (Startwerte), o.klasse (zusätzliche CSS-Klassen), o.extra (HTML unter den Feldern)
    //   o.knopf           Beschriftung des Knopfs
    //   o.los(werte, box) werte = {format, sf:{…}}
    function dialog(o) {
        const doc = o.doc || wurzel.document;
        const alt = doc.querySelector('.vb-dialog'); if (alt) alt.remove();
        const sf = o.sf || schriftfeld();
        const box = doc.createElement('div');
        box.className = 'vb-dialog' + (o.klasse ? ' ' + o.klasse : '');
        if (!o.parent) box.setAttribute('style', 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100000;background:#fff;color:#263238;border:1px solid #b0bec5;border-radius:6px;padding:10px 14px;font:12px Segoe UI,Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);max-height:90vh;overflow:auto;min-width:420px');
        const zeile = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin:4px 0';
        const fmt = format();
        box.innerHTML = `<div class="fp-listen-kopf" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px"><b>${esc(o.ueberschrift || '🖨 Plan als PDF – Schriftfeld')}</b><span><button type="button" data-a="zu">✕</button></span></div>`
            + `<label class="fp-sf-zeile" style="${zeile}">Blattformat<select data-blatt-format>${Object.keys(FORMATE).map(k => `<option value="${k}"${k === fmt ? ' selected' : ''}>${FORMATE[k].name} (${FORMATE[k].spalten} Spalten)</option>`).join('')}</select></label>`
            + SF_FELDER.map(([k, n]) => `<label class="fp-sf-zeile" style="${zeile}">${esc(n)}<input data-sf="${k}" value="${esc(sf[k])}" style="width:240px"></label>`).join('')
            + (o.extra || '')
            + `<div style="margin-top:8px;text-align:right"><button type="button" data-a="los">${esc(o.knopf || '🖨 PDF erstellen')}</button></div><div class="fp-sf-hinweis" style="color:#607d8b;font-size:11px;margin-top:4px">Im Druckdialog „Als PDF speichern“ wählen. Das Schriftfeld gilt für alle Pläne der Anlage.</div>`;
        (o.parent || doc.body).appendChild(box);
        box.addEventListener('click', e => {
            const b = e.target.closest && e.target.closest('button'); const a = b && b.getAttribute('data-a'); if (!a) return;
            if (a === 'zu') { box.remove(); return; }
            const neu = {}; box.querySelectorAll('[data-sf]').forEach(i => { neu[i.getAttribute('data-sf')] = i.value.trim(); });
            const f = box.querySelector('[data-blatt-format]').value;
            formatSetzen(f);
            schriftfeldSetzen(neu, !!o.titelGemeinsam);
            const werte = { format: format(), sf: neu };
            box.remove();
            if (o.los) o.los(werte, box);
        });
        return box;
    }

    const Blatt = {
        FORMATE, SF_FELDER, masse, aufteilen, format, formatSetzen, schriftfeld, schriftfeldSetzen,
        exportieren, importieren, blattHtml, rendern, schriftfeldHtml, css, dokument, drucken, svgAusschnitt, dialog, esc
    };
    wurzel.Blatt = Blatt;
    if (typeof module !== 'undefined' && module.exports) module.exports = Blatt;
})(typeof window !== 'undefined' ? window : globalThis);
