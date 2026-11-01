/**
 * Chord Database Module
 * Loads guitar/ukulele chord voicings from static jguitar data + CDN fallback
 */
const ChordDB = (() => {
  let guitarData = null;          // CDN fallback DB (guitar)
  let ukuleleData = null;         // CDN fallback DB (ukulele)
  let jguitarData = null;         // Static jguitar voicings (guitar)
  let jguitarUkuleleData = null;  // Static jguitar voicings (ukulele)
  let loaded = false;

  const GUITAR_CDN = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0.5.1/lib/guitar.json';
  const UKULELE_CDN = 'https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0.5.1/lib/ukulele.json';
  const JGUITAR_JSON = 'data/jguitar-chords.min.json';
  const JGUITAR_UKULELE_JSON = 'data/jguitar-ukulele-chords.min.json';

  /**
   * Load chord databases
   */
  async function load() {
    if (loaded) return;
    try {
      const [guitarRes, ukuleleRes, jguitarRes, jguitarUkeRes] = await Promise.all([
        fetch(GUITAR_CDN),
        fetch(UKULELE_CDN),
        fetch(JGUITAR_JSON).catch(() => null),
        fetch(JGUITAR_UKULELE_JSON).catch(() => null),
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
      if (jguitarUkeRes && jguitarUkeRes.ok) {
        jguitarUkuleleData = await jguitarUkeRes.json();
      }

      loaded = true;
      console.log('Chord DB loaded:', {
        guitar: guitarData ? Object.keys(guitarData.chords).length + ' keys' : 'failed',
        ukulele: ukuleleData ? Object.keys(ukuleleData.chords).length + ' keys' : 'failed',
        jguitar: jguitarData ? Object.keys(jguitarData).length + ' chords' : 'failed',
        jguitarUke: jguitarUkuleleData ? Object.keys(jguitarUkuleleData).length + ' chords' : 'failed',
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
      'mmaj7': 'mmaj7',
      'mM7': 'mmaj7',
      'minMaj7': 'mmaj7',
      'minmaj7': 'mmaj7',
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
      return ukeKeyMap[key] || ukeKeyMap[MusicTheory.normalizeNote(key)] || key;
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
    return keyMap[key] || keyMap[MusicTheory.normalizeNote(key)] || key;
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
    return map[root] || map[MusicTheory.normalizeNote(root)] || root;
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
      'mmaj7': 'mmaj7',
      'mM7': 'mmaj7',
      'minMaj7': 'mmaj7',
      'minmaj7': 'mmaj7',
      'o7': 'dim7',
      'sus': 'sus4',
    };
    return map[suffix] !== undefined ? map[suffix] : suffix;
  }

  /**
   * Build jguitar lookup key from parsed chord parts.
   */
  function buildJGuitarKey(root, suffix, bassNote) {
    const normalRoot = normalizeJGuitarKey(root);
    const normalSuffix = normalizeJGuitarSuffix(suffix);
    let key = normalRoot + normalSuffix;
    if (bassNote) {
      key += '/' + normalizeJGuitarKey(bassNote);
    }
    return key;
  }

  /**
   * Look up jguitar static data for a chord name (including slash chords).
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

    // If degreeMods exist (e.g., "(add9)", "(#9)"), try full suffix first
    if (parsed.degreeMods) {
      const fullSuffix = buildFullSuffix(parsed.suffix, parsed.degreeMods);
      if (fullSuffix) {
        const fullKey = buildJGuitarKey(parsed.root, fullSuffix, parsed.bassNote);
        if (jguitarData[fullKey]) return jguitarData[fullKey];
      }
      // Don't fall back to base suffix — would return wrong chord (e.g., G instead of Gadd9)
      return null;
    }

    const normalName = buildJGuitarKey(parsed.root, parsed.suffix, parsed.bassNote);

    if (jguitarData[normalName]) {
      return jguitarData[normalName];
    }

    return null;
  }

  /**
   * Look up jguitar static data for base chord only (no slash).
   */
  function lookupJGuitarBase(root, suffix) {
    if (!jguitarData) return null;
    const key = buildJGuitarKey(root, suffix, null);
    return jguitarData[key] || null;
  }

  /**
   * Look up jguitar ukulele data for a chord name (including slash chords).
   */
  function lookupJGuitarUkulele(chordName) {
    if (!jguitarUkuleleData) return null;

    if (jguitarUkuleleData[chordName]) {
      return jguitarUkuleleData[chordName];
    }

    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    // If degreeMods exist (e.g., "(add9)", "(#9)"), try full suffix first
    if (parsed.degreeMods) {
      const fullSuffix = buildFullSuffix(parsed.suffix, parsed.degreeMods);
      if (fullSuffix) {
        const fullKey = buildJGuitarKey(parsed.root, fullSuffix, parsed.bassNote);
        if (jguitarUkuleleData[fullKey]) return jguitarUkuleleData[fullKey];
      }
      return null;
    }

    const normalName = buildJGuitarKey(parsed.root, parsed.suffix, parsed.bassNote);
    if (jguitarUkuleleData[normalName]) {
      return jguitarUkuleleData[normalName];
    }

    return null;
  }

  /**
   * Look up jguitar ukulele data for base chord only (no slash).
   */
  function lookupJGuitarUkuleleBase(root, suffix) {
    if (!jguitarUkuleleData) return null;
    const key = buildJGuitarKey(root, suffix, null);
    return jguitarUkuleleData[key] || null;
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
    let lowest = Infinity;
    for (let i = 0; i < frets.length; i++) {
      if (frets[i] >= 0) {
        const fret = Number(frets[i]);
        const actualFret = fret === 0 ? 0 : fret + (baseFret - 1);
        const noteInfo = MusicTheory.fretToNote(tuning, i, actualFret);
        if (noteInfo) lowest = Math.min(lowest, noteInfo.octave * 12 + MusicTheory.noteIndex(noteInfo.note));
      }
    }
    return lowest === Infinity ? -1 : lowest % 12;
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

    const generated = [];
    for (const pos of others) {
      const modified = createSlashVoicing(pos, bassTarget, tuning);
      if (modified) generated.push(modified);
    }
    return [...matching, ...generated];
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
          const candidate = {
            frets: rel.frets,
            baseFret: rel.baseFret,
            barres: [],
            fingers: [],
          };
          if (getLowestNoteSemitone(candidate, tuning) === bassTarget) return candidate;
        }
      }
    }
    return null;
  }

  // =========================================
  // Lookup functions
  // =========================================

  /**
   * Build full suffix including degree modifications.
   * "(#9)" → "#9", "(#9,b13)" → "#9b13"
   */
  function buildFullSuffix(suffix, degreeMods) {
    if (!degreeMods) return null;
    const modContent = degreeMods.replace(/[(),]/g, '');
    // When suffix is 'major' (default for empty base like "G"), the degreeMods
    // IS the actual suffix (e.g., "G(add9)" → "add9", not "majoradd9")
    if (suffix === 'major') return modContent;
    return suffix + modContent;
  }

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

  function usableVoicings(positions, chordName, tuning) {
    if (!positions || !positions.length) return null;
    const parsed = MusicTheory.parseChordName(chordName);
    const notes = MusicTheory.getChordNotes(chordName);
    if (!parsed || !notes.length) return null;
    const allowed = new Set(notes.map(MusicTheory.noteIndex));
    const required = MusicTheory.getChordEssentialNotes(chordName).map(MusicTheory.noteIndex);
    const candidates = parsed.bassNote ? applySlashBass(positions, parsed.bassNote, tuning) : positions;
    const seen = new Set();
    const valid = candidates.filter(position => {
      if (!position || !Array.isArray(position.frets)) return false;
      if (position.frets.some(fret => fret >= 0 && Number(fret) > 4)) return false;
      const pitches = position.frets.flatMap((fret, i) => {
        if (!(fret >= 0) || !tuning[i]) return [];
        const numericFret = Number(fret);
        const actual = numericFret === 0 ? 0 : numericFret + ((position.baseFret || 1) - 1);
        const note = MusicTheory.fretToNote(tuning, i, actual);
        return note ? [MusicTheory.noteIndex(note.note)] : [];
      });
      if (!pitches.length || pitches.some(pitch => !allowed.has(pitch)) ||
          required.some(pitch => !pitches.includes(pitch))) return false;
      if (parsed.bassNote && getLowestNoteSemitone(position, tuning) !== MusicTheory.noteIndex(parsed.bassNote)) return false;
      const key = `${position.baseFret || 1}:${position.frets.join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return valid.length ? valid : null;
  }

  const generatedVoicingCache = new Map();

  // Search only four adjacent frets plus open strings. Return shapes whose
  // sounding notes, characteristic degrees and actual lowest pitch are valid.
  function generateVoicings(chordName, instrument) {
    const name = MusicTheory.normalizeChordSymbol(chordName);
    const cacheKey = instrument + ':' + name;
    if (generatedVoicingCache.has(cacheKey)) return generatedVoicingCache.get(cacheKey);
    const parsed = MusicTheory.parseChordName(name);
    const notes = MusicTheory.getChordNotes(name);
    if (!parsed || !notes.length) return null;
    const tuning = instrument === 'guitar' ? MusicTheory.GUITAR_TUNING : MusicTheory.UKULELE_TUNING;
    const allowed = new Set(notes.map(MusicTheory.noteIndex));
    const required = MusicTheory.getChordEssentialNotes(name).map(MusicTheory.noteIndex);
    const bass = parsed.bassNote ? MusicTheory.noteIndex(parsed.bassNote) : null;
    const root = MusicTheory.noteIndex(parsed.root);
    const found = [];
    const seen = new Set();
    const frets = new Array(tuning.length).fill(-1);
    for (let start = 1; start <= 12; start++) {
      const choices = tuning.map(string => {
        const open = MusicTheory.noteIndex(string.note);
        const result = [-1];
        if (allowed.has(open)) result.push(0);
        for (let fret = start; fret < start + 4 && fret <= 15; fret++) {
          if (allowed.has((open + fret) % 12)) result.push(fret);
        }
        return result;
      });
      let inWindow = 0;
      function visit(index) {
        if (inWindow >= 80) return;
        if (index < frets.length) {
          for (const fret of choices[index]) { frets[index] = fret; visit(index + 1); }
          return;
        }
        const sounded = frets.filter(fret => fret >= 0).length;
        if (sounded < 3) return;
        const fretted = frets.filter(fret => fret > 0);
        if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 3) return;
        // Count separate finger/barre groups, rather than assuming any shape
        // within four frets can be played with four fingers.
        let groups = 0;
        for (let i = 0; i < frets.length; i++) {
          if (frets[i] > 0 && (i === 0 || frets[i - 1] !== frets[i])) groups++;
        }
        if (groups > 4) return;
        const pitchClasses = frets.flatMap((fret, i) => fret < 0 ? [] :
          [(MusicTheory.noteIndex(tuning[i].note) + fret) % 12]);
        if (required.some(note => !pitchClasses.includes(note))) return;
        const rel = toRelativeFrets(frets);
        const key = rel.baseFret + ':' + rel.frets.join(',');
        if (seen.has(key)) return;
        const barres = [...new Set(rel.frets.filter((fret, i) => fret > 0 && rel.frets[i + 1] === fret))];
        const position = { frets: rel.frets, baseFret: rel.baseFret, barres, fingers: [] };
        const lowest = getLowestNoteSemitone(position, tuning);
        if (bass !== null && lowest !== bass) return;
        seen.add(key);
        inWindow++;
        found.push({ position, score: sounded * 10 + (lowest === root ? 5 : 0) - start / 10 - groups / 10 });
      }
      visit(0);
    }
    found.sort((a, b) => b.score - a.score);
    const result = found.length ? found.slice(0, 20).map(item => item.position) : null;
    generatedVoicingCache.set(cacheKey, result);
    return result;
  }

  /** Look up voicings, accepting only notes and bass compatible with the chord. */
  function lookupChordVoicings(chordName, instrument) {
    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed || !MusicTheory.getChordNotes(chordName).length) return null;
    const guitar = instrument === 'guitar';
    const tuning = guitar ? MusicTheory.GUITAR_TUNING : MusicTheory.UKULELE_TUNING;
    const lookupDirect = guitar ? lookupJGuitar : lookupJGuitarUkulele;
    const lookupBase = guitar ? lookupJGuitarBase : lookupJGuitarUkuleleBase;
    const data = guitar ? guitarData : ukuleleData;
    const fullSuffix = buildFullSuffix(parsed.suffix, parsed.degreeMods);

    let valid = usableVoicings(lookupDirect(chordName), chordName, tuning);
    if (valid) return valid;
    if (fullSuffix) {
      valid = usableVoicings(lookupBase(parsed.root, fullSuffix), chordName, tuning);
      if (valid) return valid;
      // add2/add4 and add9/add11 have the same fretboard pitch classes.
      const equivalent = fullSuffix.replace(/add2(?=$|[#b,])/g, 'add9')
        .replace(/add4(?=$|[#b,])/g, 'add11');
      if (equivalent !== fullSuffix) {
        valid = usableVoicings(lookupBase(parsed.root, equivalent), chordName, tuning);
        if (valid) return valid;
      }
    }
    // A base voicing is usable only when validation proves it also contains
    // every defining alteration and the requested bass.
    valid = usableVoicings(lookupBase(parsed.root, parsed.suffix), chordName, tuning);
    if (valid) return valid;
    if (!data) return generateVoicings(chordName, instrument);
    const suffix = fullSuffix || parsed.suffix;
    valid = usableVoicings(lookupPositions(data, parsed.root, suffix, instrument), chordName, tuning);
    if (valid) return valid;
    if (fullSuffix) {
      valid = usableVoicings(lookupPositions(data, parsed.root, parsed.suffix, instrument), chordName, tuning);
      if (valid) return valid;
    }
    return generateVoicings(chordName, instrument);
  }

  function getGuitarChord(chordName) {
    return lookupChordVoicings(chordName, 'guitar');
  }

  function getUkuleleChord(chordName) {
    return lookupChordVoicings(chordName, 'ukulele');
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
