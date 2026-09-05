<?php
declare(strict_types=1);
/**
 * Anwesenheit: Schreibmarke im Code-Editor, Mauszeiger in der 2D-Anlage.
 *
 * Ein einziger Aufruf schreibt die eigene Position UND liefert die der
 * anderen - das halbiert die Anfragen gegenueber getrenntem Senden und Holen.
 *
 * Bewusst schlank gehalten: ein Upsert, ein Select, ein Aufraeum-Delete auf
 * einer winzigen Tabelle. Diese Datei wird im Sekundentakt aufgerufen, ihre
 * Laufzeit ist der einzige Wert, der bei vielen Teilnehmern zaehlt.
 *
 * Es werden keine Namen uebertragen. Die Farbe leitet der Client aus der
 * zufaelligen Geraetekennung ab.
 */
require __DIR__ . '/_boot.php';
require_post();

$envId = require_env();
$in    = body_json();

$kind = strtolower(trim((string)($in['kind'] ?? '')));
$uid  = trim((string)($in['uid'] ?? ''));
$dev  = (string)($in['device'] ?? '');
if (!preg_match('/^[a-z][a-z0-9_]{0,31}$/', $kind))   fail('kind_invalid');
if (!preg_match('/^[A-Za-z0-9_-]{8,36}$/', $uid))     fail('uid_invalid');
if (!preg_match('/^[A-Za-z0-9_-]{8,40}$/', $dev))     fail('device_invalid');

// Nur ganze Zahlen in vernuenftigen Grenzen; -1 heisst "keine Angabe".
$clamp = static function ($v, int $lo, int $hi): ?int {
    if ($v === null || $v === false || $v === '') return null;
    $n = (int)$v;
    return max($lo, min($hi, $n));
};
$caret  = $clamp($in['caret']     ?? -1, -1, 5000000) ?? -1;
$cEnd   = $clamp($in['caret_end'] ?? -1, -1, 5000000) ?? -1;
$mx     = $clamp($in['mx'] ?? null, -100000, 100000);
$my     = $clamp($in['my'] ?? null, -100000, 100000);

$st = db()->prepare(
    'SELECT id FROM objects
     WHERE env_id = ? AND kind = ? AND obj_uid = ? AND deleted_at IS NULL'
);
$st->execute([$envId, $kind, $uid]);
$objId = $st->fetchColumn();
if ($objId === false) fail('not_found', 404);

db()->prepare(
    'INSERT INTO presence (object_id, device, caret, caret_end, mx, my, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE caret = VALUES(caret), caret_end = VALUES(caret_end),
                             mx = VALUES(mx), my = VALUES(my), updated_at = VALUES(updated_at)'
)->execute([$objId, $dev, $caret, $cEnd, $mx, $my]);

// Verlassene Eintraege dieses Objekts entfernen - klein und billig, spart
// einen eigenen Aufraeumlauf.
db()->prepare(
    'DELETE FROM presence WHERE object_id = ? AND updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 20 SECOND)'
)->execute([$objId]);

$st = db()->prepare(
    'SELECT device, caret, caret_end, mx, my FROM presence
     WHERE object_id = ? AND device <> ?
       AND updated_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 SECOND)
     LIMIT 20'
);
$st->execute([$objId, $dev]);

json_out([
    'ok'    => true,
    'peers' => array_map(static function (array $r): array {
        return [
            'device'    => $r['device'],
            'caret'     => (int)$r['caret'],
            'caret_end' => (int)$r['caret_end'],
            'mx'        => $r['mx'] === null ? null : (int)$r['mx'],
            'my'        => $r['my'] === null ? null : (int)$r['my'],
        ];
    }, $st->fetchAll()),
]);
