<?php
declare(strict_types=1);
/**
 * Umgebungen: anlegen, einloggen, abmelden.
 *
 * Es gibt bewusst KEINE Wiederherstellung: ohne Zuordnung Code -> Person
 * existiert niemand, der eine Identitaet bestaetigen koennte. Genau diese
 * Abwesenheit ist die datenschutzrechtliche Grundlage des Modells.
 */
require __DIR__ . '/_boot.php';
require_post();

$in  = body_json();
$cfg = valis_config();
$act = (string)($in['action'] ?? '');

/** PIN pruefen: optional, aber wenn gesetzt 4-6 Ziffern. */
function clean_pin(mixed $raw): ?string {
    if ($raw === null || $raw === '') return null;
    $p = preg_replace('/\D/', '', (string)$raw) ?? '';
    if (strlen($p) < 4 || strlen($p) > 6) fail('pin_format');
    return $p;
}

/**
 * Nicht geheime, stabile Kennung der Umgebung. Der Client trennt damit seine
 * lokalen Sync-Daten je Umgebung - sonst zeigen gemerkte Versionsnummern nach
 * einem Wechsel auf fremde Objekte. Aus der Kennung laesst sich der Zugangscode
 * nicht ableiten.
 */
function env_ref(int $envId): string {
    return substr(hash('sha256', valis_config()['pepper'] . '|envref|' . $envId), 0, 16);
}

function issue_token(int $envId): array {
    $cfg   = valis_config();
    $token = rtrim(strtr(base64_encode(random_bytes(33)), '+/', '-_'), '=');
    $ttl   = (int)$cfg['session_ttl_days'];
    db()->prepare(
        'INSERT INTO sessions (token_hash, env_id, created_at, expires_at)
         VALUES (?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))'
    )->execute([token_hash($token), $envId, $ttl]);
    return ['token' => $token, 'expires_days' => $ttl];
}

// ---------------------------------------------------------------------- anlegen
if ($act === 'create') {
    if (!$cfg['allow_open_signup']) {
        $secret = (string)($in['signup_secret'] ?? '');
        if ($cfg['signup_secret'] === '' || !hash_equals((string)$cfg['signup_secret'], $secret)) {
            fail('signup_closed', 403);
        }
    }
    if (!rate_ok('signup|' . ip_hash(), (int)$cfg['signup_per_ip_day'], 86400)) {
        fail('rate_limited', 429);
    }

    $pin = clean_pin($in['pin'] ?? null);

    // Bei 75 Bit ist eine Kollision praktisch ausgeschlossen; trotzdem absichern.
    for ($try = 0; $try < 5; $try++) {
        $code = gen_code();
        try {
            db()->prepare(
                'INSERT INTO environments (code_hash, pin_hash, created_at, last_seen_at)
                 VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())'
            )->execute([
                code_hash($code),
                $pin === null ? null : password_hash($pin, PASSWORD_DEFAULT),
            ]);
            $envId = (int)db()->lastInsertId();
            json_out([
                'ok'       => true,
                // Der Code wird hier EINMALIG ausgeliefert und nirgends im Klartext gespeichert.
                'code'     => $code,
                'env'      => env_ref($envId),
                'has_pin'  => $pin !== null,
                'quota'    => ['bytes' => (int)$cfg['quota_bytes'], 'objects' => (int)$cfg['quota_objects']],
            ] + issue_token($envId));
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') throw $e; // 23000 = Unique-Verletzung
        }
    }
    fail('code_collision', 500);
}

// --------------------------------------------------------------------- einloggen
if ($act === 'login') {
    if (!rate_ok('login-ip|' . ip_hash(), 60, 3600)) fail('rate_limited', 429);

    $code = normalize_code((string)($in['code'] ?? ''));
    if ($code === '') fail('code_format');

    $st = db()->prepare(
        'SELECT id, pin_hash, failed_logins, locked_until FROM environments WHERE code_hash = ?'
    );
    $st->execute([code_hash($code)]);
    $env = $st->fetch();

    // Gleichfoermige Antwort: ein unbekannter Code sieht aus wie eine falsche PIN,
    // damit die API nicht zum Orakel fuer gueltige Codes wird.
    if (!$env) { usleep(random_int(120000, 260000)); fail('bad_credentials', 401); }

    if ($env['locked_until'] !== null && strtotime((string)$env['locked_until']) > time()) {
        fail('locked', 429, ['retry_after' => strtotime((string)$env['locked_until']) - time()]);
    }

    $pin = ($in['pin'] ?? '') === '' ? null : preg_replace('/\D/', '', (string)$in['pin']);
    $okPin = $env['pin_hash'] === null
        ? true                                   // Umgebung ohne PIN: der Code allein genuegt
        : ($pin !== null && password_verify($pin, (string)$env['pin_hash']));

    if (!$okPin) {
        $fails = (int)$env['failed_logins'] + 1;
        $lock  = $fails >= (int)$cfg['login_max_fails']
            ? min(3600, 60 * (2 ** min(6, $fails - (int)$cfg['login_max_fails'])))
            : 0;
        db()->prepare(
            'UPDATE environments SET failed_logins = ?,
                    locked_until = IF(? > 0, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), locked_until)
             WHERE id = ?'
        )->execute([$fails, $lock, $lock, $env['id']]);
        fail('bad_credentials', 401);
    }

    db()->prepare(
        'UPDATE environments SET failed_logins = 0, locked_until = NULL, last_seen_at = UTC_TIMESTAMP() WHERE id = ?'
    )->execute([$env['id']]);

    json_out([
        'ok'      => true,
        'env'     => env_ref((int)$env['id']),
        'has_pin' => $env['pin_hash'] !== null,
        'quota'   => ['bytes' => (int)$cfg['quota_bytes'], 'objects' => (int)$cfg['quota_objects']],
    ] + issue_token((int)$env['id']));
}

// --------------------------------------------------------------------- abmelden
if ($act === 'logout') {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+([A-Za-z0-9_\-]{20,120})$/', trim($hdr), $m)) {
        db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([token_hash($m[1])]);
    }
    json_out(['ok' => true]);
}

// ------------------------------------------------- Umgebung endgueltig loeschen
if ($act === 'destroy') {
    $envId = require_env();
    db()->prepare('DELETE FROM environments WHERE id = ?')->execute([$envId]);
    json_out(['ok' => true]);
}

// ------------------------------------------------- Geraete-Link ausstellen
// Stellt fuer ein anderes Geraet ein EIGENES Sitzungstoken aus. Damit muss der
// Zugangscode weder gespeichert noch in einen Link geschrieben werden. Jedes
// Geraet bekommt eine eigene Zeile in `sessions` - Abmelden auf dem einen
// Geraet beendet die Sitzung des anderen also nicht.
if ($act === 'devicelink') {
    $envId = require_env();
    json_out(['ok' => true, 'env' => env_ref($envId)] + issue_token($envId));
}

fail('unknown_action');
