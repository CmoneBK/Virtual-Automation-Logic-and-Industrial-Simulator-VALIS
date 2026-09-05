<?php
declare(strict_types=1);
/**
 * Objekte einer Umgebung: auflisten, lesen, schreiben, loeschen.
 *
 * Ein Objekt ist ein VALIS-Artefakt in seinem BESTEHENDEN Format
 * (Snapshot-Bundle, .valitask, .valipack, .valisscenario, ...). Der Server
 * kennt den Inhalt nicht und validiert ihn nicht - er speichert JSON.
 *
 * Mehrgeraete-Nutzung: optimistische Sperre ueber `version`. Wer auf einer
 * veralteten Version aufsetzt, bekommt 409 mitsamt dem Serverstand zurueck und
 * kann dann bewusst entscheiden (behalten / verwerfen / als Kopie speichern).
 * Es wird NIE still ueberschrieben.
 */
require __DIR__ . '/_boot.php';
require_post();

$envId = require_env();
$cfg   = valis_config();
$in    = body_json();
$act   = (string)($in['action'] ?? '');

function clean_kind(mixed $v): string {
    $k = strtolower(trim((string)$v));
    if (!preg_match('/^[a-z][a-z0-9_]{0,31}$/', $k)) fail('kind_invalid');
    return $k;
}
function clean_uid(mixed $v): string {
    $u = trim((string)$v);
    if (!preg_match('/^[A-Za-z0-9_-]{8,36}$/', $u)) fail('uid_invalid');
    return $u;
}
function clean_name(mixed $v): string {
    $n = preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($v ?? '')) ?? '';
    return mb_substr(trim($n), 0, 200);
}
function usage(int $envId): array {
    $cfg = valis_config();
    $st = db()->prepare(
        'SELECT COALESCE(SUM(bytes),0) AS b, COUNT(*) AS n FROM objects
         WHERE env_id = ? AND deleted_at IS NULL'
    );
    $st->execute([$envId]);
    $r = $st->fetch() ?: ['b' => 0, 'n' => 0];
    return [
        'bytes'       => (int)$r['b'],
        'objects'     => (int)$r['n'],
        'bytes_max'   => (int)$cfg['quota_bytes'],
        'objects_max' => (int)$cfg['quota_objects'],
    ];
}
function sync_usage(int $envId): array {
    $u = usage($envId);
    db()->prepare('UPDATE environments SET bytes_used = ?, obj_count = ? WHERE id = ?')
        ->execute([$u['bytes'], $u['objects'], $envId]);
    return $u;
}

// ------------------------------------------------------------------- auflisten
if ($act === 'list') {
    $sql  = 'SELECT kind, obj_uid, name, version, bytes, updated_at
             FROM objects WHERE env_id = ? AND deleted_at IS NULL';
    $args = [$envId];
    if (($in['kind'] ?? '') !== '') { $sql .= ' AND kind = ?'; $args[] = clean_kind($in['kind']); }
    $sql .= ' ORDER BY updated_at DESC LIMIT 2000';
    $st = db()->prepare($sql);
    $st->execute($args);
    $rows = array_map(static function (array $r): array {
        return [
            'kind'       => $r['kind'],
            'uid'        => $r['obj_uid'],
            'name'       => $r['name'],
            'version'    => (int)$r['version'],
            'bytes'      => (int)$r['bytes'],
            'updated_at' => $r['updated_at'],
        ];
    }, $st->fetchAll());
    json_out(['ok' => true, 'objects' => $rows, 'usage' => usage($envId)]);
}

// ----------------------------------------------------------------------- lesen
if ($act === 'get') {
    $st = db()->prepare(
        'SELECT kind, obj_uid, name, data, version, updated_at
         FROM objects WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL'
    );
    $st->execute([$envId, clean_kind($in['kind'] ?? ''), clean_uid($in['uid'] ?? '')]);
    $r = $st->fetch();
    if (!$r) fail('not_found', 404);
    json_out([
        'ok' => true,
        'object' => [
            'kind'       => $r['kind'],
            'uid'        => $r['obj_uid'],
            'name'       => $r['name'],
            'version'    => (int)$r['version'],
            'updated_at' => $r['updated_at'],
            'data'       => json_decode((string)$r['data'], true),
        ],
    ]);
}

