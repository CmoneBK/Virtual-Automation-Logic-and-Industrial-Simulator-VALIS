/* VALIS – Übungsanlagen
 * ============================================================================
 *
 * Ein Katalog fester Übungsanlagen: Die Hardware steht fertig aufgebaut und
 * verdrahtet da (gesperrt), die Zuordnungsliste liegt fest. Lernende
 * schreiben nur das Programm. Jede Anlage hat drei Aufgaben auf derselben
 * Hardware: einfach, mittel, fordernd – jede mit Musterlösung.
 *
 * Die Aufgaben sind gewöhnliche .valitask-Objekte und laufen über den
 * Aufgaben-Modus (window._startTask). Ihre Erfolgsbedingungen prüfen das
 * VERHALTEN der Anlage, nicht den Programmtext: Ein Rekorder beobachtet
 * während der Aufgabe Eingänge, Ausgänge, Zylinder und Werkstücke und hakt
 * jede Bedingung ab, sobald sie einmal erfüllt war (custom_js ruft
 * Uebungsanlagen.ok(aufgabe, nr)).
 *
 * Oberfläche: Lernzentrum → „🏭 Übungsanlagen“ (Panel hub-panel-uebungsanlagen).
 * Je Anlage eine Karte mit Vorschau, Zuordnungsliste, den drei Aufgaben und
 * einem Link in die Virtuelle Werkstatt (Pneumatik-Raum, Musterlösung in 3D).
 *
 * API (window.Uebungsanlagen):
 *   liste()                 alle Anlagen (Daten)
 *   aufgabe(anlage, stufe)  .valitask-Objekt (stufe 0 einfach, 1 mittel, 2 fordernd)
 *   starten(anlage, stufe)  Aufgabe starten
 *   ok(id, nr)              Erfolgsbedingung nr der Aufgabe id erfüllt?
 *   rendern(el)             Katalog in el zeichnen
 *   rekorder()              Zustand des Rekorders (für Prüfungen)
 *   link3d(anlage, stufe)   Adresse der Musterlösung im 3D-Pneumatik-Raum
 *
 * Prüfung: node pruefungen/uebungsanlagen-pruefung.js (spielt jede
 * Musterlösung durch und prüft, dass die Vorlage allein nicht reicht).
 */
