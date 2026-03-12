<?php
/**
 * Song & Chord Lab API Configuration
 * Upload this file to /web/chord-lab-api/ on Synology
 */

// API authentication key (must match front-end js/db.js)
define('API_KEY', '096d10b7d1134473f2e9634089329a7893f6e06521f0ede251c9ab3f6be6f50b');

// SQLite database path
define('DB_PATH', __DIR__ . '/db/songs.db');

// CORS: only allow requests from GitHub Pages
define('ALLOWED_ORIGIN', 'https://mosica-b.github.io');

// Rate limiting
define('RATE_LIMIT_MAX', 60);        // max requests per window
define('RATE_LIMIT_WINDOW', 60);     // window in seconds (1 minute)
define('RATE_LIMIT_DB', __DIR__ . '/db/rate_limit.db');

// Logging
define('LOG_DIR', __DIR__ . '/logs');
define('LOG_ENABLED', true);
