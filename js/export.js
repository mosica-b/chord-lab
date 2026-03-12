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

    const infoRows = [
      { label: '아티스트', value: metadata.artist },
      { label: '앨범', value: metadata.albumName },
      { label: '작곡', value: metadata.composer },
      { label: '작사', value: metadata.lyricist },
      { label: '템포', value: metadata.tempo ? `${metadata.tempo} BPM` : '' },
      { label: '박자', value: metadata.timeSignature },
      { label: '키', value: metadata.key },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
      { label: '사용 코드', value: chords.join(', '), isChords: true },
    ].filter(r => r.value);

    const viewerBase = 'https://eunsongseo.github.io/song-chord-lab/viewer.html';

    infoRows.forEach(({ label, value, isChords }) => {
      const row = document.createElement('p');
      row.style.margin = '4px 0';
      row.style.fontSize = '14px';

      if (isChords && chords.length > 0) {
        const chordLinks = chords.map(c => {
          const url = `${viewerBase}?chords=${encodeURIComponent(c)}`;
          return `<a href="${url}" style="color:#2563eb;text-decoration:none;font-weight:500;" target="_blank">${esc(c)}</a>`;
        }).join(', ');
        const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
        row.innerHTML = `<b>${label}</b>&nbsp;&nbsp;&nbsp;${chordLinks}&nbsp;&nbsp;<a href="${allUrl}" style="color:#3b82f6;font-size:12px;text-decoration:none;" target="_blank">[전체 보기]</a>`;
      } else {
        row.innerHTML = `<b>${label}</b>&nbsp;&nbsp;&nbsp;${esc(value)}`;
      }
      infoSection.appendChild(row);
    });

    preview.appendChild(infoSection);

    // 2. Chord Notes Table
    if (chords.length > 0) {
      const notesSection = document.createElement('div');
      notesSection.style.marginBottom = '20px';

      const notesTitle = document.createElement('h3');
      notesTitle.textContent = '코드 구성음';
      notesSection.appendChild(notesTitle);

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

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['코드', '타입', '구성음'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const groups = groupChordsByFamily(chords);
      groups.forEach((group, gi) => {
        group.chords.forEach(name => {
          const row = document.createElement('tr');
          const tdName = document.createElement('td');
          tdName.style.fontWeight = '600';
          const chordLink = document.createElement('a');
          chordLink.href = `${viewerBase}?chords=${encodeURIComponent(name)}`;
          chordLink.target = '_blank';
          chordLink.style.color = '#2563eb';
          chordLink.style.textDecoration = 'none';
          chordLink.textContent = `${name} ▶`;
          tdName.appendChild(chordLink);
          row.appendChild(tdName);

          const tdType = document.createElement('td');
          tdType.style.fontSize = '13px';
          tdType.style.color = '#666';
          const parsed = MusicTheory.parseChordName(name);
          if (parsed) {
            const intervalKey = MusicTheory.SUFFIX_MAP[parsed.suffix] || MusicTheory.SUFFIX_MAP[parsed.suffix.toLowerCase()];
            tdType.textContent = typeNames[intervalKey] || parsed.suffix || '메이저';
          }
          row.appendChild(tdType);

          const tdNotes = document.createElement('td');
          const notes = MusicTheory.getChordNotesDisplay(name);
          const triad = notes.slice(0, 3);
          const extensions = notes.slice(3);
          if (extensions.length > 0) {
            tdNotes.innerHTML = `<b>${triad.map(esc).join(', ')}</b> <span style="color:#888;font-size:12px;">(+${extensions.map(esc).join(', ')})</span>`;
          } else {
            tdNotes.innerHTML = `<b>${triad.map(esc).join(', ')}</b>`;
          }
          row.appendChild(tdNotes);

          tbody.appendChild(row);
        });
        // Add separator between groups
        if (gi < groups.length - 1) {
          const sep = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = 3;
          td.style.height = '6px';
          td.style.padding = '0';
          td.style.borderLeft = 'none';
          td.style.borderRight = 'none';
          td.style.background = '#f0f4f8';
          sep.appendChild(td);
          tbody.appendChild(sep);
        }
      });
      table.appendChild(tbody);
      notesSection.appendChild(table);
      preview.appendChild(notesSection);
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

    // 5. Links (viewer + streaming)
    if (chords.length > 0 || metadata.songName || metadata.artist) {
      const linksSection = document.createElement('div');
      linksSection.style.marginTop = '20px';

      const linksTitle = document.createElement('p');
      linksTitle.style.fontWeight = '600';
      linksTitle.style.marginBottom = '8px';
      linksTitle.textContent = '관련 링크';
      linksSection.appendChild(linksTitle);

      // Viewer link
      if (chords.length > 0) {
        const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
        const p = document.createElement('p');
        p.style.margin = '4px 0';
        p.style.fontSize = '14px';
        p.innerHTML = `▶ <a href="${allUrl}" target="_blank" style="color:#2563eb;text-decoration:none;">코드 재생/표기 보기</a>`;
        linksSection.appendChild(p);
      }

      // Streaming links
      if (metadata.songName || metadata.artist) {
        const query = encodeURIComponent(`${metadata.artist || ''} ${metadata.songName || ''}`);
        const links = [
          { emoji: '🎵', text: 'Genius 가사', url: `https://genius.com/search?q=${query}` },
          { emoji: '▶️', text: 'YouTube', url: `https://www.youtube.com/results?search_query=${query}` },
          { emoji: '🎧', text: 'Spotify', url: `https://open.spotify.com/search/${query}` },
          { emoji: '🍎', text: 'Apple Music', url: `https://music.apple.com/search?term=${query}` },
        ];

        links.forEach(({ emoji, text, url }) => {
          const p = document.createElement('p');
          p.style.margin = '4px 0';
          p.style.fontSize = '14px';
          const a = document.createElement('a');
          a.href = url;
          a.textContent = `${emoji} ${text}`;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.style.color = '#2563eb';
          a.style.textDecoration = 'none';
          p.appendChild(a);
          linksSection.appendChild(p);
        });
      }

      preview.appendChild(linksSection);
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
    const viewerBase = 'https://eunsongseo.github.io/song-chord-lab/viewer.html';
    const typeNames = {
      'major': '메이저', 'minor': '마이너', 'dim': '디미니쉬', 'aug': '어그먼트',
      '7': '도미넌트 7', 'm7': '마이너 7', 'maj7': '메이저 7',
      'dim7': '디미니쉬 7', 'm7b5': '하프 디미니쉬',
      'sus2': '서스 2', 'sus4': '서스 4',
      '6': '메이저 6', 'm6': '마이너 6',
      '9': '도미넌트 9', 'add9': '애드 9', '5': '파워 코드',
    };

    let html = '';

    // Title
    if (metadata.songName) {
      html += `<font size="5"><b>${esc(metadata.songName)}</b></font><br>`;
      html += `━━━━━━━━━━━━━━━━━━━━<br><br>`;
    }

    // Song info
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
      html += `<b>${esc(label)}</b>&nbsp;&nbsp;&nbsp;${esc(value)}<br>`;
    });

    // 사용 코드 (with links)
    if (chords.length > 0) {
      const chordLinks = chords.map(c => {
        const url = `${viewerBase}?chords=${encodeURIComponent(c)}`;
        return `<a href="${url}">${esc(c)}</a>`;
      }).join(', ');
      const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
      html += `<b>사용 코드</b>&nbsp;&nbsp;&nbsp;${chordLinks}&nbsp;&nbsp;<a href="${allUrl}">[전체 보기]</a><br>`;
    }

    // Chord notes table
    if (chords.length > 0) {
      html += `<br><font size="4"><b>코드 구성음</b></font><br>`;
      html += `━━━━━━━━━━━━━━━━━━━━<br>`;
      html += `<table width="100%" border="1" cellpadding="10" cellspacing="0">`;
      html += `<tr bgcolor="#f0f0f0"><td align="center"><b>코드</b></td><td align="center"><b>타입</b></td><td align="center"><b>구성음</b></td></tr>`;
      const naverGroups = groupChordsByFamily(chords);
      naverGroups.forEach((group, gi) => {
        group.chords.forEach(name => {
          const notes = MusicTheory.getChordNotesDisplay(name);
          const chordUrl = `${viewerBase}?chords=${encodeURIComponent(name)}`;
          const parsed = MusicTheory.parseChordName(name);
          let typeName = '';
          if (parsed) {
            const intervalKey = MusicTheory.SUFFIX_MAP[parsed.suffix] || MusicTheory.SUFFIX_MAP[parsed.suffix.toLowerCase()];
            typeName = typeNames[intervalKey] || parsed.suffix || '메이저';
          }
          html += `<tr>`;
          html += `<td align="center"><b><a href="${chordUrl}">${esc(name)} ▶</a></b></td>`;
          html += `<td align="center"><font color="#888888">${esc(typeName)}</font></td>`;
          const nTriad = notes.slice(0, 3);
          const nExt = notes.slice(3);
          if (nExt.length > 0) {
            html += `<td align="center"><b>${esc(nTriad.join(', '))}</b> <font color="#888888" size="2">(+${esc(nExt.join(', '))})</font></td>`;
          } else {
            html += `<td align="center"><b>${esc(nTriad.join(', '))}</b></td>`;
          }
          html += `</tr>`;
        });
        if (gi < naverGroups.length - 1) {
          html += `<tr><td colspan="3" bgcolor="#eef2f7">&nbsp;</td></tr>`;
        }
      });
      html += `</table>`;
    }

    // Capo table
    if (capoPosition > 0 && chords.length > 0) {
      html += `<br><font size="4"><b>카포 변환표</b></font><br>`;
      html += `━━━━━━━━━━━━━━━━━━━━<br>`;
      html += `<table width="100%" border="1" cellpadding="10" cellspacing="0">`;
      html += `<tr bgcolor="#f0f0f0"><td align="center"><b>카포</b></td>`;
      chords.forEach(name => {
        html += `<td align="center"><b>${esc(name)}</b></td>`;
      });
      html += `</tr>`;

      const capoTable = MusicTheory.generateCapoTable(chords);
      [0, capoPosition].forEach(pos => {
        const entry = capoTable[pos];
        const isCurrent = pos === capoPosition;
        html += `<tr${isCurrent ? ' bgcolor="#eef4ff"' : ''}>`;
        html += `<td align="center"><b>${pos === 0 ? '원래 코드' : `카포 ${pos}프렛`}</b></td>`;
        entry.chords.forEach(chord => {
          html += `<td align="center">${isCurrent ? `<b><font color="#2563eb">${esc(chord)}</font></b>` : esc(chord)}</td>`;
        });
        html += `</tr>`;
      });
      html += `</table>`;
    }

    // Image placeholder
    if (chords.length > 0) {
      html += `<br><font color="#999999">※ 코드 표기 이미지는 아래에 첨부</font><br>`;
    }

    // Links
    if (chords.length > 0 || metadata.songName || metadata.artist) {
      html += `<br><font size="4"><b>관련 링크</b></font><br>`;
      html += `━━━━━━━━━━━━━━━━━━━━<br>`;

      if (chords.length > 0) {
        const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
        html += `▶ <a href="${allUrl}">코드 재생/표기 보기</a><br>`;
      }

      if (metadata.songName || metadata.artist) {
        const query = encodeURIComponent(`${metadata.artist || ''} ${metadata.songName || ''}`);
        html += `<a href="https://genius.com/search?q=${query}">Genius 가사</a><br>`;
        html += `<a href="https://www.youtube.com/results?search_query=${query}">YouTube</a><br>`;
        html += `<a href="https://open.spotify.com/search/${query}">Spotify</a><br>`;
        html += `<a href="https://music.apple.com/search?term=${query}">Apple Music</a><br>`;
      }
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
      { label: '사용 코드', value: chords.join(', ') },
    ].filter(r => r.value);

    infoRows.forEach(({ label, value }) => {
      text += `${label}   ${value}\n`;
    });

    if (chords.length > 0) {
      text += `\n코드 구성음\n`;
      text += `${'─'.repeat(30)}\n`;
      const textGroups = groupChordsByFamily(chords);
      textGroups.forEach((group, gi) => {
        group.chords.forEach(name => {
          const notes = MusicTheory.getChordNotesDisplay(name);
          const pTriad = notes.slice(0, 3);
          const pExt = notes.slice(3);
          if (pExt.length > 0) {
            text += `${name.padEnd(10)}${pTriad.join(', ')} (+${pExt.join(', ')})\n`;
          } else {
            text += `${name.padEnd(10)}${pTriad.join(', ')}\n`;
          }
        });
        if (gi < textGroups.length - 1) text += '\n';
      });

      const viewerBase = 'https://eunsongseo.github.io/song-chord-lab/viewer.html';
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
      const query = encodeURIComponent(`${metadata.artist || ''} ${metadata.songName || ''}`);
      text += `\n관련 링크\n`;
      text += `${'─'.repeat(30)}\n`;
      text += `Genius 가사: https://genius.com/search?q=${query}\n`;
      text += `YouTube: https://www.youtube.com/results?search_query=${query}\n`;
      text += `Spotify: https://open.spotify.com/search/${query}\n`;
      text += `Apple Music: https://music.apple.com/search?term=${query}\n`;
    }

    return text;
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
