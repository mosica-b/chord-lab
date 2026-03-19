/**
 * Main Application Module
 * Handles state management, UI events, and coordination
 */
const App = (() => {
  // Application state
  const state = {
    metadata: {
      songName: '',
      artist: '',
      albumName: '',
      composer: '',
      lyricist: '',
      tempo: '',
      timeSignature: '',
      key: '',
      scoreType: '',
    },
    selectedChords: [],
    capoPosition: 0,
  };

  // All chord names for search
  let allChordNames = [];
  let highlightIndex = -1;
  let _editingFromDB = false;
  let _variantMode = false;

  /**
   * Initialize the application
   */
  async function init() {
    // Load chord database
    await ChordDB.load();

    // Generate chord names for search
    allChordNames = MusicTheory.getAllChordNames();

    // Setup event listeners
    setupMetadataListeners();
    setupChordSelector();
    setupNotationTabs();
    setupExportButtons();
    setupQuickChords();
    setupMusicXMLUpload();

    // Clear previous session data so form starts fresh
    localStorage.removeItem('songChordLab');

    // Initialize DB UI (save/load buttons)
    if (typeof SongDB !== 'undefined') SongDB.initUI();

    console.log('Song & Chord Lab initialized');
  }

  // =========================================
  // Metadata Form
  // =========================================
  let autoSearchTimer = null;
  let _autoLyrics = false; // true when lyricsIntro was auto-populated

  function setupMetadataListeners() {
    const fields = ['songName', 'artist', 'albumName', 'lyricsIntro', 'composer', 'lyricist', 'tempo', 'timeSignature', 'songKey', 'scoreType'];

    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const event = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(event, () => {
        const key = id === 'songKey' ? 'key' : id;
        state.metadata[key] = el.value;
        saveState();
        updatePreview();

        // Mark lyrics as manually edited
        if (id === 'lyricsIntro') {
          _autoLyrics = false;
        }

        // Auto-search APIs when songName or artist changes
        if (id === 'songName' || id === 'artist') {
          clearTimeout(autoSearchTimer);
          // Clear previous auto-fetched data for the old song
          if (_autoLyrics) {
            state.metadata.lyricsIntro = '';
            const lyricsEl = document.getElementById('lyricsIntro');
            if (lyricsEl) lyricsEl.value = '';
            _autoLyrics = false;
          }
          state.metadata.geniusUrl = '';
          autoSearchTimer = setTimeout(() => autoSearchAPIs(), 1500);
        }
      });
    });

    const capoEl = document.getElementById('capoPosition');
    if (capoEl) {
      capoEl.addEventListener('change', () => {
        state.capoPosition = parseInt(capoEl.value) || 0;
        saveState();
        updateAll();
      });
    }
  }

  // =========================================
  // Auto API Search (iTunes + Genius)
  // =========================================
  async function autoSearchAPIs() {
    const { songName, artist } = state.metadata;
    if (!songName) return;

    try {
      // Step 1: iTunes first (to get English trackName for Genius search)
      const album = await ITunesSearch.searchAlbum(songName, artist);
      let changed = false;

      if (album) {
        if (album.albumName && !state.metadata.albumName) {
          state.metadata.albumName = album.albumName;
          document.getElementById('albumName').value = album.albumName;
          changed = true;
        }
        if (album.trackViewUrl) {
          state.metadata.appleMusicUrl = album.trackViewUrl;
          changed = true;
        }
      }

      // Step 2: Genius search with English trackName as alternate query
      const altSongName = album?.trackNameEN || album?.trackName || null;
      const altArtist = album?.artistNameEN || album?.artistName || null;
      const geniusUrl = await ITunesSearch.searchGeniusLyrics(songName, artist, altSongName);
      if (geniusUrl) {
        state.metadata.geniusUrl = geniusUrl;
        changed = true;
      }

      if (changed) {
        saveState();
        updatePreview();
      }

      // Step 3: Auto-fetch lyrics intro via LRCLIB (non-blocking)
      // Skip if user has manually typed lyrics
      if (!state.metadata.lyricsIntro || _autoLyrics) {
        ITunesSearch.fetchLyricsIntro(songName, artist, altSongName, 2, altArtist).then(intro => {
          if (intro) {
            state.metadata.lyricsIntro = intro;
            _autoLyrics = true;
            const el = document.getElementById('lyricsIntro');
            if (el) el.value = intro;
            saveState();
            updatePreview();
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Auto API search failed:', e);
    }
  }

  // =========================================
  // MusicXML / PDF Upload
  // =========================================

  /** Show/hide "다른 악보 추가" button based on whether song has metadata */
  function updateAddVariantBtn() {
    const btn = document.getElementById('addVariantBtn');
    if (!btn) return;
    btn.classList.toggle('hidden', !state.metadata.songName.trim());
  }

  /**
   * Batch upload: parse multiple MusicXML files, show summary, save all at once.
   * Metadata is taken from the first file; each file gets its own scoreType + chords.
   */
  async function processBatchUpload(files) {
    const btn = document.getElementById('uploadMxmlBtn');
    try {
      if (btn) { btn.textContent = '분석 중...'; btn.disabled = true; }

      const parsed = [];
      for (const f of files) {
        const ext = f.name.split('.').pop().toLowerCase();
        if (ext === 'pdf') continue; // PDF는 일괄 저장 미지원
        const text = await f.text();
        const result = MusicXMLParser.parse(text, f.name);
        parsed.push({ fileName: f.name, result });
      }

      if (parsed.length === 0) {
        alert('MusicXML 파일만 일괄 등록할 수 있습니다.');
        return;
      }

      // Build summary list
      const typeList = parsed.map(p => p.result.scoreType || '(알 수 없음)').join(', ');
      const first = parsed[0].result;
      const songLabel = (first.songName || '(곡명 없음)') + ' - ' + (first.artist || '(아티스트 없음)');

      if (!confirm(`${parsed.length}개 악보가 감지되었습니다.\n\n곡: ${songLabel}\n악보 타입: ${typeList}\n\n일괄 저장하시겠습니까?`)) {
        return;
      }

      // Apply first file metadata to UI (for display purposes)
      await processUploadedFile(files[0]);

      // Save each parsed result to DB
      if (typeof SongDB !== 'undefined') {
        let savedCount = 0;
        for (const p of parsed) {
          const r = p.result;
          // Use current state metadata (filled from first file) but override scoreType + chords
          const saveState = {
            metadata: { ...state.metadata, scoreType: r.scoreType || '' },
            selectedChords: r.chords || [],
            capoPosition: state.capoPosition,
          };
          try {
            await SongDB.saveSong(saveState);
            savedCount++;
          } catch (err) {
            console.warn('Batch save failed for', p.fileName, err);
          }
        }
        alert(`${savedCount}/${parsed.length}개 악보가 저장되었습니다.`);
      }
    } catch (err) {
      console.error('Batch upload failed:', err);
      alert('일괄 업로드 실패: ' + err.message);
    } finally {
      if (btn) { btn.textContent = '악보 불러오기'; btn.disabled = false; }
    }
  }

  /**
   * Variant mode: parse file for scoreType + chords only, keeping current metadata.
   */
  async function processVariantFile(file) {
    const btn = document.getElementById('uploadMxmlBtn');
    try {
      if (btn) { btn.textContent = '분석 중...'; btn.disabled = true; }
      const ext = file.name.split('.').pop().toLowerCase();
      let result;
      if (ext === 'pdf') {
        if (typeof pdfjsLib === 'undefined') { alert('PDF.js 라이브러리가 아직 로드되지 않았습니다.'); return; }
        const arrayBuffer = await file.arrayBuffer();
        result = await SibeliusPDFParser.parse(arrayBuffer);
      } else {
        const text = await file.text();
        result = MusicXMLParser.parse(text, file.name);
      }

      // Only update scoreType and chords — keep all other metadata
      if (result.scoreType) {
        state.metadata.scoreType = result.scoreType;
        const stEl = document.getElementById('scoreType');
        if (stEl) stEl.value = result.scoreType;
      } else {
        state.metadata.scoreType = '';
        const stEl = document.getElementById('scoreType');
        if (stEl) stEl.value = '';
      }

      if (result.chords && result.chords.length > 0) {
        state.selectedChords = [];
        result.chords.forEach(name => {
          if (!state.selectedChords.includes(name)) {
            state.selectedChords.push(name);
          }
        });
        renderSelectedChords();
      }

      _editingFromDB = false;
      if (typeof SongDB !== 'undefined') SongDB.setEditingId(null);
      updateSaveBtnState();
      saveState();
      updateAll();
    } catch (err) {
      console.error('Variant file parse failed:', err);
      alert('악보 파일을 읽지 못했습니다: ' + err.message);
    } finally {
      if (btn) { btn.textContent = '악보 불러오기'; btn.disabled = false; }
    }
  }

  function enterVariantMode() {
    _variantMode = true;
    const overlay = document.getElementById('mxmlDropOverlay');
    const overlayText = document.getElementById('dropOverlayText');
    const overlayHint = document.getElementById('dropOverlayHint');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.remove('pointer-events-none');
      overlay.style.cursor = 'pointer';
    }
    if (overlayText) overlayText.textContent = '다른 악보 파일을 여기에 놓거나 클릭하세요';
    if (overlayHint) overlayHint.classList.remove('hidden');
  }

  function exitVariantMode() {
    _variantMode = false;
    const overlay = document.getElementById('mxmlDropOverlay');
    const overlayText = document.getElementById('dropOverlayText');
    const overlayHint = document.getElementById('dropOverlayHint');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.classList.add('pointer-events-none');
      overlay.style.cursor = '';
    }
    if (overlayText) overlayText.textContent = '악보 파일을 여기에 놓으세요';
    if (overlayHint) overlayHint.classList.add('hidden');
  }

  async function processUploadedFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      await processPDFFile(file);
    } else {
      await processMusicXMLFile(file);
    }
  }

  async function processPDFFile(file) {
    const btn = document.getElementById('uploadMxmlBtn');
    try {
      if (btn) { btn.textContent = '불러오는 중...'; btn.disabled = true; }

      if (typeof pdfjsLib === 'undefined') {
        alert('PDF.js 라이브러리가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      const result = await SibeliusPDFParser.parse(arrayBuffer);

      // Fill metadata (same flow as MusicXML)
      if (result.songName) { state.metadata.songName = result.songName; document.getElementById('songName').value = result.songName; }
      if (result.artist) { state.metadata.artist = result.artist; document.getElementById('artist').value = result.artist; }
      if (result.composer) { state.metadata.composer = result.composer; document.getElementById('composer').value = result.composer; }
      if (result.lyricist) { state.metadata.lyricist = result.lyricist; document.getElementById('lyricist').value = result.lyricist; }
      if (result.tempo) { state.metadata.tempo = result.tempo; document.getElementById('tempo').value = result.tempo; }
      if (result.timeSignature) { state.metadata.timeSignature = result.timeSignature; document.getElementById('timeSignature').value = result.timeSignature; }
      if (result.key) {
        state.metadata.key = result.key;
        const keySelect = document.getElementById('songKey');
        if (!keySelect.querySelector(`option[value="${result.key}"]`)) {
          const opt = document.createElement('option');
          opt.value = result.key;
          opt.textContent = result.key;
          keySelect.appendChild(opt);
        }
        keySelect.value = result.key;
      }

      // Add chords
      if (result.chords.length > 0) {
        state.selectedChords = [];
        result.chords.forEach(name => {
          if (!state.selectedChords.includes(name)) {
            state.selectedChords.push(name);
          }
        });
        renderSelectedChords();
      }

      saveState();
      updateAll();

      // Search album via iTunes + Genius lyrics
      if (result.songName || result.artist) {
        const album = await ITunesSearch.searchAlbum(result.songName, result.artist);
        if (album) {
          if (album.albumName && !state.metadata.albumName) {
            state.metadata.albumName = album.albumName;
            document.getElementById('albumName').value = album.albumName;
          }
          if (album.trackViewUrl) state.metadata.appleMusicUrl = album.trackViewUrl;
        }
        const altName = album?.trackNameEN || album?.trackName || null;
        const altArtistName = album?.artistNameEN || album?.artistName || null;
        const geniusUrl = await ITunesSearch.searchGeniusLyrics(result.songName, result.artist, altName);
        if (geniusUrl) state.metadata.geniusUrl = geniusUrl;
        saveState();
        updatePreview();

        // Auto-fetch lyrics intro via LRCLIB
        if (!state.metadata.lyricsIntro || _autoLyrics) {
          ITunesSearch.fetchLyricsIntro(result.songName, result.artist, altName, 2, altArtistName).then(intro => {
            if (intro) {
              state.metadata.lyricsIntro = intro;
              _autoLyrics = true;
              const el = document.getElementById('lyricsIntro');
              if (el) el.value = intro;
              saveState();
              updatePreview();
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('PDF parse failed:', err);
      alert('PDF 파일을 읽지 못했습니다: ' + err.message);
    } finally {
      if (btn) { btn.textContent = '악보 불러오기'; btn.disabled = false; }
    }
  }

  async function processMusicXMLFile(file) {
    const btn = document.getElementById('uploadMxmlBtn');
    try {
      if (btn) { btn.textContent = '불러오는 중...'; btn.disabled = true; }

      const text = await file.text();
      const result = MusicXMLParser.parse(text, file.name);

      // Fill metadata
      if (result.songName) { state.metadata.songName = result.songName; document.getElementById('songName').value = result.songName; }
      if (result.artist) { state.metadata.artist = result.artist; document.getElementById('artist').value = result.artist; }
      if (result.composer) { state.metadata.composer = result.composer; document.getElementById('composer').value = result.composer; }
      if (result.lyricist) { state.metadata.lyricist = result.lyricist; document.getElementById('lyricist').value = result.lyricist; }
      if (result.tempo) { state.metadata.tempo = result.tempo; document.getElementById('tempo').value = result.tempo; }
      if (result.timeSignature) { state.metadata.timeSignature = result.timeSignature; document.getElementById('timeSignature').value = result.timeSignature; }
      if (result.scoreType) { state.metadata.scoreType = result.scoreType; const stEl = document.getElementById('scoreType'); if (stEl) stEl.value = result.scoreType; }
      if (result.key) {
        state.metadata.key = result.key;
        const keySelect = document.getElementById('songKey');
        if (!keySelect.querySelector(`option[value="${result.key}"]`)) {
          const opt = document.createElement('option');
          opt.value = result.key;
          opt.textContent = result.key;
          keySelect.appendChild(opt);
        }
        keySelect.value = result.key;
      }

      // Add chords
      if (result.chords.length > 0) {
        state.selectedChords = [];
        result.chords.forEach(name => {
          if (!state.selectedChords.includes(name)) {
            state.selectedChords.push(name);
          }
        });
        renderSelectedChords();
      }

      saveState();
      updateAll();

      // Search album via iTunes + Genius lyrics
      if (result.songName || result.artist) {
        const album = await ITunesSearch.searchAlbum(result.songName, result.artist);
        if (album) {
          if (album.albumName && !state.metadata.albumName) {
            state.metadata.albumName = album.albumName;
            document.getElementById('albumName').value = album.albumName;
          }
          if (album.trackViewUrl) state.metadata.appleMusicUrl = album.trackViewUrl;
        }
        const altName = album?.trackNameEN || album?.trackName || null;
        const altArtistName = album?.artistNameEN || album?.artistName || null;
        const geniusUrl = await ITunesSearch.searchGeniusLyrics(result.songName, result.artist, altName);
        if (geniusUrl) state.metadata.geniusUrl = geniusUrl;
        saveState();
        updatePreview();

        // Auto-fetch lyrics intro via LRCLIB
        if (!state.metadata.lyricsIntro || _autoLyrics) {
          ITunesSearch.fetchLyricsIntro(result.songName, result.artist, altName, 2, altArtistName).then(intro => {
            if (intro) {
              state.metadata.lyricsIntro = intro;
              _autoLyrics = true;
              const el = document.getElementById('lyricsIntro');
              if (el) el.value = intro;
              saveState();
              updatePreview();
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('MusicXML parse failed:', err);
      alert('MusicXML 파일을 읽지 못했습니다.');
    } finally {
      if (btn) { btn.textContent = '악보 불러오기'; btn.disabled = false; }
    }
  }

  function setupMusicXMLUpload() {
    const btn = document.getElementById('uploadMxmlBtn');
    const input = document.getElementById('mxmlFileInput');
    if (!btn || !input) return;

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      if (_variantMode) {
        // Variant mode — only take scoreType + chords from file
        await processVariantFile(files[0]);
        exitVariantMode();
      } else if (files.length === 1) {
        // Single file — normal flow
        await processUploadedFile(files[0]);
      } else {
        // Multiple files — batch parse + batch save
        await processBatchUpload(files);
      }
      input.value = '';
    });

    // Drag & Drop
    const dropZone = document.getElementById('songMetaSection');
    const overlay = document.getElementById('mxmlDropOverlay');
    if (!dropZone || !overlay) return;

    let dragCounter = 0;

    dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      overlay.classList.remove('hidden');
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay.classList.add('hidden');
      }
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;

      const allFiles = Array.from(e.dataTransfer.files || []);
      const validFiles = allFiles.filter(f => {
        const ext = f.name.toLowerCase();
        return ext.endsWith('.xml') || ext.endsWith('.musicxml') || ext.endsWith('.mxl') || ext.endsWith('.pdf');
      });

      if (validFiles.length === 0) {
        if (_variantMode) exitVariantMode();
        else overlay.classList.add('hidden');
        alert('악보 파일(.xml, .musicxml, .mxl, .pdf)만 지원합니다.');
        return;
      }

      if (_variantMode) {
        // Variant mode — only take scoreType + chords from file
        await processVariantFile(validFiles[0]);
        exitVariantMode();
      } else {
        overlay.classList.add('hidden');
        if (validFiles.length === 1) {
          await processUploadedFile(validFiles[0]);
        } else {
          await processBatchUpload(validFiles);
        }
      }
    });

    // "다른 악보 추가" button — show overlay in variant mode (drag & drop or click)
    const addVariantBtn = document.getElementById('addVariantBtn');
    if (addVariantBtn) {
      addVariantBtn.addEventListener('click', () => {
        enterVariantMode();
      });
    }

    // Overlay click handler — open file picker when in variant mode
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (_variantMode) {
          e.stopPropagation();
          input.click();
        }
      });
    }

    // Escape key to cancel variant mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _variantMode) {
        exitVariantMode();
      }
    });

    // Reset song button
    const resetBtn = document.getElementById('resetSongBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        // Clear metadata
        state.metadata = { songName: '', artist: '', albumName: '', lyricsIntro: '', composer: '', lyricist: '', tempo: '', timeSignature: '', key: '', scoreType: '', geniusUrl: '', appleMusicUrl: '' };
        _autoLyrics = false;
        _editingFromDB = false;
        if (typeof SongDB !== 'undefined') SongDB.setEditingId(null);
        updateSaveBtnState();

        // Clear form fields
        ['songName', 'artist', 'albumName', 'lyricsIntro', 'composer', 'lyricist', 'tempo', 'timeSignature', 'songKey', 'scoreType', 'capoPosition'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = id === 'capoPosition' ? '0' : '';
        });

        // Clear chords
        state.selectedChords = [];
        state.capoPosition = 0;
        renderSelectedChords();

        saveState();
        updateAll();
      });
    }

    // Album search button
    const searchBtn = document.getElementById('searchAlbumBtn');
    if (searchBtn) {
      searchBtn.addEventListener('click', async () => {
        const { songName, artist } = state.metadata;
        if (!songName && !artist) return;
        searchBtn.textContent = '...';
        searchBtn.disabled = true;
        try {
          const album = await ITunesSearch.searchAlbum(songName, artist);
          if (album && album.albumName) {
            state.metadata.albumName = album.albumName;
            document.getElementById('albumName').value = album.albumName;
            if (album.trackViewUrl) state.metadata.appleMusicUrl = album.trackViewUrl;
          }
          const altName = album?.trackNameEN || album?.trackName || null;
          const altArtistName2 = album?.artistNameEN || album?.artistName || null;
          const geniusUrl = await ITunesSearch.searchGeniusLyrics(songName, artist, altName);
          if (geniusUrl) state.metadata.geniusUrl = geniusUrl;
          saveState();
          updatePreview();

          // Auto-fetch lyrics intro via LRCLIB
          if (!state.metadata.lyricsIntro || _autoLyrics) {
            ITunesSearch.fetchLyricsIntro(songName, artist, altName, 2, altArtistName2).then(intro => {
              if (intro) {
                state.metadata.lyricsIntro = intro;
                _autoLyrics = true;
                const el = document.getElementById('lyricsIntro');
                if (el) el.value = intro;
                saveState();
                updatePreview();
              }
            }).catch(() => {});
          }

          if (!album || !album.albumName) {
            alert('앨범을 찾지 못했습니다.');
          }
        } catch (e) {
          console.warn('Album search failed:', e);
        } finally {
          searchBtn.textContent = '검색';
          searchBtn.disabled = false;
        }
      });
    }
  }

  // =========================================
  // Chord Selector
  // =========================================
  function setupChordSelector() {
    const searchInput = document.getElementById('chordSearch');
    const suggestions = document.getElementById('chordSuggestions');
    const addBtn = document.getElementById('addChordBtn');

    if (!searchInput || !suggestions) return;

    // Search input with autocomplete
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      if (query.length === 0) {
        suggestions.classList.add('hidden');
        highlightIndex = -1;
        return;
      }

      const matches = allChordNames
        .filter(name => name.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 12);

      if (matches.length === 0) {
        suggestions.classList.add('hidden');
        highlightIndex = -1;
        return;
      }

      suggestions.innerHTML = '';
      highlightIndex = -1;
      matches.forEach((name, i) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = name;
        div.addEventListener('click', () => {
          addChord(name);
          searchInput.value = '';
          suggestions.classList.add('hidden');
        });
        suggestions.appendChild(div);
      });
      suggestions.classList.remove('hidden');
    });

    // Keyboard navigation for suggestions
    searchInput.addEventListener('keydown', (e) => {
      const items = suggestions.querySelectorAll('.suggestion-item');
      if (items.length === 0 && e.key !== 'Enter') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightIndex = Math.min(highlightIndex + 1, items.length - 1);
        updateHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightIndex = Math.max(highlightIndex - 1, -1);
        updateHighlight(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIndex >= 0 && items[highlightIndex]) {
          items[highlightIndex].click();
        } else if (searchInput.value.trim()) {
          addChord(searchInput.value.trim());
          searchInput.value = '';
          suggestions.classList.add('hidden');
        }
      } else if (e.key === 'Escape') {
        suggestions.classList.add('hidden');
        highlightIndex = -1;
      }
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#chordSearch') && !e.target.closest('#chordSuggestions')) {
        suggestions.classList.add('hidden');
        highlightIndex = -1;
      }
    });

    // Add button
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
          addChord(query);
          searchInput.value = '';
          suggestions.classList.add('hidden');
        }
      });
    }
  }

  function updateHighlight(items) {
    items.forEach((item, i) => {
      item.classList.toggle('highlighted', i === highlightIndex);
    });
  }

  // =========================================
  // Quick Chords
  // =========================================
  function setupQuickChords() {
    const container = document.getElementById('quickChords');
    if (!container) return;

    const commonChords = MusicTheory.getCommonChords();
    commonChords.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'quick-chord-btn';
      btn.textContent = name;
      btn.addEventListener('click', () => addChord(name));
      container.appendChild(btn);
    });
  }

  // =========================================
  // Chord Management
  // =========================================
  function addChord(name) {
    // Validate chord name
    const parsed = MusicTheory.parseChordName(name);
    if (!parsed) return;

    // Check if already added
    if (state.selectedChords.includes(name)) return;

    state.selectedChords.push(name);
    saveState();
    renderSelectedChords();
    updateAll();
  }

  function removeChord(name) {
    state.selectedChords = state.selectedChords.filter(c => c !== name);
    saveState();
    renderSelectedChords();
    updateAll();
  }

  function renderSelectedChords() {
    const container = document.getElementById('selectedChords');
    const placeholder = document.getElementById('chordPlaceholder');
    if (!container) return;

    // Remove existing chips
    container.querySelectorAll('.chord-chip').forEach(el => el.remove());

    if (state.selectedChords.length === 0) {
      if (placeholder) placeholder.style.display = '';
      return;
    }

    if (placeholder) placeholder.style.display = 'none';

    state.selectedChords.forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'chord-chip';
      chip.innerHTML = `${name}<button class="remove-chord" title="제거">&times;</button>`;
      chip.querySelector('.remove-chord').addEventListener('click', () => removeChord(name));
      container.appendChild(chip);
    });
  }

  // =========================================
  // Notation Tabs
  // =========================================
  function setupNotationTabs() {
    const tabs = document.querySelectorAll('.notation-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active');
          t.style.borderColor = 'transparent';
        });
        tab.classList.add('active');
        tab.style.borderColor = '';

        const targetTab = tab.dataset.tab;
        document.querySelectorAll('.notation-content').forEach(content => {
          content.classList.add('hidden');
        });
        const target = document.getElementById(`tab-${targetTab}`);
        if (target) target.classList.remove('hidden');
      });
    });

    // Modal close handlers (for blog preview notation links)
    const overlay = document.getElementById('notationModal');
    const modalClose = document.getElementById('notationModalClose');
    function closeModal() {
      if (overlay) overlay.classList.add('hidden');
      document.body.style.overflow = '';
      const body = document.getElementById('notationModalBody');
      if (body) body.innerHTML = '';
    }
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  // =========================================
  // Export Buttons
  // =========================================
  function setupExportButtons() {
    const copyTextBtn = document.getElementById('copyTextBtn');
    const downloadOneBtn = document.getElementById('downloadOneImageBtn');

    if (copyTextBtn) {
      copyTextBtn.addEventListener('click', async () => {
        // Ensure API URLs are fetched before copying
        if (state.metadata.songName && (!state.metadata.geniusUrl || !state.metadata.appleMusicUrl)) {
          copyTextBtn.textContent = '링크 검색 중...';
          await autoSearchAPIs();
        }
        const ok = await Export.copyTextToClipboard(state.metadata, state.selectedChords, state.capoPosition);
        if (ok) {
          copyTextBtn.textContent = '복사 완료!';
          copyTextBtn.classList.replace('bg-blue-500', 'bg-green-500');
          setTimeout(() => {
            copyTextBtn.textContent = '1. 텍스트 복사';
            copyTextBtn.classList.replace('bg-green-500', 'bg-blue-500');
          }, 2000);
        }
      });
    }

    if (downloadOneBtn) {
      downloadOneBtn.addEventListener('click', async () => {
        downloadOneBtn.textContent = '생성 중...';
        downloadOneBtn.disabled = true;
        try {
          await Export.downloadAllAsOneImage(state.selectedChords, state.metadata.songName);
          downloadOneBtn.textContent = '다운로드 완료!';
          setTimeout(() => {
            downloadOneBtn.textContent = '2. 이미지 다운로드 (1장)';
            downloadOneBtn.disabled = false;
          }, 2000);
        } catch (e) {
          console.error('Download failed:', e);
          downloadOneBtn.textContent = '2. 이미지 다운로드 (1장)';
          downloadOneBtn.disabled = false;
        }
      });
    }

    // ── Blockquote Preset Controls ──
    const bqSelect = document.getElementById('bqPresetSelect');
    const bqSaveBtn = document.getElementById('bqPresetSaveBtn');
    const bqDeleteBtn = document.getElementById('bqPresetDeleteBtn');

    function refreshBqPresetSelect(selectValue) {
      if (!bqSelect) return;
      const presets = Export.getBqPresets();
      bqSelect.innerHTML = '<option value="__default__">기본</option>';
      presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        bqSelect.appendChild(opt);
      });
      if (selectValue) bqSelect.value = selectValue;
    }

    if (bqSelect) {
      // Populate on init
      refreshBqPresetSelect();

      bqSelect.addEventListener('change', () => {
        Export.loadBqPreset(bqSelect.value);
        updatePreview();
      });
    }

    if (bqSaveBtn) {
      bqSaveBtn.addEventListener('click', () => {
        const current = bqSelect ? bqSelect.value : '__default__';
        let name;
        if (current === '__default__') {
          name = prompt('프리셋 이름을 입력하세요 (최대 10개):');
          if (!name || !name.trim()) return;
          name = name.trim();
        } else {
          if (!confirm(`"${current}" 프리셋을 덮어쓸까요?`)) return;
          name = current;
        }
        const ok = Export.saveBqPreset(name);
        if (!ok) {
          alert('프리셋 저장 실패: 최대 10개까지 저장할 수 있습니다.');
          return;
        }
        refreshBqPresetSelect(name);
        bqSaveBtn.textContent = '저장 완료!';
        setTimeout(() => { bqSaveBtn.textContent = '저장'; }, 1500);
      });
    }

    if (bqDeleteBtn) {
      bqDeleteBtn.addEventListener('click', () => {
        const current = bqSelect ? bqSelect.value : '__default__';
        if (current === '__default__') {
          alert('기본 프리셋은 삭제할 수 없습니다.');
          return;
        }
        if (!confirm(`"${current}" 프리셋을 삭제할까요?`)) return;
        Export.deleteBqPreset(current);
        Export.loadBqPreset('__default__');
        refreshBqPresetSelect('__default__');
        updatePreview();
      });
    }
  }

  // =========================================
  // Chord Notes Table
  // =========================================
  function renderChordNotesTable() {
    const section = document.getElementById('chordNotesSection');
    const container = document.getElementById('chordNotesTable');
    if (!section || !container) return;

    if (state.selectedChords.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'w-full text-sm border-collapse';

    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
      <th class="bg-gray-50 border px-3 py-2 text-left font-semibold">코드</th>
      <th class="bg-gray-50 border px-3 py-2 text-left font-semibold">구성음</th>
      <th class="bg-gray-50 border px-3 py-2 text-left font-semibold">코드 타입</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    state.selectedChords.forEach(name => {
      const notes = MusicTheory.getChordNotesDisplay(name);
      const parsed = MusicTheory.parseChordName(name);
      const suffix = parsed ? parsed.suffix : '';
      const typeNames = {
        'major': '메이저', 'minor': '마이너', 'dim': '디미니쉬', 'aug': '어그먼트',
        '7': '도미넌트 7', 'm7': '마이너 7', 'maj7': '메이저 7',
        'dim7': '디미니쉬 7', 'm7b5': '하프 디미니쉬',
        'sus2': '서스펜디드 2', 'sus4': '서스펜디드 4',
        '6': '메이저 6', 'm6': '마이너 6',
        '9': '도미넌트 9', 'm9': '마이너 9', 'maj9': '메이저 9',
        'add9': '애드 9', '5': '파워 코드',
      };
      const typeName = typeNames[MusicTheory.SUFFIX_MAP[suffix] || suffix] || suffix;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="border px-3 py-2 font-semibold">${name}</td>
        <td class="border px-3 py-2">${notes.map(n => MusicTheory.formatNoteDisplay(n)).join(', ')}</td>
        <td class="border px-3 py-2 text-gray-600">${typeName}</td>
      `;
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  // =========================================
  // Capo Transposition Table
  // =========================================
  function renderCapoTable() {
    const section = document.getElementById('capoSection');
    const container = document.getElementById('capoTable');
    if (!section || !container) return;

    if (state.selectedChords.length === 0 || state.capoPosition === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    container.innerHTML = '';

    const capoTable = MusicTheory.generateCapoTable(state.selectedChords);

    const table = document.createElement('table');
    table.className = 'w-full text-sm border-collapse';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const thCapo = document.createElement('th');
    thCapo.className = 'bg-gray-50 border px-3 py-2 text-center font-semibold';
    thCapo.textContent = '카포';
    headerRow.appendChild(thCapo);

    state.selectedChords.forEach(name => {
      const th = document.createElement('th');
      th.className = 'bg-gray-50 border px-3 py-2 text-center font-semibold';
      th.textContent = name;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    capoTable.forEach(({ capo, chords: transposed }) => {
      const row = document.createElement('tr');
      const isSelected = capo === state.capoPosition;

      const tdCapo = document.createElement('td');
      tdCapo.className = `border px-3 py-2 text-center font-semibold ${isSelected ? 'bg-blue-50 text-blue-700' : ''}`;
      tdCapo.textContent = capo === 0 ? '원래 코드' : `${capo}프렛`;
      row.appendChild(tdCapo);

      transposed.forEach(chord => {
        const td = document.createElement('td');
        td.className = `border px-3 py-2 text-center ${isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : ''}`;
        td.textContent = chord;
        row.appendChild(td);
      });

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  // =========================================
  // Update Functions
  // =========================================
  function updateAll() {
    const hasChords = state.selectedChords.length > 0;

    // Show/hide sections
    const notationSection = document.getElementById('notationSection');
    const previewSection = document.getElementById('previewSection');

    if (notationSection) {
      notationSection.classList.toggle('hidden', !hasChords);
    }
    if (previewSection) {
      previewSection.classList.toggle('hidden', !hasChords && !state.metadata.songName);
    }

    if (hasChords) {
      Renderers.renderAll(state.selectedChords);
    }

    renderChordNotesTable();
    renderCapoTable();
    updatePreview();
    updateAddVariantBtn();
  }

  function updatePreview() {
    const previewSection = document.getElementById('previewSection');
    const bqPresetBar = document.getElementById('bqPresetBar');
    const hasContent = state.selectedChords.length > 0 || state.metadata.songName;

    if (previewSection) {
      previewSection.classList.toggle('hidden', !hasContent);
    }
    if (bqPresetBar) {
      bqPresetBar.classList.toggle('hidden', !hasContent);
    }

    if (hasContent) {
      Export.generateBlogPreview(state.metadata, state.selectedChords, state.capoPosition);
    }
  }

  // =========================================
  // localStorage Persistence
  // =========================================
  function saveState() {
    try {
      const data = Object.assign({}, state, { _autoLyrics });
      localStorage.setItem('songChordLab', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  function loadState() {
    try {
      const saved = localStorage.getItem('songChordLab');
      if (!saved) return;

      const parsed = JSON.parse(saved);
      Object.assign(state.metadata, parsed.metadata || {});
      state.selectedChords = parsed.selectedChords || [];
      state.capoPosition = parsed.capoPosition || 0;

      // Restore form values
      document.getElementById('songName').value = state.metadata.songName || '';
      document.getElementById('artist').value = state.metadata.artist || '';
      document.getElementById('albumName').value = state.metadata.albumName || '';
      document.getElementById('lyricsIntro').value = state.metadata.lyricsIntro || '';
      document.getElementById('composer').value = state.metadata.composer || '';
      document.getElementById('lyricist').value = state.metadata.lyricist || '';
      document.getElementById('tempo').value = state.metadata.tempo || '';
      document.getElementById('timeSignature').value = state.metadata.timeSignature || '';
      const keyVal = state.metadata.key || '';
      const keySelect = document.getElementById('songKey');
      if (keyVal && !keySelect.querySelector(`option[value="${keyVal}"]`)) {
        const opt = document.createElement('option');
        opt.value = keyVal;
        opt.textContent = keyVal;
        keySelect.appendChild(opt);
      }
      keySelect.value = keyVal;
      document.getElementById('capoPosition').value = state.capoPosition;

      // Restore auto-lyrics flag
      _autoLyrics = !!parsed._autoLyrics;

      // Restore UI
      renderSelectedChords();
      updateAll();

      // Auto-fetch API URLs if missing
      if (state.metadata.songName && (!state.metadata.geniusUrl || !state.metadata.appleMusicUrl)) {
        autoSearchAPIs();
      }
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  }

  /**
   * Load song data from DB into the app
   */
  function loadFromDB(songData, editing = false) {
    _editingFromDB = editing;
    Object.assign(state.metadata, songData.metadata);
    state.selectedChords = songData.selectedChords || [];
    state.capoPosition = songData.capoPosition || 0;

    // Update form fields
    document.getElementById('songName').value = state.metadata.songName || '';
    document.getElementById('artist').value = state.metadata.artist || '';
    document.getElementById('albumName').value = state.metadata.albumName || '';
    document.getElementById('lyricsIntro').value = state.metadata.lyricsIntro || '';
    document.getElementById('composer').value = state.metadata.composer || '';
    document.getElementById('lyricist').value = state.metadata.lyricist || '';
    document.getElementById('tempo').value = state.metadata.tempo || '';
    document.getElementById('timeSignature').value = state.metadata.timeSignature || '';
    const keyVal = state.metadata.key || '';
    const keySelect = document.getElementById('songKey');
    if (keyVal && !keySelect.querySelector(`option[value="${keyVal}"]`)) {
      const opt = document.createElement('option');
      opt.value = keyVal;
      opt.textContent = keyVal;
      keySelect.appendChild(opt);
    }
    keySelect.value = keyVal;
    document.getElementById('capoPosition').value = state.capoPosition;
    const scoreTypeEl = document.getElementById('scoreType');
    if (scoreTypeEl) scoreTypeEl.value = state.metadata.scoreType || '';

    // Mark lyrics as auto (came from DB, not manually typed now)
    _autoLyrics = false;

    renderSelectedChords();
    saveState();
    updateAll();
    updateSaveBtnState();
  }

  function updateSaveBtnState() {
    const saveBtn = document.getElementById('saveToDbBtn');
    if (!saveBtn) return;
    saveBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600', 'bg-amber-500', 'hover:bg-amber-600', 'bg-green-500');
    if (_editingFromDB) {
      saveBtn.textContent = '수정 저장';
      saveBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
    } else {
      saveBtn.textContent = 'DB 저장';
      saveBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
    }
  }

  function clearEditingFlag() {
    _editingFromDB = false;
    if (typeof SongDB !== 'undefined') SongDB.setEditingId(null);
    updateSaveBtnState();
  }

  // Initialization is now called by auth.js after login
  return { init, state, addChord, removeChord, loadFromDB, clearEditingFlag, updateSaveBtnState };
})();
