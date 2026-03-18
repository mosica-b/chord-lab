// =============================================
// Sibelius PDF Parser
// Extracts song metadata and chord symbols from
// Sibelius-generated PDF sheet music files.
// =============================================
const SibeliusPDFParser = (() => {

  // Sibelius Opus Chords font → standard chord notation
  const OPUS_REPLACEMENTS = [
    // Multi-char first
    [/\u0152\u201E\u0160/g, 'maj'],  // Œ„Š → maj
    // Singles
    [/\u00A9/g, '#'],   // © → sharp
    [/\u00A8/g, 'b'],   // ¨ → flat
    [/\u2039/g, 'm'],   // ‹ → minor
    [/\u00BA/g, 'dim'],  // º → diminished
    [/\u201C/g, 'sus'],  // " → sus
  ];

  // Valid chord suffixes (from MusicTheory SUFFIX_MAP)
  const VALID_SUFFIXES = new Set([
    '', 'major', 'maj', 'M',
    'm', 'minor', 'min',
    'dim', 'o',
    'aug', '+',
    '7', 'dom7',
    'm7', 'min7', '-7',
    'maj7', 'M7',
    'dim7', 'o7',
    'm7b5',
    'sus2', 'sus4', 'sus',
    '6', 'maj6',
    'm6', 'min6',
    '9', 'm9',
    'maj9', 'M9',
    'add9',
    '7sus4',
    '11', '13', '5',
    'aug7', '+7',
  ]);

  function normalizeOpusText(text) {
    let s = text;
    for (const [pattern, replacement] of OPUS_REPLACEMENTS) {
      s = s.replace(pattern, replacement);
    }
    return s;
  }

  // Check if a font name likely represents Sibelius chord font
  function isChordFont(fontName, styles) {
    if (!fontName) return false;
    // Direct name match
    if (fontName.toLowerCase().includes('chord')) return true;
    // Check styles dict for fontFamily
    if (styles && styles[fontName]) {
      const family = styles[fontName].fontFamily || '';
      if (family.toLowerCase().includes('chord')) return true;
    }
    return false;
  }

  // Check if a font is a Bodoni metadata/section font
  function isMetadataFont(fontName, styles) {
    if (!fontName) return false;
    if (fontName.toLowerCase().includes('bodoni')) return true;
    if (styles && styles[fontName]) {
      const family = styles[fontName].fontFamily || '';
      if (family.toLowerCase().includes('bodoni')) return true;
    }
    return false;
  }

  // Clean up chord text after Opus normalization
  // e.g. D(sus4) → Dsus4
  function cleanChordText(text) {
    let s = text.trim();
    // Convert (sus4) / (sus2) degree-mod style to suffix style
    s = s.replace(/\(sus(\d)\)/, 'sus$1');
    return s;
  }

  // Try to parse a text item as a chord symbol
  function tryParseChord(rawText) {
    if (!rawText || rawText.length > 20) return null;

    // Reject if contains spaces (not a chord symbol)
    const trimmed = rawText.trim();
    if (/\s/.test(trimmed)) return null;

    const normalized = normalizeOpusText(trimmed);
    if (!normalized) return null;
    const cleaned = cleanChordText(normalized);

    // Must start with a note letter
    if (!/^[A-G]/.test(cleaned)) return null;

    // Validate via MusicTheory parser
    const parsed = MusicTheory.parseChordName(cleaned);
    if (!parsed) return null;

    // Validate root is a valid note
    const validRoots = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
    if (!validRoots.includes(parsed.root)) return null;

    // Validate suffix is a known chord type
    const suffix = parsed.suffix === 'major' ? '' : parsed.suffix;
    if (!VALID_SUFFIXES.has(suffix) && !VALID_SUFFIXES.has(suffix.toLowerCase())) return null;

    // Validate bass note of slash chord
    if (parsed.bassNote && !validRoots.includes(parsed.bassNote)) return null;

    return cleaned;
  }

  // Clean up PDF text extraction artifacts (extra spaces from multi-font spans)
  function cleanExtractedText(text) {
    return text
      .replace(/\s+/g, ' ')           // collapse multiple spaces
      .replace(/([가-힣])\s+([가-힣])/g, '$1$2')  // remove spaces between Korean chars
      .replace(/\(\s+/g, '(')         // "( " → "("
      .replace(/\s+\)/g, ')')         // " )" → ")"
      .replace(/\s+,/g, ',')          // " ," → ","
      .replace(/,\s+/g, ', ')         // normalize comma spacing
      .trim();
  }

  // Extract metadata by finding label items and collecting adjacent items on same Y
  function extractMetadataFromItems(items) {
    const meta = {
      songName: '',
      artist: '',
      composer: '',
      lyricist: '',
      key: '',
      tempo: '',
      timeSignature: '',
      description: '',
    };

    // Helper: collect all items on the same Y line (within threshold)
    function getLineText(targetY) {
      const sameY = items.filter(i => Math.abs(i.y - targetY) < 3);
      sameY.sort((a, b) => a.x - b.x);
      return sameY.map(i => i.str).join(' ');
    }

    for (const item of items) {
      const s = item.str.trim();

      // "Composed by ..." → collect full line
      if (/^Composed\s+by$/i.test(s)) {
        const line = getLineText(item.y);
        const match = line.match(/Composed\s+by\s+(.+)/i);
        if (match) meta.composer = match[1].trim();
      }

      // "Lyrics by ..." → collect full line
      if (/^Lyrics\s+by$/i.test(s)) {
        const line = getLineText(item.y);
        const match = line.match(/Lyrics\s+by\s+(.+)/i);
        if (match) meta.lyricist = match[1].trim();
      }

      // "Artist ..." → collect full line
      if (/^Artist$/i.test(s)) {
        const line = getLineText(item.y);
        const match = line.match(/Artist\s+(.+)/i);
        if (match) meta.artist = match[1].trim();
      }

      // "Original X key"
      const keyMatch = s.match(/Original\s+([A-G][#b]?\s*(?:m|minor)?)\s*key/i);
      if (keyMatch) {
        meta.key = keyMatch[1].replace(/\s+/g, '').trim();
      }

      // Tempo: "q = 120" or "♩ = 120"
      const tempoMatch = s.match(/[q♩]\s*=\s*(\d+)/);
      if (tempoMatch) {
        meta.tempo = '♩=' + tempoMatch[1];
      }
    }

    return meta;
  }

  // Build text lines from page 1 items, grouping by Y position
  function buildTextLines(items) {
    if (!items.length) return [];

    // Sort by Y (descending = top first in PDF coords), then X
    const sorted = [...items].sort((a, b) => {
      const dy = b.y - a.y; // PDF Y is bottom-up, higher Y = higher on page
      if (Math.abs(dy) > 3) return dy;
      return a.x - b.x;
    });

    // Group items into lines (similar Y within threshold)
    const lines = [];
    let currentLine = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = currentLine[0];
      const curr = sorted[i];
      // Use larger threshold (5px) to group items from different fonts on same line
      if (Math.abs(curr.y - prev.y) < 5) {
        currentLine.push(curr);
      } else {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine.map(it => it.str).join(' '));
        currentLine = [curr];
      }
    }
    if (currentLine.length) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine.map(it => it.str).join(' '));
    }

    return lines;
  }

  // Extract song title from large text on page 1 or from page footers
  function extractTitle(allItems) {
    // Strategy 1: Find the largest text on page 1 (title is usually big bold text)
    const page1 = allItems.filter(i => i.page === 1);
    let maxHeight = 0;
    let titleCandidate = '';
    for (const item of page1) {
      if (item.height > maxHeight && item.str.trim().length > 1) {
        // Skip music notation symbols
        if (/^[œŒ˙¿‰ÓeEjJ%¡\s]+$/.test(item.str)) continue;
        maxHeight = item.height;
        titleCandidate = item.str.trim();
      }
    }

    // Strategy 2: Look at page footers (pages 2+) which have "곡명 (English Title)"
    for (const item of allItems) {
      if (item.page >= 2) {
        const match = item.str.match(/^(.+?)\s*\((.+?)\)\s*$/);
        if (match && item.y < 50) { // Bottom of page in PDF coords
          return { korean: match[1].trim(), english: match[2].trim() };
        }
      }
    }

    // Collect multiple items at the same max height (title might span multiple spans)
    if (maxHeight > 20) {
      const titleItems = page1.filter(i =>
        Math.abs(i.height - maxHeight) < 2 &&
        i.str.trim().length > 0 &&
        !/^[œŒ˙¿‰ÓeEjJ%¡\s]+$/.test(i.str)
      );
      titleItems.sort((a, b) => a.x - b.x);
      // Join with space only if gap between items is significant
      let title = '';
      for (let i = 0; i < titleItems.length; i++) {
        if (i > 0) {
          const gap = titleItems[i].x - (titleItems[i-1].x + (titleItems[i-1].str.length * titleItems[i-1].height * 0.5));
          title += gap > 2 ? ' ' : '';
        }
        title += titleItems[i].str.trim();
      }
      titleCandidate = title || titleCandidate;
    }

    return { korean: titleCandidate, english: '' };
  }

  // Extract time signatures from Sibelius notation font glyphs (OpusStd)
  // Supports multiple time signature changes (e.g. "4/4 → 3/4")
  function extractTimeSignature(allItems, chordFontRefs) {
    // Find notation font items across ALL pages
    const notationItems = allItems.filter(i =>
      !chordFontRefs.has(i.fontName) &&
      !i.isMetaFont &&
      i.height >= 14 &&
      i.str.trim().length === 1
    );

    // Collect all time signature occurrences with position info
    const timeSigs = []; // { sig, page, x, y }

    // 1) Common time 'c' = 4/4, Cut time 'v' = 2/2
    for (const item of notationItems) {
      const ch = item.str.trim();
      if (ch === 'c') {
        timeSigs.push({ sig: '4/4', page: item.page, x: item.x, y: item.y });
      } else if (ch === 'v') {
        timeSigs.push({ sig: '2/2', page: item.page, x: item.x, y: item.y });
      }
    }

    // 2) Numeric time signatures: stacked digit pairs at same X (within 3px)
    const digitItems = notationItems.filter(i => /^[0-9]$/.test(i.str.trim()));
    const usedDigits = new Set();
    for (let a = 0; a < digitItems.length; a++) {
      if (usedDigits.has(a)) continue;
      for (let b = a + 1; b < digitItems.length; b++) {
        if (usedDigits.has(b)) continue;
        if (digitItems[a].page !== digitItems[b].page) continue;
        if (Math.abs(digitItems[a].x - digitItems[b].x) < 3) {
          const top = digitItems[a].y > digitItems[b].y ? digitItems[a] : digitItems[b];
          const bot = digitItems[a].y > digitItems[b].y ? digitItems[b] : digitItems[a];
          timeSigs.push({
            sig: `${top.str.trim()}/${bot.str.trim()}`,
            page: top.page, x: top.x, y: top.y,
          });
          usedDigits.add(a);
          usedDigits.add(b);
          break;
        }
      }
    }

    if (timeSigs.length === 0) return '';

    // Sort by position: page first, then Y descending (top of page), then X ascending
    timeSigs.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (Math.abs(a.y - b.y) > 20) return b.y - a.y;
      return a.x - b.x;
    });

    // Deduplicate consecutive same signatures
    const unique = [timeSigs[0].sig];
    for (let i = 1; i < timeSigs.length; i++) {
      if (timeSigs[i].sig !== unique[unique.length - 1]) {
        unique.push(timeSigs[i].sig);
      }
    }

    return unique.join(' → ');
  }

  // Main parse function
  async function parse(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js 라이브러리가 로드되지 않았습니다.');
    }

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const result = {
      songName: '',
      artist: '',
      composer: '',
      lyricist: '',
      key: '',
      tempo: '',
      timeSignature: '',
      chords: [],
      description: '',
    };

    // Collect all text items with metadata
    const allItems = [];
    let hasChordFont = false;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const styles = textContent.styles || {};

      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;

        const isChord = isChordFont(item.fontName, styles);
        if (isChord) hasChordFont = true;

        allItems.push({
          str: item.str,
          fontName: item.fontName,
          isChordFont: isChord,
          isMetaFont: isMetadataFont(item.fontName, styles),
          x: item.transform[4],
          y: item.transform[5],
          height: item.height || Math.abs(item.transform[3]),
          page: i,
        });
      }
    }

    // --- Detect chord font via reference name ---
    // pdf.js often returns generic fontFamily ("sans-serif"), so we detect
    // the chord font by finding which fontName reference is used by items
    // that are unambiguously chords (2+ chars that parse as valid chords).
    const chordFontRefs = new Set();
    for (const item of allItems) {
      const chord = tryParseChord(item.str);
      if (chord && chord.length >= 2) {
        chordFontRefs.add(item.fontName);
      }
    }

    // --- Extract chords ---
    const seenChords = new Set();
    const chordItems = chordFontRefs.size > 0
      ? allItems.filter(i => chordFontRefs.has(i.fontName))
      : allItems; // fallback: try all items

    for (const item of chordItems) {
      const chord = tryParseChord(item.str);
      if (chord && !seenChords.has(chord)) {
        seenChords.add(chord);
        result.chords.push(chord);
      }
    }

    // --- Extract metadata from page 1 ---
    const page1NonChord = allItems.filter(i =>
      i.page === 1 && !chordFontRefs.has(i.fontName)
    );
    const meta = extractMetadataFromItems(page1NonChord);

    if (meta.composer) result.composer = cleanExtractedText(meta.composer);
    if (meta.lyricist) result.lyricist = cleanExtractedText(meta.lyricist);
    if (meta.artist) result.artist = cleanExtractedText(meta.artist);
    if (meta.key) result.key = meta.key;
    if (meta.tempo) result.tempo = meta.tempo;
    if (meta.timeSignature) result.timeSignature = meta.timeSignature;

    // Fallback: extract time signature from notation font glyphs
    if (!result.timeSignature) {
      result.timeSignature = extractTimeSignature(allItems, chordFontRefs);
    }

    // --- Extract title ---
    const title = extractTitle(allItems);
    if (title.korean && title.english) {
      result.songName = title.english;
    } else if (title.korean) {
      result.songName = title.korean;
    }

    // --- Extract description (from longer text blocks on page 1) ---
    const textLines = buildTextLines(page1NonChord);
    for (const line of textLines) {
      if (line.length > 30 && /[가-힣]/.test(line) && !/^(Composed|Lyrics|Artist)/i.test(line)) {
        result.description = cleanExtractedText(line);
        break;
      }
    }

    return result;
  }

  return { parse, normalizeOpusText, tryParseChord };
})();
