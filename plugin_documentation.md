# VALIS Plugin-Dokumentation

Eine vollständige Anleitung zum Erstellen eigener Plugins für die `ComponentRegistry` in `index.html`.

---

## Inhaltsverzeichnis

1. [Grundstruktur eines Plugins](#1-grundstruktur-eines-plugins)
2. [Metadaten-Felder (Pflicht / optional)](#2-metadaten-felder)
3. [Modal-Konfiguration (`modalConfig`)](#3-modal-konfiguration-modalconfig)
4. [Lifecycle-Callbacks](#4-lifecycle-callbacks)
   - [build()](#41-build)
   - [animate()](#42-animate)
   - [physics()](#43-physics)
   - [contextMenu()](#44-contextmenu)
   - [customSensorHit()](#45-customsensorhit)
   - [playSound()](#46-playsound)
5. [Das Objekt-Modell (`obj`)](#5-das-objekt-modell-obj)
6. [Nützliche Hilfsfunktionen](#6-nützliche-hilfsfunktionen)
7. [Komplettes Beispiel-Plugin](#7-komplettes-beispiel-plugin)
8. [Checkliste für neue Plugins](#8-checkliste-für-neue-plugins)

---

## 1. Grundstruktur eines Plugins

Ein Plugin ist ein Objekt-Eintrag innerhalb der `ComponentRegistry` in `index.html`:

```javascript
const ComponentRegistry = {

    'mein_plugin': {
        // --- Metadaten ---
        role: 'output',
        color: '#e91e63',
        noRotate: false,
        isNC: false,
        clickSimulate: false,
        momentary: false,
        sensorSteps: 2,

        // --- Übersetzungen ---
        i18n: {
            de: { name: 'Mein Plugin', desc: 'Kurzbeschreibung auf Deutsch' },
            en: { name: 'My Plugin',   desc: 'Short description in English' }
        },

        // --- UI ---
        meta: { icon: '🔌' },
        menuTarget: '#menu-aktoren',
        menuHtml: `<div onclick="addFactoryDevice('mein_plugin')">🔌 <span data-i18n="plug_mein_plugin_name">Mein Plugin</span></div>`,
        insertBefore: 'div[onclick*="anderes_plugin"]',
        css: `.f2d-mein-plugin { /* CSS für das DOM-Element */ }`,
        directSpawn: false,
        hasHeight: false,
        modalConfig: { t: 'Mein Plugin:', l1: 'SPS Ausgangsvariable', out: true },

        // --- Lifecycle ---
        build:            function(obj, el, var1, var2, var3, hexColor, interval) { },
        animate:          function(obj, spsState) { },
        physics:          function(obj, item, isActive, rad) { },
        contextMenu:      function(obj, ctxMenu, saveCallback) { },
        customSensorHit:  function(targetObj, sensorObj, lx, ly, lw, lh) { },
        playSound:        function(obj, SoundEngine) { },
    },

};
```

---

## 2. Metadaten-Felder

Diese Felder werden vom Framework gelesen und steuern das Verhalten des Plugins im gesamten System, ohne dass an hardcodierten Listen etwas geändert werden muss.

---

### `role`

**Typ:** `'input' | 'output' | 'structure'`
**Standard:** `undefined` (kein Kontextmenü-Variablenfeld)

Bestimmt, welche Art von SPS-Variable im Kontextmenü zur Verknüpfung angeboten wird:

| Wert | Bedeutung | Variablenliste |
|------|-----------|---------------|
| `'input'` | Sensor, Schalter, Eingangs-Signal | Nur Eingangsvariablen |
| `'output'` | Aktor, Aktorgruppe, Ausgangssignal | Nur Ausgangsvariablen |
| `'structure'` | Strukturelement ohne SPS-Verknüpfung | Kein Variablenfeld |

**Wann nötig:** Immer, wenn das Plugin im Kontextmenü eine Variable verknüpfen soll und nicht zur Kerngruppe der eingebauten Typen gehört.

```javascript
role: 'output',   // z.B. Lampe, Motor, Ventil
role: 'input',    // z.B. Sensor, Taster, Schlüsselschalter
role: 'structure',// z.B. Wand, Zone, Dekorelement
```

> **Hinweis:** Wird `role` nicht gesetzt, erscheint kein Variablenfeld im Kontextmenü. Das Plugin kann trotzdem über `build()` eine Variable erhalten, wenn `modalConfig` definiert ist.

---

### `color`

**Typ:** `string` (Hex-Farbe, z.B. `'#e91e63'`)
**Standard:** `'#888'` (grau)

Farbe des Plugins in der **Minimap** (Übersichtskarte). Sollte das Plugin visuell von anderen unterscheidbar machen.

**Wann nötig:** Immer empfohlen. Ohne dieses Feld erscheint das Plugin grau in der Minimap.

```javascript
color: '#4caf50',  // Grün für Sensoren/Eingänge
color: '#f44336',  // Rot für Not-Halt oder Alarm
color: '#2196f3',  // Blau für pneumatische Aktoren
```

---

### `noRotate`

**Typ:** `boolean`
**Standard:** `false`

Wenn `true`, wird der Rotations-Anfasser (Drehgriff) weder beim Erstellen noch im Kontextmenü angezeigt. Das Plugin kann dann nicht vom Benutzer gedreht werden.

**Wann nötig:** Für Objekte, bei denen eine Rotation keinen Sinn ergibt (z.B. flache Schaltflächen, Anzeigen mit festem Ausrichtungskonzept).

```javascript
noRotate: true,   // z.B. Bedienpult-Elemente, flache Displays
noRotate: false,  // Standard: Rotation erlaubt (auch weglassen möglich)
```

---

### `isNC`

**Typ:** `boolean`
**Standard:** `false`

Markiert das Plugin als **Öffner (Normally Closed, NC)**. Das bedeutet:
- Beim Initialisieren ist der SPS-Zustand `true` (unbetätigt = Strom fließt)
- Beim Wechsel von/zu diesem Typ wird der Zustand invertiert
- Im Schaltplan wird ein NC-Symbol gezeichnet (diagonale Linie im Kontakt)

**Wann nötig:** Nur für Sicherheitssensoren und Schutzeinrichtungen (Lichtgitter, Not-Halt, NC-Endschalter), die im Ruhezustand `true` liefern sollen.

```javascript
isNC: true,   // Lichtgitter, Not-Halt, NC-Grenztaster
isNC: false,  // Standard-Schließer (auch weglassen möglich)
```

---

### `clickSimulate`

**Typ:** `boolean`
**Standard:** `false`

Wenn `true`, reagiert das Plugin im **Simulationsmodus** auf Mausklick und schaltet die verknüpfte SPS-Variable. Ohne dieses Flag passiert beim Klick im Simulationsmodus nichts.

**Wann nötig:** Für alle bedienbaren Eingabe-Elemente (Schalter, Taster, Schlüsselschalter), die der Benutzer während der Simulation manuell betätigen soll.

```javascript
clickSimulate: true,  // z.B. Schlüsselschalter, Override-Taster
```

> **Hinweis:** `clickSimulate: true` führt zum **Toggle-Verhalten** (Ein/Aus). Für Momenttaster (nur solange gedrückt halten) muss zusätzlich `momentary: true` gesetzt werden.

---

### `momentary`

**Typ:** `boolean`
**Standard:** `false`

Wenn `true` (und `clickSimulate: true` aktiv), wird die Variable nur gesetzt, solange die Maustaste gedrückt ist. Beim Loslassen geht sie automatisch auf `false` zurück.

**Wann nötig:** Nur für Taster, die im Ruhezustand `false` sein müssen (z.B. Starttaster, Quittierungstaste).

```javascript
clickSimulate: true,
momentary: true,   // Hält nur so lange, wie die Maustaste gedrückt ist
```

---

### `sensorSteps`

**Typ:** `number`
**Standard:** `2`

Anzahl der Abtastschritte beim **Raycast-Sensor-Check** (für `customSensorHit`). Ein höherer Wert erhöht die Präzision, kostet aber mehr Rechenleistung.

**Wann nötig:** Nur relevant, wenn das Plugin als **Sensor** (in `customSensorHit` eines anderen Plugins) verwendet wird, z.B. wenn optische Sensoren dieses Plugin scannen.

```javascript
sensorSteps: 5,  // Optischer Sensor – feine Abtastung
sensorSteps: 2,  // Standard – grobe Abtastung (auch weglassen möglich)
```

---

### `directSpawn`

**Typ:** `boolean`
**Standard:** `false`

Wenn `true`, wird das Plugin beim Klick auf den Menüeintrag **sofort** ohne Modal-Dialog erstellt. Keine Variablenauswahl, keine Farbauswahl.

**Wann nötig:** Für Strukturelemente und Hintergrund-Objekte ohne SPS-Verknüpfung, oder für Anbauteile die immer zuerst an ein anderes Objekt montiert werden müssen.

```javascript
directSpawn: true,   // z.B. Pneumatikzone, Verdichter, L-Schieber
directSpawn: false,  // Standard: Modal-Dialog öffnet sich
```

---

### `hasHeight`

**Typ:** `boolean`
**Standard:** `false`

Wenn `true`, erhält das Plugin einen **XY-Resize-Anfasser** (zweidimensionales Skalieren). Ohne dieses Flag gibt es nur den horizontalen 1D-Resize-Griff.

**Wann nötig:** Für alle Plugins, die eine variable Höhe UND Breite haben sollen (Lichtgitter, Förderzone, Heizelement).

```javascript
hasHeight: true,   // z.B. Lichtgitter, Heizelement, pneumatische Zone
```

> **Hinweis:** Das Plugin muss in `build()` selbst den XY-Resizer als DOM-Element anlegen und in `obj.resizerEl` speichern.

---

### `isFlatBelt`

**Typ:** `boolean`
**Standard:** `false`

Spezielles Flag für die **Physik-Engine**: Markiert das Plugin als flaches Förderelement (Items "reiten" auf der Oberfläche, statt dagegen zu kollidieren). Ersetzt die alte Typenabfrage in der Physik-Engine.

**Wann nötig:** Nur für Förderer und Drehtische, die als horizontale Transportfläche funktionieren sollen.

```javascript
isFlatBelt: true,  // Drehtisch, Förderband-ähnliche Elemente
```

---

## 3. Modal-Konfiguration (`modalConfig`)

Das `modalConfig`-Objekt steuert den Dialog, der beim Hinzufügen des Plugins erscheint (sofern `directSpawn` nicht `true` ist).

```javascript
modalConfig: {
    t: 'Dialogtitel im Modal',
    l1: 'Beschriftung Auswahl 1',   // Pflicht
    l2: 'Beschriftung Auswahl 2',   // Optional: zweites Dropdown
    l3: 'Beschriftung Auswahl 3',   // Optional: drittes Dropdown
    out: true,                       // true = Ausgangsvariablen, false = Eingangsvariablen
    customList: 'timers',            // Optional: spezielle Liste statt SPS-Variablen
}
```

### `t` — Dialog-Titel
Der angezeigte Titel im Modal-Fenster. Beschreibt kurz das Plugin und seinen Typ (Eingang/Ausgang).

### `l1`, `l2`, `l3` — Variablen-Labels
Beschriftungen für die Dropdown-Auswahlfelder. Nur `l1` ist Pflicht. Wenn `l2` vorhanden, erscheint automatisch ein zweites Dropdown; bei `l3` ein drittes.

Die entsprechenden Variablen werden in `build()` als `var1`, `var2`, `var3` übergeben.

### `out` — Variablenrichtung
Steuert, welche SPS-Variablen in den Dropdowns angeboten werden:
- `true` → Ausgangsvariablen (Aktoren, die die SPS schreibt)
- `false` → Eingangsvariablen (Sensoren, die die SPS liest)

### `customList: 'timers'`
Ersetzt das normale Variablen-Dropdown durch eine Liste aller Timer und Zähler aus dem aktuellen Logikplan (`TON`, `TOF`, `TP`, `CTU`). Aktuell nur `'timers'` als Wert unterstützt.

**Beispiele:**

```javascript
// Einfacher Aktor (1 Ausgang)
modalConfig: { t: 'Mein Aktor:', l1: 'SPS Ausgangsvariable', out: true },

// Zylinder mit Auf/Zu (2 Ausgänge)
modalConfig: { t: 'Doppelzylinder:', l1: 'Ausfahren', l2: 'Einfahren', out: true },

// 3-Farben Signallampe
modalConfig: { t: 'Signal-Säule:', l1: 'Rot', l2: 'Gelb', l3: 'Grün', out: true },

// Sensor (1 Eingang)
modalConfig: { t: 'Sensor:', l1: 'SPS Eingangsvariable', out: false },

// Display für Timer
modalConfig: { t: '7-Seg Display:', l1: 'Timer/Zähler auswählen', customList: 'timers' },
```

---

## 4. Lifecycle-Callbacks

### 4.1 `build()`

```javascript
build: function(obj, el, var1, var2, var3, hexColor, interval) { }
```

Wird **einmalig** beim Erstellen des Objekts aufgerufen. Hier wird das DOM-Element aufgebaut und die initialen Eigenschaften des Objekts gesetzt.

**Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `obj` | Object | Das Datenobjekt des Plugins (siehe [Objekt-Modell](#5-das-objekt-modell-obj)) |
| `el` | HTMLElement | Das leere `<div>` des Plugins im Factory-Canvas |
| `var1` | string | Wert aus dem ersten Modal-Dropdown (z.B. SPS-Variable) |
| `var2` | string | Wert aus dem zweiten Modal-Dropdown (oder leer) |
| `var3` | string | Wert aus dem dritten Modal-Dropdown (oder leer) |
| `hexColor` | string | Ausgewählte Farbe als Hex-String (z.B. `'#4caf50'`) |
| `interval` | number | Spawn-Intervall in Sekunden (nur relevant für Spawner) |

**Was hier gesetzt werden muss:**
- `obj.linkedVar` — Hauptvariable (entspricht `var1`)
- `obj.width` und `obj.height` — initiale Größe in Pixeln
- `el.className` — CSS-Klassen für das DOM-Element
- `el.innerHTML` — inneres HTML-Markup des Plugins

**Was hier gesetzt werden kann:**
- `obj.linkedVarExt`, `obj.linkedVarRet`, `obj.linkedVar3` — weitere Variablen
- `obj.useCollision = false` — Kollision deaktivieren
- `obj.useGravity = false` — Schwerkraft deaktivieren
- `obj.isMetallic = true` — für Magnet-Interaktion
- `obj.hexColor` — Farbe am Objekt speichern

**Resize-Anfasser anlegen** (wenn `hasHeight: true` oder 1D-Resize gewünscht):
```javascript
// XY-Anfasser (für hasHeight: true)
let resizer = document.createElement('div');
resizer.className = 'f2d-resize-handle-xy';
obj.resizerEl = resizer;
el.appendChild(resizer);

// 1D-Anfasser (horizontale Größenänderung)
let resizer1d = document.createElement('div');
resizer1d.className = 'f2d-resize-handle';
el.appendChild(resizer1d);
```

**Label anlegen:**
```javascript
let label = document.createElement('div');
label.className = 'f2d-label';
label.textContent = var1;
el.appendChild(label);
```

---

### 4.2 `animate()`

```javascript
animate: function(obj, spsState) { }
```

Wird **jeden Frame** (ca. 60 fps) aufgerufen. Hier wird der visuelle Zustand des Plugins basierend auf dem aktuellen SPS-Zustand aktualisiert.

**Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `obj` | Object | Das Datenobjekt des Plugins |
| `spsState` | Object | Aktueller SPS-Zustand, z.B. `spsState['MOTOR_1'] === true` |

**Typische Muster:**

```javascript
// Ein/Aus-Zustand wechseln
animate: function(obj, spsState) {
    let isActive = !!spsState[obj.linkedVar];
    if (isActive !== obj.isActive) {
        obj.isActive = isActive;
        obj.el.classList.toggle('active', isActive);
    }
},

// Mehrere Variablen (z.B. Signallampe)
animate: function(obj, spsState) {
    obj.el.querySelector('.red').classList.toggle('on', !!spsState[obj.linkedVar]);
    obj.el.querySelector('.yellow').classList.toggle('on', !!spsState[obj.linkedVarRet]);
    obj.el.querySelector('.green').classList.toggle('on', !!spsState[obj.linkedVar3]);
},
```

> **Wichtig:** Auf Zustandsänderungen prüfen (`if (isActive !== obj.isActive)`) bevor DOM-Operationen ausgeführt werden, um unnötige Reflows zu vermeiden.

---

### 4.3 `physics()`

```javascript
physics: function(obj, item, isActive, rad) { }
```

Wird **jeden Frame** für jedes Werkstück (`item`) im Factory-Canvas aufgerufen. Hier werden Kollisionen erkannt und aufgelöst sowie Bewegungen berechnet.

**Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `obj` | Object | Das Datenobjekt des Plugins |
| `item` | Object | Ein einzelnes Werkstück im Canvas |
| `isActive` | boolean | Ob das Plugin gerade aktiv ist (SPS-Variable `true`) |
| `rad` | number | Rotation des Plugins in Radiant (= `obj.rotation * Math.PI / 180`) |

**Wann benötigt:** Nur wenn das Plugin physikalisch mit Werkstücken interagiert (Kollision, Förderung, Umleitung).

**Hilfsfunktionen (verfügbar im Scope):**

```javascript
// OBB-Kollision auflösen (für rechteckige Objekte mit Rotation)
resolveOBBCollision(item, centerX, centerY, halfW, halfH, rotationDeg, type, isActive);

// Prüfen ob ein Werkstück innerhalb eines lokalen Rechtecks liegt
isBlockInLocalRect(item, obj, relX, relY, width, height);
```

**Beispiel – einfache Blockade:**
```javascript
physics: function(obj, item, isActive, rad) {
    let ocx = obj.x + obj.width / 2;
    let ocy = obj.y + obj.height / 2;
    resolveOBBCollision(item, ocx, ocy, obj.width / 2, obj.height / 2, obj.rotation, 'mein_plugin', false);
},
```

---

### 4.4 `contextMenu()`

```javascript
contextMenu: function(obj, ctxMenu, saveCallback) { }
```

Wird aufgerufen, wenn der Benutzer das Plugin **rechtsklickt**. Hier können plugin-spezifische Einstellungen als zusätzliche Menüeinträge eingefügt werden. Das Framework fügt bereits die Standard-Einträge (Löschen, Drehen, Pinnen, Variablenauswahl) hinzu.

**Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `obj` | Object | Das Datenobjekt des Plugins |
| `ctxMenu` | HTMLElement | Das Kontextmenü-`<div>` (Elterncontainer für neue Einträge) |
| `saveCallback` | Function | Muss nach jeder Änderung aufgerufen werden, um den Zustand zu speichern |

**Einträge hinzufügen:**
```javascript
contextMenu: function(obj, ctxMenu, saveCallback) {
    // Trennlinie
    let sep = document.createElement('div');
    sep.style.borderTop = '1px solid #555';
    ctxMenu.appendChild(sep);

    // Slider (z.B. für Druck oder Öffnung)
    let wrap = document.createElement('div');
    wrap.style.cssText = 'padding: 8px 15px;';
    wrap.onclick = e => e.stopPropagation();
    wrap.innerHTML = `<div style="color:#aaa;font-size:10px;">Intensität</div>
        <input type="range" min="0" max="100" value="${obj.intensity || 50}"
               style="width:100%">`;
    wrap.querySelector('input').oninput = e => {
        obj.intensity = parseInt(e.target.value);
        saveCallback();
    };
    ctxMenu.appendChild(wrap);
},
```

---

### 4.5 `customSensorHit()`

```javascript
customSensorHit: function(targetObj, sensorObj, lx, ly, lw, lh) {
    // Muss true zurückgeben, wenn der Sensor getroffen wird
    return false;
}
```

Ermöglicht eine **präzise, maßgeschneiderte Kollisionserkennung** zwischen diesem Plugin (als Zielobjekt) und einem externen Sensor. Wird aufgerufen, wenn ein Sensor (`sensorObj`) prüft, ob er dieses Plugin (`targetObj`) trifft.

**Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `targetObj` | Object | Dieses Plugin (das gescannte Objekt) |
| `sensorObj` | Object | Der abtastende Sensor |
| `lx`, `ly` | number | Lokale X/Y-Startposition des Sensor-Strahls im Sensor-Koordinatensystem |
| `lw`, `lh` | number | Breite und Höhe der Sensor-Abtastfläche |

**Rückgabe:** `true` wenn getroffen, `false` wenn nicht.

**Wann benötigt:** Nur für Plugins mit komplexen, nicht-rechteckigen Kollisionsformen (L-förmige Elemente, mehrschichtige Strukturen), bei denen die Standard-AABB-Kollision zu ungenau wäre.

**Hinweis:** Die Anzahl der Abtastschritte kommt aus dem `sensorSteps`-Metadaten-Feld des **Sensor-Plugins** (nicht des Target-Plugins).

---

### 4.6 `playSound()`

```javascript
playSound: function(obj, SoundEngine) { }
```

Wird aufgerufen, wenn die verknüpfte SPS-Variable eine **steigende Flanke** hat (0 → 1). Hier können eigene Sounds mit der Web Audio API erzeugt werden.

**Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `obj` | Object | Das Datenobjekt des Plugins |
| `SoundEngine` | Object | Zugang zu vordefinierten Sound-Funktionen |

**Verfügbare `SoundEngine`-Methoden:**
```javascript
SoundEngine.clack();       // Relais-Klick (kurzes Knacken)
SoundEngine.pneumatic();   // Pneumatik-Zischen
SoundEngine.beep(freq, duration); // Ton mit Frequenz und Dauer
```

**Beispiel – eigener Sound:**
```javascript
playSound: function(obj, SoundEngine) {
    if (obj.muteSound) return;
    // Eigener Sound via Web Audio API
    let ctx = SoundEngine.ctx; // AudioContext
    if (!ctx) return;
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
},
```

> **Hinweis:** `obj.muteSound` sollte immer geprüft werden – der Benutzer kann Sounds für einzelne Objekte deaktivieren.

---

## 5. Das Objekt-Modell (`obj`)

Das `obj`-Objekt ist der persistente Datenspeicher eines Plugin-Instanz. Es wird beim Speichern serialisiert und beim Laden wiederhergestellt.

### Vom Framework gesetzte Felder (nicht in `build()` setzen)

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | string | Eindeutige ID (zufällig generiert) |
| `type` | string | Plugin-Schlüssel aus der Registry (z.B. `'mein_plugin'`) |
| `x`, `y` | number | Position im Canvas (in Pixeln) |
| `rotation` | number | Rotation in Grad |
| `children` | Array | Angebundene Anbauteile |
| `parent` | Object / null | Elternobjekt (wenn montiert) |
| `color` | string | Farbname aus dem Modal (z.B. `'green'`) |
| `interval` | number | Spawn-Intervall (nur für Spawner) |
| `labelPinned` | boolean | Label-Position gesperrt |

### In `build()` zu setzende Felder

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `obj.linkedVar` | string | Primäre SPS-Variable (`var1`) |
| `obj.linkedVarExt` | string | Zweite Variable (Ausfahren bei Zylinder, `var2`) |
| `obj.linkedVarRet` | string | Dritte Variable (Einfahren bei Zylinder) |
| `obj.linkedVar3` | string | Vierte Variable (z.B. Grün bei Signallampe, `var3`) |
| `obj.width` | number | Breite in Pixeln |
| `obj.height` | number | Höhe in Pixeln |
| `obj.useCollision` | boolean | `false` → Werkstücke kollidieren nicht mit diesem Objekt |
| `obj.useGravity` | boolean | `false` → Objekt fällt nicht (Standard für alle Aktoren) |
| `obj.isMetallic` | boolean | `true` → reagiert auf Magnetsensoren |
| `obj.resizerEl` | HTMLElement | Referenz auf den Resize-Anfasser |
| `obj.el` | HTMLElement | Referenz auf das DOM-Element (wird automatisch gesetzt) |
| `obj.hexColor` | string | Hex-Farbe zur späteren Verwendung |

### Dynamische Felder (für `animate()` und `physics()`)

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `obj.isActive` | boolean | Aktuell aktiver Zustand (für Zustandsvergleiche) |
| `obj.muteSound` | boolean | Ton für dieses Objekt deaktiviert |
| `obj.extension` | number | Ausfahrstrecke (für Zylinder, 0–100%) |
| Beliebige eigene Felder | any | Plugin-spezifische Daten (werden gespeichert/geladen) |

> **Wichtig:** Alle in `obj` gespeicherten Felder werden automatisch im `localStorage` persistiert. DOM-Elemente (`obj.el`, `obj.resizerEl`) werden beim Laden neu erzeugt und müssen **nicht** in der Serialisierung gespeichert werden – das Framework kümmert sich darum.

---

## 6. Nützliche Hilfsfunktionen

Diese globalen Funktionen stehen in allen Callbacks zur Verfügung:

```javascript
// Prüft ob ein Werkstück innerhalb eines lokalen, rotierten Rechtecks liegt
isBlockInLocalRect(item, obj, relX, relY, width, height)

// Löst eine OBB-Kollision (Oriented Bounding Box) auf
resolveOBBCollision(item, centerX, centerY, halfW, halfH, rotationDeg, typeName, isActive)

// Aktuellen SPS-Zustand lesen (außerhalb von animate() / physics())
window.spsState['MEINE_VARIABLE']

// Fabrik-Objekte im Canvas
window.factoryObjects  // Array aller platzierten Objekte
window.factoryItems    // Array aller Werkstücke

// Zustand speichern (immer nach Änderungen in contextMenu aufrufen)
saveFactoryState()

// SPS-Zustands-Objekt (direkt änderbar für eigene Logik)
window.spsState['VARIABLE'] = true;
```

---

## 7. Komplettes Beispiel-Plugin

Ein **Hydraulikaggregat** – ein Aktor mit Statusfarbe, eigenem Sound und einer Druckeinstellung im Kontextmenü.

```javascript
'hydraulic_unit': {
    // --- Metadaten ---
    role: 'output',
    color: '#607d8b',

    // --- Übersetzungen ---
    i18n: {
        de: { name: 'Hydraulikaggregat', desc: 'Pumpt Öl unter Druck (Ausgang)' },
        en: { name: 'Hydraulic Unit',    desc: 'Pumps oil under pressure (output)' }
    },
    meta: { icon: '🛢️' },

    // --- UI ---
    menuTarget: '#menu-aktoren',
    menuHtml: `<div onclick="addFactoryDevice('hydraulic_unit')">🛢️ <span data-i18n="plug_hydraulic_unit_name">Hydraulikaggregat</span></div>`,
    modalConfig: { t: 'Hydraulikaggregat (Ausgang):', l1: 'SPS Ausgangsvariable', out: true },
    css: `
        .f2d-hydraulic { position: absolute; background: #37474f; border: 3px solid #546e7a;
                         border-radius: 4px; display: flex; align-items: center;
                         justify-content: center; font-size: 20px; z-index: 2; }
        .f2d-hydraulic.active { border-color: #2196f3; box-shadow: 0 0 10px #2196f3; }
    `,

    // --- Lifecycle ---
    build: function(obj, el, var1, var2, var3, hexColor, interval) {
        obj.linkedVar = var1;
        obj.width = 70; obj.height = 60;
        obj.pressure = 200;  // bar – plugin-spezifisches Feld
        el.className = 'f2d-obj f2d-hydraulic';
        el.innerHTML = '🛢️';
        let label = document.createElement('div');
        label.className = 'f2d-label'; label.textContent = var1;
        el.appendChild(label);
        let resizer = document.createElement('div');
        resizer.className = 'f2d-resize-handle-xy';
        obj.resizerEl = resizer; el.appendChild(resizer);
        obj.useCollision = false;
    },

    animate: function(obj, spsState) {
        let isActive = !!spsState[obj.linkedVar];
        if (isActive !== obj.isActive) {
            obj.isActive = isActive;
            obj.el.classList.toggle('active', isActive);
        }
    },

    contextMenu: function(obj, ctxMenu, saveCallback) {
        let sep = document.createElement('div');
        sep.style.borderTop = '1px solid #555'; ctxMenu.appendChild(sep);

        let wrap = document.createElement('div');
        wrap.style.cssText = 'padding: 8px 15px;';
        wrap.onclick = e => e.stopPropagation();
        wrap.innerHTML = `
            <div style="color:#aaa;font-size:10px;margin-bottom:3px;">Druck (bar)</div>
            <input type="range" min="50" max="400" step="10" value="${obj.pressure || 200}"
                   style="width:100%; cursor:pointer;">
            <div style="color:#ccc;font-size:11px;text-align:center;">${obj.pressure || 200} bar</div>
        `;
        let inp = wrap.querySelector('input');
        let lbl = wrap.querySelector('div:last-child');
        inp.oninput = e => {
            obj.pressure = parseInt(e.target.value);
            lbl.textContent = obj.pressure + ' bar';
            saveCallback();
        };
        ctxMenu.appendChild(wrap);
    },

    playSound: function(obj, SoundEngine) {
        if (obj.muteSound) return;
        SoundEngine.beep(120, 0.4);  // Tiefes Brummen beim Einschalten
    },
},
```

---

## 8. Checkliste für neue Plugins

Vor dem Eintragen in die `ComponentRegistry` prüfen:

- [ ] **Schlüsselname** ist eindeutig und enthält nur Kleinbuchstaben und Unterstriche
- [ ] **`role`** korrekt gesetzt (`'input'`, `'output'`, `'structure'` oder weggelassen)
- [ ] **`color`** als Hex-Farbe definiert (für die Minimap)
- [ ] **`i18n`** mit deutschen und englischen Einträgen vorhanden
- [ ] **`meta.icon`** gesetzt (Emoji für die Plugin-Manager-Anzeige)
- [ ] **`menuTarget`** zeigt auf ein vorhandenes Menü-Element (`#menu-aktoren`, `#menu-sensoren`, `#menu-bedienpult`, `#menu-anbauteile`)
- [ ] **`menuHtml`** enthält einen Button mit korrektem `onclick="addFactoryDevice('schluessel')"` und `data-i18n="plug_schluessel_name"`
- [ ] **`modalConfig`** vollständig (Titel, Labels, `out`-Richtung)
- [ ] **`build()`** setzt `obj.linkedVar`, `obj.width`, `obj.height`, `el.className`, `el.innerHTML`
- [ ] **`build()`** legt Resize-Anfasser an, wenn `hasHeight: true` oder 1D-Resize nötig
- [ ] **`animate()`** prüft Zustandsänderung vor DOM-Operationen (`if (isActive !== obj.isActive)`)
- [ ] **`playSound()`** prüft `obj.muteSound` vor dem Abspielen
- [ ] **`contextMenu()`** ruft `saveCallback()` nach jeder Parameteränderung auf
- [ ] Plugin-spezifische CSS-Klassen beginnen mit `.f2d-` um Konflikte zu vermeiden

---

## Menü-Ziele (`menuTarget`)

| Selektor | Beschreibung |
|----------|-------------|
| `#menu-aktoren` | Aktoren: Motoren, Zylinder-Zubehör, Lüfter, Kräne |
| `#menu-sensoren` | Sensoren: optisch, induktiv, magnetisch, Lichtgitter |
| `#menu-bedienpult` | Bedienpanel: Taster, Schalter, Displays, Signallampen |
| `#menu-anbauteile` | Anbauteile für Zylinder: L-Schieber, Pressstempel |
