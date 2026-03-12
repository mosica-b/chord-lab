/**
 * Export Module
 * Generates blog preview and handles copy/download functionality
 * Optimized for Naver Blog Smart Editor compatibility
 */
const Export = (() => {

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

    // 1. Song Info Header
    const infoSection = document.createElement('div');
    infoSection.style.marginBottom = '20px';

    const title = document.createElement('h3');
    title.textContent = metadata.songName || '곡명 없음';
    infoSection.appendChild(title);
    infoSection.appendChild(document.createElement('hr'));

    const infoRows = [
      { label: '아티스트', value: metadata.artist },
      { label: '앨범', value: metadata.albumName },
      { label: '작곡', value: metadata.composer },
      { label: '작사', value: metadata.lyricist },
      { label: '템포', value: metadata.tempo ? `${metadata.tempo} BPM` : '' },
      { label: '박자', value: metadata.timeSignature },
      { label: '키', value: metadata.key },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
    ].filter(r => r.value);

    const viewerBase = 'https://mosica-b.github.io/chord-lab/viewer.html';

    // Build info table (matching Naver HTML format)
    if (infoRows.length > 0) {
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.marginBottom = '12px';

      // Info rows
      const allTableRows = [...infoRows];

      // 사용 코드 row (after 키/카포)
      if (chords.length > 0) {
        const basic = chords.filter(c => isPrimaryChord(c, metadata.key));
        const advanced = chords.filter(c => !isPrimaryChord(c, metadata.key));
        const basicLinks = basic.map(c => {
          const url = `${viewerBase}?chords=${encodeURIComponent(c)}`;
          return `<a href="${url}" style="color:#2563eb;text-decoration:none;font-weight:600;" target="_blank">${esc(c)}</a>`;
        }).join(', ');
        const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
        let chordsHtml = basicLinks;
        if (advanced.length > 0) {
          chordsHtml += `&nbsp;&nbsp;...&nbsp;&nbsp;<a href="${allUrl}" style="color:#3b82f6;font-size:12px;text-decoration:none;" target="_blank">▶ 전체 코드 보기</a>`;
        }
        allTableRows.push({ label: '사용 코드', valueHtml: chordsHtml });
      }

      // 가사 row (lyrics intro + full lyrics link)
      if (metadata.songName || metadata.artist) {
        const q = `${metadata.artist || ''} ${metadata.songName || ''}`.trim();
        const query = encodeURIComponent(q);
        const lyricsQuery = encodeURIComponent(`${q} 가사`);
        const geniusLink = metadata.geniusUrl || `https://genius.com/search?q=${query}`;
        const appleMusicLink = metadata.appleMusicUrl || `https://music.apple.com/search?term=${query}`;

        let lyricsHtml = '';
        if (metadata.lyricsIntro) {
          lyricsHtml += `${esc(metadata.lyricsIntro).replace(/\n/g, '<br>')}<br>`;
        }
        lyricsHtml += `<a href="${geniusLink}" target="_blank" style="color:#2563eb;text-decoration:none;">가사전문보기</a>`;
        lyricsHtml += `<br><span style="color:#999;font-size:11px;">출처: <a href="https://genius.com" target="_blank" style="color:#999;text-decoration:none;">genius.com</a></span>`;
        allTableRows.push({ label: '가사', valueHtml: lyricsHtml });

        allTableRows.push({ label: '음원', valueHtml: `<a href="https://www.youtube.com/results?search_query=${lyricsQuery}" target="_blank" style="color:#2563eb;text-decoration:none;">YouTube</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://open.spotify.com/search/${query}" target="_blank" style="color:#2563eb;text-decoration:none;">Spotify</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="${appleMusicLink}" target="_blank" style="color:#2563eb;text-decoration:none;">Apple Music</a>` });
      }

      allTableRows.forEach((row, i) => {
        const tr = document.createElement('tr');
        if (i % 2 === 1) tr.style.background = '#f8f9fa';

        const tdLabel = document.createElement('td');
        tdLabel.style.padding = '6px 10px';
        tdLabel.style.width = '80px';
        tdLabel.style.textAlign = 'center';
        tdLabel.style.background = '#eef2f7';
        tdLabel.style.border = '1px solid #ddd';
        tdLabel.innerHTML = `<b>${esc(row.label)}</b>`;
        tr.appendChild(tdLabel);

        const tdValue = document.createElement('td');
        tdValue.style.padding = '6px 10px';
        tdValue.style.border = '1px solid #ddd';
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

      const basicChords = sortByScaleDegree(chords.filter(c => isPrimaryChord(c, metadata.key)), metadata.key);
      const advancedChords = sortByScaleDegree(chords.filter(c => !isPrimaryChord(c, metadata.key)), metadata.key);
      const hasKey = !!metadata.key;
      // Helper: build a chord table section (3-column: 코드, 타입, 구성음)
      // Roman numeral shown as small text above chord name
      function buildChordTable(title, chordList, isCompact) {
        const section = document.createElement('div');
        section.style.marginBottom = '20px';
        const h = document.createElement('h3');
        h.textContent = title;
        section.appendChild(h);

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
              const info = getScaleDegreeInfo(name, metadata.key);
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
            chordLink.href = `${viewerBase}?chords=${encodeURIComponent(name)}`;
            chordLink.target = '_blank';
            chordLink.style.color = '#2563eb';
            chordLink.style.textDecoration = 'none';
            chordLink.style.fontWeight = '600';
            chordLink.textContent = `${name} ▶`;
            tdName.appendChild(chordLink);
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
            const fmtTriad = triad.map((n, i) => `<b>${esc(n)}</b><span style="color:#999;font-size:${isCompact ? '10' : '11'}px;">(${esc(triadDeg[i] || '')})</span>`).join(', ');
            const fmtExt = ext.map((n, i) => `<b>${esc(n)}</b><span style="color:#999;font-size:${isCompact ? '10' : '11'}px;">(${esc(extDeg[i] || '')})</span>`).join(', ');
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

        // Key label
        if (hasKey) {
          const keyLabel = document.createElement('p');
          keyLabel.style.fontSize = '12px';
          keyLabel.style.color = '#999';
          keyLabel.style.margin = '6px 0 0 0';
          keyLabel.textContent = `* ${primaryKey(metadata.key)} Key 기준`;
          section.appendChild(keyLabel);
        }

        return section;
      }

      if (basicChords.length > 0) {
        preview.appendChild(document.createElement('hr'));
        preview.appendChild(buildChordTable('주요 화음', basicChords, false));
      }
      if (advancedChords.length > 0) {
        preview.appendChild(document.createElement('hr'));
        preview.appendChild(buildChordTable('심화 코드', advancedChords, true));
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

    // 4. Notation Image Placeholders
    if (chords.length > 0) {
      const placeholderSection = document.createElement('div');
      placeholderSection.style.margin = '20px 0';
      placeholderSection.style.padding = '16px';
      placeholderSection.style.background = '#f8f9fa';
      placeholderSection.style.borderRadius = '8px';
      placeholderSection.style.border = '2px dashed #ccc';
      placeholderSection.style.textAlign = 'center';
      placeholderSection.style.color = '#888';
      placeholderSection.style.fontSize = '14px';
      placeholderSection.style.lineHeight = '2';
      placeholderSection.innerHTML = `
        <p style="font-weight:600;color:#555;margin-bottom:4px;">📎 코드 표기 이미지 삽입 위치</p>
        <p>다운로드한 이미지를 여기에 첨부해주세요</p>
        <p style="font-size:12px;color:#aaa;">(오선보 · 기타 타브 · 기타 다이어그램 · 우쿨렐레 타브 · 우쿨렐레 다이어그램 · 피아노)</p>
      `;
      preview.appendChild(placeholderSection);
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
   * Renders clean HTML into a temp DOM element and copies via execCommand
   * This preserves <a> links when pasting into Naver Smart Editor
   */
  async function copyTextToClipboard(metadata, chords, capoPosition) {
    try {
      const html = generateNaverHTML(metadata, chords, capoPosition);

      // Create temp off-screen element, render HTML, select & copy
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

  /**
   * Generate Naver Smart Editor compatible HTML
   * Uses only basic HTML tags that Naver preserves: <b>, <font>, <a>, <table>, <br>
   * Avoids CSS style attributes which Naver strips
   */
  function generateNaverHTML(metadata, chords, capoPosition) {
    const viewerBase = 'https://mosica-b.github.io/chord-lab/viewer.html';
    const typeNames = {
      'major': '메이저', 'minor': '마이너', 'dim': '디미니쉬', 'aug': '어그먼트',
      '7': '도미넌트 7', 'm7': '마이너 7', 'maj7': '메이저 7',
      'dim7': '디미니쉬 7', 'm7b5': '하프 디미니쉬',
      'sus2': '서스 2', 'sus4': '서스 4',
      '6': '메이저 6', 'm6': '마이너 6',
      '9': '도미넌트 9', 'add9': '애드 9', '5': '파워 코드',
    };

    let html = '';

    // Title in blockquote
    html += `<blockquote>`;
    if (metadata.songName) {
      html += `<font size="5"><b>${esc(metadata.songName)}</b></font>`;
    }
    html += `</blockquote>`;
    html += `<hr>`;

    // Song info table (outside blockquote)
    const infoRows = [
      { label: '아티스트', value: metadata.artist },
      { label: '앨범', value: metadata.albumName },
      { label: '작곡', value: metadata.composer },
      { label: '작사', value: metadata.lyricist },
      { label: '템포', value: metadata.tempo ? `${metadata.tempo} BPM` : '' },
      { label: '박자', value: metadata.timeSignature },
      { label: '키', value: metadata.key },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
    ].filter(r => r.value);

    if (infoRows.length > 0 || chords.length > 0) {
      // Build extra rows for the info table
      const extraRows = [];

      // 사용 코드 row
      if (chords.length > 0) {
        const nBasic = chords.filter(c => isPrimaryChord(c, metadata.key));
        const nAdvanced = chords.filter(c => !isPrimaryChord(c, metadata.key));
        const basicLinks = nBasic.map(c => {
          const url = `${viewerBase}?chords=${encodeURIComponent(c)}`;
          return `<a href="${url}"><b>${esc(c)}</b></a>`;
        }).join(', ');
        const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
        let chordsValue = basicLinks;
        if (nAdvanced.length > 0) {
          chordsValue += `&nbsp;&nbsp;...&nbsp;&nbsp;<a href="${allUrl}">▶ 전체 코드 보기</a>`;
        }
        extraRows.push({ label: '사용 코드', value: chordsValue });
      }

      // 가사 row (lyrics intro + full lyrics link)
      const q = `${metadata.artist || ''} ${metadata.songName || ''}`.trim();
      const query = encodeURIComponent(q);
      const lyricsQuery = encodeURIComponent(`${q} 가사`);
      if (metadata.songName || metadata.artist) {
        const geniusLink = metadata.geniusUrl ? esc(metadata.geniusUrl) : `https://genius.com/search?q=${query}`;
        const appleMusicLink = metadata.appleMusicUrl ? esc(metadata.appleMusicUrl) : `https://music.apple.com/search?term=${query}`;

        let lyricsValue = '';
        if (metadata.lyricsIntro) {
          lyricsValue += esc(metadata.lyricsIntro).replace(/\n/g, '<br>') + '<br>';
        }
        lyricsValue += `<a href="${geniusLink}">가사전문보기</a>`;
        lyricsValue += `<br><font color="#999999" size="1">출처: <a href="https://genius.com">genius.com</a></font>`;
        extraRows.push({ label: '가사', value: lyricsValue });

        extraRows.push({ label: '음원', value: `<a href="https://www.youtube.com/results?search_query=${lyricsQuery}">YouTube</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://open.spotify.com/search/${query}">Spotify</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="${appleMusicLink}">Apple Music</a>` });
      }

      html += `<table width="100%" bgcolor="#dddddd" border="0" cellpadding="8" cellspacing="1">`;
      const allRows = [...infoRows.map(r => ({ label: r.label, value: esc(r.value) })), ...extraRows];
      allRows.forEach(({ label, value }, i) => {
        const rowBg = i % 2 === 1 ? '#f8f9fa' : '#ffffff';
        html += `<tr><td width="80" align="center" bgcolor="#eef2f7"><b>${esc(label)}</b></td><td align="center" bgcolor="${rowBg}">${value}</td></tr>`;
      });
      html += `</table>`;
    }

    // Chord notes table - split into primary and advanced, sorted by degree
    if (chords.length > 0) {
      const basicChords = sortByScaleDegree(chords.filter(c => isPrimaryChord(c, metadata.key)), metadata.key);
      const advancedChords = sortByScaleDegree(chords.filter(c => !isPrimaryChord(c, metadata.key)), metadata.key);
      const hasKey = !!metadata.key;
      // 3-column layout for all renderers

      // Helper: build Naver-compatible chord table (4-column: 도수, 코드, 타입, 구성음)
      function buildNaverTable(chordList, isCompact) {
        let t = '';
        const pad = isCompact ? '6' : '10';
        const sz = isCompact ? '2' : null;
        t += `<table width="100%" bgcolor="#dddddd" border="0" cellpadding="${pad}" cellspacing="1">`;
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
            const chordUrl = `${viewerBase}?chords=${encodeURIComponent(name)}`;
            const parsed = MusicTheory.parseChordName(name);
            let typeName = '';
            if (parsed) {
              const intervalKey = MusicTheory.SUFFIX_MAP[parsed.suffix] || MusicTheory.SUFFIX_MAP[parsed.suffix.toLowerCase()];
              typeName = typeNames[intervalKey] || parsed.suffix || '메이저';
            }
            const notes = MusicTheory.getChordNotesDisplay(name);
            const rowBg = rowIdx % 2 === 1 ? '#f8f9fa' : '#ffffff';
            t += `<tr>`;
            // 코드 column: 도수 작게 + 코드명
            let chordCell = '';
            if (hasKey) {
              const info = getScaleDegreeInfo(name, metadata.key);
              if (info) chordCell += `<font color="#888888" size="1">${esc(info.roman)}</font><br>`;
            }
            chordCell += `<b><a href="${chordUrl}">${esc(name)} ▶</a></b>`;
            t += isCompact
              ? `<td align="center" bgcolor="${rowBg}"><font size="2">${chordCell}</font></td>`
              : `<td align="center" bgcolor="${rowBg}">${chordCell}</td>`;
            // 타입 column
            t += isCompact
              ? `<td align="center" bgcolor="${rowBg}"><font color="#888888" size="2">${esc(typeName)}</font></td>`
              : `<td align="center" bgcolor="${rowBg}"><font color="#888888">${esc(typeName)}</font></td>`;
            // 구성음 column (note names only)
            const fmtNotes = notes.map(n => `<b>${esc(n)}</b>`).join(', ');
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

      // Primary chords
      if (basicChords.length > 0) {
        html += `<hr>`;
        html += `<blockquote><font size="4"><b>주요 화음</b></font>`;
        if (hasKey) html += `<br><font color="#999999" size="1">* ${esc(primaryKey(metadata.key))} Key 기준</font>`;
        html += `</blockquote>`;
        html += buildNaverTable(basicChords, false);
      }

      // Advanced chords
      if (advancedChords.length > 0) {
        html += `<hr>`;
        html += `<blockquote><font size="3"><b>심화 코드</b></font>`;
        if (hasKey) html += `<br><font color="#999999" size="1">* ${esc(primaryKey(metadata.key))} Key 기준</font>`;
        html += `</blockquote>`;
        html += buildNaverTable(advancedChords, true);
        html += `<hr>`;
      }
    }

    // Capo table
    if (capoPosition > 0 && chords.length > 0) {
      html += `<blockquote><font size="4"><b>카포 변환표</b></font></blockquote>`;
      html += `<table width="100%" bgcolor="#dddddd" border="0" cellpadding="10" cellspacing="1">`;
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

    // Image placeholder
    if (chords.length > 0) {
      html += `<br><font color="#999999">※ 코드 표기 이미지는 아래에 첨부</font><br>`;
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

    const infoRows = [
      { label: '아티스트', value: metadata.artist },
      { label: '앨범', value: metadata.albumName },
      { label: '작곡', value: metadata.composer },
      { label: '작사', value: metadata.lyricist },
      { label: '템포', value: metadata.tempo ? `${metadata.tempo} BPM` : '' },
      { label: '박자', value: metadata.timeSignature },
      { label: '키', value: metadata.key },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
    ].filter(r => r.value);

    infoRows.forEach(({ label, value }) => {
      text += `${label}   ${value}\n`;
    });

    // 사용 코드 (triads only, with advanced note)
    if (chords.length > 0) {
      const ptBasic = chords.filter(c => isPrimaryChord(c, metadata.key));
      const ptAdv = chords.filter(c => !isPrimaryChord(c, metadata.key));
      if (ptBasic.length > 0) {
        text += `사용 코드   ${ptBasic.join(', ')}`;
        if (ptAdv.length > 0) text += ` ... +심화 코드 ${ptAdv.length}개`;
        text += '\n';
      }
    }

    if (chords.length > 0) {
      const basicChords = sortByScaleDegree(chords.filter(c => isPrimaryChord(c, metadata.key)), metadata.key);
      const advancedChords = sortByScaleDegree(chords.filter(c => !isPrimaryChord(c, metadata.key)), metadata.key);
      const hasKey = !!metadata.key;

      function buildPlainTable(chordList) {
        let t = '';
        const groups = groupChordsByFamily(chordList);
        groups.forEach((group, gi) => {
          group.chords.forEach(name => {
            const notes = MusicTheory.getChordNotesDisplay(name);
            const deg = MusicTheory.getChordDegreeLabels(name);
            const notesStr = notes.map((n, i) => `${n}(${deg[i] || ''})`).join(', ');
            if (hasKey) {
              const info = getScaleDegreeInfo(name, metadata.key);
              const roman = info ? `(${info.roman})` : '';
              t += `${name} ${roman}`.trim().padEnd(16) + `${notesStr}\n`;
            } else {
              t += `${name.padEnd(16)}${notesStr}\n`;
            }
          });
          if (gi < groups.length - 1) t += '\n';
        });
        if (hasKey) {
          t += `* ${primaryKey(metadata.key)} Key 기준\n`;
        }
        return t;
      }

      if (basicChords.length > 0) {
        text += `\n주요 화음\n`;
        text += `${'─'.repeat(30)}\n`;
        text += buildPlainTable(basicChords);
      }

      if (advancedChords.length > 0) {
        text += `\n심화 코드\n`;
        text += `${'─'.repeat(30)}\n`;
        text += buildPlainTable(advancedChords);
      }

      const viewerBase = 'https://mosica-b.github.io/chord-lab/viewer.html';
      const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
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
      text += `YouTube 가사: https://www.youtube.com/results?search_query=${lyricsQuery}\n`;
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
    const intervalKey = MusicTheory.SUFFIX_MAP[parsed.suffix] || MusicTheory.SUFFIX_MAP[(parsed.suffix || '').toLowerCase()] || 'major';
    const intervals = MusicTheory.CHORD_INTERVALS[intervalKey];
    return intervals && intervals.length <= 3;
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
    const scale = 2;
    const maxWidth = 800;
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

    const scale = 2;
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

        const scale = 2;
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
  };
})();
