/**
 * iTunes Search Module
 * Searches iTunes API for album information
 */
const ITunesSearch = (() => {

  /**
   * Search for album info using song name and artist
   * @param {string} songName
   * @param {string} artist
   * @returns {Promise<{albumName: string, artworkUrl: string, releaseDate: string}|null>}
   */
  async function searchAlbum(songName, artist) {
    if (!songName && !artist) return null;

    const query = `${artist || ''} ${songName || ''}`.trim();
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=5&country=kr`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.results || data.results.length === 0) return null;

      // Try to find best match by song name
      const songLower = (songName || '').toLowerCase();
      let best = data.results[0];

      for (const r of data.results) {
        if (r.trackName && r.trackName.toLowerCase().includes(songLower)) {
          best = r;
          break;
        }
      }

      return {
        albumName: best.collectionName || '',
        artworkUrl: best.artworkUrl100 || '',
        releaseDate: best.releaseDate ? best.releaseDate.substring(0, 10) : '',
        trackViewUrl: best.trackViewUrl || '',
        artistViewUrl: best.artistViewUrl || '',
        trackName: best.trackName || '',
        artistName: best.artistName || '',
      };
    } catch (e) {
      console.warn('iTunes search failed:', e);
      return null;
    }
  }

  /**
   * Search Genius for direct lyrics page URL
   */
  const GENIUS_TOKEN = 'REMOVED_GENIUS_TOKEN';

  /**
   * Check if a Genius hit is a translation/romanization page (not original lyrics)
   */
  function isTranslationPage(hit) {
    const artist = (hit.result.primary_artist?.name || '').toLowerCase();
    const title = (hit.result.title || '').toLowerCase();
    return artist.includes('genius') || artist.includes('translation') ||
      artist.includes('romanization') || artist.includes('transcription') ||
      title.includes('translation') || title.includes('romanized') ||
      title.includes('transcription') || title.includes('번역') ||
      title.includes('annotated');
  }

  /**
   * Pick the best Genius URL from search hits, filtering out translations.
   */
  function pickBestHit(hits, songName, artist) {
    const songLower = (songName || '').toLowerCase();
    const artistLower = (artist || '').toLowerCase();
    // Pass 1: title matches song name & not a translation
    for (const hit of hits) {
      if (isTranslationPage(hit)) continue;
      if (hit.result.title && hit.result.title.toLowerCase().includes(songLower)) {
        return hit.result.url;
      }
    }
    // Pass 2: not translation AND (artist matches OR title matches song)
    for (const hit of hits) {
      if (isTranslationPage(hit)) continue;
      const hitArtist = (hit.result.primary_artist?.name || '').toLowerCase();
      if (artistLower && hitArtist.includes(artistLower)) return hit.result.url;
    }
    // Pass 3: title matches (even translation, as last resort)
    for (const hit of hits) {
      if (hit.result.title && hit.result.title.toLowerCase().includes(songLower)) {
        return hit.result.url;
      }
    }
    // No match found — return null so next query is tried
    return null;
  }

  async function searchGeniusLyrics(songName, artist, altSongName) {
    if (!songName) return null;

    // Build query list: song-first order works better (avoids translation page dominance)
    const queries = [
      `${songName} ${artist || ''}`.trim(),
    ];
    if (altSongName && altSongName.toLowerCase() !== songName.toLowerCase()) {
      queries.push(`${altSongName} ${artist || ''}`.trim());
    }
    // Also try artist-first as fallback
    const artistFirst = `${artist || ''} ${songName}`.trim();
    if (!queries.includes(artistFirst)) {
      queries.push(artistFirst);
    }

    for (const query of queries) {
      const geniusApiUrl = `https://api.genius.com/search?q=${encodeURIComponent(query)}&access_token=${GENIUS_TOKEN}`;

      const attempts = [
        () => fetch(geniusApiUrl),
        () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(geniusApiUrl)}`),
      ];

      for (const attempt of attempts) {
        try {
          const res = await attempt();
          if (!res.ok) continue;
          const data = await res.json();
          const hits = data.response && data.response.hits;
          if (!hits || hits.length === 0) break; // try next query

          const url = pickBestHit(hits, altSongName || songName, artist);
          if (url) return url;
          break;
        } catch (e) {
          // Try next attempt
        }
      }
    }
    console.warn('Genius search failed: all attempts exhausted');
    return null;
  }

  /**
   * Fetch lyrics intro (first few lines) using LRCLIB API.
   * LRCLIB is a free, open-source lyrics database with CORS support.
   * @param {string} songName - Song name
   * @param {string} artist - Artist name
   * @param {string} [altSongName] - Alternate song name (e.g. English from iTunes)
   * @param {number} [maxLines=4] - Max lines to return
   * @returns {Promise<string|null>} First few lines or null on failure
   */
  async function fetchLyricsIntro(songName, artist, altSongName, maxLines = 2, altArtist) {
    if (!songName) return null;

    // Build query list with various song/artist combinations
    const queries = [`${songName} ${artist || ''}`.trim()];
    if (altSongName && altSongName.toLowerCase() !== songName.toLowerCase()) {
      queries.push(`${altSongName} ${artist || ''}`.trim());
      // Try alt song name with alt artist (both English)
      if (altArtist && altArtist.toLowerCase() !== (artist || '').toLowerCase()) {
        queries.push(`${altSongName} ${altArtist}`.trim());
      }
    }
    // Try original song name with alt artist
    if (altArtist && altArtist.toLowerCase() !== (artist || '').toLowerCase()) {
      queries.push(`${songName} ${altArtist}`.trim());
    }

    for (const query of queries) {
      try {
        const res = await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) continue;

        const results = await res.json();
        if (!results || results.length === 0) continue;

        // Find best match with plainLyrics
        const songNames = [songName, altSongName].filter(Boolean).map(s => s.toLowerCase());
        const artistNames = [artist, altArtist].filter(Boolean).map(s => s.toLowerCase());
        let best = null;

        // Pass 1: match both track name and artist (any combination)
        for (const r of results) {
          if (!r.plainLyrics) continue;
          const tn = (r.trackName || '').toLowerCase();
          const an = (r.artistName || '').toLowerCase();
          const trackMatch = songNames.some(s => tn.includes(s));
          const artistMatch = artistNames.some(a => an.includes(a));
          if (trackMatch && artistMatch) { best = r; break; }
        }
        // Pass 2: match track name only
        if (!best) {
          for (const r of results) {
            if (!r.plainLyrics) continue;
            const tn = (r.trackName || '').toLowerCase();
            if (songNames.some(s => tn.includes(s))) { best = r; break; }
          }
        }
        // Pass 3: first result with lyrics
        if (!best) {
          best = results.find(r => r.plainLyrics);
        }

        if (!best || !best.plainLyrics) continue;

        // Extract first N non-empty lines
        const lines = best.plainLyrics
          .split('\n')
          .map(l => l.trim())
          .filter(l => l);

        if (lines.length === 0) continue;
        return lines.slice(0, maxLines).join('\n');
      } catch (e) {
        // Try next query
      }
    }
    console.warn('LRCLIB lyrics fetch failed for:', songName);
    return null;
  }

  return { searchAlbum, searchGeniusLyrics, fetchLyricsIntro };
})();
