<?php
/**
 * Song & Chord Lab - REST API
 * Single-file router: PHP + SQLite on Synology Web Station
 *
 * Endpoints:
 *   GET  ?action=search&q=...&page=1   Search by song name / artist
 *   GET  ?action=recent&page=1         Recent songs list
 *   GET  ?action=get&id=123            Get full song data
 *   POST ?action=save                  Create or update (upsert)
 *   DELETE ?action=delete&id=123       Delete a song
 *
 * Security features:
 *   - API Key authentication (X-API-Key header)
 *   - CORS restriction (GitHub Pages only)
 *   - Server-side IP rate limiting (SQLite-based)
 *   - Request logging
 *   - CSP + cache prevention headers
 */

require_once __DIR__ . '/config.php';

/* ── Security Headers ── */

// CORS
header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

// Content type
header('Content-Type: application/json; charset=utf-8');

// Cache prevention - API responses should never be cached
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// CSP - restrict what can be loaded
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

// Additional security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ── Rate Limiting (IP-based, SQLite) ── */

function checkRateLimit() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    $rlDb = new PDO('sqlite:' . RATE_LIMIT_DB);
    $rlDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $rlDb->exec("CREATE TABLE IF NOT EXISTS requests (
        ip TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    )");
    $rlDb->exec("CREATE INDEX IF NOT EXISTS idx_ip_ts ON requests(ip, timestamp)");

    $now = time();
    $windowStart = $now - RATE_LIMIT_WINDOW;

    // Clean old entries (older than window)
    $rlDb->prepare("DELETE FROM requests WHERE timestamp < :ts")
         ->execute([':ts' => $windowStart]);

    // Count recent requests from this IP
    $stmt = $rlDb->prepare("SELECT COUNT(*) FROM requests WHERE ip = :ip AND timestamp >= :ts");
    $stmt->execute([':ip' => $ip, ':ts' => $windowStart]);
    $count = (int)$stmt->fetchColumn();

    if ($count >= RATE_LIMIT_MAX) {
        $retryAfter = RATE_LIMIT_WINDOW;
        header("Retry-After: $retryAfter");
        http_response_code(429);
        echo json_encode(['error' => 'Too many requests. Try again later.', 'retry_after' => $retryAfter]);
        exit;
    }

    // Record this request
    $rlDb->prepare("INSERT INTO requests (ip, timestamp) VALUES (:ip, :ts)")
         ->execute([':ip' => $ip, ':ts' => $now]);
}

checkRateLimit();

/* ── Request Logging ── */

function logRequest($action, $statusCode = 200, $extra = '') {
    if (!LOG_ENABLED) return;

    $logDir = LOG_DIR;
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0750, true);
    }

    $logFile = $logDir . '/api-' . date('Y-m-d') . '.log';
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $method = $_SERVER['REQUEST_METHOD'] ?? '?';
    $time = date('Y-m-d H:i:s');
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '-';

    $line = "[$time] $method $action $statusCode | IP: $ip | Origin: $origin";
    if ($extra) $line .= " | $extra";
    $line .= "\n";

    @file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
}

