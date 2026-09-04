<?php
declare(strict_types=1);
/**
 * Capability-Probe. VALIS erkennt hieran, ob es auf der Server-Instanz laeuft.
 *
 * Auf GitHub Pages wird diese Datei als ROHTEXT ausgeliefert ("<?php ...") →
 * JSON.parse im Client schlaegt fehl → Cloud-Funktionen bleiben aus.
 * Das ist der gewollte Unterschied zwischen den beiden Deployments.
 */
require __DIR__ . '/_boot.php';

$db     = false;
$signup = false;
$reason = null;

// Bewusst NICHT abbrechen, wenn etwas fehlt: ping soll immer 200 liefern und
// sagen, WAS fehlt. Der Client schaltet die Cloud ohnehin nur bei db === true frei.
$cfg = valis_config(false);
if ($cfg === []) {
    $reason = 'config_missing';
} else {
    try {
        db()->query('SELECT 1');
        $db     = true;
        $signup = (bool)$cfg['allow_open_signup'];
    } catch (Throwable $e) {
        $reason = 'db_error';
        error_log('[valis-api] ping: db unavailable: ' . $e->getMessage());
    }
}

json_out([
    'ok'        => true,
    'valis_api' => 1,
    'v'         => 1,
    'db'        => $db,
    'signup'    => $signup,
    'reason'    => $reason,
]);
