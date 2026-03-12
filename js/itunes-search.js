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

  async function searchGeniusLyrics(songName, artist) {
    if (!songName) return null;
    const query = `${artist || ''} ${songName}`.trim();
    // Use access_token as query param (works with CORS proxies that don't forward headers)
    const geniusApiUrl = `https://api.genius.com/search?q=${encodeURIComponent(query)}&access_token=${GENIUS_TOKEN}`;

    // Try direct fetch first, then allorigins CORS proxy fallback
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
        if (!hits || hits.length === 0) return null;

        // Find best match
        const songLower = songName.toLowerCase();
        for (const hit of hits) {
          const s = hit.result;
          if (s.title && s.title.toLowerCase().includes(songLower)) {
            return s.url;
          }
        }
        return hits[0].result.url;
      } catch (e) {
        // Try next attempt
      }
    }
    console.warn('Genius search failed: all attempts exhausted');
    return null;
  }

  return { searchAlbum, searchGeniusLyrics };
})();
