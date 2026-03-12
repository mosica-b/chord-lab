/**
 * Chord Database Module
 * Loads guitar and ukulele chord voicing data from CDN
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
  function normalizeKey(key) {
    // DB keys: C, Csharp, D, Eb, E, F, Fsharp, G, Ab, A, Bb, B
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

  /**
   * Get guitar chord voicings
   * Returns array of positions or null
   */
  function getGuitarChord(chordName) {
    if (!guitarData) return null;

    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    // For slash chords, look up the base chord (e.g., G/B → G)
    const dbKey = normalizeKey(parsed.root);
    const dbSuffix = normalizeSuffix(parsed.suffix);

    const keyChords = guitarData.chords[dbKey];
    if (!keyChords) {
      // Try alternative key names
      for (const [k, chords] of Object.entries(guitarData.chords)) {
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
   * Get ukulele chord voicings
   * Returns array of positions or null
   */
  function getUkuleleChord(chordName) {
    if (!ukuleleData) return null;

    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    const dbKey = normalizeKey(parsed.root);
    const dbSuffix = normalizeSuffix(parsed.suffix);

    const keyChords = ukuleleData.chords[dbKey];
    if (!keyChords) {
      for (const [k, chords] of Object.entries(ukuleleData.chords)) {
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
   * Check if chord data is available
   */
  function isLoaded() {
    return loaded;
  }

  /**
   * Get all available keys in the guitar DB
   */
  function getAvailableKeys() {
    if (!guitarData) return [];
    return Object.keys(guitarData.chords);
  }

  /**
   * Get all available suffixes in the guitar DB
   */
  function getAvailableSuffixes() {
    if (!guitarData) return [];
    return guitarData.suffixes || [];
  }

  return {
    load,
    getGuitarChord,
    getUkuleleChord,
    isLoaded,
    getAvailableKeys,
    getAvailableSuffixes,
  };
})();
