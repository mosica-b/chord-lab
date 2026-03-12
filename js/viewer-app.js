/**
 * Viewer App Module
 * Chord viewer page logic - reads URL params, renders notation cards, plays audio
 * Global tab bar switches all cards at once
 */
const ViewerApp = (() => {
  let chords = [];
  let defaultType = null; // e.g. 'staff', 'guitar-diagram', 'piano'
  let currentType = 'staff';

  const TABS = [
    { id: 'staff', label: '오선보', instrument: 'piano' },
    { id: 'guitar-tab', label: '기타 타브', instrument: 'guitar' },
    { id: 'guitar-diagram', label: '기타 다이어그램', instrument: 'guitar' },
    { id: 'ukulele-tab', label: '우쿨렐레 타브', instrument: 'ukulele' },
    { id: 'ukulele-diagram', label: '우쿨렐레 다이어그램', instrument: 'ukulele' },
    { id: 'piano', label: '피아노', instrument: 'piano' },
  ];
  const instrumentLabels = { piano: '피아노', guitar: '기타', ukulele: '우쿨렐레' };

  async function init() {
    await ChordDB.load();

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    const chordsParam = params.get('chords');
    const typeParam = params.get('type');

    if (chordsParam) {
      chords = chordsParam.split(',').map(c => c.trim()).filter(Boolean);
    }
    if (typeParam) {
      const validTypes = TABS.map(t => t.id);
      if (validTypes.includes(typeParam)) defaultType = typeParam;
    }
    currentType = defaultType || 'staff';

    setupGlobalTabs();
    setupAddChord();
    setupPlayAll();
    render();
  }

  function setupGlobalTabs() {
    const accordion = document.getElementById('fabAccordion');
    const fabBtn = document.getElementById('fabNotation');
    const fabTop = document.getElementById('fabTop');
    const items = accordion.querySelectorAll('.fab-accordion-item');

    // Set initial active from defaultType
    items.forEach(item => {
      item.classList.toggle('active', item.dataset.type === currentType);
      item.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentType = item.dataset.type;
        switchAllPanels(currentType);
        accordion.classList.add('hidden');
      });
    });

    // Toggle accordion on fab click
    fabBtn.addEventListener('click', () => {
      accordion.classList.toggle('hidden');
    });

    // Scroll to top
    fabTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Close accordion on outside click
    document.addEventListener('click', (e) => {
      if (!accordion.contains(e.target) && e.target !== fabBtn && !fabBtn.contains(e.target)) {
        accordion.classList.add('hidden');
      }
    });
  }

  function switchAllPanels(typeId) {
    // Switch all notation panels
    document.querySelectorAll('.notation-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.type === typeId);
    });
    // Update all play buttons
    const tab = TABS.find(t => t.id === typeId);
    const instLabel = instrumentLabels[tab ? tab.instrument : 'piano'];
    document.querySelectorAll('.card-play-btn').forEach(btn => {
      btn.dataset.instrument = tab ? tab.instrument : 'piano';
      if (!btn.classList.contains('playing')) {
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> ${instLabel} 재생`;
      }
    });
  }

  function render() {
    renderBadges();
    renderCards();
    updateURL();

    const emptyState = document.getElementById('emptyState');
    const cardsContainer = document.getElementById('chordCards');
    const fabContainer = document.getElementById('fabContainer');

    if (chords.length === 0) {
      emptyState.classList.remove('hidden');
      cardsContainer.classList.add('hidden');
      if (fabContainer) fabContainer.style.display = 'none';
    } else {
      emptyState.classList.add('hidden');
      cardsContainer.classList.remove('hidden');
      if (fabContainer) fabContainer.style.display = '';
    }
  }

  function renderBadges() {
    const container = document.getElementById('chordBadges');
    container.innerHTML = '';

    chords.forEach(name => {
      const badge = document.createElement('span');
      badge.className = 'chord-chip';
      badge.innerHTML = `${esc(name)}<button class="remove-chord" title="제거">&times;</button>`;
      badge.querySelector('.remove-chord').addEventListener('click', () => {
        chords = chords.filter(c => c !== name);
        render();
      });
      container.appendChild(badge);
    });
  }

  function renderCards() {
    const container = document.getElementById('chordCards');
    container.innerHTML = '';

    chords.forEach(name => {
      const card = createChordCard(name);
      container.appendChild(card);
    });
  }

  function createChordCard(chordName) {
    const card = document.createElement('div');
    card.className = 'chord-card';
    card.id = `card-${chordName}`;

    // Header: chord name + notes + play button
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-4';

    const left = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-2xl font-bold text-gray-800 mb-1';
    title.textContent = chordName;
    left.appendChild(title);

    // Chord notes display
    const notesDiv = document.createElement('div');
    notesDiv.className = 'flex flex-wrap gap-1';
    const chordNotes = MusicTheory.getChordNotesDisplay(chordName);
    chordNotes.forEach(note => {
      const badge = document.createElement('span');
      badge.className = 'chord-notes-badge highlighted';
      badge.textContent = note;
      notesDiv.appendChild(badge);
    });

    // Chord type
    const parsed = MusicTheory.parseChordName(chordName);
    const typeNames = {
      'major': '메이저', 'minor': '마이너', 'dim': '디미니쉬', 'aug': '어그먼트',
      '7': '도미넌트 7', 'm7': '마이너 7', 'maj7': '메이저 7',
      'dim7': '디미니쉬 7', 'm7b5': '하프 디미니쉬',
      'sus2': '서스 2', 'sus4': '서스 4',
      '6': '메이저 6', 'm6': '마이너 6',
      '9': '도미넌트 9', 'add9': '애드 9', '5': '파워',
    };
    if (parsed) {
      const intervalKey = MusicTheory.SUFFIX_MAP[parsed.suffix] || MusicTheory.SUFFIX_MAP[parsed.suffix.toLowerCase()];
      const typeName = typeNames[intervalKey] || parsed.suffix;
      if (typeName) {
        const typeSpan = document.createElement('span');
        typeSpan.className = 'text-xs text-gray-500 ml-2';
        typeSpan.textContent = typeName;
        title.appendChild(typeSpan);
      }
    }
    left.appendChild(notesDiv);

    // Play button (uses global tab's instrument)
    const currentTab = TABS.find(t => t.id === currentType) || TABS[0];
    const playBtn = document.createElement('button');
    playBtn.className = 'play-btn card-play-btn';
    playBtn.dataset.instrument = currentTab.instrument;
    playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> ${instrumentLabels[currentTab.instrument]} 재생`;
    playBtn.addEventListener('click', async () => {
      const inst = playBtn.dataset.instrument;
      const instLabel = instrumentLabels[inst];
      playBtn.classList.add('playing');
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg> ${instLabel} 재생 중`;
      await ChordAudio.playChord(chordName, 2.0, inst);
      playBtn.classList.remove('playing');
      const currentInst = playBtn.dataset.instrument;
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> ${instrumentLabels[currentInst]} 재생`;
    });

    header.appendChild(left);
    header.appendChild(playBtn);
    card.appendChild(header);

    // Create notation panels (no per-card tabs)
    const singleChord = [chordName];
    TABS.forEach(({ id }) => {
      const panel = document.createElement('div');
      panel.className = `notation-panel${id === currentType ? ' active' : ''}`;
      panel.dataset.type = id;
      card.appendChild(panel);

      // Render into panel
      switch (id) {
        case 'staff': Renderers.renderStaffNotation(panel, singleChord); break;
        case 'guitar-tab': Renderers.renderGuitarTab(panel, singleChord); break;
        case 'guitar-diagram': Renderers.renderGuitarDiagrams(panel, singleChord); break;
        case 'ukulele-tab': Renderers.renderUkuleleTab(panel, singleChord); break;
        case 'ukulele-diagram': Renderers.renderUkuleleDiagrams(panel, singleChord); break;
        case 'piano': Renderers.renderPianoKeyboards(panel, singleChord); break;
      }
    });

    return card;
  }

  function setupAddChord() {
    const input = document.getElementById('addChordInput');
    const btn = document.getElementById('addChordBtn');

    function addFromInput() {
      const name = input.value.trim();
      if (!name) return;
      const parsed = MusicTheory.parseChordName(name);
      if (!parsed) return;
      if (!chords.includes(name)) {
        chords.push(name);
        render();
      }
      input.value = '';
    }

    btn.addEventListener('click', addFromInput);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFromInput();
      }
    });
  }

  function setupPlayAll() {
    const btn = document.getElementById('playAllBtn');
    btn.addEventListener('click', async () => {
      if (ChordAudio.getIsPlaying()) {
        ChordAudio.stopPlayback();
        btn.classList.remove('playing');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> 전체 재생';
        // Remove highlight from all cards
        document.querySelectorAll('.chord-card').forEach(c => c.style.outline = '');
        return;
      }

      btn.classList.add('playing');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg> 정지';

      await ChordAudio.playChordSequence(chords, 2.0, (name, idx) => {
        // Highlight current card
        document.querySelectorAll('.chord-card').forEach(c => c.style.outline = '');
        const card = document.getElementById(`card-${name}`);
        if (card) {
          card.style.outline = '3px solid #3b82f6';
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      btn.classList.remove('playing');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> 전체 재생';
      document.querySelectorAll('.chord-card').forEach(c => c.style.outline = '');
    });
  }

  function updateURL() {
    const url = new URL(window.location);
    if (chords.length > 0) {
      url.searchParams.set('chords', chords.join(','));
    } else {
      url.searchParams.delete('chords');
    }
    window.history.replaceState({}, '', url);
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {};
})();
