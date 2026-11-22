/* =====================================================================
 * VALIS – Komponenten-Tutorials (Lernzentrum → 🧩 Komponenten-Tutorials)
 * ---------------------------------------------------------------------
 * Ergänzt die beiden Tutorials aus index.html (Zylinder, berührungslose
 * Sensoren) um zwölf weitere: eines je Bauteilgruppe der 2D-Anlage.
 * Jedes Tutorial erklärt, wo die Bauteile im Menü liegen, wie man sie
 * zuweist und einstellt, und bringt Code zum Übernehmen mit. Knöpfe
 * „➕ Einsetzen“ setzen das Bauteil direkt in die Anlage (derselbe Weg
 * wie das Menü), „📋 Beispiel laden“ lädt ein passendes Beispiel.
 *
 * Eigene Datei, damit die Tutorials nicht mit Änderungen an Tour und
 * Oberfläche in index.html kollidieren (Christoph 16.11.2026).
 * Nutzt aus index.html: window._tutData, window._tutIndex,
 * window._tutCodes / _tutInsertCode, openCompTutorial/closeCompTutorial,
 * addFactoryDevice, loadExample, togglePneumaticMenu/toggleHydraulicMenu.
 *
 * Prüfung: node pruefungen/komponenten-tutorials-pruefung.js
 * ===================================================================== */
