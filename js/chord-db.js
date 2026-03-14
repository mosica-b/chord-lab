/**
 * Chord Database Module
 * Loads guitar and ukulele chord voicing data from CDN
 * Fetches additional voicings from jguitar.com for better accuracy
 */
const ChordDB = (() => {
  let guitarData = null;
  let ukuleleData = null;
  let loaded = false;

  const GUITAR_CDN = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0.5.1/lib/guitar.json';
  const UKULELE_CDN = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0.5.1/lib/ukulele.json';

  /**
   * Load chord databases from CDN
   */
  async function load() {
    if (loaded) return;
    try {
      const [guitarRes, ukuleleRes] = await Promise.all([
        fetch(GUITAR_CDN),
        fetch(UKULELE_CDN),
      ]);

      if (guitarRes.ok) {
        guitarData = await guitarRes.json();
      }
      if (ukuleleRes.ok) {
        ukuleleData = await ukuleleRes.json();
      }

      loaded = true;
      console.log('Chord DB loaded:', {
        guitar: guitarData ? Object.keys(guitarData.chords).length + ' keys' : 'failed',
        ukulele: ukuleleData ? Object.keys(ukuleleData.chords).length + ' keys' : 'failed',
      });
    } catch (err) {
      console.error('Failed to load chord DB:', err);
    }
  }

  /**
   * Normalize suffix for DB lookup
   * The DB uses specific suffix names that may differ from common notation
   */
  function normalizeSuffix(suffix) {
    const map = {
      '': 'major',
      'M': 'major',
      'maj': 'major',
      'major': 'major',
      'm': 'minor',
      'min': 'minor',
      'minor': 'minor',
      '-': 'minor',
      'dim': 'dim',
      'o': 'dim',
      'aug': 'aug',
      '+': 'aug',
      '7': '7',
      'dom7': '7',
      'm7': 'm7',
      'min7': 'm7',
      'maj7': 'maj7',
      'M7': 'maj7',
      'mMaj7': 'mmaj7',
      'dim7': 'dim7',
      'o7': 'dim7',
      'sus2': 'sus2',
      'sus4': 'sus4',
      'sus': 'sus4',
      '6': '6',
      'm6': 'm6',
      '9': '9',
      'm9': 'm9',
      'add9': 'add9',
      'maj9': 'maj9',
      'm7b5': 'm7b5',
      '7sus4': '7sus4',
      '7sus2': '7sus2',
      '5': '5',
      'aug7': 'aug7',
      '11': '11',
      '13': '13',
      'maj11': 'maj11',
      'maj13': 'maj13',
      'm11': 'm11',
      'm13': 'm13',
    };
    return map[suffix] || suffix;
  }

  /**
   * Normalize root key for DB lookup
   * The DB uses sharps, not flats
   */
  function normalizeKey(key, instrument) {
    if (instrument === 'ukulele') {
      const ukeKeyMap = {
        'C': 'C',
        'C#': 'Db', 'Db': 'Db',
        'D': 'D',
        'D#': 'Eb', 'Eb': 'Eb',
        'E': 'E',
        'F': 'F',
        'F#': 'Gb', 'Gb': 'Gb',
        'G': 'G',
        'G#': 'Ab', 'Ab': 'Ab',
        'A': 'A',
        'A#': 'Bb', 'Bb': 'Bb',
        'B': 'B',
      };
      return ukeKeyMap[key] || key;
    }
    const keyMap = {
      'C': 'C',
      'C#': 'Csharp', 'Db': 'Csharp',
      'D': 'D',
      'D#': 'Eb', 'Eb': 'Eb',
      'E': 'E',
      'F': 'F',
      'F#': 'Fsharp', 'Gb': 'Fsharp',
      'G': 'G',
      'G#': 'Ab', 'Ab': 'Ab',
      'A': 'A',
      'A#': 'Bb', 'Bb': 'Bb',
      'B': 'B',
    };
    return keyMap[key] || key;
  }

  // =========================================
  // Slash chord voicing helpers
  // =========================================

  /**
   * Get the lowest sounding note's semitone index from a position
   */
  function getLowestNoteSemitone(position, tuning) {
    const frets = position.frets;
    const baseFret = position.baseFret || 1;
    for (let i = 0; i < frets.length; i++) {
      if (frets[i] >= 0) {
        const actualFret = frets[i] === 0 ? 0 : frets[i] + (baseFret - 1);
        const noteInfo = MusicTheory.fretToNote(tuning, i, actualFret);
        if (noteInfo) return MusicTheory.noteIndex(noteInfo.note);
      }
    }
    return -1;
  }

  /**
   * Apply slash chord bass note to positions array.
   */
  function applySlashBass(positions, bassNote, tuning) {
    if (!positions || positions.length === 0) return positions;

    const bassTarget = MusicTheory.noteIndex(bassNote);
    if (bassTarget < 0) return positions;

    const matching = [];
    const others = [];
    for (const pos of positions) {
      if (getLowestNoteSemitone(pos, tuning) === bassTarget) {
        matching.push(pos);
      } else {
        others.push(pos);
      }
    }

    if (matching.length > 0) {
      return [...matching, ...others];
    }

    for (const pos of positions) {
      const modified = createSlashVoicing(pos, bassTarget, tuning);
      if (modified) {
        return [modified, ...positions];
      }
    }

    return positions;
  }

  function toAbsoluteFrets(frets, baseFret) {
    return frets.map(f => {
      if (f <= 0) return f;
      return f + (baseFret - 1);
    });
  }

  function toRelativeFrets(absFrets) {
    const fretted = absFrets.filter(f => f > 0);
    if (fretted.length === 0) {
      return { frets: [...absFrets], baseFret: 1 };
    }
    const minFret = Math.min(...fretted);
    const newBaseFret = minFret <= 4 ? 1 : minFret;
    const relFrets = absFrets.map(f => {
      if (f <= 0) return f;
      return f - (newBaseFret - 1);
    });
    return { frets: relFrets, baseFret: newBaseFret };
  }

  function isPlayable(absFrets, minStrings) {
    const sounding = absFrets.filter(f => f >= 0).length;
    if (sounding < minStrings) return false;
    const fretted = absFrets.filter(f => f > 0);
    if (fretted.length <= 1) return true;
    const span = Math.max(...fretted) - Math.min(...fretted);
    return span <= 4;
  }

  function createSlashVoicing(position, bassTarget, tuning) {
    const origBaseFret = position.baseFret || 1;
    const absFrets = toAbsoluteFrets(position.frets, origBaseFret);
    const numStrings = tuning.length;

    for (let strIdx = 0; strIdx < numStrings; strIdx++) {
      const openSemitone = MusicTheory.noteIndex(tuning[strIdx].note);
      const baseFret0 = ((bassTarget - openSemitone) % 12 + 12) % 12;

      for (const bassFret of [baseFret0, baseFret0 + 12]) {
        if (bassFret < 0 || bassFret > 12) continue;

        const newAbs = [...absFrets];
        for (let j = 0; j < strIdx; j++) {
          newAbs[j] = -1;
        }
        newAbs[strIdx] = bassFret;

        if (isPlayable(newAbs, 3)) {
          const rel = toRelativeFrets(newAbs);
          return {
            frets: rel.frets,
            baseFret: rel.baseFret,
            barres: [],
            fingers: [],
          };
        }
      }
    }
    return null;
  }

  // =========================================
  // JGuitar.com integration
  // =========================================

  const JGUITAR_CACHE_KEY = 'songChordLab_jguitar';
  const jguitarMemCache = new Map(); // In-memory cache for current session
  const jguitarPending = new Map(); // Track in-flight requests

  /**
   * Load jguitar cache from localStorage into memory
   */
  function loadJGuitarCache() {
    try {
      const stored = localStorage.getItem(JGUITAR_CACHE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        for (const [key, val] of Object.entries(data)) {
          jguitarMemCache.set(key, val);
        }
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Save jguitar memory cache to localStorage
   */
  function saveJGuitarCache() {
    try {
      const obj = {};
      jguitarMemCache.forEach((val, key) => { obj[key] = val; });
      localStorage.setItem(JGUITAR_CACHE_KEY, JSON.stringify(obj));
    } catch (e) { /* ignore */ }
  }

  /**
   * Parse fret string from jguitar image URL.
   * e.g. "3,3,0,2,3,2" → [3,3,0,2,3,2]
   * "x" → -1
   */
  function parseJGuitarFrets(fretStr) {
    return fretStr.split(',').map(f => {
      const s = f.trim();
      if (s === 'x' || s === 'X') return -1;
      const n = parseInt(s, 10);
      return isNaN(n) ? -1 : n;
    });
  }

  /**
   * Convert absolute fret array to our position format.
   * Detects barres automatically.
   */
  function absFretsToPosition(absFrets) {
    const rel = toRelativeFrets(absFrets);

    // Detect barres: if multiple strings share the same relative fret > 0
    const barres = [];
    const fretCounts = {};
    rel.frets.forEach(f => {
      if (f > 0) fretCounts[f] = (fretCounts[f] || 0) + 1;
    });
    for (const [fret, count] of Object.entries(fretCounts)) {
      if (count >= 2) barres.push(parseInt(fret, 10));
    }

    return {
      frets: rel.frets,
      baseFret: rel.baseFret,
      barres,
      fingers: [],
    };
  }

  /**
   * Fetch chord voicings from jguitar.com via CORS proxy.
   * Returns array of positions or null.
   */
  async function fetchJGuitar(chordName) {
    const url = `https://jguitar.com/chordsearch?chordsearch=${encodeURIComponent(chordName)}`;
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;

    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;

      const html = await res.text();

      // Extract fret positions from image URLs
      // Pattern: /images/chordshape/Name-FRETS.png (frets are URL-encoded: %2C = comma)
      const imgRegex = /images\/chordshape\/[^"]*?-([\dx%A-Fa-f,]+)\.png/gi;
      const positions = [];
      const seen = new Set();
      let match;

      while ((match = imgRegex.exec(html)) !== null) {
        // Decode URL encoding: %2C → comma
        const fretStr = decodeURIComponent(match[1]);
        if (seen.has(fretStr)) continue;
        seen.add(fretStr);

        const absFrets = parseJGuitarFrets(fretStr);
        // Validate: must have 6 values for guitar
        if (absFrets.length !== 6) continue;
        // Must have at least 3 sounding strings
        if (absFrets.filter(f => f >= 0).length < 3) continue;

        positions.push(absFretsToPosition(absFrets));
      }

      return positions.length > 0 ? positions : null;
    } catch (e) {
      console.warn('JGuitar fetch failed:', chordName, e.message);
      return null;
    }
  }

  /**
   * Get jguitar positions from cache (sync).
   * Returns positions array or undefined if not cached.
   */
  function getJGuitarCached(chordName) {
    return jguitarMemCache.get(chordName);
  }

  /**
   * Prefetch chord voicings from jguitar.com for a list of chord names.
   * Fetches only chords not already in cache. Non-blocking.
   * Calls onUpdate() after each successful fetch so UI can re-render.
   */
  async function prefetchJGuitar(chordNames, onUpdate) {
    loadJGuitarCache();

    const toFetch = chordNames.filter(name => {
      if (jguitarMemCache.has(name)) return false;
      if (jguitarPending.has(name)) return false;
      return true;
    });

    if (toFetch.length === 0) return;

    // Fetch in parallel (max 3 concurrent)
    const batchSize = 3;
    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);
      const promises = batch.map(async name => {
        jguitarPending.set(name, true);
        try {
          const positions = await fetchJGuitar(name);
          // Cache result (even null to avoid re-fetching)
          jguitarMemCache.set(name, positions || null);
          saveJGuitarCache();
          if (positions && onUpdate) onUpdate();
        } catch (e) {
          jguitarMemCache.set(name, null);
        } finally {
          jguitarPending.delete(name);
        }
      });
      await Promise.all(promises);
    }
  }

  // =========================================
  // Lookup functions
  // =========================================

  function lookupPositions(dbData, root, suffix, instrument) {
    const dbKey = normalizeKey(root, instrument);
    const dbSuffix = normalizeSuffix(suffix);

    const keyChords = dbData.chords[dbKey];
    if (!keyChords) {
      for (const [k, chords] of Object.entries(dbData.chords)) {
        if (k.toLowerCase() === dbKey.toLowerCase()) {
          const found = chords.find(c => c.suffix === dbSuffix);
          if (found) return found.positions;
        }
      }
      return null;
    }

    const chord = keyChords.find(c => c.suffix === dbSuffix);
    return chord ? chord.positions : null;
  }

  /**
   * Get guitar chord voicings.
   * Priority: jguitar.com cache → CDN DB + slash algorithm
   */
  function getGuitarChord(chordName) {
    // 1. Check jguitar cache first (best quality voicings)
    const jgPositions = getJGuitarCached(chordName);
    if (jgPositions && jgPositions.length > 0) {
      return jgPositions;
    }

    // 2. Fall back to CDN DB
    if (!guitarData) return null;

    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    let positions = lookupPositions(guitarData, parsed.root, parsed.suffix);
    if (!positions) return null;

    if (parsed.bassNote) {
      positions = applySlashBass(positions, parsed.bassNote, MusicTheory.GUITAR_TUNING);
    }

    return positions;
  }

  /**
   * Get ukulele chord voicings
   */
  function getUkuleleChord(chordName) {
    if (!ukuleleData) return null;

    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    let positions = lookupPositions(ukuleleData, parsed.root, parsed.suffix, 'ukulele');
    if (!positions) return null;

    if (parsed.bassNote) {
      positions = applySlashBass(positions, parsed.bassNote, MusicTheory.UKULELE_TUNING);
    }

    return positions;
  }

  function isLoaded() {
    return loaded;
  }

  function getAvailableKeys() {
    if (!guitarData) return [];
    return Object.keys(guitarData.chords);
  }

  function getAvailableSuffixes() {
    if (!guitarData) return [];
    return guitarData.suffixes || [];
  }

  // Init: load localStorage cache on module load
  loadJGuitarCache();

  return {
    load,
    getGuitarChord,
    getUkuleleChord,
    isLoaded,
    getAvailableKeys,
    getAvailableSuffixes,
    prefetchJGuitar,
  };
})();
