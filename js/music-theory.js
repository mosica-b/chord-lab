/**
 * Music Theory Module
 * Handles chord notes, fret-to-note conversion, capo transposition
 */
const MusicTheory = (() => {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // Enharmonic mappings for display
  const ENHARMONIC = {
    'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
  };

  // Letter names and their natural semitone values (for theory-correct spelling)
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Scale degree numbers for each chord type (determines which letter name each note uses)
  // e.g., degree 7 → 7th letter from root, so C7's ♭7 = B♭ (not A#)
  const CHORD_DEGREE_NUMS = {
    'major': [1,3,5], 'minor': [1,3,5], 'dim': [1,3,5], 'aug': [1,3,5],
    '7': [1,3,5,7], 'm7': [1,3,5,7], 'maj7': [1,3,5,7], 'dim7': [1,3,5,7],
    'm7b5': [1,3,5,7], 'sus2': [1,2,5], 'sus4': [1,4,5],
    '6': [1,3,5,6], 'm6': [1,3,5,6],
    '9': [1,3,5,7,9], 'm9': [1,3,5,7,9], 'maj9': [1,3,5,7,9], 'add9': [1,3,5,9],
    '7sus4': [1,4,5,7], '11': [1,3,5,7,9,11], '13': [1,3,5,7,9,13],
    '5': [1,5], 'aug7': [1,3,5,7],
  };

  // Standard tunings
  const GUITAR_TUNING = [
    { note: 'E', octave: 2 },  // 6th string (low)
    { note: 'A', octave: 2 },
    { note: 'D', octave: 3 },
    { note: 'G', octave: 3 },
    { note: 'B', octave: 3 },
    { note: 'E', octave: 4 },  // 1st string (high)
  ];

  const UKULELE_TUNING = [
    { note: 'G', octave: 4 },  // 4th string
    { note: 'C', octave: 4 },
    { note: 'E', octave: 4 },
    { note: 'A', octave: 4 },  // 1st string
  ];

  // Chord type intervals (semitones from root)
  const CHORD_INTERVALS = {
    'major':  [0, 4, 7],
    'minor':  [0, 3, 7],
    'dim':    [0, 3, 6],
    'aug':    [0, 4, 8],
    '7':      [0, 4, 7, 10],
    'm7':     [0, 3, 7, 10],
    'maj7':   [0, 4, 7, 11],
    'dim7':   [0, 3, 6, 9],
    'm7b5':   [0, 3, 6, 10],
    'sus2':   [0, 2, 7],
    'sus4':   [0, 5, 7],
    '6':      [0, 4, 7, 9],
    'm6':     [0, 3, 7, 9],
    '9':      [0, 4, 7, 10, 14],
    'm9':     [0, 3, 7, 10, 14],
    'maj9':   [0, 4, 7, 11, 14],
    'add9':   [0, 4, 7, 14],
    '7sus4':  [0, 5, 7, 10],
    '11':     [0, 4, 7, 10, 14, 17],
    '13':     [0, 4, 7, 10, 14, 21],
    '5':      [0, 7],
    'aug7':   [0, 4, 8, 10],
  };

  // Suffix mapping: display name -> interval key
  const SUFFIX_MAP = {
    '': 'major', 'major': 'major', 'maj': 'major', 'M': 'major',
    'm': 'minor', 'minor': 'minor', 'min': 'minor',
    'dim': 'dim', 'o': 'dim',
    'aug': 'aug', '+': 'aug',
    '7': '7', 'dom7': '7',
    'm7': 'm7', 'min7': 'm7', '-7': 'm7',
    'maj7': 'maj7', 'M7': 'maj7',
    'dim7': 'dim7', 'o7': 'dim7',
    'm7b5': 'm7b5',
    'sus2': 'sus2',
    'sus4': 'sus4', 'sus': 'sus4',
    '6': '6', 'maj6': '6',
    'm6': 'm6', 'min6': 'm6',
    '9': '9',
    'm9': 'm9',
    'maj9': 'maj9', 'M9': 'maj9',
    'add9': 'add9',
    '7sus4': '7sus4',
    '11': '11',
    '13': '13',
    '5': '5',
    'aug7': 'aug7', '+7': 'aug7',
  };

  /**
   * Normalize a note name to sharp notation
   */
  function normalizeNote(note) {
    if (ENHARMONIC[note] && !NOTE_NAMES.includes(note)) {
      return ENHARMONIC[note];
    }
    // Handle flats
    if (note.length === 2 && note[1] === 'b') {
      const idx = NOTE_NAMES.indexOf(note[0]);
      if (idx >= 0) {
        return NOTE_NAMES[(idx - 1 + 12) % 12];
      }
    }
    return note;
  }

  /**
   * Get note index (0-11) for a note name
   */
  function noteIndex(note) {
    const normalized = normalizeNote(note);
    return NOTE_NAMES.indexOf(normalized);
  }

  /**
   * Parse chord name into root and suffix
   * e.g., "Am7" -> { root: "A", suffix: "m7" }
   *        "C#maj7" -> { root: "C#", suffix: "maj7" }
   *        "Bbm" -> { root: "Bb", suffix: "m" }
   */
  function parseChordName(name) {
    if (!name) return null;

    // Handle slash chords: G/B → base chord G with bass note B
    let bassNote = null;
    let chordPart = name;
    const slashIdx = name.indexOf('/');
    if (slashIdx > 0) {
      chordPart = name.substring(0, slashIdx);
      bassNote = name.substring(slashIdx + 1);
    }

    let root, suffix;
    if (chordPart.length >= 2 && (chordPart[1] === '#' || chordPart[1] === 'b')) {
      root = chordPart.substring(0, 2);
      suffix = chordPart.substring(2);
    } else {
      root = chordPart[0];
      suffix = chordPart.substring(1);
    }

    return { root, suffix: suffix || 'major', bassNote: bassNote || null };
  }

  /**
   * Get the notes that make up a chord
   * Returns array of note names (e.g., ["A", "C", "E"] for Am)
   */
  function getChordNotes(chordName) {
    const parsed = parseChordName(chordName);
    if (!parsed) return [];

    const rootIdx = noteIndex(parsed.root);
    if (rootIdx < 0) return [];

    const intervalKey = SUFFIX_MAP[parsed.suffix] || SUFFIX_MAP[parsed.suffix.toLowerCase()];
    const intervals = CHORD_INTERVALS[intervalKey];
    if (!intervals) return [];

    let notes = intervals.map(interval => NOTE_NAMES[(rootIdx + interval) % 12]);

    // Handle slash chord: put bass note first (inversion)
    if (parsed.bassNote) {
      const bass = normalizeNote(parsed.bassNote);
      const bassIdx = notes.indexOf(bass);
      if (bassIdx > 0) {
        // Rotate so bass note comes first
        notes = [...notes.slice(bassIdx), ...notes.slice(0, bassIdx)];
      } else if (bassIdx < 0) {
        // Bass note not in chord, prepend it
        notes = [bass, ...notes];
      }
    }

    return notes;
  }

  // Semitone → degree label mapping
  const SEMITONE_TO_DEGREE = {
    0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
    6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7',
    14: '9', 17: '11', 21: '13',
  };

  /**
   * Get degree labels for a chord's intervals
   * e.g., "Am7" → ["1", "♭3", "5", "♭7"]
   */
  function getChordDegreeLabels(chordName) {
    const parsed = parseChordName(chordName);
    if (!parsed) return [];
    const intervalKey = SUFFIX_MAP[parsed.suffix] || SUFFIX_MAP[parsed.suffix.toLowerCase()];
    const intervals = CHORD_INTERVALS[intervalKey];
    if (!intervals) return [];
    return intervals.map(i => SEMITONE_TO_DEGREE[i] || String(i));
  }

  /**
   * Spell a single chord note correctly based on music theory (tertian stacking).
   * Each interval degree uses the correct letter name from the root.
   * e.g., C7's ♭7 → B♭ (not A#), because the 7th letter from C is B.
   */
  function spellChordNote(rootLetter, rootSemitone, intervalSemitone, degreeNum) {
    const rootLetterIdx = LETTERS.indexOf(rootLetter);
    const letterOffset = (degreeNum - 1) % 7;
    const targetLetter = LETTERS[(rootLetterIdx + letterOffset) % 7];
    const targetSemitone = (rootSemitone + intervalSemitone) % 12;
    const naturalSemitone = LETTER_TO_SEMITONE[targetLetter];
    const diff = (targetSemitone - naturalSemitone + 12) % 12;

    let accidental = '';
    if (diff === 1) accidental = '#';
    else if (diff === 11) accidental = 'b';
    else if (diff === 2) accidental = '##';
    else if (diff === 10) accidental = 'bb';

    return targetLetter + accidental;
  }

  /**
   * Get display-friendly chord notes with theory-correct spelling.
   * Uses proper enharmonic names based on interval stacking (thirds).
   * e.g., C7 → ["C", "E", "G", "Bb"]  (not A#)
   *        F7 → ["F", "A", "C", "Eb"]  (not D#)
   */
  function getChordNotesDisplay(chordName) {
    const parsed = parseChordName(chordName);
    if (!parsed) return [];

    const rootIdx = noteIndex(parsed.root);
    if (rootIdx < 0) return [];

    const intervalKey = SUFFIX_MAP[parsed.suffix] || SUFFIX_MAP[parsed.suffix.toLowerCase()];
    const intervals = CHORD_INTERVALS[intervalKey];
    const degreeNums = CHORD_DEGREE_NUMS[intervalKey];
    if (!intervals) return [];

    // Fallback if degree nums not defined for this chord type
    if (!degreeNums) {
      const notes = intervals.map(i => NOTE_NAMES[(rootIdx + i) % 12]);
      if (parsed.root.includes('b')) return notes.map(n => ENHARMONIC[n] || n);
      return notes;
    }

    const rootLetter = parsed.root[0];
    let notes = intervals.map((interval, i) =>
      spellChordNote(rootLetter, rootIdx, interval, degreeNums[i])
    );

    // Handle slash chord: put bass note first (inversion)
    if (parsed.bassNote) {
      const bassNorm = normalizeNote(parsed.bassNote);
      const bassIdx = notes.findIndex(n => normalizeNote(n) === bassNorm);
      if (bassIdx > 0) {
        notes = [...notes.slice(bassIdx), ...notes.slice(0, bassIdx)];
      } else if (bassIdx < 0) {
        notes = [parsed.bassNote, ...notes];
      }
    }

    return notes;
  }

  /**
   * Convert fret position to note name with octave (for VexFlow)
   * tuning: array of {note, octave}
   * stringIndex: 0-based (0 = lowest string)
   * fret: fret number
   */
  function fretToNote(tuning, stringIndex, fret) {
    if (fret < 0) return null; // muted string
    const base = tuning[stringIndex];
    const baseIdx = noteIndex(base.note);
    const totalSemitones = baseIdx + fret;
    const noteIdx = ((totalSemitones % 12) + 12) % 12;
    const octave = base.octave + Math.floor(totalSemitones / 12);
    return { note: NOTE_NAMES[noteIdx], octave };
  }

  /**
   * Convert fret positions to VexFlow note keys
   * frets: array of fret numbers (-1 = muted, 0 = open)
   * tuning: GUITAR_TUNING or UKULELE_TUNING
   */
  function fretsToVexFlowKeys(frets, tuning, baseFret) {
    const notes = [];
    const base = baseFret || 1;
    for (let i = 0; i < frets.length; i++) {
      if (frets[i] < 0) continue; // skip muted
      const actualFret = frets[i] === 0 ? 0 : frets[i] + (base - 1);
      const noteInfo = fretToNote(tuning, i, actualFret);
      if (noteInfo) {
        notes.push(`${noteInfo.note}/${noteInfo.octave}`);
      }
    }
    return notes;
  }

  /**
   * Transpose a chord name by a number of semitones
   */
  function transposeChord(chordName, semitones) {
    const parsed = parseChordName(chordName);
    if (!parsed) return chordName;

    const rootIdx = noteIndex(parsed.root);
    if (rootIdx < 0) return chordName;

    const newIdx = ((rootIdx + semitones) % 12 + 12) % 12;
    let newRoot = NOTE_NAMES[newIdx];

    // Keep flat notation if original used flats
    if (parsed.root.includes('b') && ENHARMONIC[newRoot]) {
      newRoot = ENHARMONIC[newRoot];
    }

    const suffix = parsed.suffix === 'major' ? '' : parsed.suffix;
    return newRoot + suffix;
  }

  /**
   * Generate capo transposition table
   * chords: array of chord names
   * Returns: array of { capo, chords: [] } for capo positions 0-12
   */
  function generateCapoTable(chords) {
    const table = [];
    for (let capo = 0; capo <= 12; capo++) {
      table.push({
        capo,
        chords: chords.map(chord => transposeChord(chord, -capo))
      });
    }
    return table;
  }

  /**
   * Get all available chord suffixes for the chord selector
   */
  function getAvailableSuffixes() {
    return Object.keys(CHORD_INTERVALS);
  }

  /**
   * Get common chord names for quick selection
   */
  function getCommonChords() {
    return ['C', 'D', 'E', 'F', 'G', 'A', 'B',
            'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm',
            'C7', 'D7', 'E7', 'F7', 'G7', 'A7', 'B7'];
  }

  /**
   * Generate all possible chord names for search/autocomplete
   */
  function getAllChordNames() {
    const chords = [];
    const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
                   'Db', 'Eb', 'Gb', 'Ab', 'Bb'];
    const suffixes = ['', 'm', '7', 'm7', 'maj7', 'dim', 'aug', 'sus2', 'sus4',
                      '6', 'm6', '9', 'm9', 'add9', 'dim7', 'm7b5', '7sus4', '5', 'maj9', 'aug7'];

    for (const root of roots) {
      for (const suffix of suffixes) {
        chords.push(root + suffix);
      }
    }
    return chords;
  }

  return {
    NOTE_NAMES,
    ENHARMONIC,
    GUITAR_TUNING,
    UKULELE_TUNING,
    CHORD_INTERVALS,
    SUFFIX_MAP,
    normalizeNote,
    noteIndex,
    parseChordName,
    getChordNotes,
    getChordNotesDisplay,
    getChordDegreeLabels,
    fretToNote,
    fretsToVexFlowKeys,
    transposeChord,
    generateCapoTable,
    getAvailableSuffixes,
    getCommonChords,
    getAllChordNames,
  };
})();
