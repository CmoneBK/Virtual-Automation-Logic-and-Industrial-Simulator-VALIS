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

$db = false;
$signup = false;
try {
    db()->query('SELECT 1');
    $db = true;
    $signup = (bool)valis_config()['allow_open_signup'];
} catch (Throwable $e) {
    error_log('[valis-api] ping: db unavailable: ' . $e->getMessage());
}

json_out([
    'ok'        => true,
    'valis_api' => 1,
    'v'         => 1,
    'db'        => $db,
    'signup'    => $signup,
]);