/* ── Auth ── */
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($apiKey !== API_KEY) {
    logRequest('AUTH_FAIL', 401);
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

/* ── Database ── */
$db = new PDO('sqlite:' . DB_PATH);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec("PRAGMA journal_mode=WAL");  // better concurrent read performance

$db->exec("CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_name TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    album_name TEXT DEFAULT '',
    composer TEXT DEFAULT '',
    lyricist TEXT DEFAULT '',
    tempo TEXT DEFAULT '',
    time_signature TEXT DEFAULT '',
    key_signature TEXT DEFAULT '',
    lyrics_intro TEXT DEFAULT '',
    genius_url TEXT DEFAULT '',
    apple_music_url TEXT DEFAULT '',
    selected_chords TEXT DEFAULT '[]',
    capo_position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(song_name, artist)
)");
$db->exec("CREATE INDEX IF NOT EXISTS idx_songs_name ON songs(song_name)");
$db->exec("CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist)");
$db->exec("CREATE INDEX IF NOT EXISTS idx_songs_updated ON songs(updated_at DESC)");

/* ── FTS5 Full-Text Search (trigram: substring matching with index) ── */
$ftsAvailable = false;
try {
    $db->exec("CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
        song_name, artist,
        content='songs',
        content_rowid='id',
        tokenize='trigram'
    )");

    // Triggers to keep FTS index in sync with songs table
    $db->exec("CREATE TRIGGER IF NOT EXISTS songs_fts_ins AFTER INSERT ON songs BEGIN
        INSERT INTO songs_fts(rowid, song_name, artist) VALUES (new.id, new.song_name, new.artist);
    END");

    $db->exec("CREATE TRIGGER IF NOT EXISTS songs_fts_del AFTER DELETE ON songs BEGIN
        INSERT INTO songs_fts(songs_fts, rowid, song_name, artist) VALUES('delete', old.id, old.song_name, old.artist);
    END");

    $db->exec("CREATE TRIGGER IF NOT EXISTS songs_fts_upd AFTER UPDATE ON songs BEGIN
        INSERT INTO songs_fts(songs_fts, rowid, song_name, artist) VALUES('delete', old.id, old.song_name, old.artist);
        INSERT INTO songs_fts(rowid, song_name, artist) VALUES (new.id, new.song_name, new.artist);
    END");

    // Rebuild FTS index if songs exist but FTS is empty (first run on existing DB)
    $ftsCount = (int)$db->query("SELECT COUNT(*) FROM songs_fts")->fetchColumn();
    $songsCount = (int)$db->query("SELECT COUNT(*) FROM songs")->fetchColumn();
    if ($ftsCount === 0 && $songsCount > 0) {
        $db->exec("INSERT INTO songs_fts(songs_fts) VALUES('rebuild')");
    }

    $ftsAvailable = true;
} catch (Exception $e) {
    // FTS5 or trigram tokenizer not available — fall back to LIKE
    $ftsAvailable = false;
}

/* ── Router ── */
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$limit = min(max(1, intval($_GET['per_page'] ?? 7)), 20);

switch ($action) {

    /* ── Search (FTS5 trigram → LIKE fallback) ── */
    case 'search':
        $rawQ = trim($_GET['q'] ?? '');
        $page = max(1, intval($_GET['page'] ?? 1));
        $offset = ($page - 1) * $limit;

        // FTS5 trigram requires at least 3 chars; shorter queries use LIKE
        if ($ftsAvailable && mb_strlen($rawQ, 'UTF-8') >= 3) {
            // Quote the query to treat as literal string (escape internal quotes)
            $ftsQ = '"' . str_replace('"', '""', $rawQ) . '"';

            $stmt = $db->prepare(
                "SELECT s.id, s.song_name, s.artist, s.album_name, s.key_signature, s.updated_at
                 FROM songs s
                 JOIN songs_fts fts ON s.id = fts.rowid
                 WHERE songs_fts MATCH :q
                 ORDER BY s.updated_at DESC
                 LIMIT :limit OFFSET :offset"
            );
            $stmt->bindValue(':q', $ftsQ, PDO::PARAM_STR);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();

            $countStmt = $db->prepare(
                "SELECT COUNT(*) FROM songs s JOIN songs_fts fts ON s.id = fts.rowid WHERE songs_fts MATCH :q"
            );
            $countStmt->execute([':q' => $ftsQ]);
            $total = (int)$countStmt->fetchColumn();
        } else {
            // Fallback: LIKE (short queries or FTS5 unavailable)
            $q = '%' . $rawQ . '%';
            $stmt = $db->prepare(
                "SELECT id, song_name, artist, album_name, key_signature, updated_at
                 FROM songs
                 WHERE song_name LIKE :q OR artist LIKE :q
                 ORDER BY updated_at DESC
                 LIMIT :limit OFFSET :offset"
            );
            $stmt->bindValue(':q', $q, PDO::PARAM_STR);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();

            $countStmt = $db->prepare(
                "SELECT COUNT(*) FROM songs WHERE song_name LIKE :q OR artist LIKE :q"
            );
            $countStmt->execute([':q' => $q]);
            $total = (int)$countStmt->fetchColumn();
        }

        $engine = ($ftsAvailable && mb_strlen($rawQ, 'UTF-8') >= 3) ? 'FTS5' : 'LIKE';
        logRequest('search', 200, "q=$rawQ, engine=$engine, results=$total");
        echo json_encode([
            'songs' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'total' => $total,
            'page' => $page,
            'totalPages' => max(1, ceil($total / $limit)),
        ]);
        break;

    /* ── Recent ── */
    case 'recent':
        $page = max(1, intval($_GET['page'] ?? 1));
        $offset = ($page - 1) * $limit;

        $stmt = $db->prepare(
            "SELECT id, song_name, artist, album_name, key_signature, updated_at
             FROM songs ORDER BY updated_at DESC
             LIMIT :limit OFFSET :offset"
        );
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $total = (int)$db->query("SELECT COUNT(*) FROM songs")->fetchColumn();

        logRequest('recent', 200, "page=$page");
        echo json_encode([
            'songs' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'total' => $total,
            'page' => $page,
            'totalPages' => max(1, ceil($total / $limit)),
        ]);
        break;

    /* ── Get one ── */
    case 'get':
        $id = intval($_GET['id'] ?? 0);
        $stmt = $db->prepare("SELECT * FROM songs WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            logRequest('get', 404, "id=$id");
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
        } else {
            $row['selected_chords'] = json_decode($row['selected_chords'], true) ?: [];
            $row['capo_position'] = (int)$row['capo_position'];
            logRequest('get', 200, "id=$id, song={$row['song_name']}");
            echo json_encode($row);
        }
        break;

    /* ── Save (upsert) ── */
    case 'save':
        if ($method !== 'POST') {
            logRequest('save', 405);
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
        }

        $body = json_decode(file_get_contents('php://input'), true);
        if (!$body || empty($body['song_name'])) {
            logRequest('save', 400, 'missing song_name');
            http_response_code(400);
            echo json_encode(['error' => 'song_name is required']);
            break;
        }

        $stmt = $db->prepare(
            "INSERT INTO songs
                (song_name, artist, album_name, composer, lyricist, tempo,
                 time_signature, key_signature, lyrics_intro, genius_url,
                 apple_music_url, selected_chords, capo_position)
             VALUES
                (:song_name, :artist, :album_name, :composer, :lyricist, :tempo,
                 :time_signature, :key_signature, :lyrics_intro, :genius_url,
                 :apple_music_url, :selected_chords, :capo_position)
             ON CONFLICT(song_name, artist) DO UPDATE SET
                album_name = excluded.album_name,
                composer = excluded.composer,
                lyricist = excluded.lyricist,
                tempo = excluded.tempo,
                time_signature = excluded.time_signature,
                key_signature = excluded.key_signature,
                lyrics_intro = excluded.lyrics_intro,
                genius_url = excluded.genius_url,
                apple_music_url = excluded.apple_music_url,
                selected_chords = excluded.selected_chords,
                capo_position = excluded.capo_position,
                updated_at = datetime('now')"
        );

        $stmt->execute([
            ':song_name'       => $body['song_name'] ?? '',
            ':artist'          => $body['artist'] ?? '',
            ':album_name'      => $body['album_name'] ?? '',
            ':composer'        => $body['composer'] ?? '',
            ':lyricist'        => $body['lyricist'] ?? '',
            ':tempo'           => $body['tempo'] ?? '',
            ':time_signature'  => $body['time_signature'] ?? '',
            ':key_signature'   => $body['key_signature'] ?? '',
            ':lyrics_intro'    => $body['lyrics_intro'] ?? '',
            ':genius_url'      => $body['genius_url'] ?? '',
            ':apple_music_url' => $body['apple_music_url'] ?? '',
            ':selected_chords' => json_encode($body['selected_chords'] ?? []),
            ':capo_position'   => intval($body['capo_position'] ?? 0),
        ]);

        $id = $db->lastInsertId();
        if (!$id) {
            $lookup = $db->prepare("SELECT id FROM songs WHERE song_name = :sn AND artist = :ar");
            $lookup->execute([':sn' => $body['song_name'], ':ar' => $body['artist'] ?? '']);
            $id = $lookup->fetchColumn();
        }

        logRequest('save', 200, "id=$id, song={$body['song_name']}");
        echo json_encode(['ok' => true, 'id' => (int)$id]);
        break;

    /* ── Delete ── */
    case 'delete':
        if ($method !== 'DELETE') {
            logRequest('delete', 405);
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
        }
        $id = intval($_GET['id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM songs WHERE id = :id");
        $stmt->execute([':id' => $id]);
        logRequest('delete', 200, "id=$id, affected={$stmt->rowCount()}");
        echo json_encode(['ok' => true, 'deleted' => $stmt->rowCount()]);
        break;

    default:
        logRequest('unknown', 400, "action=$action");
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
}
