/**
 * Export Module
 * Generates blog preview and handles copy/download functionality
 * Optimized for Naver Blog Smart Editor compatibility
 */
const Export = (() => {

  // Blockquote overrides: populated only by explicit preset load
  const _bqOverrides = {};
  const BQ_STORAGE_KEY = 'songChordLab_bqPresets';

  /**
   * Format a raw key string into "X Maj" or "X min" label.
   * Handles: "D"→"D Maj", "Am"→"A min", "D (Maj)"→"D Maj", "Am (Min)"→"A min"
   */
  function formatKeyLabel(key) {
    if (!key) return '';
    // Strip existing (Maj)/(Min) labels and brackets
    let k = key.replace(/\s*\(Maj\)|\s*\(Min\)/gi, '').replace(/\s*\[.*?\]/g, '').trim();
    // Handle modulation arrows — format each part
    if (k.includes('→')) {
      return k.split('→').map(p => formatKeyLabel(p.trim())).join(' → ');
    }
    // Minor: ends with 'm' but not 'maj'/'M'. Root may include # or b.
    if (/^[A-G][#b]?m$/.test(k)) {
      return k.slice(0, -1) + ' min';
    }
    return k + ' Maj';
  }

  /**
   * Parse a key string and return its root chroma (0..11) or null.
   * Handles labels like "D (Maj)", "Am [abc]", "G → A".
   */
  function keyRootSemitone(key) {
    if (!key) return null;
    let k = String(key).replace(/\s*\(Maj\)|\s*\(Min\)/gi, '').replace(/\s*\[.*?\]/g, '').trim();
    if (k.includes('→')) k = k.split('→')[0].trim();
    const m = k.match(/^([A-G])([#b]?)/);
    if (!m) return null;
    const L = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let s = L[m[1]];
    if (m[2] === '#') s += 1;
    else if (m[2] === 'b') s -= 1;
    return (s + 120) % 12;
  }

  /**
   * Strip (Maj)/(Min)/brackets/arrows from a key string, preserving minor 'm'.
   */
  function stripKeyLabel(key) {
    if (!key) return '';
    let k = String(key).replace(/\s*\(Maj\)|\s*\(Min\)/gi, '').replace(/\s*\[.*?\]/g, '').trim();
    if (k.includes('→')) k = k.split('→')[0].trim();
    return k;
  }

  /**
   * Determine whether Play key and Original key refer to different tonal centers.
   */
  function hasDualKeyVersion(metadata) {
    if (!metadata || !metadata.key || !metadata.originalKey) return false;
    const a = stripKeyLabel(metadata.key);
    const b = stripKeyLabel(metadata.originalKey);
    if (!a || !b || a === b) return false;
    const ra = keyRootSemitone(a);
    const rb = keyRootSemitone(b);
    if (ra == null || rb == null) return false;
    // Minor-ness: treat 'm' suffix (not 'maj') as minor indicator
    const aMin = /m$/i.test(a) && !/maj$/i.test(a);
    const bMin = /m$/i.test(b) && !/maj$/i.test(b);
    return (ra !== rb) || (aMin !== bMin);
  }

  /**
   * Transpose a list of chord names from Play key to Original key.
   */
  function transposeChordsToOriginal(chords, metadata) {
    if (!hasDualKeyVersion(metadata)) return null;
    const playRoot = keyRootSemitone(metadata.key);
    const origRoot = keyRootSemitone(metadata.originalKey);
    if (playRoot == null || origRoot == null) return null;
    const diff = (origRoot - playRoot + 120) % 12;
    return chords.map(c => MusicTheory.transposeChord(c, diff));
  }

  /**
   * Compute the sounding key from play key + capo fret.
   * e.g., "D" + 8 → "Bb", "Am" + 8 → "Fm"
   */
  function computeCapoKey(playKey, capoFret) {
    if (!playKey || !capoFret) return '';
    // Strip (Maj)/(Min) labels for clean transposition
    let k = playKey.replace(/\s*\(Maj\)|\s*\(Min\)/gi, '').replace(/\s*\[.*?\]/g, '').trim();
    // For modulation keys, use first key
    if (k.includes('→')) k = k.split('→')[0].trim();
    const transposed = MusicTheory.transposeChord(k, capoFret);
    return transposed;
  }

  /**
   * Build formatted key display string based on score type.
   * Melody: existing format. Piano/Guitar: Play/Original key format.
   */
  function formatKeyDisplay(metadata, capoPosition) {
    const playKey = metadata.key;
    const originalKey = metadata.originalKey;
    const scoreType = (metadata.scoreType || '').toLowerCase();
    const isMelody = scoreType.includes('melody') || scoreType.includes('vocal');

    if (!playKey) return originalKey ? `Original Key: ${formatKeyLabel(originalKey)}` : '';

    // Melody: keep as-is (existing behavior)
    if (isMelody && !scoreType.includes('piano') && !scoreType.includes('guitar') && !scoreType.includes('tab')) {
      let display = `Play Key: ${formatKeyLabel(playKey)}`;
      if (originalKey && originalKey !== playKey) display += ` / Original Key: ${formatKeyLabel(originalKey)}`;
      return display;
    }

    const playLabel = formatKeyLabel(playKey);
    const origLabel = originalKey ? formatKeyLabel(originalKey) : '';

    const hasCapo = capoPosition > 0;

    if (hasCapo) {
      const capoResult = computeCapoKey(playKey, capoPosition);
      const capoLabel = formatKeyLabel(capoResult);
      let display = `Play: ${playLabel} (Capo ${capoPosition} = ${capoLabel})`;
      if (origLabel) display += ` / Original Key: ${origLabel}`;
      return display;
    } else {
      let display = `Play: ${playLabel}`;
      if (origLabel) display += ` / Original Key: ${origLabel}`;
      return display;
    }
  }

  /**
   * Extract BPM number from tempo string.
   * "♩=120"→120, "120"→120, "♩=80 → ♩=120"→120 (last number)
   */
  function extractBPM(tempoStr) {
    if (!tempoStr) return null;
    const matches = tempoStr.match(/(\d+)/g);
    if (!matches) return null;
    return parseInt(matches[matches.length - 1]);
  }

  /**
   * Build metronome link URL from tempo string and optional time signature.
   */
  function metronomeLinkUrl(tempoStr, timeSig) {
    const bpm = extractBPM(tempoStr);
    if (!bpm) return null;
    let url = `https://mosica-b.github.io/chord-lab/metronome.html?bpm=${bpm}`;
    if (timeSig) {
      const m = timeSig.match(/^(\d+)\s*\/\s*\d+$/);
      if (m) url += `&beats=${m[1]}`;
    }
    return url;
  }

  /** Replace {아티스트}, {곡명} shortcodes with actual values */
  function resolveShortcodes(html, metadata) {
    return html
      .replace(/\{아티스트\}/g, metadata.artist || '')
      .replace(/\{곡명\}/g, metadata.songName || '');
  }

  // ── Blockquote Preset CRUD ──

  /** Read current blockquote values from preview DOM (excluding non-editable key info spans) */
  function _readCurrentBqValues() {
    const preview = document.getElementById('blogPreview');
    if (!preview) return null;
    const values = {};
    preview.querySelectorAll('[data-bq]').forEach(el => {
      // Clone and remove non-editable spans (key info) before saving
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[contenteditable="false"]').forEach(s => s.remove());
      // Remove trailing <br> left behind after removing the span
      let html = clone.innerHTML.replace(/<br>\s*$/, '');
      values[el.getAttribute('data-bq')] = html;
    });
    return Object.keys(values).length ? values : null;
  }

  /** Get all saved presets from localStorage */
  function getBqPresets() {
    try { return JSON.parse(localStorage.getItem(BQ_STORAGE_KEY)) || []; }
    catch { return []; }
  }

  /** Save current blockquote edits as a named preset (max 10) */
  function saveBqPreset(name) {
    const values = _readCurrentBqValues();
    if (!values || !name) return false;
    const presets = getBqPresets();
    const idx = presets.findIndex(p => p.name === name);
    const entry = { name, values, savedAt: Date.now() };
    if (idx >= 0) presets[idx] = entry;
    else if (presets.length >= 10) return false;
    else presets.push(entry);
    localStorage.setItem(BQ_STORAGE_KEY, JSON.stringify(presets));
    return true;
  }

  /** Load a preset into _bqOverrides (caller must re-render) */
  function loadBqPreset(name) {
    Object.keys(_bqOverrides).forEach(k => delete _bqOverrides[k]);
    if (name === '__default__') {
      // Check if default preset has been overridden
      const preset = getBqPresets().find(p => p.name === '__default__');
      if (preset) Object.assign(_bqOverrides, preset.values);
    } else {
      const preset = getBqPresets().find(p => p.name === name);
      if (!preset) return false;
      Object.assign(_bqOverrides, preset.values);
    }
    return true;
  }

  /** Check if the default preset has been overridden */
  function hasDefaultOverride() {
    return getBqPresets().some(p => p.name === '__default__');
  }

  /** Delete a preset by name */
  function deleteBqPreset(name) {
    const presets = getBqPresets().filter(p => p.name !== name);
    localStorage.setItem(BQ_STORAGE_KEY, JSON.stringify(presets));
  }

  /**
   * Generate blog preview HTML (visual preview on page)
   */
  function generateBlogPreview(metadata, chords, capoPosition) {
    const preview = document.getElementById('blogPreview');
    if (!preview) return;
    preview.innerHTML = '';

    if (!metadata.songName && !chords.length) {
      preview.innerHTML = '<p class="text-sm text-gray-400">곡 정보와 코드를 입력하면 블로그 미리보기가 생성됩니다.</p>';
      return;
    }

    // Helper: make a blockquote editable with visual indicators
    // Applies preset override if loaded
    /** Sanitize HTML: keep Naver-compatible tags (font, b, i, u, br) and strip the rest */
    function sanitizeHtml(html) {
      return html
        // Remove key info (legacy presets)
        .replace(/<br>\s*(<span[^>]*>)?\s*\*\s*.*?Key 기준\s*(<\/span>)?/gi, '')
        // Convert block-level tags to <br>
        .replace(/<\/(div|p|li)>/gi, '<br>')
        .replace(/<(div|p|ul|ol|li)[^>]*>/gi, '')
        // Strip tags except Naver-compatible ones (font, b, i, u, br)
        .replace(/<(?!\/?(?:font|b|i|u|br)\b)[^>]+>/gi, '')
        // Clean up multiple <br>
        .replace(/(<br\s*\/?\s*>){3,}/gi, '<br><br>')
        .replace(/<br>\s*$/, '');
    }

    /** Build a formatting toolbar for a contenteditable blockquote */
    function buildToolbar(targetEl) {
      const bar = document.createElement('div');
      bar.style.cssText = 'display:none;gap:4px;align-items:center;padding:4px 8px;background:#f5f5f5;border-radius:4px 4px 0 0;border:1px solid #ddd;border-bottom:none;font-size:12px;flex-wrap:wrap;';

      // Font size (Naver font size 1~7)
      const sizeLabel = document.createElement('span');
      sizeLabel.textContent = '크기';
      sizeLabel.style.color = '#666';
      const sizeSelect = document.createElement('select');
      sizeSelect.style.cssText = 'padding:2px 4px;border:1px solid #ccc;border-radius:3px;font-size:11px;';
      [
        { v: '1', t: '10px' }, { v: '2', t: '13px' }, { v: '3', t: '16px (기본)' },
        { v: '4', t: '18px' }, { v: '5', t: '24px' }, { v: '6', t: '32px' }, { v: '7', t: '48px' }
      ].forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.v; opt.textContent = s.t;
        if (s.v === '3') opt.selected = true;
        sizeSelect.appendChild(opt);
      });
      sizeSelect.addEventListener('change', () => {
        targetEl.focus();
        document.execCommand('fontSize', false, sizeSelect.value);
      });

      // Font family
      const fontLabel = document.createElement('span');
      fontLabel.textContent = '폰트';
      fontLabel.style.cssText = 'color:#666;margin-left:8px;';
      const fontSelect = document.createElement('select');
      fontSelect.style.cssText = 'padding:2px 4px;border:1px solid #ccc;border-radius:3px;font-size:11px;';
      ['기본', '나눔고딕', '나눔명조', '맑은 고딕', '굴림', '돋움', 'Arial', 'Georgia', 'Verdana'].forEach(f => {
        const opt = document.createElement('option');
        opt.value = f === '기본' ? '' : f;
        opt.textContent = f;
        fontSelect.appendChild(opt);
      });
      fontSelect.addEventListener('change', () => {
        targetEl.focus();
        if (fontSelect.value) {
          document.execCommand('fontName', false, fontSelect.value);
        }
      });

      // Bold / Color
      const boldBtn = document.createElement('button');
      boldBtn.textContent = 'B';
      boldBtn.style.cssText = 'font-weight:bold;padding:2px 8px;border:1px solid #ccc;border-radius:3px;background:#fff;cursor:pointer;margin-left:8px;';
      boldBtn.addEventListener('click', (e) => { e.preventDefault(); targetEl.focus(); document.execCommand('bold'); });

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = '#000000';
      colorInput.style.cssText = 'width:24px;height:24px;border:1px solid #ccc;border-radius:3px;cursor:pointer;padding:0;margin-left:4px;';
      colorInput.addEventListener('input', () => {
        targetEl.focus();
        document.execCommand('foreColor', false, colorInput.value);
      });

      bar.append(sizeLabel, sizeSelect, fontLabel, fontSelect, boldBtn, colorInput);
      return bar;
    }

    /** Wrap editable el + toolbar in a container div. Returns the wrapper. */
    function makeEditable(el, bqKey) {
      el.contentEditable = 'true';
      el.setAttribute('data-bq', bqKey);
      if (_bqOverrides[bqKey]) {
        el.innerHTML = sanitizeHtml(_bqOverrides[bqKey]);
      }
      el.style.cursor = 'text';
      el.style.borderRadius = '0 0 4px 4px';
      el.style.padding = '8px 12px';
      el.style.transition = 'border-color 0.2s, box-shadow 0.2s';
      el.style.border = '1px dashed transparent';

      const toolbar = buildToolbar(el);
      const wrapper = document.createElement('div');
      wrapper.appendChild(toolbar);
      wrapper.appendChild(el);

      // Paste: sanitize HTML to keep font/size/bold but strip unwanted tags
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const clipHtml = (e.clipboardData || window.clipboardData).getData('text/html');
        const clipText = (e.clipboardData || window.clipboardData).getData('text/plain');
        if (clipHtml) {
          document.execCommand('insertHTML', false, sanitizeHtml(clipHtml));
        } else {
          document.execCommand('insertHTML', false, clipText.replace(/\n/g, '<br>'));
        }
      });
      el.addEventListener('mouseenter', () => { if (document.activeElement !== el) el.style.borderColor = '#ccc'; });
      el.addEventListener('mouseleave', () => { if (document.activeElement !== el) el.style.borderColor = 'transparent'; });
      el.addEventListener('focus', () => {
        el.style.borderColor = '#2563eb'; el.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.15)';
        toolbar.style.display = 'flex';
      });
      el.addEventListener('blur', (e) => {
        if (toolbar.contains(e.relatedTarget)) return;
        el.style.borderColor = 'transparent'; el.style.boxShadow = 'none';
        toolbar.style.display = 'none';
      });
      return wrapper;
    }

    // 1. Song Info Header
    const infoSection = document.createElement('div');
    infoSection.style.marginBottom = '20px';

    const title = document.createElement('blockquote');
    title.style.margin = '0 0 2px 0';
    title.innerHTML = '더 다채롭고 자세한 곡 정보는<br>아래 내용을 참고해 주세요 :)';
    const titleWrapper = makeEditable(title, 'info-title');
    infoSection.appendChild(titleWrapper);

    const tempoLink = metronomeLinkUrl(metadata.tempo, metadata.timeSignature);
    const infoRows = [
      { label: '곡명', value: metadata.songName },
      { label: '아티스트', value: metadata.artist },
      { label: '앨범', value: metadata.albumName },
      { label: '작곡', value: metadata.composer },
      { label: '작사', value: metadata.lyricist },
      metadata.tempo ? { label: '템포', valueHtml: tempoLink ? `<a href="${tempoLink}" target="_blank" style="color:#2563eb;text-decoration:none;">${esc(metadata.tempo)} BPM ▶메트로놈</a>` : `${esc(metadata.tempo)} BPM` } : null,
      { label: '박자', value: metadata.timeSignature },
      { label: '키', value: formatKeyDisplay(metadata, capoPosition) },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
    ].filter(r => r && (r.value || r.valueHtml));

    const viewerBase = 'https://mosica-b.github.io/chord-lab/viewer.html';
    const isUkuleleScore = (metadata.scoreType || '').toLowerCase().includes('ukulele');
    const cinst = capoPosition > 0 ? (isUkuleleScore ? 'ukulele' : 'guitar') : '';
    const capoParam = capoPosition > 0 ? '&capo=' + capoPosition + '&cinst=' + cinst : '';
    const defaultType = isUkuleleScore ? 'ukulele-diagram' : 'guitar-diagram';

    // Build info table (matching Naver HTML format)
    if (infoRows.length > 0) {
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.marginBottom = '12px';

      // Info rows
      const allTableRows = [...infoRows];

      // 사용 코드 row (after 키/카포) — includes derived triads from advanced chords
      if (chords.length > 0) {
        const origChords = transposeChordsToOriginal(chords, metadata);
        function buildUsedChordsHtml(srcChords, keyForSplit, capoApplies) {
          const { basicChords: infoBasic, advancedChords: infoAdvanced } = splitChordsWithTriads(srcChords, keyForSplit);
          const basicLinks = infoBasic.map(c => {
            const url = `${viewerBase}?chords=${encodeURIComponent(c)}&type=${defaultType}${capoApplies ? capoParam : ''}`;
            let label = esc(c);
            if (capoApplies && capoPosition > 0) {
              const sound = MusicTheory.transposeChord(c, capoPosition);
              label += `<span style="color:#92400e;font-size:11px;font-weight:400;">(${esc(sound)})</span>`;
            }
            return `<a href="${url}" style="color:#2563eb;text-decoration:none;font-weight:600;" target="_blank">${label}</a>`;
          }).join(', ');
          const allUrl = `${viewerBase}?chords=${encodeURIComponent(srcChords.join(','))}&type=${defaultType}${capoApplies ? capoParam : ''}`;
          let html = basicLinks;
          if (infoAdvanced.length > 0) {
            html += `&nbsp;&nbsp;...&nbsp;&nbsp;▶ <a href="${allUrl}" style="color:#8B2252;font-size:12px;text-decoration:none;" target="_blank">전체 코드 보기</a> 🎹`;
          }
          return html;
        }
        const playHtml = buildUsedChordsHtml(chords, metadata.key, true);
        if (origChords) {
          const origHtml = buildUsedChordsHtml(origChords, stripKeyLabel(metadata.originalKey), false);
          const combined =
            `<span style="color:#666;font-size:11px;">[Play Key: ${esc(formatKeyLabel(metadata.key))}]</span><br>${playHtml}` +
            `<br><span style="color:#666;font-size:11px;margin-top:4px;display:inline-block;">[Original Key: ${esc(formatKeyLabel(metadata.originalKey))}]</span><br>${origHtml}` +
            `<br><span style="color:#999;font-size:11px;">저작권 보호를 위해 코드 진행은 생략했습니다. 음원 청취나 악보 구매를 권장드려요! 🎼</span>`;
          allTableRows.push({ label: '사용 코드', valueHtml: combined });
        } else {
          allTableRows.push({ label: '사용 코드', valueHtml: playHtml + `<br><span style="color:#999;font-size:11px;">저작권 보호를 위해 코드 진행은 생략했습니다. 음원 청취나 악보 구매를 권장드려요! 🎼</span>` });
        }
      }

      // 가사 row (lyrics intro + full lyrics link)
      if (metadata.songName || metadata.artist) {
        const q = `${metadata.artist || ''} ${metadata.songName || ''}`.trim();
        const query = encodeURIComponent(q);
        const lyricsQuery = encodeURIComponent(`${q} 가사`);
        const googleLyricsUrl = `https://www.google.com/search?q=${lyricsQuery}`;
        const appleMusicLink = metadata.appleMusicUrl || `https://music.apple.com/search?term=${query}`;

        let lyricsHtml = '';
        if (metadata.lyricsIntro) {
          const fullLink = metadata.geniusUrl || googleLyricsUrl;
          const fullLinkText = metadata.geniusUrl ? '가사 전체 보기' : '가사 검색하기';
          const source = metadata.geniusUrl
            ? `출처: <a href="https://genius.com" target="_blank" style="color:#999;text-decoration:none;">genius.com</a>`
            : `<a href="${googleLyricsUrl}" target="_blank" style="color:#999;text-decoration:none;">Google 가사 검색</a>`;
          lyricsHtml += `${esc(metadata.lyricsIntro).replace(/\n/g, '<br>')}<br>`;
          lyricsHtml += `<span style="color:#999;">...</span> ▶ <a href="${fullLink}" target="_blank" style="color:#8B2252;text-decoration:none;">${fullLinkText}</a> 🌙`;
          lyricsHtml += `<br><span style="color:#999;font-size:11px;">${source}</span>`;
        } else {
          lyricsHtml += `▶ <a href="${googleLyricsUrl}" target="_blank" style="color:#8B2252;text-decoration:none;">가사 검색하기</a> 🌙`;
        }
        allTableRows.push({ label: '가사', valueHtml: lyricsHtml });

        allTableRows.push({ label: '음원', valueHtml: `<a href="https://www.youtube.com/results?search_query=${query}" target="_blank" style="color:#2563eb;text-decoration:none;">YouTube</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://open.spotify.com/search/${query}" target="_blank" style="color:#2563eb;text-decoration:none;">Spotify</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="${appleMusicLink}" target="_blank" style="color:#2563eb;text-decoration:none;">Apple Music</a>` });
      }

      allTableRows.forEach((row, i) => {
        const tr = document.createElement('tr');
        if (i % 2 === 1) tr.style.background = '#f8f9fa';

        const tdLabel = document.createElement('td');
        tdLabel.style.padding = '6px 10px';
        tdLabel.style.width = '80px';
        tdLabel.style.textAlign = 'center';
        tdLabel.style.background = '#eef2f7';
        tdLabel.style.border = '1px solid #999';
        tdLabel.innerHTML = `<b>${esc(row.label)}</b>`;
        tr.appendChild(tdLabel);

        const tdValue = document.createElement('td');
        tdValue.style.padding = '6px 10px';
        tdValue.style.border = '1px solid #999';
        tdValue.innerHTML = row.valueHtml || esc(row.value);
        tr.appendChild(tdValue);

        table.appendChild(tr);
      });

      infoSection.appendChild(table);
    }

    preview.appendChild(infoSection);

    // 2. Chord Notes Table - split into triads and advanced
    if (chords.length > 0) {
      const typeNames = {
        'major': '메이저', 'minor': '마이너', 'dim': '디미니쉬', 'aug': '어그먼트',
        '7': '도미넌트 7', 'm7': '마이너 7', 'maj7': '메이저 7',
        'dim7': '디미니쉬 7', 'm7b5': '하프 디미니쉬',
        'sus2': '서스 2', 'sus4': '서스 4',
        '6': '메이저 6', 'm6': '마이너 6',
        '9': '도미넌트 9', 'm9': '마이너 9', 'maj9': '메이저 9',
        'add9': '애드 9', '11': '11th', '13': '13th',
        '7sus4': '7서스 4', 'aug7': '어그먼트 7', '5': '파워 코드',
      };

      const { basicChords, advancedChords } = splitChordsWithTriads(chords, metadata.key);
      const hasKey = !!metadata.key;
      // Helper: build a chord table section (3-column: 코드, 타입, 구성음)
      // Roman numeral shown as small text above chord name
      function buildChordTable(songLabel, labelText, chordList, isCompact, bqKey, opts) {
        opts = opts || {};
        const keyForContext = opts.keyOverride || metadata.key;
        const capoApplies = opts.capoApplies !== false;
        const capoForTable = capoApplies ? capoPosition : 0;
        const capoParamForTable = capoApplies ? capoParam : '';
        const keyLabelText = opts.keyLabelText || (formatKeyDisplay(metadata, capoPosition) || (metadata.key + ' Key'));
        const section = document.createElement('div');
        section.style.marginBottom = '20px';
        const bq = document.createElement('blockquote');
        bq.style.margin = '0 0 2px 0';
        // Use {아티스트} - {곡명} shortcodes, editable as a whole
        bq.innerHTML = `{아티스트} - {곡명}&nbsp;&nbsp;${esc(labelText)}`;
        let bqContainer = bq;
        if (bqKey) bqContainer = makeEditable(bq, bqKey);
        // Always append key info after preset override (preset strips contenteditable=false spans)
        if (hasKey) {
          const br = document.createElement('br');
          bq.appendChild(br);
          const keySpan = document.createElement('span');
          keySpan.contentEditable = 'false';
          keySpan.style.cssText = 'color:#999;font-size:11px;';
          keySpan.textContent = `* ${keyLabelText} 기준`;
          bq.appendChild(keySpan);
        }
        section.appendChild(bqContainer);

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['코드', '타입', '구성음'].forEach(text => {
          const th = document.createElement('th');
          th.textContent = text;
          if (isCompact) th.style.fontSize = '13px';
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const groups = groupChordsByFamily(chordList);
        groups.forEach((group, gi) => {
          group.chords.forEach(name => {
            const row = document.createElement('tr');
            const fs = isCompact ? '12px' : '14px';

            // 코드 column: Roman numeral (small) + chord name
            const tdName = document.createElement('td');
            tdName.style.fontSize = fs;
            if (hasKey) {
              const info = getScaleDegreeInfo(name, keyForContext);
              if (info) {
                const romanSpan = document.createElement('span');
                romanSpan.style.fontSize = isCompact ? '10px' : '11px';
                romanSpan.style.color = '#888';
                romanSpan.style.display = 'block';
                romanSpan.textContent = info.roman;
                tdName.appendChild(romanSpan);
              }
            }
            const chordLink = document.createElement('a');
            chordLink.href = `${viewerBase}?chords=${encodeURIComponent(name)}&type=${defaultType}${capoParamForTable}`;
            chordLink.target = '_blank';
            chordLink.style.color = '#2563eb';
            chordLink.style.textDecoration = 'none';
            chordLink.style.fontWeight = '600';
            chordLink.textContent = `${name} ▶`;
            tdName.appendChild(chordLink);
            // 카포 적용 시 실음 표시
            if (capoForTable > 0) {
              const soundName = MusicTheory.transposeChord(name, capoForTable);
              const soundSpan = document.createElement('span');
              soundSpan.style.cssText = 'font-size:11px;color:#92400e;display:block;';
              soundSpan.textContent = `(실음: ${soundName})`;
              tdName.appendChild(soundSpan);
            }
            row.appendChild(tdName);

            const tdType = document.createElement('td');
            tdType.style.fontSize = isCompact ? '12px' : '13px';
            tdType.style.color = isCompact ? '#888' : '#666';
            const parsed = MusicTheory.parseChordName(name);
            if (parsed) {
              const intervalKey = MusicTheory.SUFFIX_MAP[parsed.suffix] || MusicTheory.SUFFIX_MAP[parsed.suffix.toLowerCase()];
              tdType.textContent = typeNames[intervalKey] || parsed.suffix || '메이저';
            }
            row.appendChild(tdType);

            const tdNotes = document.createElement('td');
            tdNotes.style.fontSize = isCompact ? '12px' : '14px';
            const notes = MusicTheory.getChordNotesDisplay(name);
            const degrees = MusicTheory.getChordDegreeLabels(name);
            const triad = notes.slice(0, 3);
            const triadDeg = degrees.slice(0, 3);
            const ext = notes.slice(3);
            const extDeg = degrees.slice(3);
            const fmt = MusicTheory.formatNoteDisplay;
            const fmtTriad = triad.map((n, i) => `<b>${esc(fmt(n))}</b><span style="color:#999;font-size:${isCompact ? '10' : '11'}px;">(${esc(triadDeg[i] || '')})</span>`).join(', ');
            const fmtExt = ext.map((n, i) => `<b>${esc(fmt(n))}</b><span style="color:#999;font-size:${isCompact ? '10' : '11'}px;">(${esc(extDeg[i] || '')})</span>`).join(', ');
            tdNotes.innerHTML = ext.length > 0 ? `${fmtTriad}, ${fmtExt}` : fmtTriad;
            row.appendChild(tdNotes);

            tbody.appendChild(row);
          });
          if (gi < groups.length - 1) {
            const sep = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3;
            td.style.height = isCompact ? '4px' : '6px';
            td.style.padding = '0';
            td.style.borderLeft = 'none';
            td.style.borderRight = 'none';
            td.style.background = '#f0f4f8';
            sep.appendChild(td);
            tbody.appendChild(sep);
          }
        });
        table.appendChild(tbody);
        section.appendChild(table);

        return section;
      }

      const songLabel = [metadata.artist, metadata.songName].filter(Boolean).join(' - ');
      const origChords = transposeChordsToOriginal(chords, metadata);
      let origBasic = null, origAdvanced = null;
      if (origChords) {
        const origSplit = splitChordsWithTriads(origChords, stripKeyLabel(metadata.originalKey));
        origBasic = origSplit.basicChords;
        origAdvanced = origSplit.advancedChords;
      }
      const playKeyLabel = `Play Key: ${formatKeyLabel(metadata.key)}`;
      const origKeyLabelText = metadata.originalKey ? `Original Key: ${formatKeyLabel(metadata.originalKey)}` : '';
      if (basicChords.length > 0) {
        preview.appendChild(document.createElement('hr'));
        preview.appendChild(buildChordTable(
          songLabel,
          origChords ? '주요 코드 (Play Key)' : '주요 코드',
          basicChords, false, 'primary-chords',
          origChords ? { keyOverride: metadata.key, capoApplies: true, keyLabelText: playKeyLabel } : null
        ));
        if (origChords && origBasic.length > 0) {
          preview.appendChild(buildChordTable(
            songLabel, '주요 코드 (Original Key)', origBasic, false, null,
            { keyOverride: stripKeyLabel(metadata.originalKey), capoApplies: false, keyLabelText: origKeyLabelText }
          ));
        }
      }
      if (advancedChords.length > 0) {
        preview.appendChild(document.createElement('hr'));
        preview.appendChild(buildChordTable(
          songLabel,
          origChords ? '심화 코드 (Play Key)' : '심화 코드',
          advancedChords, true, 'advanced-chords',
          origChords ? { keyOverride: metadata.key, capoApplies: true, keyLabelText: playKeyLabel } : null
        ));
        if (origChords && origAdvanced && origAdvanced.length > 0) {
          preview.appendChild(buildChordTable(
            songLabel, '심화 코드 (Original Key)', origAdvanced, true, null,
            { keyOverride: stripKeyLabel(metadata.originalKey), capoApplies: false, keyLabelText: origKeyLabelText }
          ));
        }
        preview.appendChild(document.createElement('hr'));
      }
    }

    // 3. Capo Transposition Table
    if (capoPosition > 0 && chords.length > 0) {
      const capoSection = document.createElement('div');
      capoSection.style.marginBottom = '20px';

      const capoTitle = document.createElement('h3');
      capoTitle.textContent = '카포 변환표';
      capoSection.appendChild(capoTitle);

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const thCapo = document.createElement('th');
      thCapo.textContent = '카포';
      headerRow.appendChild(thCapo);
      chords.forEach(name => {
        const th = document.createElement('th');
        th.textContent = name;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const capoTable = MusicTheory.generateCapoTable(chords);
      [0, capoPosition].forEach(pos => {
        const entry = capoTable[pos];
        const row = document.createElement('tr');
        const tdCapo = document.createElement('td');
        tdCapo.textContent = pos === 0 ? '원래 코드' : `카포 ${pos}프렛`;
        tdCapo.style.fontWeight = '600';
        row.appendChild(tdCapo);

        entry.chords.forEach(chord => {
          const td = document.createElement('td');
          td.textContent = chord;
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      capoSection.appendChild(table);
      preview.appendChild(capoSection);
    }

    // 4. Notation table
    if (chords.length > 0) {
      const notationSection = document.createElement('div');
      notationSection.style.marginBottom = '20px';

      const notationTitle = document.createElement('blockquote');
      notationTitle.style.margin = '0 0 2px 0';
      notationTitle.innerHTML = `다양한 악기로 연주할 수 있게 정리한,<br>{아티스트} - {곡명} 코드 표기`;
      const notationWrapper = makeEditable(notationTitle, 'notation');
      notationSection.appendChild(notationWrapper);

      const isUkulele = (metadata.scoreType || '').toLowerCase().includes('ukulele');
      const notationTypes = isUkulele ? [
        { key: 'ukulele-tab', label: '우쿨렐레 타브' },
        { key: 'ukulele-diagram', label: '우쿨렐레 다이어그램' },
        { key: 'staff', label: '오선표기' },
        { key: 'guitar-tab', label: '기타 타브' },
        { key: 'guitar-diagram', label: '기타 다이어그램' },
        { key: 'piano', label: '피아노' }
      ] : [
        { key: 'guitar-tab', label: '기타 타브' },
        { key: 'guitar-diagram', label: '기타 다이어그램' },
        { key: 'staff', label: '오선표기' },
        { key: 'ukulele-tab', label: '우쿨렐레 타브' },
        { key: 'ukulele-diagram', label: '우쿨렐레 다이어그램' },
        { key: 'piano', label: '피아노' }
      ];
      const chordsParam = encodeURIComponent(chords.join(','));

      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.fontSize = '14px';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      ['표기 유형', '보기'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        th.style.padding = '10px 16px';
        th.style.background = '#f5f5f5';
        th.style.border = '1px solid #999';
        th.style.fontWeight = '600';
        th.style.textAlign = 'center';
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      notationTypes.forEach(({ key, label }) => {
        const viewerUrl = `${viewerBase}?chords=${chordsParam}&type=${key}${capoParam}`;
        const row = document.createElement('tr');

        const tdLabel = document.createElement('td');
        tdLabel.textContent = label;
        tdLabel.style.padding = '10px 16px';
        tdLabel.style.border = '1px solid #999';
        tdLabel.style.textAlign = 'center';
        row.appendChild(tdLabel);

        const tdLink = document.createElement('td');
        tdLink.style.padding = '10px 16px';
        tdLink.style.border = '1px solid #999';
        tdLink.style.textAlign = 'center';
        const a = document.createElement('a');
        a.href = viewerUrl;
        a.target = '_blank';
        a.textContent = '보기 🔍';
        a.style.color = '#8B2252';
        a.style.textDecoration = 'none';
        tdLink.appendChild(a);
        row.appendChild(tdLink);

        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      notationSection.appendChild(table);
      preview.appendChild(notationSection);
    }

  }

  function createNotationSection(title) {
    const section = document.createElement('div');
    section.style.marginBottom = '16px';
    const h4 = document.createElement('h4');
    h4.textContent = title;
    h4.style.fontSize = '14px';
    h4.style.fontWeight = '600';
    h4.style.color = '#555';
    h4.style.marginBottom = '8px';
    section.appendChild(h4);
    return section;
  }

  // =========================================
  // Naver Blog Clipboard Copy (Text + Tables only)
  // =========================================

  /**
   * Copy formatted text to clipboard for Naver blog
   * Uses Clipboard API to write exact HTML (preserves table border attributes).
   * Falls back to execCommand for older browsers.
   */
  async function copyTextToClipboard(metadata, chords, capoPosition) {
    try {
      // Read edited blockquote content from preview DOM, resolve {아티스트}/{곡명} shortcodes
      const overrides = {};
      const preview = document.getElementById('blogPreview');
      if (preview) {
        preview.querySelectorAll('[data-bq]').forEach(el => {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('[contenteditable="false"]').forEach(s => s.remove());
          let html = clone.innerHTML.replace(/<br>\s*$/, '');
          overrides[el.getAttribute('data-bq')] = resolveShortcodes(html, metadata);
        });
      }
      // NFC normalize to prevent Korean jamo separation on macOS
      const html = generateNaverHTML(metadata, chords, capoPosition, overrides).normalize('NFC');

      // Clipboard API: writes exact HTML without browser re-serialization
      if (navigator.clipboard && window.ClipboardItem) {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([stripHtml(html)], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          })
        ]);
        return true;
      }

      // Fallback: execCommand (may lose some table attributes)
      const tmp = document.createElement('div');
      tmp.style.position = 'fixed';
      tmp.style.left = '-9999px';
      tmp.innerHTML = html;
      document.body.appendChild(tmp);

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(tmp);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('copy');
      selection.removeAllRanges();
      document.body.removeChild(tmp);
      return true;
    } catch (e) {
      console.error('Copy failed:', e);
      return false;
    }
  }

  /** Strip HTML tags for plain text fallback (NFC normalize to prevent Korean jamo separation) */
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || '';
    return text.normalize('NFC');
  }

  /**
   * Generate Naver Smart Editor compatible HTML
   * Uses only basic HTML tags that Naver preserves: <b>, <font>, <a>, <table>, <br>
   * Avoids CSS style attributes which Naver strips
   */
  function generateNaverHTML(metadata, chords, capoPosition, overrides) {
    overrides = overrides || {};
    const viewerBase = 'https://mosica-b.github.io/chord-lab/viewer.html';
    const isUkuleleScore = (metadata.scoreType || '').toLowerCase().includes('ukulele');
    const cinst = capoPosition > 0 ? (isUkuleleScore ? 'ukulele' : 'guitar') : '';
    const capoParam = capoPosition > 0 ? '&capo=' + capoPosition + '&cinst=' + cinst : '';
    const defaultType = isUkuleleScore ? 'ukulele-diagram' : 'guitar-diagram';
    const typeNames = {
      'major': '메이저', 'minor': '마이너', 'dim': '디미니쉬', 'aug': '어그먼트',
      '7': '도미넌트 7', 'm7': '마이너 7', 'maj7': '메이저 7',
      'dim7': '디미니쉬 7', 'm7b5': '하프 디미니쉬',
      'sus2': '서스 2', 'sus4': '서스 4',
      '6': '메이저 6', 'm6': '마이너 6',
      '9': '도미넌트 9', 'add9': '애드 9', '5': '파워 코드',
    };

    let html = '';

    // Title in blockquote (use override if user edited it)
    html += `<blockquote style="margin:0 0 2px 0;">`;
    html += overrides['info-title'] || `더 다채롭고 자세한 곡 정보는<br>아래 내용을 참고해 주세요 :)`;
    html += `</blockquote>`;

    // Song info table (outside blockquote)
    const naverTempoLink = metronomeLinkUrl(metadata.tempo, metadata.timeSignature);
    const infoRows = [
      { label: '곡명', value: metadata.songName },
      { label: '아티스트', value: metadata.artist },
      { label: '앨범', value: metadata.albumName },
      { label: '작곡', value: metadata.composer },
      { label: '작사', value: metadata.lyricist },
      metadata.tempo ? { label: '템포', value: `${metadata.tempo} BPM`, valueHtml: naverTempoLink ? `<a href="${naverTempoLink}"><font color="#2563eb">${esc(metadata.tempo)} BPM ▶메트로놈</font></a>` : null } : null,
      { label: '박자', value: metadata.timeSignature },
      { label: '키', value: formatKeyDisplay(metadata, capoPosition) },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
    ].filter(r => r && (r.value || r.valueHtml));

    if (infoRows.length > 0 || chords.length > 0) {
      // Build extra rows for the info table
      const extraRows = [];

      // 사용 코드 row — includes derived triads from advanced chords
      if (chords.length > 0) {
        const origChordsN = transposeChordsToOriginal(chords, metadata);
        function naverUsedChords(srcChords, keyForSplit, capoApplies) {
          const { basicChords: nBasic, advancedChords: nAdvanced } = splitChordsWithTriads(srcChords, keyForSplit);
          const basicLinks = nBasic.map(c => {
            const url = `${viewerBase}?chords=${encodeURIComponent(c)}&type=${defaultType}${capoApplies ? capoParam : ''}`;
            let label = `<b>${esc(c)}</b>`;
            if (capoApplies && capoPosition > 0) {
              const sound = MusicTheory.transposeChord(c, capoPosition);
              label += `<font color="#92400e" size="1">(${esc(sound)})</font>`;
            }
            return `<a href="${url}">${label}</a>`;
          }).join(', ');
          const allUrl = `${viewerBase}?chords=${encodeURIComponent(srcChords.join(','))}&type=${defaultType}${capoApplies ? capoParam : ''}`;
          let v = basicLinks;
          if (nAdvanced.length > 0) {
            v += `&nbsp;&nbsp;...&nbsp;&nbsp;▶ <a href="${allUrl}" style="color:#8B2252 !important;text-decoration:none !important;"><font color="#8B2252">전체 코드 보기</font></a> 🎹`;
          }
          return v;
        }
        const playVal = naverUsedChords(chords, metadata.key, true);
        let chordsValue;
        if (origChordsN) {
          const origVal = naverUsedChords(origChordsN, stripKeyLabel(metadata.originalKey), false);
          chordsValue =
            `<font color="#666666" size="1">[Play Key: ${esc(formatKeyLabel(metadata.key))}]</font><br>${playVal}` +
            `<br><font color="#666666" size="1">[Original Key: ${esc(formatKeyLabel(metadata.originalKey))}]</font><br>${origVal}`;
        } else {
          chordsValue = playVal;
        }
        chordsValue += `<br><font color="#999999" size="1">저작권 보호를 위해 코드 진행은 생략했습니다. 음원 청취나 악보 구매를 권장드려요! 🎼</font>`;
        extraRows.push({ label: '사용 코드', value: chordsValue });
      }

      // 가사 row (lyrics intro + full lyrics link)
      const q = `${metadata.artist || ''} ${metadata.songName || ''}`.trim();
      const query = encodeURIComponent(q);
      const lyricsQuery = encodeURIComponent(`${q} 가사`);
      if (metadata.songName || metadata.artist) {
        const googleLyricsUrl2 = `https://www.google.com/search?q=${lyricsQuery}`;
        const appleMusicLink = metadata.appleMusicUrl ? esc(metadata.appleMusicUrl) : `https://music.apple.com/search?term=${query}`;

        let lyricsValue = '';
        if (metadata.lyricsIntro) {
          const fullLink = metadata.geniusUrl ? esc(metadata.geniusUrl) : googleLyricsUrl2;
          const fullLinkText = metadata.geniusUrl ? '가사 전체 보기' : '가사 검색하기';
          const sourceHtml = metadata.geniusUrl
            ? `<font color="#999999" size="1">출처: <a href="https://genius.com">genius.com</a></font>`
            : `<font color="#999999" size="1"><a href="${googleLyricsUrl2}">Google 가사 검색</a></font>`;
          lyricsValue += esc(metadata.lyricsIntro).replace(/\n/g, '<br>') + '<br>';
          lyricsValue += `<font color="#999999">&hellip;</font> ▶ <a href="${fullLink}" style="color:#8B2252 !important;text-decoration:none !important;"><font color="#8B2252"><b>${fullLinkText}</b></font></a> 🌙`;
          lyricsValue += `<br>${sourceHtml}`;
        } else {
          lyricsValue += `▶ <a href="${googleLyricsUrl2}" style="color:#8B2252 !important;text-decoration:none !important;"><font color="#8B2252">가사 검색하기</font></a> 🌙`;
        }
        extraRows.push({ label: '가사', value: lyricsValue });

        extraRows.push({ label: '음원', value: `<a href="https://www.youtube.com/results?search_query=${query}">YouTube</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://open.spotify.com/search/${query}">Spotify</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="${appleMusicLink}">Apple Music</a>` });
      }

      html += `<table width="100%" border="1" bordercolor="#999999" cellpadding="8" cellspacing="0" style="margin:0;">`;
      const allRows = [...infoRows.map(r => ({ label: r.label, value: r.valueHtml || esc(r.value) })), ...extraRows];
      allRows.forEach(({ label, value }, i) => {
        const rowBg = i % 2 === 1 ? '#f8f9fa' : '#ffffff';
        html += `<tr><td width="80" align="center" bgcolor="#eef2f7"><b>${esc(label)}</b></td><td align="center" bgcolor="${rowBg}">${value}</td></tr>`;
      });
      html += `</table>`;
    }

    // Chord notes table - split into primary and advanced, sorted by degree
    if (chords.length > 0) {
      const { basicChords, advancedChords } = splitChordsWithTriads(chords, metadata.key);
      const hasKey = !!metadata.key;
      // 3-column layout for all renderers

      // Helper: build Naver-compatible chord table (4-column: 도수, 코드, 타입, 구성음)
      function buildNaverTable(chordList, isCompact, opts) {
        opts = opts || {};
        const keyForCtx = opts.keyOverride || metadata.key;
        const capoApplies = opts.capoApplies !== false;
        const capoForTable = capoApplies ? capoPosition : 0;
        const capoParamForTable = capoApplies ? capoParam : '';
        let t = '';
        const pad = isCompact ? '6' : '10';
        const sz = isCompact ? '2' : null;
        t += `<table width="100%" border="1" bordercolor="#999999" cellpadding="${pad}" cellspacing="0" style="margin:0;">`;
        const headerCells = ['코드', '타입', '구성음'];
        t += `<tr>`;
        headerCells.forEach(h => {
          t += sz ? `<td align="center" bgcolor="#f0f0f0"><font size="${sz}"><b>${h}</b></font></td>` : `<td align="center" bgcolor="#f0f0f0"><b>${h}</b></td>`;
        });
        t += `</tr>`;
        let rowIdx = 0;
        const groups = groupChordsByFamily(chordList);
        groups.forEach((group, gi) => {
          group.chords.forEach(name => {
            const chordUrl = `${viewerBase}?chords=${encodeURIComponent(name)}&type=${defaultType}${capoParamForTable}`;
            const parsed = MusicTheory.parseChordName(name);
            let typeName = '';
            if (parsed) {
              const intervalKey = MusicTheory.SUFFIX_MAP[parsed.suffix] || MusicTheory.SUFFIX_MAP[parsed.suffix.toLowerCase()];
              typeName = typeNames[intervalKey] || parsed.suffix || '메이저';
            }
            const notes = MusicTheory.getChordNotesDisplay(name);
            const degrees = MusicTheory.getChordDegreeLabels(name);
            const rowBg = rowIdx % 2 === 1 ? '#f8f9fa' : '#ffffff';
            t += `<tr>`;
            // 코드 column: 도수 작게 + 코드명
            let chordCell = '';
            if (hasKey) {
              const info = getScaleDegreeInfo(name, keyForCtx);
              if (info) chordCell += `<font color="#888888" size="1">${esc(info.roman)}</font><br>`;
            }
            chordCell += `<b><a href="${chordUrl}">${esc(name)} ▶</a></b>`;
            if (capoForTable > 0) {
              const soundName = MusicTheory.transposeChord(name, capoForTable);
              chordCell += `<br><font color="#92400e" size="1">(실음: ${esc(soundName)})</font>`;
            }
            t += isCompact
              ? `<td align="center" bgcolor="${rowBg}"><font size="2">${chordCell}</font></td>`
              : `<td align="center" bgcolor="${rowBg}">${chordCell}</td>`;
            // 타입 column
            t += isCompact
              ? `<td align="center" bgcolor="${rowBg}"><font color="#888888" size="2">${esc(typeName)}</font></td>`
              : `<td align="center" bgcolor="${rowBg}"><font color="#888888">${esc(typeName)}</font></td>`;
            // 구성음 column (note + degree label)
            const fmtNotes = notes.map((n, ni) => {
              const deg = degrees[ni] ? `<font color="#999999" size="1">(${esc(degrees[ni])})</font>` : '';
              return `<b>${esc(MusicTheory.formatNoteDisplay(n))}</b>${deg}`;
            }).join(', ');
            t += isCompact
              ? `<td align="center" bgcolor="${rowBg}"><font size="2">${fmtNotes}</font></td>`
              : `<td align="center" bgcolor="${rowBg}">${fmtNotes}</td>`;
            t += `</tr>`;
            rowIdx++;
          });
        });
        t += `</table>`;
        return t;
      }

      // Primary chords (entire blockquote editable via override, shortcodes resolved in overrides)
      const naverSongLabel = [metadata.artist, metadata.songName].filter(Boolean).map(s => esc(s)).join(' - ');
      const naverOrigChords = transposeChordsToOriginal(chords, metadata);
      let naverOrigBasic = null, naverOrigAdvanced = null;
      if (naverOrigChords) {
        const s = splitChordsWithTriads(naverOrigChords, stripKeyLabel(metadata.originalKey));
        naverOrigBasic = s.basicChords;
        naverOrigAdvanced = s.advancedChords;
      }
      const naverPlayKeyLabel = `Play Key: ${formatKeyLabel(metadata.key)}`;
      const naverOrigKeyLabel = metadata.originalKey ? `Original Key: ${formatKeyLabel(metadata.originalKey)}` : '';

      if (basicChords.length > 0) {
        const primaryLabel = naverOrigChords ? '주요 코드 (Play Key)' : '주요 코드';
        const primaryContent = overrides['primary-chords'] || `${naverSongLabel}&nbsp;&nbsp;${esc(primaryLabel)}`;
        html += `<blockquote style="margin:0;">${primaryContent}`;
        if (hasKey) html += `<br><font color="#999999" size="1">* ${esc(naverOrigChords ? naverPlayKeyLabel : (formatKeyDisplay(metadata, capoPosition) || metadata.key + ' Key'))} 기준</font>`;
        html += `</blockquote>`;
        html += buildNaverTable(basicChords, false);

        if (naverOrigChords && naverOrigBasic.length > 0) {
          html += `<blockquote style="margin:0;">${naverSongLabel}&nbsp;&nbsp;주요 코드 (Original Key)`;
          html += `<br><font color="#999999" size="1">* ${esc(naverOrigKeyLabel)} 기준</font>`;
          html += `</blockquote>`;
          html += buildNaverTable(naverOrigBasic, false, { keyOverride: stripKeyLabel(metadata.originalKey), capoApplies: false });
        }
      }

      // Advanced chords (entire blockquote editable via override, shortcodes resolved in overrides)
      if (advancedChords.length > 0) {
        const advancedLabel = naverOrigChords ? '심화 코드 (Play Key)' : '심화 코드';
        const advancedContent = overrides['advanced-chords'] || `${naverSongLabel}&nbsp;&nbsp;${esc(advancedLabel)}`;
        html += `<blockquote style="margin:0;">${advancedContent}`;
        if (hasKey) html += `<br><font color="#999999" size="1">* ${esc(naverOrigChords ? naverPlayKeyLabel : (formatKeyDisplay(metadata, capoPosition) || metadata.key + ' Key'))} 기준</font>`;
        html += `</blockquote>`;
        html += buildNaverTable(advancedChords, true);

        if (naverOrigChords && naverOrigAdvanced && naverOrigAdvanced.length > 0) {
          html += `<blockquote style="margin:0;">${naverSongLabel}&nbsp;&nbsp;심화 코드 (Original Key)`;
          html += `<br><font color="#999999" size="1">* ${esc(naverOrigKeyLabel)} 기준</font>`;
          html += `</blockquote>`;
          html += buildNaverTable(naverOrigAdvanced, true, { keyOverride: stripKeyLabel(metadata.originalKey), capoApplies: false });
        }
      }
    }

    // Capo table
    if (capoPosition > 0 && chords.length > 0) {
      html += `<blockquote style="margin:0;"><font size="3"><b>카포 변환표</b></font></blockquote><table width="100%" border="1" bordercolor="#999999" cellpadding="10" cellspacing="0" style="margin:0;">`;
      html += `<tr><td align="center" bgcolor="#f0f0f0"><b>카포</b></td>`;
      chords.forEach(name => {
        html += `<td align="center" bgcolor="#f0f0f0"><b>${esc(name)}</b></td>`;
      });
      html += `</tr>`;

      const capoTable = MusicTheory.generateCapoTable(chords);
      [0, capoPosition].forEach(pos => {
        const entry = capoTable[pos];
        const isCurrent = pos === capoPosition;
        const cellBg = isCurrent ? '#eef4ff' : '#ffffff';
        html += `<tr>`;
        html += `<td align="center" bgcolor="${cellBg}"><b>${pos === 0 ? '원래 코드' : `카포 ${pos}프렛`}</b></td>`;
        entry.chords.forEach(chord => {
          html += `<td align="center" bgcolor="${cellBg}">${isCurrent ? `<b><font color="#2563eb">${esc(chord)}</font></b>` : esc(chord)}</td>`;
        });
        html += `</tr>`;
      });
      html += `</table>`;
    }

    // Notation type table with viewer links
    if (chords.length > 0) {
      const naverSongDash = [metadata.artist, metadata.songName].filter(Boolean).map(s => esc(s)).join(' - ');
      html += `<blockquote style="margin:0;">`;
      if (overrides['notation']) {
        html += overrides['notation'];
      } else {
        html += `다양한 악기로 연주할 수 있게 정리한,<br>${naverSongDash} 코드 표기`;
      }
      html += `</blockquote>`;

      const chordsParam = encodeURIComponent(chords.join(','));
      const isUkuleleScore = (metadata.scoreType || '').toLowerCase().includes('ukulele');
      const notationItems = isUkuleleScore ? [
        { key: 'ukulele-tab', label: '우쿨렐레 타브' },
        { key: 'ukulele-diagram', label: '우쿨렐레 다이어그램' },
        { key: 'staff', label: '오선표기' },
        { key: 'guitar-tab', label: '기타 타브' },
        { key: 'guitar-diagram', label: '기타 다이어그램' },
        { key: 'piano', label: '피아노' }
      ] : [
        { key: 'guitar-tab', label: '기타 타브' },
        { key: 'guitar-diagram', label: '기타 다이어그램' },
        { key: 'staff', label: '오선표기' },
        { key: 'ukulele-tab', label: '우쿨렐레 타브' },
        { key: 'ukulele-diagram', label: '우쿨렐레 다이어그램' },
        { key: 'piano', label: '피아노' }
      ];
      html += `<table width="100%" border="1" bordercolor="#999999" cellpadding="10" cellspacing="0" style="margin:0;">`;
      html += `<tr><td align="center" bgcolor="#f0f0f0"><b>표기 유형</b></td><td align="center" bgcolor="#f0f0f0"><b>보기</b></td></tr>`;
      notationItems.forEach(({ key, label }) => {
        const viewerUrl = `${viewerBase}?chords=${chordsParam}&type=${key}${capoParam}`;
        html += `<tr>`;
        html += `<td align="center" bgcolor="#ffffff">${esc(label)}</td>`;
        html += `<td align="center" bgcolor="#ffffff"><a href="${viewerUrl}"><font color="#8B2252">보기 🔍</font></a></td>`;
        html += `</tr>`;
      });
      html += `</table>`;
    }


    return html;
  }

  /**
   * Generate plain text version (fallback)
   */
  function generatePlainText(metadata, chords, capoPosition) {
    let text = '';

    if (metadata.songName) {
      text += `${metadata.songName}\n`;
      text += `${'─'.repeat(30)}\n\n`;
    }

    const plainTempoLink = metronomeLinkUrl(metadata.tempo, metadata.timeSignature);
    const infoRows = [
      { label: '아티스트', value: metadata.artist },
      { label: '앨범', value: metadata.albumName },
      { label: '작곡', value: metadata.composer },
      { label: '작사', value: metadata.lyricist },
      { label: '템포', value: metadata.tempo ? (plainTempoLink ? `${metadata.tempo} BPM (메트로놈: ${plainTempoLink})` : `${metadata.tempo} BPM`) : '' },
      { label: '박자', value: metadata.timeSignature },
      { label: '키', value: formatKeyDisplay(metadata, capoPosition) },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
    ].filter(r => r.value);

    infoRows.forEach(({ label, value }) => {
      text += `${label}   ${value}\n`;
    });

    const plainOrigChords = chords.length > 0 ? transposeChordsToOriginal(chords, metadata) : null;
    const plainOrigKeyStripped = plainOrigChords ? stripKeyLabel(metadata.originalKey) : '';

    // 사용 코드 (triads only, with advanced note)
    if (chords.length > 0) {
      function usedChordsLine(srcChords, keyForSplit) {
        const ptBasic = srcChords.filter(c => isPrimaryChord(c, keyForSplit));
        const ptAdv = srcChords.filter(c => !isPrimaryChord(c, keyForSplit));
        if (ptBasic.length === 0) return '';
        let s = ptBasic.join(', ');
        if (ptAdv.length > 0) s += ` ... +심화 코드 ${ptAdv.length}개`;
        return s;
      }
      const playUsed = usedChordsLine(chords, metadata.key);
      if (playUsed) {
        if (plainOrigChords) {
          text += `사용 코드   [Play Key: ${formatKeyLabel(metadata.key)}] ${playUsed}\n`;
          const origUsed = usedChordsLine(plainOrigChords, plainOrigKeyStripped);
          if (origUsed) text += `           [Original Key: ${formatKeyLabel(metadata.originalKey)}] ${origUsed}\n`;
        } else {
          text += `사용 코드   ${playUsed}\n`;
        }
        text += `저작권 보호를 위해 코드 진행은 생략했습니다. 음원 청취나 악보 구매를 권장드려요! 🎼\n`;
      }
    }

    if (chords.length > 0) {
      const { basicChords, advancedChords } = splitChordsWithTriads(chords, metadata.key);
      const hasKey = !!metadata.key;

      function buildPlainTable(chordList, opts) {
        opts = opts || {};
        const keyCtx = opts.keyOverride || metadata.key;
        const capoApplies = opts.capoApplies !== false;
        const keyLabelText = opts.keyLabelText || (formatKeyDisplay(metadata, capoPosition) || primaryKey(metadata.key) + ' Key');
        let t = '';
        const groups = groupChordsByFamily(chordList);
        groups.forEach((group, gi) => {
          group.chords.forEach(name => {
            const notes = MusicTheory.getChordNotesDisplay(name);
            const deg = MusicTheory.getChordDegreeLabels(name);
            const notesStr = notes.map((n, i) => `${MusicTheory.formatNoteDisplay(n)}(${deg[i] || ''})`).join(', ');
            if (hasKey) {
              const info = getScaleDegreeInfo(name, keyCtx);
              const roman = info ? `(${info.roman})` : '';
              let chordLabel = `${name} ${roman}`.trim();
              if (capoApplies && capoPosition > 0) {
                const soundName = MusicTheory.transposeChord(name, capoPosition);
                chordLabel += ` → ${soundName}`;
              }
              t += chordLabel.padEnd(22) + `${notesStr}\n`;
            } else {
              t += `${name.padEnd(16)}${notesStr}\n`;
            }
          });
          if (gi < groups.length - 1) t += '\n';
        });
        if (hasKey) {
          t += `* ${keyLabelText} 기준\n`;
        }
        return t;
      }

      const viewerBase = 'https://mosica-b.github.io/chord-lab/viewer.html';
      const isUkuleleScore = (metadata.scoreType || '').toLowerCase().includes('ukulele');
      const cinst = capoPosition > 0 ? (isUkuleleScore ? 'ukulele' : 'guitar') : '';
      const capoParam = capoPosition > 0 ? '&capo=' + capoPosition + '&cinst=' + cinst : '';
      const defaultType = isUkuleleScore ? 'ukulele-diagram' : 'guitar-diagram';

      let origBasicP = null, origAdvancedP = null;
      if (plainOrigChords) {
        const s = splitChordsWithTriads(plainOrigChords, plainOrigKeyStripped);
        origBasicP = s.basicChords;
        origAdvancedP = s.advancedChords;
      }
      const playKeyLabelP = `Play Key: ${formatKeyLabel(metadata.key)}`;
      const origKeyLabelP = plainOrigChords ? `Original Key: ${formatKeyLabel(metadata.originalKey)}` : '';

      if (basicChords.length > 0) {
        text += `\n주요 코드${plainOrigChords ? ' (Play Key)' : ''}\n`;
        text += `${'─'.repeat(30)}\n`;
        text += buildPlainTable(basicChords, plainOrigChords ? { keyLabelText: playKeyLabelP } : null);
        if (plainOrigChords && origBasicP.length > 0) {
          text += `\n주요 코드 (Original Key)\n`;
          text += `${'─'.repeat(30)}\n`;
          text += buildPlainTable(origBasicP, { keyOverride: plainOrigKeyStripped, capoApplies: false, keyLabelText: origKeyLabelP });
        }
      }

      if (advancedChords.length > 0) {
        text += `\n심화 코드${plainOrigChords ? ' (Play Key)' : ''}\n`;
        text += `${'─'.repeat(30)}\n`;
        text += buildPlainTable(advancedChords, plainOrigChords ? { keyLabelText: playKeyLabelP } : null);
        if (plainOrigChords && origAdvancedP && origAdvancedP.length > 0) {
          text += `\n심화 코드 (Original Key)\n`;
          text += `${'─'.repeat(30)}\n`;
          text += buildPlainTable(origAdvancedP, { keyOverride: plainOrigKeyStripped, capoApplies: false, keyLabelText: origKeyLabelP });
        }
      }

      const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}&type=${defaultType}${capoParam}`;
      text += `\n▶ 코드 재생/표기 보기: ${allUrl}\n`;
    }

    if (capoPosition > 0 && chords.length > 0) {
      text += `\n카포 변환표\n`;
      text += `${'─'.repeat(30)}\n`;
      const capoTable = MusicTheory.generateCapoTable(chords);
      text += `원래 코드    ${capoTable[0].chords.join('  ')}\n`;
      text += `카포 ${capoPosition}프렛    ${capoTable[capoPosition].chords.join('  ')}\n`;
    }

    if (metadata.songName || metadata.artist) {
      const q = `${metadata.artist || ''} ${metadata.songName || ''}`.trim();
      const query = encodeURIComponent(q);
      const lyricsQuery = encodeURIComponent(`${q} 가사`);
      const appleMusicUrl = metadata.appleMusicUrl || `https://music.apple.com/search?term=${query}`;
      text += `\n관련 링크\n`;
      text += `${'─'.repeat(30)}\n`;
      text += `Genius 가사: ${metadata.geniusUrl || `https://genius.com/search?q=${query}`}\n`;
      text += `YouTube: https://www.youtube.com/results?search_query=${query}\n`;
      text += `Spotify: https://open.spotify.com/search/${query}\n`;
      text += `Apple Music: ${appleMusicUrl}\n`;
    }

    return text;
  }

  /**
   * Get scale degree info for a chord relative to a key
   * e.g., "E7" in key "A" → { semitones: 7, roman: "V7" }
   */
  /**
   * Extract the primary (first) key from a key string that may contain modulations
   * e.g., "A → C → A" → "A", "Bbm" → "Bbm"
   */
  function primaryKey(key) {
    if (!key) return '';
    return key.split('→')[0].trim();
  }

  function getScaleDegreeInfo(chordName, key) {
    if (!key) return null;
    const pk = primaryKey(key);
    if (!pk) return null;
    const parsed = MusicTheory.parseChordName(chordName);
    if (!parsed) return null;

    const keyRoot = pk.endsWith('m') ? pk.slice(0, -1) : pk;
    const keyIdx = MusicTheory.noteIndex(keyRoot);
    const chordIdx = MusicTheory.noteIndex(parsed.root);
    if (keyIdx < 0 || chordIdx < 0) return null;

    const semitones = ((chordIdx - keyIdx) % 12 + 12) % 12;

    const suffix = parsed.suffix === 'major' ? '' : (parsed.suffix || '');
    const intervalKey = MusicTheory.SUFFIX_MAP[suffix] || MusicTheory.SUFFIX_MAP[suffix.toLowerCase()] || 'major';

    const minorQualities = new Set(['minor', 'm7', 'm6', 'dim', 'dim7', 'm7b5', 'm9']);
    const isMinor = minorQualities.has(intervalKey);

    const romanUpper = ['I','♭II','II','♭III','III','IV','♯IV','V','♭VI','VI','♭VII','VII'];
    const romanLower = ['i','♭ii','ii','♭iii','iii','iv','♯iv','v','♭vi','vi','♭vii','vii'];

    let roman = isMinor ? romanLower[semitones] : romanUpper[semitones];

    if (intervalKey === 'dim' || intervalKey === 'dim7') roman += '°';
    else if (intervalKey === 'm7b5') roman += 'ø';
    else if (intervalKey === 'aug' || intervalKey === 'aug7') roman += '+';

    const extMap = {
      '7': '7', 'm7': '7', 'maj7': 'M7', 'dim7': '7', 'm7b5': '7',
      '6': '6', 'm6': '6', '9': '9', 'm9': '9', 'maj9': 'M9',
      'add9': 'add9', '7sus4': '7sus4', '11': '11', '13': '13',
      'aug7': '7', 'sus2': 'sus2', 'sus4': 'sus4', '5': '5',
    };
    if (extMap[intervalKey]) roman += extMap[intervalKey];

    return { semitones, roman };
  }

  /**
   * Sort chords by scale degree (ascending from 1 to 7)
   */
  function sortByScaleDegree(chords, key) {
    if (!key) return chords;
    return [...chords].sort((a, b) => {
      const aInfo = getScaleDegreeInfo(a, key);
      const bInfo = getScaleDegreeInfo(b, key);
      if (!aInfo || !bInfo) return 0;
      return aInfo.semitones - bInfo.semitones;
    });
  }

  /**
   * Check if a chord is a basic triad (3 notes or fewer)
   */
  function isTriadChord(name) {
    const parsed = MusicTheory.parseChordName(name);
    if (!parsed) return false;
    // Degree modifications like (add9), (#9) make it non-basic
    if (parsed.degreeMods) return false;
    const intervalKey = MusicTheory.SUFFIX_MAP[parsed.suffix] || MusicTheory.SUFFIX_MAP[(parsed.suffix || '').toLowerCase()] || 'major';
    const intervals = MusicTheory.CHORD_INTERVALS[intervalKey];
    return intervals && intervals.length <= 3;
  }

  /**
   * Derive triad name from an extended chord (7th, 9th, etc.)
   * e.g., Bm7→Bm, C#m7→C#m, Dmaj7→D, Fdim7→Fdim, Am7b5→Adim, G9→G
   * Returns null if already a triad or cannot derive.
   */
  function getTriadFromChord(name) {
    const parsed = MusicTheory.parseChordName(name);
    if (!parsed) return null;
    const suffix = parsed.suffix || '';
    const intervalKey = MusicTheory.SUFFIX_MAP[suffix] || MusicTheory.SUFFIX_MAP[suffix.toLowerCase()];
    if (!intervalKey) return null;
    // Map extended chord types → triad suffix
    const triadMap = {
      '7': '', 'm7': 'm', 'maj7': '', 'dim7': 'dim', 'm7b5': 'dim',
      '9': '', 'm9': 'm', 'maj9': '',
      '11': '', '13': '',
      '6': '', 'm6': 'm',
      'aug7': 'aug',
      '7sus4': 'sus4',
    };
    // For chords with degree mods like (add9), derive triad from base suffix
    if (parsed.degreeMods) {
      const baseTriadMap = {
        'major': '', 'minor': 'm', 'dim': 'dim', 'aug': 'aug', 'sus4': 'sus4', 'sus2': 'sus2',
      };
      const triadSuffix = baseTriadMap[intervalKey];
      if (triadSuffix === undefined) {
        // Extended suffix with degreeMods — use triadMap if available
        if (!(intervalKey in triadMap)) return null;
        const bass = parsed.bassNote ? `/${parsed.bassNote}` : '';
        return parsed.root + triadMap[intervalKey] + bass;
      }
      const bass = parsed.bassNote ? `/${parsed.bassNote}` : '';
      return parsed.root + triadSuffix + bass;
    }
    if (!(intervalKey in triadMap)) return null;
    const triadSuffix = triadMap[intervalKey];
    const bass = parsed.bassNote ? `/${parsed.bassNote}` : '';
    return parsed.root + triadSuffix + bass;
  }

  /**
   * Get the dominant 7th (V7) chord name for a given key
   * e.g., key "A" → "E7", key "Am" → "E7", key "Eb" → "Bb7"
   */
  function getDominant7th(key) {
    if (!key) return null;
    const pk = primaryKey(key);
    if (!pk) return null;
    const root = pk.endsWith('m') ? pk.slice(0, -1) : pk;
    const rootIdx = MusicTheory.noteIndex(root);
    if (rootIdx < 0) return null;
    const vIdx = (rootIdx + 7) % 12;
    let vRoot = MusicTheory.NOTE_NAMES[vIdx];
    if (root.includes('b') && MusicTheory.ENHARMONIC[vRoot]) {
      vRoot = MusicTheory.ENHARMONIC[vRoot];
    }
    return vRoot + '7';
  }

  /**
   * Check if a chord is a primary chord (triad or V7 of the key)
   */
  function isPrimaryChord(name, key) {
    if (isTriadChord(name)) return true;
    const v7 = getDominant7th(key);
    return v7 && name === v7;
  }

  /**
   * Split chords into primary (triads + V7) and advanced,
   * then derive triads from advanced chords and add to primary if missing.
   * Returns { basicChords, advancedChords } both sorted by scale degree.
   */
  function splitChordsWithTriads(chords, key) {
    const basicSet = new Set(chords.filter(c => isPrimaryChord(c, key)));
    const advancedList = chords.filter(c => !isPrimaryChord(c, key));

    // Derive triads from advanced chords and add to primary
    advancedList.forEach(name => {
      const triad = getTriadFromChord(name);
      if (triad && !basicSet.has(triad)) {
        basicSet.add(triad);
      }
    });

    const basicChords = sortByScaleDegree([...basicSet], key);
    const advancedChords = sortByScaleDegree(advancedList, key);
    return { basicChords, advancedChords };
  }

  /**
   * Group chords by root note (e.g., Dm, Dm7, Dm9 → "D minor" family)
   * Returns array of { root, chords: [...] } in original order
   */
  function groupChordsByFamily(chords) {
    const groups = [];
    const seen = new Map(); // root → group index

    chords.forEach(name => {
      const parsed = MusicTheory.parseChordName(name);
      if (!parsed) return;
      // Family key = root + base quality (major/minor)
      const suffix = parsed.suffix || 'major';
      const intervalKey = MusicTheory.SUFFIX_MAP[suffix] || MusicTheory.SUFFIX_MAP[suffix.toLowerCase()] || 'major';
      const isMinor = intervalKey.startsWith('m') && intervalKey !== 'major' && intervalKey !== 'maj7' && intervalKey !== 'maj9';
      const familyKey = parsed.root + (isMinor ? 'm' : '');

      if (seen.has(familyKey)) {
        groups[seen.get(familyKey)].chords.push(name);
      } else {
        seen.set(familyKey, groups.length);
        groups.push({ familyKey, chords: [name] });
      }
    });

    return groups;
  }

  /** HTML escape */
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // =========================================
  // Image Download - All-in-One
  // =========================================

  /**
   * Download ALL notation types as a single combined PNG image
   * Layout: vertical stack with section titles
   */
  async function downloadAllAsOneImage(chords, songName) {
    const scale = 3;
    const maxWidth = 1200;
    const padding = 30;
    const sectionGap = 25;
    const titleHeight = 35;
    const svgGap = 10;

    const sections = [
      { id: 'tab-staff', title: '오선표기' },
      { id: 'tab-guitar-tab', title: '기타 타브' },
      { id: 'tab-guitar-diagram', title: '기타 코드 다이어그램' },
      { id: 'tab-ukulele-tab', title: '우쿨렐레 타브' },
      { id: 'tab-ukulele-diagram', title: '우쿨렐레 코드 다이어그램' },
      { id: 'tab-piano', title: '피아노 코드' },
    ];

    // Collect all section data (SVGs + dimensions)
    const sectionData = [];
    for (const { id, title } of sections) {
      const container = document.getElementById(id);
      if (!container) continue;
      const svgs = container.querySelectorAll('svg');
      if (svgs.length === 0) continue;

      const dims = Array.from(svgs).map(svg => ({
        w: parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 200,
        h: parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height || 150,
      }));

      // Check if SVGs are wide (staff/tab) or narrow (diagrams/piano)
      const isWide = dims.some(d => d.w > 300);

      let rowW, rowH;
      if (isWide) {
        // Single SVG takes full width
        rowW = dims[0].w;
        rowH = dims[0].h;
      } else {
        // Arrange horizontally
        rowW = dims.reduce((sum, d) => sum + d.w + svgGap, 0) - svgGap;
        rowH = Math.max(...dims.map(d => d.h));
      }

      sectionData.push({ title, svgs: Array.from(svgs), dims, isWide, rowW, rowH });
    }

    if (sectionData.length === 0) return;

    // Calculate total canvas size
    const contentWidth = Math.max(maxWidth, ...sectionData.map(s => s.rowW + padding * 2));
    let totalHeight = padding; // top padding

    sectionData.forEach((section, i) => {
      totalHeight += titleHeight; // section title
      totalHeight += section.rowH; // SVG content
      if (i < sectionData.length - 1) totalHeight += sectionGap; // gap between sections
    });
    totalHeight += padding; // bottom padding

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = contentWidth * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, contentWidth, totalHeight);

    // Draw each section
    let y = padding;

    for (const section of sectionData) {
      // Draw section title
      ctx.fillStyle = '#333';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(section.title, padding, y + 20);

      // Draw title underline
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding, y + 28);
      ctx.lineTo(padding + ctx.measureText(section.title).width + 10, y + 28);
      ctx.stroke();

      y += titleHeight;

      // Draw SVGs
      let x = padding;
      for (let i = 0; i < section.svgs.length; i++) {
        const svg = section.svgs[i];
        const dim = section.dims[i];

        const img = await svgToImage(svg);
        if (img) {
          ctx.drawImage(img, x, y, dim.w, dim.h);
        }

        if (section.isWide) {
          // Only draw first SVG for wide types (staff/tab is a single SVG)
          break;
        } else {
          x += dim.w + svgGap;
        }
      }

      y += section.rowH + sectionGap;
    }

    // Download
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      const filename = songName ? `${songName}-코드표기.png` : '코드표기.png';
      downloadBlob(blob, filename);
    }
  }

  /**
   * Download individual notation images (fallback)
   */
  async function downloadImages(chords) {
    const types = [
      { id: 'tab-staff', name: '오선표기' },
      { id: 'tab-guitar-tab', name: '기타타브' },
      { id: 'tab-guitar-diagram', name: '기타다이어그램' },
      { id: 'tab-ukulele-tab', name: '우쿨렐레타브' },
      { id: 'tab-ukulele-diagram', name: '우쿨렐레다이어그램' },
      { id: 'tab-piano', name: '피아노' },
    ];

    for (const { id, name } of types) {
      const container = document.getElementById(id);
      if (!container) continue;
      const svgs = container.querySelectorAll('svg');
      if (svgs.length === 0) continue;

      for (let i = 0; i < svgs.length; i++) {
        try {
          await downloadSingleSVG(svgs[i], `${name}-${i + 1}.png`);
        } catch (e) {
          console.warn(`Download failed: ${name}-${i + 1}`, e);
        }
      }
    }
  }

  /**
   * Convert a single SVG element to an Image
   */
  function svgToImage(svg) {
    return new Promise((resolve) => {
      try {
        const clone = svg.cloneNode(true);
        // Ensure SVG has xmlns
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const svgData = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function downloadSingleSVG(svg, filename) {
    const img = await svgToImage(svg);
    if (!img) return;

    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = (img.width || 400) * scale;
    canvas.height = (img.height || 200) * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =========================================
  // Legacy functions (kept for compatibility)
  // =========================================

  function selectAllPreview() {
    const preview = document.getElementById('blogPreview');
    if (!preview) return;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(preview);
    selection.removeAllRanges();
    selection.addRange(range);

    preview.classList.add('selection-highlight');
    setTimeout(() => preview.classList.remove('selection-highlight'), 2000);
  }

  async function convertSVGsToImages(container) {
    const svgs = container.querySelectorAll('svg');
    for (const svg of svgs) {
      try {
        const img = await svgToImage(svg);
        if (!img) continue;

        const scale = 3;
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/png');
        const imgEl = document.createElement('img');
        imgEl.src = dataUrl;
        imgEl.style.maxWidth = '100%';
        imgEl.alt = 'chord notation';
        svg.parentNode.replaceChild(imgEl, svg);
      } catch (e) {
        console.warn('Failed to convert SVG:', e);
      }
    }
  }

  return {
    generateBlogPreview,
    copyTextToClipboard,
    downloadAllAsOneImage,
    selectAllPreview,
    convertSVGsToImages,
    downloadImages,
    getBqPresets,
    saveBqPreset,
    loadBqPreset,
    deleteBqPreset,
    hasDefaultOverride,
  };
})();
