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
  const GENIUS_TOKEN = 'YffNzB3NiIWH2-V1b1DQssDvOgeBGyBSRKN7u3eWY0Xm7xLoi0-iqxgFpSN9I_26';

  /**
   * Check if a Genius hit is a translation/romanization page (not original lyrics)
   */
  function isTranslationPage(hit) {
    const artist = (hit.result.primary_artist?.name || '').toLowerCase();
    const title = (hit.result.title || '').toLowerCase();
    return artist.includes('genius') || artist.includes('translation') ||
      artist.includes('romanization') || title.includes('translation') ||
      title.includes('romanized') || title.includes('번역');
  }

  /**
   * Pick the best Genius URL from search hits, filtering out translations.
   */
  function pickBestHit(hits, songName) {
    const songLower = (songName || '').toLowerCase();
    // Pass 1: title matches song name & not a translation
    for (const hit of hits) {
      if (isTranslationPage(hit)) continue;
      if (hit.result.title && hit.result.title.toLowerCase().includes(songLower)) {
        return hit.result.url;
      }
    }
    // Pass 2: first non-translation result
    for (const hit of hits) {
      if (!isTranslationPage(hit)) return hit.result.url;
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

    // Build query list: original, then alternate (e.g. English trackName from iTunes)
    const queries = [`${artist || ''} ${songName}`.trim()];
    if (altSongName && altSongName.toLowerCase() !== songName.toLowerCase()) {
      queries.push(`${artist || ''} ${altSongName}`.trim());
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

          const url = pickBestHit(hits, altSongName || songName);
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
   * Fetch lyrics intro (first few lines) from a Genius lyrics page URL.
   * Uses CORS proxies to fetch the page HTML, then parses
   * div[data-lyrics-container="true"] elements for lyrics text.
   * @param {string} geniusUrl - Full Genius lyrics page URL
   * @param {number} maxLines - Max lines to return (default: 4)
   * @returns {Promise<string|null>} First few lines or null on failure
   */
  async function fetchLyricsIntro(geniusUrl, maxLines = 4) {
    if (!geniusUrl) return null;

    const proxies = [
      url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    ];

    for (const makeUrl of proxies) {
      try {
        const res = await fetch(makeUrl(geniusUrl), { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const html = await res.text();
        if (html.length < 1000) continue; // too small, likely an error page

        // Parse HTML and extract lyrics containers
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const containers = doc.querySelectorAll('[data-lyrics-container="true"]');
        if (containers.length === 0) continue;

        // Extract text, converting <br> to newlines
        let fullText = '';
        containers.forEach(el => {
          el.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
          fullText += el.textContent + '\n';
        });

        // Clean up: trim, remove empty lines, skip metadata & [Section] headers
        const metaPattern = /\bContributor|Translation|Romanization|\bLyrics\b|Embed\b/i;
        const lines = fullText
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('[') && !metaPattern.test(l));

        if (lines.length === 0) continue;

        return lines.slice(0, maxLines).join('\n');
      } catch (e) {
        // Try next proxy
      }
    }
    console.warn('Lyrics intro fetch failed: all proxies exhausted');
    return null;
  }

  return { searchAlbum, searchGeniusLyrics, fetchLyricsIntro };
})();
