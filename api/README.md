# VALIS Cloud API – Einrichtung

Läuft nur auf der Server-Instanz. Auf GitHub Pages werden diese `.php`-Dateien als
Rohtext ausgeliefert; der Client erkennt das und lässt alle Cloud-Funktionen aus.

## Pfade (KeyHelp)

Alles liegt im Home des **Web-Users** (nicht unter `/root`):

| Zweck | Pfad |
|---|---|
| Deploy-Ziel (read-only, `rsync --delete`) | `~/www/t-bk.de/projekte/valis/` |
| Secrets (nicht über das Internet erreichbar) | `~/files/valis-secrets/config.php` |

KeyHelp weist `/files/` ausdrücklich für Dateien aus, die nicht öffentlich sein
sollen – genau richtig für die Config. **Niemals** etwas Persistentes in
`~/www/.../valis/` ablegen, das löscht der nächste Deploy.

Pfad ermitteln, falls unklar:

    ls -d /home/users/*/www/*/projekte/valis

## 1. Datenbank (KeyHelp → Ressourcen → Datenbanken)

    VALIS=$(ls -d /home/users/*/www/*/projekte/valis | head -1)
    mysql -u DBUSER -p DBNAME < "$VALIS/api/schema.sql"

## 2. Konfiguration

    VALIS=$(ls -d /home/users/*/www/*/projekte/valis | head -1)
    HOME_DIR=$(echo "$VALIS" | sed 's#/www/.*##')
    WEBUSER=$(stat -c %U "$VALIS/index.html")

    mkdir -p "$HOME_DIR/files/valis-secrets"
    cp "$VALIS/api/config.sample.php" "$HOME_DIR/files/valis-secrets/config.php"
    chown -R "$WEBUSER:$WEBUSER" "$HOME_DIR/files/valis-secrets"
    chmod 700 "$HOME_DIR/files/valis-secrets"
    chmod 600 "$HOME_DIR/files/valis-secrets/config.php"

    php -r 'echo "pepper: ",bin2hex(random_bytes(32)),"\ngc_key: ",bin2hex(random_bytes(16)),"\n";'

Werte in `config.php` eintragen: DB-Zugang, `pepper`, `gc_key`.

**Wichtig:** Die Datei muss dem PHP-FPM-Pool-User gehören (dem Web-User), sonst
kann PHP sie nicht lesen. Deshalb `chown` oben – `/root` funktioniert nicht.

Gefunden wird die Config über:
1. Umgebungsvariable `VALIS_CONFIG` (im vHost: `SetEnv VALIS_CONFIG /pfad/config.php`)
2. sonst automatisch: ausgehend vom `DOCUMENT_ROOT` nach oben, je Ebene
   `files/valis-secrets/config.php` und `valis-secrets/config.php`

**Pepper niemals ändern** – sonst sind alle bestehenden Codes ungültig.

