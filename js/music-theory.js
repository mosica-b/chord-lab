/**
 * Music Theory Module
 * Handles chord notes, fret-to-note conversion, capo transposition
 */
const MusicTheory = (() => {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Enharmonic mappings for display
  const ENHARMONIC = {
    'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
  };

  // Flat keys on the circle of fifths (major key root indices)
  // F(5), Bb(10), Eb(3), Ab(8), Db(1)
  const FLAT_KEY_INDICES = new Set([1, 3, 5, 8, 10]);

  /**
   * Determine if a key prefers flat notation. Explicit #/b spelling wins;
   * natural roots fall back to the circle of fifths.
   */
  function keyPrefersFlats(keyName) {
    if (!keyName) return false;
    const parsed = parseChordName(keyName);
    if (!parsed) return false;
    if (parsed.root.includes('#')) return false;
    if (parsed.root.includes('b')) return true;
    const rootIdx = noteIndex(parsed.root);
    if (rootIdx < 0) return false;
    const isMinor = (parsed.suffix || '').toLowerCase() === 'm' || (parsed.suffix || '').toLowerCase() === 'minor';
    const majorIdx = isMinor ? (rootIdx + 3) % 12 : rootIdx;
    return FLAT_KEY_INDICES.has(majorIdx);
  }

  // Letter names and their natural semitone values (for theory-correct spelling)
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Scale degree numbers for each chord type (determines which letter name each note uses)
  // e.g., degree 7 → 7th letter from root, so C7's ♭7 = B♭ (not A#)
  const CHORD_DEGREE_NUMS = {
    'major': [1,3,5], 'minor': [1,3,5], 'dim': [1,3,5], 'aug': [1,3,5],
    '7': [1,3,5,7], 'm7': [1,3,5,7], 'maj7': [1,3,5,7], 'mMaj7': [1,3,5,7], 'dim7': [1,3,5,7],
    'm7b5': [1,3,5,7], 'sus2': [1,2,5], 'sus4': [1,4,5],
    '6': [1,3,5,6], 'm6': [1,3,5,6],
    '9': [1,3,5,7,9], 'm9': [1,3,5,7,9], 'maj9': [1,3,5,7,9], 'add9': [1,3,5,9],
    '7sus4': [1,4,5,7], '11': [1,3,5,7,9,11], '13': [1,3,5,7,9,11,13],
    'm11': [1,3,5,7,9,11], 'maj11': [1,3,5,7,9,11],
    'm13': [1,3,5,7,9,11,13], 'maj13': [1,3,5,7,9,11,13],
    'dim9': [1,3,5,7,9], 'dim11': [1,3,5,7,9,11],
    'm7b59': [1,3,5,7,9], 'augMaj7': [1,3,5,7], 'dimMaj7': [1,3,5,7],
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
    'mMaj7':  [0, 3, 7, 11],
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
    '13':     [0, 4, 7, 10, 14, 17, 21],
    'm11':    [0, 3, 7, 10, 14, 17],
    'maj11':  [0, 4, 7, 11, 14, 17],
    'm13':    [0, 3, 7, 10, 14, 17, 21],
    'maj13':  [0, 4, 7, 11, 14, 17, 21],
    'dim9':   [0, 3, 6, 9, 14],
    'dim11':  [0, 3, 6, 9, 14, 17],
    'm7b59':  [0, 3, 6, 10, 14],
    'augMaj7':[0, 4, 8, 11],
    'dimMaj7':[0, 3, 6, 11],
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
    'mMaj7': 'mMaj7', 'mmaj7': 'mMaj7', 'mM7': 'mMaj7',
    'minMaj7': 'mMaj7', 'minmaj7': 'mMaj7',
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
    '11': '11', 'm11': 'm11', 'maj11': 'maj11', 'M11': 'maj11',
    '13': '13', 'm13': 'm13', 'maj13': 'maj13', 'M13': 'maj13',
    'dim9': 'dim9', 'dim11': 'dim11', 'm7b59': 'm7b59',
    '+maj7': 'augMaj7', 'augmaj7': 'augMaj7', 'dimmaj7': 'dimMaj7',
    '5': '5',
    'aug7': 'aug7', '+7': 'aug7',
  };

  // A suspended chord replaces its third while keeping the other extensions.
  const SUSPENSION_BASES = {
    major: '', minor: '', '6': '6', m6: '6', '7': '7', m7: '7',
    '9': '9', m9: '9', maj7: 'maj7', maj9: 'maj9',
    '11': '11', m11: '11', maj11: 'maj11',
    '13': '13', m13: '13', maj13: 'maj13',
  };
  for (const [base, prefix] of Object.entries(SUSPENSION_BASES)) {
    for (const degree of [2, 4]) {
      const key = prefix + 'sus' + degree;
      if (!CHORD_INTERVALS[key]) {
        const parts = CHORD_INTERVALS[base].map((interval, index) => ({
          interval: CHORD_DEGREE_NUMS[base][index] === 3 ? (degree === 2 ? 2 : 5) : interval,
          degree: CHORD_DEGREE_NUMS[base][index] === 3 ? degree : CHORD_DEGREE_NUMS[base][index],
        }));
        // A 9sus2 already contains the same pitch as its ninth.
        const unique = parts.filter((part, index) =>
          parts.findIndex(other => other.interval % 12 === part.interval % 12) === index);
        CHORD_INTERVALS[key] = unique.map(part => part.interval);
        CHORD_DEGREE_NUMS[key] = unique.map(part => part.degree);
      }
      SUFFIX_MAP[key] = key;
      if (base !== 'major' && base !== 'minor') SUFFIX_MAP[base + 'sus' + degree] = key;
      if (base === 'minor') SUFFIX_MAP['m' + 'sus' + degree] = key;
    }
  }

  /**
   * Normalize a note name to sharp notation
   */
  function normalizeNote(note) {
    if (typeof note !== 'string') return note;
    const match = /^([A-G])([#b]*)$/.exec(note);
    if (!match) return note;
    const offset = [...match[2]].reduce((sum, sign) => sum + (sign === '#' ? 1 : -1), 0);
    return NOTE_NAMES[((LETTER_TO_SEMITONE[match[1]] + offset) % 12 + 12) % 12];
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
  function normalizeChordSymbol(name) {
    if (typeof name !== 'string') return '';
    let value = name.trim()
      .replace(/♯/g, '#').replace(/♭/g, 'b')
      .replace(/¬/g, 'bb').replace(/«/g, '##')
      .replace(/\[äÆ\]/g, '(#9,b13)').replace(/\[âÅ\]/g, '(b9,#11)')
      .replace(/\[alt\]/gi, 'alt')
      .replace(/;(?=\d)/g, 'omit')
      .replace(/(^|\/)([A-G])x(?=\/|\(|[A-Za-z0-9]|$)/g, '$1$2##');
    // The Opus percent glyph is a compact 6/9, including minor 6/9.
    value = value.replace(/^([A-G](?:#{1,2}|b{1,2})?)(m?)%(?=\/|$)/,
      (_, root, minor) => root + minor + '6(add9)');
    value = value.replace(/^([A-G](?:#{1,2}|b{1,2})?m?6)\/9(?=\/|$)/, '$1(add9)');
    // Older PDF-only builds sometimes appended a second bass to the first.
    const parts = value.split('/');
    if (parts.length > 2 && parts.slice(1).every(part => /^[A-G](?:#{1,2}|b{1,2})?$/.test(part))) {
      value = parts[0] + '/' + parts[parts.length - 1];
    }
    return value;
  }

  function parseChordName(name) {
    name = normalizeChordSymbol(name);
    if (!name) return null;

    // Handle slash chords: G/B, B7(#9)/D# → base chord with bass note
    let bassNote = null;
    let chordPart = name;
    const slashMatch = name.match(/^(.+?)\/([A-G](?:#{1,2}|b{1,2})?)$/);
    if (slashMatch) {
      chordPart = slashMatch[1];
      bassNote = slashMatch[2];
    }

    // Extract degree modifications in parentheses: B7(#9) → base "B7", degreeMods "(#9)"
    let degreeMods = '';
    const parenIdx = chordPart.indexOf('(');
    if (parenIdx > 0) {
      degreeMods = chordPart.substring(parenIdx);
      chordPart = chordPart.substring(0, parenIdx);
    }

    const rootMatch = /^([A-G](?:#{1,2}|b{1,2})?)(.*)$/.exec(chordPart);
    if (!rootMatch) return null;
    const root = rootMatch[1];
    let suffix = rootMatch[2];

    // A parenthesized suspension changes the chord type, unlike an added
    // degree: D7(sus4) is D7sus4, not D7 with an extra fourth.
    degreeMods = degreeMods.replace(/\(([^()]*)\)/g, (group, contents) => {
      let parts = contents.split(',').map(part => part.trim());
      // Scores can write the suspension and alteration together, e.g. b9sus4.
      parts = parts.flatMap(part => {
        const match = /^(.*?)(sus[24])$/i.exec(part);
        return match && match[1] ? [match[1], match[2]] : [part];
      });
      const majorSeventh = parts.findIndex(part => /^maj7(?:[#b]5)?$/i.test(part));
      const baseKey = SUFFIX_MAP[suffix] || SUFFIX_MAP[suffix.toLowerCase()];
      if (majorSeventh >= 0 && baseKey === 'minor') {
        const remainder = parts[majorSeventh].slice(4);
        suffix = 'mMaj7';
        parts.splice(majorSeventh, 1, ...(remainder ? [remainder] : []));
      }
      const suspension = parts.findIndex(part => /^sus[24]$/i.test(part));
      if (suspension >= 0) {
        const key = SUFFIX_MAP[suffix] || SUFFIX_MAP[suffix.toLowerCase()];
        const prefix = SUSPENSION_BASES[key];
        if (prefix !== undefined) {
          suffix = prefix + parts[suspension].toLowerCase();
          parts.splice(suspension, 1);
        }
      }
      return parts.length ? `(${parts.join(',')})` : '';
    });

    return { root, suffix: suffix || 'major', bassNote: bassNote || null, degreeMods };
  }

  /** Resolve intervals and degrees once for display, playback and piano. */
  function getChordComponents(chordName) {
    const parsed = parseChordName(chordName);
    if (!parsed) return null;
    const rootIdx = noteIndex(parsed.root);
    const intervalKey = SUFFIX_MAP[parsed.suffix] || SUFFIX_MAP[parsed.suffix.toLowerCase()];
    const intervals = CHORD_INTERVALS[intervalKey];
    const degrees = CHORD_DEGREE_NUMS[intervalKey];
    if (rootIdx < 0 || !intervals || !degrees || intervals.length !== degrees.length) return null;
    const mods = parseDegreeModsToSemitones(parsed.degreeMods);
    if (mods === null) return null; // Never silently ignore an unknown modifier.

    let components = intervals.map((interval, index) => ({ interval, degree: degrees[index] }));
    for (const mod of mods) {
      const degree = Number(mod.degree);
      if (mod.omit) {
        components = components.filter(component => component.degree !== degree);
        continue;
      }
      const natural = DEGREE_SEMITONES[mod.degree];
      const existing = mod.alter ? components.findIndex(component =>
        component.degree === degree && component.interval === natural) : -1;
      if (existing >= 0) {
        components[existing] = { interval: mod.semitone, degree };
      } else if (!components.some(component => ((component.interval - mod.semitone) % 12 + 12) % 12 === 0)) {
        components.push({ interval: mod.semitone, degree });
      }
    }
    return { parsed, rootIdx, components };
  }

  /** Notes for playback, with the requested bass first. */
  function getChordNotes(chordName) {
    const chord = getChordComponents(chordName);
    if (!chord) return [];
    let notes = chord.components.map(component => NOTE_NAMES[(chord.rootIdx + component.interval) % 12]);
    if (chord.parsed.bassNote) {
      const bass = normalizeNote(chord.parsed.bassNote);
      const index = notes.indexOf(bass);
      if (index > 0) notes = [...notes.slice(index), ...notes.slice(0, index)];
      else if (index < 0) notes = [bass, ...notes];
    }
    return notes;
  }

  /** Notes with extension octave offsets for the piano keyboard. */
  function getChordNotesWithOctave(chordName) {
    const chord = getChordComponents(chordName);
    if (!chord) return [];
    const noteFor = component => NOTE_NAMES[(chord.rootIdx + component.interval) % 12];
    const bass = chord.parsed.bassNote && normalizeNote(chord.parsed.bassNote);
    if (!bass) return chord.components.map(component => ({
      note: noteFor(component), octaveOffset: Math.floor(component.interval / 12),
    }));

    const index = chord.components.findIndex(component => noteFor(component) === bass);
    if (index < 0) {
      const rootOffset = (chord.rootIdx - noteIndex(bass) + 12) % 12;
      return [{ note: bass, octaveOffset: 0 }, ...chord.components.map(component => ({
        note: noteFor(component), octaveOffset: Math.floor((rootOffset + component.interval) / 12),
      }))];
    }

    // Rotate an inversion while measuring extensions from the new lowest note.
    const rotated = [...chord.components.slice(index), ...chord.components.slice(0, index)];
    const bassInterval = rotated[0].interval;
    let previous = bassInterval;
    return rotated.map((component, i) => {
      let interval = component.interval;
      while (i && interval <= previous) interval += 12;
      previous = interval;
      return { note: noteFor(component), octaveOffset: Math.floor((interval - bassInterval) / 12) };
    });
  }

  // Voicings may omit a root or fifth, but must retain the chord's defining
  // third/suspension, seventh, highest extension and explicit alterations.
  function getChordEssentialNotes(chordName) {
    const chord = getChordComponents(chordName);
    if (!chord) return [];
    const mods = parseDegreeModsToSemitones(chord.parsed.degreeMods);
    const alteredDegrees = new Set(mods.filter(mod => !mod.omit).map(mod => Number(mod.degree)));
    const extension = Math.max(0, ...chord.components.map(component => component.degree >= 9 ? component.degree : 0));
    const suspended = /sus[24]$/i.test(chord.parsed.suffix);
    return [...new Set(chord.components.filter(component => {
      const natural = DEGREE_SEMITONES[String(component.degree)];
      return component.degree === 3 || component.degree === 7 || component.degree === extension ||
        (component.degree === 6 && /^(?:m?6|6sus)/i.test(chord.parsed.suffix)) ||
        (suspended && (component.degree === 2 || component.degree === 4)) ||
        (component.degree === 5 && natural !== undefined && component.interval !== natural) ||
        alteredDegrees.has(component.degree);
    }).map(component => NOTE_NAMES[(chord.rootIdx + component.interval) % 12]))];
  }

  // Semitone → degree label mapping
  const SEMITONE_TO_DEGREE = {
    0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
    6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7',
    13: '♭9', 14: '9', 15: '♯9', 17: '11', 18: '♯11', 20: '♭13', 21: '13',
  };

  // Degree number → base semitones from root (natural interval)
  const DEGREE_SEMITONES = {
    '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11,
    '9': 14, '11': 17, '13': 21,
  };

  /**
   * Parse degree modifications string like "(#9)" or "(#9,b13)" or "(add9)"
   * Returns array of { alter, degree, semitone }
   */
  function parseDegreeModsToSemitones(degreeMods) {
    if (!degreeMods) return [];
    const groups = [...degreeMods.matchAll(/\(([^()]*)\)/g)];
    if (!groups.length || groups.map(group => group[0]).join('') !== degreeMods) return null;
    const result = [];
    for (const group of groups) {
      for (const raw of group[1].split(',')) {
        const part = raw.trim();
        const omit = /^(?:omit|no)(2|3|4|5|6|7|9|11|13)$/i.exec(part);
        if (omit) { result.push({ omit: true, degree: omit[1] }); continue; }
        const match = /^(?:add)?(#|b)?(2|3|4|5|6|7|9|11|13)$/i.exec(part);
        if (!match) return null;
        const alter = match[1] || '';
        const degree = match[2];
        const semitone = DEGREE_SEMITONES[degree] + (alter === '#' ? 1 : alter === 'b' ? -1 : 0);
        result.push({ alter, degree, semitone });
      }
    }
    return result;
  }

  /**
   * Get degree labels for a chord's intervals
   * e.g., "Am7" → ["1", "♭3", "5", "♭7"]
   */
  function getChordDegreeLabels(chordName) {
    const chord = getChordComponents(chordName);
    if (!chord) return [];
    return chord.components.map(({ interval, degree }) => {
      const natural = degree === 1 ? 0 : DEGREE_SEMITONES[String(degree)];
      const delta = interval - natural;
      const accidental = delta < 0 ? '♭'.repeat(-delta) : '♯'.repeat(delta);
      return accidental + degree;
    });
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
    else if (diff === 3) accidental = '###';
    else if (diff === 9) accidental = 'bbb';

    return targetLetter + accidental;
  }

  /**
   * Get display-friendly chord notes with theory-correct spelling.
   * Uses proper enharmonic names based on interval stacking (thirds).
   * e.g., C7 → ["C", "E", "G", "Bb"]  (not A#)
   *        F7 → ["F", "A", "C", "Eb"]  (not D#)
   */
  function getChordNotesDisplay(chordName) {
    const chord = getChordComponents(chordName);
    if (!chord) return [];
    let notes = chord.components.map(component =>
      spellChordNote(chord.parsed.root[0], chord.rootIdx, component.interval, component.degree));
    if (chord.parsed.bassNote) {
      const bass = chord.parsed.bassNote;
      const bassNorm = normalizeNote(bass);
      const index = notes.findIndex(note => normalizeNote(note) === bassNorm);
      if (index >= 0) {
        notes[index] = bass; // Preserve the explicitly written enharmonic bass.
        if (index > 0) notes = [...notes.slice(index), ...notes.slice(0, index)];
      } else notes = [bass, ...notes];
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
  function transposeChord(chordName, semitones, useFlats) {
    chordName = normalizeChordSymbol(chordName);
    const parsed = parseChordName(chordName);
    if (!parsed) return chordName;

    const rootIdx = noteIndex(parsed.root);
    if (rootIdx < 0) return chordName;

    const newIdx = ((rootIdx + semitones) % 12 + 12) % 12;
    let newRoot;

    if (useFlats !== undefined) {
      // Explicit sharp/flat preference from key context
      newRoot = useFlats ? FLAT_NOTE_NAMES[newIdx] : NOTE_NAMES[newIdx];
    } else {
      // Auto-detect: prefer flat unless original used sharps
      newRoot = NOTE_NAMES[newIdx];
      if (ENHARMONIC[newRoot] && !parsed.root.includes('#')) {
        newRoot = ENHARMONIC[newRoot];
      }
    }

    // Keep the original written suffix, including parentheses, when changing
    // the root. parseChordName may canonicalize it for interval lookup.
    const suffixEnd = parsed.bassNote ? chordName.lastIndexOf('/') : chordName.length;
    let result = newRoot + chordName.slice(parsed.root.length, suffixEnd);

    // Transpose bass note for slash chords
    if (parsed.bassNote) {
      const bassIdx = noteIndex(parsed.bassNote);
      if (bassIdx >= 0) {
        const newBassIdx = ((bassIdx + semitones) % 12 + 12) % 12;
        let newBass;
        if (useFlats !== undefined) {
          newBass = useFlats ? FLAT_NOTE_NAMES[newBassIdx] : NOTE_NAMES[newBassIdx];
        } else {
          newBass = NOTE_NAMES[newBassIdx];
          if (ENHARMONIC[newBass] && !parsed.bassNote.includes('#')) {
            newBass = ENHARMONIC[newBass];
          }
        }
        result += '/' + newBass;
      }
    }

    return result;
  }

  /**
   * Generate capo transposition table
   * chords: array of fingered chord-shape names
   * useFlats: optional explicit spelling preference for the score key
   * Returns: array of { capo, chords: [] } sounding at capo positions 0-12
   */
  function generateCapoTable(chords, useFlats) {
    // Derive playing key reference from first chord's root
    // (metadata.key may be sounding key, which would give wrong results if re-transposed)
    const firstParsed = chords.length > 0 ? parseChordName(chords[0]) : null;
    const refRootIdx = firstParsed ? noteIndex(firstParsed.root) : -1;
    const refIsMinor = firstParsed && (firstParsed.suffix === 'm' || firstParsed.suffix === 'minor');

    const table = [];
    for (let capo = 0; capo <= 12; capo++) {
      let capoUseFlats = useFlats;
      if (capoUseFlats === undefined && refRootIdx >= 0) {
        const transposedIdx = (refRootIdx + capo) % 12;
        const majorIdx = refIsMinor ? (transposedIdx + 3) % 12 : transposedIdx;
        capoUseFlats = FLAT_KEY_INDICES.has(majorIdx);
      }
      table.push({
        capo,
        chords: chords.map(chord => transposeChord(chord, capo, capoUseFlats))
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

  /**
   * Format a note name for display (## → 𝄪, bb → 𝄫)
   */
  function formatNoteDisplay(note) {
    return note.replace('###', '×#').replace('bbb', '𝄫♭').replace('##', '×').replace('bb', '𝄫');
  }

  return {
    NOTE_NAMES,
    ENHARMONIC,
    GUITAR_TUNING,
    UKULELE_TUNING,
    CHORD_INTERVALS,
    SUFFIX_MAP,
    normalizeNote,
    normalizeChordSymbol,
    noteIndex,
    parseChordName,
    getChordNotes,
    getChordNotesWithOctave,
    getChordNotesDisplay,
    getChordEssentialNotes,
    getChordDegreeLabels,
    formatNoteDisplay,
    fretToNote,
    fretsToVexFlowKeys,
    transposeChord,
    keyPrefersFlats,
    generateCapoTable,
    getAvailableSuffixes,
    getCommonChords,
    getAllChordNames,
  };
})();
