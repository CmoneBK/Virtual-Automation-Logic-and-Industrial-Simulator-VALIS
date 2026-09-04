<?php
declare(strict_types=1);
/**
 * Read-only Freigabe einzelner Objekte.
 *
 * Zweck: kurze Links und damit kleine QR-Codes. Bisher tragen Share-Links die
 * kompletten Daten (LZString im Fragment) und werden fuer QR-Codes schnell zu
 * gross. Hier steht im Link nur ein 12-Zeichen-Token; die Daten liegen auf dem
 * Server.
 *
 * `read` ist bewusst OHNE Anmeldung nutzbar - Empfaenger haben keine Umgebung.
 * Der Token ist damit die gesamte Berechtigung, wird aber nur als Hash
 * gespeichert und ist auf Lesen eines einzelnen Objekts beschraenkt.
 *
 * Je Objekt gibt es hoechstens EINE aktive Freigabe. Ein neuer Link macht den
 * alten ungueltig; das ist die Widerrufsmoeglichkeit.
 */
require __DIR__ . '/_boot.php';
require_post();

$in  = body_json();
$cfg = valis_config();
$act = (string)($in['action'] ?? '');

/** 12 Zeichen aus dem verwechslungsfreien Alphabet = 60 Bit. */
function gen_share_token(): string {
    $bytes = random_bytes(12);
    $out = '';
    for ($i = 0; $i < 12; $i++) $out .= VALIS_ALPHABET[ord($bytes[$i]) & 31];
    return $out;
}
function normalize_share_token(string $in): string {
    $s = strtoupper(trim($in));
    $s = preg_replace('/[^A-Z2-9]/', '', $s) ?? '';
    if (strlen($s) !== 12 || strspn($s, VALIS_ALPHABET) !== 12) return '';
    return $s;
}
function share_hash(string $token): string {
    return hash('sha256', valis_config()['pepper'] . '|share|' . $token);
}

// ------------------------------------------------------------ Link erzeugen
if ($act === 'create') {
    $envId = require_env();
    $kind  = strtolower(trim((string)($in['kind'] ?? '')));
    $uid   = trim((string)($in['uid'] ?? ''));
    if (!preg_match('/^[a-z][a-z0-9_]{0,31}$/', $kind)) fail('kind_invalid');
    if (!preg_match('/^[A-Za-z0-9_-]{8,36}$/', $uid))   fail('uid_invalid');

    $st = db()->prepare(
        'SELECT id FROM objects
         WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL'
    );
    $st->execute([$envId, $kind, $uid]);
    $objId = $st->fetchColumn();
    if ($objId === false) fail('not_found', 404);

    $days = isset($in['expires_days']) ? max(0, min(3650, (int)$in['expires_days'])) : 0;

    $pdo = db();
    $pdo->beginTransaction();
    try {
        // Genau eine aktive Freigabe je Objekt: die alte faellt weg.
        $pdo->prepare('DELETE FROM shares WHERE object_id = ?')->execute([$objId]);
        for ($try = 0; $try < 5; $try++) {
            $token = gen_share_token();
            try {
                $pdo->prepare(
                    'INSERT INTO shares (token_hash, object_id, created_at, expires_at)
                     VALUES (?, ?, UTC_TIMESTAMP(), ' . ($days > 0 ? 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)' : 'NULL') . ')'
                )->execute($days > 0 ? [share_hash($token), $objId, $days] : [share_hash($token), $objId]);
                $pdo->commit();
                json_out(['ok' => true, 'token' => $token, 'expires_days' => $days ?: null]);
            } catch (PDOException $e) {
                if ($e->getCode() !== '23000') throw $e;
            }
        }
        $pdo->rollBack();
        fail('token_collision', 500);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

// --------------------------------------------------------- Freigaben zeigen
if ($act === 'list') {
    $envId = require_env();
    $st = db()->prepare(
        'SELECT o.kind, o.obj_uid, s.created_at, s.expires_at, s.hits
         FROM shares s JOIN objects o ON o.id = s.object_id
         WHERE o.env_id = ? AND o.deleted_at IS NULL'
    );
    $st->execute([$envId]);
    // Der Token selbst kann nicht mehr angezeigt werden - gespeichert ist nur
    // sein Hash. Wer den Link verloren hat, erzeugt einen neuen.
    json_out(['ok' => true, 'shares' => array_map(static function (array $r): array {
        return [
            'kind'       => $r['kind'],
            'uid'        => $r['obj_uid'],
            'created_at' => $r['created_at'],
            'expires_at' => $r['expires_at'],
            'hits'       => (int)$r['hits'],
        ];
    }, $st->fetchAll())]);
}

// -------------------------------------------------------- Freigabe aufheben
if ($act === 'revoke') {
    $envId = require_env();
    $kind  = strtolower(trim((string)($in['kind'] ?? '')));
    $uid   = trim((string)($in['uid'] ?? ''));
    $st = db()->prepare(
        'DELETE s FROM shares s JOIN objects o ON o.id = s.object_id
         WHERE o.env_id = ? AND o.kind = ? AND o.obj_uid = ?'
    );
    $st->execute([$envId, $kind, $uid]);
    json_out(['ok' => true, 'removed' => $st->rowCount()]);
}

// ------------------------------------------------- Lesen (OHNE Anmeldung)
if ($act === 'read') {
    if (!rate_ok('share-read|' . ip_hash(), 300, 3600)) fail('rate_limited', 429);

    $token = normalize_share_token((string)($in['token'] ?? ''));
    // Unbekannt, abgelaufen und falsch formatiert sehen absichtlich gleich aus.
    if ($token === '') { usleep(random_int(80000, 160000)); fail('not_found', 404); }

    $st = db()->prepare(
        'SELECT s.token_hash, o.kind, o.name, o.data, o.version, o.updated_at
         FROM shares s JOIN objects o ON o.id = s.object_id
         WHERE s.token_hash = ? AND o.deleted_at IS NULL
           AND (s.expires_at IS NULL OR s.expires_at > UTC_TIMESTAMP())'
    );
    $st->execute([share_hash($token)]);
    $r = $st->fetch();
    if (!$r) { usleep(random_int(80000, 160000)); fail('not_found', 404); }

    db()->prepare('UPDATE shares SET hits = hits + 1 WHERE token_hash = ?')->execute([$r['token_hash']]);

    json_out(['ok' => true, 'object' => [
        'kind'       => $r['kind'],
        'name'       => $r['name'],
        'version'    => (int)$r['version'],
        'updated_at' => $r['updated_at'],
        'data'       => json_decode((string)$r['data'], true),
    ]]);
}

fail('unknown_action');
