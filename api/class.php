<?php
declare(strict_types=1);
/**
 * Klassen-Freigabecodes: eine Lehrkraft verteilt Aufgaben, Pakete oder Anlagen
 * an eine Lerngruppe.
 *
 * BEWUSST KEINE GRUPPE. Der Code ist ein Verteilweg in EINE Richtung: er gibt
 * heraus und nimmt nie etwas entgegen. Damit entsteht keine Zuordnung Person →
 * Umgebung - genau die fehlt hier absichtlich, sie ist die Grundlage dafuer,
 * dass serverseitig keine personenbezogenen Daten liegen. Gezaehlt werden
 * Einloesungen; gespeichert wird NICHT, wer eingeloest hat.
 *
 * Der Code zeigt auf eine LISTE von Objekten, nicht auf eine Kopie davon. Wer
 * ihn erneut einloest, bekommt den aktuellen Stand - eine Korrektur erreicht
 * die Lerngruppe ohne neuen Code. Das ist der praktische Unterschied zu einem
 * Freigabe-Link auf einen eingefrorenen Stand.
 *
 * Der Code steht im KLARTEXT in der Datenbank, anders als Umgebungscodes. Er
 * muss in der naechsten Stunde noch vorlesbar sein, und er schuetzt nichts,
 * was in derselben Datenbank nicht ohnehin steht: er gibt ausschliesslich
 * Lesezugriff auf eine feste Liste von Objekten. Umgebungscodes sind gehasht,
 * weil sie Schreibrecht auf eine ganze Umgebung geben - anderer Schutzbedarf,
 * andere Entscheidung.
 */
require __DIR__ . '/_boot.php';
require_post();

$in  = body_json();
$act = (string)($in['action'] ?? '');

const CC_MAX_ITEMS = 25;

/** 8 Zeichen aus dem verwechslungsfreien Alphabet = 40 Bit, in zwei Gruppen.
 *  Kuerzer als ein Umgebungscode, weil er an der Tafel steht und vorgelesen
 *  wird. Gegen Raten schuetzt zusaetzlich die Ratenbremse auf `redeem`. */
function cc_gen(): string {
    $b = random_bytes(8);
    $out = '';
    for ($i = 0; $i < 8; $i++) $out .= VALIS_ALPHABET[ord($b[$i]) & 31];
    return substr($out, 0, 4) . '-' . substr($out, 4, 4);
}
function cc_normalize(string $raw): string {
    $s = strtoupper(trim($raw));
    $s = preg_replace('/[^A-Z2-9]/', '', $s) ?? '';
    if (strlen($s) !== 8 || strspn($s, VALIS_ALPHABET) !== 8) return '';
    return substr($s, 0, 4) . '-' . substr($s, 4, 4);
}
function cc_text(mixed $v, int $max): string {
    $t = preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($v ?? '')) ?? '';
    return mb_substr(trim($t), 0, $max);
}
/** Codezeile zu einem eingegebenen Code - oder Abbruch. */
function cc_row(string $raw): array {
    $code = cc_normalize($raw);
    // Bei falschem Code kurz bremsen. Das verteuert Rateversuche zusaetzlich
    // zur Ratenbremse, ohne den regulaeren Fall spuerbar zu verzoegern.
    if ($code === '') { usleep(random_int(80000, 200000)); fail('code_invalid', 404); }

    $st = db()->prepare(
        'SELECT id, env_id, label, items, expires_at, revoked_at FROM class_codes WHERE code = ?'
    );
    $st->execute([$code]);
    $r = $st->fetch();
    if (!$r) { usleep(random_int(80000, 200000)); fail('code_invalid', 404); }
    if ($r['revoked_at'] !== null) fail('code_revoked', 403);
    if ($r['expires_at'] !== null && strtotime((string)$r['expires_at']) < time()) fail('code_expired', 403);

    $r['itemList'] = json_decode((string)$r['items'], true) ?: [];
    return $r;
}

// ------------------------------------------------------------- Code erzeugen
if ($act === 'create') {
    $envId = require_env();
    if (!rate_ok('cc-create|' . $envId, 30, 86400)) fail('rate_limited', 429);

    $label = cc_text($in['label'] ?? '', 120);
    $raw   = $in['items'] ?? [];
    if (!is_array($raw) || !$raw) fail('items_required');
    if (count($raw) > CC_MAX_ITEMS) fail('too_many_items');

    // Nur eigene, existierende Objekte. Der Code ist eine Verweisliste, also
    // muss beim Anlegen feststehen, dass die Verweise stimmen.
    $items = [];
    $chk = db()->prepare(
        'SELECT 1 FROM objects WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL'
    );
    foreach ($raw as $it) {
        $kind = strtolower(trim((string)($it['kind'] ?? '')));
        $uid  = trim((string)($it['uid'] ?? ''));
        if (!preg_match('/^[a-z][a-z0-9_]{0,31}$/', $kind)) fail('kind_invalid');
        if (!preg_match('/^[A-Za-z0-9_-]{8,36}$/', $uid))   fail('uid_invalid');
        $chk->execute([$envId, $kind, $uid]);
        if ($chk->fetchColumn() === false) fail('not_found', 404);
        $items[] = ['kind' => $kind, 'uid' => $uid];
    }

    $days = isset($in['expires_days']) ? max(0, min(3650, (int)$in['expires_days'])) : 365;
    $sql = 'INSERT INTO class_codes (code, env_id, label, items, created_at, expires_at)
            VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), '
          . ($days > 0 ? 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)' : 'NULL') . ')';

    for ($try = 0; $try < 5; $try++) {
        $code = cc_gen();
        $args = [$code, $envId, $label, json_encode($items, JSON_UNESCAPED_UNICODE)];
        if ($days > 0) $args[] = $days;
        try {
            db()->prepare($sql)->execute($args);
            json_out(['ok' => true, 'code' => $code, 'expires_days' => $days ?: null,
                      'items' => count($items)]);
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') throw $e;   // nur Kollisionen erneut versuchen
        }
    }
    fail('code_collision', 500);
}

