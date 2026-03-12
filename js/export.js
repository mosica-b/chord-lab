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
      { label: '템포', value: metadata.tempo ? `${metadata.tempo} BPM` : '' },
      { label: '키', value: metadata.key },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
      { label: '사용 코드', value: chords.join(', '), isChords: true },
    ].filter(r => r.value);

    infoRows.forEach(({ label, value }) => {
      const row = document.createElement('p');
      row.style.margin = '4px 0';
      row.style.fontSize = '14px';
      row.innerHTML = `<b>${label}</b>&nbsp;&nbsp;&nbsp;${esc(value)}`;
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

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['코드', '구성음'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      chords.forEach(name => {
        const row = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.style.fontWeight = '600';
        tdName.textContent = name;
        row.appendChild(tdName);

        const tdNotes = document.createElement('td');
        const notes = MusicTheory.getChordNotesDisplay(name);
        tdNotes.textContent = notes.join(', ');
        row.appendChild(tdNotes);

        tbody.appendChild(row);
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

    // 4. Notation Images
    if (chords.length > 0) {
      const notationTypes = [
        { title: '오선표기', render: Renderers.renderStaffNotation },
        { title: '기타 타브', render: Renderers.renderGuitarTab },
        { title: '기타 코드 다이어그램', render: Renderers.renderGuitarDiagrams },
        { title: '우쿨렐레 타브', render: Renderers.renderUkuleleTab },
        { title: '우쿨렐레 코드 다이어그램', render: Renderers.renderUkuleleDiagrams },
        { title: '피아노 코드', render: Renderers.renderPianoKeyboards },
      ];

      notationTypes.forEach(({ title, render }) => {
        const section = createNotationSection(title);
        const container = document.createElement('div');
        render(container, chords);
        section.appendChild(container);
        preview.appendChild(section);
      });
    }

    // 5. Links
    if (metadata.songName || metadata.artist) {
      const linksSection = document.createElement('div');
      linksSection.className = 'links-section';
      linksSection.style.marginTop = '20px';

      const linksTitle = document.createElement('p');
      linksTitle.style.fontWeight = '600';
      linksTitle.style.marginBottom = '8px';
      linksTitle.textContent = '관련 링크';
      linksSection.appendChild(linksTitle);

      const query = encodeURIComponent(`${metadata.artist || ''} ${metadata.songName || ''}`);

      const links = [
        { text: 'Genius 가사', url: `https://genius.com/search?q=${query}` },
        { text: 'YouTube', url: `https://www.youtube.com/results?search_query=${query}` },
        { text: 'Spotify', url: `https://open.spotify.com/search/${query}` },
        { text: 'Apple Music', url: `https://music.apple.com/search?term=${query}` },
      ];

      links.forEach(({ text, url }) => {
        const a = document.createElement('a');
        a.href = url;
        a.textContent = text;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        linksSection.appendChild(a);
      });

      preview.appendChild(linksSection);
    }

    // 6. Viewer link (single clean URL)
    if (chords.length > 0) {
      const viewerBase = 'https://eunsongseo.github.io/song-chord-lab/viewer.html';
      const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
      const viewerP = document.createElement('p');
      viewerP.style.margin = '15px 0';
      viewerP.style.fontSize = '14px';
      viewerP.innerHTML = `▶ 코드 재생/표기 보기: <a href="${allUrl}" target="_blank" style="color:#2563eb;text-decoration:none;">${allUrl}</a>`;
      preview.appendChild(viewerP);
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
   * Uses Clipboard API with text/html for rich formatting
   * Images are NOT included - they must be uploaded separately
   */
  async function copyTextToClipboard(metadata, chords, capoPosition) {
    const html = generateNaverHTML(metadata, chords, capoPosition);
    const plainText = generatePlainText(metadata, chords, capoPosition);

    try {
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return true;
    } catch (e) {
      console.error('Clipboard API failed:', e);
      // Fallback: copy plain text
      try {
        await navigator.clipboard.writeText(plainText);
        return true;
      } catch (e2) {
        console.error('Plain text copy also failed:', e2);
        return false;
      }
    }
  }

  /**
   * Generate Naver-compatible HTML (inline styles, no images, simple tags)
   */
  function generateNaverHTML(metadata, chords, capoPosition) {
    let html = '<div style="font-family:\'Noto Sans KR\',\'Malgun Gothic\',sans-serif;line-height:1.8;">';

    // Title
    if (metadata.songName) {
      html += `<p style="font-size:24px;font-weight:bold;margin:0 0 5px 0;">${esc(metadata.songName)}</p>`;
      html += `<hr style="border:none;border-top:2px solid #333;margin:8px 0 15px 0;">`;
    }

    // Song info
    const infoRows = [
      { label: '아티스트', value: metadata.artist },
      { label: '앨범', value: metadata.albumName },
      { label: '템포', value: metadata.tempo ? `${metadata.tempo} BPM` : '' },
      { label: '키', value: metadata.key },
      { label: '카포', value: capoPosition > 0 ? `${capoPosition}프렛` : '' },
      { label: '사용 코드', value: chords.join(', '), isChords: true },
    ].filter(r => r.value);

    infoRows.forEach(({ label, value }) => {
      html += `<p style="margin:4px 0;font-size:14px;"><b>${esc(label)}</b>&nbsp;&nbsp;&nbsp;${esc(value)}</p>`;
    });

    // Chord notes table
    if (chords.length > 0) {
      html += `<br>`;
      html += `<p style="font-size:18px;font-weight:bold;margin:15px 0 5px 0;">코드 구성음</p>`;
      html += `<hr style="border:none;border-top:2px solid #4a90d9;margin:5px 0 10px 0;">`;
      html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;text-align:center;font-size:14px;">`;
      html += `<thead><tr style="background:#f5f5f5;">`;
      html += `<th style="border:1px solid #ddd;padding:8px;font-weight:bold;">코드</th>`;
      html += `<th style="border:1px solid #ddd;padding:8px;font-weight:bold;">구성음</th>`;
      html += `</tr></thead><tbody>`;
      chords.forEach(name => {
        const notes = MusicTheory.getChordNotesDisplay(name);
        html += `<tr>`;
        html += `<td style="border:1px solid #ddd;padding:8px;font-weight:bold;">${esc(name)}</td>`;
        html += `<td style="border:1px solid #ddd;padding:8px;">${esc(notes.join(', '))}</td>`;
        html += `</tr>`;
      });
      html += `</tbody></table>`;
    }

    // Capo table
    if (capoPosition > 0 && chords.length > 0) {
      html += `<br>`;
      html += `<p style="font-size:18px;font-weight:bold;margin:15px 0 5px 0;">카포 변환표</p>`;
      html += `<hr style="border:none;border-top:2px solid #4a90d9;margin:5px 0 10px 0;">`;
      html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;text-align:center;font-size:14px;">`;
      html += `<thead><tr style="background:#f5f5f5;">`;
      html += `<th style="border:1px solid #ddd;padding:8px;font-weight:bold;">카포</th>`;
      chords.forEach(name => {
        html += `<th style="border:1px solid #ddd;padding:8px;font-weight:bold;">${esc(name)}</th>`;
      });
      html += `</tr></thead><tbody>`;

      const capoTable = MusicTheory.generateCapoTable(chords);
      [0, capoPosition].forEach(pos => {
        const entry = capoTable[pos];
        const isCurrent = pos === capoPosition;
        const bgStyle = isCurrent ? 'background:#eef4ff;' : '';
        html += `<tr>`;
        html += `<td style="border:1px solid #ddd;padding:8px;font-weight:bold;${bgStyle}">${pos === 0 ? '원래 코드' : `카포 ${pos}프렛`}</td>`;
        entry.chords.forEach(chord => {
          html += `<td style="border:1px solid #ddd;padding:8px;${bgStyle}${isCurrent ? 'font-weight:bold;color:#2563eb;' : ''}">${esc(chord)}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table>`;
    }

    // Image placeholder note
    if (chords.length > 0) {
      html += `<br>`;
      html += `<p style="color:#999;font-size:13px;margin:15px 0;font-style:italic;">※ 코드 표기 이미지(오선보, 타브, 다이어그램, 피아노)는 아래에 첨부합니다.</p>`;
    }

    // Links
    if (metadata.songName || metadata.artist) {
      const query = encodeURIComponent(`${metadata.artist || ''} ${metadata.songName || ''}`);
      html += `<br>`;
      html += `<p style="font-size:18px;font-weight:bold;margin:15px 0 5px 0;">관련 링크</p>`;
      html += `<hr style="border:none;border-top:2px solid #4a90d9;margin:5px 0 10px 0;">`;

      const links = [
        { text: 'Genius 가사', url: `https://genius.com/search?q=${query}` },
        { text: 'YouTube', url: `https://www.youtube.com/results?search_query=${query}` },
        { text: 'Spotify', url: `https://open.spotify.com/search/${query}` },
        { text: 'Apple Music', url: `https://music.apple.com/search?term=${query}` },
      ];

      links.forEach(({ text, url }) => {
        html += `<p style="margin:4px 0;font-size:14px;">${text}: <a href="${url}" style="color:#2563eb;text-decoration:none;">${url}</a></p>`;
      });
    }

    // Viewer link (single clean URL at the bottom)
    if (chords.length > 0) {
      const viewerBase = 'https://eunsongseo.github.io/song-chord-lab/viewer.html';
      const allUrl = `${viewerBase}?chords=${encodeURIComponent(chords.join(','))}`;
      html += `<br>`;
      html += `<p style="font-size:14px;margin:10px 0;">▶ 코드 재생/표기 보기: <a href="${allUrl}" style="color:#2563eb;text-decoration:none;">${allUrl}</a></p>`;
    }

    html += '</div>';
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
      { label: '템포', value: metadata.tempo ? `${metadata.tempo} BPM` : '' },
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
      chords.forEach(name => {
        const notes = MusicTheory.getChordNotesDisplay(name);
        text += `${name.padEnd(8)}${notes.join(', ')}\n`;
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
