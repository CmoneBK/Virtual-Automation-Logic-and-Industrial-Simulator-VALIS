<?php
declare(strict_types=1);
/**
 * Wartung / Loeschkonzept. Per Cron aufrufen, z. B. taeglich:
 *   curl -fsS "https://t-bk.de/projekte/valis/api/gc.php?key=<gc_key>"
 * oder lokal:  php /pfad/zu/api/gc.php --cli
 *
 * Loescht: abgelaufene Sitzungen, alte Rate-Limit-Zeilen, abgelaufene Freigaben
 * und inaktive Umgebungen (inactive_delete_days).
 */
require __DIR__ . '/_boot.php';

$cfg  = valis_config();
$isCli = PHP_SAPI === 'cli';
if (!$isCli) {
    $key = (string)($_GET['key'] ?? '');
    $expected = (string)($cfg['gc_key'] ?? '');
    if ($expected === '' || !hash_equals($expected, $key)) fail('forbidden', 403);
}

$pdo = db();
$out = [];

$st = $pdo->query('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()');
$out['sessions_deleted'] = $st->rowCount();

$st = $pdo->prepare('DELETE FROM rate_limits WHERE window_start < ?');
$st->execute([time() - 7 * 86400]);
$out['rate_rows_deleted'] = $st->rowCount();

$st = $pdo->query('DELETE FROM shares WHERE expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP()');
$out['shares_deleted'] = $st->rowCount();

$st = $pdo->query('DELETE FROM device_links WHERE expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP()');
$out['device_links_deleted'] = $st->rowCount();

$st = $pdo->query('DELETE FROM presence WHERE updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)');
$out['presence_deleted'] = $st->rowCount();

// Objekte, die als geloescht markiert wurden, nach 30 Tagen endgueltig entfernen.
$st = $pdo->query('DELETE FROM objects WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)');
$out['objects_purged'] = $st->rowCount();

// Loeschkonzept: inaktive Umgebungen samt Inhalt (CASCADE).
$days = (int)$cfg['inactive_delete_days'];
$st = $pdo->prepare('DELETE FROM environments WHERE last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)');
$st->execute([$days]);
$out['environments_deleted'] = $st->rowCount();

if ($isCli) {
    echo json_encode($out, JSON_PRETTY_PRINT), "\n";
    exit;
}
json_out(['ok' => true] + $out);