// ------------------------------------------------------------ Eigene Codes
if ($act === 'list') {
    $envId = require_env();

    // Namen einmal fuer die ganze Umgebung holen, statt je Code zu fragen.
    $names = [];
    $st = db()->prepare('SELECT kind, obj_uid, name FROM objects WHERE env_id = ? AND deleted_at IS NULL');
    $st->execute([$envId]);
    foreach ($st->fetchAll() as $o) $names[$o['kind'] . '|' . $o['obj_uid']] = (string)$o['name'];

    $st = db()->prepare(
        'SELECT id, code, label, items, created_at, expires_at, revoked_at, redeems, last_redeem_at
         FROM class_codes WHERE env_id = ? ORDER BY created_at DESC LIMIT 100'
    );
    $st->execute([$envId]);

    $out = array_map(static function (array $r) use ($names): array {
        $items = json_decode((string)$r['items'], true) ?: [];
        return [
            'id'         => (int)$r['id'],
            'code'       => $r['code'],
            'label'      => $r['label'],
            'created_at' => $r['created_at'],
            'expires_at' => $r['expires_at'],
            'revoked'    => $r['revoked_at'] !== null,
            'redeems'    => (int)$r['redeems'],
            'last_redeem_at' => $r['last_redeem_at'],
            'items'      => array_map(static function (array $it) use ($names): array {
                $k = $it['kind'] . '|' . $it['uid'];
                return $it + ['name' => $names[$k] ?? null];   // null = inzwischen geloescht
            }, $items),
        ];
    }, $st->fetchAll());

    json_out(['ok' => true, 'codes' => $out]);
}

// ---------------------------------------------------------------- Widerrufen
if ($act === 'revoke') {
    $envId = require_env();
    $id = (int)($in['id'] ?? 0);
    $st = db()->prepare('UPDATE class_codes SET revoked_at = UTC_TIMESTAMP()
                         WHERE id = ? AND env_id = ? AND revoked_at IS NULL');
    $st->execute([$id, $envId]);
    json_out(['ok' => true, 'revoked' => $st->rowCount()]);
}

// ------------------------------------------- Einloesen (OHNE Anmeldung)
// Liefert nur das Verzeichnis. Die Daten holt der Client einzeln ueber `fetch`;
// so bleibt die Antwort klein und der Fortschritt ist anzeigbar.
if ($act === 'redeem') {
    if (!rate_ok('cc-redeem|' . ip_hash(), 60, 3600)) fail('rate_limited', 429);
    $r = cc_row((string)($in['code'] ?? ''));

    $meta = [];
    $st = db()->prepare(
        'SELECT name, bytes, updated_at FROM objects
         WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL'
    );
    foreach ($r['itemList'] as $it) {
        $st->execute([$r['env_id'], $it['kind'], $it['uid']]);
        $o = $st->fetch();
        if (!$o) continue;   // seit dem Anlegen geloescht - still ueberspringen
        $meta[] = ['kind' => $it['kind'], 'uid' => $it['uid'], 'name' => (string)$o['name'],
                   'bytes' => (int)$o['bytes'], 'updated_at' => $o['updated_at']];
    }

    // Nur ein Zaehler. Wer eingeloest hat, wird ausdruecklich nicht festgehalten.
    db()->prepare('UPDATE class_codes SET redeems = redeems + 1, last_redeem_at = UTC_TIMESTAMP()
                   WHERE id = ?')->execute([(int)$r['id']]);

    json_out(['ok' => true, 'label' => $r['label'], 'items' => $meta]);
}

// ---------------------------------- Einzelnes Objekt holen (OHNE Anmeldung)
if ($act === 'fetch') {
    if (!rate_ok('cc-fetch|' . ip_hash(), 300, 3600)) fail('rate_limited', 429);
    $r    = cc_row((string)($in['code'] ?? ''));
    $kind = strtolower(trim((string)($in['kind'] ?? '')));
    $uid  = trim((string)($in['uid'] ?? ''));

    // Der Code berechtigt nur zu genau den Objekten, die in ihm stehen.
    $listed = false;
    foreach ($r['itemList'] as $it) {
        if ($it['kind'] === $kind && $it['uid'] === $uid) { $listed = true; break; }
    }
    if (!$listed) fail('not_listed', 403);

    $st = db()->prepare(
        'SELECT name, data, updated_at FROM objects
         WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL'
    );
    $st->execute([$r['env_id'], $kind, $uid]);
    $o = $st->fetch();
    if (!$o) fail('not_found', 404);

    json_out(['ok' => true, 'object' => [
        'kind' => $kind, 'uid' => $uid, 'name' => (string)$o['name'],
        'updated_at' => $o['updated_at'], 'data' => json_decode((string)$o['data'], true),
    ]]);
}

fail('unknown_action');
