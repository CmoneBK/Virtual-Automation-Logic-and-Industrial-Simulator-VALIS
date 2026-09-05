🌍 *Read this in other languages: [English](#english-version) | [Deutsch](#deutsche-version)*

---

# <a id="deutsche-version"></a>VALIS selbst hosten – optionale Umgebungen („Accountsystem")

VALIS läuft vollständig im Browser und braucht **keinen Server**. Wer es auf einen
eigenen Webserver mit PHP und MySQL/MariaDB stellt, schaltet zusätzlich eine
optionale Server-Funktion frei: **persönliche Umgebungen**, in denen Nutzer ihre
Stände speichern und geräteübergreifend wieder abrufen können.

## Was du bekommst – und was sich ohne Server ändert

| | ohne Server (z. B. GitHub Pages) | mit Server |
|---|---|---|
| Alle Simulations- und Editor-Funktionen | ✅ | ✅ |
| Speichern im Browser (`localStorage`) | ✅ | ✅ |
| Teilen über `#state=`-Links & QR | ✅ | ✅ |
| Persönliche Umgebung, geräteübergreifend | – | ✅ |
| Zugangs-Links | – | ✅ |

**Nichts Bestehendes wird ersetzt.** Die Server-Funktion ist rein additiv;
`localStorage` bleibt der Arbeitsspeicher, der Server ist Ablage- und Sync-Ziel.

### Wie VALIS merkt, wo es läuft

Beim Start ruft der Client `api/ping.php` auf:

* Antwortet die Datei mit `{"valis_api":1,...,"db":true}` → Umgebungen werden freigeschaltet.
* Wird sie **als Rohtext ausgeliefert** (GitHub Pages führt kein PHP aus), schlägt
  `JSON.parse` fehl → alles bleibt exakt wie vorher.

Es wird also **kein Hostname geprüft**, sondern die Fähigkeit selbst. Ein Fork auf
GitHub Pages verhält sich dadurch automatisch wie das unveränderte VALIS – ohne
dass du etwas ausbauen müsstest.

> Die PHP-Dateien sind auf GitHub Pages öffentlich als Quelltext lesbar. Das ist
> eingeplant: Die Sicherheit beruht ausschließlich auf Hashing, Entropie und
> Rate-Limits – **nie** darauf, dass jemand den Code nicht kennt. Deshalb dürfen
> in `api/` niemals Zugangsdaten stehen.

## Voraussetzungen

* **PHP 8.1 oder neuer** (die API nutzt den `never`-Rückgabetyp)
* Erweiterungen: **pdo_mysql**, **mbstring**, **json**
* **MySQL 5.7+ / MariaDB 10.3+**
* Apache (nutzt die mitgelieferte `.htaccess`) oder nginx (siehe unten)
* **HTTPS** – Zugangscodes gehören nicht über unverschlüsselte Verbindungen
* Ein Verzeichnis **außerhalb des Webroots** für die Konfiguration

## Installation

### 1. Dateien bereitstellen

Repository auf den Webserver legen, sodass `index.html` und der Ordner `api/`
unter derselben Herkunft (Origin) erreichbar sind, z. B.
`https://example.org/valis/` mit `https://example.org/valis/api/ping.php`.

> Die API setzt **bewusst keine CORS-Header**. Sie ist damit ausschließlich von
> der eigenen Installation aus nutzbar – fremde Kopien können sie nicht ansprechen.

### 2. Datenbank anlegen

```bash
mysql -u root -p -e "CREATE DATABASE valis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER 'valis'@'localhost' IDENTIFIED BY 'EIN_SICHERES_PASSWORT';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON valis.* TO 'valis'@'localhost'; FLUSH PRIVILEGES;"
mysql -u valis -p valis < api/schema.sql
```

Prüfen: `SHOW TABLES;` muss `environments`, `objects`, `rate_limits`,
`sessions`, `shares` und `library` zeigen.

> **Bestehende Installationen** brauchen einmalig:
>
>     mysql -u valis -p valis < api/migrate-live.sql
>     mysql -u valis -p valis < api/migrate-devicelinks.sql
>     mysql -u valis -p valis < api/migrate-penrequest.sql
>     mysql -u valis -p valis < api/migrate-livemode.sql
>     mysql -u valis -p valis < api/migrate-presence.sql
>     mysql -u valis -p valis < api/migrate-library.sql
>
> Ohne die drei Spalten `live_on`, `live_owner`, `live_until` schlägt die
> Aktion `live` fehl; alles andere läuft unverändert weiter.
>
> Die Migrationen sind **nicht wiederholbar**: `ERROR 1060 Duplicate column`
> bedeutet schlicht, dass die Spalte schon da ist – der Fehler ist folgenlos.
> Absichtlich kein `ADD COLUMN IF NOT EXISTS`, das kennt nur MariaDB, nicht
> MySQL. Was wirklich zählt, sagt dir die Kontrolle:
>
>     mysql -u valis -p valis -e "SHOW TABLES; SHOW COLUMNS FROM environments;"

> Nutze für das Datenbank-Passwort am besten nur Buchstaben und Ziffern.
> Zeichen wie `\`, `"`, `$` oder `&` sorgen beim Eintragen in Shell und PHP
> regelmäßig für schwer auffindbare Fehler.

### 3. Konfiguration außerhalb des Webroots

`api/config.sample.php` ist nur eine Vorlage – **niemals** ausgefüllt in `api/`
liegen lassen, sie wäre über HTTP abrufbar.

```bash
mkdir -p /srv/valis-secrets && chmod 700 /srv/valis-secrets
cp api/config.sample.php /srv/valis-secrets/config.php
chmod 600 /srv/valis-secrets/config.php
chown www-data:www-data -R /srv/valis-secrets     # Benutzer des PHP-FPM-Pools!

php -r 'echo "pepper: ", bin2hex(random_bytes(32)), "\ngc_key: ", bin2hex(random_bytes(16)), "\n";'
```

Datenbankzugang, `pepper` und `gc_key` eintragen. Gefunden wird die Datei über:

1. die Umgebungsvariable `VALIS_CONFIG`
   (Apache: `SetEnv VALIS_CONFIG /srv/valis-secrets/config.php`), sonst
2. automatisch: vom `DOCUMENT_ROOT` aus bis zu fünf Ebenen nach oben, je Ebene
   `files/valis-secrets/config.php` und `valis-secrets/config.php`.

> ⚠️ **Der `pepper` darf nie geändert werden.** Alle Zugangscodes sind mit ihm
> gehasht – ändert er sich, sperrst du sämtliche Nutzer dauerhaft aus.
> ⚠️ Die Datei muss dem **PHP-Benutzer** gehören. `chmod 600` mit Eigentümer
> `root` führt zu `config_missing`, obwohl die Datei existiert.

### 4. Interne Dateien sperren

Apache erledigt das über die mitgelieferte `api/.htaccess` (`AllowOverride`
muss aktiv sein). Für **nginx** stattdessen in den Server-Block:

```nginx
location ~ ^/valis/api/(_boot|config\.sample)\.php$ { deny all; }
location ~ ^/valis/api/.*\.(sql|md|sample)$        { deny all; }
```

Gegenprobe – beides muss **403 oder 404** liefern:

```bash
curl -sI https://example.org/valis/api/_boot.php  | head -1
curl -sI https://example.org/valis/api/schema.sql | head -1
```

### 5. Prüfen

```bash
curl -s https://example.org/valis/api/ping.php; echo
```

| Antwort | Bedeutung |
|---|---|
| `"db":true,"reason":null` | fertig – Umgebungen sind aktiv |
| `"reason":"config_missing"` | Config nicht gefunden **oder** für PHP nicht lesbar |
| `"reason":"db_error"` | Config gefunden, Datenbankzugang falsch (PHP-Error-Log ansehen) |
| kein JSON / 404 | PHP läuft für diesen Pfad nicht |

Danach `index.html` neu laden: Es erscheint der Button **☁️ Meine Umgebung**.

### 6. Aufräumen per Cron

Löscht abgelaufene Sitzungen, alte Rate-Limit-Zeilen und – als Löschkonzept –
Umgebungen, die länger als `inactive_delete_days` unberührt sind.

```cron
5 3 * * * curl -fsS "https://example.org/valis/api/gc.php?key=DEIN_GC_KEY" >/dev/null
```

## Einstellungen

Alle in `config.php`:

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `allow_open_signup` | `true` | Jeder darf per Klick eine Umgebung anlegen |
| `signup_secret` | `''` | Bei `allow_open_signup = false` nötiges Einladungsgeheimnis |
| `quota_bytes` | 5 MiB | Speicher je Umgebung |
| `quota_objects` | 300 | Objekte je Umgebung |
| `max_object_bytes` | 2 MiB | größtes einzelnes Objekt |
| `session_ttl_days` | 60 | Gültigkeit eines Geräte-Logins |
| `inactive_delete_days` | 365 | automatische Löschung inaktiver Umgebungen |
| `signup_per_ip_day` | 20 | Neuanlagen je IP und Tag |
| `login_max_fails` | 10 | Fehlversuche bis zur Sperre |
| `curator_key` | `''` | Schlüssel, mit dem eine Umgebung Kurator der Bibliothek wird |
| `allow_library_submit` | `true` | dürfen normale Umgebungen etwas einreichen? |

Bei offener Registrierung ist dein Server eine **offen beschreibbare API**.
Quota, Rate-Limits und die automatische Löschung sind die Bremsen dafür. Wird sie
missbraucht, setze `allow_open_signup` auf `false` und vergib ein `signup_secret`.

## Bibliothek

Die Bibliothek ist eine **zusätzliche**, serverseitige Sammlung von Aufgaben,
Aufgabenpaketen und Anlagen – die in `index.html` eingebauten Beispiele bleiben
unverändert erhalten und funktionieren auch ohne Server. **Lesen und Übernehmen
geht ohne Anmeldung**, damit die Bibliothek der öffentliche Teil deiner
Installation sein kann.

Veröffentlicht wird immer eine **Kopie**. Wer später in seiner Umgebung etwas
ändert, ändert damit nicht den Bibliothekseintrag – und wer eine Umgebung löscht,
reißt keine Einträge mit (`env_id` wird dann auf `NULL` gesetzt).

### Kurator-Schlüssel

Der Schlüssel **gehört nicht ins Repository**. Er wird auf dem Server erzeugt und
nur in die Konfiguration außerhalb des Webroots geschrieben:

```bash
php -r "echo bin2hex(random_bytes(16)), PHP_EOL;"
# Ergebnis in config.php bei 'curator_key' eintragen
```

In VALIS wird er **einmal** eingegeben (Bibliothek → „Kurator werden“). Der Server
vergleicht ihn zeitkonstant und setzt danach `environments.is_curator = 1`. Der
Schlüssel wird im Browser **nicht gespeichert** – das Recht hängt an der Umgebung,
nicht am Gerät, und gilt damit auf jedem Gerät, das in dieser Umgebung angemeldet
ist. Bleibt `curator_key` leer, kann niemand Kurator werden.

Ohne Kurator-Recht landet Eingereichtes in `pending` und ist für niemanden
sichtbar außer für den Einreichenden selbst und für Kuratoren. Kuratoren
veröffentlichen direkt. Wer keine Moderation will, setzt
`allow_library_submit` auf `false`: dann füllen nur noch Kuratoren die Bibliothek.

## Sicherheits- und Datenschutz-Design

* **Keine personenbezogenen Stammdaten:** kein Name, keine E-Mail, kein
  Geburtsdatum, keine Adresse. Der Zugang ist allein ein Zufallscode.
* **Keine Zuordnungstabelle Code → Person.** Das ist bewusst so und die
  Grundlage dafür, dass die Serverdaten für den Betreiber nicht personenbezogen
  sind. Führt jemand eine solche Liste (etwa „Lehrkraft vergibt Codes"), sind die
  Daten **pseudonym und damit personenbezogen** – mit allen Pflichten daraus.
* **Codes:** 75 Bit Entropie, gespeichert nur als SHA-256 mit serverseitigem
  Pepper. Der Klartext verlässt den Server nie und wird nirgends abgelegt.
* **PIN** (optional, 4–6 Ziffern): `password_hash` plus Sperre nach zu vielen
  Fehlversuchen.
* **IP-Adressen** landen nur als tagesgesalzener Hash in `rate_limits`, mit
  begrenzter Lebensdauer. **Deine Webserver-Logs sind davon unabhängig** – wer
  ohne Personenbezug arbeiten will, sollte sie anonymisieren oder kurz halten.
* **Zugangs-Links** transportieren den Code im **Fragment** (`#env=…`), nicht in
  der Query. Fragmente werden nie an den Server gesendet und tauchen daher nicht
  in den Access-Logs auf.
* **Inhalte sind Freitext.** Nutzer können Namen in Aufgabentexte oder Kommentare
  schreiben. Das macht den Inhalt personenbezogen, unabhängig vom Zugangscode.

> Diese Beschreibung ist eine technische Einordnung, keine Rechtsberatung. Wer
> VALIS in einer Schule oder einem Unternehmen betreibt, klärt Verantwortlichkeit,
> Auftragsverarbeitung und Löschkonzept mit der zuständigen Stelle.

## Grenzen

* **Es gibt keine Wiederherstellung.** Ohne Zuordnung Code → Person kann niemand
  eine Identität bestätigen. Ein verlorener Code bedeutet den Verlust der
  Umgebung. Die Oberfläche zeigt den Code deshalb einmalig an und verlangt eine
  ausdrückliche Bestätigung.
* **Ein Zugangs-Link ist ein Passwort**, kein Freigabe-Link: Wer ihn hat, kann
  alles ändern. Ohne gesetzte PIN genügt er allein.
* Gespeichert wird derzeit nur das **Session-Bündel** (Code, Bauteiltypen,
  Layout, 2D-Anlage, Plugins, Tastenbelegung). Aufgaben, Szenarien und Pakete
  sind im Schema vorgesehen, aber noch nicht angebunden.
* Freigabe-Links (`#s=TOKEN`) sind read-only und je Objekt einmalig aktiv;
  ein neuer Link macht den vorherigen ungültig.
* **Gemeinsam bearbeiten – zwei Betriebsarten**, je Sitzung wählbar:
  * **Stift-Weitergabe:** Einer bearbeitet, die anderen lesen mit und sind
    schreibgeschützt. Ruhig und eindeutig.
  * **Echtzeit:** Alle bearbeiten gleichzeitig. Die Stände werden per
    Dreiwege-Zusammenführung verschmolzen – Code zeilenweise, 2D-Objekte und
    Bauteiltypen einzeln. Ändern zwei dieselbe Zeile, gewinnt die
    Serverfassung und es wird gemeldet. Die Material-Partikel der Simulation
    bleiben absichtlich lokal, sie ändern sich in jedem Takt.
    Das nutzt VALIS' Code-First-Eigenschaft: Schreibt ein Generator den Code
    komplett neu, bleibt nach dem Diff nur die tatsächlich geänderte Zeile
    übrig – gleichzeitiges Tippen überlebt.

* **Anwesenheit:** In beiden Betriebsarten sieht man die **Schreibmarke der
  anderen im Code-Editor** (farbig, mit Namensfähnchen) und ihren **Mauszeiger
  in der 2D-Anlage**. Die Position wird in Anlagenkoordinaten übertragen, damit
  sie trotz unterschiedlichem Zoom bei allen an derselben Stelle landet.
  Übertragen werden **keine Namen** – Farbe und Bezeichnung leitet der Client
  aus der zufälligen Gerätekennung ab.
  Getaktet mit 1 s bei Aktivität, 3 s bei Untätigkeit, im Hintergrundtab gar
  nicht. Gemessen kostet eine Anfrage ~2 ms, 30 Teilnehmer belegen damit
  rechnerisch 0,06 PHP-Prozesse – die Last ist vernachlässigbar.

* **Stift-Weitergabe im Detail:** Auf einem Sitzungs-Eintrag
  lässt sich die gemeinsame Bearbeitung einschalten. Es hat immer genau
  **einer den Stift** und darf ändern; alle anderen sehen dessen Stand live
  und sind währenddessen schreibgeschützt (dieselben Sperren wie in einer
  Aufgabe) – aber nur, solange tatsächlich jemand anders den Stift hält. Ist er
  **frei**, dürfen alle arbeiten; wer ihn dann übernimmt, gibt seinen Stand vor.
  Der Stift läuft über einen Herzschlag ab – wer den Tab schließt,
  gibt ihn nach ~25 Sekunden von selbst frei. Bewusst kein CRDT: In VALIS
  schreiben Logikplan, Schaltplan-Editor, FESTO-Freibau und Schrittketten den
  Code jeweils komplett neu, was für ein CRDT wie „alles löschen, alles neu
  einfügen" aussieht und gleichzeitige Änderungen zerstören würde.
* **Live-Abgleich:** Sind mehrere Geräte in derselben Umgebung angemeldet,
  gleichen sie Aufgaben, Pakete und Szenarien alle 5 Sekunden ab (`obj.php`,
  Aktion `poll`). Bewusst per Polling statt SSE/Long-Polling: eine offene
  Verbindung je Schüler würde die PHP-FPM-Prozesse belegen und den Server bei
  einer ganzen Klasse lahmlegen. Der Abruf liefert nur Kopfdaten; Inhalte werden
  einzeln nachgeholt. Im Hintergrundtab wird nicht abgefragt.
  Der **Arbeitsstand im Editor** wird NICHT live übertragen – gleichzeitiges
  Tippen würde sich sonst gegenseitig überschreiben.
* **Automatisches Speichern** erfasst Aufgaben, Aufgabenpakete, Szenarien und
  Szenario-Pakete, solange eine Umgebung angemeldet ist. **Mitgelieferte
  Beispielaufgaben werden dabei übersprungen** – erst wenn jemand eine davon
  bearbeitet, wird sie gespeichert. **Löschungen werden
  bewusst nicht übertragen** – sonst würde ein Gerät mit weniger Inhalten die
  Umgebung leerräumen. Löschen geschieht ausdrücklich im Panel.
* Bei einem echten Versionskonflikt wird **nicht** überschrieben; das Element
  bleibt ungespeichert und wird im Panel als Konflikt gemeldet.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| Button erscheint nicht | `ping.php` liefert kein JSON oder `db:false` – im Browser direkt aufrufen |
| `config_missing` | Pfad falsch **oder** PHP-Benutzer darf die Datei nicht lesen (`chown`) |
| `db_error` | Zugangsdaten falsch; genaue Meldung im PHP-Error-Log |
| `rate_limited` beim Testen | `signup_per_ip_day` erreicht – Wert erhöhen oder vorhandenes Token nutzen |
| `unauthorized` | Sitzung abgelaufen (`session_ttl_days`) – neu anmelden |
| Alle Codes plötzlich ungültig | Der `pepper` wurde geändert. Nicht umkehrbar. |

### `db_error` – Access denied

Der mit Abstand häufigste Fall: Das Datenbank-Passwort wurde im Hosting-Panel
(KeyHelp, Plesk, cPanel) gewechselt, die `config.php` behielt das alte. Von Hand
anmelden klappt dann, PHP nicht. Prüfen, ob genau der String funktioniert, den
PHP liest – ohne ihn anzuzeigen:

```bash
CFG=/pfad/zu/valis-secrets/config.php
php -r "\$c=require '$CFG';
  printf('user=%s name=%s pass_len=%d' . PHP_EOL, \$c['db_user'], \$c['db_name'], strlen(\$c['db_pass']));"
PW=$(php -r "\$c=require '$CFG'; echo \$c['db_pass'];")
MYSQL_PWD="$PW" mysql -u DBUSER DBNAME -e "SELECT 1;" && echo OK || echo FALSCH
unset PW
```

Wechsle das Passwort danach **im Panel**, nicht per `ALTER USER` – sonst kennt
das Panel den neuen Wert nicht und seine phpMyAdmin-Anmeldung bricht.

> **`sed -i` als root zerstört die Dateirechte.** Es schreibt eine neue Datei
> und benennt sie um; die gehört danach root, und der PHP-Benutzer kann sie
> nicht mehr lesen – Symptom: `config_missing`. Entweder als der richtige
> Benutzer bearbeiten oder Eigentümer und Rechte anschließend wiederherstellen
> (`chown --reference=…`).

---

# <a id="english-version"></a>Self-hosting VALIS – optional environments ("account system")

VALIS runs entirely in the browser and needs **no server**. Hosting it on your own
web server with PHP and MySQL/MariaDB unlocks one optional server feature:
**personal environments** where users can store their work and retrieve it across
devices.

## What you get – and what changes without a server

| | without a server (e.g. GitHub Pages) | with a server |
|---|---|---|
| All simulation and editor features | ✅ | ✅ |
| Saving in the browser (`localStorage`) | ✅ | ✅ |
| Sharing via `#state=` links & QR | ✅ | ✅ |
| Personal environment, across devices | – | ✅ |
| Access links | – | ✅ |

**Nothing existing is replaced.** The server feature is purely additive;
`localStorage` remains the working store, the server is a sync/storage target.

### How VALIS detects where it runs

On startup the client calls `api/ping.php`:

* If it answers `{"valis_api":1,...,"db":true}` → environments are enabled.
* If it is **served as raw text** (GitHub Pages does not execute PHP),
  `JSON.parse` fails → everything stays exactly as before.

So there is **no hostname check** – the capability itself is probed. A fork on
GitHub Pages therefore behaves like unmodified VALIS with no work on your part.

> On GitHub Pages the PHP files are publicly readable as source. That is by
> design: security rests solely on hashing, entropy and rate limits – **never** on
> the code being secret. Credentials must therefore never live inside `api/`.

## Requirements

* **PHP 8.1 or newer** (the API uses the `never` return type)
* Extensions: **pdo_mysql**, **mbstring**, **json**
* **MySQL 5.7+ / MariaDB 10.3+**
* Apache (uses the bundled `.htaccess`) or nginx (see below)
* **HTTPS** – access codes must not travel over plain HTTP
* A directory **outside the web root** for the configuration

## Installation

### 1. Deploy the files

Place the repository on your web server so that `index.html` and the `api/`
folder share the same origin, e.g. `https://example.org/valis/` with
`https://example.org/valis/api/ping.php`.

> The API deliberately sends **no CORS headers**. It is therefore usable only
> from your own installation – other copies cannot reach it.

### 2. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE valis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER 'valis'@'localhost' IDENTIFIED BY 'A_STRONG_PASSWORD';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON valis.* TO 'valis'@'localhost'; FLUSH PRIVILEGES;"
mysql -u valis -p valis < api/schema.sql
```

Verify: `SHOW TABLES;` must list `environments`, `objects`, `rate_limits`,
`sessions`, `shares` and `library`.

> **Existing installations** need this once:
>
>     mysql -u valis -p valis < api/migrate-live.sql
>     mysql -u valis -p valis < api/migrate-devicelinks.sql
>     mysql -u valis -p valis < api/migrate-penrequest.sql
>     mysql -u valis -p valis < api/migrate-livemode.sql
>     mysql -u valis -p valis < api/migrate-presence.sql
>     mysql -u valis -p valis < api/migrate-library.sql
>
> Without the three columns `live_on`, `live_owner`, `live_until` the `live`
> action fails; everything else keeps working unchanged.
>
> The migrations are **not repeatable**: `ERROR 1060 Duplicate column` simply
> means the column is already there – the error is harmless. Deliberately no
> `ADD COLUMN IF NOT EXISTS`, which MariaDB has but MySQL does not. What
> matters is the result:
>
>     mysql -u valis -p valis -e "SHOW TABLES; SHOW COLUMNS FROM environments;"

> Prefer an alphanumeric database password. Characters such as `\`, `"`, `$` or
> `&` reliably cause hard-to-find quoting bugs in shell and PHP.

### 3. Configuration outside the web root

`api/config.sample.php` is a template only – **never** leave a filled-in copy
inside `api/`, it would be reachable over HTTP.

```bash
mkdir -p /srv/valis-secrets && chmod 700 /srv/valis-secrets
cp api/config.sample.php /srv/valis-secrets/config.php
chmod 600 /srv/valis-secrets/config.php
chown www-data:www-data -R /srv/valis-secrets     # your PHP-FPM pool user!

php -r 'echo "pepper: ", bin2hex(random_bytes(32)), "\ngc_key: ", bin2hex(random_bytes(16)), "\n";'
```

Fill in database credentials, `pepper` and `gc_key`. The file is located via:

1. the environment variable `VALIS_CONFIG`
   (Apache: `SetEnv VALIS_CONFIG /srv/valis-secrets/config.php`), otherwise
2. automatically: walking up to five levels from `DOCUMENT_ROOT`, checking
   `files/valis-secrets/config.php` and `valis-secrets/config.php` at each level.

> ⚠️ **Never change the `pepper`.** All access codes are hashed with it – changing
> it locks out every user permanently.
> ⚠️ The file must be owned by the **PHP user**. `chmod 600` owned by `root`
> yields `config_missing` even though the file exists.

### 4. Block internal files

Apache handles this via the bundled `api/.htaccess` (requires `AllowOverride`).
For **nginx**, add to your server block instead:

```nginx
location ~ ^/valis/api/(_boot|config\.sample)\.php$ { deny all; }
location ~ ^/valis/api/.*\.(sql|md|sample)$        { deny all; }
```

Verify – both must return **403 or 404**:

```bash
curl -sI https://example.org/valis/api/_boot.php  | head -1
curl -sI https://example.org/valis/api/schema.sql | head -1
```

### 5. Check

```bash
curl -s https://example.org/valis/api/ping.php; echo
```

| Response | Meaning |
|---|---|
| `"db":true,"reason":null` | done – environments are live |
| `"reason":"config_missing"` | config not found **or** not readable by PHP |
| `"reason":"db_error"` | config found, database credentials wrong (see PHP error log) |
| no JSON / 404 | PHP is not running for this path |

Then reload `index.html`: a **☁️ My environment** button appears.

### 6. Housekeeping via cron

Removes expired sessions, stale rate-limit rows and – as the retention policy –
environments untouched for longer than `inactive_delete_days`.

```cron
5 3 * * * curl -fsS "https://example.org/valis/api/gc.php?key=YOUR_GC_KEY" >/dev/null
```

## Settings

All in `config.php`:

| Key | Default | Meaning |
|---|---|---|
| `allow_open_signup` | `true` | Anyone may create an environment with one click |
| `signup_secret` | `''` | Invite secret required when `allow_open_signup = false` |
| `quota_bytes` | 5 MiB | storage per environment |
| `quota_objects` | 300 | objects per environment |
| `max_object_bytes` | 2 MiB | largest single object |
| `session_ttl_days` | 60 | lifetime of a device login |
| `inactive_delete_days` | 365 | automatic deletion of inactive environments |
| `signup_per_ip_day` | 20 | new environments per IP per day |
| `login_max_fails` | 10 | failed attempts before lockout |
| `curator_key` | `''` | key that turns an environment into a library curator |
| `allow_library_submit` | `true` | may ordinary environments submit entries? |

With open signup your server is a **publicly writable API**. Quotas, rate limits
and automatic deletion are the brakes. If it gets abused, set
`allow_open_signup` to `false` and hand out a `signup_secret`.

## Library

The library is an **additional**, server-side collection of tasks, task packages
and plants – the examples built into `index.html` stay untouched and keep working
without a server. **Reading and taking a copy needs no login**, so the library can
be the public face of your installation.

Publishing always stores a **copy**. Later edits in the author's environment do
not change the library entry, and deleting an environment does not take entries
with it (`env_id` becomes `NULL`).

### Curator key

**Never put the key in the repository.** Generate it on the server and write it
only into the configuration outside the web root:

```bash
php -r "echo bin2hex(random_bytes(16)), PHP_EOL;"
# put the result into config.php under 'curator_key'
```

It is entered **once** in VALIS (Library → "Become curator"). The server compares
it in constant time and then sets `environments.is_curator = 1`. The key is **not
stored in the browser** – the right belongs to the environment, not the device, so
it applies on every device logged into that environment. An empty `curator_key`
means nobody can become a curator.

Without curator rights a submission lands in `pending`, visible only to its author
and to curators. Curators publish directly. If you do not want to moderate at all,
set `allow_library_submit` to `false`: then only curators can fill the library.

## Security and data-protection design

* **No personal master data:** no name, no e-mail, no date of birth, no address.
  Access is a random code, nothing else.
* **No mapping table code → person.** This is deliberate and is what makes the
  stored data non-personal for the operator. If anyone keeps such a list (e.g.
  "teacher hands out codes"), the data becomes **pseudonymous and therefore
  personal data**, with all obligations that follow.
* **Codes:** 75 bits of entropy, stored only as SHA-256 with a server-side
  pepper. The plaintext never leaves the server and is never persisted.
* **PIN** (optional, 4–6 digits): `password_hash` plus lockout after repeated
  failures.
* **IP addresses** are stored only as a daily-salted hash in `rate_limits`, with
  a limited lifetime. **Your web server logs are separate** – if you want to keep
  personal data out, anonymise them or keep retention short.
* **Access links** carry the code in the **fragment** (`#env=…`), not the query.
  Fragments are never sent to the server and thus never appear in access logs.
* **Content is free text.** Users can type names into task descriptions or
  comments, which makes the content personal data regardless of the access code.

> This is a technical description, not legal advice. If you run VALIS in a school
> or company, clarify controllership, processing agreements and retention with
> the responsible body.

## Limitations

* **There is no recovery.** Without a code → person mapping nobody can confirm an
  identity. A lost code means a lost environment. The UI therefore shows the code
  once and requires explicit acknowledgement.
* **An access link is a password**, not a sharing link: whoever holds it can
  change everything. Without a PIN it is sufficient on its own.
* Only the **session bundle** is stored so far (code, component types, layout,
  2D factory, plugins, key bindings). Tasks, scenarios and packages are covered
  by the schema but not wired up yet.
* Share links (`#s=TOKEN`) are read-only and one active link per object;
  creating a new one invalidates the previous.
* **Collaborative editing (passing the pen):** Collaboration can be switched
  on from a session entry. Exactly **one device holds the pen** and may edit;
  everyone else follows live and is write-protected meanwhile (the same locks
  a task uses). The pen expires via heartbeat – closing the tab releases it
  after ~25 seconds. Deliberately no CRDT: in VALIS the logic plan, circuit
  editor, FESTO free build and step chains each rewrite the whole code, which
  a CRDT sees as "delete everything, insert everything" and which would
  destroy concurrent edits.
* **Live sync:** With several devices logged into the same environment, tasks,
  packages and scenarios are reconciled every 5 seconds (`obj.php`, action
  `poll`). Deliberately polling rather than SSE/long-polling: one open
  connection per student would tie up PHP-FPM workers and exhaust the server for
  a whole class. The poll returns headers only; contents are fetched
  individually. Background tabs do not poll.
  The **editor working state is NOT live-synced** – concurrent typing would
  overwrite itself.
* **Automatic saving** covers tasks, task packages, scenarios and scenario
  packages while an environment is logged in. **Bundled example tasks are
  skipped** – only once someone edits one does it get stored. **Deletions are
  deliberately not
  propagated** – otherwise a device holding fewer items would wipe the
  environment. Deleting happens explicitly in the panel.
* On a genuine version conflict nothing is overwritten; the item stays unsaved
  and is reported as a conflict in the panel.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Button does not appear | `ping.php` returns no JSON or `db:false` – open it directly |
| `config_missing` | wrong path **or** PHP user cannot read the file (`chown`) |
| `db_error` | wrong credentials; exact message in the PHP error log |
| `rate_limited` while testing | `signup_per_ip_day` reached – raise it or reuse the token |
| `unauthorized` | session expired (`session_ttl_days`) – log in again |
| All codes suddenly invalid | The `pepper` was changed. Not reversible. |

### `db_error` – Access denied

By far the most common case: the database password was changed in the hosting
panel (KeyHelp, Plesk, cPanel) while `config.php` kept the old one. Logging in
by hand works, PHP does not. Check whether exactly the string PHP reads still
works, without displaying it:

```bash
CFG=/pfad/zu/valis-secrets/config.php
php -r "\$c=require '$CFG';
  printf('user=%s name=%s pass_len=%d' . PHP_EOL, \$c['db_user'], \$c['db_name'], strlen(\$c['db_pass']));"
PW=$(php -r "\$c=require '$CFG'; echo \$c['db_pass'];")
MYSQL_PWD="$PW" mysql -u DBUSER DBNAME -e "SELECT 1;" && echo OK || echo WRONG
unset PW
```

Change the password **in the panel**, not via `ALTER USER` – otherwise the panel
does not know the new value and its phpMyAdmin login breaks.

> **`sed -i` as root destroys the file permissions.** It writes a new file and
> renames it; that file then belongs to root and the PHP user can no longer read
> it – symptom: `config_missing`. Either edit as the correct user, or restore
> owner and mode afterwards (`chown --reference=…`).