// -------------------------------------------------------------------- schreiben
if ($act === 'put') {
    $kind = clean_kind($in['kind'] ?? '');
    $uid  = clean_uid($in['uid'] ?? '');
    $name = clean_name($in['name'] ?? '');
    if (!array_key_exists('data', $in)) fail('data_missing');

    $json = json_encode($in['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) fail('data_not_encodable');
    $bytes  = strlen($json);
    $maxOne = (int)($cfg['max_object_bytes'] ?? 2097152);
    if ($bytes > $maxOne) fail('object_too_large', 413, ['bytes' => $bytes, 'max' => $maxOne]);

    // base_version: 0 (oder fehlend) heisst "neu anlegen".
    $base = isset($in['base_version']) ? (int)$in['base_version'] : 0;

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'SELECT id, version, bytes, deleted_at FROM objects
             WHERE env_id = ? AND kind = ? AND obj_uid = ? FOR UPDATE'
        );
        $st->execute([$envId, $kind, $uid]);
        $cur = $st->fetch();

        // Ein soft-geloeschtes Objekt ist fuer den Client unsichtbar, weil `get`
        // es ausblendet. Er darf es also berechtigt fuer neu halten. Ohne diese
        // Ausnahme entstuende eine Sackgasse: `put` findet die Zeile, `get` nicht
        // - die Version waere nie zu lernen und es gaebe dauerhaft 409.
        if ($cur && $cur['deleted_at'] !== null) {
            $newVersion = (int)$cur['version'] + 1;
            $pdo->prepare(
                'UPDATE objects SET name = ?, data = ?, bytes = ?, version = ?,
                        updated_at = UTC_TIMESTAMP(), deleted_at = NULL
                 WHERE id = ?'
            )->execute([$name, $json, $bytes, $newVersion, $cur['id']]);
            $pdo->commit();
            json_out(['ok' => true, 'kind' => $kind, 'uid' => $uid, 'version' => $newVersion,
                      'revived' => true, 'usage' => sync_usage($envId)]);
        }

        if (!$cur) {
            if ($base !== 0) { $pdo->rollBack(); fail('not_found', 404); }
            // Quota nur beim Neuanlegen pruefen, damit ein Update am Limit nie scheitert.
            $u = usage($envId);
            if ($u['objects'] + 1 > $u['objects_max']) { $pdo->rollBack(); fail('quota_objects', 507, ['usage' => $u]); }
            if ($u['bytes'] + $bytes > $u['bytes_max']) { $pdo->rollBack(); fail('quota_bytes', 507, ['usage' => $u]); }

            $pdo->prepare(
                'INSERT INTO objects (env_id, kind, obj_uid, name, data, bytes, version, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP())'
            )->execute([$envId, $kind, $uid, $name, $json, $bytes]);
            $newVersion = 1;
        } else {
            if ((int)$cur['version'] !== $base) {
                // Konflikt: Serverstand mitliefern, damit der Client die Wahl hat.
                $s = $pdo->prepare('SELECT name, data, version, updated_at FROM objects WHERE id = ?');
                $s->execute([$cur['id']]);
                $srv = $s->fetch();
                $pdo->rollBack();
                fail('conflict', 409, ['server' => [
                    'kind'       => $kind,
                    'uid'        => $uid,
                    'name'       => $srv['name'],
                    'version'    => (int)$srv['version'],
                    'updated_at' => $srv['updated_at'],
                    'data'       => json_decode((string)$srv['data'], true),
                ]]);
            }
            $delta = $bytes - (int)$cur['bytes'];
            if ($delta > 0) {
                $u = usage($envId);
                if ($u['bytes'] + $delta > $u['bytes_max']) { $pdo->rollBack(); fail('quota_bytes', 507, ['usage' => $u]); }
            }
            $newVersion = (int)$cur['version'] + 1;
            $pdo->prepare(
                'UPDATE objects SET name = ?, data = ?, bytes = ?, version = ?,
                        updated_at = UTC_TIMESTAMP(), deleted_at = NULL
                 WHERE id = ?'
            )->execute([$name, $json, $bytes, $newVersion, $cur['id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    json_out(['ok' => true, 'kind' => $kind, 'uid' => $uid, 'version' => $newVersion, 'usage' => sync_usage($envId)]);
}

// ---------------------------------------------------------------------- loeschen
if ($act === 'delete') {
    $kind = clean_kind($in['kind'] ?? '');
    $uid  = clean_uid($in['uid'] ?? '');
    // Soft-Delete: gc.php raeumt nach 30 Tagen endgueltig auf. Versehentliches
    // Loeschen bleibt damit eine Weile umkehrbar.
    $st = db()->prepare(
        'UPDATE objects SET deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP(),
                version = version + 1
         WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL'
    );
    $st->execute([$envId, $kind, $uid]);
    if ($st->rowCount() === 0) fail('not_found', 404);
    json_out(['ok' => true, 'usage' => sync_usage($envId)]);
}

// -------------------------------------------- Gemeinsame Bearbeitung (Stift)
/**
 * Genau EIN Geraet haelt den Stift und darf schreiben, alle anderen lesen mit.
 * Damit gibt es keine gleichzeitigen Schreibzugriffe - und folglich weder
 * Zusammenfuehrung noch Datenverlust.
 *
 * Der Stift laeuft ueber einen Herzschlag ab (25 s). Schliesst jemand einfach
 * den Tab, wird er nach kurzer Zeit von selbst wieder frei.
 */
if ($act === 'live') {
    $kind = clean_kind($in['kind'] ?? '');
    $uid  = clean_uid($in['uid'] ?? '');
    $op   = (string)($in['op'] ?? 'status');
    $dev  = (string)($in['device'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{8,40}$/', $dev)) fail('device_invalid');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $sel = $pdo->prepare(
            'SELECT id, version, updated_at, live_on, live_owner, live_until, live_req_at
             FROM objects
             WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL
             FOR UPDATE'
        );
        $sel->execute([$envId, $kind, $uid]);
        $r = $sel->fetch();
        if (!$r) { $pdo->rollBack(); fail('not_found', 404); }

        $now   = time();
        $until = $r['live_until'] ? strtotime($r['live_until'] . ' UTC') : 0;
        $free  = ($r['live_owner'] === null || $until < $now);
        $mine  = ($r['live_owner'] === $dev && $until >= $now);

        $newOn = (int)$r['live_on']; $newOwner = $r['live_owner']; $ttl = null;
        // $req: true = Anfrage setzen, false = loeschen, null = unveraendert
        $req = null;
        if ($op === 'on')          { $newOn = 1; $newOwner = $dev; $ttl = true;  $req = false; }
        elseif ($op === 'off')     { $newOn = 0; $newOwner = null; $ttl = false; $req = false; }
        elseif ($op === 'claim')   {
            if ($free || $mine) { $newOn = 1; $newOwner = $dev; $ttl = true; $req = false; }
            // Vergeben: die Anfrage vormerken, damit der Inhaber sie sieht.
            else { $req = true; }
        }
        elseif ($op === 'beat')    { if ($mine) { $ttl = true; } }
        elseif ($op === 'release') { if ($mine) { $newOwner = null; $ttl = false; $req = false; } }

        if ($ttl !== null || $req !== null) {
            $sets = [];
            $args = [];
            if ($ttl !== null) {
                $sets[] = 'live_on = ?';    $args[] = $newOn;
                $sets[] = 'live_owner = ?'; $args[] = $newOwner;
                $sets[] = 'live_until = ' . ($ttl ? 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 25 SECOND)' : 'NULL');
            }
            if ($req !== null) {
                $sets[] = 'live_req_at = ' . ($req ? 'UTC_TIMESTAMP()' : 'NULL');
            }
            $args[] = $r['id'];
            $pdo->prepare('UPDATE objects SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($args);
            $sel->execute([$envId, $kind, $uid]);
            $r = $sel->fetch();
            $until = $r['live_until'] ? strtotime($r['live_until'] . ' UTC') : 0;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $t = time();
    $reqAt = $r['live_req_at'] ? strtotime($r['live_req_at'] . ' UTC') : 0;
    json_out([
        'ok'         => true,
        'on'         => (bool)$r['live_on'],
        // Bewusst nur Ja/Nein statt der fremden Geraetekennung.
        'mine'       => ($r['live_owner'] === $dev && $until >= $t),
        'taken'      => ($r['live_owner'] !== null && $until >= $t),
        // Frische Anfrage (20 s). Eine aeltere gilt als verfallen, damit ein
        // einmaliger Klick nicht dauerhaft blinkt.
        'requested'  => ($reqAt > 0 && ($t - $reqAt) < 20),
        'version'    => (int)$r['version'],
        'updated_at' => $r['updated_at'],
    ]);
}

// ----------------------------------------------------------- Aenderungen holen
/**
 * Liefert die seit `since` geaenderten Objekte - absichtlich OHNE `data`.
 * Der Client vergleicht Versionen und holt nur das per `get` nach, was er
 * wirklich braucht. Damit bleibt der Dauer-Abruf billig, auch wenn eine ganze
 * Klasse in derselben Umgebung arbeitet.
 *
 * Geloeschte Objekte sind enthalten (deleted = true), damit Loeschungen auf den
 * anderen Geraeten ankommen.
 */
if ($act === 'poll') {
    $since = (string)($in['since'] ?? '');
    $sql  = 'SELECT kind, obj_uid, name, version, updated_at, deleted_at
             FROM objects WHERE env_id = ?';
    $args = [$envId];
    if ($since !== '' && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $since)) {
        $sql .= ' AND updated_at > ?';
        $args[] = $since;
    }
    $sql .= ' ORDER BY updated_at ASC LIMIT 500';
    $st = db()->prepare($sql);
    $st->execute($args);

    json_out([
        'ok'      => true,
        // Serverzeit als Marke fuer den naechsten Abruf - so spielen abweichende
        // Uhren auf den Clients keine Rolle.
        'now'     => gmdate('Y-m-d H:i:s'),
        'changes' => array_map(static function (array $r): array {
            return [
                'kind'       => $r['kind'],
                'uid'        => $r['obj_uid'],
                'name'       => $r['name'],
                'version'    => (int)$r['version'],
                'updated_at' => $r['updated_at'],
                'deleted'    => $r['deleted_at'] !== null,
            ];
        }, $st->fetchAll()),
    ]);
}

// ------------------------------------------------------------------- Verbrauch
if ($act === 'usage') {
    json_out(['ok' => true, 'usage' => usage($envId)]);
}

fail('unknown_action');
