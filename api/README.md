# VALIS Cloud API – Einrichtung

Läuft nur auf der Server-Instanz. Auf GitHub Pages werden diese `.php`-Dateien als
Rohtext ausgeliefert; der Client erkennt das und lässt alle Cloud-Funktionen aus.

## 1. Datenbank (KeyHelp)
Datenbank + Benutzer anlegen, dann:

    mysql -u DBUSER -p DBNAME < api/schema.sql

## 2. Konfiguration AUSSERHALB des Webroots
`/projekte/valis/` ist deploy-verwaltet (`rsync --delete`) – dort darf nichts
Persistentes liegen.

    mkdir -p ~/valis-secrets && chmod 700 ~/valis-secrets
    cp api/config.sample.php ~/valis-secrets/config.php
    chmod 600 ~/valis-secrets/config.php
    php -r 'echo "pepper: ", bin2hex(random_bytes(32)), "\ngc_key: ", bin2hex(random_bytes(16)), "\n";'

Werte in `~/valis-secrets/config.php` eintragen (DB-Zugang, `pepper`, `gc_key`).

Gefunden wird die Datei über:
1. Umgebungsvariable `VALIS_CONFIG` (im vHost: `SetEnv VALIS_CONFIG /pfad/config.php`)
2. sonst `<eltern-von-DOCUMENT_ROOT>/valis-secrets/config.php`

**Pepper niemals ändern** – sonst sind alle bestehenden Codes ungültig.

## 3. Prüfen

    php -l api/_boot.php && php -l api/ping.php && php -l api/env.php && php -l api/gc.php
    curl -s https://t-bk.de/projekte/valis/api/ping.php

Erwartet: `{"ok":true,"valis_api":1,"v":1,"db":true,"signup":true}`
Ist `db:false`, stimmt die DB-Konfiguration nicht (Details im PHP-Error-Log).

## 4. Cron (Löschkonzept)

    5 3 * * * curl -fsS "https://t-bk.de/projekte/valis/api/gc.php?key=GC_KEY" >/dev/null

## 5. Apache-Logs
IP-Adressen sind personenbezogene Daten – unabhängig von VALIS.
Log-Anonymisierung bzw. kurze Aufbewahrung konfigurieren.

## Sicherheits-/Datenschutz-Design
* Kein Name, keine E-Mail, kein Geburtsdatum, keine Adresse.
* **Keine Zuordnungstabelle Code → Person.** Das ist die Grundlage dafür, dass die
  Serverdaten für den Verantwortlichen nicht personenbezogen sind. Wird später eine
  solche Liste eingeführt (z. B. „Lehrkraft vergibt Codes"), kippt diese Bewertung –
  die Daten wären dann pseudonym und damit personenbezogen.
* Codes: 75 Bit, nur als SHA-256 mit serverseitigem Pepper gespeichert.
* PIN (optional, 4–6 Ziffern): `password_hash` + Rate-Limit mit Lockout.
* IP-Adressen nur als tagesgesalzener Hash in `rate_limits`, mit TTL.
* Keine CORS-Header → die API ist ausschließlich von der Server-Instanz nutzbar.
* Der PHP-Quelltext ist öffentlich – die Sicherheit enthält daher keine Obscurity.

## Es gibt keine Wiederherstellung
Ohne Zuordnung Code → Person kann niemand eine Identität bestätigen.
Ein verlorener Code bedeutet Verlust der Umgebung. Die Oberfläche muss den Code
bei der Erzeugung einmalig anzeigen und zum Sichern zwingen (Download / QR / Druck).

## Endpunkte (Stand: Phase 1–2)
| Datei      | Zweck |
|------------|-------|
| `ping.php` | Capability-Probe (kein Auth) |
| `env.php`  | `create` / `login` / `logout` / `destroy` |
| `gc.php`   | Wartung, per Cron |

Noch offen: `obj.php` (Objekte lesen/schreiben mit Versionierung), `share.php`.
