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
`sessions` und `shares` zeigen.

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

Bei offener Registrierung ist dein Server eine **offen beschreibbare API**.
Quota, Rate-Limits und die automatische Löschung sind die Bremsen dafür. Wird sie
missbraucht, setze `allow_open_signup` auf `false` und vergib ein `signup_secret`.

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
`sessions` and `shares`.

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

With open signup your server is a **publicly writable API**. Quotas, rate limits
and automatic deletion are the brakes. If it gets abused, set
`allow_open_signup` to `false` and hand out a `signup_secret`.

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
| All codes suddenly invalid | the `pepper` was changed. Not reversible. |
