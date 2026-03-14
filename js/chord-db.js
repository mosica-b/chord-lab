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
  function normalizeKey(key, instrument) {
    if (instrument === 'ukulele') {
      // Ukulele DB keys: A, Ab, B, Bb, C, D, Db, E, Eb, F, G, Gb
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
    // Guitar DB keys: C, Csharp, D, Eb, E, F, Fsharp, G, Ab, A, Bb, B
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
   * Returns -1 if no sounding strings
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
   * 1. Sort positions so ones with matching bass come first.
   * 2. If none match, create a modified voicing with the correct bass.
   * Returns new positions array (never mutates input).
   */
  function applySlashBass(positions, bassNote, tuning) {
    if (!positions || positions.length === 0) return positions;

    const bassTarget = MusicTheory.noteIndex(bassNote);
    if (bassTarget < 0) return positions;

    // Separate positions into matching and non-matching bass
    const matching = [];
    const others = [];
    for (const pos of positions) {
      if (getLowestNoteSemitone(pos, tuning) === bassTarget) {
        matching.push(pos);
      } else {
        others.push(pos);
      }
    }

    // If we found positions with the correct bass, put them first
    if (matching.length > 0) {
      return [...matching, ...others];
    }

    // No matching position found — try to create a modified voicing
    const modified = createSlashVoicing(positions[0], bassTarget, tuning);
    if (modified) {
      return [modified, ...positions];
    }

    return positions;
  }

  /**
   * Create a modified voicing with the correct bass note.
   * Tries to find a fret on the lowest available string that produces
   * the target bass note, within a playable fret range.
   */
  function createSlashVoicing(position, bassTarget, tuning) {
    const frets = [...position.frets];
    const baseFret = position.baseFret || 1;

    // Try each string from lowest to highest as potential bass string
    for (let strIdx = 0; strIdx < tuning.length; strIdx++) {
      const openSemitone = MusicTheory.noteIndex(tuning[strIdx].note);
      // Calculate the fret needed to produce the bass note
      const neededFret = ((bassTarget - openSemitone) % 12 + 12) % 12;

      // Try this fret and one octave up, within playable range (0-5)
      for (const fret of [neededFret, neededFret + 12]) {
        if (fret >= 0 && fret <= 5) {
          const newFrets = [...frets];
          // Mute any strings lower than this bass string
          for (let j = 0; j < strIdx; j++) {
            newFrets[j] = -1;
          }
          newFrets[strIdx] = fret;

          // Verify chord still has at least 3 sounding strings (including bass)
          const sounding = newFrets.filter(f => f >= 0).length;
          if (sounding >= 3) {
            return {
              frets: newFrets,
              baseFret: 1,
              barres: [],
              fingers: [],
            };
          }
        }
      }
    }
    return null;
  }

  // =========================================
  // Lookup functions
  // =========================================

  /**
   * Look up base chord positions from DB
   */
  function lookupPositions(dbData, root, suffix, instrument) {
    const dbKey = normalizeKey(root, instrument);
    const dbSuffix = normalizeSuffix(suffix);

    const keyChords = dbData.chords[dbKey];
    if (!keyChords) {
      // Try alternative key names (case-insensitive)
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
   * Get guitar chord voicings
   * Returns array of positions or null
   */
  function getGuitarChord(chordName) {
    if (!guitarData) return null;

    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    let positions = lookupPositions(guitarData, parsed.root, parsed.suffix);
    if (!positions) return null;

    // For slash chords, find/create voicing with correct bass note
    if (parsed.bassNote) {
      positions = applySlashBass(positions, parsed.bassNote, MusicTheory.GUITAR_TUNING);
    }

    return positions;
  }

  /**
   * Get ukulele chord voicings
   * Returns array of positions or null
   */
  function getUkuleleChord(chordName) {
    if (!ukuleleData) return null;

    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    let positions = lookupPositions(ukuleleData, parsed.root, parsed.suffix, 'ukulele');
    if (!positions) return null;

    // For slash chords, find/create voicing with correct bass note
    if (parsed.bassNote) {
      positions = applySlashBass(positions, parsed.bassNote, MusicTheory.UKULELE_TUNING);
    }

    return positions;
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
