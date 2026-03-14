/**
 * Chord Database Module
 * Loads guitar chord voicings from static jguitar data + CDN fallback
 * Loads ukulele chord voicings from CDN
 */
const ChordDB = (() => {
  let guitarData = null;    // CDN fallback DB
  let ukuleleData = null;   // CDN ukulele DB
  let jguitarData = null;   // Static jguitar voicings (guitar only)
  let loaded = false;

  const GUITAR_CDN = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0.5.1/lib/guitar.json';
  const UKULELE_CDN = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0.5.1/lib/ukulele.json';
  const JGUITAR_JSON = 'data/jguitar-chords.min.json';

  /**
   * Load chord databases
   */
  async function load() {
    if (loaded) return;
    try {
      const [guitarRes, ukuleleRes, jguitarRes] = await Promise.all([
        fetch(GUITAR_CDN),
        fetch(UKULELE_CDN),
        fetch(JGUITAR_JSON).catch(() => null),
      ]);

      if (guitarRes.ok) {
        guitarData = await guitarRes.json();
      }
      if (ukuleleRes.ok) {
        ukuleleData = await ukuleleRes.json();
      }
      if (jguitarRes && jguitarRes.ok) {
        jguitarData = await jguitarRes.json();
      }

      loaded = true;
      console.log('Chord DB loaded:', {
        guitar: guitarData ? Object.keys(guitarData.chords).length + ' keys' : 'failed',
        ukulele: ukuleleData ? Object.keys(ukuleleData.chords).length + ' keys' : 'failed',
        jguitar: jguitarData ? Object.keys(jguitarData).length + ' chords' : 'failed',
      });
    } catch (err) {
      console.error('Failed to load chord DB:', err);
    }
  }

  /**
   * Normalize suffix for CDN DB lookup
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
   * Normalize root key for CDN DB lookup
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
  // jguitar static data lookup
  // =========================================

  /**
   * Normalize chord name for jguitar lookup.
   * jguitar data uses: C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B as roots
   */
  function normalizeJGuitarKey(root) {
    const map = {
      'C': 'C',
      'C#': 'C#', 'Db': 'C#',
      'D': 'D',
      'D#': 'Eb', 'Eb': 'Eb',
      'E': 'E',
      'F': 'F',
      'F#': 'F#', 'Gb': 'F#',
      'G': 'G',
      'G#': 'Ab', 'Ab': 'Ab',
      'A': 'A',
      'A#': 'Bb', 'Bb': 'Bb',
      'B': 'B',
    };
    return map[root] || root;
  }

  /**
   * Normalize suffix for jguitar lookup.
   * Maps common aliases to jguitar data keys.
   */
  function normalizeJGuitarSuffix(suffix) {
    const map = {
      '': '',
      'M': '',
      'maj': '',
      'major': '',
      'min': 'm',
      'minor': 'm',
      '-': 'm',
      'o': 'dim',
      '+': 'aug',
      'dom7': '7',
      'min7': 'm7',
      'M7': 'maj7',
      'mMaj7': 'mmaj7',
      'o7': 'dim7',
      'sus': 'sus4',
    };
    return map[suffix] !== undefined ? map[suffix] : suffix;
  }

  /**
   * Look up jguitar static data for a chord name.
   */
  function lookupJGuitar(chordName) {
    if (!jguitarData) return null;

    // Direct lookup first
    if (jguitarData[chordName]) {
      return jguitarData[chordName];
    }

    // Parse and normalize
    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    const normalRoot = normalizeJGuitarKey(parsed.root);
    const normalSuffix = normalizeJGuitarSuffix(parsed.suffix);
    const normalName = normalRoot + normalSuffix;

    if (jguitarData[normalName]) {
      return jguitarData[normalName];
    }

    return null;
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
    const maxFret = Math.max(...fretted);
    const newBaseFret = maxFret <= 4 ? 1 : minFret;
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
   * Priority: jguitar static data → CDN DB fallback
   * Slash chords: jguitar base chord + slash algorithm
   */
  function getGuitarChord(chordName) {
    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    // 1. Try jguitar static data (best quality voicings)
    // For slash chords, look up the base chord from jguitar
    const baseChordName = parsed.root + parsed.suffix;
    const jgPositions = lookupJGuitar(baseChordName);

    if (jgPositions && jgPositions.length > 0) {
      let positions = [...jgPositions];
      if (parsed.bassNote) {
        positions = applySlashBass(positions, parsed.bassNote, MusicTheory.GUITAR_TUNING);
      }
      return positions;
    }

    // 2. Fall back to CDN DB
    if (!guitarData) return null;

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

  return {
    load,
    getGuitarChord,
    getUkuleleChord,
    isLoaded,
    getAvailableKeys,
    getAvailableSuffixes,
  };
})();
