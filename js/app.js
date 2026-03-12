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
      tempo: '',
      key: '',
    },
    selectedChords: [],
    capoPosition: 0,
  };

  // All chord names for search
  let allChordNames = [];
  let highlightIndex = -1;

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

    // Load saved state from localStorage
    loadState();

    console.log('Song & Chord Lab initialized');
  }

  // =========================================
  // Metadata Form
  // =========================================
  function setupMetadataListeners() {
    const fields = ['songName', 'artist', 'albumName', 'tempo', 'songKey'];

    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const key = id === 'songKey' ? 'key' : id;
        state.metadata[key] = el.value;
        saveState();
        updatePreview();
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
        // Update tab active state
        tabs.forEach(t => {
          t.classList.remove('active');
          t.style.borderColor = 'transparent';
        });
        tab.classList.add('active');
        tab.style.borderColor = '';

        // Show corresponding content
        const targetTab = tab.dataset.tab;
        document.querySelectorAll('.notation-content').forEach(content => {
          content.classList.add('hidden');
        });
        const target = document.getElementById(`tab-${targetTab}`);
        if (target) target.classList.remove('hidden');
      });
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
        const ok = await Export.copyTextToClipboard();
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
        <td class="border px-3 py-2">${notes.join(', ')}</td>
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
  }

  function updatePreview() {
    const previewSection = document.getElementById('previewSection');
    const hasContent = state.selectedChords.length > 0 || state.metadata.songName;

    if (previewSection) {
      previewSection.classList.toggle('hidden', !hasContent);
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
      localStorage.setItem('songChordLab', JSON.stringify(state));
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
      document.getElementById('tempo').value = state.metadata.tempo || '';
      document.getElementById('songKey').value = state.metadata.key || '';
      document.getElementById('capoPosition').value = state.capoPosition;

      // Restore UI
      renderSelectedChords();
      updateAll();
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { state, addChord, removeChord };
})();