## 3. Prüfen

    VALIS=$(ls -d /home/users/*/www/*/projekte/valis | head -1)
    for f in "$VALIS"/api/*.php; do php -l "$f"; done
    curl -s https://t-bk.de/projekte/valis/api/ping.php; echo

`ping.php` antwortet **immer** mit HTTP 200 und sagt, was fehlt:

| Antwort | Bedeutung |
|---|---|
| `"db":true,"reason":null` | alles bereit |
| `"reason":"config_missing"` | Config nicht gefunden oder für PHP nicht lesbar |
| `"reason":"db_error"` | Config da, aber DB-Zugang falsch (Details im PHP-Error-Log) |
| kein JSON / 404 | Deploy noch nicht durch oder PHP läuft nicht |

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

## Zugangs-Links

Der Knopf im Panel erzeugt einen **Geraete-Link**. Er enthaelt **nicht** den
Zugangscode, sondern ein eigens ausgestelltes Sitzungstoken (`env.php`,
Aktion `devicelink`):

    https://t-bk.de/projekte/valis/#dev=<token>&e=<envref>

Vorteile gegenueber einem Code im Link: der Code bleibt geheim, das Token
laeuft ab (`session_ttl_days`) und laesst sich einzeln entwerten - jedes Geraet
hat eine eigene Zeile in `sessions`, Abmelden betrifft nur dieses Geraet.
Weil es bereits eine authentifizierte Sitzung ist, wird **keine PIN** abgefragt.

Aeltere Links mit dem Zugangscode werden weiterhin gelesen:

    https://t-bk.de/projekte/valis/#env=XXXXX-XXXXX-XXXXX&p=1

Der Code steht im **Fragment** (`#`), nicht in der Query. Das ist bewusst so:
Fragmente werden vom Browser **nie an den Server gesendet** und tauchen deshalb
nicht im Apache-Access-Log auf. Eine Query (`?code=...`) wuerde den Zugang im
Klartext auf die Platte schreiben.

* Das Fragment wird nach dem Auswerten sofort aus der Adresszeile entfernt.
* `p=1` bedeutet: fuer diese Umgebung ist eine PIN gesetzt, sie wird abgefragt.
  `p=0` meldet direkt an. Das Kennzeichen wird beim Erzeugen des Links gesetzt,
  der Server wird dazu nicht gefragt - es gibt also kein Orakel, mit dem man
  die Existenz eines Codes pruefen koennte.
* Der Zugangscode wird im Client **nur im Arbeitsspeicher** gehalten, nie
  persistiert. Im localStorage liegt allein das ablaufende Sitzungstoken.

**Ein Zugangs-Link ist ein Passwort, kein Freigabe-Link.** Wer ihn hat, kann
alles aendern. Zum Weitergeben von Inhalten ist `share.php` vorgesehen
(read-only, pro Objekt) - noch nicht gebaut. Ohne gesetzte PIN genuegt der Link
allein; mit PIN ist er nur der erste Faktor.

## Es gibt keine Wiederherstellung

Ohne Zuordnung Code → Person kann niemand eine Identität bestätigen.
Ein verlorener Code bedeutet Verlust der Umgebung. Die Oberfläche muss den Code
bei der Erzeugung einmalig anzeigen und zum Sichern zwingen (Download / QR / Druck).

## Endpunkte (Stand: Phase 1–2)

| Datei | Zweck |
|---|---|
| `ping.php` | Capability-Probe + Diagnose (kein Auth) |
| `env.php` | `create` / `login` / `logout` / `destroy` / `devicelink` / `redeem` / `logout_others` |
| `obj.php` | `list` / `get` / `put` / `delete` / `usage` / `poll` / `live` (Bearer-Token) |

Die Aktion `live` kennt zwei Betriebsarten (`live_mode`): `pen`
(Stift-Weitergabe, genau einer schreibt) und `rt` (Echtzeit, alle schreiben;
die Zusammenfuehrung der Staende passiert im Client).
| `share.php` | `create` / `list` / `revoke` (Bearer) + `read` (ohne Anmeldung) |
| `presence.php` | Schreibmarke und Mauszeiger (Bearer-Token) |
| `library.php` | `list` / `get` (ohne Anmeldung) + `submit` / `mine` / `pending` / `moderate` / `withdraw` / `claim_curator` (Bearer) |
| `gc.php` | Wartung, per Cron |

Der Endpunkt `presence.php` schreibt die eigene Position UND liefert die der
anderen in einem Aufruf. Er wird im Sekundentakt gerufen und ist deshalb
bewusst schlank: ein Upsert, ein Select, ein kleines Aufraeum-Delete. Eintraege
aelter als 15 s gelten als abwesend. Uebertragen werden keine Namen - Farbe und
Bezeichnung leitet der Client aus der zufaelligen Geraetekennung ab.

## Freigabe-Links

`share.php create` erzeugt fuer ein Objekt einen 12-Zeichen-Token (60 Bit):

    https://t-bk.de/projekte/valis/#s=ABCDEFGHJKLM

Das ergibt rund 46 Zeichen und damit einen kleinen, gut scannbaren QR-Code -
im Gegensatz zu den bisherigen `#state=`-Links, die die kompletten Daten tragen.

* `read` braucht **keine Anmeldung**; Empfaenger haben keine eigene Umgebung.
  Der Zugriff ist auf **Lesen eines einzelnen Objekts** beschraenkt.
* Je Objekt gibt es hoechstens **eine** aktive Freigabe. Ein neuer Link macht den
  vorherigen ungueltig - das ist zugleich der Widerruf. `revoke` hebt sie ganz auf.
* Gespeichert wird nur der Hash des Tokens. Ein verlorener Link laesst sich nicht
  wiederherstellen, nur neu erzeugen.
* Unbekannt, abgelaufen und falsch formatiert liefern einheitlich 404.
* Lesezugriffe sind je IP begrenzt (300/Stunde) und werden in `hits` gezaehlt.

## Konflikte bei Mehrgeraete-Nutzung

`put` erwartet `base_version` - die Version, auf der die Aenderung aufsetzt
(`0` = neu anlegen). Weicht sie vom Serverstand ab, antwortet die API mit
**HTTP 409** und liefert unter `server` den kompletten aktuellen Stand mit.
Es wird nie still ueberschrieben. Der Client kann damit anbieten:
*meins behalten* / *Server behalten* / *als Kopie speichern* - und den
Verlierer als Snapshot ablegen, sodass nichts verloren geht.

`delete` ist ein Soft-Delete; `gc.php` entfernt endgueltig nach 30 Tagen.

## Bibliothek

Veroeffentlichte Eintraege liegen in einer EIGENEN Tabelle, nicht in `objects`.
Eine Veroeffentlichung ist eine Kopie: sie bleibt unveraendert, wenn der Urheber
sein Original spaeter aendert, und ueberlebt das Loeschen seiner Umgebung
(`env_id` wird zu `NULL`).

`list` und `get` brauchen KEINE Anmeldung - die Bibliothek ist der
oeffentliche Teil der Installation. Alles Schreibende braucht eine Umgebung.

Moderation: ohne sie waere die Bibliothek bei offener Registrierung eine offene
Pinnwand. Eingereichtes steht deshalb auf `pending` und ist nur fuer den
Einreichenden und fuer Kuratoren sichtbar. Kuratoren veroeffentlichen direkt.

Das Kurator-Recht haengt an der UMGEBUNG (`environments.is_curator`), nicht am
Geraet. `claim_curator` vergleicht den Schluessel aus der Konfiguration
zeitkonstant (`hash_equals`) und setzt das Kennzeichen einmalig. Der
Schluessel wird auf dem Server erzeugt und niemals im Repository abgelegt - der
PHP-Quelltext ist auf GitHub oeffentlich lesbar.
