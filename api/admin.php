<?php
declare(strict_types=1);
/**
 * Verwaltungsansicht fuer den Betrieb dieser Installation.
 *
 * WAS HIER MOEGLICH IST, IST DIE EIGENTLICHE AUSSAGE. Es gibt bewusst KEINE
 * Aktion, die in eine fremde Umgebung hineinsieht: keine Objektliste, keine
 * Namen, keine Vorschau, keinen Export. Nicht als Hausregel, sondern weil der
 * Endpunkt es nicht anbietet - das ist der Unterschied zwischen "wir tun es
 * nicht" und "es geht nicht", und nur der zweite haelt einer Nachfrage stand.
 *
 * Herausgegeben werden:
 *   - Summen ueber die Installation (Betriebsdaten, niemand herausrechenbar),
 *   - je Umgebung ausschliesslich ZAHLEN: Groesse, Objektanzahl, letzter
 *     Zugriff, Sperrstatus. Kein Inhalt.
 *
 * Eingegriffen werden kann mit genau zwei Mitteln: sperren und loeschen, beide
 * ueber die Umgebungs-ID und beide protokolliert. Fuer Missbrauchsabwehr
 * reicht das; ansehen muss man dafuer nichts.
 *
 * Zugang wie beim Kurator: ein `admin_key` in der Konfiguration ausserhalb des
 * Webroots setzt einmalig `environments.is_admin`. Kein zweites Login-System.
 */
require __DIR__ . '/_boot.php';
require_post();

$in  = body_json();
$cfg = valis_config();
$act = (string)($in['action'] ?? '');

/** Umgebung des Aufrufers samt Rechten. */
function adm_me(): array {
    $envId = require_env();
    $st = db()->prepare('SELECT is_admin FROM environments WHERE id = ?');
    $st->execute([$envId]);
    return ['env' => $envId, 'admin' => ((int)$st->fetchColumn() === 1)];
}
/** Abbruch, wenn der Aufrufer kein Verwalter ist. */
function adm_require(): int {
    $me = adm_me();
    if (!$me['admin']) fail('forbidden', 403);
    return $me['env'];
}
/** Jeder Eingriff wird festgehalten - Ziel ist eine ID, keine Person. */
function adm_log(int $actor, string $action, ?int $target, string $note = ''): void {
    db()->prepare(
        'INSERT INTO admin_log (actor_env, action, target_env, note, created_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP())'
    )->execute([$actor, $action, $target, mb_substr($note, 0, 200)]);
}
function adm_int(mixed $v): int { return (int)$v; }

// ------------------------------------------------------------- Recht holen
if ($act === 'claim_admin') {
    $envId = require_env();
    if (!rate_ok('admin-claim|' . ip_hash(), 10, 3600)) fail('rate_limited', 429);
    $key = (string)($in['key'] ?? '');
    $exp = (string)($cfg['admin_key'] ?? '');
    if ($exp === '' || !hash_equals($exp, $key)) { usleep(random_int(120000, 260000)); fail('bad_key', 403); }
    db()->prepare('UPDATE environments SET is_admin = 1 WHERE id = ?')->execute([$envId]);
    adm_log($envId, 'claim_admin', $envId);
    json_out(['ok' => true]);
}

// -------------------------------------------------------- Bin ich Verwalter?
if ($act === 'whoami') {
    $me = adm_me();
    json_out(['ok' => true, 'admin' => $me['admin'], 'env' => $me['env'],
              'configured' => ((string)($cfg['admin_key'] ?? '') !== '')]);
}

