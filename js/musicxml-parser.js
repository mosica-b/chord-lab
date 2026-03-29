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

  // ── Part name abbreviation → full instrument name ──
  const PART_NAME_MAP = {
    'vn': 'Violin', 'vln': 'Violin', 'violin': 'Violin',
    'va': 'Viola', 'vla': 'Viola', 'viola': 'Viola',
    'vc': 'Cello', 'vcl': 'Cello', 'cello': 'Cello',
    'cb': 'Double Bass', 'db': 'Double Bass', 'double bass': 'Double Bass',
    'fl': 'Flute', 'flute': 'Flute',
    'ob': 'Oboe', 'oboe': 'Oboe',
    'cl': 'Clarinet', 'clarinet': 'Clarinet',
    'bn': 'Bassoon', 'bsn': 'Bassoon', 'bassoon': 'Bassoon',
    'sax': 'Saxophone', 'saxophone': 'Saxophone',
    'hn': 'Horn', 'hr': 'Horn', 'horn': 'Horn',
    'tp': 'Trumpet', 'tpt': 'Trumpet', 'trumpet': 'Trumpet',
    'tb': 'Trombone', 'tbn': 'Trombone', 'trombone': 'Trombone',
    'tu': 'Tuba', 'tba': 'Tuba', 'tuba': 'Tuba',
    'pf': 'Piano', 'pno': 'Piano', 'piano': 'Piano',
    'gt': 'Guitar', 'gtr': 'Guitar', 'guitar': 'Guitar',
    'hp': 'Harp', 'harp': 'Harp',
    'perc': 'Percussion', 'percussion': 'Percussion',
    'timp': 'Timpani', 'timpani': 'Timpani',
    'vo': 'Vocal', 'vox': 'Vocal', 'voice': 'Vocal',
    'bass': 'Bass', 'electric bass': 'Bass',
  };

  /**
   * Detect instrument type from filename suffix (EPG/EPB).
   * @returns 'guitar' | 'bass' | null
   */
  function detectInstrumentFromFileName(fileName) {
    if (!fileName) return null;
    // Remove extension, then check suffix
    const base = fileName.replace(/\.(xml|musicxml|mxl)$/i, '');
    if (/EPG$/i.test(base)) return 'guitar';
    if (/EPB$/i.test(base)) return 'bass';
    return null;
  }

  /**
   * Detect instrument from <part-name> text using abbreviation map.
   * @returns instrument name string or null
   */
  function detectInstrumentFromPartName(partName) {
    if (!partName) return null;
    const normalized = partName.trim().toLowerCase();
    // Try exact match first
    if (PART_NAME_MAP[normalized]) return PART_NAME_MAP[normalized];
    // Try matching each key as prefix/word
    for (const [abbr, name] of Object.entries(PART_NAME_MAP)) {
      if (normalized === abbr || normalized.startsWith(abbr + ' ') || normalized.startsWith(abbr + '.')) {
        return name;
      }
    }
    return null;
  }

  /**
   * Analyze each <part> in the document and return structural info.
   * @returns Array of { id, name, instrument, staves, clefs[], hasTab, tabLines, hasLyric, hasBrace }
   */
  function analyzePartStructure(doc) {
    const parts = [];

    // Get part-list info (names, groups)
    const scoreParts = doc.querySelectorAll('part-list score-part');
    const partNames = {};
    for (const sp of scoreParts) {
      const id = sp.getAttribute('id');
      const nameEl = sp.querySelector('part-name');
      partNames[id] = nameEl ? nameEl.textContent.trim() : '';
    }

    // Check for brace groupings
    const bracePartIds = new Set();
    const partGroups = doc.querySelectorAll('part-list part-group');
    let braceGroupStart = null;
    const partIdOrder = Array.from(scoreParts).map(sp => sp.getAttribute('id'));
    for (const pg of partGroups) {
      const type = pg.getAttribute('type');
      const symbol = pg.querySelector('group-symbol');
      if (type === 'start' && symbol && symbol.textContent.trim() === 'brace') {
        braceGroupStart = pg;
      } else if (type === 'stop' && braceGroupStart) {
        // Find parts between start and stop in part-list order
        // Since part-group elements are interspersed with score-part elements,
        // we track which score-parts fall between the start/stop
        braceGroupStart = null;
      }
    }

    // Simpler brace detection: iterate part-list children in order
    let inBrace = false;
    const partListChildren = doc.querySelector('part-list');
    if (partListChildren) {
      for (const child of partListChildren.children) {
        if (child.tagName === 'part-group') {
          const type = child.getAttribute('type');
          const symbol = child.querySelector('group-symbol');
          if (type === 'start' && symbol && symbol.textContent.trim() === 'brace') {
            inBrace = true;
          } else if (type === 'stop' && inBrace) {
            inBrace = false;
          }
        } else if (child.tagName === 'score-part' && inBrace) {
          bracePartIds.add(child.getAttribute('id'));
        }
      }
    }

    // Analyze each part element
    const partEls = doc.querySelectorAll('score-partwise > part, part');
    const seenIds = new Set();
    for (const partEl of partEls) {
      const id = partEl.getAttribute('id');
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);

      const info = {
        id,
        name: partNames[id] || '',
        instrument: detectInstrumentFromPartName(partNames[id]),
        staves: 1,
        clefs: [],
        hasTab: false,
        tabLines: 0,
        hasLyric: false,
        hasBrace: bracePartIds.has(id),
        secondStaffEverHidden: false,
      };

      // Check first measure for attributes
      const firstMeasure = partEl.querySelector('measure');
      if (firstMeasure) {
        const stavesEl = firstMeasure.querySelector('attributes staves');
        if (stavesEl) info.staves = parseInt(stavesEl.textContent.trim()) || 1;

        const clefEls = firstMeasure.querySelectorAll('attributes clef');
        for (const c of clefEls) {
          const sign = c.querySelector('sign');
          if (sign) info.clefs.push(sign.textContent.trim());
        }

        // If no clef in first measure, try any measure
        if (info.clefs.length === 0) {
          const anyClef = partEl.querySelector('clef sign');
          if (anyClef) info.clefs.push(anyClef.textContent.trim());
        }

        // Check staff-lines for TAB
        const staffDetails = firstMeasure.querySelectorAll('attributes staff-details');
        for (const sd of staffDetails) {
          const linesEl = sd.querySelector('staff-lines');
          if (linesEl) {
            const lines = parseInt(linesEl.textContent.trim());
            if (lines && lines !== 5 && lines !== 0) info.tabLines = lines;
          }
        }
      }

      // Check if second staff is ever hidden across all measures
      // (melody scores have staves=2 but hide staff 2 in some measures)
      if (info.staves >= 2) {
        const allStaffDetails2 = partEl.querySelectorAll('measure attributes staff-details[number="2"]');
        for (const sd of allStaffDetails2) {
          const printObj = sd.getAttribute('print-object');
          const linesEl = sd.querySelector('staff-lines');
          const lines = linesEl ? parseInt(linesEl.textContent.trim()) : 5;
          if (printObj === 'no' || lines === 0) {
            info.secondStaffEverHidden = true;
            break;
          }
        }
      }

      // Check if any clef is TAB
      info.hasTab = info.clefs.includes('TAB');
      if (info.hasTab && info.tabLines === 0) {
        // Default tab lines: 6 for guitar, 4 for bass
        info.tabLines = 6;
      }

      // Check for lyrics anywhere in this part
      info.hasLyric = !!partEl.querySelector('lyric');

      parts.push(info);
    }

    return parts;
  }

  /**
   * Determine the score type label from filename + XML structure.
   * @param {Document} doc - Parsed XML document
   * @param {string} fileName - Original filename (for EPG/EPB detection)
   * @returns {string} Score type label (e.g. "Guitar (Tab)", "Melody + Piano")
   */
  function parseScoreType(doc, fileName) {
    const fileInstrument = detectInstrumentFromFileName(fileName);
    const parts = analyzePartStructure(doc);

    if (parts.length === 0) return '';

    // Classify each part
    const classified = parts.map(p => {
      let type = '';
      let instrument = p.instrument || '';

      // Piano detection: staves >= 2 with brace or multi-stave in same part (no TAB)
      // Skip if second staff is ever hidden (= melody with occasional extra staff)
      if (!p.hasTab && (p.staves >= 2 || p.hasBrace)) {
        // Check it's not a Staff+Tab combo
        const hasTabClef = p.clefs.includes('TAB');
        if (!hasTabClef && !p.secondStaffEverHidden) {
          return { type: 'Piano', instrument: 'Piano' };
        }
      }

      // Determine instrument from file name or part analysis
      if (fileInstrument === 'guitar' || instrument === 'Guitar') {
        instrument = 'Guitar';
      } else if (fileInstrument === 'bass' || instrument === 'Bass') {
        instrument = 'Bass';
      }

      // TAB-based detection
      if (p.hasTab) {
        const lines = p.tabLines || 6;
        let instLabel = instrument || (lines <= 5 ? 'Bass' : 'Guitar');
        let linesLabel = '';
        if (instLabel === 'Bass' && lines === 5) linesLabel = ' 5-String';

        // Staff + Tab combo?
        const nonTabClefs = p.clefs.filter(c => c !== 'TAB');
        if (nonTabClefs.length > 0) {
          // Has both staff and tab
          if (p.hasLyric) {
            return { type: `Vocal + ${instLabel} (Melody+Tab)`, instrument: instLabel };
          }
          return { type: `${instLabel}${linesLabel} (Staff+Tab)`, instrument: instLabel };
        }

        return { type: `${instLabel}${linesLabel} (Tab)`, instrument: instLabel };
      }

      // Staff only (no TAB)
      if (instrument === 'Guitar') {
        return { type: 'Guitar (Staff)', instrument: 'Guitar' };
      }
      if (instrument === 'Bass') {
        return { type: 'Bass (Staff)', instrument: 'Bass' };
      }

      // Melody / Vocal / named instrument
      if (p.hasLyric) {
        return { type: instrument || 'Melody', instrument: instrument || 'Melody' };
      }

      return { type: instrument || 'Melody', instrument: instrument || 'Melody' };
    });

    // If single part, return its type directly
    if (classified.length === 1) return classified[0].type;

    // Multi-part: combine labels
    const typeLabels = classified.map(c => c.type);
    // Simplify common combos
    const hasVocal = classified.some(c => c.type === 'Melody' || c.type === 'Vocal');
    const hasPiano = classified.some(c => c.type === 'Piano');
    const hasGuitarTab = classified.some(c => c.instrument === 'Guitar' && c.type.includes('Tab'));
    const hasBassTab = classified.some(c => c.instrument === 'Bass' && c.type.includes('Tab'));

    if (hasVocal && hasPiano && hasGuitarTab) {
      return 'Melody + Piano + Guitar';
    }
    if (hasVocal && hasPiano && !hasGuitarTab) {
      return 'Melody + Piano';
    }
    if (hasVocal && hasGuitarTab) {
      return 'Vocal + Guitar';
    }

    return typeLabels.join(' + ');
  }

  /**
   * Extract lyrics intro from <lyric> elements in MusicXML.
   * Joins syllables based on <syllabic> type and returns the first few lines.
   * @param {Document} doc - Parsed XML document
   * @param {number} [maxLines=2] - Maximum lines to return
   * @returns {string} First few lines of lyrics, or '' if none
   */
  function parseLyricsIntro(doc, maxLines = 2) {
    // Find the part that has lyrics (usually vocal part)
    const partEls = doc.querySelectorAll('score-partwise > part, part');
    let lyricPart = null;
    for (const partEl of partEls) {
      if (partEl.querySelector('lyric')) { lyricPart = partEl; break; }
    }
    if (!lyricPart) return '';

    // Collect all syllables from the first lyric line (number containing "verse1" or first number found)
    const measures = lyricPart.querySelectorAll('measure');
    const words = []; // collected words/syllables
    let currentWord = '';
    let measuresWithLyrics = 0;
    let linesCollected = 0;
    const lines = [];

    for (const measure of measures) {
      const notes = measure.querySelectorAll('note');
      let measureHasLyric = false;

      for (const note of notes) {
        // Skip rest notes
        if (note.querySelector('rest')) continue;

        const lyric = note.querySelector('lyric');
        if (!lyric) {
          // Note without lyric in the middle of lyrics — might be a melisma (held syllable)
          continue;
        }

        const textEl = lyric.querySelector('text');
        if (!textEl) continue;
        const text = textEl.textContent;
        const syllabicEl = lyric.querySelector('syllabic');
        const syllabic = syllabicEl ? syllabicEl.textContent.trim() : 'single';

        measureHasLyric = true;

        if (syllabic === 'single') {
          // Complete word
          if (currentWord) { words.push(currentWord); currentWord = ''; }
          words.push(text);
        } else if (syllabic === 'begin') {
          if (currentWord) { words.push(currentWord); }
          currentWord = text;
        } else if (syllabic === 'middle') {
          currentWord += text;
        } else if (syllabic === 'end') {
          currentWord += text;
          words.push(currentWord);
          currentWord = '';
        }
      }

      if (measureHasLyric) measuresWithLyrics++;

      // Break into lines roughly every 4 measures with lyrics
      if (measuresWithLyrics > 0 && measuresWithLyrics % 4 === 0 && words.length > 0) {
        if (currentWord) { words.push(currentWord); currentWord = ''; }
        lines.push(words.join(' '));
        words.length = 0;
        linesCollected++;
        if (linesCollected >= maxLines + 3) break; // collect extra lines to account for vocalization filtering
      }
    }

    // Flush remaining
    if (linesCollected < maxLines && words.length > 0) {
      if (currentWord) words.push(currentWord);
      lines.push(words.join(' '));
    }

    // Clean up lines: remove melisma placeholders, keep vocalizations as lyrics
    const vocalizationPattern = /^(woo|la|na|oh|ah|ooh|yeah|hey|da|uh|mm|hmm)$/i;
    const cleaned = lines.map(line => {
      const allWords = line.replace(/\s+/g, ' ').trim().split(' ');
      // Remove long-vowel marks (ー) used as melisma placeholders
      return allWords.filter(w => w !== 'ー' && w !== '-').join(' ');
    }).filter(line => line.length > 0);

    // Collect lines: vocalization-only lines don't count towards maxLines
    const result = [];
    let meaningfulCount = 0;
    for (const line of cleaned) {
      const isVocOnly = line.split(' ').every(w => vocalizationPattern.test(w));
      result.push(line);
      if (!isVocOnly) meaningfulCount++;
      if (meaningfulCount >= maxLines) break;
    }
    return result.join('\n');
  }

  /**
   * Parse a MusicXML string and extract metadata + chords + score type
   * @param {string} xmlString - Raw XML content
   * @param {string} [fileName] - Original filename (for EPG/EPB detection)
   * @returns {Object} { songName, artist, composer, lyricist, key, timeSignature, tempo, chords, scoreType, lyricsIntro }
   */
  function parse(xmlString, fileName) {
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
      scoreType: parseScoreType(doc, fileName || ''),
      lyricsIntro: parseLyricsIntro(doc),
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

      // Try exact line-based matching first (standard format)
      for (const line of lines) {
        if (line.startsWith(prefix)) {
          let value = line.substring(prefix.length).trim();
          return value;
        }
      }

      // Handle combined "Composer & Lyrics" format (same people for both)
      // e.g. "Composer & by Lylrics  Names... Artist ArtistName"
      if (prefix === 'Composed by' || prefix === 'Lyrics by') {
        const fullText = lines.join(' ');
        const m = fullText.match(
          /Compos\w*\s*(?:&|and)\s*(?:by\s+)?Ly\w*ics(?:\s+by)?\s+(.*?)(?=\s+Artist\b|$)/i
        );
        if (m) {
          return m[1].replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();
        }
      }
    }
    return '';
  }

  /**
   * Append Major/Minor label to a key name, with optional tag.
   * "D" → "D (Maj)", "Am" → "Am (Min)"
   * With tag: "Bm", "Original" → "Bm (Min) [Original]"
   */
  function labelKey(keyName, tag) {
    if (!keyName) return '';
    let label = keyName.endsWith('m')
      ? keyName + ' (Min)'
      : keyName + ' (Maj)';
    if (tag) label += ' [' + tag + ']';
    return label;
  }

  /**
   * Parse key name from <words> text like "Original Bm key", "More D key"
   * Returns { key, tag } object or null
   */
  function parseKeyFromWords(text) {
    // Match patterns: "Original Bm key", "More D key", "Origin F#m Key", etc.
    const m = text.match(/(Original|Origin|More)\s+([A-G][#b]?m?)\s*[Kk]ey/i);
    if (!m) return null;
    const prefix = m[1];
    const tag = /^(Original|Origin)$/i.test(prefix) ? 'Original' : null;
    return { key: m[2], tag };
  }

  /**
   * Scan <words> elements for annotated key info (Original/More key).
   * Returns array of { key, tag } objects in order of appearance.
   */
  function parseKeysFromWords(doc) {
    const keys = [];
    const measures = doc.querySelectorAll('part:first-of-type measure');
    for (const measure of measures) {
      const wordEls = measure.querySelectorAll('direction direction-type words');
      for (const w of wordEls) {
        const result = parseKeyFromWords(w.textContent.trim());
        if (result && (keys.length === 0 || keys[keys.length - 1].key !== result.key)) {
          keys.push(result);
        }
      }
    }
    return keys;
  }

  /**
   * Determine mode from fifths value using annotated key hint.
   * If the annotated key ends with 'm', it's minor; otherwise major.
   */
  function resolveKeyFromFifths(fifthsVal, modeVal, annotatedKey) {
    if (annotatedKey) {
      const isMinor = annotatedKey.endsWith('m');
      return isMinor
        ? (FIFTHS_TO_MINOR[fifthsVal] || '')
        : (FIFTHS_TO_MAJOR[fifthsVal] || '');
    }
    return modeVal === 'minor'
      ? (FIFTHS_TO_MINOR[fifthsVal] || '')
      : (FIFTHS_TO_MAJOR[fifthsVal] || '');
  }

  function parseKey(doc) {
    // First, check <words> annotations for explicit key info
    const annotatedKeys = parseKeysFromWords(doc);
    if (annotatedKeys.length > 0) {
      return annotatedKeys.map(k => labelKey(k.key, k.tag)).join(' → ');
    }

    // Fallback: collect key changes from <key> elements across measures
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
          keySequence.push(labelKey(keyName));
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
      const keyName = modeVal === 'minor'
        ? (FIFTHS_TO_MINOR[fifthsVal] || '')
        : (FIFTHS_TO_MAJOR[fifthsVal] || '');
      return labelKey(keyName);
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

  const BEAT_UNIT_SYMBOL = {
    'quarter': '♩', 'eighth': '♪', 'half': '𝅗𝅥',
    'whole': '𝅝', '16th': '♬', '32nd': '♬',
  };

  function parseTempo(doc) {
    const metronomes = doc.querySelectorAll('metronome');
    if (metronomes.length > 0) {
      const tempos = [];
      for (const m of metronomes) {
        const perMin = m.querySelector('per-minute');
        const beatUnit = m.querySelector('beat-unit');
        if (!perMin) continue;
        const bpm = perMin.textContent.trim();
        const unit = beatUnit ? beatUnit.textContent.trim() : 'quarter';
        const symbol = BEAT_UNIT_SYMBOL[unit] || '♩';
        const label = `${symbol}=${bpm}`;
        // Deduplicate consecutive same tempo (allow back-and-forth changes)
        if (tempos.length === 0 || tempos[tempos.length - 1] !== label) {
          tempos.push(label);
        }
      }
      if (tempos.length > 0) return tempos.join(' → ');
    }
    // Fallback: sound element with tempo attribute
    const sounds = doc.querySelectorAll('sound[tempo]');
    if (sounds.length > 0) {
      const tempos = [];
      for (const s of sounds) {
        const label = '♩=' + s.getAttribute('tempo');
        if (tempos.length === 0 || tempos[tempos.length - 1] !== label) {
          tempos.push(label);
        }
      }
      return tempos.join(' → ');
    }
    return '';
  }

  /**
   * Parse <degree> elements for chord modifications (e.g., #9, b5, add9).
   * MusicXML example for B7(#9):
   *   <kind>dominant</kind>
   *   <degree><degree-value>9</degree-value><degree-alter>1</degree-alter><degree-type>add</degree-type></degree>
   */
  function parseDegrees(harmony) {
    const degrees = harmony.querySelectorAll('degree');
    if (degrees.length === 0) return { suffix: null, degreeStr: '' };

    const parts = [];
    const subtracted = new Set();
    const added = [];

    for (const deg of degrees) {
      const degValue = deg.querySelector('degree-value');
      if (!degValue) continue;

      const value = degValue.textContent.trim();
      const degAlter = deg.querySelector('degree-alter');
      const alter = degAlter ? degAlter.textContent.trim() : '0';
      const degType = deg.querySelector('degree-type');
      const type = degType ? degType.textContent.trim() : 'add';

      if (type === 'subtract') {
        subtracted.add(value);
        continue;
      }

      added.push({ value, alter, type });
    }

    // Detect sus4 pattern: add 4 (no alter) + subtract 3
    // dominant + this pattern = 7sus4, not 7(add4)
    let suffixOverride = null;
    const filteredAdded = [];
    for (const d of added) {
      if (d.value === '4' && d.alter === '0' && subtracted.has('3')) {
        suffixOverride = 'sus4';
      } else if (d.value === '2' && d.alter === '0' && subtracted.has('3')) {
        suffixOverride = 'sus2';
      } else {
        filteredAdded.push(d);
      }
    }

    for (const d of filteredAdded) {
      let label = '';
      // Map add4 → add11, add2 → add9 (4th/2nd don't exist as "add" in chord theory)
      const displayValue = (d.type === 'add' && d.alter === '0' && d.value === '4') ? '11'
        : (d.type === 'add' && d.alter === '0' && d.value === '2') ? '9'
        : d.value;
      if (d.alter === '1') label = '#' + displayValue;
      else if (d.alter === '-1') label = 'b' + displayValue;
      else if (d.type === 'add') label = 'add' + displayValue;
      else label = displayValue;
      parts.push(label);
    }

    const degreeStr = parts.length === 0 ? '' : '(' + parts.join(',') + ')';
    return { suffix: suffixOverride, degreeStr };
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
      let suffix = KIND_TO_SUFFIX[kindText];

      // Fallback: use text attribute of <kind> for unknown types (e.g., "other")
      if (suffix === undefined) {
        const textAttr = kind ? kind.getAttribute('text') : null;
        if (textAttr) {
          suffix = textAttr;
        } else {
          continue; // truly unknown, skip
        }
      }

      // Parse degree modifications (#9, b5, add9, etc.)
      const { suffix: susOverride, degreeStr } = parseDegrees(harmony);
      if (susOverride) suffix = suffix + susOverride;

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

      const chordName = root + suffix + degreeStr + bassStr;
      if (!seen.has(chordName)) {
        seen.add(chordName);
        chords.push(chordName);
      }
    }

    return chords;
  }

  return { parse };
})();
