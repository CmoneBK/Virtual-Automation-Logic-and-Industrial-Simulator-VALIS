<?php
declare(strict_types=1);
/**
 * Bibliothek: veroeffentlichte Aufgaben, Pakete und Szenarien.
 *
 * ZUSAETZLICH zur eingebauten Sammlung in index.html, nicht als Ersatz - die
 * Version ohne Server bleibt vollstaendig.
 *
 * Lesen geht OHNE Anmeldung: die Bibliothek ist der oeffentliche Teil dieser
 * Installation. Einreichen, Zurueckziehen und Freigeben brauchen eine Umgebung.
 *
 * Moderation: Ohne sie waere die Bibliothek bei offener Registrierung eine
 * offene Pinnwand. Eingereichtes ist deshalb erst nach Freigabe sichtbar.
 */
require __DIR__ . '/_boot.php';
require_post();

$in  = body_json();
$cfg = valis_config();
$act = (string)($in['action'] ?? '');

function lib_kind(mixed $v): string {
    $k = strtolower(trim((string)$v));
    if (!preg_match('/^[a-z][a-z0-9_]{0,31}$/', $k)) fail('kind_invalid');
    return $k;
}
function lib_text(mixed $v, int $max): string {
    $t = preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($v ?? '')) ?? '';
    return mb_substr(trim($t), 0, $max);
}
/** Umgebung des Aufrufers mit Kurator-Kennzeichen. */
function lib_me(): array {
    $envId = require_env();
    $st = db()->prepare('SELECT is_curator FROM environments WHERE id = ?');
    $st->execute([$envId]);
    return ['env' => $envId, 'curator' => ((int)$st->fetchColumn() === 1)];
}

// ------------------------------------------------- Auflisten (ohne Anmeldung)
if ($act === 'list') {
    $sql  = 'SELECT id, kind, title, descr, bytes, updated_at, hits FROM library WHERE status = ?';
    $args = ['public'];
    if (($in['kind'] ?? '') !== '') { $sql .= ' AND kind = ?'; $args[] = lib_kind($in['kind']); }
    $sql .= ' ORDER BY updated_at DESC LIMIT 300';
    $st = db()->prepare($sql);
    $st->execute($args);
    json_out(['ok' => true, 'items' => array_map(static function (array $r): array {
        return [
            'id' => (int)$r['id'], 'kind' => $r['kind'], 'title' => $r['title'],
            'descr' => $r['descr'], 'bytes' => (int)$r['bytes'],
            'updated_at' => $r['updated_at'], 'hits' => (int)$r['hits'],
        ];
    }, $st->fetchAll())]);
}

// ---------------------------------------------------- Holen (ohne Anmeldung)
if ($act === 'get') {
    if (!rate_ok('lib-get|' . ip_hash(), 300, 3600)) fail('rate_limited', 429);
    $id = (int)($in['id'] ?? 0);
    $st = db()->prepare('SELECT kind, title, data FROM library WHERE id = ? AND status = ?');
    $st->execute([$id, 'public']);
    $r = $st->fetch();
    if (!$r) fail('not_found', 404);
    db()->prepare('UPDATE library SET hits = hits + 1 WHERE id = ?')->execute([$id]);
    json_out(['ok' => true, 'item' => [
        'kind' => $r['kind'], 'title' => $r['title'],
        'data' => json_decode((string)$r['data'], true),
    ]]);
}

// -------------------------------------------------------------- Einreichen
if ($act === 'submit') {
    $me = lib_me();
    if (!$me['curator'] && !$cfg['allow_library_submit']) fail('submit_closed', 403);
    if (!rate_ok('lib-submit|' . $me['env'], 20, 86400)) fail('rate_limited', 429);

    $kind  = lib_kind($in['kind'] ?? '');
    $uid   = trim((string)($in['uid'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_-]{8,36}$/', $uid)) fail('uid_invalid');
    $title = lib_text($in['title'] ?? '', 200);
    $descr = lib_text($in['descr'] ?? '', 1000);
    if ($title === '') fail('title_required');

    $st = db()->prepare(
        'SELECT data, bytes FROM objects
         WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL'
    );
    $st->execute([$me['env'], $kind, $uid]);
    $o = $st->fetch();
    if (!$o) fail('not_found', 404);

    // Kuratoren veroeffentlichen unmittelbar, alle anderen reichen ein.
    $status = $me['curator'] ? 'public' : 'pending';
    db()->prepare(
        'INSERT INTO library (env_id, kind, title, descr, data, bytes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())'
    )->execute([$me['env'], $kind, $title, $descr, $o['data'], (int)$o['bytes'], $status]);

    json_out(['ok' => true, 'id' => (int)db()->lastInsertId(), 'status' => $status]);
}

// --------------------------------------------- Eigene Eintraege / Warteschlange
if ($act === 'mine') {
    $me = lib_me();
    $st = db()->prepare(
        'SELECT id, kind, title, status, updated_at, hits FROM library
         WHERE env_id = ? ORDER BY updated_at DESC LIMIT 200'
    );
    $st->execute([$me['env']]);
    json_out(['ok' => true, 'curator' => $me['curator'], 'items' => $st->fetchAll()]);
}

if ($act === 'pending') {
    $me = lib_me();
    if (!$me['curator']) fail('forbidden', 403);
    $st = db()->query(
        'SELECT id, kind, title, descr, bytes, created_at FROM library
         WHERE status = \'pending\' ORDER BY created_at ASC LIMIT 200'
    );
    json_out(['ok' => true, 'items' => $st->fetchAll()]);
}

// ------------------------------------------------------------- Freigeben
if ($act === 'moderate') {
    $me = lib_me();
    if (!$me['curator']) fail('forbidden', 403);
    $id = (int)($in['id'] ?? 0);
    $to = (string)($in['status'] ?? '');
    if ($to !== 'public' && $to !== 'rejected') fail('status_invalid');
    $st = db()->prepare('UPDATE library SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?');
    $st->execute([$to, $id]);
    json_out(['ok' => true, 'changed' => $st->rowCount()]);
}

// ---------------------------------------------------------- Zurueckziehen
if ($act === 'withdraw') {
    $me = lib_me();
    $id = (int)($in['id'] ?? 0);
    $sql = $me['curator'] ? 'DELETE FROM library WHERE id = ?'
                          : 'DELETE FROM library WHERE id = ? AND env_id = ?';
    $st = db()->prepare($sql);
    $st->execute($me['curator'] ? [$id] : [$id, $me['env']]);
    if ($st->rowCount() === 0) fail('not_found', 404);
    json_out(['ok' => true]);
}

// ------------------------------------------------- Kurator-Recht erwerben
// Der Schluessel steht in der Konfiguration AUSSERHALB des Webroots und wird
// auf dem Server erzeugt. Er wird einmalig eingegeben; danach traegt die
// Umgebung das Recht und der Schluessel muss nirgends gespeichert werden.
if ($act === 'claim_curator') {
    $envId = require_env();
    if (!rate_ok('curator|' . ip_hash(), 10, 3600)) fail('rate_limited', 429);
    $key = (string)($in['key'] ?? '');
    $exp = (string)($cfg['curator_key'] ?? '');
    if ($exp === '' || !hash_equals($exp, $key)) { usleep(random_int(120000, 260000)); fail('bad_key', 403); }
    db()->prepare('UPDATE environments SET is_curator = 1 WHERE id = ?')->execute([$envId]);
    json_out(['ok' => true]);
}

fail('unknown_action');