// ------------------------------------------------------------- Betriebsdaten
if ($act === 'stats') {
    adm_require();
    $pdo = db();
    $one = static function (string $sql) use ($pdo): int {
        return (int)$pdo->query($sql)->fetchColumn();
    };

    $kinds = [];
    foreach ($pdo->query(
        'SELECT kind, COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b
         FROM objects WHERE deleted_at IS NULL GROUP BY kind ORDER BY n DESC'
    )->fetchAll() as $r) {
        $kinds[] = ['kind' => $r['kind'], 'count' => (int)$r['n'], 'bytes' => (int)$r['b']];
    }

    json_out(['ok' => true, 'stats' => [
        'environments'      => $one('SELECT COUNT(*) FROM environments'),
        'env_active_7d'     => $one('SELECT COUNT(*) FROM environments WHERE last_seen_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)'),
        'env_active_30d'    => $one('SELECT COUNT(*) FROM environments WHERE last_seen_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)'),
        'env_new_7d'        => $one('SELECT COUNT(*) FROM environments WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)'),
        'env_locked'        => $one('SELECT COUNT(*) FROM environments WHERE locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP()'),
        'env_curators'      => $one('SELECT COUNT(*) FROM environments WHERE is_curator = 1'),
        'env_admins'        => $one('SELECT COUNT(*) FROM environments WHERE is_admin = 1'),
        'objects'           => $one('SELECT COUNT(*) FROM objects WHERE deleted_at IS NULL'),
        'objects_deleted'   => $one('SELECT COUNT(*) FROM objects WHERE deleted_at IS NOT NULL'),
        'bytes'             => $one('SELECT COALESCE(SUM(bytes), 0) FROM objects WHERE deleted_at IS NULL'),
        'by_kind'           => $kinds,
        'sessions'          => $one('SELECT COUNT(*) FROM sessions WHERE expires_at > UTC_TIMESTAMP()'),
        // Abgelaufenes, das noch da ist, heisst: gc.php laeuft nicht.
        'sessions_stale'    => $one('SELECT COUNT(*) FROM sessions WHERE expires_at <= UTC_TIMESTAMP()'),
        'device_links'      => $one('SELECT COUNT(*) FROM device_links'),
        'shares'            => $one('SELECT COUNT(*) FROM shares'),
        'lib_public'        => $one("SELECT COUNT(*) FROM library WHERE status = 'public'"),
        'lib_pending'       => $one("SELECT COUNT(*) FROM library WHERE status = 'pending'"),
        'lib_rejected'      => $one("SELECT COUNT(*) FROM library WHERE status = 'rejected'"),
        'lib_pending_age_h' => $one("SELECT COALESCE(TIMESTAMPDIFF(HOUR, MIN(created_at), UTC_TIMESTAMP()), 0)
                                     FROM library WHERE status = 'pending'"),
        'cc_active'         => $one('SELECT COUNT(*) FROM class_codes WHERE revoked_at IS NULL
                                     AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())'),
        'cc_redeems'        => $one('SELECT COALESCE(SUM(redeems), 0) FROM class_codes'),
        'rate_hits_24h'     => (int)$pdo->query('SELECT COALESCE(SUM(hits), 0) FROM rate_limits
                                                 WHERE window_start > ' . (time() - 86400))->fetchColumn(),
    ]]);
}

// ------------------------------- Groesste Umgebungen - ZAHLEN, keine Inhalte
if ($act === 'top_envs') {
    adm_require();
    $by = ((string)($in['by'] ?? 'bytes') === 'recent') ? 'last_seen_at' : 'bytes_used';
    $st = db()->query(
        'SELECT id, created_at, last_seen_at, bytes_used, obj_count, locked_until, is_curator, is_admin
         FROM environments ORDER BY ' . $by . ' DESC LIMIT 25'
    );
    json_out(['ok' => true, 'envs' => array_map(static function (array $r): array {
        return [
            'id' => (int)$r['id'], 'created_at' => $r['created_at'], 'last_seen_at' => $r['last_seen_at'],
            'bytes' => (int)$r['bytes_used'], 'objects' => (int)$r['obj_count'],
            'locked_until' => $r['locked_until'],
            'curator' => (int)$r['is_curator'] === 1, 'admin' => (int)$r['is_admin'] === 1,
        ];
    }, $st->fetchAll())]);
}

// --------------------------- Eine Umgebung - ebenfalls nur Zahlen ueber sie
if ($act === 'env_info') {
    adm_require();
    $id = adm_int($in['id'] ?? 0);
    $st = db()->prepare(
        'SELECT id, created_at, last_seen_at, bytes_used, obj_count, locked_until,
                failed_logins, is_curator, is_admin
         FROM environments WHERE id = ?'
    );
    $st->execute([$id]);
    $e = $st->fetch();
    if (!$e) fail('not_found', 404);

    // Objektarten als ANZAHL. Namen und Inhalte werden bewusst nicht geholt.
    $kinds = [];
    $st = db()->prepare('SELECT kind, COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b
                         FROM objects WHERE env_id = ? AND deleted_at IS NULL GROUP BY kind');
    $st->execute([$id]);
    foreach ($st->fetchAll() as $r) $kinds[] = ['kind' => $r['kind'], 'count' => (int)$r['n'], 'bytes' => (int)$r['b']];

    $cnt = static function (string $sql, int $id): int {
        $s = db()->prepare($sql); $s->execute([$id]); return (int)$s->fetchColumn();
    };
    json_out(['ok' => true, 'env' => [
        'id' => (int)$e['id'], 'created_at' => $e['created_at'], 'last_seen_at' => $e['last_seen_at'],
        'bytes' => (int)$e['bytes_used'], 'objects' => (int)$e['obj_count'],
        'locked_until' => $e['locked_until'], 'failed_logins' => (int)$e['failed_logins'],
        'curator' => (int)$e['is_curator'] === 1, 'admin' => (int)$e['is_admin'] === 1,
        'by_kind' => $kinds,
        'sessions'     => $cnt('SELECT COUNT(*) FROM sessions WHERE env_id = ? AND expires_at > UTC_TIMESTAMP()', $id),
        'lib_entries'  => $cnt('SELECT COUNT(*) FROM library WHERE env_id = ?', $id),
        'class_codes'  => $cnt('SELECT COUNT(*) FROM class_codes WHERE env_id = ?', $id),
    ]]);
}

// ------------------------------------------------------------------ Sperren
if ($act === 'env_lock') {
    $actor = adm_require();
    $id    = adm_int($in['id'] ?? 0);
    $days  = max(1, min(3650, adm_int($in['days'] ?? 30)));
    if ($id === $actor) fail('self_target', 400);

    $st = db()->prepare('UPDATE environments SET locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY) WHERE id = ?');
    $st->execute([$days, $id]);
    if ($st->rowCount() === 0) fail('not_found', 404);

    // locked_until blockiert nur die ANMELDUNG. Ohne das hier liefe ein bereits
    // angemeldetes Geraet unbehelligt weiter - die Sperre waere wirkungslos.
    db()->prepare('DELETE FROM sessions WHERE env_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM device_links WHERE env_id = ?')->execute([$id]);

    adm_log($actor, 'env_lock', $id, $days . ' Tage');
    json_out(['ok' => true, 'days' => $days]);
}

if ($act === 'env_unlock') {
    $actor = adm_require();
    $id    = adm_int($in['id'] ?? 0);
    $st = db()->prepare('UPDATE environments SET locked_until = NULL, failed_logins = 0 WHERE id = ?');
    $st->execute([$id]);
    if ($st->rowCount() === 0) fail('not_found', 404);
    adm_log($actor, 'env_unlock', $id);
    json_out(['ok' => true]);
}

// ------------------------------------------------------------------ Loeschen
if ($act === 'env_delete') {
    $actor = adm_require();
    $id    = adm_int($in['id'] ?? 0);
    if ($id === $actor) fail('self_target', 400);
    // Ausdrueckliche Bestaetigung: der Eingriff ist endgueltig und trifft alles,
    // was in der Umgebung liegt (CASCADE).
    if (($in['confirm'] ?? '') !== 'DELETE') fail('confirm_required', 400);

    $st = db()->prepare('DELETE FROM environments WHERE id = ?');
    $st->execute([$id]);
    if ($st->rowCount() === 0) fail('not_found', 404);
    adm_log($actor, 'env_delete', $id);
    json_out(['ok' => true]);
}

// ------------------------------------------------------------- Protokoll
if ($act === 'log') {
    adm_require();
    $st = db()->query(
        'SELECT actor_env, action, target_env, note, created_at
         FROM admin_log ORDER BY id DESC LIMIT 100'
    );
    json_out(['ok' => true, 'log' => array_map(static function (array $r): array {
        return ['actor' => (int)$r['actor_env'], 'action' => $r['action'],
                'target' => $r['target_env'] === null ? null : (int)$r['target_env'],
                'note' => $r['note'], 'at' => $r['created_at']];
    }, $st->fetchAll())]);
}

fail('unknown_action');
