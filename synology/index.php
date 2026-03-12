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
 */

require_once __DIR__ . '/config.php';

/* ── CORS ── */
header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ── Auth ── */
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($apiKey !== API_KEY) {
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

/* ── Router ── */
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$limit = 20;

switch ($action) {

    /* ── Search ── */
    case 'search':
        $q = '%' . ($_GET['q'] ?? '') . '%';
        $page = max(1, intval($_GET['page'] ?? 1));
        $offset = ($page - 1) * $limit;

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
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
        } else {
            $row['selected_chords'] = json_decode($row['selected_chords'], true) ?: [];
            $row['capo_position'] = (int)$row['capo_position'];
            echo json_encode($row);
        }
        break;

    /* ── Save (upsert) ── */
    case 'save':
        if ($method !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
        }

        $body = json_decode(file_get_contents('php://input'), true);
        if (!$body || empty($body['song_name'])) {
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

        echo json_encode(['ok' => true, 'id' => (int)$id]);
        break;

    /* ── Delete ── */
    case 'delete':
        if ($method !== 'DELETE') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
        }
        $id = intval($_GET['id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM songs WHERE id = :id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['ok' => true, 'deleted' => $stmt->rowCount()]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
}
