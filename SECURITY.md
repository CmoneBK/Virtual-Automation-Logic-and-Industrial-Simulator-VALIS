🌍 *[English](#english-version) | [Deutsch](#deutsche-version)*

# <a id="deutsche-version"></a>Sicherheit – VALIS

## Schwachstelle melden

Bitte melde Sicherheitslücken **nicht** öffentlich (kein öffentliches Issue), sondern per E-Mail an **kontakt@t-bk.de** mit dem Betreff „Sicherheit VALIS“. Hilfreich sind:

- was betroffen ist (Datei, Funktion, Fassung oder Datum),
- wie man die Lücke nachvollzieht (Schritte, Beispiel-Stand oder -Link ohne echten Schadcode),
- welche Folgen du erwartest.

Was danach passiert:

| Schritt | Frist |
| --- | --- |
| Eingangsbestätigung | innerhalb von 5 Werktagen |
| Erste Bewertung (bestätigt, Schwere, Plan) | innerhalb von 14 Tagen |
| Behebung in der veröffentlichten Fassung | so schnell wie möglich, bei schweren Lücken Ziel 30 Tage |
| Öffentliche Nennung | nach der Behebung, spätestens 90 Tage nach der Meldung, in Absprache mit dir |

Wer meldet, wird auf Wunsch im Änderungsverlauf genannt. Bitte greife beim Prüfen nicht auf fremde Daten zu und störe den Betrieb von t-bk.de nicht.

## Welche Fassungen Updates bekommen

- **Veröffentlichte Fassung** (GitHub Pages dieses Repositorys und t-bk.de): Sicherheitsupdates gehen sofort an alle, denn VALIS wird bei jedem Aufruf neu geladen.
- **Selbst gehostete Fassungen an Schulen** (`SELFHOSTING.md`): Updates kommen über dieses Repository. Schulen sollten ihre Kopie mindestens einmal im Halbjahr und nach jedem Sicherheitshinweis aktualisieren. Sicherheitsrelevante Änderungen stehen im Commit-Text mit „Sicherheit:“.
- **Supportzeitraum:** Sicherheitsupdates gibt es für jede Fassung mindestens fünf Jahre nach ihrer Veröffentlichung, solange VALIS angeboten wird. Endet das Angebot, wird das hier mit mindestens zwölf Monaten Vorlauf angekündigt.

## Bedrohungsmodell (Kurzfassung)

VALIS ist eine Lern- und Simulationssoftware ohne Verbindung zu echten Maschinen. Es steuert keine reale Hardware.

| Was geschützt wird | Wodurch |
| --- | --- |
| Browser der Lernenden und Lehrkräfte | VALIS läuft im Browser und lädt nichts von fremden Servern; alle Bibliotheken liegen in `vendor/` (siehe `sbom.cdx.json`). |
| Anmeldung an der optionalen Serverfunktion (Umgebungen, Klassen, Bibliothek) | Zugangscodes und Tokens nur als Hash mit Pepper gespeichert, IP nur tagesgesalzen gehasht, Ratenbegrenzung, keine Zugangsdaten im Repository (`api/`, `SELFHOSTING.md`). |
| Stände aus fremder Hand (Teilen-Links, Dateien, Klassenfreigaben, Bibliothek) | Was VALIS daraus als Programmcode ausführen würde, braucht eine strenge Form oder die ausdrückliche Zustimmung: Nutzer-Plugins und eigene JavaScript-Bedingungen in Aufgaben nur nach Rückfrage, Bauteil-Formeln und Ausgangsnamen nur in erlaubter Schreibweise (`pruefungen/fremdcode-pruefung.js`). |
| Personenbezogene Daten | So wenig wie möglich; Details in der Datenschutzerklärung von t-bk.de. |

Bekannte Grenzen: Nutzer-Plugins, die jemand selbst installiert hat oder die vor dem 20.11.2026 über einen Link kamen, bleiben installiert; sie lassen sich im Plugin-Manager ansehen und löschen. Eine vollständige Prüfung aller HTML-Ausgaben auf eingeschleusten Code steht noch aus.

## Meldepflichten (Cyber Resilience Act)

Wird eine aktiv ausgenutzte Schwachstelle oder ein schwerer Sicherheitsvorfall bekannt und fällt VALIS unter die Verordnung (EU) 2024/2847, meldet der Rechteinhaber über die Meldeplattform der ENISA: Frühwarnung innerhalb von 24 Stunden, Meldung innerhalb von 72 Stunden, Abschlussbericht innerhalb von 14 Tagen nach Bereitstellung einer Korrektur. Betroffene Schulen werden über die bekannten Kontakte informiert.

---

# <a id="english-version"></a>Security – VALIS

## Reporting a vulnerability

Please do **not** report security issues publicly (no public issue). Send an e-mail to **kontakt@t-bk.de** with the subject "Security VALIS", including what is affected, how to reproduce it (steps or an example state/link without real malicious code) and the expected impact.

| Step | Time |
| --- | --- |
| Acknowledgement | within 5 working days |
| First assessment (confirmed, severity, plan) | within 14 days |
| Fix in the published version | as soon as possible, target 30 days for severe issues |
| Public disclosure | after the fix, at the latest 90 days after the report, coordinated with you |

Reporters are credited on request. Please do not access other people's data or disrupt t-bk.de while testing.

## Supported versions

- **Published version** (this repository's GitHub Pages and t-bk.de): security fixes reach everyone immediately.
- **Self-hosted copies at schools** (`SELFHOSTING.md`): updates come through this repository; update at least every six months and after every security notice. Security-relevant commits start with "Sicherheit:".
- **Support period:** each version receives security updates for at least five years after its release, as long as VALIS is offered; an end of the offer will be announced here at least twelve months ahead.

## Threat model (short)

VALIS is learning and simulation software and controls no real hardware. It loads nothing from third-party servers (libraries in `vendor/`, see `sbom.cdx.json`). The optional server stores access codes and tokens only as peppered hashes, IPs only as daily-salted hashes, and applies rate limits. Content from other people (share links, files, class shares, library) can only run program code with explicit consent (user plugins, custom JavaScript task conditions) or in a strict syntax (component formulas, output names); see `pruefungen/fremdcode-pruefung.js`.

Known limits: plugins installed by the user, or received via a link before 20 Nov 2026, stay installed and can be reviewed in the plugin manager. A full review of all HTML output for injected markup is still pending.

## Reporting obligations (Cyber Resilience Act)

If VALIS is in scope of Regulation (EU) 2024/2847, actively exploited vulnerabilities and severe incidents are reported via the ENISA single reporting platform: early warning within 24 hours, notification within 72 hours, final report within 14 days after a fix is available.
