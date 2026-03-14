/**
 * MusicXML Parser Module
 * Extracts song metadata and chord names from MusicXML files
 */
const MusicXMLParser = (() => {

  // fifths value → key name mapping
  const FIFTHS_TO_MAJOR = {
    '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
    '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#',
  };
  const FIFTHS_TO_MINOR = {
    '-7': 'Abm', '-6': 'Ebm', '-5': 'Bbm', '-4': 'Fm', '-3': 'Cm', '-2': 'Gm', '-1': 'Dm',
    '0': 'Am', '1': 'Em', '2': 'Bm', '3': 'F#m', '4': 'C#m', '5': 'G#m', '6': 'D#m', '7': 'A#m',
  };

  // MusicXML harmony kind → chord suffix
  const KIND_TO_SUFFIX = {
    'major': '', 'minor': 'm', 'dominant': '7',
    'major-seventh': 'maj7', 'minor-seventh': 'm7',
    'diminished-seventh': 'dim7', 'diminished': 'dim',
    'augmented': 'aug', 'augmented-seventh': 'aug7',
    'half-diminished': 'm7b5',
    'major-sixth': '6', 'minor-sixth': 'm6',
    'suspended-fourth': 'sus4', 'suspended-second': 'sus2',
    'dominant-ninth': '9', 'minor-ninth': 'm9', 'major-ninth': 'maj9',
    'dominant-11th': '11', 'dominant-13th': '13',
    'power': '5', 'major-minor': 'mMaj7',
    'minor-11th': 'm11', 'minor-13th': 'm13',
    'major-13th': 'maj13',
  };

  const ALTER_MAP = { '1': '#', '-1': 'b' };

  /**
   * Parse a MusicXML string and extract metadata + chords
   * @param {string} xmlString - Raw XML content
   * @returns {Object} { songName, artist, composer, lyricist, key, timeSignature, tempo, chords }
   */
  function parse(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    return {
      songName: parseSongName(doc),
      artist: parseCreatorField(doc, 'Artist'),
      composer: parseCreatorField(doc, 'Composed by'),
      lyricist: parseCreatorField(doc, 'Lyrics by'),
      key: parseKey(doc),
      timeSignature: parseTimeSignature(doc),
      tempo: parseTempo(doc),
      chords: parseChords(doc),
    };
  }

  function parseSongName(doc) {
    const el = doc.querySelector('work-title');
    return el ? el.textContent.trim() : '';
  }

  function parseCreatorField(doc, prefix) {
    const creators = doc.querySelectorAll('creator');
    for (const creator of creators) {
      const text = creator.textContent;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith(prefix)) {
          // Extract name: "Artist 김현식 (Kim Hyun-sik)" → "김현식"
          let value = line.substring(prefix.length).trim();
          // Remove English name in parentheses
          value = value.replace(/\s*\(.*?\)\s*/g, '').trim();
          return value;
        }
      }
    }
    return '';
  }

  function parseKey(doc) {
    // Collect all key changes across measures in order
    const measures = doc.querySelectorAll('part:first-of-type measure');
    const keySequence = [];
    let lastKey = '';

    for (const measure of measures) {
      const keyEls = measure.querySelectorAll('attributes key');
      for (const keyEl of keyEls) {
        const fifths = keyEl.querySelector('fifths');
        if (!fifths) continue;
        const fifthsVal = fifths.textContent.trim();
        const mode = keyEl.querySelector('mode');
        const modeVal = mode ? mode.textContent.trim() : 'major';
        const keyName = modeVal === 'minor'
          ? (FIFTHS_TO_MINOR[fifthsVal] || '')
          : (FIFTHS_TO_MAJOR[fifthsVal] || '');
        if (keyName && keyName !== lastKey) {
          keySequence.push(keyName);
          lastKey = keyName;
        }
      }
    }

    if (keySequence.length === 0) {
      // Fallback: try first <key> anywhere
      const keyEl = doc.querySelector('key');
      if (!keyEl) return '';
      const fifths = keyEl.querySelector('fifths');
      if (!fifths) return '';
      const fifthsVal = fifths.textContent.trim();
      const mode = keyEl.querySelector('mode');
      const modeVal = mode ? mode.textContent.trim() : 'major';
      return modeVal === 'minor'
        ? (FIFTHS_TO_MINOR[fifthsVal] || '')
        : (FIFTHS_TO_MAJOR[fifthsVal] || '');
    }

    // Single key or modulation sequence
    return keySequence.join(' → ');
  }

  function parseTimeSignature(doc) {
    const measures = doc.querySelectorAll('part:first-of-type measure');
    const totalMeasures = measures.length;
    if (totalMeasures === 0) {
      // Fallback: first <time> anywhere
      const timeEl = doc.querySelector('time');
      if (!timeEl) return '';
      const beats = timeEl.querySelector('beats');
      const beatType = timeEl.querySelector('beat-type');
      if (!beats || !beatType) return '';
      return `${beats.textContent.trim()}/${beatType.textContent.trim()}`;
    }

    // Collect time signature changes with measure index
    const changes = []; // { sig, measureIdx }
    let lastSig = '';

    for (let i = 0; i < totalMeasures; i++) {
      const timeEls = measures[i].querySelectorAll('attributes time');
      for (const timeEl of timeEls) {
        const beats = timeEl.querySelector('beats');
        const beatType = timeEl.querySelector('beat-type');
        if (!beats || !beatType) continue;
        const sig = `${beats.textContent.trim()}/${beatType.textContent.trim()}`;
        if (sig && sig !== lastSig) {
          changes.push({ sig, measureIdx: i });
          lastSig = sig;
        }
      }
    }

    if (changes.length === 0) return '';
    if (changes.length === 1) return changes[0].sig;

    // Filter out brief appearances (less than 4 consecutive measures OR < 10% of total)
    const threshold = Math.max(4, Math.floor(totalMeasures * 0.1));
    const significant = [];
    for (let i = 0; i < changes.length; i++) {
      const start = changes[i].measureIdx;
      const end = i + 1 < changes.length ? changes[i + 1].measureIdx : totalMeasures;
      const duration = end - start;
      if (duration >= threshold) {
        if (significant.length === 0 || significant[significant.length - 1].sig !== changes[i].sig) {
          significant.push(changes[i]);
        }
      }
    }

    if (significant.length === 0) return changes[0].sig;
    if (significant.length === 1) return significant[0].sig;
    return significant.map(c => c.sig).join(' → ');
  }

  function parseTempo(doc) {
    const metronome = doc.querySelector('metronome');
    if (metronome) {
      const perMin = metronome.querySelector('per-minute');
      if (perMin) return perMin.textContent.trim();
    }
    // Fallback: sound element with tempo attribute
    const sound = doc.querySelector('sound[tempo]');
    if (sound) return sound.getAttribute('tempo');
    return '';
  }

  function parseChords(doc) {
    const harmonies = doc.querySelectorAll('harmony');
    const seen = new Set();
    const chords = [];

    for (const harmony of harmonies) {
      const rootStep = harmony.querySelector('root root-step');
      if (!rootStep) continue;

      let root = rootStep.textContent.trim();
      const rootAlter = harmony.querySelector('root root-alter');
      if (rootAlter) {
        root += ALTER_MAP[rootAlter.textContent.trim()] || '';
      }

      const kind = harmony.querySelector('kind');
      const kindText = kind ? kind.textContent.trim() : 'major';
      const suffix = KIND_TO_SUFFIX[kindText];
      // Skip unknown kinds
      if (suffix === undefined) continue;

      // Parse bass note for slash chords (e.g., G/B)
      let bassStr = '';
      const bassStep = harmony.querySelector('bass bass-step');
      if (bassStep) {
        let bass = bassStep.textContent.trim();
        const bassAlter = harmony.querySelector('bass bass-alter');
        if (bassAlter) {
          bass += ALTER_MAP[bassAlter.textContent.trim()] || '';
        }
        bassStr = '/' + bass;
      }

      const chordName = root + suffix + bassStr;
      if (!seen.has(chordName)) {
        seen.add(chordName);
        chords.push(chordName);
      }
    }

    return chords;
  }

  return { parse };
})();