(function () {
  'use strict';
  if (window.Uebungsanlagen) return;

  /* ------------------------------------------------------------------ Hilfen */
  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function g(name) { try { return (0, eval)(name); } catch (e) { return undefined; } }

  var STUFEN = [
    { name: 'einfach', diff: 'leicht', farbe: '#4caf50', loesungNach: 180 },
    { name: 'mittel', diff: 'mittel', farbe: '#ff9800', loesungNach: 300 },
    { name: 'fordernd', diff: 'schwer', farbe: '#f44336', loesungNach: 480 }
  ];

  /* ================================================================ Rekorder
   * Läuft, solange eine Aufgabe dieses Katalogs aktiv ist. Tastet alle 40 ms
   * ab und merkt sich Flanken, Werkstücke, die verschwinden, und Flaschen,
   * die die Anlage verlassen. Die Bedingungen einer Aufgabe sind Funktionen
   * f(R, m) – R ist der Rekorder, m ein eigener Merkzettel der Bedingung.
   * Einmal wahr, bleibt eine Bedingung für diesen Aufgabenlauf erfüllt. */
  var R = null;          // Rekorder des laufenden Aufgabenlaufs
  var KRIT = {};         // Aufgaben-id → [{label, f}]

  function rekorderNeu(task) {
    return {
      task: task, id: task.id, start: g('taskStartTime'),
      t: 0, tWand: Date.now(), s: {}, vor: {}, ev: [], ok: [], m: [],
      teile: [], flaschen: [], items: new Map(), fl: new Map(), zyl: {}
    };
  }
  function abtasten() {
    var task = g('activeTask');
    if (!task || !KRIT[task.id]) { R = null; return; }
    if (!R || R.task !== task || R.start !== g('taskStartTime')) R = rekorderNeu(task);
    var aktiv = !!g('isSimulationActive');
    var jetzt = Date.now();
    if (aktiv) R.t += Math.min(0.2, (jetzt - R.tWand) / 1000);
    R.tWand = jetzt;
    var sps = g('spsState') || {};
    var s = {};
    for (var k in sps) { var v = sps[k]; if (typeof v === 'boolean' || typeof v === 'number') s[k] = v; }
    // Flanken der Variablen (nur 0/1)
    for (var n in s) {
      if (typeof s[n] !== 'boolean' && s[n] !== 0 && s[n] !== 1) continue;
      var neu = !!s[n], alt = R.s[n];
      if (alt !== undefined && !!alt !== neu) {
        R.ev.push({ n: n, v: neu, t: R.t });
        if (R.ev.length > 4000) R.ev.splice(0, 1000);
      }
    }
    R.vor = R.s; R.s = s;
    // Werkstücke: wo verschwinden sie?
    var items = g('factoryItems') || [];
    var da = new Map();
    items.forEach(function (it) { da.set(it, { x: it.x, y: it.y, m: it.material }); });
    R.items.forEach(function (w, it) { if (!da.has(it)) R.teile.push({ m: w.m, x: w.x, y: w.y, t: R.t }); });
    R.items = da;
    // Flaschen (Objekte): Füllgrad beim Verlassen
    var objs = g('factoryObjects') || [];
    var fl = new Map();
    objs.forEach(function (o) {
      if (o.type === 'bottle') fl.set(o, { x: o.x, fill: (o.currentFill || 0) / Math.max(1, o.capacity || 100) });
      if (o.type === 'zylinder_double' || o.type === 'zylinder_single' || o.type === 'rolltor') R.zyl[o.id] = o.type === 'rolltor' ? (o.torPos || 0) : (o.extension || 0);
    });
    R.fl.forEach(function (w, o) { if (!fl.has(o)) R.flaschen.push({ fill: w.fill, x: w.x, t: R.t }); });
    R.fl = fl;
    // Bedingungen
    var kr = KRIT[task.id];
    for (var i = 0; i < kr.length; i++) {
      if (R.ok[i]) continue;
      R.m[i] = R.m[i] || {};
      try { if (kr[i].f(R, R.m[i])) R.ok[i] = true; } catch (e) { /* Bedingung bleibt offen */ }
    }
  }
  setInterval(abtasten, 40);

  /* Bausteine für Bedingungen ------------------------------------------- */
  function an(R, n) { return !!R.s[n]; }
  function warAn(R, n) { return !!R.vor[n]; }
  // Achtung: Ein Taster rechnet die SPS sofort durch. Was er abschaltet, ist
  // beim Abtasten schon aus – deshalb Lampen beim Quittieren mit warAn prüfen.
  function steigt(R, n) { return an(R, n) && !warAn(R, n); }
  function faellt(R, n) { return !an(R, n) && warAn(R, n); }
  /* Ereignisfolge: Auslöser (Flanke in einer Lage) → innerhalb `frist` s muss
     `dann` wahr werden und `halten` s wahr bleiben. Misslingt es, wartet die
     Bedingung auf den nächsten Auslöser. */
  function reaktion(ausloeser, dann, frist, halten) {
    return function (R, m) {
      if (m.t0 === undefined || m.t0 === null) {
        if (ausloeser(R, m)) { m.t0 = R.t; m.seit = null; }
        return false;
      }
      if (dann(R, m)) {
        if (m.seit === null) m.seit = R.t;
        if (R.t - m.seit >= (halten || 0)) return true;
      } else {
        m.seit = null;
        if (R.t - m.t0 > frist) m.t0 = null;
      }
      return false;
    };
  }
  /* Zustand hält ununterbrochen `dauer` s an */
  function haelt(bed, dauer) {
    return function (R, m) {
      if (bed(R, m)) { if (m.seit == null) m.seit = R.t; return R.t - m.seit >= dauer; }
      m.seit = null; return false;
    };
  }
  function zaehle(R, art, bed) { return R[art].filter(bed).length; }

  /* ================================================================ Anlagen
   * hardware(): Objekte der 2D-Anlage (alle gesperrt). typen/adressen gelten
   * für alle drei Aufgaben. zuordnung: [Variable, Adresse, Bauteil, Kontakt,
   * Bedeutung]. */
  function sperren(objs) { objs.forEach(function (o) { o.locked = true; o.rotation = o.rotation || 0; }); return objs; }

  var PNEU_2 = function (zyl1, zyl2, v1, v2) {
    // Druckluft für zwei doppeltwirkende Zylinder: Wartung/Kompressor,
    // Verteiler, je ein Wegeventil und zwei Drosseln (wie in den Lernsituationen)
    // Der zweite Zylinder (Präger, Vorschub) fährt gedrosselt aus: langsam
    // genug, um ihn auf dem Weg nach unten anzuhalten
    return {
      objekte: [
        { id: 'o14', type: 'pneumatic_zone', x: 20, y: 320, width: 400, height: 170 },
        { id: 'o15', type: 'compressor', x: 40, y: 410, width: 100, height: 60, normLabel: '-GQA1', pressure: 6, maxFlow: 200 },
        { id: 'o16', type: 'manifold', x: 170, y: 455, width: 240, height: 15, normLabel: '-GQ1' },
        { id: 'o17', type: 'valve_pneu', x: 180, y: 400, width: 50, height: 40, linkedVarExt: v1[0], linkedVarRet: v1[1], targetCylinderId: zyl1, isDouble: true, normLabel: '-QM1' },
        { id: 'o18', type: 'throttle', x: 170, y: 330, width: 40, height: 35, opening: 1, targetCylinderId: zyl1, role: 'ext', normLabel: '-RN1' },
        { id: 'o19', type: 'throttle', x: 215, y: 330, width: 40, height: 35, opening: 1, targetCylinderId: zyl1, role: 'ret', normLabel: '-RN2' },
        { id: 'o20', type: 'valve_pneu', x: 310, y: 400, width: 50, height: 40, linkedVarExt: v2[0], linkedVarRet: v2[1], targetCylinderId: zyl2, isDouble: true, isTriple: true, normLabel: '-QM2' },
        { id: 'o21', type: 'throttle', x: 300, y: 330, width: 40, height: 35, opening: 0.15, targetCylinderId: zyl2, role: 'ext', normLabel: '-RN3' },
        { id: 'o22', type: 'throttle', x: 345, y: 330, width: 40, height: 35, opening: 0.15, targetCylinderId: zyl2, role: 'ret', normLabel: '-RN4' }
      ],
      verbindungen: [
        { aObjId: 'o15', aPortId: '1', bObjId: 'o16', bPortId: '1', _auto: true },
        { aObjId: 'o16', aPortId: '1', bObjId: 'o17', bPortId: '1', _auto: true },
        { aObjId: 'o17', aPortId: '2', bObjId: 'o18', bPortId: '2', _auto: true },
        { aObjId: 'o18', aPortId: '1', bObjId: zyl1, bPortId: '1', _auto: true },
        { aObjId: 'o17', aPortId: '4', bObjId: 'o19', bPortId: '2', _auto: true },
        { aObjId: 'o19', aPortId: '1', bObjId: zyl1, bPortId: '2', _auto: true },
        { aObjId: 'o16', aPortId: '1', bObjId: 'o20', bPortId: '1', _auto: true },
        { aObjId: 'o20', aPortId: '2', bObjId: 'o21', bPortId: '2', _auto: true },
        { aObjId: 'o21', aPortId: '1', bObjId: zyl2, bPortId: '1', _auto: true },
        { aObjId: 'o20', aPortId: '4', bObjId: 'o22', bPortId: '2', _auto: true },
        { aObjId: 'o22', aPortId: '1', bObjId: zyl2, bPortId: '2', _auto: true }
      ]
    };
  };
  /* Prägestation: Auflage, Teil und Spannzylinder liegen um die Stempelhöhe (30 px)
     tiefer, damit der Stempel beim Ausfahren gerade das Teil erreicht */
  var TEIL_PRAEG = [{ x: 322, y: 225, vx: 0, vy: 0, material: 'metall', useGravity: true, useCollision: true, isSolid: true, meltTemp: 1200, temperature: 20 }];
  var TEIL_AUFLAGE = [{ x: 322, y: 195, vx: 0, vy: 0, material: 'metall', useGravity: true, useCollision: true, isSolid: true, meltTemp: 1200, temperature: 20 }];

  /* Gemeinsame Bedingungen ---------------------------------------------- */
  // Betrieb mit Selbsthaltung: Ausgang bleibt an, nachdem Start losgelassen ist
  function kSelbsthaltung(ausgang, lampe, start) {
    return haelt(function (R) { return an(R, ausgang) && (!lampe || an(R, lampe)) && !an(R, start || 'TASTER_START'); }, 1.5);
  }
  // Öffner betätigt (Variable fällt auf 0), während `ausgang` lief → aus
  function kOeffnerStoppt(oeffner, ausgaenge, zusatz) {
    return reaktion(function (R) { return faellt(R, oeffner) && ausgaenge.some(function (a) { return warAn(R, a); }); },
      function (R) { return ausgaenge.every(function (a) { return !an(R, a); }) && (!zusatz || zusatz(R)); }, 0.6, 0.5);
  }

  /* ============================================================ 1 Sortieranlage */
  var SORT_HW = function () {
    return sperren([
      { id: 'o1', type: 'taster', x: 20, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_START', color: 'green' },
      { id: 'o2', type: 'taster', x: 75, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_STOPP', color: 'red' },
      { id: 'o3', type: 'nothalt', x: 130, y: 18, width: 45, height: 45, useCollision: true, labelPinned: true, linkedVar: 'NOT_HALT', color: 'red' },
      { id: 'o4', type: 'taster', x: 190, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_QUITTIEREN', color: 'yellow' },
      { id: 'o5', type: 'led', x: 250, y: 25, width: 26, height: 26, useCollision: true, labelPinned: true, linkedVar: 'LAMPE_BETRIEB', color: 'green' },
      { id: 'o6', type: 'led', x: 285, y: 25, width: 26, height: 26, useCollision: true, labelPinned: true, linkedVar: 'LAMPE_KISTE_VOLL', color: 'yellow' },
      { id: 'o7', type: 'led', x: 320, y: 25, width: 26, height: 26, useCollision: true, labelPinned: true, linkedVar: 'LAMPE_STOERUNG', color: 'red' },
      { id: 'o10', type: 'conveyor', x: 200, y: 262, width: 510, height: 40, linkedVar: 'MOTOR_BAND', startupTime: 0.5, useCollision: true },
      { id: 'o11', type: 'spawner_metall', x: 174, y: 260, width: 36, height: 36, rotation: 270, linkedVar: 'MOTOR_BAND', interval: 3.5, spawnSolid: true, useCollision: false },
      { id: 'o12', type: 'spawner_kunststoff', x: 174, y: 260, width: 36, height: 36, rotation: 270, linkedVar: 'MOTOR_BAND', interval: 4.5, spawnSolid: true, useCollision: false },
      { id: 'o13', type: 'sensor_ind', x: 598, y: 296, width: 26, height: 26, rotation: 270, linkedVar: 'SENSOR_METALL', useCollision: false },
      { id: 'o14', type: 'sensor_opt', x: 605, y: 240, width: 26, height: 26, rotation: 90, linkedVar: 'LICHTSCHRANKE_TEIL', useCollision: false },
      { id: 'o15', type: 'zylinder_double', x: 572, y: 198, width: 84, height: 26, rotation: 90, linkedVarExt: 'SPULE_AUSSCHIEBEN', linkedVarRet: 'SPULE_ZURUECK', hasPneumatics: false, normLabel: '-MM1', useCollision: true },
      { id: 'o18', type: 'sensor_reed', x: 592, y: 152, width: 20, height: 40, rotation: 90, linkedVar: 'REED_AUSSCHIEBER_HINTEN', parentId: 'o15', rangeW: 10, useCollision: false },
      { id: 'o19', type: 'sensor_reed', x: 592, y: 223, width: 20, height: 40, rotation: 90, linkedVar: 'REED_AUSSCHIEBER_VORN', parentId: 'o15', rangeW: 10, useCollision: false },
      { id: 'o16', type: 'despawner', x: 601, y: 329, width: 36, height: 36 },
      { id: 'o17', type: 'despawner', x: 712, y: 264, width: 36, height: 36 }
    ]);
  };
  var inKiste = function (t) { return t.x < 660 && t.y > 272; };   // quer vom Band (y≈265) geschoben
  var amEnde = function (t) { return t.x >= 660; };
  var SORT_BASIS = 'BETRIEB := SR(TASTER_START, ¬TASTER_STOPP || ¬NOT_HALT)\n';

  var SORTIERANLAGE = {
    id: 'sortieranlage', titel: 'Sortieranlage', icon: '🔀', ansicht: 'top',
    kurz: 'Förderband mit Lichtschranke, induktivem Sensor und Ausschieber: Metall in die Kiste, Kunststoff ans Bandende.',
    beschreibung: 'Ansicht von oben. Das Magazin legt Metall- und Kunststoffteile auf das Band, solange `MOTOR_BAND` = 1. An der Prüfstelle sitzen die Lichtschranke und der induktive Sensor. Der Ausschieber -MM1 (doppeltwirkend, 5/2-Wegeventil mit zwei Spulen) schiebt ein Teil quer vom Band in die Kiste; Kunststoffteile laufen bis zum Bandende.',
    hardware: SORT_HW,
    zuordnung: [
      ['TASTER_START', 'E0.0', 'taster', 'Schließer', 'Betrieb ein'],
      ['TASTER_STOPP', 'E0.1', 'taster_nc', 'Öffner', 'Betrieb aus (1 = nicht betätigt)'],
      ['NOT_HALT', 'E0.2', 'nothalt', 'Öffner', 'Not-Halt (1 = nicht betätigt)'],
      ['TASTER_QUITTIEREN', 'E0.3', 'taster', 'Schließer', 'Quittieren / neue Kiste'],
      ['LICHTSCHRANKE_TEIL', 'E0.4', 'sensor_opt', 'Schließer', 'Teil an der Prüfstelle'],
      ['SENSOR_METALL', 'E0.5', 'sensor_ind', 'Schließer', 'Teil ist aus Metall'],
      ['REED_AUSSCHIEBER_HINTEN', 'E0.6', 'sensor_reed', 'Schließer', 'Ausschieber eingefahren'],
      ['REED_AUSSCHIEBER_VORN', 'E0.7', 'sensor_reed', 'Schließer', 'Ausschieber ausgefahren'],
      ['MOTOR_BAND', 'A0.0', 'motor', '', 'Bandmotor und Magazin'],
      ['SPULE_AUSSCHIEBEN', 'A0.1', 'valve', '', 'Ausschieber ausfahren'],
      ['SPULE_ZURUECK', 'A0.2', 'valve', '', 'Ausschieber einfahren'],
      ['LAMPE_BETRIEB', 'A0.3', 'led', '', 'Leuchte Betrieb (grün)'],
      ['LAMPE_KISTE_VOLL', 'A0.4', 'led', '', 'Leuchte Kiste voll (gelb)'],
      ['LAMPE_STOERUNG', 'A0.5', 'led', '', 'Leuchte Störung (rot)']
    ],
    aufgaben: [
      {
        titel: 'Band ein und aus',
        auftrag: 'Das Band soll mit `TASTER_START` anlaufen und weiterlaufen, wenn der Taster losgelassen ist (Selbsthaltung). `TASTER_STOPP` und `NOT_HALT` halten es an; beide sind **Öffner** (1 = nicht betätigt). `LAMPE_BETRIEB` zeigt, dass das Band läuft. Sortiert wird noch nicht: Alle Teile laufen bis zum Bandende.',
        tipp: 'Ein Speicher in einer Zeile: `BETRIEB := SR(Setzen, Rücksetzen)` – bei SR hat Rücksetzen Vorrang. Ein Öffner meldet 1, solange er NICHT betätigt ist: Rücksetzen also mit `¬TASTER_STOPP`.',
        vorlage: '// Betrieb: Start setzt, Stopp und Not-Halt (beide Öffner) setzen zurück\n\n\n// Ausgänge\n\n',
        loesung: '// Betrieb: Start setzt, Stopp und Not-Halt (beide Öffner) setzen zurück\nBETRIEB := SR(TASTER_START, ¬TASTER_STOPP || ¬NOT_HALT)\n\n// Ausgänge\nMOTOR_BAND := BETRIEB\nLAMPE_BETRIEB := BETRIEB\n',
        kriterien: [
          ['Start: Band und grüne Leuchte bleiben an, wenn der Taster losgelassen ist', kSelbsthaltung('MOTOR_BAND', 'LAMPE_BETRIEB')],
          ['Stopp (Öffner) hält das Band an', kOeffnerStoppt('TASTER_STOPP', ['MOTOR_BAND'])],
          ['Not-Halt hält das Band an', kOeffnerStoppt('NOT_HALT', ['MOTOR_BAND'])],
          ['Mindestens 3 Teile erreichen das Bandende', function (R) { return zaehle(R, 'teile', amEnde) >= 3; }]
        ]
      },
      {
        titel: 'Metall aussortieren',
        auftrag: 'Start und Stopp sind schon programmiert. Jetzt wird sortiert: Kommt ein **Metallteil** an die Prüfstelle (Lichtschranke UND induktiver Sensor), hält das Band an und der Ausschieber schiebt das Teil in die Kiste. In der vorderen Endlage fährt er zurück; das Band läuft erst weiter, wenn er wieder hinten ist. **Kunststoffteile** laufen durch bis zum Bandende.',
        tipp: 'Ein zweiter Speicher für das Ausschieben: `AUSSCHIEBEN := SR(Teil da UND Metall UND Ausschieber hinten, Ausschieber vorn)`. Das Band läuft nur bei `BETRIEB` UND nicht `AUSSCHIEBEN` UND Ausschieber hinten. Die zweite Spule ist das Gegenteil: `SPULE_ZURUECK := ¬AUSSCHIEBEN`.',
        vorlage: '// Betrieb: Start setzt, Stopp und Not-Halt (beide Öffner) setzen zurück\nBETRIEB := SR(TASTER_START, ¬TASTER_STOPP || ¬NOT_HALT)\nLAMPE_BETRIEB := BETRIEB\n\n// Ausschieben: Metallteil an der Prüfstelle → ausfahren, vorne → zurück\n\n\n// Band und Spulen\nMOTOR_BAND := BETRIEB\n',
        loesung: '// Betrieb: Start setzt, Stopp und Not-Halt (beide Öffner) setzen zurück\nBETRIEB := SR(TASTER_START, ¬TASTER_STOPP || ¬NOT_HALT)\nLAMPE_BETRIEB := BETRIEB\n\n// Ausschieben: Metallteil an der Prüfstelle → ausfahren, vorne → zurück\nAUSSCHIEBEN := SR(BETRIEB && LICHTSCHRANKE_TEIL && SENSOR_METALL && REED_AUSSCHIEBER_HINTEN, REED_AUSSCHIEBER_VORN || ¬NOT_HALT)\n\n// Band und Spulen\nMOTOR_BAND := BETRIEB && ¬AUSSCHIEBEN && REED_AUSSCHIEBER_HINTEN\nSPULE_AUSSCHIEBEN := AUSSCHIEBEN\nSPULE_ZURUECK := ¬AUSSCHIEBEN\n',
        kriterien: [
          ['Mindestens 3 Metallteile landen in der Kiste, keines am Bandende', function (R) {
            return zaehle(R, 'teile', function (t) { return t.m === 'metall' && inKiste(t); }) >= 3 &&
              zaehle(R, 'teile', function (t) { return t.m === 'metall' && amEnde(t); }) === 0; }],
          ['Mindestens 2 Kunststoffteile laufen bis zum Bandende, keines in der Kiste', function (R) {
            return zaehle(R, 'teile', function (t) { return t.m !== 'metall' && amEnde(t); }) >= 2 &&
              zaehle(R, 'teile', function (t) { return t.m !== 'metall' && inKiste(t); }) === 0; }],
          ['Das Band steht, solange der Ausschieber nicht hinten ist (3 Mal geprüft)', function (R, m) {
            if (an(R, 'MOTOR_BAND') && !an(R, 'REED_AUSSCHIEBER_HINTEN')) { m.seit = m.seit == null ? R.t : m.seit; if (R.t - m.seit > 0.3) m.fehler = true; } else m.seit = null;
            if (steigt(R, 'REED_AUSSCHIEBER_VORN')) m.n = (m.n || 0) + 1;
            return !m.fehler && (m.n || 0) >= 3; }]
        ]
      },
      {
        titel: 'Kiste voll, Not-Halt, Quittieren',
        auftrag: 'Die Sortierung läuft. Ergänze nach dem Lastenheft:\n\n- **Kiste voll:** Ein Vorwärtszähler zählt jedes Ausschieben. Nach **5** Metallteilen endet der Betrieb, das Band steht, `LAMPE_KISTE_VOLL` leuchtet. `TASTER_QUITTIEREN` (neue Kiste steht da) setzt den Zähler zurück; danach startet `TASTER_START` wieder.\n- **Not-Halt:** Band sofort aus, der Ausschieber fährt zurück, `LAMPE_STOERUNG` leuchtet. Nach dem Entriegeln läuft nichts von selbst an, auch Start nicht – erst nach `TASTER_QUITTIEREN`.\n\nTesten: fünf Metallteile abwarten, quittieren, Start; im Betrieb Not-Halt drücken (rastet ein), entriegeln (erneut anklicken), Start (nichts darf passieren), quittieren, Start.',
        tipp: '`KISTE_VOLL := CTU(REED_AUSSCHIEBER_VORN, TASTER_QUITTIEREN, 5)` zählt jedes Ausfahren. `STOERUNG := SR(¬NOT_HALT, TASTER_QUITTIEREN && NOT_HALT)` merkt sich den Not-Halt. Betrieb nur setzen, wenn keine Störung und die Kiste nicht voll ist, und mit `KISTE_VOLL` zurücksetzen.',
        vorlage: '// Betrieb: Start setzt, Stopp und Not-Halt (beide Öffner) setzen zurück\nBETRIEB := SR(TASTER_START, ¬TASTER_STOPP || ¬NOT_HALT)\n\n// Ausschieben: Metallteil an der Prüfstelle → ausfahren, vorne → zurück\nAUSSCHIEBEN := SR(BETRIEB && LICHTSCHRANKE_TEIL && SENSOR_METALL && REED_AUSSCHIEBER_HINTEN, REED_AUSSCHIEBER_VORN || ¬NOT_HALT)\n\n// Ausgänge\nMOTOR_BAND := BETRIEB && ¬AUSSCHIEBEN && REED_AUSSCHIEBER_HINTEN\nSPULE_AUSSCHIEBEN := AUSSCHIEBEN\nSPULE_ZURUECK := ¬AUSSCHIEBEN\nLAMPE_BETRIEB := BETRIEB\n',
        loesung: '// Störung: Not-Halt (Öffner) speichern, bis quittiert wird\nSTOERUNG := SR(¬NOT_HALT, TASTER_QUITTIEREN && NOT_HALT)\n\n// Kiste voll: Vorwärtszähler zählt jedes Ausschieben, Sollwert 5\nKISTE_VOLL := CTU(REED_AUSSCHIEBER_VORN, TASTER_QUITTIEREN, 5)\n\n// Betrieb: nur ohne Störung und mit leerer Kiste\nBETRIEB := SR(TASTER_START && ¬STOERUNG && ¬KISTE_VOLL, ¬TASTER_STOPP || ¬NOT_HALT || KISTE_VOLL)\n\n// Ausschieben: Metallteil an der Prüfstelle → ausfahren, vorne oder Störung → zurück\nAUSSCHIEBEN := SR(BETRIEB && LICHTSCHRANKE_TEIL && SENSOR_METALL && REED_AUSSCHIEBER_HINTEN, REED_AUSSCHIEBER_VORN || STOERUNG)\n\n// Ausgänge\nMOTOR_BAND := BETRIEB && ¬AUSSCHIEBEN && REED_AUSSCHIEBER_HINTEN\nSPULE_AUSSCHIEBEN := AUSSCHIEBEN\nSPULE_ZURUECK := ¬AUSSCHIEBEN\nLAMPE_BETRIEB := BETRIEB\nLAMPE_KISTE_VOLL := KISTE_VOLL\nLAMPE_STOERUNG := STOERUNG\n',
        kriterien: [
          ['Nach 5 Metallteilen: Band steht, „Kiste voll“ leuchtet (nicht früher)', function (R, m) {
            // gezählt werden Metallteile, die in der Kiste ankommen (seit dem letzten Quittieren);
            // das fünfte fällt erst kurz nach dem Ausschieben hinein
            if (steigt(R, 'TASTER_QUITTIEREN')) m.tq = R.t;
            var n = zaehle(R, 'teile', function (t) { return t.m === 'metall' && inKiste(t) && t.t > (m.tq || -1); });
            if (an(R, 'LAMPE_KISTE_VOLL') && n < 4) m.frueh = true;
            if (!an(R, 'LAMPE_KISTE_VOLL')) m.frueh = false;
            return !m.frueh && n >= 5 && an(R, 'LAMPE_KISTE_VOLL') && !an(R, 'MOTOR_BAND'); }],
          ['Quittieren: Leuchte aus, Start lässt das Band wieder laufen', function (R, m) {
            if (warAn(R, 'LAMPE_KISTE_VOLL') && steigt(R, 'TASTER_QUITTIEREN')) m.q = true;
            if (m.q && an(R, 'LAMPE_KISTE_VOLL')) return false;
            return !!m.q && an(R, 'MOTOR_BAND') && !an(R, 'LAMPE_KISTE_VOLL'); }],
          ['Not-Halt: Band sofort aus, Störungsleuchte an', kOeffnerStoppt('NOT_HALT', ['MOTOR_BAND'], function (R) { return an(R, 'LAMPE_STOERUNG'); })],
          ['Nach dem Entriegeln startet nichts – erst nach dem Quittieren', function (R, m) {
            // Phase 1: Not-Halt entriegelt, Störungsleuchte an
            if (!m.p && an(R, 'NOT_HALT') && an(R, 'LAMPE_STOERUNG')) m.p = 1;
            if (m.p === 1 && steigt(R, 'TASTER_START')) { m.p = 2; m.t = R.t; }
            if (m.p === 2) { if (an(R, 'MOTOR_BAND')) { m.p = 0; return false; } if (R.t - m.t > 1) m.p = 3; }
            if (m.p === 3 && !an(R, 'LAMPE_STOERUNG')) m.p = 4;
            return m.p === 4 && an(R, 'MOTOR_BAND'); }]
        ]
      }
    ]
  };

  /* ============================================================ 2 Abfüllstation */
  var ABF_HW = function () {
    return sperren([
      { id: 'o1', type: 'taster', x: 20, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_START', color: 'green' },
      { id: 'o2', type: 'taster', x: 95, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_STOPP', color: 'red' },
      { id: 'o3', type: 'nothalt', x: 170, y: 18, width: 45, height: 45, useCollision: true, labelPinned: true, linkedVar: 'NOT_HALT', color: 'red', hexColor: '#e53935' },
      { id: 'o4', type: 'taster', x: 245, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_QUITTIEREN', color: 'blue' },
      { id: 'o5', type: 'stacklight', x: 360, y: 40, width: 24, height: 70, useCollision: false, labelPinned: true, linkedVar: 'LAMPE_ROT', linkedVarRet: 'LAMPE_GELB', linkedVar3: 'LAMPE_GRUEN' },
      { id: 'o7', type: 'conveyor', x: 40, y: 300, width: 440, height: 40, useCollision: true, linkedVar: 'MOTOR_BAND', normLabel: '-MA1' },
      { id: 'o8', type: 'spawner_special', x: 45, y: 150, width: 70, height: 70, useCollision: false, linkedVar: 'MOTOR_BAND', interval: 1, spawnXOffset: 0, spawnYOffset: 0, backpressureStop: true, templateConfig: { type: 'bottle', width: 50, height: 110, rotation: 0, capacity: 100, currentFill: 0, containedMaterial: null } },
      { id: 'o9', type: 'spawner_fluid', x: 246, y: 75, width: 50, height: 50, useCollision: false, labelPinned: true, linkedVar: 'VENTIL_FUELLEN', fluidMat: 'water', interval: 0.08 },
      { id: 'o10', type: 'sensor_opt', x: 230, y: 230, width: 20, height: 40, useCollision: false, linkedVar: 'LICHTSCHRANKE_FLASCHE', rangeW: 10 },
      { id: 'o11', type: 'bottle_sensor', x: 261, y: 245, width: 18, height: 18, useCollision: false, linkedVar: 'FUELLSTAND_ERREICHT' },
      { id: 'o12', type: 'despawner', x: 485, y: 350, width: 90, height: 60, useCollision: false }
    ]);
  };
  var ABF_EIN = 'ANLAGE_EIN := SR(TASTER_START, ¬TASTER_STOPP || ¬NOT_HALT)\n';
  var voll = function (f) { return f.fill >= 0.5; };   // Füllstandssensor meldet bei etwa 60 %

  var ABFUELLSTATION = {
    id: 'abfuellstation', titel: 'Abfüllstation', icon: '🧴', ansicht: 'side',
    kurz: 'Flaschen auf dem Band: unter dem Ventil anhalten, füllen, abtropfen lassen, zählen.',
    beschreibung: 'Seitenansicht. Das Magazin stellt leere Flaschen auf das Band, solange `MOTOR_BAND` = 1. Unter dem Füllventil meldet die Lichtschranke `LICHTSCHRANKE_FLASCHE` eine Flasche; der Füllstandssensor `FUELLSTAND_ERREICHT` meldet, wenn sie voll ist. Am Bandende kommen die Flaschen in die Kiste. Signalsäule: grün, gelb, rot.',
    hardware: ABF_HW,
    zuordnung: [
      ['TASTER_START', 'E0.0', 'taster', 'Schließer', 'Anlage ein'],
      ['TASTER_STOPP', 'E0.1', 'taster_nc', 'Öffner', 'Anlage aus (1 = nicht betätigt)'],
      ['NOT_HALT', 'E0.2', 'nothalt', 'Öffner', 'Not-Halt (1 = nicht betätigt)'],
      ['TASTER_QUITTIEREN', 'E0.3', 'taster', 'Schließer', 'Quittieren / neue Kiste'],
      ['LICHTSCHRANKE_FLASCHE', 'E0.4', 'sensor_opt', 'Schließer', 'Flasche unter dem Füllventil'],
      ['FUELLSTAND_ERREICHT', 'E0.5', 'sensor_kap', 'Schließer', 'Flasche ist voll'],
      ['MOTOR_BAND', 'A0.0', 'motor', '', 'Bandmotor und Flaschenmagazin'],
      ['VENTIL_FUELLEN', 'A0.1', 'valve', '', 'Füllventil auf'],
      ['LAMPE_GRUEN', 'A0.2', 'led', '', 'Signalsäule grün: Betrieb'],
      ['LAMPE_GELB', 'A0.3', 'led', '', 'Signalsäule gelb: Kiste voll'],
      ['LAMPE_ROT', 'A0.4', 'led', '', 'Signalsäule rot: Störung']
    ],
    aufgaben: [
      {
        titel: 'Anlage ein und aus',
        auftrag: 'Die Anlage soll mit `TASTER_START` einschalten und eingeschaltet bleiben (Selbsthaltung). `TASTER_STOPP` und `NOT_HALT` (beide **Öffner**, 1 = nicht betätigt) schalten aus. Im Betrieb läuft das Band und die Signalsäule leuchtet **grün**. Solange der Not-Halt gedrückt ist, leuchtet sie **rot**. Gefüllt wird noch nicht: Die leeren Flaschen laufen durch.',
        tipp: '`ANLAGE_EIN := SR(TASTER_START, ¬TASTER_STOPP || ¬NOT_HALT)`. Rot leuchtet, solange der Not-Halt betätigt ist: `¬NOT_HALT`.',
        vorlage: '// Anlage ein: Start setzt, Stopp und Not-Halt (Öffner) setzen zurück\n\n\n// Band und Signalsäule\n\n',
        loesung: '// Anlage ein: Start setzt, Stopp und Not-Halt (Öffner) setzen zurück\n' + ABF_EIN + '\n// Band und Signalsäule\nMOTOR_BAND := ANLAGE_EIN\nLAMPE_GRUEN := ANLAGE_EIN\nLAMPE_ROT := ¬NOT_HALT\n',
        kriterien: [
          ['Start: Band und Grün bleiben an, wenn der Taster losgelassen ist', kSelbsthaltung('MOTOR_BAND', 'LAMPE_GRUEN')],
          ['Stopp (Öffner) schaltet die Anlage aus', kOeffnerStoppt('TASTER_STOPP', ['MOTOR_BAND', 'LAMPE_GRUEN'])],
          ['Not-Halt: Band aus, Rot leuchtet', kOeffnerStoppt('NOT_HALT', ['MOTOR_BAND'], function (R) { return an(R, 'LAMPE_ROT'); })],
          ['Mindestens 2 Flaschen erreichen die Kiste', function (R) { return R.flaschen.length >= 2; }]
        ]
      },
      {
        titel: 'Flaschen füllen',
        auftrag: 'Ein- und Ausschalten ist programmiert. Jetzt wird gefüllt: Steht eine Flasche unter dem Ventil (Lichtschranke), hält das Band an und `VENTIL_FUELLEN` öffnet, bis `FUELLSTAND_ERREICHT` meldet. Danach tropft das Ventil noch **1 s** ab, erst dann läuft das Band weiter. Das Ventil darf nur bei stehendem Band offen sein.',
        tipp: '`ABTROPFEN := TON(LICHTSCHRANKE_FLASCHE && FUELLSTAND_ERREICHT, 1)` wird 1 s nach dem Vollmelden 1. Band: `ANLAGE_EIN && (¬LICHTSCHRANKE_FLASCHE || ABTROPFEN)`. Ventil: Anlage ein, Flasche da, noch nicht voll.',
        vorlage: '// Anlage ein: Start setzt, Stopp und Not-Halt (Öffner) setzen zurück\n' + ABF_EIN + 'LAMPE_GRUEN := ANLAGE_EIN\nLAMPE_ROT := ¬NOT_HALT\n\n// Abtropfen: 1 s nach dem Vollmelden\n\n\n// Band und Füllventil\nMOTOR_BAND := ANLAGE_EIN\n',
        loesung: '// Anlage ein: Start setzt, Stopp und Not-Halt (Öffner) setzen zurück\n' + ABF_EIN + 'LAMPE_GRUEN := ANLAGE_EIN\nLAMPE_ROT := ¬NOT_HALT\n\n// Abtropfen: 1 s nach dem Vollmelden\nABTROPFEN := TON(LICHTSCHRANKE_FLASCHE && FUELLSTAND_ERREICHT, 1)\n\n// Band und Füllventil\nMOTOR_BAND := ANLAGE_EIN && (¬LICHTSCHRANKE_FLASCHE || ABTROPFEN)\nVENTIL_FUELLEN := ANLAGE_EIN && LICHTSCHRANKE_FLASCHE && ¬FUELLSTAND_ERREICHT\n',
        kriterien: [
          ['Mindestens 3 volle Flaschen in der Kiste, keine halbvolle', function (R) {
            return zaehle(R, 'flaschen', voll) >= 3 && zaehle(R, 'flaschen', function (f) { return !voll(f); }) === 0; }],
          ['Das Ventil ist nur bei stehendem Band offen (3 Füllungen)', function (R, m) {
            if (an(R, 'VENTIL_FUELLEN') && an(R, 'MOTOR_BAND')) { m.seit = m.seit == null ? R.t : m.seit; if (R.t - m.seit > 0.2) m.fehler = true; } else m.seit = null;
            if (faellt(R, 'VENTIL_FUELLEN')) m.n = (m.n || 0) + 1;
            return !m.fehler && (m.n || 0) >= 3; }],
          ['Abtropfen: Das Band läuft frühestens 1 s nach dem Vollmelden weiter (2 Mal)', function (R, m) {
            if (steigt(R, 'FUELLSTAND_ERREICHT') && !an(R, 'MOTOR_BAND')) m.t = R.t;
            if (m.t != null && steigt(R, 'MOTOR_BAND')) { var d = R.t - m.t; if (d >= 0.85 && d <= 3) m.n = (m.n || 0) + 1; else m.fehler = true; m.t = null; }
            return !m.fehler && (m.n || 0) >= 2; }]
        ]
      },
      {
        titel: 'Zählen, Kiste voll, Not-Halt',
        auftrag: 'Das Füllen läuft. Ergänze nach dem Lastenheft:\n\n- **Zählen:** Ein Vorwärtszähler zählt jede gefüllte Flasche (wenn das Abtropfen fertig ist). Nach **6** Flaschen ist die Kiste voll: Die Anlage schaltet aus, die Signalsäule leuchtet **gelb**. `TASTER_QUITTIEREN` setzt den Zähler zurück; danach startet `TASTER_START` wieder.\n- **Not-Halt:** Band und Ventil sofort aus, **rot** leuchtet und bleibt an, bis quittiert ist. Nach dem Entriegeln startet nichts, auch Start nicht – erst nach `TASTER_QUITTIEREN`.\n- **Grün** nur im Betrieb mit nicht voller Kiste.',
        tipp: '`KISTE_VOLL := CTU(ABTROPFEN, TASTER_QUITTIEREN, 6)`, `STOERUNG := SR(¬NOT_HALT, TASTER_QUITTIEREN && NOT_HALT)`. `ANLAGE_EIN` nur ohne Störung und mit nicht voller Kiste setzen, mit `KISTE_VOLL` zurücksetzen.',
        vorlage: '// Anlage ein: Start setzt, Stopp und Not-Halt (Öffner) setzen zurück\n' + ABF_EIN + '\n// Abtropfen: 1 s nach dem Vollmelden\nABTROPFEN := TON(LICHTSCHRANKE_FLASCHE && FUELLSTAND_ERREICHT, 1)\n\n// Band und Füllventil\nMOTOR_BAND := ANLAGE_EIN && (¬LICHTSCHRANKE_FLASCHE || ABTROPFEN)\nVENTIL_FUELLEN := ANLAGE_EIN && LICHTSCHRANKE_FLASCHE && ¬FUELLSTAND_ERREICHT\n\n// Signalsäule\nLAMPE_GRUEN := ANLAGE_EIN\nLAMPE_ROT := ¬NOT_HALT\n',
        loesung: '// Störung: Not-Halt (Öffner) speichern, bis quittiert wird\nSTOERUNG := SR(¬NOT_HALT, TASTER_QUITTIEREN && NOT_HALT)\n\n// Abtropfen: 1 s nach dem Vollmelden\nABTROPFEN := TON(LICHTSCHRANKE_FLASCHE && FUELLSTAND_ERREICHT, 1)\n\n// Flaschen zählen: Vorwärtszähler, Sollwert 6\nKISTE_VOLL := CTU(ABTROPFEN, TASTER_QUITTIEREN, 6)\n\n// Anlage ein: nur ohne Störung und mit nicht voller Kiste\nANLAGE_EIN := SR(TASTER_START && ¬STOERUNG && ¬KISTE_VOLL, ¬TASTER_STOPP || ¬NOT_HALT || KISTE_VOLL)\n\n// Band und Füllventil\nMOTOR_BAND := ANLAGE_EIN && (¬LICHTSCHRANKE_FLASCHE || ABTROPFEN)\nVENTIL_FUELLEN := ANLAGE_EIN && LICHTSCHRANKE_FLASCHE && ¬FUELLSTAND_ERREICHT\n\n// Signalsäule\nLAMPE_GRUEN := ANLAGE_EIN && ¬KISTE_VOLL\nLAMPE_GELB := KISTE_VOLL\nLAMPE_ROT := STOERUNG\n',
        kriterien: [
          ['Nach 6 vollen Flaschen: Anlage aus, Gelb leuchtet (nicht früher)', function (R, m) {
            if (steigt(R, 'TASTER_QUITTIEREN')) m.n = 0;
            if (steigt(R, 'FUELLSTAND_ERREICHT')) m.n = (m.n || 0) + 1;
            if (an(R, 'LAMPE_GELB') && (m.n || 0) < 6) m.frueh = true;
            if (!an(R, 'LAMPE_GELB')) m.frueh = false;
            return !m.frueh && (m.n || 0) >= 6 && an(R, 'LAMPE_GELB') && !an(R, 'MOTOR_BAND') && !an(R, 'LAMPE_GRUEN'); }],
          ['Quittieren: Gelb aus, Start schaltet wieder ein', function (R, m) {
            if (warAn(R, 'LAMPE_GELB') && steigt(R, 'TASTER_QUITTIEREN')) m.q = true;
            if (m.q && an(R, 'LAMPE_GELB')) return false;
            return !!m.q && an(R, 'LAMPE_GRUEN') && !an(R, 'LAMPE_GELB'); }],
          ['Not-Halt: Band und Ventil sofort aus, Rot an', kOeffnerStoppt('NOT_HALT', ['MOTOR_BAND', 'VENTIL_FUELLEN'], function (R) { return an(R, 'LAMPE_ROT'); })],
          ['Nach dem Entriegeln startet nichts – erst nach dem Quittieren', function (R, m) {
            if (!m.p && an(R, 'NOT_HALT') && an(R, 'LAMPE_ROT')) m.p = 1;
            if (m.p === 1 && steigt(R, 'TASTER_START')) { m.p = 2; m.t = R.t; }
            if (m.p === 2) { if (an(R, 'LAMPE_GRUEN') || an(R, 'MOTOR_BAND')) { m.p = 0; return false; } if (R.t - m.t > 1) m.p = 3; }
            if (m.p === 3 && !an(R, 'LAMPE_ROT')) m.p = 4;
            return m.p === 4 && an(R, 'LAMPE_GRUEN'); }]
        ]
      }
    ]
  };

  /* ============================================================ 3 Prägestation */
  var PRAEG_HW = function () {
    var p = PNEU_2('o11', 'o12', ['SPULE_SPANNEN', 'SPULE_LOESEN'], ['SPULE_PRAEGEN', 'SPULE_PRAEGER_ZURUECK']);
    return {
      objekte: sperren([
        { id: 'o1', type: 'taster', x: 20, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_LINKS', color: 'black' },
        { id: 'o29', type: 'taster', x: 185, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_RECHTS', color: 'black' },
        { id: 'o2', type: 'nothalt', x: 75, y: 18, width: 45, height: 45, useCollision: true, labelPinned: true, linkedVar: 'NOT_HALT', color: 'red' },
        { id: 'o3', type: 'taster', x: 130, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_QUITTIEREN', color: 'yellow' },
        { id: 'o8', type: 'led', x: 20, y: 90, width: 26, height: 26, useCollision: true, labelPinned: true, linkedVar: 'LAMPE_BEREIT', color: 'green' },
        { id: 'o10', type: 'led', x: 55, y: 90, width: 26, height: 26, useCollision: true, labelPinned: true, linkedVar: 'LAMPE_STOERUNG', color: 'red' },
        { id: 'o11', type: 'zylinder_double', x: 160, y: 230, width: 80, height: 30, useCollision: true, linkedVarExt: 'SPULE_SPANNEN', linkedVarRet: 'SPULE_LOESEN', hasPneumatics: true, normLabel: '-MM1', pistonD: 20, rodD: 8, stroke: 100 },
        { id: 'o12', type: 'zylinder_double', x: 302, y: 60, width: 80, height: 30, rotation: 90, useCollision: true, linkedVarExt: 'SPULE_PRAEGEN', linkedVarRet: 'SPULE_PRAEGER_ZURUECK', hasPneumatics: true, normLabel: '-MM2', pistonD: 32, rodD: 8, stroke: 100 },
        { id: 'o27', type: 'press', x: 322, y: 116, width: 40, height: 30, useCollision: true, parentId: 'o12', attachmentType: 'rod' },
        { id: 'o13', type: 'frame', x: 290, y: 265, width: 120, height: 14, useCollision: true },
        { id: 'o23', type: 'sensor_reed', x: 148, y: 235, width: 20, height: 40, useCollision: false, linkedVar: 'REED_SPANNER_HINTEN', parentId: 'o11', rangeW: 10 },
        { id: 'o24', type: 'sensor_reed', x: 220, y: 235, width: 20, height: 40, useCollision: false, linkedVar: 'REED_SPANNER_VORN', parentId: 'o11', rangeW: 10 },
        { id: 'o25', type: 'sensor_reed', x: 322, y: 14, width: 20, height: 40, rotation: 90, useCollision: false, linkedVar: 'REED_PRAEGER_HINTEN', parentId: 'o12', rangeW: 10 },
        { id: 'o26', type: 'sensor_reed', x: 322, y: 85, width: 20, height: 40, rotation: 90, useCollision: false, linkedVar: 'REED_PRAEGER_VORN', parentId: 'o12', rangeW: 10 },
        { id: 'o28', type: 'sensor_ind', x: 368, y: 225, width: 20, height: 40, rotation: 180, useCollision: false, linkedVar: 'SENSOR_TEIL' }
      ].concat(p.objekte)),
      verbindungen: p.verbindungen, items: TEIL_PRAEG
    };
  };
  var GRUNDST_P = function (R) { return an(R, 'REED_SPANNER_HINTEN') && an(R, 'REED_PRAEGER_HINTEN'); };
  // vollständiger Prägezyklus: gespannt → unten → oben → gelöst, in dieser Reihenfolge
  function zyklusPraeg(R, m) {
    m.z = m.z || 0;
    if (m.z === 0 && steigt(R, 'REED_SPANNER_VORN')) m.z = 1;
    if (m.z >= 1 && m.z < 4 && !an(R, 'REED_SPANNER_VORN') && !an(R, 'REED_PRAEGER_HINTEN')) { m.fehler = true; }
    if (m.z === 1 && steigt(R, 'REED_PRAEGER_VORN')) { m.z = 2; m.unten = R.t; }
    if (m.z === 2 && faellt(R, 'REED_PRAEGER_VORN')) { m.dauer = R.t - m.unten; m.z = 3; }
    if (m.z === 3 && steigt(R, 'REED_PRAEGER_HINTEN')) m.z = 4;
    if (m.z === 4 && steigt(R, 'REED_SPANNER_HINTEN')) { m.z = 0; m.fertig = (m.fertig || 0) + 1; m.dauern = (m.dauern || []).concat([m.dauer]); }
    if (m.z >= 1 && m.z <= 3 && steigt(R, 'REED_SPANNER_HINTEN')) m.fehler = true;   // gelöst, bevor der Präger oben ist
  }

  var PRAEGESTATION = {
    id: 'praegestation', titel: 'Prägestation', icon: '🔨', ansicht: 'side',
    kurz: 'Spannzylinder und Prägezylinder mit Zweihandbedienung: vom Tippbetrieb bis zur Schrittkette mit Not-Halt.',
    beschreibung: 'Seitenansicht. Der Spannzylinder -MM1 (waagerecht, 5/2-Wegeventil mit zwei Spulen) spannt das Messingschild auf der Auflage. Der Prägezylinder -MM2 (senkrecht, 5/3-Wegeventil mit Sperrmittelstellung – ohne Signal bleibt er stehen) trägt den Prägestempel. Reedkontakte an beiden Zylindern, `SENSOR_TEIL` meldet das Teil. Bedienung mit zwei Tastern (Zweihand), Not-Halt und Quittieren. Zum Testen ohne Teil: Rechtsklick auf das Teil → Block löschen.',
    hardware: PRAEG_HW,
    zuordnung: [
      ['TASTER_LINKS', 'E0.0', 'taster', 'Schließer', 'Zweihand, linker Taster'],
      ['TASTER_RECHTS', 'E0.1', 'taster', 'Schließer', 'Zweihand, rechter Taster'],
      ['NOT_HALT', 'E0.2', 'nothalt', 'Öffner', 'Not-Halt (1 = nicht betätigt)'],
      ['TASTER_QUITTIEREN', 'E0.3', 'taster', 'Schließer', 'Quittieren'],
      ['REED_SPANNER_HINTEN', 'E0.4', 'sensor_reed', 'Schließer', 'Spanner gelöst'],
      ['REED_SPANNER_VORN', 'E0.5', 'sensor_reed', 'Schließer', 'Spanner gespannt'],
      ['REED_PRAEGER_HINTEN', 'E0.6', 'sensor_reed', 'Schließer', 'Präger oben'],
      ['REED_PRAEGER_VORN', 'E0.7', 'sensor_reed', 'Schließer', 'Präger unten'],
      ['SENSOR_TEIL', 'E1.0', 'sensor_ind', 'Schließer', 'Teil auf der Auflage'],
      ['SPULE_SPANNEN', 'A0.0', 'valve', '', 'Spanner ausfahren (spannen)'],
      ['SPULE_LOESEN', 'A0.1', 'valve', '', 'Spanner einfahren (lösen)'],
      ['SPULE_PRAEGEN', 'A0.2', 'valve', '', 'Präger ausfahren (nach unten)'],
      ['SPULE_PRAEGER_ZURUECK', 'A0.3', 'valve', '', 'Präger einfahren (nach oben)'],
      ['LAMPE_BEREIT', 'A0.4', 'led', '', 'Leuchte Bereit (grün)'],
      ['LAMPE_STOERUNG', 'A0.5', 'led', '', 'Leuchte Störung (rot)']
    ],
    aufgaben: [
      {
        titel: 'Prägen im Tippbetrieb',
        auftrag: 'Geprägt wird nur, solange **beide** Taster gedrückt sind (Zweihand) und der Not-Halt nicht betätigt ist:\n\n- Beide gedrückt und Teil da: der Spanner spannt. Ist er vorne, fährt der Präger nach unten.\n- Lässt eine Hand los: der Präger fährt nach oben; erst wenn er oben ist, löst der Spanner.\n- Ein Taster allein bewirkt nichts.\n- `LAMPE_BEREIT` leuchtet in der Grundstellung (Spanner hinten, Präger oben) mit Teil.',
        tipp: 'Fasse die Zweihand in einem Merker zusammen: `BEIDE := TASTER_LINKS && TASTER_RECHTS && NOT_HALT`. Dann jede Spule als UND-Verknüpfung, z. B. `SPULE_PRAEGEN := BEIDE && REED_SPANNER_VORN`, `SPULE_LOESEN := ¬BEIDE && REED_PRAEGER_HINTEN`.',
        vorlage: '// Zweihand: beide Taster und Not-Halt nicht betätigt (Öffner)\n\n\n// Spanner\n\n\n// Präger\n\n\n// Bereit\n\n',
        loesung: '// Zweihand: beide Taster und Not-Halt nicht betätigt (Öffner)\nBEIDE := TASTER_LINKS && TASTER_RECHTS && NOT_HALT\n\n// Spanner\nSPULE_SPANNEN := BEIDE && SENSOR_TEIL\nSPULE_LOESEN := ¬BEIDE && REED_PRAEGER_HINTEN\n\n// Präger\nSPULE_PRAEGEN := BEIDE && REED_SPANNER_VORN\nSPULE_PRAEGER_ZURUECK := ¬BEIDE\n\n// Bereit\nLAMPE_BEREIT := REED_SPANNER_HINTEN && REED_PRAEGER_HINTEN && SENSOR_TEIL\n',
        kriterien: [
          ['Bereit leuchtet in der Grundstellung mit Teil', haelt(function (R) { return an(R, 'LAMPE_BEREIT') && GRUNDST_P(R) && an(R, 'SENSOR_TEIL'); }, 1)],
          ['Ein Taster allein: nichts fährt', haelt(function (R) { return an(R, 'TASTER_LINKS') !== an(R, 'TASTER_RECHTS') && GRUNDST_P(R) && !an(R, 'SPULE_SPANNEN') && !an(R, 'SPULE_PRAEGEN'); }, 1)],
          ['Beide Taster: spannen, dann prägt der Präger bis unten', function (R) { return an(R, 'TASTER_LINKS') && an(R, 'TASTER_RECHTS') && an(R, 'REED_SPANNER_VORN') && an(R, 'REED_PRAEGER_VORN'); }],
          ['Loslassen: Präger fährt hoch, erst dann löst der Spanner', function (R, m) {
            if (an(R, 'REED_PRAEGER_VORN') && an(R, 'REED_SPANNER_VORN')) m.unten = true;
            if (m.unten && !an(R, 'REED_SPANNER_VORN') && !an(R, 'REED_PRAEGER_HINTEN')) { m.unten = false; }
            if (m.unten && steigt(R, 'REED_SPANNER_HINTEN')) return an(R, 'REED_PRAEGER_HINTEN');
            return false; }]
        ]
      },
      {
        titel: 'Der Prägezyklus',
        auftrag: 'Ein kurzer Druck auf **beide** Taster startet einen ganzen Zyklus, der dann von selbst abläuft (Schrittkette):\n\n1. Grundstellung, Teil da: spannen\n2. gespannt: Präger nach unten\n3. unten: **2 s** prägen (Presszeit)\n4. Präger nach oben\n5. oben: lösen – zurück zu Schritt 1\n\n`LAMPE_BEREIT` leuchtet im Anfangsschritt in der Grundstellung mit Teil.',
        tipp: 'Bauregel für jeden Schritt: `SCHRITT_n := SR(SCHRITT_vorher && Bedingung, SCHRITT_nachher)`. Der Anfangsschritt wird außerdem gesetzt, wenn kein anderer aktiv ist: `¬(SCHRITT_2 || SCHRITT_3 || …)`. Presszeit: `PRAEGEZEIT := TON(SCHRITT_3 && REED_PRAEGER_VORN, 2)`. Den Präger außer beim Prägen oben halten: `SPULE_PRAEGER_ZURUECK := ¬SCHRITT_3` – sonst fehlt der Gegendruck für die Drossel und er schießt nach unten.',
        vorlage: '// Schrittkette: 1 Bereit, 2 Spannen, 3 Prägen, 4 Präger hoch, 5 Lösen\nSCHRITT_1 := SR((SCHRITT_5 && REED_SPANNER_HINTEN) || ¬(SCHRITT_2 || SCHRITT_3 || SCHRITT_4 || SCHRITT_5), SCHRITT_2)\n\n\n// Ausgänge\n\n',
        loesung: '// Schrittkette: 1 Bereit, 2 Spannen, 3 Prägen, 4 Präger hoch, 5 Lösen\nSCHRITT_1 := SR((SCHRITT_5 && REED_SPANNER_HINTEN) || ¬(SCHRITT_2 || SCHRITT_3 || SCHRITT_4 || SCHRITT_5), SCHRITT_2)\nSCHRITT_2 := SR(SCHRITT_1 && TASTER_LINKS && TASTER_RECHTS && NOT_HALT && REED_SPANNER_HINTEN && REED_PRAEGER_HINTEN && SENSOR_TEIL, SCHRITT_3)\nSCHRITT_3 := SR(SCHRITT_2 && REED_SPANNER_VORN, SCHRITT_4)\nPRAEGEZEIT := TON(SCHRITT_3 && REED_PRAEGER_VORN, 2)\nSCHRITT_4 := SR(SCHRITT_3 && PRAEGEZEIT, SCHRITT_5)\nSCHRITT_5 := SR(SCHRITT_4 && REED_PRAEGER_HINTEN, SCHRITT_1)\n\n// Ausgänge\nSPULE_SPANNEN := SCHRITT_2\nSPULE_PRAEGEN := SCHRITT_3\nSPULE_PRAEGER_ZURUECK := ¬SCHRITT_3\nSPULE_LOESEN := SCHRITT_5\nLAMPE_BEREIT := SCHRITT_1 && REED_SPANNER_HINTEN && REED_PRAEGER_HINTEN && SENSOR_TEIL\n',
        kriterien: [
          ['Ein kurzer Druck startet den ganzen Zyklus', function (R, m) {
            if (an(R, 'REED_SPANNER_VORN') && !an(R, 'TASTER_LINKS') && !an(R, 'TASTER_RECHTS') && an(R, 'REED_PRAEGER_HINTEN')) m.losgelassen = true;
            if (GRUNDST_P(R) && !an(R, 'SPULE_SPANNEN') && !an(R, 'REED_SPANNER_VORN') && m.vorn) { m.fertig = !!m.losgelassen; }
            if (an(R, 'REED_PRAEGER_VORN')) m.vorn = true;
            return !!m.fertig; }],
          ['Presszeit: Der Präger bleibt mindestens 2 s unten', function (R, m) { zyklusPraeg(R, m); return !m.fehler && (m.dauern || []).some(function (d) { return d >= 1.9; }); }],
          ['Reihenfolge stimmt: erst spannen, dann prägen, erst oben lösen (2 Zyklen)', function (R, m) { zyklusPraeg(R, m); return !m.fehler && (m.fertig || 0) >= 2; }],
          ['Bereit leuchtet zwischen den Zyklen', haelt(function (R) { return an(R, 'LAMPE_BEREIT') && GRUNDST_P(R); }, 0.5)]
        ]
      },
      {
        titel: 'Zweihand, Halten und Not-Halt',
        auftrag: 'Die Station bekommt die Bedienung, die die Gefährdungsbeurteilung verlangt:\n\n1. **Zweihand:** Ein Zyklus startet nur, wenn **beide** Taster innerhalb von **0,5 s** gedrückt werden. Einer allein oder der zweite zu spät: nichts. Ein neuer Versuch gilt erst, wenn beide losgelassen sind.\n2. **Halten:** Der Präger fährt nur nach unten, solange beide Taster gedrückt sind. Lässt eine Hand los, bleibt er stehen (5/3-Ventil). Beide wieder gleichzeitig drücken: er fährt weiter.\n3. **Not-Halt** (Öffner): Alle Schritte außer dem Anfangsschritt fallen ab, der Präger fährt nach oben (die sichere Richtung), der Spanner bleibt zu, `LAMPE_STOERUNG` leuchtet.\n4. **Quittieren** (Not-Halt entriegelt) startet die Grundstellungsfahrt: Präger oben, dann lösen.\n5. `LAMPE_BEREIT`: Anfangsschritt, Grundstellung, Teil da, keine Störung.\n\nTesten: Halte einen Taster mit **Strg+Klick** gedrückt und klicke dann den anderen.\n\nEine echte Zweihandschaltung nach DIN EN ISO 13851 ist ein sicherheitsgerichteter Baustein. Hier baust du ihre **Logik** nach, um sie zu verstehen.',
        tipp: '`ZWEIHAND_ZEIT := TON(TASTER_LINKS || TASTER_RECHTS, 0.5)`, `ZWEIHAND := SR(TASTER_LINKS && TASTER_RECHTS && ¬ZWEIHAND_ZEIT, ¬TASTER_LINKS || ¬TASTER_RECHTS)`. Halten: `SPULE_PRAEGEN := SCHRITT_3 && ZWEIHAND`. Grundstellungsfahrt als eigener Speicher `GS_FAHRT`.',
        vorlage: '// Schrittkette aus dem Prägezyklus: 1 Bereit, 2 Spannen, 3 Prägen, 4 Präger hoch, 5 Lösen\nGRUNDSTELLUNG := REED_SPANNER_HINTEN && REED_PRAEGER_HINTEN\nSCHRITT_1 := SR((SCHRITT_5 && REED_SPANNER_HINTEN) || ¬(SCHRITT_2 || SCHRITT_3 || SCHRITT_4 || SCHRITT_5), SCHRITT_2)\nSCHRITT_2 := SR(SCHRITT_1 && TASTER_LINKS && TASTER_RECHTS && GRUNDSTELLUNG && SENSOR_TEIL, SCHRITT_3)\nSCHRITT_3 := SR(SCHRITT_2 && REED_SPANNER_VORN, SCHRITT_4)\nPRAEGEZEIT := TON(SCHRITT_3 && REED_PRAEGER_VORN, 2)\nSCHRITT_4 := SR(SCHRITT_3 && PRAEGEZEIT, SCHRITT_5)\nSCHRITT_5 := SR(SCHRITT_4 && REED_PRAEGER_HINTEN, SCHRITT_1)\n\n// Ausgänge\nSPULE_SPANNEN := SCHRITT_2\nSPULE_PRAEGEN := SCHRITT_3\nSPULE_PRAEGER_ZURUECK := ¬SCHRITT_3\nSPULE_LOESEN := SCHRITT_5\nLAMPE_BEREIT := SCHRITT_1 && GRUNDSTELLUNG && SENSOR_TEIL\n',
        loesung: '// Störung: Not-Halt (Öffner) speichern, bis quittiert wird\nSTOERUNG := SR(¬NOT_HALT, TASTER_QUITTIEREN && NOT_HALT)\n\n// Zweihand: beide innerhalb von 0,5 s, neuer Versuch erst nach Loslassen\nZWEIHAND_ZEIT := TON(TASTER_LINKS || TASTER_RECHTS, 0.5)\nZWEIHAND := SR(TASTER_LINKS && TASTER_RECHTS && ¬ZWEIHAND_ZEIT, ¬TASTER_LINKS || ¬TASTER_RECHTS)\n\n// Schrittkette: 1 Bereit, 2 Spannen, 3 Prägen, 4 Präger hoch, 5 Lösen\nGRUNDSTELLUNG := REED_SPANNER_HINTEN && REED_PRAEGER_HINTEN\nSCHRITT_1 := SR((SCHRITT_5 && REED_SPANNER_HINTEN) || ¬(SCHRITT_2 || SCHRITT_3 || SCHRITT_4 || SCHRITT_5), SCHRITT_2 || STOERUNG)\nSCHRITT_2 := SR(SCHRITT_1 && ZWEIHAND && GRUNDSTELLUNG && SENSOR_TEIL && ¬STOERUNG, SCHRITT_3 || ¬NOT_HALT)\nSCHRITT_3 := SR(SCHRITT_2 && REED_SPANNER_VORN, SCHRITT_4 || ¬NOT_HALT)\nPRAEGEZEIT := TON(SCHRITT_3 && REED_PRAEGER_VORN, 2)\nSCHRITT_4 := SR(SCHRITT_3 && PRAEGEZEIT, SCHRITT_5 || ¬NOT_HALT)\nSCHRITT_5 := SR(SCHRITT_4 && REED_PRAEGER_HINTEN, SCHRITT_1 || ¬NOT_HALT)\n\n// Grundstellungsfahrt nach dem Quittieren: Präger hoch, dann lösen\nGS_FAHRT := SR(TASTER_QUITTIEREN && NOT_HALT && ¬GRUNDSTELLUNG, GRUNDSTELLUNG || ¬NOT_HALT)\n\n// Ausgänge\nSPULE_SPANNEN := SCHRITT_2\nSPULE_PRAEGEN := SCHRITT_3 && ZWEIHAND\nSPULE_PRAEGER_ZURUECK := ¬SCHRITT_3\nSPULE_LOESEN := SCHRITT_5 || GS_FAHRT && REED_PRAEGER_HINTEN\nLAMPE_BEREIT := SCHRITT_1 && GRUNDSTELLUNG && SENSOR_TEIL && ¬STOERUNG\nLAMPE_STOERUNG := STOERUNG\n',
        kriterien: [
          ['Zweiter Taster zu spät (über 0,5 s): kein Start', function (R, m) {
            if (steigt(R, 'TASTER_LINKS') !== steigt(R, 'TASTER_RECHTS') && !(an(R, 'TASTER_LINKS') && an(R, 'TASTER_RECHTS')) && GRUNDST_P(R)) { m.t1 = R.t; m.p = 1; }
            if (m.p === 1 && !an(R, 'TASTER_LINKS') && !an(R, 'TASTER_RECHTS')) m.p = 0;
            if (m.p === 1 && an(R, 'TASTER_LINKS') && an(R, 'TASTER_RECHTS')) { m.p = (R.t - m.t1 > 0.7) ? 2 : 0; m.t2 = R.t; }
            if (m.p === 2) { if (!an(R, 'REED_SPANNER_HINTEN') || an(R, 'SPULE_SPANNEN')) { m.p = 0; return false; }
              if (!an(R, 'TASTER_LINKS') || !an(R, 'TASTER_RECHTS')) { m.p = 0; return false; }
              return R.t - m.t2 >= 1; }
            return false; }],
          ['Beide gleichzeitig: der Zyklus läuft bis unten', function (R) { return an(R, 'REED_PRAEGER_VORN') && an(R, 'REED_SPANNER_VORN'); }],
          ['Halten: Loslassen auf dem Weg nach unten – der Präger bleibt stehen', haelt(function (R) {
            return an(R, 'REED_SPANNER_VORN') && !an(R, 'REED_PRAEGER_HINTEN') && !an(R, 'REED_PRAEGER_VORN') && !an(R, 'SPULE_PRAEGEN') && !an(R, 'SPULE_PRAEGER_ZURUECK') && an(R, 'NOT_HALT') && !(an(R, 'TASTER_LINKS') && an(R, 'TASTER_RECHTS')); }, 0.5)],
          ['Not-Halt: Präger fährt hoch, Spanner bleibt zu, Störung leuchtet', function (R, m) {
            if (faellt(R, 'NOT_HALT') && an(R, 'REED_SPANNER_VORN') && !an(R, 'REED_PRAEGER_HINTEN')) m.p = 1;
            if (m.p === 1 && !an(R, 'REED_SPANNER_VORN')) m.p = 0;
            return m.p === 1 && an(R, 'REED_PRAEGER_HINTEN') && an(R, 'REED_SPANNER_VORN') && an(R, 'LAMPE_STOERUNG'); }],
          ['Quittieren: Grundstellungsfahrt, dann Bereit', function (R, m) {
            if (warAn(R, 'LAMPE_STOERUNG') && an(R, 'NOT_HALT') && steigt(R, 'TASTER_QUITTIEREN') && !GRUNDST_P(R)) m.p = 1;
            return m.p === 1 && GRUNDST_P(R) && !an(R, 'LAMPE_STOERUNG') && an(R, 'LAMPE_BEREIT'); }]
        ]
      }
    ]
  };

  /* ============================================================ 4 Bohrstation */
  var BOHR_HW = function () {
    var p = PNEU_2('o11', 'o12', ['SPULE_SPANNEN', 'SPULE_LOESEN'], ['SPULE_VORSCHUB_VOR', 'SPULE_VORSCHUB_ZURUECK']);
    return {
      objekte: sperren([
        { id: 'o1', type: 'taster', x: 20, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_START', color: 'green' },
        { id: 'o2', type: 'nothalt', x: 75, y: 18, width: 45, height: 45, useCollision: true, labelPinned: true, linkedVar: 'NOT_HALT', color: 'red' },
        { id: 'o3', type: 'taster', x: 130, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_QUITTIEREN', color: 'yellow' },
        { id: 'o4', type: 'schalter', x: 185, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'SCHALTER_DAUER' },
        { id: 'o8', type: 'led', x: 20, y: 90, width: 26, height: 26, useCollision: true, labelPinned: true, linkedVar: 'LAMPE_BEREIT', color: 'green' },
        { id: 'o9', type: 'led', x: 55, y: 90, width: 26, height: 26, useCollision: true, labelPinned: true, linkedVar: 'LAMPE_AUTOMATIK', color: 'yellow' },
        { id: 'o10', type: 'led', x: 90, y: 90, width: 26, height: 26, useCollision: true, labelPinned: true, linkedVar: 'LAMPE_STOERUNG', color: 'red' },
        { id: 'o11', type: 'zylinder_double', x: 160, y: 200, width: 80, height: 30, useCollision: true, linkedVarExt: 'SPULE_SPANNEN', linkedVarRet: 'SPULE_LOESEN', hasPneumatics: true, normLabel: '-MM1', pistonD: 20, rodD: 8, stroke: 100 },
        { id: 'o12', type: 'zylinder_double', x: 302, y: 60, width: 80, height: 30, rotation: 90, useCollision: true, linkedVarExt: 'SPULE_VORSCHUB_VOR', linkedVarRet: 'SPULE_VORSCHUB_ZURUECK', hasPneumatics: true, normLabel: '-MM2', pistonD: 20, rodD: 8, stroke: 100 },
        { id: 'o13', type: 'frame', x: 290, y: 235, width: 120, height: 14, useCollision: true },
        { id: 'o23', type: 'sensor_reed', x: 148, y: 205, width: 20, height: 40, useCollision: false, linkedVar: 'REED_SPANNER_HINTEN', parentId: 'o11', rangeW: 10 },
        { id: 'o24', type: 'sensor_reed', x: 220, y: 205, width: 20, height: 40, useCollision: false, linkedVar: 'REED_SPANNER_VORN', parentId: 'o11', rangeW: 10 },
        { id: 'o25', type: 'sensor_reed', x: 322, y: 14, width: 20, height: 40, rotation: 90, useCollision: false, linkedVar: 'REED_VORSCHUB_HINTEN', parentId: 'o12', rangeW: 10 },
        { id: 'o26', type: 'sensor_reed', x: 322, y: 85, width: 20, height: 40, rotation: 90, useCollision: false, linkedVar: 'REED_VORSCHUB_VORN', parentId: 'o12', rangeW: 10 },
        { id: 'o27', type: 'bohrspindel', x: 328, y: 116, width: 28, height: 80, useCollision: false, linkedVar: 'MOTOR_BOHREN', parentId: 'o12', attachmentType: 'rod' },
        { id: 'o28', type: 'sensor_ind', x: 368, y: 195, width: 20, height: 40, rotation: 180, useCollision: false, linkedVar: 'SENSOR_TEIL' }
      ].concat(p.objekte)),
      verbindungen: p.verbindungen, items: TEIL_AUFLAGE
    };
  };
  var GRUNDST_B = function (R) { return an(R, 'REED_SPANNER_HINTEN') && an(R, 'REED_VORSCHUB_HINTEN'); };
  // vollständiger Bohrzyklus: gespannt → Vorschub vorn → hinten → gelöst
  function zyklusBohr(R, m) {
    m.z = m.z || 0;
    if (m.z === 0 && steigt(R, 'REED_SPANNER_VORN')) { m.z = 1; m.tSpann = R.t; }
    if (m.z === 1 && faellt(R, 'REED_VORSCHUB_HINTEN')) { m.z = 2; m.tVor = R.t; }
    if (m.z === 2 && steigt(R, 'REED_VORSCHUB_VORN')) m.z = 3;
    if (m.z === 3 && steigt(R, 'REED_VORSCHUB_HINTEN')) { m.z = 4; m.tHinten = R.t; }
    if (m.z === 4 && faellt(R, 'REED_SPANNER_VORN')) m.tLoes = R.t;
    if (m.z === 4 && steigt(R, 'REED_SPANNER_HINTEN')) { m.z = 0; m.fertig = (m.fertig || 0) + 1; m.tFertig = R.t; }
    if (m.z >= 1 && m.z <= 3 && faellt(R, 'REED_SPANNER_VORN')) m.fehler = true;
    if (steigt(R, 'MOTOR_BOHREN')) m.tMotorAn = R.t;
    if (faellt(R, 'MOTOR_BOHREN')) m.tMotorAus = R.t;
  }
  var BOHR_KETTE5 = 'SCHRITT_1 := SR((SCHRITT_5 && REED_SPANNER_HINTEN) || ¬(SCHRITT_2 || SCHRITT_3 || SCHRITT_4 || SCHRITT_5), SCHRITT_2)\nSCHRITT_2 := SR(SCHRITT_1 && TASTER_START && REED_SPANNER_HINTEN && REED_VORSCHUB_HINTEN && SENSOR_TEIL, SCHRITT_3)\nSCHRITT_3 := SR(SCHRITT_2 && REED_SPANNER_VORN, SCHRITT_4)\n';

  var BOHRSTATION = {
    id: 'bohrstation', titel: 'Bohrstation', icon: '🛠️', ansicht: 'side',
    kurz: 'Spannen, Bohren, Lösen als Schrittkette – mit Anlauf- und Auslaufzeit, Dauerbetrieb und Not-Halt.',
    beschreibung: 'Seitenansicht. Der Spannzylinder -MM1 (waagerecht, 5/2-Wegeventil) spannt das Werkstück. Der Vorschubzylinder -MM2 (senkrecht, 5/3-Wegeventil mit Sperrmittelstellung) trägt die Bohrspindel mit dem Bohrmotor `MOTOR_BOHREN`. Reedkontakte an beiden Zylindern, `SENSOR_TEIL` meldet das Werkstück. Bedienfeld: Start, Not-Halt, Quittieren, Schalter Dauerbetrieb; Leuchten Bereit, Automatik, Störung.',
    hardware: BOHR_HW,
    zuordnung: [
      ['TASTER_START', 'E0.0', 'taster', 'Schließer', 'Zyklus starten'],
      ['NOT_HALT', 'E0.1', 'nothalt', 'Öffner', 'Not-Halt (1 = nicht betätigt)'],
      ['TASTER_QUITTIEREN', 'E0.2', 'taster', 'Schließer', 'Quittieren'],
      ['SCHALTER_DAUER', 'E0.3', 'schalter', 'Schließer', 'Betriebsart Dauerbetrieb'],
      ['REED_SPANNER_HINTEN', 'E0.4', 'sensor_reed', 'Schließer', 'Spanner gelöst'],
      ['REED_SPANNER_VORN', 'E0.5', 'sensor_reed', 'Schließer', 'Spanner gespannt'],
      ['REED_VORSCHUB_HINTEN', 'E0.6', 'sensor_reed', 'Schließer', 'Bohrer oben'],
      ['REED_VORSCHUB_VORN', 'E0.7', 'sensor_reed', 'Schließer', 'Bohrer unten (Bohrtiefe)'],
      ['SENSOR_TEIL', 'E1.0', 'sensor_ind', 'Schließer', 'Werkstück liegt auf'],
      ['SPULE_SPANNEN', 'A0.0', 'valve', '', 'Spanner ausfahren (spannen)'],
      ['SPULE_LOESEN', 'A0.1', 'valve', '', 'Spanner einfahren (lösen)'],
      ['SPULE_VORSCHUB_VOR', 'A0.2', 'valve', '', 'Bohrer nach unten'],
      ['SPULE_VORSCHUB_ZURUECK', 'A0.3', 'valve', '', 'Bohrer nach oben'],
      ['MOTOR_BOHREN', 'A0.4', 'motor', '', 'Bohrmotor'],
      ['LAMPE_BEREIT', 'A0.5', 'led', '', 'Leuchte Bereit (grün)'],
      ['LAMPE_AUTOMATIK', 'A0.6', 'led', '', 'Leuchte Dauerbetrieb (gelb)'],
      ['LAMPE_STOERUNG', 'A0.7', 'led', '', 'Leuchte Störung (rot)']
    ],
    aufgaben: [
      {
        titel: 'Spannen, Bohren, Lösen',
        auftrag: 'Die Schrittkette ist angefangen. Vervollständige sie:\n\n1. Bereit (Anfangsschritt)\n2. Start, Grundstellung, Teil da: spannen\n3. gespannt: Bohrmotor an, Bohrer nach unten\n4. unten (Bohrtiefe): Bohrer nach oben, Motor läuft weiter\n5. oben: Motor aus, lösen – zurück zu Schritt 1\n\n`LAMPE_BEREIT` leuchtet im Anfangsschritt in der Grundstellung mit Teil.',
        tipp: 'Schritt 4 und 5 nach der Bauregel `SCHRITT_n := SR(SCHRITT_vorher && Bedingung, SCHRITT_nachher)`. Jede Spule gehört zu genau einem Schritt, der Motor zu zwei: `MOTOR_BOHREN := SCHRITT_3 || SCHRITT_4`.',
        vorlage: '// Schrittkette: 1 Bereit, 2 Spannen, 3 Bohren, 4 Bohrer hoch, 5 Lösen\n' + BOHR_KETTE5 + '\n\n// Ausgänge\nSPULE_SPANNEN := SCHRITT_2\nSPULE_VORSCHUB_VOR := SCHRITT_3\n',
        loesung: '// Schrittkette: 1 Bereit, 2 Spannen, 3 Bohren, 4 Bohrer hoch, 5 Lösen\n' + BOHR_KETTE5 + 'SCHRITT_4 := SR(SCHRITT_3 && REED_VORSCHUB_VORN, SCHRITT_5)\nSCHRITT_5 := SR(SCHRITT_4 && REED_VORSCHUB_HINTEN, SCHRITT_1)\n\n// Ausgänge\nSPULE_SPANNEN := SCHRITT_2\nSPULE_VORSCHUB_VOR := SCHRITT_3\nSPULE_VORSCHUB_ZURUECK := SCHRITT_4\nSPULE_LOESEN := SCHRITT_5\nMOTOR_BOHREN := SCHRITT_3 || SCHRITT_4\nLAMPE_BEREIT := SCHRITT_1 && REED_SPANNER_HINTEN && REED_VORSCHUB_HINTEN && SENSOR_TEIL\n',
        kriterien: [
          ['Bereit leuchtet in der Grundstellung mit Teil', haelt(function (R) { return an(R, 'LAMPE_BEREIT') && GRUNDST_B(R) && an(R, 'SENSOR_TEIL'); }, 1)],
          ['Der Bohrmotor läuft, solange der Bohrer nicht oben ist', function (R, m) {
            if (!an(R, 'REED_VORSCHUB_HINTEN') && !an(R, 'MOTOR_BOHREN')) { m.seit = m.seit == null ? R.t : m.seit; if (R.t - m.seit > 0.3) m.fehler = true; } else m.seit = null;
            if (steigt(R, 'REED_VORSCHUB_VORN')) m.n = (m.n || 0) + 1;
            return !m.fehler && (m.n || 0) >= 1 && GRUNDST_B(R) && !an(R, 'MOTOR_BOHREN'); }],
          ['Zwei vollständige Zyklen: spannen, bohren, Bohrer hoch, lösen', function (R, m) { zyklusBohr(R, m); return !m.fehler && (m.fertig || 0) >= 2; }]
        ]
      },
      {
        titel: 'Anlauf und Auslauf',
        auftrag: 'Der Bohrmotor braucht Zeit:\n\n- Nach dem Spannen läuft der Motor an. Der Bohrer fährt erst nach **2 s** Anlaufzeit nach unten.\n- Ist der Bohrer wieder oben, schaltet der Motor aus. Gelöst wird erst nach **3 s** Auslaufzeit (die Spindel dreht nach).\n\nBaue die Schrittkette mit sieben Schritten: 1 Bereit, 2 Spannen, 3 Motor läuft an, 4 Bohren, 5 Bohrer hoch, 6 Auslauf, 7 Lösen.',
        tipp: '`ANLAUF := TON(SCHRITT_3, 2)` und `AUSLAUF := TON(SCHRITT_6, 3)` sind die Weiterschaltbedingungen. Der Motor läuft in den Schritten 3, 4 und 5.',
        vorlage: '// Schrittkette: 1 Bereit, 2 Spannen, 3 Anlauf, 4 Bohren, 5 Bohrer hoch, 6 Auslauf, 7 Lösen\n\n\n// Ausgänge\n\n',
        loesung: '// Schrittkette: 1 Bereit, 2 Spannen, 3 Anlauf, 4 Bohren, 5 Bohrer hoch, 6 Auslauf, 7 Lösen\nSCHRITT_1 := SR((SCHRITT_7 && REED_SPANNER_HINTEN) || ¬(SCHRITT_2 || SCHRITT_3 || SCHRITT_4 || SCHRITT_5 || SCHRITT_6 || SCHRITT_7), SCHRITT_2)\nSCHRITT_2 := SR(SCHRITT_1 && TASTER_START && REED_SPANNER_HINTEN && REED_VORSCHUB_HINTEN && SENSOR_TEIL, SCHRITT_3)\nSCHRITT_3 := SR(SCHRITT_2 && REED_SPANNER_VORN, SCHRITT_4)\nANLAUF := TON(SCHRITT_3, 2)\nSCHRITT_4 := SR(SCHRITT_3 && ANLAUF, SCHRITT_5)\nSCHRITT_5 := SR(SCHRITT_4 && REED_VORSCHUB_VORN, SCHRITT_6)\nSCHRITT_6 := SR(SCHRITT_5 && REED_VORSCHUB_HINTEN, SCHRITT_7)\nAUSLAUF := TON(SCHRITT_6, 3)\nSCHRITT_7 := SR(SCHRITT_6 && AUSLAUF, SCHRITT_1)\n\n// Ausgänge\nSPULE_SPANNEN := SCHRITT_2\nMOTOR_BOHREN := SCHRITT_3 || SCHRITT_4 || SCHRITT_5\nSPULE_VORSCHUB_VOR := SCHRITT_4\nSPULE_VORSCHUB_ZURUECK := SCHRITT_5\nSPULE_LOESEN := SCHRITT_7\nLAMPE_BEREIT := SCHRITT_1 && REED_SPANNER_HINTEN && REED_VORSCHUB_HINTEN && SENSOR_TEIL\n',
        kriterien: [
          ['Anlauf: Der Bohrer fährt frühestens 2 s nach dem Motorstart nach unten', function (R, m) {
            zyklusBohr(R, m);
            if (m.tVor != null && m.tMotorAn != null && m.gepr !== m.tVor) { m.gepr = m.tVor; if (m.tVor - m.tMotorAn >= 1.85 && m.tVor - m.tMotorAn < 4) m.n = (m.n || 0) + 1; else m.fehler = true; }
            return !m.fehler && (m.n || 0) >= 1; }],
          ['Auslauf: Gelöst wird frühestens 3 s nach Motor aus', function (R, m) {
            zyklusBohr(R, m);
            if (m.tLoes != null && m.tMotorAus != null && m.gepr !== m.tLoes) { m.gepr = m.tLoes; if (m.tLoes - m.tMotorAus >= 2.85 && m.tLoes - m.tMotorAus < 5) m.n = (m.n || 0) + 1; else m.fehler = true; }
            return !m.fehler && (m.n || 0) >= 1; }],
          ['Motor aus, sobald der Bohrer oben ist', function (R, m) {
            if (steigt(R, 'REED_VORSCHUB_HINTEN') && an(R, 'REED_SPANNER_VORN')) m.t = R.t;
            if (m.t != null && !an(R, 'MOTOR_BOHREN') && an(R, 'REED_SPANNER_VORN')) { if (R.t - m.t < 0.6) return true; m.t = null; }
            return false; }],
          ['Zwei vollständige Zyklen', function (R, m) { zyklusBohr(R, m); return !m.fehler && (m.fertig || 0) >= 2; }]
        ]
      },
      {
        titel: 'Dauerbetrieb und Not-Halt',
        auftrag: 'Die Station bekommt Betriebsarten und Not-Halt (Schrittkette mit Anlauf und Auslauf wie in der mittleren Aufgabe):\n\n1. **Einzelzyklus:** Schalter `SCHALTER_DAUER` aus – `TASTER_START` startet genau einen Zyklus.\n2. **Dauerbetrieb:** Schalter an und Start – die Zyklen folgen ohne neuen Start aufeinander, solange ein Teil da ist. Schalter aus: der laufende Zyklus endet, dann ist Schluss. `LAMPE_AUTOMATIK` leuchtet im Dauerbetrieb.\n3. **Not-Halt** (Öffner): Alle Schritte außer dem Anfangsschritt fallen ab, Motor aus, der Bohrer fährt nach oben (aus dem Werkstück), der Spanner bleibt zu, `LAMPE_STOERUNG` leuchtet, der Dauerbetrieb endet.\n4. **Quittieren** (entriegelt): Grundstellungsfahrt – Bohrer oben, dann lösen.\n5. `LAMPE_BEREIT`: Anfangsschritt, Grundstellung, Teil da, keine Störung.',
        tipp: '`DAUERBETRIEB := SR(TASTER_START && SCHALTER_DAUER, ¬SCHALTER_DAUER || ¬NOT_HALT)`. Schritt 2 startet mit `(TASTER_START || DAUERBETRIEB) && FREIGABE`. Not-Halt setzt die Schritte 2 bis 7 mit `… || ¬NOT_HALT` zurück, den Anfangsschritt mit `… || STOERUNG`.',
        vorlage: '// Schrittkette: 1 Bereit, 2 Spannen, 3 Anlauf, 4 Bohren, 5 Bohrer hoch, 6 Auslauf, 7 Lösen\nSCHRITT_1 := SR((SCHRITT_7 && REED_SPANNER_HINTEN) || ¬(SCHRITT_2 || SCHRITT_3 || SCHRITT_4 || SCHRITT_5 || SCHRITT_6 || SCHRITT_7), SCHRITT_2)\nSCHRITT_2 := SR(SCHRITT_1 && TASTER_START && REED_SPANNER_HINTEN && REED_VORSCHUB_HINTEN && SENSOR_TEIL, SCHRITT_3)\nSCHRITT_3 := SR(SCHRITT_2 && REED_SPANNER_VORN, SCHRITT_4)\nANLAUF := TON(SCHRITT_3, 2)\nSCHRITT_4 := SR(SCHRITT_3 && ANLAUF, SCHRITT_5)\nSCHRITT_5 := SR(SCHRITT_4 && REED_VORSCHUB_VORN, SCHRITT_6)\nSCHRITT_6 := SR(SCHRITT_5 && REED_VORSCHUB_HINTEN, SCHRITT_7)\nAUSLAUF := TON(SCHRITT_6, 3)\nSCHRITT_7 := SR(SCHRITT_6 && AUSLAUF, SCHRITT_1)\n\n// Ausgänge\nSPULE_SPANNEN := SCHRITT_2\nMOTOR_BOHREN := SCHRITT_3 || SCHRITT_4 || SCHRITT_5\nSPULE_VORSCHUB_VOR := SCHRITT_4\nSPULE_VORSCHUB_ZURUECK := SCHRITT_5\nSPULE_LOESEN := SCHRITT_7\nLAMPE_BEREIT := SCHRITT_1 && REED_SPANNER_HINTEN && REED_VORSCHUB_HINTEN && SENSOR_TEIL\n',
        loesung: '// Störung: Not-Halt (Öffner) speichern, bis quittiert wird\nSTOERUNG := SR(¬NOT_HALT, TASTER_QUITTIEREN && NOT_HALT)\n\n// Betriebsart Dauerbetrieb\nDAUERBETRIEB := SR(TASTER_START && SCHALTER_DAUER, ¬SCHALTER_DAUER || ¬NOT_HALT)\n\n// Freigabe: Grundstellung, Teil da, keine Störung\nGRUNDSTELLUNG := REED_SPANNER_HINTEN && REED_VORSCHUB_HINTEN\nFREIGABE := GRUNDSTELLUNG && SENSOR_TEIL && ¬STOERUNG\nZYKLUS := SCHRITT_2 || SCHRITT_3 || SCHRITT_4 || SCHRITT_5 || SCHRITT_6 || SCHRITT_7\n\n// Schrittkette: 1 Bereit, 2 Spannen, 3 Anlauf, 4 Bohren, 5 Bohrer hoch, 6 Auslauf, 7 Lösen\nSCHRITT_1 := SR((SCHRITT_7 && REED_SPANNER_HINTEN) || ¬ZYKLUS, SCHRITT_2 || STOERUNG)\nSCHRITT_2 := SR(SCHRITT_1 && (TASTER_START || DAUERBETRIEB) && FREIGABE, SCHRITT_3 || ¬NOT_HALT)\nSCHRITT_3 := SR(SCHRITT_2 && REED_SPANNER_VORN, SCHRITT_4 || ¬NOT_HALT)\nANLAUF := TON(SCHRITT_3, 2)\nSCHRITT_4 := SR(SCHRITT_3 && ANLAUF, SCHRITT_5 || ¬NOT_HALT)\nSCHRITT_5 := SR(SCHRITT_4 && REED_VORSCHUB_VORN, SCHRITT_6 || ¬NOT_HALT)\nSCHRITT_6 := SR(SCHRITT_5 && REED_VORSCHUB_HINTEN, SCHRITT_7 || ¬NOT_HALT)\nAUSLAUF := TON(SCHRITT_6, 3)\nSCHRITT_7 := SR(SCHRITT_6 && AUSLAUF, SCHRITT_1 || ¬NOT_HALT)\n\n// Grundstellungsfahrt nach dem Quittieren: Bohrer hoch, dann lösen\nGS_FAHRT := SR(TASTER_QUITTIEREN && NOT_HALT && ¬GRUNDSTELLUNG && ¬ZYKLUS, GRUNDSTELLUNG || ¬NOT_HALT)\n\n// Ausgänge\nSPULE_SPANNEN := SCHRITT_2\nMOTOR_BOHREN := SCHRITT_3 || SCHRITT_4 || SCHRITT_5\nSPULE_VORSCHUB_VOR := SCHRITT_4\nSPULE_VORSCHUB_ZURUECK := SCHRITT_5 || STOERUNG && ¬REED_VORSCHUB_HINTEN || GS_FAHRT && ¬REED_VORSCHUB_HINTEN\nSPULE_LOESEN := SCHRITT_7 || GS_FAHRT && REED_VORSCHUB_HINTEN\nLAMPE_BEREIT := SCHRITT_1 && GRUNDSTELLUNG && SENSOR_TEIL && ¬STOERUNG\nLAMPE_AUTOMATIK := DAUERBETRIEB\nLAMPE_STOERUNG := STOERUNG\n',
        kriterien: [
          ['Einzelzyklus: ein Start, ein Zyklus, dann Stillstand', function (R, m) {
            zyklusBohr(R, m);
            if (steigt(R, 'TASTER_START') && !an(R, 'SCHALTER_DAUER') && GRUNDST_B(R)) { m.p = 1; m.f0 = m.fertig || 0; }
            if (m.p === 1 && an(R, 'SCHALTER_DAUER')) m.p = 0;
            if (m.p === 1 && (m.fertig || 0) === m.f0 + 1) { m.p = 2; m.t = R.t; }
            if (m.p === 2) { if (an(R, 'SPULE_SPANNEN') || !an(R, 'REED_SPANNER_HINTEN')) { m.p = 0; return false; } return R.t - m.t >= 3; }
            return false; }],
          ['Dauerbetrieb: zwei Zyklen nacheinander ohne neuen Start, Automatik leuchtet', function (R, m) {
            zyklusBohr(R, m);
            if (steigt(R, 'TASTER_START')) { m.f0 = m.fertig || 0; m.p = an(R, 'SCHALTER_DAUER') ? 1 : 0; }
            if (m.p === 1 && !an(R, 'LAMPE_AUTOMATIK') && (m.fertig || 0) < m.f0 + 2) { if (R.t - (m.ta || R.t) > 0.5) m.p = 0; } else m.ta = R.t;
            return m.p === 1 && (m.fertig || 0) >= m.f0 + 2; }],
          ['Not-Halt: Motor aus, Bohrer hoch, Spanner bleibt zu, Störung leuchtet', function (R, m) {
            if (faellt(R, 'NOT_HALT') && an(R, 'REED_SPANNER_VORN') && !an(R, 'REED_VORSCHUB_HINTEN')) m.p = 1;
            if (m.p === 1 && (!an(R, 'REED_SPANNER_VORN') || an(R, 'MOTOR_BOHREN'))) m.p = 0;
            return m.p === 1 && an(R, 'REED_VORSCHUB_HINTEN') && an(R, 'LAMPE_STOERUNG') && !an(R, 'LAMPE_AUTOMATIK'); }],
          ['Quittieren: Grundstellungsfahrt, dann Bereit', function (R, m) {
            if (warAn(R, 'LAMPE_STOERUNG') && an(R, 'NOT_HALT') && steigt(R, 'TASTER_QUITTIEREN') && !GRUNDST_B(R)) m.p = 1;
            return m.p === 1 && GRUNDST_B(R) && !an(R, 'LAMPE_STOERUNG') && an(R, 'LAMPE_BEREIT'); }]
        ]
      }
    ]
  };

  /* ============================================================ 5 Rolltor */
  var TOR_HW = function () {
    return sperren([
      { id: 't1', type: 'taster', x: 20, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_AUF', color: 'green' },
      { id: 't2', type: 'taster', x: 75, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_STOPP', color: 'red' },
      { id: 't3', type: 'taster', x: 130, y: 20, width: 40, height: 40, useCollision: true, labelPinned: true, linkedVar: 'TASTER_ZU', color: 'black' },
      { id: 'l1', type: 'led', x: 300, y: 30, width: 30, height: 30, useCollision: true, labelPinned: true, linkedVar: 'WARNLEUCHTE', color: 'orange' },
      { id: 'r1', type: 'rolltor', x: 240, y: 90, width: 140, height: 160, useCollision: true, linkedVarExt: 'MOTOR_AUF', linkedVarRet: 'MOTOR_ZU', torView: 'frontal', torSpeed: 35, linkedVarSensorAuf: 'ENDSCHALTER_OBEN', linkedVarSensorZu: 'ENDSCHALTER_UNTEN', normLabel: '-MA1' },
      { id: 'g1', type: 'light_curtain', x: 214, y: 150, width: 20, height: 100, useCollision: false, linkedVar: 'LICHTGITTER' }
    ]);
  };
  var TOR_ZUORDNUNG = [
    ['TASTER_AUF', 'E0.0', 'taster', 'Schließer', 'Tor öffnen'],
    ['TASTER_STOPP', 'E0.1', 'taster_nc', 'Öffner', 'Tor anhalten (1 = nicht betätigt)'],
    ['TASTER_ZU', 'E0.2', 'taster', 'Schließer', 'Tor schließen'],
    ['ENDSCHALTER_OBEN', 'E0.3', 'mech_sensor', 'Schließer', 'Tor ganz offen'],
    ['ENDSCHALTER_UNTEN', 'E0.4', 'mech_sensor', 'Schließer', 'Tor ganz zu'],
    ['LICHTGITTER', 'E0.5', 'light_curtain', 'Öffner', 'Durchfahrt frei (1 = frei, 0 = unterbrochen)'],
    ['MOTOR_AUF', 'A0.0', 'motor', '', 'Torantrieb auf (Wendeschütz)'],
    ['MOTOR_ZU', 'A0.1', 'motor', '', 'Torantrieb zu (Wendeschütz)'],
    ['WARNLEUCHTE', 'A0.2', 'led', '', 'Warnleuchte (orange)']
  ];
  // Fahrt bis zur Endlage: Motor läuft, Endschalter kommt, Motor aus
  function kFahrt(motor, endschalter, taster, halten) {
    return function (R, m) {
      if (an(R, motor)) m.lief = true;
      if (m.lief && steigt(R, endschalter)) { m.t = R.t; m.taster = an(R, taster); }
      if (m.t != null) {
        if (an(R, motor)) { m.t = null; m.lief = false; return false; }
        if (R.t - m.t >= 0.5) return !halten || !!m.taster;
      }
      return false;
    };
  }

  var ROLLTOR = {
    id: 'rolltor', titel: 'Rolltor', icon: '🚪', ansicht: 'side',
    kurz: 'Torantrieb mit Wendeschütz, Endschaltern und Lichtgitter: Tippbetrieb, Selbsthaltung, automatisches Schließen.',
    beschreibung: 'Ansicht von vorn. Das Rolltor einer Halle wird von einem Getriebemotor mit Wendeschützschaltung bewegt: `MOTOR_AUF` und `MOTOR_ZU` dürfen nie gleichzeitig an sein. Endschalter oben und unten melden die Endlagen. Das Lichtgitter in der Durchfahrt ist ein Öffner (1 = frei); im Sim-Panel kannst du es unterbrechen. Die Warnleuchte warnt, solange das Tor fährt.',
    hardware: TOR_HW,
    zuordnung: TOR_ZUORDNUNG,
    aufgaben: [
      {
        titel: 'Tippbetrieb',
        auftrag: 'Das Tor fährt nur, solange ein Taster gedrückt ist:\n\n- `TASTER_AUF` gedrückt: Tor fährt auf, bis der obere Endschalter meldet.\n- `TASTER_ZU` gedrückt: Tor fährt zu, bis der untere Endschalter meldet.\n- Beide gedrückt: nichts (Verriegelung, die Motoren dürfen nie gleichzeitig laufen).\n- Die `WARNLEUCHTE` leuchtet, solange das Tor fährt.',
        tipp: '`MOTOR_AUF := TASTER_AUF && ¬TASTER_ZU && ¬ENDSCHALTER_OBEN`. Für ZU entsprechend. Warnleuchte: einer der beiden Motoren läuft.',
        vorlage: '// Tor auf: solange gedrückt, bis zum oberen Endschalter\n\n\n// Tor zu: solange gedrückt, bis zum unteren Endschalter\n\n\n// Warnleuchte\n\n',
        loesung: '// Tor auf: solange gedrückt, bis zum oberen Endschalter\nMOTOR_AUF := TASTER_AUF && ¬TASTER_ZU && ¬ENDSCHALTER_OBEN\n\n// Tor zu: solange gedrückt, bis zum unteren Endschalter\nMOTOR_ZU := TASTER_ZU && ¬TASTER_AUF && ¬ENDSCHALTER_UNTEN\n\n// Warnleuchte\nWARNLEUCHTE := MOTOR_AUF || MOTOR_ZU\n',
        kriterien: [
          ['AUF gedrückt halten: Tor fährt bis oben, der Endschalter schaltet ab', kFahrt('MOTOR_AUF', 'ENDSCHALTER_OBEN', 'TASTER_AUF', true)],
          ['ZU gedrückt halten: Tor fährt bis unten, der Endschalter schaltet ab', kFahrt('MOTOR_ZU', 'ENDSCHALTER_UNTEN', 'TASTER_ZU', true)],
          ['Beide Taster gedrückt: kein Motor läuft', haelt(function (R) { return an(R, 'TASTER_AUF') && an(R, 'TASTER_ZU') && !an(R, 'MOTOR_AUF') && !an(R, 'MOTOR_ZU') && !an(R, 'ENDSCHALTER_OBEN') && !an(R, 'ENDSCHALTER_UNTEN'); }, 0.5)],
          ['Warnleuchte genau während der Fahrt (in beide Richtungen)', function (R, m) {
            var faehrt = an(R, 'MOTOR_AUF') || an(R, 'MOTOR_ZU');
            if (faehrt !== an(R, 'WARNLEUCHTE')) { m.seit = m.seit == null ? R.t : m.seit; if (R.t - m.seit > 0.2) m.fehler = true; } else m.seit = null;
            if (an(R, 'MOTOR_AUF')) m.auf = true;
            if (an(R, 'MOTOR_ZU')) m.zu = true;
            return !m.fehler && m.auf && m.zu && !faehrt; }]
        ]
      },
      {
        titel: 'Auf Knopfdruck',
        auftrag: 'Ein kurzer Druck genügt jetzt:\n\n- `TASTER_AUF` kurz drücken: Tor fährt ganz auf und schaltet am oberen Endschalter ab.\n- `TASTER_ZU` kurz drücken: Tor fährt ganz zu und schaltet am unteren Endschalter ab.\n- `TASTER_STOPP` (Öffner) hält das Tor jederzeit an, auch in der Mitte.\n- Während das Tor fährt, bewirkt die Gegentaste nichts (erst Stopp). Die Motoren laufen nie gleichzeitig.\n- `WARNLEUCHTE` während der Fahrt.',
        tipp: 'Zwei Speicher mit gegenseitiger Verriegelung: `AUF := SR(TASTER_AUF && ¬ZU, ¬TASTER_STOPP || ENDSCHALTER_OBEN)` und entsprechend `ZU`. Ausgänge: `MOTOR_AUF := AUF`.',
        vorlage: '// Speicher Tor auf\n\n\n// Speicher Tor zu\n\n\n// Ausgänge\n\n',
        loesung: '// Speicher Tor auf: verriegelt gegen ZU, Stopp (Öffner) oder Endschalter setzen zurück\nAUF := SR(TASTER_AUF && ¬ZU, ¬TASTER_STOPP || ENDSCHALTER_OBEN)\n\n// Speicher Tor zu: verriegelt gegen AUF\nZU := SR(TASTER_ZU && ¬AUF, ¬TASTER_STOPP || ENDSCHALTER_UNTEN)\n\n// Ausgänge\nMOTOR_AUF := AUF\nMOTOR_ZU := ZU\nWARNLEUCHTE := AUF || ZU\n',
        kriterien: [
          ['Kurzer Druck auf AUF: Tor fährt ganz auf', kFahrt('MOTOR_AUF', 'ENDSCHALTER_OBEN', 'TASTER_AUF', false)],
          ['Kurzer Druck auf ZU: Tor fährt ganz zu', kFahrt('MOTOR_ZU', 'ENDSCHALTER_UNTEN', 'TASTER_ZU', false)],
          ['Stopp hält das Tor in der Mitte an', kOeffnerStoppt('TASTER_STOPP', ['MOTOR_AUF', 'MOTOR_ZU'], function (R) { return !an(R, 'ENDSCHALTER_OBEN') && !an(R, 'ENDSCHALTER_UNTEN') && an(R, 'TASTER_STOPP'); })],
          ['Gegentaste während der Fahrt: nichts ändert sich', function (R, m) {
            if (an(R, 'MOTOR_AUF') && steigt(R, 'TASTER_ZU')) { m.t = R.t; m.r = 'MOTOR_AUF'; }
            if (an(R, 'MOTOR_ZU') && steigt(R, 'TASTER_AUF')) { m.t = R.t; m.r = 'MOTOR_ZU'; }
            if (m.t != null) {
              var gegen = m.r === 'MOTOR_AUF' ? 'MOTOR_ZU' : 'MOTOR_AUF';
              if (an(R, gegen)) { m.t = null; m.fehler = true; return false; }
              if (R.t - m.t >= 0.4) { m.t = null; return !m.fehler && (an(R, m.r) || an(R, 'ENDSCHALTER_OBEN') || an(R, 'ENDSCHALTER_UNTEN')); }
            }
            return false; }]
        ]
      },
      {
        titel: 'Lichtgitter und automatisches Schließen',
        auftrag: 'Das Tor wird automatisch:\n\n1. **Auf Knopfdruck** wie bisher, mit Stopp (Öffner). `TASTER_AUF` darf eine Zu-Fahrt umkehren.\n2. **Automatisch zu:** Steht das Tor oben und ist das Lichtgitter frei, schließt es nach **5 s** von selbst.\n3. **Vorwarnung:** In den letzten **2 s** davor blinkt die Warnleuchte.\n4. **Lichtgitter:** Wird es beim Schließen unterbrochen (0), hält das Tor sofort an und fährt wieder ganz auf.\n5. Die `WARNLEUCHTE` **blinkt** (etwa 1 Hz), solange das Tor fährt.\n\nTesten: Tor auf, warten; beim Schließen im Sim-Panel `LICHTGITTER` umschalten (unterbrechen) und wieder freigeben.',
        tipp: 'Takt: `TAKT_EIN := TON(¬TAKT_AUS, 0.5)`, `TAKT_AUS := TON(TAKT_EIN, 0.5)`. Wartezeit: `OFFEN_ZEIT := TON(ENDSCHALTER_OBEN && LICHTGITTER && ¬AUF, 5)`, Vorwarnung mit derselben Bedingung und 3 s. Umkehren: `AUF` zusätzlich setzen mit `ZU && ¬LICHTGITTER`.',
        vorlage: '// Speicher Tor auf: verriegelt gegen ZU, Stopp (Öffner) oder Endschalter setzen zurück\nAUF := SR(TASTER_AUF && ¬ZU, ¬TASTER_STOPP || ENDSCHALTER_OBEN)\n\n// Speicher Tor zu: verriegelt gegen AUF\nZU := SR(TASTER_ZU && ¬AUF, ¬TASTER_STOPP || ENDSCHALTER_UNTEN)\n\n// Ausgänge\nMOTOR_AUF := AUF\nMOTOR_ZU := ZU\nWARNLEUCHTE := AUF || ZU\n',
        loesung: '// Blinktakt, etwa 1 Hz\nTAKT_EIN := TON(¬TAKT_AUS, 0.5)\nTAKT_AUS := TON(TAKT_EIN, 0.5)\n\n// Speicher Tor auf: Taster oder Lichtgitter beim Schließen unterbrochen\nAUF := SR(TASTER_AUF || ZU && ¬LICHTGITTER, ¬TASTER_STOPP || ENDSCHALTER_OBEN)\n\n// Offen und Durchfahrt frei: nach 3 s Vorwarnung, nach 5 s zu\nOFFEN_ZEIT := TON(ENDSCHALTER_OBEN && LICHTGITTER && ¬AUF, 5)\nVORWARNUNG := TON(ENDSCHALTER_OBEN && LICHTGITTER && ¬AUF, 3)\n\n// Speicher Tor zu: Taster oder Zeit, nur bei freiem Lichtgitter\nZU := SR((TASTER_ZU || OFFEN_ZEIT) && ¬AUF && LICHTGITTER, ¬TASTER_STOPP || ENDSCHALTER_UNTEN || ¬LICHTGITTER || AUF)\n\n// Ausgänge\nMOTOR_AUF := AUF\nMOTOR_ZU := ZU\nWARNLEUCHTE := (AUF || ZU || VORWARNUNG) && TAKT_EIN\n',
        kriterien: [
          ['Automatisch zu: 5 s nach dem Öffnen schließt das Tor von selbst', function (R, m) {
            if (steigt(R, 'ENDSCHALTER_OBEN')) { m.t = R.t; m.taster = false; }
            if (m.t != null && (steigt(R, 'TASTER_ZU') || !an(R, 'LICHTGITTER'))) m.taster = true;
            if (m.t != null && steigt(R, 'MOTOR_ZU')) { var d = R.t - m.t; var ok = !m.taster && d >= 4.6 && d <= 6.5; m.t = null; return ok; }
            return false; }],
          ['Vorwarnung: Die Warnleuchte blinkt vor dem automatischen Schließen', function (R, m) {
            if (steigt(R, 'ENDSCHALTER_OBEN')) { m.t = R.t; m.blink = []; }
            if (m.t != null && steigt(R, 'WARNLEUCHTE') && !an(R, 'MOTOR_AUF') && !an(R, 'MOTOR_ZU')) m.blink.push(R.t - m.t);
            if (m.t != null && steigt(R, 'MOTOR_ZU')) { var b = m.blink.filter(function (x) { return x >= 2.5; }).length, frueh = m.blink.filter(function (x) { return x < 2.5; }).length; m.t = null; return b >= 2 && frueh === 0; }
            return false; }],
          ['Lichtgitter beim Schließen unterbrochen: Tor fährt wieder ganz auf', function (R, m) {
            if ((an(R, 'MOTOR_ZU') || warAn(R, 'MOTOR_ZU')) && faellt(R, 'LICHTGITTER')) { m.p = 1; m.t = R.t; }
            if (m.p === 1) { if (R.t - m.t > 0.4 && (an(R, 'MOTOR_ZU') || !an(R, 'MOTOR_AUF') && !an(R, 'ENDSCHALTER_OBEN'))) { m.p = 0; return false; }
              if (an(R, 'ENDSCHALTER_OBEN') && !an(R, 'MOTOR_AUF')) return true; }
            return false; }],
          ['Die Warnleuchte blinkt während der Fahrt', function (R, m) {
            var faehrt = an(R, 'MOTOR_AUF') || an(R, 'MOTOR_ZU');
            if (!faehrt) { m.n = 0; m.aus = 0; return false; }
            if (steigt(R, 'WARNLEUCHTE')) m.n = (m.n || 0) + 1;
            if (faellt(R, 'WARNLEUCHTE')) m.aus = (m.aus || 0) + 1;
            return (m.n || 0) >= 2 && (m.aus || 0) >= 1; }]
        ]
      }
    ]
  };

  var ANLAGEN = [SORTIERANLAGE, ABFUELLSTATION, PRAEGESTATION, BOHRSTATION, ROLLTOR];

  /* ===================================================== Aufgaben bauen */
  function anlageVon(id) { return ANLAGEN.filter(function (a) { return a.id === id; })[0] || null; }
  function hw(a) {
    var h = a.hardware();
    if (Array.isArray(h)) h = { objekte: h, verbindungen: [], items: [] };
    return h;
  }
  function fabrik(a) {
    var h = hw(a);
    return { globalViewMode: a.ansicht, layers: [], pins: [], items: kopie(h.items || []), objects: kopie(h.objekte), pneuConnections: kopie(h.verbindungen || []), fluidPipeConnections: [], fluid: [], sand: [] };
  }
  function typen(a) { var t = {}; a.zuordnung.forEach(function (z) { t[z[0]] = z[2]; }); return t; }
  function adressen(a) { var t = {}; a.zuordnung.forEach(function (z) { t[z[0]] = z[1]; }); return t; }
  function zuordnungText(a) {
    return a.zuordnung.map(function (z) {
      return '- `' + z[0] + '` %' + z[1] + (z[3] ? ', ' + z[3] : '') + ': ' + z[4];
    }).join('\n');
  }
  function aufgabeId(a, stufe) { return 'ua-' + a.id + '-' + (stufe + 1); }

  function aufgabe(anlageId, stufe) {
    var a = typeof anlageId === 'string' ? anlageVon(anlageId) : anlageId;
    if (!a) return null;
    var auf = a.aufgaben[stufe], st = STUFEN[stufe];
    var id = aufgabeId(a, stufe);
    KRIT[id] = auf.kriterien.map(function (k) { return { label: k[0], f: k[1] }; });
    var kopf = '## ' + a.titel + ' – ' + st.name + ': ' + auf.titel + '\n\n';
    var text = kopf + auf.auftrag + '\n\n## Die Anlage\n' + a.beschreibung +
      '\n\nDie Hardware ist fertig aufgebaut und verdrahtet (gesperrt). Du schreibst nur das Programm im Code-Editor. Die Zuordnungsliste (📋 im Sim-Panel) zeigt alle Adressen.\n\n## Zuordnungsliste\n' + zuordnungText(a);
    var t = typen(a), adr = adressen(a), fac = fabrik(a);
    return {
      version: '1.0', type: 'valitask', rssr: 2, id: id,
      name: a.titel + ' ' + (stufe + 1) + ' (' + st.name + '): ' + auf.titel,
      description: text,
      hint: auf.tipp,
      category: 'Übungsanlagen – ' + a.titel,
      difficulty: st.diff,
      enforceMode: 'sps',
      timeLimit: 0,
      solutionMode: 'after_time', solutionMinTime: st.loesungNach, solutionMinDone: 1,
      restrictObjects: 'manual', allowedObjectTypes: [],
      preventDelete: true,
      blockAreas: { factoryNewVars: true },
      conditions: auf.kriterien.map(function (k, i) {
        return { type: 'custom_js', label: k[0], expression: 'window.Uebungsanlagen&&window.Uebungsanlagen.ok("' + id + '",' + i + ')' };
      }),
      preset: { code: auf.vorlage, types: kopie(t), addresses: kopie(adr), layout: 'grid-sim-top', factory: kopie(fac) },
      solution: { code: auf.loesung, types: kopie(t), addresses: kopie(adr), layout: 'grid-sim-top', factory: kopie(fac) },
      uebungsanlage: { anlage: a.id, stufe: stufe }
    };
  }
  // Bedingungen gleich beim Laden anmelden: eine exportierte und wieder
  // importierte Aufgabe dieses Katalogs prüft so ebenfalls
  ANLAGEN.forEach(function (a) { for (var i = 0; i < 3; i++) aufgabe(a, i); });

  function starten(anlageId, stufe) {
    var t = aufgabe(anlageId, stufe);
    if (!t) return;
    try { if (window.closeHub) window.closeHub(); } catch (e) {}
    window._startTask(t);
  }

  /* ===================================================== 3D-Link
   * Musterlösung im Pneumatik-Raum der Virtuellen Werkstatt (t-bk.de). Läuft
   * VALIS dort unter /projekte/valis/, geht der Link relativ, sonst absolut. */
  var WERKSTATT = 'unterrichtsmaterial/werkzeuge/tools/virtuelle-werkstatt-raeume-pneumatik-raum.html';
  function link3d(anlageId, stufe) {
    var t = aufgabe(anlageId, stufe == null ? 2 : stufe);
    if (!t || !window.LZString) return null;
    var daten = { rssr: 2, code: t.solution.code, factory: t.solution.factory, types: t.solution.types, addresses: t.solution.addresses, layout: t.solution.layout };
    var basis = /\/projekte\/valis\//.test(location.pathname) ? location.pathname.replace(/\/projekte\/valis\/.*$/, '/') : 'https://t-bk.de/';
    return basis + WERKSTATT + '#state=' + window.LZString.compressToEncodedURIComponent(JSON.stringify(daten));
  }

  /* ===================================================== Katalog zeichnen */
  var CSS = '' +
    '.ua-kopf{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}' +
    '.ua-titel{font-size:17px;font-weight:700;color:#e3f2fd}' +
    '.ua-sub{font-size:12.5px;color:#90a4ae;line-height:1.5;margin-top:3px}' +
    '.ua-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}' +
    '.ua-karte{background:#1e2733;border:1px solid #2f3d4d;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}' +
    '.ua-karte canvas{width:100%;height:130px;display:block;background:#1a1a2e}' +
    '.ua-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px;flex:1}' +
    '.ua-name{font-weight:700;color:#fff;font-size:14px}' +
    '.ua-kurz{font-size:12px;color:#b0bec5;line-height:1.45}' +
    '.ua-stufe{display:flex;align-items:center;gap:8px;background:#263241;border:1px solid #33475b;border-radius:6px;padding:6px 8px}' +
    '.ua-stufe .ua-badge{font-size:10.5px;font-weight:700;border-radius:10px;padding:1px 8px;color:#fff;min-width:54px;text-align:center}' +
    '.ua-stufe .ua-at{flex:1;font-size:12px;color:#e0e0e0}' +
    '.ua-stufe .ua-ok{font-size:12px}' +
    '.ua-btn{background:#1565c0;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11.5px}' +
    '.ua-btn.ua-zweit{background:#37474f}' +
    '.ua-fuss{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}' +
    '.ua-zl{display:none;font-size:11px;color:#cfd8dc;border-top:1px solid #33475b;padding-top:6px}' +
    '.ua-zl.offen{display:block}' +
    '.ua-zl table{border-collapse:collapse;width:100%}' +
    '.ua-zl td{padding:2px 4px;border-bottom:1px solid #2a3846;vertical-align:top}' +
    '.ua-zl td:first-child{font-family:Consolas,monospace;color:#80cbc4}' +
    '.ua-ml{display:none;white-space:pre-wrap;font-family:Consolas,monospace;font-size:11px;background:#0e141b;color:#c5e1a5;border-radius:4px;padding:6px;max-height:220px;overflow:auto}' +
    '.ua-ml.offen{display:block}';

  function vorschau(canvas, a) {
    var fac = fabrik(a);
    try {
      if (typeof window.renderFactoryPreview === 'function') { window.renderFactoryPreview(canvas, fac.objects); return; }
    } catch (e) {}
    var ctx = canvas.getContext('2d'); ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    fac.objects.forEach(function (o) { minX = Math.min(minX, o.x); minY = Math.min(minY, o.y); maxX = Math.max(maxX, o.x + (o.width || 40)); maxY = Math.max(maxY, o.y + (o.height || 40)); });
    var pad = 10, k = Math.min((canvas.width - 2 * pad) / (maxX - minX || 1), (canvas.height - 2 * pad) / (maxY - minY || 1));
    var farbe = { conveyor: '#607d8b', taster: '#4caf50', nothalt: '#ef5350', led: '#fff176', zylinder_double: '#b0bec5', sensor_reed: '#ce93d8', sensor_ind: '#ffc107', sensor_opt: '#ffb300', despawner: '#795548', rolltor: '#8d6e63', compressor: '#42a5f5', valve_pneu: '#ff9800', throttle: '#90a4ae', pneumatic_zone: 'rgba(66,165,245,0.12)', frame: '#546e7a' };
    fac.objects.forEach(function (o) {
      ctx.fillStyle = farbe[o.type] || '#888';
      ctx.fillRect(pad + (o.x - minX) * k, pad + (o.y - minY) * k, Math.max(2, (o.width || 40) * k), Math.max(2, (o.height || 40) * k));
    });
  }
  function geloest() { try { return JSON.parse(localStorage.getItem('valisTasksSolved') || '{}'); } catch (e) { return {}; } }
  function pro() { try { return typeof window._isProMode === 'function' && window._isProMode(); } catch (e) { return false; } }

  function rendern(el) {
    if (!el) return;
    if (!document.getElementById('ua-css')) { var st = document.createElement('style'); st.id = 'ua-css'; st.textContent = CSS; document.head.appendChild(st); }
    var gl = geloest();
    el.innerHTML = '<div class="ua-kopf"><div><div class="ua-titel">🏭 Übungsanlagen</div>' +
      '<div class="ua-sub">Feste Anlagen, fertig aufgebaut und verdrahtet: Du schreibst nur das Programm. Jede Anlage hat drei Aufgaben auf derselben Hardware – einfach, mittel, fordernd. Die Zuordnungsliste liegt fest; geprüft wird, was die Anlage tut.</div></div></div>' +
      '<div class="ua-raster"></div>';
    var raster = el.querySelector('.ua-raster');
    ANLAGEN.forEach(function (a) {
      var k = document.createElement('div'); k.className = 'ua-karte';
      var cv = document.createElement('canvas'); cv.width = 440; cv.height = 170; k.appendChild(cv);
      var b = document.createElement('div'); b.className = 'ua-body';
      var html = '<div class="ua-name">' + a.icon + ' ' + esc(a.titel) + '</div><div class="ua-kurz">' + esc(a.kurz) + '</div>';
      a.aufgaben.forEach(function (auf, i) {
        var st = STUFEN[i], id = aufgabeId(a, i);
        html += '<div class="ua-stufe"><span class="ua-badge" style="background:' + st.farbe + '">' + st.name + '</span>' +
          '<span class="ua-at">' + esc(auf.titel) + '</span>' + (gl[id] ? '<span class="ua-ok" title="Gelöst">✅</span>' : '') +
          '<button class="ua-btn" data-ua="start" data-i="' + i + '">▶ Starten</button></div>';
      });
      html += '<div class="ua-fuss"><button class="ua-btn ua-zweit" data-ua="zl">📋 Zuordnungsliste</button>' +
        '<button class="ua-btn ua-zweit" data-ua="3d" title="Die Anlage mit Musterlösung im Pneumatik-Raum der Virtuellen Werkstatt">🧊 In 3D</button>' +
        (pro() ? '<button class="ua-btn ua-zweit" data-ua="ml" title="Nur im PRO-Modus sichtbar">💡 Musterlösungen</button>' : '') + '</div>';
      html += '<div class="ua-zl"><table>' + a.zuordnung.map(function (z) {
        return '<tr><td>' + esc(z[0]) + '</td><td>%' + esc(z[1]) + '</td><td>' + esc(z[3] || '') + '</td><td>' + esc(z[4]) + '</td></tr>'; }).join('') + '</table></div>';
      if (pro()) html += '<div class="ua-ml">' + a.aufgaben.map(function (auf, i) { return '// ' + STUFEN[i].name.toUpperCase() + ': ' + auf.titel + '\n' + auf.loesung; }).map(esc).join('\n\n') + '</div>';
      b.innerHTML = html;
      k.appendChild(b);
      raster.appendChild(k);
      vorschau(cv, a);
      b.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-ua]'); if (!btn) return;
        var was = btn.getAttribute('data-ua');
        if (was === 'start') starten(a.id, +btn.getAttribute('data-i'));
        else if (was === 'zl') b.querySelector('.ua-zl').classList.toggle('offen');
        else if (was === 'ml') { var ml = b.querySelector('.ua-ml'); if (ml) ml.classList.toggle('offen'); }
        else if (was === '3d') { var u = link3d(a.id, 2); if (u) window.open(u, '_blank', 'noopener'); }
      });
    });
  }

  window.Uebungsanlagen = {
    liste: function () { return ANLAGEN; },
    aufgabe: aufgabe,
    starten: starten,
    ok: function (id, nr) { return !!(R && R.id === id && R.ok[nr]); },
    rendern: rendern,
    rekorder: function () { return R; },
    link3d: link3d,
    stufen: STUFEN
  };
})();
