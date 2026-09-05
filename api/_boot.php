<?php
declare(strict_types=1);
/**
 * VALIS Cloud API – gemeinsames Fundament.
 *
 * WICHTIG: Diese Datei liegt im deploy-verwalteten Webroot und ist oeffentlich
 * lesbar (auf GitHub Pages sogar als Rohtext). Sie enthaelt daher KEINE Secrets.
 * Die Konfiguration wird von ausserhalb des Webroots geladen.
 */

// ---------------------------------------------------------------- Fehler → JSON
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
// Bewusst KEINE CORS-Header: dadurch ist die API ausschliesslich von der
// gleichen Origin (dem Server-Deployment) nutzbar. Die GitHub-Pages-Version
// kann sie technisch nicht erreichen – genau so ist es gewollt.

function json_out(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $error, int $status = 400, array $extra = []): never {
    json_out(array_merge(['ok' => false, 'error' => $error], $extra), $status);
}

set_exception_handler(function (Throwable $e): void {
    error_log('[valis-api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_out(['ok' => false, 'error' => 'internal'], 500);
});
set_error_handler(function (int $no, string $str, string $file, int $line): bool {
    throw new ErrorException($str, 0, $no, $file, $line);
});

// ------------------------------------------------------------------ Konfiguration
/**
 * Suchreihenfolge fuer die Config (erste Treffer gewinnt):
 *   1. Umgebungsvariable VALIS_CONFIG (im vHost setzen: SetEnv VALIS_CONFIG /pfad/config.php)
 *   2. <parent-of-document-root>/valis-secrets/config.php
 * Beide liegen AUSSERHALB von /projekte/valis/ und ueberleben damit rsync --delete.
 */
function valis_config(bool $required = true): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $candidates = [];
    $env = getenv('VALIS_CONFIG');
    if (is_string($env) && $env !== '') $candidates[] = $env;

    // Vom DOCUMENT_ROOT aus nach oben wandern und auf jeder Ebene beide
    // ueblichen Ablagen pruefen. Bei KeyHelp ist DOCUMENT_ROOT z. B.
    // /home/users/<user>/www/<domain>; zwei Ebenen hoeher liegt das Home mit
    // dem von KeyHelp vorgesehenen, nicht web-erreichbaren Verzeichnis files/.
    $dir = $_SERVER['DOCUMENT_ROOT'] ?? '';
    for ($up = 0; $up < 5 && $dir !== '' && $dir !== '/' && $dir !== '.'; $up++) {
        $candidates[] = $dir . '/files/valis-secrets/config.php';
        $candidates[] = $dir . '/valis-secrets/config.php';
        $parent = dirname($dir);
        if ($parent === $dir) break;
        $dir = $parent;
    }

    foreach ($candidates as $path) {
        if (is_readable($path)) {
            /** @var array $loaded */
            $loaded = require $path;
            if (!is_array($loaded)) fail('config_invalid', 500);
            $cfg = $loaded + [
                'allow_open_signup'   => true,
                'signup_secret'       => '',
                'quota_bytes'         => 5 * 1024 * 1024,
                'quota_objects'       => 300,
                'max_object_bytes'    => 2 * 1024 * 1024,
                'session_ttl_days'    => 60,
                'inactive_delete_days'=> 365,
                'signup_per_ip_day'   => 20,
                'login_max_fails'     => 10,
                // Neuere Schluessel: bestehende config.php-Dateien kennen sie
                // nicht, ohne Vorgabe gaebe es eine Warnung mitten in der
                // JSON-Antwort. Leerer Kurator-Schluessel = niemand wird Kurator.
                'curator_key'         => '',
                'allow_library_submit'=> true,
            ];
            return $cfg;
        }
    }
    if ($required) fail('config_missing', 503);
    return [];   // nur fuer ping.php: erlaubt eine Diagnose-Antwort statt 503
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = valis_config();
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['db_host'] ?? 'localhost', $c['db_name']);
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}

// ------------------------------------------------------------------- Hilfsmittel
function body_json(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    if (strlen($raw) > 8 * 1024 * 1024) fail('payload_too_large', 413);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function require_post(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('method_not_allowed', 405);
}

/** Code-Hash: hohe Entropie → schneller, indizierbarer Hash mit Pepper. */
function code_hash(string $code): string {
    return hash('sha256', valis_config()['pepper'] . '|code|' . $code);
}
/** Token-Hash fuer Session-Bearer-Tokens. */
function token_hash(string $token): string {
    return hash('sha256', valis_config()['pepper'] . '|tok|' . $token);
}
/** Eigener Hash-Raum fuer Geraete-Links, damit ein Link-Token nie als
 *  Sitzungs-Token durchgeht (und umgekehrt). */
function devlink_hash(string $token): string {
    return hash('sha256', valis_config()['pepper'] . '|devlink|' . $token);
}
/**
 * IP nur als tagesgesalzener Hash – wir speichern nie eine rohe IP.
 * (Die Apache-Logs sind davon unberuehrt und separat zu konfigurieren.)
 */
function ip_hash(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return hash('sha256', valis_config()['pepper'] . '|ip|' . gmdate('Y-m-d') . '|' . $ip);
}

/** Zeichenvorrat ohne Verwechslungsgefahr (kein I, O, 0, 1). */
const VALIS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function gen_code(): string {
    $bytes = random_bytes(15);
    $out = '';
    for ($i = 0; $i < 15; $i++) {
        // 256 / 32 = 8 → gleichverteilt, keine Modulo-Verzerrung.
        $out .= VALIS_ALPHABET[ord($bytes[$i]) & 31];
    }
    return substr($out, 0, 5) . '-' . substr($out, 5, 5) . '-' . substr($out, 10, 5);
}
/** Eingabe tolerant normalisieren: Gross, Trenner/Leerzeichen weg. */
function normalize_code(string $in): string {
    $s = strtoupper(trim($in));
    $s = preg_replace('/[^A-Z2-9]/', '', $s) ?? '';
    if (strlen($s) !== 15) return '';
    if (strspn($s, VALIS_ALPHABET) !== 15) return '';
    return substr($s, 0, 5) . '-' . substr($s, 5, 5) . '-' . substr($s, 10, 5);
}

/** Einfaches Fenster-Rate-Limit. Gibt false zurueck, wenn das Limit erreicht ist. */
function rate_ok(string $bucket, int $limit, int $windowSeconds): bool {
    $pdo = db();
    $now = time();
    $start = $now - ($now % $windowSeconds);
    $key = substr(hash('sha256', $bucket), 0, 48);
    $pdo->prepare(
        'INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE hits = IF(window_start = VALUES(window_start), hits + 1, 1),
                                 window_start = VALUES(window_start)'
    )->execute([$key, $start]);
    $st = $pdo->prepare('SELECT hits FROM rate_limits WHERE bucket = ?');
    $st->execute([$key]);
    return ((int)($st->fetchColumn() ?: 0)) <= $limit;
}

/** Authentifiziert per Bearer-Token; liefert die env_id. */
function require_env(): int {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/^Bearer\s+([A-Za-z0-9_\-]{20,120})$/', trim($hdr), $m)) fail('unauthorized', 401);
    $st = db()->prepare(
        'SELECT env_id FROM sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()'
    );
    $st->execute([token_hash($m[1])]);
    $envId = $st->fetchColumn();
    if ($envId === false) fail('unauthorized', 401);
    db()->prepare('UPDATE environments SET last_seen_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$envId]);
    return (int)$envId;
}
