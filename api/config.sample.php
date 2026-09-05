<?php
/**
 * VORLAGE. Diese Datei NICHT so verwenden.
 *
 * Kopiere sie nach   <parent-of-document-root>/valis-secrets/config.php
 * (also AUSSERHALB von /projekte/valis/, damit rsync --delete sie nicht loescht
 * und sie per HTTP nicht abrufbar ist), und trage echte Werte ein:
 *
 *   mkdir -p ~/valis-secrets && chmod 700 ~/valis-secrets
 *   cp /pfad/zu/api/config.sample.php ~/valis-secrets/config.php
 *   chmod 600 ~/valis-secrets/config.php
 *
 * Pepper einmalig erzeugen:  php -r 'echo bin2hex(random_bytes(32)),"\n";'
 */
return [
    'db_host' => 'localhost',
    'db_name' => 'CHANGEME_dbname',
    'db_user' => 'CHANGEME_dbuser',
    'db_pass' => 'CHANGEME_dbpass',

    // Serverseitiger Pepper. Aendert man ihn, sind ALLE Codes ungueltig.
    'pepper'  => 'CHANGEME_64_hex_zeichen',

    // Offene Registrierung per Button (deine Entscheidung: an).
    // Auf false stellen, falls jemand die API missbraucht – dann ist zusaetzlich
    // 'signup_secret' noetig.
    'allow_open_signup'    => true,
    'signup_secret'        => '',

    // Schluessel fuer den Cron-Aufruf von gc.php (php -r 'echo bin2hex(random_bytes(16));')
    'gc_key'               => 'CHANGEME_gc_key',

    // Kurator-Schluessel fuer die Bibliothek. WIRD AUF DEM SERVER ERZEUGT und
    // gehoert niemals ins Repository - der PHP-Quelltext ist oeffentlich lesbar.
    // Einmalig in VALIS eingeben; danach traegt die eigene Umgebung das Recht.
    // Leer lassen = niemand kann Kurator werden.
    'curator_key'          => '',

    // Duerfen normale Nutzer etwas zur Freigabe einreichen? Eingereichtes ist
    // erst nach Freigabe durch einen Kurator sichtbar.
    'allow_library_submit' => true,

    // Verwalter-Schluessel. WIE DER KURATOR-SCHLUESSEL auf dem Server erzeugen
    // und niemals ins Repository legen. Die Verwaltungsansicht zeigt
    // Betriebszahlen und kann sperren/loeschen - sie sieht ausdruecklich NICHT
    // in fremde Umgebungen hinein. Leer lassen = niemand wird Verwalter.
    'admin_key'            => '',

    // Quota je Umgebung
    'quota_bytes'          => 5 * 1024 * 1024,
    'quota_objects'        => 300,
    // Groesstes einzelnes Objekt (2D-Anlagen koennen gross werden)
    'max_object_bytes'     => 2 * 1024 * 1024,

    // Sitzungsdauer eines Geraete-Logins
    'session_ttl_days'     => 60,
    // Loeschkonzept: inaktive Umgebungen automatisch entfernen
    'inactive_delete_days' => 365,

    // Missbrauchsbremsen
    'signup_per_ip_day'    => 20,
    'login_max_fails'      => 10,
];