(function () {
    'use strict';
    if (window.KompTut) return;
    if (!window._tutData || !window._tutIndex) return;

    // ------------------------------------------------------------------
    // Bausteine für die Kapitel
    // ------------------------------------------------------------------
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const kap = (titel, unter, inhalt) => `<h2>${titel}</h2><p class="tut-chapsubtitle">${unter}</p>${inhalt}`;
    const p = t => `<p>${t}</p>`;
    const h3 = t => `<h3>${t}</h3>`;
    const tipp = t => `<div class="tut-tip">💡 ${t}</div>`;
    const info = t => `<div class="tut-info">${t}</div>`;
    const warn = t => `<div class="tut-warn">⚠️ ${t}</div>`;
    const formel = t => `<div class="tut-formula">${t}</div>`;
    const schritte = liste => '<div class="tut-steps">' + liste.map((t, i) =>
        `<div class="tut-step"><div class="tut-step-n">${i + 1}</div><p>${t}</p></div>`).join('') + '</div>';
    const tabelle = (kopf, zeilen) => '<div class="kt-tab-wrap"><table class="kt-tab"><tr>' +
        kopf.map(k => `<th>${k}</th>`).join('') + '</tr>' +
        zeilen.map(z => '<tr>' + z.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</table></div>';
    const knopf = (text, js, titel) => `<button class="kt-knopf" onclick="${js}"${titel ? ` title="${esc(titel)}"` : ''}>${text}</button>`;
    const knoepfe = (...k) => `<div class="kt-knoepfe">${k.join('')}</div>`;
    const beispiel = (key, name) => knopf('📋 Beispiel laden: ' + name, `KompTut.beispiel('${key}')`, 'Ersetzt die aktuelle Anlage durch das Beispiel');
    // Bauteil-Karten: [icon, name, text, typ?]
    const teile = liste => '<div class="kt-teile">' + liste.map(([ic, name, text, typ]) =>
        `<div class="kt-teil"><div class="kt-teil-kopf"><span class="kt-teil-ic">${ic}</span><b>${name}</b></div>` +
        `<div class="kt-teil-txt">${text}</div>` +
        (typ ? `<button class="kt-knopf kt-klein" onclick="KompTut.einsetzen('${typ}')" title="Bauteil in die 2D-Anlage einsetzen">➕ Einsetzen</button>` : '') +
        '</div>').join('') + '</div>';

    // Code mit Hervorhebung wie in den bestehenden Tutorials, Knöpfe Hinzufügen/Ersetzen
    const FUNK = /^(TON|TOF|TP|CTU|PID|ZWEIPUNKT)$/;
    function hl(code) {
        return code.split('\n').map(z => {
            const k = z.indexOf('//');
            const teil = k >= 0 ? z.slice(0, k) : z, kom = k >= 0 ? z.slice(k) : '';
            const out = esc(teil).replace(/(:=)|(&amp;&amp;|\|\||¬|&lt;=?|&gt;=?|[+*/])|([A-Za-z_][A-Za-z0-9_]*)|(\d+(?:[.,]\d+)?)/g, (m, zw, op, id, zahl) => {
                if (zw) return `<span style="color:#ff7b72">:=</span>`;
                if (op) return `<span style="color:#d2a8ff">${op}</span>`;
                if (id) {
                    if (FUNK.test(id)) return `<span style="color:#d2a8ff">${id}</span>`;
                    if (/^[SR]\d+(_RS)?$/.test(id)) return `<span style="color:#ff7b72">${id}</span>`;
                    return `<span style="color:#79c0ff">${id}</span>`;
                }
                return `<span style="color:#a5d6ff">${zahl}</span>`;
            });
            return out + (kom ? `<span style="color:#8b949e">${esc(kom)}</span>` : '');
        }).join('\n');
    }
    const CODES = {};
    function code(key, text) {
        CODES[key] = text;
        window._tutCodes[key] = text;
        return `<div class="tut-code-wrap"><div class="tut-code">${hl(text)}</div><div class="tut-code-btns">` +
            `<button class="tut-code-insert" data-tut-key="${key}" data-tut-mode="append" onclick="_tutInsertCode('${key}','append')">+ Hinzufügen</button>` +
            `<button class="tut-code-insert tut-code-replace" data-tut-key="${key}" data-tut-mode="replace" onclick="_tutInsertCode('${key}','replace')">↺ Ersetzen</button></div></div>`;
    }

    // ------------------------------------------------------------------
    // Aktionen aus den Tutorials heraus
    // ------------------------------------------------------------------
    const PNEU = ['pneumatic_zone', 'compressor', 'manifold', 'valve_pneu', 'throttle', 'pressure_sensor_pneu', 'flow_sensor_pneu'];
    const HYD = ['hydraulic_zone', 'hydraulic_unit', 'pump_fluid', 'oil_tank', 'hydraulic_manifold', 'valve_hyd', 'throttle_hyd', 'oil_cooler_hyd', 'check_valve_hyd', 'pressure_switch_hyd', 'manometer_hyd', 'accumulator_hyd'];
    const FP2D = ['rueck', 'wechsel', 'zweidruck', 'schnell', 'drossel', 'druckregel', 'zeit', 'folge', 'dschalter', 'manometer', 'daempfer', 'stopfen', 'wartung'];
    function schliessen() {
        try { window.closeCompTutorial(); } catch (e) {}
        try { if (window.closeHub) window.closeHub(); } catch (e) {}
    }
    function anlageZeigen() {
        const fw = document.getElementById('factory-wrapper');
        if (fw && getComputedStyle(fw).display === 'none' && typeof window.toggleWorkspaceView === 'function') window.toggleWorkspaceView('factory-wrapper');
    }
    function einsetzen(typ) {
        schliessen(); anlageZeigen();
        try {
            if (PNEU.includes(typ) && window.togglePneumaticMenu) window.togglePneumaticMenu(true);
            if (HYD.includes(typ) && window.toggleHydraulicMenu) window.toggleHydraulicMenu(true);
            if (typ === 'ventil_prop') { if (window.Fluidplan && window.Fluidplan._neuProp2D) { if (window.togglePneumaticMenu) window.togglePneumaticMenu(true); window.Fluidplan._neuProp2D(); } return; }
            if (FP2D.includes(typ)) { if (window.Fluidplan && window.Fluidplan._neu2D) { if (window.togglePneumaticMenu) window.togglePneumaticMenu(true); window.Fluidplan._neu2D(typ); } return; }
            window.addFactoryDevice(typ);
        } catch (e) { console.error('Komponenten-Tutorial: Einsetzen', typ, e); }
    }
    // Nach dem Laden die 2D-Anlage zeigen: Um die geht es im Tutorial
    function beispielLaden(key) { schliessen(); try { window.loadExample(key); setTimeout(anlageZeigen, 400); } catch (e) { console.error(e); } }
    function menueAn(art) { try { if (art === 'pneu') window.togglePneumaticMenu(true); else window.toggleHydraulicMenu(true); } catch (e) {} schliessen(); anlageZeigen(); }
    function oeffne(was) {
        schliessen();
        try {
            if (was === 'fluidplan' && window.Fluidplan) window.Fluidplan.oeffnen();
            else if (was === 'oszi' && window.openAnalyzerModal) window.openAnalyzerModal();
            else if (was === 'uebungsanlagen' && window.openHub) window.openHub('uebungsanlagen');
            else if (was === 'grundlagen' && window.GrundlagenE) window.GrundlagenE.oeffnen();
            else if (was === 'tutorial') {}
        } catch (e) { console.error(e); }
    }
    const zuTutorial = (key, text) => knopf(text, `closeCompTutorial();openCompTutorial('${key}')`);

    // ------------------------------------------------------------------
    // 1 Pneumatik-System
    // ------------------------------------------------------------------
    const pneumatik = { title: 'Pneumatik-System', icon: '💨', chapters: [
        { num: 1, title: 'Überblick', content: kap('💨 Pneumatik-System', 'Vom Kompressor bis zum Zylinder: die Druckluft hinter der Anlage',
            p('Ohne Pneumatik fährt ein Zylinder in VALIS „elektrisch“ mit fester Geschwindigkeit. Mit Pneumatik rechnet VALIS mit echter Druckluft: Druckaufbau, Kolbenflächen, Drosseln, Abluft und Lasten bestimmen, wie schnell und mit welcher Kraft der Zylinder fährt.') +
            h3('Die Kette') +
            formel('Kompressor → Wartungseinheit → Verteilerleiste → Wegeventil → Drosselrückschlagventil → Zylinder') +
            tabelle(['Bauteil', 'Aufgabe', 'Kennzeichen'], [
                ['⚙️ Kompressor', 'erzeugt Druckluft (Netzdruck, Liefermenge)', 'GQA'],
                ['🔧 Wartungseinheit', 'filtert und regelt die Luft, Druckanzeige', 'GQ'],
                ['▬ Verteilerleiste', 'verteilt die aufbereitete Luft auf die Ventile', ''],
                ['🔀 Wegeventil', 'schaltet die Luft nach dem SPS-Signal oder von Hand', 'QM'],
                ['🔩 Drosselrückschlagventil', 'begrenzt den Durchfluss in eine Richtung → Geschwindigkeit', 'RN'],
                ['🦾 Zylinder', 'wandelt Druck in Bewegung und Kraft', 'MM']
            ]) +
            h3('Zwei Wege zum Aufbau') +
            schritte([
                '<strong>Schnell:</strong> Rechtsklick auf einen Zylinder → <strong>„💨 Pneumatik-Anschluss generieren“</strong>. VALIS legt Kompressor, Wartungseinheit, Verteilerleiste, Ventil und Drosseln an und verschlaucht sie.',
                '<strong>Selbst bauen:</strong> Pneumatik-Menü einschalten, Bauteile einsetzen und die Anschlüsse von Hand verbinden, oder den Plan im <strong>Fluidplan</strong> zeichnen.'
            ]) +
            info('🔗 2D-Anlage, Fluidplan und Auto-Schaltplan zeigen <strong>dieselbe</strong> Pneumatik. Was du an einer Stelle änderst (Drossel, Ventiltyp, Schlauch), gilt überall.') +
            knoepfe(zuTutorial('zylinder', '🔩 Zum Zylinder-Tutorial'))) },
        { num: 2, title: 'Menü & Generieren', content: kap('Pneumatik-Menü und Generieren', 'Wo die Druckluftteile liegen und wie es am schnellsten geht',
            p('Die Druckluftteile haben ein eigenes Menü <strong>💨 Pneumatik ▼</strong>. Es ist ausgeblendet, bis du es einschaltest.') +
            schritte([
                'In der 2D-Anlage die <strong>Seitenleiste</strong> aufklappen (Pfeil am Rand).',
                'Bei <strong>💨 Pneumatik-Menü</strong> auf <strong>An</strong> schalten. Das Menü erscheint in der Werkzeugleiste, und an allen Druckluftteilen werden die Anschlüsse sichtbar.',
                'Einen Zylinder einsetzen und ihm im Dialog seine Ausgänge geben (z. B. <code>ZYL_AUS</code>, <code>ZYL_EIN</code>).',
                'Rechtsklick auf den Zylinder → <strong>💨 Pneumatik-Anschluss generieren</strong>. Die Teile landen im <strong>Pneumatik-Bereich</strong> darunter.',
                'Danach stehen im Rechtsklick des Zylinders die <strong>pneumatischen Abmessungen</strong>: Kolbendurchmesser D, Stangendurchmesser d, Hub h (Standard 20 / 8 / 100 mm).'
            ]) +
            knoepfe(knopf('💨 Pneumatik-Menü einschalten', "KompTut.menue('pneu')"), knopf('➕ Zylinder (Doppel) einsetzen', "KompTut.einsetzen('zylinder_double')")) +
            tipp('Für den Anfang reicht das Generieren. Selbst bauen lohnt sich, wenn du Varianten zeigen willst: anderes Ventil, Drossel auf der anderen Seite, zwei Zylinder an einem Kompressor.')) },
        { num: 3, title: 'Die Bauteile', content: kap('Die Bauteile einstellen', 'Alles per Rechtsklick auf das Bauteil',
            teile([
                ['⚙️', 'Kompressor', 'Netzdruck (bar) und Fördervolumen (l/min). Unter <strong>🫙 Druckluftnetz</strong>: „Druckluftnetz simulieren“ mit Netzvolumen, Schaltdifferenz des Druckschalters, Leckage und <strong>Kompressor aus (Druckabfallprüfung)</strong>.', 'compressor'],
                ['🔧', 'Wartungseinheit', 'Filter mit Wasserabscheider und Druckregler mit Manometer: Eingang 1 vom Kompressor, Ausgang 2 zur Verteilerleiste. <strong>⚙ Druck</strong> per Rechtsklick. Wie die anderen Fluidplan-Teile als Gehäuse, Normsymbol oder echt darstellbar, im Plan auch als Kurzform.', 'wartung'],
                ['▬', 'Verteilerleiste', 'Sitzt am Ausgang 2 der Wartungseinheit und verteilt die aufbereitete Luft auf die Wegeventile (Anschluss 1).', 'manifold'],
                ['🔀', 'Wegeventil', '<strong>⚙ Ventiltyp wechseln</strong>: 3/2 monostabil, 5/2 bistabil, 5/3 Sperrmittelstellung. Betätigung (Magnet, Taster, Hebel, Rolle, Steuerdruck) und Abluftanschlüsse ebenfalls per Rechtsklick.', 'valve_pneu'],
                ['🔩', 'Drosselrückschlagventil', '<strong>⚙️ Öffnungsgrad (%)</strong>: Anteil am Nenndurchfluss der Drossel (200 l/min bei 6 bar). Drosselt in eine Richtung, die andere geht frei über das Rückschlagventil.', 'throttle']
            ]) +
            h3('Abluftanschlüsse 3 und 5') +
            p('Rechtsklick auf das Wegeventil → <strong>🔇 Abluftanschlüsse: was kommt dran?</strong> Zur Wahl stehen offen, Schalldämpfer, Drosselschalldämpfer (mit Öffnung in %) und Blindstopfen. Ein verschlossener Abluftanschluss hält den Zylinder fest: Die Luft kann nicht entweichen.') +
            h3('Darstellung') +
            p('Ventile und Drosseln lassen sich unter <strong>🖼 Darstellung</strong> als Gehäuse, als Normsymbol oder „echt“ (aufgeschnitten oder geschlossen) zeigen. Aufgeschnitten sieht man den Kolbenschieber wandern.') +
            tipp('Abluftdrosselung ist der Normalfall: Die Drossel bremst die ausströmende Luft, der Zylinder fährt dann ruhig und gleichmäßig, auch mit Last.')) },
        { num: 4, title: 'Verschlauchen', content: kap('Anschlüsse verbinden', 'Schläuche ziehen und Anschlusskennzahlen lesen',
            p('Ist das Pneumatik-Menü an, zeigt jedes Druckluftteil kleine Anschlusspunkte. Ziehe mit der Maus von einem Anschluss zum anderen: Das ist ein Schlauch.') +
            tabelle(['Kennzahl', 'Bedeutung'], [
                ['1', 'Druckluftzufuhr (Versorgung)'],
                ['2, 4', 'Arbeitsanschlüsse zum Zylinder'],
                ['3, 5', 'Entlüftung (Abluft)'],
                ['12, 14', 'Steueranschlüsse (pneumatisch betätigte Ventile)']
            ]) +
            schritte([
                'Kompressor 1 → Wartungseinheit 1',
                'Wartungseinheit 2 → Verteilerleiste',
                'Verteilerleiste → Wegeventil 1',
                'Wegeventil 2 und 4 → je ein Drosselrückschlagventil',
                'Drosseln → Zylinderanschlüsse (Kolbenseite und Stangenseite)'
            ]) +
            info('📐 Die Kennzahlen folgen DIN ISO 1219 (ungerade: Versorgung und Abluft, gerade: Arbeitsanschlüsse).') +
            warn('Ein Schlauch, der nirgends angeschlossen ist, bläst ab: Der Druck bricht ein, der Zylinder bleibt stehen. Genau so lassen sich auch Fehler zum Suchen einbauen.')) },
        { num: 5, title: 'Sperr-, Signal- und Zeitventile', content: kap('Weitere Ventile', 'Logik und Zeit rein pneumatisch',
            p('Im Pneumatik-Menü liegen unter drei Klappen weitere Ventile. Sie sind Teile des Fluidplans, die in der 2D-Anlage mitlaufen: Sie schalten das Wegeventil der Anlage über den Plan.') +
            teile([
                ['⏚', 'Rückschlagventil', 'lässt die Luft nur in eine Richtung durch', 'rueck'],
                ['∨', 'Wechselventil (ODER)', 'Ausgang 2 hat Druck, wenn 1 ODER 1(3) Druck hat', 'wechsel'],
                ['∧', 'Zweidruckventil (UND)', 'Ausgang 2 hat Druck, wenn 1 UND 1(3) Druck haben', 'zweidruck'],
                ['⇥', 'Schnellentlüftungsventil', 'entlüftet direkt am Zylinder, er fährt schneller zurück', 'schnell'],
                ['⧖', 'Drosselventil', 'drosselt in beide Richtungen', 'drossel'],
                ['⇲', 'Druckregelventil', 'hält den Druck dahinter auf dem eingestellten Wert', 'druckregel'],
                ['⏱', 'Zeitglied (Verzögerung)', 'schaltet nach der eingestellten Zeit, wenn Steuerdruck ansteht', 'zeit'],
                ['⇧', 'Folgeventil', 'schaltet, sobald der Steuerdruck den eingestellten Wert erreicht', 'folge'],
                ['📟', 'Druckschalter', 'meldet einen Druck als Eingang an die SPS (pneumatisch → elektrisch)', 'dschalter'],
                ['⏲', 'Manometer', 'zeigt den Druck an seinem Anschluss', 'manometer'],
                ['🔇', 'Schalldämpfer', 'für freie Abluft', 'daempfer'],
                ['⊥', 'Blindstopfen', 'verschließt einen Anschluss', 'stopfen']
            ]) +
            tipp('Zweihandbedienung, Pendelhub mit Rollenventilen und Zeitverzögerung gibt es als fertige Beispiele im Fluidplan (Knopf <strong>Beispiele</strong>).')) },
        { num: 6, title: 'Sensoren an der Druckluft', content: kap('Druck und Durchfluss messen', 'Analogsensoren und Proportionalventil',
            teile([
                ['🧭', 'Drucksensor mit Anzeige', '0 … 10 bar, Analogausgang 0 … 10 V und ein PNP-Schaltausgang mit Schaltpunkt und Hysterese. Rechtsklick: Messort, Bereich, Signalart, Öffner-Verhalten, Fehler „Drahtbruch“.', 'pressure_sensor_pneu'],
                ['🌬', 'Durchflusssensor', 'Luftverbrauch 0 … 50 l/min, Analog- und Schaltausgang, dazu ein Impulsausgang (ein Impuls je Liter), z. B. für einen Zähler.', 'flow_sensor_pneu'],
                ['🎚', 'Proportional-Wegeventil', '5/3-Stetigventil: Sollwert 0 … 10 V, 5 V = Mitte, darüber fährt der Zylinder aus, darunter ein, umso schneller, je weiter weg von der Mitte. Rechtsklick: Sollwert, Nenndurchfluss, Überdeckung, Verstärkerkarte. Für die Lageregelung.', 'ventil_prop']
            ]) +
            h3('Beispiel: Druck überwachen und Luft zählen') +
            code('kt_pneu_sens', '// Zylinder nur freigeben, wenn genug Druck da ist\nDRUCK_OK := S_DRUCK\nZYL_AUS := START && DRUCK_OK\n\n// Luftverbrauch zählen: 100 Impulse = 100 Liter\nLUFT_100L := CTU(S_LUFT_IMPULS, RESET, 100)\nWARTUNG := LUFT_100L') +
            p('<code>S_DRUCK</code> ist der Schaltausgang des Drucksensors, <code>S_LUFT_IMPULS</code> der Impulsausgang des Durchflusssensors.') +
            knoepfe(zuTutorial('analog', '📈 Mehr zu Analogwerten'))) },
        { num: 7, title: 'Fluidplan', content: kap('Der Fluidplan', 'Pneumatik nach DIN ISO 1219 zeichnen und simulieren',
            p('Der Fluidplan ist die Planansicht der Pneumatik. Du kannst darin frei zeichnen (Palette links, Leitungen ziehen), rein pneumatische Steuerungen ohne Code laufen lassen oder die Pneumatik der 2D-Anlage ansehen.') +
            schritte([
                'Oben bei den Plänen auf <strong>💨 Fluidplan</strong> klicken.',
                '<strong>ℹ️ Hilfe</strong> erklärt die Bedienung, <strong>Beispiele</strong> laden fertige Schaltungen.',
                '<strong>Prüfen</strong> findet offene Anschlüsse und Fehler, das <strong>Weg-Schritt-Diagramm</strong> zeigt den Ablauf.',
                'Mit <strong>⏏ Abkoppeln</strong> kommt der Plan auf einen zweiten Bildschirm.'
            ]) +
            info('🔗 Eine Wahrheit: Baut der Fluidplan Zylinder, Ventil und Drosseln, stehen sie auch in der 2D-Anlage, und umgekehrt. Magnetspulen lesen VALIS-Variablen, Druckschalter und Sensoren schreiben sie.') +
            code('kt_pneu_zyklus', '// A+ A- mit 5/2-Ventil und zwei Reed-Kontakten\nS1 := START && S_HINTEN\nR1 := S_VORN\nZYL_AUS := Q1\nZYL_EIN := ¬Q1') +
            knoepfe(knopf('💨 Fluidplan öffnen', "KompTut.oeffne('fluidplan')"))) }
    ]};

    // ------------------------------------------------------------------
    // 2 Bedien- und Meldegeräte
    // ------------------------------------------------------------------
    const bedienen = { title: 'Bedien- und Meldegeräte', icon: '🎛️', chapters: [
        { num: 1, title: 'Überblick', content: kap('🎛️ Bedien- und Meldegeräte', 'Was der Mensch an der Anlage drückt und sieht',
            p('Alle Bedien- und Meldegeräte liegen im Menü <strong>🎛️ Bedienpult ▼</strong>. Bediengeräte sind <strong>Eingänge</strong> der SPS, Meldegeräte sind <strong>Ausgänge</strong>.') +
            h3('Bedienen (Eingänge)') +
            teile([
                ['🟢', 'Taster (Schließer)', 'liefert 1, solange er gedrückt ist', 'taster'],
                ['🎚️', 'Schalter (rastend)', 'bleibt in seiner Stellung, bis er erneut betätigt wird', 'schalter'],
                ['🍄', 'Not-Halt (Öffner)', 'rastet ein, öffnet den Stromkreis', 'nothalt'],
                ['🔑', 'Schlüsselschalter', 'rastend, nur mit Schlüssel: z. B. Einrichtbetrieb', 'key_switch']
            ]) +
            h3('Melden (Ausgänge)') +
            teile([
                ['💡', 'Meldeleuchte', 'eine Leuchte, Farbe im Dialog wählbar', 'led'],
                ['🚦', 'Signal-Säule', 'drei Leuchten Rot, Gelb, Grün mit je einer Variable', 'stacklight'],
                ['📢', 'Sirene / Hupe', 'wackelt und tönt; Ton per Rechtsklick stumm', 'siren'],
                ['📟', '7-Segment-Anzeige', 'zeigt den Wert eines Zeitglieds oder Zählers', 'display'],
                ['📟', 'Anzeige (Zeiger/Balken)', 'zeigt eine Zahl, z. B. einen Messwert', 'analog_meter'],
                ['🎛️', 'Bedienpult-Rahmen', 'fasst Bedienelemente zusammen, sie wandern beim Verschieben mit', 'hmi_panel']
            ])) },
        { num: 2, title: 'Einsetzen & Bedienen', content: kap('Einsetzen und bedienen', 'Variable zuweisen, in der Simulation drücken',
            schritte([
                'Im Menü <strong>🎛️ Bedienpult ▼</strong> das Gerät wählen.',
                'Im Dialog die <strong>Variable</strong> aus der Liste wählen oder neu eintippen, bei Tastern und Leuchten auch die <strong>Farbe</strong>.',
                'Das Gerät an seinen Platz ziehen.',
                'Simulation starten und das Gerät in der Anlage <strong>anklicken</strong>.'
            ]) +
            tipp('Zwei Taster gleichzeitig drücken (Zweihand, SR gegen RS): <kbd>Strg</kbd> halten und nacheinander beide Taster anklicken.') +
            tipp('Tastatur: Im Sim-Panel legt der Knopf ⌨️ vor einem Eingang ihn auf eine Taste, z. B. START auf <kbd>S</kbd>.') +
            h3('Beispiel: Motor mit Start und Stopp') +
            code('kt_bed_startstopp', '// Selbsthaltung als SR-Glied\nS1 := START\nR1 := STOP\nMOTOR := Q1\nLEUCHTE_BETRIEB := Q1') +
            knoepfe(knopf('➕ Taster einsetzen', "KompTut.einsetzen('taster')"), knopf('➕ Meldeleuchte einsetzen', "KompTut.einsetzen('led')"))) },
        { num: 3, title: 'Schließer, Öffner, Not-Halt', content: kap('Schließer und Öffner', 'Warum der Not-Halt anders zählt',
            p('Ein <strong>Schließer</strong> schließt beim Drücken. Ein <strong>Öffner</strong> ist in Ruhe geschlossen und öffnet beim Drücken. Der Not-Halt ist ein Öffner: Bricht ein Draht, wirkt das wie ein gedrückter Not-Halt (Drahtbruchsicherheit).') +
            h3('Zwei Modi, zwei Schreibweisen') +
            p('Oben in der Leiste schaltest du zwischen <strong>⚡ E-Pneu</strong> und <strong>⚡ SPS</strong> um. Die Variable des Not-Halts bedeutet dann Verschiedenes:') +
            tabelle(['Modus', 'NOTHALT = 1 heißt', 'Motor nur ohne Not-Halt'], [
                ['⚡ E-Pneu (Standard)', 'Not-Halt ist <strong>gedrückt</strong>', '<code>MOTOR := Q1 &amp;&amp; ¬NOTHALT</code>'],
                ['⚡ SPS', 'der Öffner ist geschlossen, also <strong>nicht gedrückt</strong> (Signal an der Eingangsklemme)', '<code>MOTOR := Q1 &amp;&amp; NOTHALT</code>']
            ]) +
            code('kt_bed_nothalt', '// E-Pneu-Modus: NOTHALT = 1 heißt gedrückt\nS1 := START && ¬NOTHALT\nR1 := STOP || NOTHALT\nMOTOR := Q1') +
            warn('Im SPS-Modus muss das ¬ weg. Prüfe nach dem Umschalten immer, was die Variable gerade bedeutet: im Sim-Panel den Not-Halt drücken und zusehen.') +
            knoepfe(zuTutorial('sicherheit', '🚨 Mehr im Tutorial Sicherheitstechnik'))) },
        { num: 4, title: 'Signal-Säule & Sirene', content: kap('Zustände melden', 'Signal-Säule, Sirene und Leuchten sinnvoll belegen',
            tabelle(['Farbe', 'übliche Bedeutung'], [
                ['🟢 Grün', 'Anlage läuft (Automatik)'],
                ['🟡 Gelb', 'Achtung: bereit, Handbetrieb oder Eingriff nötig'],
                ['🔴 Rot', 'Störung oder Not-Halt']
            ]) +
            p('Die Signal-Säule fragt beim Einsetzen drei Variablen ab: Rot, Gelb und Grün. Eine Farbe ohne Variable bleibt dunkel.') +
            code('kt_bed_saeule', '// Betriebszustände an der Signal-Säule (E-Pneu-Modus)\nS1 := START && ¬NOTHALT\nR1 := STOP || NOTHALT\nSAEULE_GRUEN := Q1\nSAEULE_GELB := ¬Q1 && ¬NOTHALT\nSAEULE_ROT := NOTHALT\nHUPE := NOTHALT') +
            tipp('Blinken mit zwei Zeitgliedern: <code>T_AN := TON(¬T_AUS, 0.5)</code> und <code>T_AUS := TON(T_AN, 0.5)</code>. Dann ist <code>T_AN</code> eine halbe Sekunde an und eine halbe aus, z. B. <code>SAEULE_GELB := T_AN</code>.') +
            knoepfe(knopf('➕ Signal-Säule einsetzen', "KompTut.einsetzen('stacklight')"), knopf('➕ Sirene einsetzen', "KompTut.einsetzen('siren')"))) },
        { num: 5, title: 'Anzeigen & Bedienpult', content: kap('Zahlen anzeigen und Bedienpult bauen', '7-Segment-Anzeige, Zeigerinstrument, Rahmen',
            h3('7-Segment-Anzeige') +
            p('Sie zeigt den Wert eines <strong>Zeitglieds oder Zählers</strong> aus dem Logikplan (TON, TOF, TP, CTU). Schreib den Zähler deshalb zuerst in den Code, dann setzt du die Anzeige ein und wählst ihn im Dialog aus.') +
            code('kt_bed_zaehler', '// Teile zählen, nach 10 Teilen ist die Kiste voll\nKISTE_VOLL := CTU(S_TEIL, RESET, 10)\nLEUCHTE_VOLL := KISTE_VOLL') +
            h3('Anzeige (Zeiger/Balken)') +
            p('Zeigt eine beliebige Zahl, etwa einen Messwert oder Sollwert. Rechtsklick: Bauart Zeiger oder Balken, Skala von … bis.') +
            h3('Bedienpult-Rahmen') +
            p('Lege den Rahmen um deine Taster und Leuchten. Verschiebst du den Rahmen, kommen alle Elemente darin mit.') +
            knoepfe(knopf('➕ 7-Segment-Anzeige einsetzen', "KompTut.einsetzen('display')"), beispiel('full_demo', 'Master-Anlage')) +
            info('Die Master-Anlage zeigt Signal-Säule, Sirene und Zähler-Anzeige zusammen. Sie stellt beim Laden selbst auf den E-Pneu-Modus.')) }
    ]};

    // ------------------------------------------------------------------
    // 3 Fördertechnik und Werkstücke
    // ------------------------------------------------------------------
    const foerdern = { title: 'Fördertechnik und Werkstücke', icon: '🛤️', chapters: [
        { num: 1, title: 'Werkstücke erzeugen', content: kap('🛤️ Werkstücke erzeugen und entfernen', 'Spawner und Despawner im Menü 📦 Materialien',
            teile([
                ['⏳', 'Spawner (Metall / Kunststoff)', 'legt im Takt ein Werkstück ab. Optional nur, solange eine Variable 1 ist.', 'spawner_metall'],
                ['🧬', 'Spawner (Spezialobjekt)', 'klont ein Spezialobjekt, das auf ihm liegt (z. B. eine Flasche), mit Größe und Inhalt. „📥 Template erfassen“ im Rechtsklick.', 'spawner_special'],
                ['🗑️', 'Despawner', 'nimmt Werkstücke aus der Anlage. Rechtsklick: <strong>🗑️ Erlaubte Materialien</strong>.', 'despawner']
            ]) +
            h3('Einstellungen beim Spawner') +
            tabelle(['Einstellung', 'Wirkung'], [
                ['Aktivieren durch', 'Variable, die das Erzeugen freigibt; leer = dauerhaft aktiv'],
                ['Intervall', 'Sekunden zwischen zwei Werkstücken'],
                ['Block-Eigenschaft', 'Normal (Teile überlappen) oder Massiv (Teile stoßen sich)'],
                ['Qualitätsmodus', 'Immer OK, Immer NOK, Zufällig (80 % OK) oder Jedes 3. NOK: für die Inspektionskamera'],
                ['Schmelzpunkt', 'wann das Teil am Heizelement schmilzt (Metall 1200 °C, Kunststoff 150 °C)'],
                ['Block-Versatz', 'wo das Teil neben dem Spawner erscheint']
            ]) +
            knoepfe(zuTutorial('kamera', '📷 Zur Inspektionskamera'))) },
        { num: 2, title: 'Förderband', content: kap('Das Förderband', 'Der Antrieb fast jeder Anlage',
            schritte([
                'Menü <strong>⚙️ Aktoren ▼</strong> → <strong>🛤️ Förderband</strong>.',
                'Im Dialog den Motor-Ausgang wählen (z. B. <code>BAND</code>) oder <strong>Immer AN</strong>.',
                'Länge mit dem Griff am Rand ziehen, Richtung mit <strong>🔄 Drehen (90°)</strong> im Rechtsklick (zweimal = andere Richtung).',
                'Rechtsklick: <strong>⏱ Anlaufzeit</strong> in Sekunden, dann läuft das Band weich an.'
            ]) +
            h3('Beispiel: Band läuft, bis das Teil am Ende ist') +
            code('kt_foe_band', '// Band an mit START, aus mit STOP oder wenn ein Teil am Ende liegt\nS1 := START\nR1 := STOP\nBAND := Q1 && ¬S_ENDE') +
            knoepfe(knopf('➕ Förderband einsetzen', "KompTut.einsetzen('conveyor')"), beispiel('comments', 'Sortieranlage (kommentiert)'))) },
        { num: 3, title: 'Weitere Fördertechnik', content: kap('Bänder, Weichen, Lifte', 'Im Menü ⚙️ Aktoren unter + Fördertechnik',
            teile([
                ['🛞', 'Rollenbahn', 'passiv: Teile rollen durch Neigung. Rechtsklick: Rollgeschwindigkeit.', 'conveyor_roller'],
                ['↩️', 'Förderbandkurve', 'lenkt um einen einstellbaren Winkel um (nur Draufsicht).', 'conveyor_curve'],
                ['⬆️', 'Kettenlift', 'fördert senkrecht nach oben oder unten (nur Seitenansicht).', 'conveyor_lift'],
                ['🔼', 'Hubpalette', 'hebt aufliegende Teile wie eine Gabel; Hub und Geschwindigkeit einstellbar (nur Seitenansicht).', 'lift_palette'],
                ['↔️', 'Weiche / Klappe', 'quer über ein Band legen; aktiv lenkt sie Teile seitlich ab. Klappenwinkel und Drehpunkt per Rechtsklick.', 'sorter_flap'],
                ['🔄', 'Drehtisch', 'dreht ein Teil um 90° in eine andere Bahn (nur Draufsicht).', 'turntable']
            ]) +
            h3('Beispiel: Metall ausschleusen') +
            code('kt_foe_weiche', '// Induktiver Sensor erkennt Metall, die Weiche lenkt es ab\nBAND := ¬NOTHALT\nWEICHE := S_METALL') ) },
        { num: 4, title: 'Takten & Indexieren', content: kap('Takten mit Werkstückträger und Rundtakttisch', 'Ein Impuls, eine Station weiter',
            teile([
                ['🛤️', 'Werkstückträger-Band', 'eine steigende Flanke an STEP schiebt den Träger eine Station weiter. Stationszahl, Modus Loop (1→2→3→4→1) oder Pendel, HOME-Signal.', 'carrier_belt'],
                ['🎯', 'Rundtakttisch', 'eine steigende Flanke an STEP dreht um 360°/N zum nächsten Platz. Der Zeiger markiert Station 1.', 'rotary_table']
            ]) +
            p('Jede Station meldet sich mit einem eigenen <strong>INDEX-Sensor</strong> (Rechtsklick → 📡 INDEX-Sensoren). So weiß das Programm, wo der Träger steht.') +
            code('kt_foe_takt', '// Alle 3 s einen Takt weiter, solange die Anlage läuft\nS1 := START\nR1 := STOP\nT_AN := TON(Q1 && ¬T_AUS, 1.5)\nT_AUS := TON(T_AN, 1.5)\nTRAEGER_STEP := T_AN') +
            info('STEP reagiert auf die Flanke: Ein Dauersignal schiebt nur einmal. Zum Weitertakten muss das Signal zwischendurch wieder 0 werden.') +
            tipp('Zusammen mit einer Schrittkette (SK-Doku) baust du so Bearbeitungsstationen: Bohren an Station 2, Prüfen an Station 3.')) },
        { num: 5, title: 'Seiten- oder Draufsicht', content: kap('Seitenansicht und Draufsicht', 'Welches Bauteil wo funktioniert',
            p('Der Knopf für die Ansicht in der Werkzeugleiste der 2D-Anlage schaltet die ganze Anlage um. In der <strong>Seitenansicht</strong> fallen Werkstücke nach unten (Schwerkraft), in der <strong>Draufsicht</strong> schaust du von oben auf die Bänder.') +
            tabelle(['nur Seitenansicht', 'nur Draufsicht', 'beides'], [
                ['Kettenlift, Hubpalette, Pressstempel, L-Schieber, Heizelement, Portalkran', 'Förderbandkurve, Drehtisch, Palette, 2D-Roboterarm, Humanoider Roboter, Werkstückträger-Band, Rundtakttisch', 'Förderband, Rollenbahn, Weiche, Zylinder, Wände, Rahmen']
            ]) +
            p('Willst du beides in einer Anlage, setze <strong>Zonen</strong> (Menü 🏗️ Struktur): In einer Zone gilt ihre Ansicht.') +
            knoepfe(zuTutorial('struktur', '🏗️ Zum Tutorial Struktur'))) }
    ]};

    // ------------------------------------------------------------------
    // 4 Messen und Fehlersuche
    // ------------------------------------------------------------------
    const messen = { title: 'Messen und Fehlersuche', icon: '🩺', chapters: [
        { num: 1, title: 'Überblick', content: kap('🩺 Messen und Fehlersuche', 'Wie an der echten Anlage: erst messen, dann tauschen',
            tabelle(['Werkzeug', 'misst', 'wo'], [
                ['🩺 Multimeter', 'Spannung, Widerstand, Durchgang', 'Steckaufbau und Auto-Schaltplan'],
                ['🔍 Fehlersuche Elektrik', 'versteckte Fehler finden und melden', 'Steckaufbau'],
                ['📊 Oszilloskop', 'Signale über der Zeit, Drücke, Kraft–Weg', 'Leiste oben'],
                ['⏲ Manometer, 🧭 Drucksensor', 'Druck an einem Anschluss', 'Pneumatik und Hydraulik'],
                ['⚡ Grundlagen-Messplatz', 'U, I, R an Reihe und Parallelschaltung', 'Lernzentrum']
            ]) +
            p('Die Messungen rechnen mit derselben Schaltung, die auch die Simulation steuert. Ein Fehler, den die Lehrkraft einbaut, wirkt deshalb auf die Anlage: Eine Spule ohne Strom zieht nicht an, auch wenn das Programm sie einschaltet.') +
            knoepfe(knopf('⚡ Grundlagen-Messplatz öffnen', "KompTut.oeffne('grundlagen')"))) },
        { num: 2, title: 'Multimeter', content: kap('Das Multimeter', 'Spannung bei laufender, Widerstand bei ausgeschalteter Anlage',
            schritte([
                'Im <strong>Steckaufbau</strong> oder im <strong>Auto-Schaltplan</strong> auf den runden Knopf mit dem Multimeter 🩺 klicken.',
                '<strong>V⎓ Spannung:</strong> Simulation starten. Die schwarze Spitze (COM) liegt auf 0 V, die rote setzt du per Klick an den Messpunkt.',
                '<strong>Ω 🔊 Durchgang:</strong> Simulation stoppen. Erst den einen, dann den anderen Punkt anklicken. Bei Durchgang piept es.',
                '<strong>COM auf 0 V</strong> holt die schwarze Spitze zurück, <strong>Spitzen abnehmen</strong> beendet die Messung.'
            ]) +
            h3('Was du erwarten kannst') +
            tabelle(['Messung', 'Ergebnis'], [
                ['vor einem Taster gegen 0 V', '24 V'],
                ['hinter einem offenen Taster', '0 V'],
                ['über eine Relaisspule (spannungsfrei)', 'einige hundert Ω'],
                ['über ein gebrochenes Kabel', 'OL (kein Durchgang)']
            ]) +
            warn('Widerstand nur an der spannungsfreien Anlage messen. Läuft die Simulation, warnt das Messgerät.') +
            info('Im Klemmenplan (Anschluss-Sicht) und im freien Aufbau misst du im Steckaufbau.')) },
        { num: 3, title: 'Fehlersuche Elektrik', content: kap('Fehlersuche Elektrik', 'Die Lehrkraft baut Fehler ein, Lernende finden sie',
            h3('Lehrkraft: Fehler einbauen') +
            schritte([
                'Im Steckaufbau <strong>🔍 Fehlersuche</strong> öffnen.',
                'Eine Buchse oder ein Kabel anklicken und einen Fehler wählen: Ader gebrochen, Kontakt abgebrannt oder verschweißt, Spule unterbrochen, Sensor defekt, SPS-Aus- oder Eingang defekt.',
                '<strong>▶ Fehlersuche starten</strong>: Die Fehler sind jetzt unsichtbar, wirken aber.',
                'Anlage speichern oder als Aufgabe weitergeben (Bedingung „el_fehler“).'
            ]) +
            h3('Lernende: systematisch suchen') +
            schritte([
                'Symptom beschreiben: Was tut die Anlage nicht?',
                'Im Schaltplan den betroffenen Strompfad suchen.',
                'Bei laufender Anlage vom + aus Spannung messen, bis sie wegfällt.',
                'Anlage aus, das verdächtige Stück auf Durchgang messen.',
                'Befund melden und mit <strong>✓ Befund prüfen</strong> kontrollieren.'
            ]) +
            info('In der Anschluss-Sicht mit SPS-Modulen gibt es die Fehlersuche noch nicht. Schalte dafür auf die Programm-Sicht oder den E-Pneu-Modus.')) },
        { num: 4, title: 'Oszilloskop', content: kap('Das Oszilloskop', 'Signale über der Zeit sichtbar machen',
            p('Das Oszilloskop zeichnet jeden Simulationsschritt auf: Bits als High/Low-Spur, Zahlen als Kurve mit Skala. Fährst du mit der Maus über die Kurven, siehst du die Werte zu diesem Zeitpunkt.') +
            tabelle(['Knopf', 'zeigt'], [
                ['🫧 Zylinderdrücke', 'Druck in Kammer A (Kolbenseite) und B (Stangenseite) und den Kolbenweg'],
                ['📐 Kraft–Weg', 'die Kraft über dem Hub: F = p<sub>A</sub> · A<sub>Kolben</sub> − p<sub>B</sub> · A<sub>Ring</sub>'],
                ['📈 Analog überlagern', 'Sollwert, Istwert und Stellgröße in einer Spur'],
                ['⏩ Zeitraffer', 'SPS-Zeit, Öltemperatur und Regelstrecken laufen schneller'],
                ['🗑️ Verlauf leeren', 'neue Aufnahme beginnen']
            ]) +
            tipp('Ein TON-Zeitglied siehst du hier am besten: Der Ausgang kommt um die eingestellte Zeit später als der Eingang. In der Lektion F2 (TON gegen TOF) wird genau das gemessen.') +
            knoepfe(knopf('📊 Oszilloskop öffnen', "KompTut.oeffne('oszi')"))) },
        { num: 5, title: 'Druck messen', content: kap('Druck messen', 'Manometer und Drucksensor',
            teile([
                ['⏲', 'Manometer (Pneumatik)', 'an einen Anschluss setzen, zeigt dort den Druck. Im Pneumatik-Menü unter „Anzeigen und Zubehör“.', 'manometer'],
                ['⏲', 'Manometer (Hydraulik)', 'zeigt den Druck im Ölkreis.', 'manometer_hyd'],
                ['🧭', 'Drucksensor mit Anzeige', 'gibt den Druck zusätzlich als Zahl an die SPS.', 'pressure_sensor_pneu']
            ]) +
            p('Steht ein Zylinder, obwohl das Ventil schaltet, zeigt das Manometer, wo die Luft fehlt: vor der Wartungseinheit, hinter dem Ventil oder erst am Zylinder.') +
            knoepfe(zuTutorial('pneumatik', '💨 Zum Tutorial Pneumatik-System'))) }
    ]};

    // ------------------------------------------------------------------
    // 5 Sicherheitstechnik
    // ------------------------------------------------------------------
    const sicherheit = { title: 'Sicherheitstechnik', icon: '🚨', chapters: [
        { num: 1, title: 'Grundsatz', content: kap('🚨 Sicherheitstechnik', 'Lieber stehen bleiben als gefährlich weiterlaufen',
            p('Sicherheitsbauteile sind so gebaut, dass ein Fehler zum sicheren Zustand führt. Ein Not-Halt ist ein <strong>Öffner</strong>: Bricht der Draht, ist das wie gedrückt. Ein Lichtgitter meldet „frei“ nur, solange alle Strahlen ankommen.') +
            teile([
                ['🍄', 'Not-Halt', 'rastender Öffner im Menü Bedienpult', 'nothalt'],
                ['🚨', 'Sicherheits-Lichtgitter', 'überwacht einen ganzen Bereich', 'light_curtain'],
                ['🚪', 'Schutztür (Alu/Glas)', 'trennende Schutzeinrichtung, auch an einem Zylinder', 'window'],
                ['⚙️', 'Mech. Positionsschalter', 'Rollenhebel, z. B. zur Abfrage einer Tür oder Endlage', 'mech_sensor'],
                ['🔑', 'Schlüsselschalter', 'nur Befugte schalten um, z. B. Einrichtbetrieb', 'key_switch']
            ]) +
            warn('In VALIS wirkt der Not-Halt über das Programm. In echten Anlagen schaltet er zusätzlich über ein Sicherheitsrelais oder eine Sicherheitssteuerung ab, nicht nur über die normale SPS.')) },
        { num: 2, title: 'Not-Halt & Quittieren', content: kap('Not-Halt mit Quittierung', 'Nach dem Entriegeln darf nichts von selbst anlaufen',
            p('Wird der Not-Halt entriegelt, darf die Anlage <strong>nicht</strong> wieder losfahren. Erst eine bewusste Quittierung löscht die Störung, dann braucht es einen neuen Start.') +
            code('kt_si_nothalt', '// E-Pneu-Modus: NOTHALT = 1 heißt gedrückt\n// Störung merken, bis quittiert wird (nur bei entriegeltem Not-Halt)\nS2 := NOTHALT\nR2 := QUITT && ¬NOTHALT\nSTOERUNG := Q2\n\n// Betrieb nur ohne Störung, Neustart mit START\nS1 := START && ¬STOERUNG\nR1 := STOP || STOERUNG\nMOTOR := Q1\nLEUCHTE_ROT := STOERUNG') +
            schritte([
                'Start drücken: Motor läuft.',
                'Not-Halt drücken: Motor steht, rote Leuchte an.',
                'Not-Halt entriegeln: Motor bleibt aus, Störung bleibt.',
                'Quittieren, dann Start: Motor läuft wieder.'
            ]) +
            info('Im SPS-Modus liefert der Not-Halt in Ruhe 1. Dann heißt es <code>S2 := ¬NOTHALT</code> und <code>R2 := QUITT &amp;&amp; NOTHALT</code>.') +
            knoepfe(knopf('➕ Not-Halt einsetzen', "KompTut.einsetzen('nothalt')"))) },
        { num: 3, title: 'Lichtgitter', content: kap('Das Sicherheits-Lichtgitter', 'Überwacht einen ganzen Bereich',
            p('Das Lichtgitter erkennt Werkstücke, Zylinder mit Anbauteilen und den humanoiden Roboter im Feld. Seine Variable ist <strong>1, solange das Feld frei ist</strong>, und 0 bei Unterbrechung oder Fehler (Fail-Safe).') +
            schritte([
                'Menü <strong>📡 Sensoren ▼</strong> → <strong>🚨 Sicherheit</strong> → Sicherheits-Lichtgitter.',
                'Quer vor den Gefahrenbereich legen und in der Länge ziehen.',
                'Im Rechtsklick zwischen Seitenansicht und Draufsicht wechseln.',
                'In der Simulation lässt es sich auch im Sim-Panel von Hand unterbrechen, etwa für eine „Hand im Feld“.'
            ]) +
            code('kt_si_lichtgitter', '// Presse fährt nur bei freiem Lichtgitter\nPRESSE_AB := START && LICHTGITTER\n// Unterbrechung während der Bewegung: sofort zurück\nPRESSE_AUF := ¬LICHTGITTER || ¬START') +
            knoepfe(knopf('➕ Lichtgitter einsetzen', "KompTut.einsetzen('light_curtain')"))) },
        { num: 4, title: 'Schutztür & Positionsschalter', content: kap('Schutztür und Positionsschalter', 'Trennende Schutzeinrichtung abfragen',
            p('Die <strong>Schutztür</strong> ist eine Alu-Glas-Wand. Sie liegt unter <strong>🧩 Anbauteile</strong> und lässt sich auch an einen Zylinder montieren: Dann fährt die Tür auf und zu.') +
            p('Ob die Tür zu ist, meldet ein Sensor davor, am einfachsten ein <strong>mechanischer Positionsschalter</strong> (Rollenhebel). Er schaltet, wenn Werkstücke, eine Kolbenstange oder ein Anbauteil seinen Hebel berühren.') +
            code('kt_si_tuer', '// Bearbeitung nur bei geschlossener Tür\nTUER_ZU := S_TUER\nSPINDEL := START && TUER_ZU\nLEUCHTE_GELB := ¬TUER_ZU') +
            tipp('Ein einzelner Schalter lässt sich leicht überlisten. Echte Türen haben deshalb zweikanalige, codierte Schalter an einem Sicherheitsrelais.') +
            knoepfe(knopf('➕ Schutztür einsetzen', "KompTut.einsetzen('window')"), knopf('➕ Positionsschalter einsetzen', "KompTut.einsetzen('mech_sensor')"))) },
        { num: 5, title: 'Schlüsselschalter', content: kap('Der Schlüsselschalter', 'Betriebsart wählen, nur mit Befugnis',
            p('Mit dem Schlüsselschalter wählt eine befugte Person eine Betriebsart, z. B. <strong>Einrichten</strong>. Dann darf die Anlage langsam und nur mit gehaltenem Taster fahren (Tippbetrieb).') +
            code('kt_si_schluessel', '// Automatik oder Einrichten (Tippbetrieb)\nAUTOMATIK := ¬EINRICHTEN\nS1 := START && AUTOMATIK\nR1 := STOP || EINRICHTEN\nBAND := Q1 || (EINRICHTEN && TIPP)') +
            knoepfe(knopf('➕ Schlüsselschalter einsetzen', "KompTut.einsetzen('key_switch')"))) }
    ]};

    // ------------------------------------------------------------------
    // 6 Hydraulik
    // ------------------------------------------------------------------
    const hydraulik = { title: 'Hydraulik', icon: '🛢', chapters: [
        { num: 1, title: 'Überblick', content: kap('🛢 Hydraulik', 'Große Kräfte mit Öl',
            p('Hydraulik arbeitet mit Öl statt Luft. Öl lässt sich kaum zusammendrücken: Der Zylinder fährt gleichmäßig, hält seine Lage und bringt bei 100 bar und mehr große Kräfte.') +
            tabelle(['', 'Pneumatik', 'Hydraulik'], [
                ['Medium', 'Luft (kompressibel)', 'Öl (fast inkompressibel)'],
                ['Druck', 'etwa 6 bar', 'bis über 100 bar'],
                ['Rücklauf', 'Abluft ins Freie', 'Öl zurück in den Tank'],
                ['Geschwindigkeit', 'über Drossel, lastabhängig', 'über Stromregelventil, sehr gleichmäßig']
            ]) +
            schritte([
                'Seitenleiste der 2D-Anlage → <strong>🛢 Hydraulik-Menü</strong> → <strong>An</strong>. Das Menü 🛢 Hydraulik ▼ erscheint.',
                'Schnell: Rechtsklick auf einen Zylinder → <strong>🛢 Hydraulik-Anschluss generieren</strong>.'
            ]) +
            knoepfe(knopf('🛢 Hydraulik-Menü einschalten', "KompTut.menue('hyd')"))) },
        { num: 2, title: 'Aggregat & Tank', content: kap('Aggregat, Tank und Verteiler', 'Die Versorgung',
            teile([
                ['⚙️', 'Hydraulikaggregat', 'Pumpe mit Motor. Rechtsklick: Fluid-Typ, Fördervolumen (l/min), Einstelldruck des Druckbegrenzungsventils (Standard 100 bar), Leckage.', 'hydraulic_unit'],
                ['🛢', 'Öltank', 'Vorrat für den Kreis. „🛢 Tank auffüllen“ im Rechtsklick.', 'oil_tank'],
                ['🔧', 'Verteiler', 'verteilt Druck- und Tankleitung auf mehrere Ventile.', 'hydraulic_manifold'],
                ['🫙', 'Druckspeicher', 'speichert Öl unter Druck, z. B. für kurze Spitzen.', 'accumulator_hyd'],
                ['❄', 'Ölkühler', 'kühlt das Öl, Stellgröße 0 … 100 % oder ein Bit.', 'oil_cooler_hyd']
            ]) +
            info('📌 Der Einstelldruck des Druckbegrenzungsventils ist der Höchstdruck der Anlage. Der Arbeitsdruck stellt sich nach der Last ein.') +
            tipp('Bei der ersten Befüllung nimmt das Öl in den Zylindern Volumen aus dem Tank. „🔻 System entleeren“ in der Seitenleiste zieht dieses Volumen ab.')) },
        { num: 3, title: 'Ventile', content: kap('Wegeventile und Stromventile', 'Richtung und Geschwindigkeit',
            teile([
                ['🔀', 'Wegeventil (Hydraulik)', '3/2, 4/2 oder 4/3 mit gesperrter Mitte. Anschlüsse P (Pumpe), T (Tank), A und B.', 'valve_hyd'],
                ['🔩', 'Stromregelventil', 'begrenzt den Ölstrom → Geschwindigkeit. Öffnungsgrad in %, 100 % = 20 l/min.', 'throttle_hyd'],
                ['⏚', 'Rückschlagventil (entsperrbar)', 'hält den Zylinder sicher in Lage, bis Steuerdruck es öffnet.', 'check_valve_hyd']
            ]) +
            h3('Mittelstellungen der 4/3-Ventile') +
            p('In der 2D-Anlage hat das 4/3-Ventil die gesperrte Mitte. Im Fluidplan (Hydraulik-Palette) gibt es zusätzlich Umlauf und Schwimmstellung:') +
            tabelle(['Mittelstellung', 'Wirkung'], [
                ['Mitte gesperrt', 'alle Anschlüsse zu: Zylinder hält, Pumpe fördert über das DBV'],
                ['Umlauf', 'P mit T verbunden: Pumpe drucklos, Zylinder hält'],
                ['Schwimmstellung', 'A und B mit T verbunden: Zylinder lässt sich von Hand verschieben']
            ]) +
            code('kt_hyd_presse', '// Hydraulikpresse: ab mit START, auf am unteren Endschalter\nS1 := START && S_OBEN\nR1 := S_UNTEN || STOP\nPRESSE_AB := Q1\nPRESSE_AUF := ¬Q1 && ¬S_OBEN')) },
        { num: 4, title: 'Druck & Temperatur', content: kap('Druck und Temperatur überwachen', 'Druckschalter, Manometer, Messumformer',
            teile([
                ['📟', 'Druckschalter', 'meldet einen eingestellten Druck als Eingang („📟 Druckschalter meldet“).', 'pressure_switch_hyd'],
                ['⏲', 'Manometer', 'zeigt den Druck an seinem Anschluss.', 'manometer_hyd'],
                ['📈', 'Messumformer', 'gibt Öltemperatur oder Druck als Zahl an die SPS.', 'analog_sensor']
            ]) +
            p('Öl wird bei Arbeit warm. Wird es zu heiß, verliert es Schmierfähigkeit. Das Beispiel „Ölkühlung mit Regler“ hält die Öltemperatur mit einem PI-Regler über den Ölkühler.') +
            code('kt_hyd_druck', '// Pressen, bis der Druckschalter den Pressdruck meldet\nS1 := START && S_OBEN\nR1 := S_DRUCK_ERREICHT || STOP\nPRESSE_AB := Q1\nPRESSE_AUF := ¬Q1 && ¬S_OBEN') +
            knoepfe(beispiel('analog_oelkuehlung', 'Ölkühlung mit Regler'), zuTutorial('analog', '📈 Zum Tutorial Analogtechnik'))) }
    ]};

    // ------------------------------------------------------------------
    // 7 Analogtechnik
    // ------------------------------------------------------------------
    const analog = { title: 'Analogtechnik', icon: '📈', chapters: [
        { num: 1, title: 'Überblick', content: kap('📈 Analogtechnik', 'Zahlen statt nur 0 und 1',
            p('Ein Analogwert ist eine Zahl: eine Temperatur, ein Druck, ein Weg. VALIS kennt Analogeingänge (Messwerte, Sollwerte) und Analogausgänge (Stellgrößen).') +
            teile([
                ['📈', 'Messumformer', 'misst Öltemperatur, Hydraulikdruck, Zylinderweg oder Füllstand', 'analog_sensor'],
                ['🎛️', 'Sollwertsteller', 'Drehknopf, gibt einen Sollwert w', 'setpoint_pot'],
                ['📟', 'Anzeige', 'Zeiger- oder Balkeninstrument für eine Zahl', 'analog_meter'],
                ['📐', 'Regelstrecke (Modell)', 'P, PT1, PT2 oder I mit Totzeit, zum Üben ohne echte Anlage', 'regelstrecke'],
                ['🧭', 'Drucksensor / 🌬 Durchflusssensor', 'Pneumatik als Analogsignal', 'pressure_sensor_pneu'],
                ['🎚', 'Proportional-Wegeventil', 'Stellgröße 0 … 100 % (0 … 10 V) für einen Zylinder, mit Schläuchen angeschlossen', 'ventil_prop']
            ])) },
        { num: 2, title: 'Signalarten', content: kap('Wie der Wert in die SPS kommt', 'Normiert, Rohwert, Strom, Spannung',
            p('Rechtsklick auf einen Messumformer → <strong>Signal an der SPS</strong>:') +
            tabelle(['Signal', 'in der SPS steht', 'Normieren'], [
                ['Wert in der Einheit', 'schon die Größe, z. B. 45 (°C)', 'nicht nötig'],
                ['S7-Rohwert', '0 … 27648 über den Messbereich', '<code>TEMP := ROH * 100 / 27648</code>'],
                ['Strom 4 … 20 mA', '4 bei Anfang, 20 bei Ende', '<code>TEMP := (I_MA - 4) * 100 / 16</code>'],
                ['Spannung 0 … 10 V', '0 bei Anfang, 10 bei Ende', '<code>TEMP := U_V * 10</code>']
            ]) +
            p('Die Beispiele gelten für einen Messbereich 0 … 100 °C. Den Bereich stellst du im Rechtsklick ein (Messbereichsanfang, Messbereichsende).') +
            info('🔧 Fehler „Drahtbruch (0 mA)“: Bei 4 … 20 mA erkennt die SPS den Bruch, weil unter 4 mA kein gültiger Wert liegt. Genau dafür gibt es den „lebenden Nullpunkt“.') +
            code('kt_ana_norm', '// Rohwert normieren und Drahtbruch erkennen (Messbereich 0 … 100 °C, 4 … 20 mA)\nTEMP := (I_MA - 4) * 100 / 16\nFUEHLERFEHLER := I_MA < 3.6\nWARNLEUCHTE := FUEHLERFEHLER')) },
        { num: 3, title: 'Vergleichen', content: kap('Grenzwerte und Zweipunktglied', 'Aus einer Zahl ein Bit machen',
            p('Vergleiche wie <code>&gt;</code>, <code>&lt;</code> liefern ein Bit. Damit ein Wert, der um die Grenze zittert, nicht ständig schaltet, nimmt man ein <strong>Zweipunktglied mit Hysterese</strong>.') +
            formel('ZWEIPUNKT(Istwert, einschalten über, ausschalten unter)') +
            code('kt_ana_zweipunkt', '// Übertemperatur: ein über 55 °C, aus unter 50 °C\nUEBERTEMP := ZWEIPUNKT(OELTEMP, 55, 50)\nLUEFTER := UEBERTEMP\n// einfacher Vergleich ohne Hysterese\nZU_KALT := OELTEMP < 20') +
            tipp('Im Oszilloskop siehst du die Hysterese: Der Ausgang schaltet bei 55 °C ein, aber erst bei 50 °C wieder aus.') +
            knoepfe(knopf('📊 Oszilloskop öffnen', "KompTut.oeffne('oszi')"))) },
        { num: 4, title: 'Regeln mit PID', content: kap('Regeln mit dem PID-Baustein', 'Sollwert, Istwert, Stellgröße',
            formel('Stellgröße := PID(Sollwert, Istwert, KP, TN, TV)') +
            p('KP ist die Verstärkung, TN die Nachstellzeit (I-Anteil) und TV die Vorhaltzeit (D-Anteil), beide in Sekunden. TN = 0 heißt ohne I-Anteil, TV = 0 ohne D-Anteil. Ein sechster Wert <code>KUEHLEN</code> dreht die Wirkrichtung um: zu warm → Ventil weiter auf, z. B. <code>VENTIL := PID(SOLLT, OELTEMP, 8, 600, 0, KUEHLEN)</code>.') +
            code('kt_ana_pid', '// PI-Regler hält die Strecke auf dem Sollwert\nY := PID(SOLLWERT, ISTWERT, 2, 20, 0)') +
            schritte([
                'Eine <strong>Regelstrecke</strong> einsetzen: Eingang ist <code>Y</code> (0 … 100 %), Ausgang <code>ISTWERT</code>.',
                'Einen <strong>Sollwertsteller</strong> für <code>SOLLWERT</code> einsetzen.',
                'Simulation starten, Doppelklick auf den PID im Logikplan öffnet das <strong>Reglerfenster</strong> mit Hand/Automatik und Live-Werten.'
            ]) +
                        knoepfe(knopf('➕ Regelstrecke einsetzen', "KompTut.einsetzen('regelstrecke')"), beispiel('analog_oelkuehlung', 'Ölkühlung mit Regler')) +
            info('Die Lektion F3 „Regeln mit der SPS“ führt Schritt für Schritt durch Zweipunkt- und PID-Regler.')) }
    ]};

    // ------------------------------------------------------------------
    // 8 Handling
    // ------------------------------------------------------------------
    const handling = { title: 'Handling', icon: '🏗️', chapters: [
        { num: 1, title: 'Überblick', content: kap('🏗️ Handling', 'Werkstücke greifen und umsetzen',
            p('Alle Handhabungsgeräte liegen im Menü <strong>⚙️ Aktoren ▼</strong> unter <strong>Handling</strong>.') +
            teile([
                ['🏗️', 'Portalkran', 'fährt in X und Y, greift mit Vakuum (nur Seitenansicht)', 'portal_crane'],
                ['🦾', '2D-Roboterarm (SCARA)', 'zwei Gelenkachsen, von Hand oder auf einem Pfad (nur Draufsicht)', 'robot_arm_2d'],
                ['👷', 'Humanoider Roboter', 'Mensch von oben: läuft Pfade ab und greift (nur Draufsicht)', 'worker_2d']
            ]) +
            p('Dazu kommen die Greifer unter 🧩 Anbauteile, die du an einen Zylinder montierst.') +
            knoepfe(zuTutorial('anbauteile', '🧩 Zum Tutorial Anbauteile'))) },
        { num: 2, title: 'Portalkran', content: kap('Der Portalkran', 'Achsen einzeln ansteuern',
            p('Beim Einsetzen fragt der Kran drei Ausgänge ab: <strong>X+</strong> (nach rechts), <strong>Y+</strong> (nach unten) und <strong>Greifen</strong> (Vakuum). Im Rechtsklick kommen dazu:') +
            tabelle(['Bereich', 'Variablen'], [
                ['🔀 Achsen &amp; Greifer', 'X+, X−, Y+, Y−, Vakuum'],
                ['⚡ Steuerung', 'Motor Fahrwerk, Motor Hubwerk, Automodus, Normalmodus, Schleichgang, Wind'],
                ['📡 Sensoren', 'Hub oben, Hub unten, Wind aktiv, Last pendelt']
            ]) +
            code('kt_hand_kran', '// Achsverriegelung: nie gleichzeitig rechts und links\nKRAN_RECHTS := T_RECHTS && ¬T_LINKS\nKRAN_LINKS := T_LINKS && ¬T_RECHTS\n// Seitlich fahren nur mit oben stehendem Haken\nKRAN_RECHTS_FREI := KRAN_RECHTS && S_HUB_OBEN\nKRAN_AB := T_AB\nKRAN_AUF := T_AUF\nSAUGER := T_GREIFEN') +
            tipp('Das Beispiel „Portalkran“ steuert den Kran mit WASD und Leertaste und zeigt die Achsverriegelung.') +
            knoepfe(beispiel('portal_crane', 'Portalkran'), knopf('➕ Portalkran einsetzen', "KompTut.einsetzen('portal_crane')"))) },
        { num: 3, title: 'Roboter', content: kap('Roboterarm und humanoider Roboter', 'Eigenes Tutorial „Roboter“',
            p('Der <strong>2D-Roboterarm (SCARA)</strong> und der <strong>humanoide Roboter</strong> arbeiten in der Draufsicht. Beide fährst du von Hand über die SPS oder lässt sie einen Pfad abfahren, auf dem sie greifen, warten und der SPS etwas melden.') +
            p('Das alles steht ausführlich im Tutorial <strong>🦾 Roboter</strong>: Arbeitsraum, Pfad-Editor, Wegpunkt-Aktionen, Handshake mit der SPS, mehrere Pfade, Mensch am Lichtgitter, mit zwei Beispielanlagen.') +
            knoepfe(zuTutorial('roboter', '🦾 Zum Tutorial Roboter'), knopf('➕ Roboterarm einsetzen', "KompTut.einsetzen('robot_arm_2d')"), knopf('➕ Humanoiden Roboter einsetzen', "KompTut.einsetzen('worker_2d')"))) }
    ]};

    // ------------------------------------------------------------------
    // 8b Roboter: 2D-Roboterarm (SCARA) und humanoider Roboter
    // ------------------------------------------------------------------
    const roboter = { title: 'Roboter', icon: '🦾', chapters: [
        { num: 1, title: 'Überblick', content: kap('🦾 Roboter', 'Roboterarm und humanoider Roboter',
            p('Beide Roboter liegen im Menü <strong>⚙️ Aktoren ▼</strong> unter <strong>Handling</strong> und arbeiten nur in der <strong>Draufsicht</strong>. Stell dafür die Anlage oben auf <strong>Global: Draufsicht</strong> oder lege eine <strong>Zone (Draufsicht)</strong> an.') +
            teile([
                ['🦾', '2D-Roboterarm (SCARA)', 'Sockel mit zwei Gelenkarmen und Greifer. Erreicht nur Punkte in seinem <strong>Arbeitsraum</strong>.', 'robot_arm_2d'],
                ['👷', 'Humanoider Roboter', 'Mensch von oben. Läuft frei durch die Anlage, dreht sich in Laufrichtung und trägt Teile.', 'worker_2d']
            ]) +
            tabelle(['', 'Roboterarm', 'Humanoider Roboter'], [
                ['Bewegung', 'Greifer im Kreis um den Sockel', 'überall hin, ohne Grenze'],
                ['Greifen', 'Teil im Umkreis von 35 px um den Greifer', 'Teil im Umkreis von 40 px um den Körper'],
                ['Einstellen', 'Armlängen, Pfadgeschwindigkeit', 'Laufgeschwindigkeit, Helmfarbe'],
                ['Erkannt von', '–', 'Lichtgitter (Körperfeld 30 × 30 px)']
            ]) +
            p('Beide kennen dieselben zwei Betriebsarten: <strong>Tippen</strong> über SPS-Ausgänge und <strong>Pfadverfolgung</strong> mit Wegpunkten. Alles, was in diesem Tutorial über Pfade steht, gilt für beide.') +
            knoepfe(beispiel('roboter_handshake', 'Roboterarm am Band'), beispiel('mensch_lichtgitter', 'Mensch am Lichtgitter'))) },
        { num: 2, title: 'Arbeitsraum', content: kap('Der Arbeitsraum des Roboterarms', 'Was der Greifer erreicht',
            p('Der Arm hat zwei Glieder: <strong>Arm 1</strong> (80 px) am Sockel und <strong>Arm 2</strong> (60 px) mit dem Greifer. Beide Längen stellst du im Rechtsklick unter <strong>📏 Arm 1 / Arm 2 Länge</strong> ein.') +
            formel('Reichweite außen = Arm 1 + Arm 2 &nbsp;&nbsp;|&nbsp;&nbsp; toter Bereich innen = |Arm 1 − Arm 2|') +
            p('Der gestrichelte blaue Kreis um den Sockel zeigt die Reichweite. Mit den Grundwerten erreicht der Greifer alles zwischen 20 px und 140 px vom Sockel. Ein Punkt außerhalb wird an den Rand gezogen, auch beim Setzen und Aufzeichnen im Pfad-Editor.') +
            h3('Richtungen') +
            tabelle(['Achse', 'Richtung auf dem Bildschirm'], [
                ['X+', 'nach rechts'], ['X−', 'nach links'], ['Y+', '<strong>nach unten</strong>'], ['Y−', 'nach oben']
            ]) +
            info('Y+ zeigt nach unten, wie beim Portalkran: Der Bildschirm zählt von oben nach unten.') +
            p('Der Greifer ist offen <strong>grün</strong> und geschlossen <strong>rot</strong>. Er nimmt das nächste Teil, das höchstens 35 px entfernt liegt. Lässt er los, gilt für das Teil wieder die Schwerkraft der Zone.') +
            tipp('Stell den Sockel so, dass Abholpunkt und Ablage beide im Kreis liegen, aber nicht im toten Bereich am Sockel.')) },
        { num: 3, title: 'Tippen', content: kap('Tippen über die SPS', 'Betriebsart 1: von Hand',
            p('Im Rechtsklick unter <strong>🦾 Achsen-Variablen</strong> wählst du für X+, X−, Y+, Y− und den Greifer je einen SPS-Ausgang. Solange ein Achsausgang 1 ist, fährt der Greifer in diese Richtung, mit der Geschwindigkeit aus <strong>⚡ Pfadgeschwindigkeit</strong> (Pixel je Bild). Am Rand des Arbeitsraums bleibt er stehen.') +
            code('kt_rob_tippen', '// Achsverriegelung: nie zwei Richtungen gleichzeitig\nARM_RECHTS := T_RECHTS && ¬T_LINKS\nARM_LINKS := T_LINKS && ¬T_RECHTS\nARM_RUNTER := T_RUNTER && ¬T_RAUF\nARM_RAUF := T_RAUF && ¬T_RUNTER\n// Greifer mit Schalter: 1 = zu\nGREIFER := S_GREIFER') +
            schritte([
                'Code einfügen, Roboterarm einsetzen.',
                'Rechtsklick auf den Arm: X+ = <code>ARM_RECHTS</code>, X− = <code>ARM_LINKS</code>, Y+ = <code>ARM_RUNTER</code>, Y− = <code>ARM_RAUF</code>, Greifer = <code>GREIFER</code>.',
                'Im Sim-Panel bei jedem Taster mit <strong>⌨️</strong> eine Taste belegen (z. B. WASD), dann fährt der Arm wie mit einem Joystick.'
            ]) +
            info('Der humanoide Roboter hat dieselben fünf Variablen, heißt dort nur „Laufen rechts/links/nach unten/nach oben“ und „Greifen / Halten“.') +
            knoepfe(knopf('➕ Roboterarm einsetzen', "KompTut.einsetzen('robot_arm_2d')"))) },
        { num: 4, title: 'Pfad zeichnen', content: kap('Einen Pfad zeichnen', 'Betriebsart 2: Pfadverfolgung',
            p('Statt jede Achse zu steuern, gibst du dem Roboter einen Weg aus <strong>Wegpunkten</strong>. Die Wegpunkte hängen am Roboter: Verschiebst du ihn, wandert der Pfad mit.') +
            schritte([
                'Rechtsklick auf den Roboter → <strong>✏️ Pfad bearbeiten</strong>. Unten erscheint die blaue Leiste des Pfad-Editors.',
                '<strong>Linksklick</strong> in die Anlage setzt einen Punkt. Einen Punkt <strong>ziehen</strong> verschiebt ihn, <strong>Rechtsklick</strong> auf einen Punkt löscht ihn.',
                'Oder <strong>🔴 Aufzeichnen</strong>: Die Maus fährt vor, alle paar Pixel entsteht ein Punkt.',
                '<strong>Modus</strong>: <em>Linear</em> fährt gerade von Punkt zu Punkt, <em>Spline</em> rundet die Ecken ab.',
                '<strong>Loop</strong>: Nach dem letzten Punkt geht es zurück zum ersten. Ein Klick auf den ersten Punkt schließt den Kreis und beendet den Editor.',
                '<strong>✔ Fertig</strong> speichert. <strong>🗑 Alle Punkte</strong> fängt von vorn an.',
                'Rechtsklick → <strong>▶ Pfadverfolgung aktivieren</strong>.'
            ]) +
            p('Mit <strong>Aktivierung Pfadmodus</strong> wählst du einen Ausgang, ohne den der Roboter steht: Ist er 0, bleibt der Roboter, wo er ist, und fährt bei 1 von dort weiter. Ohne Variable fährt er immer.') +
            info('Im Pfadmodus zählen die Achs-Variablen nicht. Der Greifer-Ausgang gilt weiter, solange kein Wegpunkt selbst greift oder loslässt.')) },
        { num: 5, title: 'Wegpunkt-Schilder', content: kap('Die Schilder über jedem Wegpunkt', 'Greifen, Pause, Tempo, Aktion',
            p('Im Pfad-Editor sitzen über jedem Punkt vier kleine Schilder. Ein Klick schaltet sie weiter:') +
            tabelle(['Schild', 'Was es tut', 'Werte'], [
                ['⚡ Tempo', 'Faktor für die Strecke <strong>zu</strong> diesem Punkt', '1× · 0,25× · 0,5× · 2× · 3× · 5×'],
                ['○ Greifer', '✊ greift hier, 🖐 lässt hier los', 'nichts · greifen · loslassen'],
                ['⏸ Pause', 'bleibt hier stehen', '0 · 0,5 · 1 · 2 · 3 · 5 s'],
                ['⚙ Aktion', 'spricht mit der SPS (nächstes Kapitel)', 'Warten · Setzen · Überspringen']
            ]) +
            p('Eine Pause nach dem Greifen gibt dem Greifer Zeit, das Teil sicher zu fassen. Ein langsamer letzter Abschnitt (0,25×) setzt das Teil sanft ab.') +
            h3('Das Statusschild am Roboter') +
            tabelle(['Anzeige', 'Bedeutung'], [
                ['▶ Fährt', 'fährt den Pfad ab'], ['✊ Greift', 'hält ein Teil'], ['⏸ Pause', 'steht an einem Wegpunkt mit Pause'],
                ['⏳ Warte', 'wartet auf eine Variable'], ['→ Transit', 'wechselt zum nächsten Pfad (Mehrpfad, Übergang linear)']
            ])) },
        { num: 6, title: 'Handshake mit der SPS', content: kap('Handshake: Roboter und SPS', 'Freigabe hin, Fertigmeldung zurück',
            p('In einer echten Anlage sprechen Roboter und SPS über Signale: Die SPS gibt <strong>frei</strong>, der Roboter meldet <strong>fertig</strong>. Das baust du mit dem Schild <strong>⚙ Aktion</strong> am Wegpunkt:') +
            tabelle(['Aktion', 'Was der Roboter tut', 'Typische Variable'], [
                ['⏳ Warten bis Variable', 'bleibt am Punkt stehen, bis die Variable 1 ist', 'SPS-Ausgang <code>FREIGABE</code> oder ein Sensor'],
                ['📤 Variable setzen', 'schreibt beim Ankommen 1 (TRUE) oder 0 (FALSE)', 'SPS-Eingang <code>ROBO_FERTIG</code>'],
                ['⏭ Überspringen wenn', 'ist die Variable 1, geht er gleich zum nächsten Punkt weiter', 'z. B. <code>KEIN_TEIL</code>']
            ]) +
            warn('„Variable setzen“ schreibt nur einmal beim Ankommen. Nimm dafür eine Variable, die die SPS nur <strong>liest</strong> (rechts vom :=). Steht sie links vom :=, überschreibt die SPS sie im nächsten Zyklus sofort wieder.') +
            code('kt_rob_handshake', 'S1 := START && ¬STOP\nR1 := STOP\n// Band läuft, bis ein Teil an der Lichtschranke steht\nBAND := Q1 && ¬TEIL_DA\n// SPS → Roboter: Teil liegt bereit\nFREIGABE := Q1 && TEIL_DA\n// Roboter → SPS: setzt der Roboter selbst\nLED_ABGELEGT := ROBO_FERTIG') +
            h3('Der Pfad dazu') +
            tabelle(['Punkt', 'Ort', 'Schilder'], [
                ['1', 'Grundstellung', '⚙ Warten bis <code>FREIGABE</code>'],
                ['2', 'Abholpunkt am Bandende', '✊ greifen, ⏸ 0,5 s, ⚙ <code>ROBO_FERTIG</code> = FALSE'],
                ['3', 'zurück über die Grundstellung', '–'],
                ['4', 'Ablage', '🖐 loslassen, ⚙ <code>ROBO_FERTIG</code> = TRUE']
            ]) +
            p('Mit <strong>Loop</strong> geht es danach zurück zu Punkt 1. Ein „Warten“ am ersten Punkt gilt schon beim Start: Der Roboter bleibt in Grundstellung, bis die SPS ihn freigibt.') +
            knoepfe(beispiel('roboter_handshake', 'Roboterarm am Band'))) },
        { num: 7, title: 'Mehrere Pfade', content: kap('Mehrere Pfade', 'Mehrpfad-Modus',
            p('Rechtsklick → <strong>⬆ Mehrpfad-Modus aktivieren</strong>. Ein vorhandener Pfad wird zu „Pfad 1“. Mit <strong>➕ Pfad hinzufügen</strong> kommen weitere dazu, jeder in einer eigenen Farbe, mit Namen, eigenem ✏️ und 🗑.') +
            tabelle(['Einstellung', 'Bedeutung'], [
                ['Aktivierung je Pfad', '<em>-- immer --</em> oder ein Ausgang. Nur Pfade, deren Variable 1 ist (und die mindestens zwei Punkte haben), fährt der Roboter.'],
                ['🔀 Reihenfolge', '▶ Hintereinander · ◀ Umgekehrt · ↔ Pendeln · 🎲 Zufällig'],
                ['🔗 Übergang', '⚡ Springen: sofort zum Anfang des nächsten Pfads · ➡ Linear: dorthin fahren'],
                ['🔢 Zykluszähler', 'zählt jeden fertig abgefahrenen Pfad in eine Variable (geht auch im Einpfad-Modus)'],
                ['📋 Pfade kopieren / einfügen', 'überträgt alle Pfade auf einen anderen Roboter']
            ]) +
            p('So steuert die SPS, <strong>welchen</strong> Weg der Roboter nimmt: Gutteil-Pfad aktiv, wenn <code>GUT</code> = 1, Schlechtteil-Pfad, wenn <code>SCHLECHT</code> = 1.') +
            code('kt_rob_zaehler', '// Zykluszähler des Roboters steht in ZYKLEN (Eingang der SPS)\n// Nach 10 Teilen ist der Behälter voll\nBEHAELTER_VOLL := ZYKLEN > 9\nBAND := Q1 && ¬BEHAELTER_VOLL') +
            info('⬇ Einpfad-Modus (zurück) übernimmt Pfad 1 als einzigen Pfad.')) },
        { num: 8, title: 'Humanoider Roboter', content: kap('Der humanoide Roboter', 'Ein Mensch in der Anlage',
            p('Der humanoide Roboter kann alles aus den Kapiteln 3 bis 7: Tippen, Pfad, Schilder, Handshake, Mehrpfad. Dazu kommt:') +
            schritte([
                '<strong>Keine Reichweite</strong>: Er läuft überall hin. Er dreht sich in Laufrichtung, ein Drehgriff entfällt.',
                '<strong>🪖 Helmfarbe</strong> und <strong>⚡ Laufgeschwindigkeit</strong> im Rechtsklick.',
                'Er greift Teile im Umkreis von 40 px und trägt sie sichtbar vor sich her.',
                'Sein Körper ist für das <strong>Lichtgitter</strong> ein Feld von 30 × 30 px: Läuft er hinein, meldet das Gitter 0.'
            ]) +
            p('Damit zeigst du, wie eine Anlage einen Menschen schützt. Das Lichtgitter ist ein Öffner: <code>LICHTGITTER</code> = 1 heißt „Feld frei“.') +
            code('kt_rob_mensch', '// Lichtgitter mit Wiederanlaufsperre\nS1 := START && ¬STOP && LICHTGITTER\nR1 := STOP || ¬LICHTGITTER\nBAND := Q1\nLED_GESPERRT := ¬LICHTGITTER') +
            warn('Nach dem Verlassen des Schutzfelds darf das Band nicht von selbst anlaufen. Erst ein neuer START-Befehl gibt es frei (Wiederanlaufsperre).') +
            knoepfe(beispiel('mensch_lichtgitter', 'Mensch am Lichtgitter'), knopf('➕ Humanoiden Roboter einsetzen', "KompTut.einsetzen('worker_2d')"), zuTutorial('sicherheit', '🚨 Zum Tutorial Sicherheitstechnik'))) },
        { num: 9, title: 'Übungen', content: kap('Übungen', 'Selbst bauen',
            p('Lade das Beispiel „Roboterarm am Band“ und baue es aus:') +
            schritte([
                '<strong>Grundstellung melden</strong>: Setze am ersten Punkt <code>ROBO_GS</code> = TRUE und am Abholpunkt FALSE. Lass das Band nur laufen, wenn der Roboter in Grundstellung ist.',
                '<strong>Zwei Ablagen</strong>: Stelle den Mehrpfad-Modus ein. Pfad 1 legt links ab, Pfad 2 rechts. Ein Schalter <code>WAHL</code> entscheidet, welcher Pfad aktiv ist.',
                '<strong>Behälter voll</strong>: Zähle mit dem Zykluszähler. Nach 5 Teilen stoppt das Band, bis du quittierst.',
                '<strong>Mensch und Roboter</strong>: Stelle ein Lichtgitter vor den Arbeitsraum des Arms. Läuft der humanoide Roboter hinein, nimmt die SPS die <code>FREIGABE</code> weg.'
            ]) +
            tipp('Teste jeden Schritt mit dem Statusschild am Roboter: Steht dort „⏳ Warte“, fehlt ihm eine Freigabe.') +
            knoepfe(beispiel('roboter_handshake', 'Roboterarm am Band'))) }
    ]};

    // ------------------------------------------------------------------
    // 9 Anbauteile und Werkzeuge
    // ------------------------------------------------------------------
    const anbauteile = { title: 'Anbauteile und Werkzeuge', icon: '🧩', chapters: [
        { num: 1, title: 'Überblick', content: kap('🧩 Anbauteile und Werkzeuge', 'Was vorne an den Zylinder kommt',
            p('Anbauteile liegen im Menü <strong>⚙️ Aktoren ▼</strong> unter <strong>🧩 Anbauteile</strong>. Einzeln liegen sie einfach in der Anlage. Montiert auf einen Zylinder, fahren sie mit dem Kolben.') +
            teile([
                ['🧲', 'L-Schieber', 'winkelförmig, schiebt Teile vom Band. Blechdicke einstellbar.', 'pusher'],
                ['💥', 'Pressstempel', 'massiver Block zum Stanzen und Pressen', 'press'],
                ['🪛', 'Bohrspindel', 'dreht sich, solange ihr Ausgang 1 ist', 'bohrspindel'],
                ['🔴', 'Sauggreifer', 'hält Teile durch Vakuum, solange der Ausgang 1 ist', 'vacuum_gripper'],
                ['🤏', 'Pneumatikgreifer', 'zwei Backen, Ausgang 1 = schließen', 'pneumatic_gripper'],
                ['🚪', 'Schutztür', 'Alu-Glas-Wand, als Tür auf einem Zylinder', 'window']
            ])) },
        { num: 2, title: 'Montieren', content: kap('An den Kolben montieren', 'So fährt das Werkzeug mit',
            schritte([
                'Zylinder einsetzen.',
                'Anbauteil einsetzen und in die Nähe der Kolbenstange ziehen.',
                'Rechtsklick auf das Anbauteil → <strong>🔗 An Kolben montieren</strong>.',
                'Zum Lösen: Rechtsklick → <strong>🔗 Vom Kolben lösen</strong>.'
            ]) +
            tipp('Montierte Teile werden von Sensoren und vom Lichtgitter erkannt. So fragst du z. B. ab, ob der Stempel oben ist.') +
            knoepfe(zuTutorial('zylinder', '🔩 Zum Zylinder-Tutorial (Kapitel Anbauteile)'))) },
        { num: 3, title: 'Bohren & Pressen', content: kap('Bohrstation und Prägestation', 'Werkzeug ab, arbeiten, Werkzeug auf',
            code('kt_anb_bohren', '// Bohrspindel läuft, Zylinder senkt sie ab, bis unten erreicht\nS1 := START && S_TEIL && S_OBEN\nR1 := S_UNTEN\nSPINDEL := Q1 || ¬S_OBEN\nBOHRER_AB := Q1\nBOHRER_AUF := ¬Q1') +
            p('Die Spindel läuft schon beim Absenken und noch beim Hochfahren, bis der obere Sensor meldet. So bricht kein Bohrer ab.') +
            tipp('Bohrstation und Prägestation gibt es als fertige Übungsanlagen mit Aufgaben in drei Stufen.') +
            knoepfe(knopf('🏭 Übungsanlagen öffnen', "KompTut.oeffne('uebungsanlagen')"))) },
        { num: 4, title: 'Greifen', content: kap('Greifen mit Vakuum oder Backen', 'Sauggreifer und Pneumatikgreifer',
            p('Ein <strong>Sauggreifer</strong> hält glatte, flache Teile. Ein <strong>Pneumatikgreifer</strong> fasst mit zwei Backen und hält auch schwere oder unebene Teile.') +
            code('kt_anb_greifen', '// Teil ansaugen, heben, Vakuum erst über der Ablage lösen\nS1 := START && S_TEIL\nR1 := S_ABLAGE\nVAKUUM := Q1\nHEBEN := Q1 && S_UNTEN') +
            knoepfe(knopf('➕ Sauggreifer einsetzen', "KompTut.einsetzen('vacuum_gripper')"), knopf('➕ Pneumatikgreifer einsetzen', "KompTut.einsetzen('pneumatic_gripper')"))) }
    ]};

    // ------------------------------------------------------------------
    // 10 Flüssigkeiten und Schüttgut
    // ------------------------------------------------------------------
    const fluessig = { title: 'Flüssigkeiten und Schüttgut', icon: '💧', chapters: [
        { num: 1, title: 'Überblick', content: kap('💧 Flüssigkeiten und Schüttgut', 'Abfüllen, Dosieren, Mischen',
            p('Neben festen Werkstücken kennt VALIS Flüssigkeiten (Wasser, Öl, Kühlmittel …) und Schüttgut (Sand, Körner). Die Teile liegen im Menü <strong>📦 Materialien ▼</strong>, Behälter unter <strong>🏗️ Struktur ▼ → 🪣 Behälter</strong>.') +
            teile([
                ['💧', 'Spawner (Flüssigkeit)', 'gibt im Takt Flüssigkeit ab, Art wählbar', 'spawner_fluid'],
                ['🏖️', 'Spawner (Sand/Körner)', 'schüttet Schüttgut im Takt', 'spawner_sand'],
                ['🔩', 'Auslass (Flüssigkeit)', 'Öffnung, die bei 1 Flüssigkeit durchlässt; Durchfluss einstellbar', 'fluid_outlet'],
                ['⏬', 'Auslass (Sand/Körner)', 'Öffnung für Schüttgut', 'sand_outlet'],
                ['⚙️', 'Flüssigkeitspumpe', 'pumpt von Anschluss S nach P; Druck, Fördervolumen, Leckage', 'pump_fluid'],
                ['🏗️', 'Silo', 'Behälter mit Trichter für Sand und Flüssigkeit', 'silo'],
                ['🪣', 'U-Behälter', 'oben offene Wanne', 'u_container']
            ])) },
        { num: 2, title: 'Behälter füllen', content: kap('Flaschen, Fässer, Kartons', 'Gefüllt wird von oben',
            teile([
                ['🍾', 'Flasche', 'füllt sich durch Tropfen von oben. Kapazität im Rechtsklick, „🚮 Flasche leeren“.', 'bottle'],
                ['🛢️', 'Fass / Tonne', 'wie die Flasche, mit größerer Kapazität', 'barrel'],
                ['📦', 'Karton', 'sammelt feste Werkstücke, Kapazität in Stück', 'box'],
                ['📏', 'Füllstandssensor', 'in einen Behälter setzen: meldet bei einer Position oder einem festen Schwellwert in %', 'bottle_sensor']
            ]) +
            p('Mit dem Spawner für Spezialobjekte lässt du leere Flaschen im Takt nachkommen: Flasche auf den Spawner legen, „📥 Template erfassen“.') +
            code('kt_fl_abfuellen', '// Flasche unter dem Auslass: füllen, bis voll\nS1 := S_FLASCHE_DA && ¬S_VOLL\nR1 := S_VOLL\nVENTIL_AUF := Q1\nBAND := ¬Q1') +
            tipp('Die Übungsanlage „Abfüllstation“ zeigt das mit Aufgaben in drei Stufen.') +
            knoepfe(knopf('🏭 Übungsanlagen öffnen', "KompTut.oeffne('uebungsanlagen')"))) },
        { num: 3, title: 'Wärme & Gießen', content: kap('Heizen, Kühlen, Gießen', 'Heizelement, Lüfter, Gussform',
            teile([
                ['♨️', 'Heizelement', 'erhitzt Teile, die darauf liegen. Bit = voll, Zahl = Heizleistung 0 … 100 %. Rechtsklick: Heizleistung (°C/s).', 'heater'],
                ['🌀', 'Lüfter / Gebläse', 'dreht sich, wenn aktiv; Anlaufzeit einstellbar.', 'fan'],
                ['🛠️', 'Form (Gussform)', 'füllt sich mit Schmelze. Ab 60 % Füllung „🔓 Form öffnen“: Es entsteht ein Werkstück.', 'mold']
            ]) +
            p('Achtung: <code>HEIZEN</code> und <code>KUEHLEN</code> sind Schlüsselwörter (Wirkrichtung der Regler) und taugen nicht als Variablennamen.') +
            p('Erreicht ein Werkstück auf dem Heizelement seinen <strong>Schmelzpunkt</strong> (beim Spawner einstellbar), schmilzt es und fließt als Schmelze ab, z. B. in eine Gussform.') +
            code('kt_fl_ofen', '// Ofen 10 s heizen, danach 5 s nachlüften\nS1 := START\nR1 := FERTIG\nOFEN_AN := Q1\nFERTIG := TON(Q1, 10)\nNACHLAUF := TOF(Q1, 5)\nLUEFTER := NACHLAUF && ¬Q1')) }
    ]};

    // ------------------------------------------------------------------
    // 11 Inspektionskamera
    // ------------------------------------------------------------------
    const kamera = { title: 'Inspektionskamera', icon: '📷', chapters: [
        { num: 1, title: 'Prüfen mit der Kamera', content: kap('📷 Inspektionskamera', 'Gut- und Schlechtteile trennen',
            p('Die Kamera liegt im Menü <strong>📡 Sensoren ▼</strong>. Sie liest das Qualitätsmerkmal, das der <strong>Spawner</strong> jedem Werkstück mitgibt, und meldet es als Eingang: <strong>1 = OK</strong>.') +
            schritte([
                'Beim Spawner den <strong>Qualitätsmodus</strong> wählen: Immer OK, Immer NOK, Zufällig (80 % OK) oder Jedes 3. NOK.',
                'Kamera über das Band setzen und ihr die Variable geben (z. B. <code>S_OK</code>).',
                'Davor einen Sensor, der meldet, dass überhaupt ein Teil unter der Kamera liegt.'
            ]) +
            code('kt_kam_sortieren', '// Schlechtteile ausschleusen\nTEIL_DA := S_TEIL\nNOK := TEIL_DA && ¬S_OK\nWEICHE := NOK\nZAEHLER_NOK := CTU(NOK, RESET, 100)') +
            info('Die Kamera allein unterscheidet nicht „kein Teil“ und „Schlechtteil“: Beides gibt 0. Deshalb gehört ein zweiter Sensor dazu.') +
            knoepfe(knopf('➕ Kamera einsetzen', "KompTut.einsetzen('inspection_camera')"), knopf('➕ Spawner (Metall) einsetzen', "KompTut.einsetzen('spawner_metall')"))) },
        { num: 2, title: 'Werkstückhalterung', content: kap('Werkstückhalterung', 'Liegt das Teil richtig?',
            p('Die Werkstückhalterung (Menü 🏗️ Struktur → Halterungen) hat einen optischen Sensor eingebaut. Sie erkennt ein aufgelegtes Teil, auf Wunsch nur, wenn es <strong>mittig</strong> liegt. Eine Vibration kann Aussetzer erzeugen, etwa zum Üben einer Entprellung.') +
            code('kt_kam_halter', '// Spannen erst, wenn das Teil 0,5 s ruhig erkannt wird\nTEIL_SICHER := TON(S_TEIL, 0.5)\nSPANNEN := TEIL_SICHER && START') +
            knoepfe(knopf('➕ Werkstückhalterung einsetzen', "KompTut.einsetzen('part_holder')"))) }
    ]};

    // ------------------------------------------------------------------
    // 12 Struktur
    // ------------------------------------------------------------------
    const struktur = { title: 'Aufbau und Struktur', icon: '🧱', chapters: [
        { num: 1, title: 'Wände & Böden', content: kap('🧱 Aufbau und Struktur', 'Die Anlage räumlich begrenzen',
            p('Strukturteile haben keine Variable. Sie geben der Anlage Form: Werkstücke prallen an ihnen ab oder liegen auf ihnen.') +
            teile([
                ['🧱', 'Ziegelwand', 'massive Wand, in der Größe ziehbar', 'wall'],
                ['⛓️', 'Metallrahmen / Boden', 'Boden oder Gestell, auf dem Teile liegen', 'frame'],
                ['🪵', 'Holzoberfläche', 'Dielen-Optik für Boden oder Wand', 'holzflaeche'],
                ['🚧', 'Zaun', 'Metallzaun als Abgrenzung (mit Kollision)', 'zaun'],
                ['📦', 'Palette', 'Holzpalette als Ablage (Draufsicht)', 'palette']
            ]) +
            p('Im Rechtsklick schaltest du die <strong>Kollision</strong> (massiv oder Geist) und bei Werkstücken die <strong>Gravitation</strong>.')) },
        { num: 2, title: 'Zonen', content: kap('Zonen', 'Seitenansicht und Draufsicht in einer Anlage',
            p('Eine Zone legt fest, wie ein Bereich der Anlage gesehen wird. In einer <strong>Zone (Seitenansicht)</strong> fallen Teile nach unten, in einer <strong>Zone (Draufsicht)</strong> gleiten sie über die Bänder.') +
            teile([
                ['🌍', 'Zone (Seitenansicht)', 'Bereich mit Schwerkraft', 'zone_side'],
                ['🛸', 'Zone (Draufsicht)', 'Bereich von oben gesehen', 'zone_top']
            ]) +
            p('So baust du z. B. ein Förderband in Draufsicht, das in eine Abfüllstation in Seitenansicht übergibt.')) },
        { num: 3, title: 'Ordnen', content: kap('Ordnung in großen Anlagen', 'Ebenen, Gruppen, Namensschilder',
            schritte([
                '<strong>Ebenen</strong> (Seitenleiste ganz unten): Teile einer Ebene zuweisen und Ebenen ein- oder ausblenden.',
                '<strong>Gruppen</strong>: mehrere Teile markieren und gemeinsam verschieben; „💥 Gruppe auflösen“ im Rechtsklick.',
                '<strong>Namensschild</strong>: „📌 anpinnen“ oder „👁️ verbergen“ im Rechtsklick.',
                '<strong>📚 Bausteine</strong> (Seitenleiste, Werkzeuge): fertige Anlagenteile wie Förderstrecken oder Pulte einfügen.'
            ]) +
            tipp('Ein Bedienpult-Rahmen hält Taster und Leuchten zusammen. Mehr dazu im Tutorial Bedien- und Meldegeräte.') +
            knoepfe(zuTutorial('bedienen', '🎛️ Zum Tutorial Bedien- und Meldegeräte'))) }
    ]};

    // ------------------------------------------------------------------
    // Eintragen
    // ------------------------------------------------------------------
    const NEU = { pneumatik, bedienen, foerdern, messen, sicherheit, hydraulik, analog, handling, roboter, anbauteile, fluessig, kamera, struktur };
    Object.keys(NEU).forEach(k => { window._tutData[k] = NEU[k]; });

    const alt = {};
    window._tutIndex.forEach(c => (c.entries || []).forEach(e => { alt[e.key] = e; }));
    const E = (key, desc) => alt[key] || { key, icon: NEU[key].icon, title: NEU[key].title, desc };
    window._tutIndex = [
        { cat: 'Bedienen und Melden', entries: [
            E('bedienen', 'Taster, Schalter, Not-Halt, Leuchten, Signal-Säule, Sirene, Anzeigen')
        ]},
        { cat: 'Sensorik', entries: [
            alt.sensor_ber || { key: 'sensor_ber', icon: '📡', title: 'Berühr. Sensoren', desc: '' }
        ]},
        { cat: 'Fördertechnik und Werkstücke', entries: [
            E('foerdern', 'Spawner, Förderband, Weiche, Lifte, Werkstückträger, Rundtakttisch')
        ]},
        { cat: 'Aktoren – Pneumatik', entries: [
            alt.zylinder || { key: 'zylinder', icon: '🔩', title: 'Zylinder', desc: '' },
            E('pneumatik', 'Kompressor, Wartungseinheit, Ventile, Drosseln, Schläuche, Fluidplan')
        ]},
        { cat: 'Aktoren – Hydraulik', entries: [
            E('hydraulik', 'Aggregat, Tank, 4/3-Ventile, Stromregelventil, Druck und Temperatur')
        ]},
        { cat: 'Handling und Werkzeuge', entries: [
            E('handling', 'Portalkran, Zonen, Ordnung in großen Anlagen'),
            E('roboter', 'SCARA-Roboterarm, humanoider Roboter, Pfade, Handshake mit der SPS'),
            E('anbauteile', 'Schieber, Stempel, Bohrspindel, Greifer, an den Kolben montieren')
        ]},
        { cat: 'Sicherheit', entries: [
            E('sicherheit', 'Not-Halt mit Quittierung, Lichtgitter, Schutztür, Schlüsselschalter')
        ]},
        { cat: 'Analogtechnik und Regeln', entries: [
            E('analog', 'Messumformer, Normieren, 4 … 20 mA, Zweipunkt, PID-Regler')
        ]},
        { cat: 'Messen und Prüfen', entries: [
            E('messen', 'Multimeter, Fehlersuche Elektrik, Oszilloskop, Druck messen'),
            E('kamera', 'OK/NOK prüfen, Schlechtteile ausschleusen, Werkstückhalterung')
        ]},
        { cat: 'Flüssigkeiten und Schüttgut', entries: [
            E('fluessig', 'Flüssigkeit, Sand, Pumpe, Flasche, Füllstand, Heizen, Gießen')
        ]},
        { cat: 'Aufbau und Struktur', entries: [
            E('struktur', 'Wände, Böden, Zonen, Ebenen und Gruppen')
        ]}
    ];

    // Eigene Gestaltung (Knöpfe, Bauteil-Karten, Tabellen) im Stil der Tutorials
    const css = document.createElement('style');
    css.id = 'kt-stil';
    css.textContent = `
        .kt-knoepfe { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 6px; }
        .kt-knopf { background:#1f3a5a; color:#e3f2fd; border:1px solid #2f5b8a; border-radius:5px; padding:6px 12px; font-size:12px; cursor:pointer; }
        .kt-knopf:hover { background:#28507d; border-color:#64b5f6; }
        .kt-knopf.kt-klein { padding:3px 8px; font-size:11px; margin-top:6px; align-self:flex-start; }
        .kt-teile { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:8px; margin:0 0 14px; }
        .kt-teil { background:#1a2230; border:1px solid #2a3a4a; border-radius:6px; padding:10px 12px; display:flex; flex-direction:column; }
        .kt-teil-kopf { display:flex; align-items:center; gap:8px; color:#fff; font-size:12px; margin-bottom:4px; }
        .kt-teil-ic { font-size:17px; }
        .kt-teil-txt { color:#90a4ae; font-size:11.5px; line-height:1.5; flex:1; }
        .kt-teil-txt strong, .kt-teil-txt b { color:#cfd8dc; }
        .kt-tab-wrap { overflow-x:auto; margin:0 0 14px; }
        .kt-tab { width:100%; border-collapse:collapse; font-size:12px; }
        .kt-tab th { background:#1a2230; color:#64b5f6; text-align:left; padding:7px 8px; border:1px solid #2a3a4a; }
        .kt-tab td { color:#cfd8dc; padding:6px 8px; border:1px solid #1e2a38; vertical-align:top; }
        .kt-tab tr:nth-child(odd) td { background:#111827; }
        /* Zeilenumbrüche im Code erhalten (betraf auch die alten Tutorials: alles stand in einer Zeile) */
        #tut-content-area .tut-code { white-space:pre; }
        #tut-content-area code { color:#80cbc4; background:#12121e; padding:1px 5px; border-radius:3px; }
        #tut-content-area kbd { background:#263238; border:1px solid #455a64; border-radius:3px; padding:0 4px; font-size:11px; }
    `;
    document.head.appendChild(css);

    window.KompTut = {
        einsetzen, beispiel: beispielLaden, menue: menueAn, oeffne,
        // für die Prüfung
        _codes: () => Object.assign({}, CODES),
        _neu: () => Object.keys(NEU),
        _typen: () => {
            const t = [];
            Object.keys(NEU).forEach(k => NEU[k].chapters.forEach(c => {
                (c.content.match(/KompTut\.einsetzen\('([a-z_0-9]+)'\)/g) || []).forEach(m => t.push(m.slice(19, -2)));
            }));
            return Array.from(new Set(t));
        },
        _beispiele: () => {
            const t = [];
            Object.keys(NEU).forEach(k => NEU[k].chapters.forEach(c => {
                (c.content.match(/KompTut\.beispiel\('([a-z_0-9]+)'\)/g) || []).forEach(m => t.push(m.slice(18, -2)));
            }));
            return Array.from(new Set(t));
        }
    };
})();
