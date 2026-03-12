/**
 * Viewer App Module
 * Chord viewer page logic - reads URL params, renders notation cards, plays audio
 */
const ViewerApp = (() => {
  let chords = [];
  let defaultType = null; // e.g. 'staff', 'guitar-diagram', 'piano'

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
      const validTypes = ['staff', 'guitar-tab', 'ukulele-tab', 'guitar-diagram', 'ukulele-diagram', 'piano'];
      if (validTypes.includes(typeParam)) defaultType = typeParam;
    }

    setupAddChord();
    setupPlayAll();
    render();
  }

  function render() {
    renderBadges();
    renderCards();
    updateURL();

    const emptyState = document.getElementById('emptyState');
    const cardsContainer = document.getElementById('chordCards');
    if (chords.length === 0) {
      emptyState.classList.remove('hidden');
      cardsContainer.classList.add('hidden');
    } else {
      emptyState.classList.add('hidden');
      cardsContainer.classList.remove('hidden');
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

    // Instrument tabs with associated audio instrument
    const tabs = [
      { id: 'staff', label: '오선보', instrument: 'piano' },
      { id: 'guitar-tab', label: '기타 타브', instrument: 'guitar' },
      { id: 'guitar-diagram', label: '기타 다이어그램', instrument: 'guitar' },
      { id: 'ukulele-tab', label: '우쿨렐레 타브', instrument: 'ukulele' },
      { id: 'ukulele-diagram', label: '우쿨렐레 다이어그램', instrument: 'ukulele' },
      { id: 'piano', label: '피아노', instrument: 'piano' },
    ];

    // Track current instrument for this card
    const instrumentLabels = { piano: '피아노', guitar: '기타', ukulele: '우쿨렐레' };
    // Determine default tab: use defaultType if set, otherwise first tab
    const defaultTabId = defaultType || tabs[0].id;
    const defaultTab = tabs.find(t => t.id === defaultTabId) || tabs[0];
    let cardInstrument = defaultTab.instrument;

    // Play button (uses current tab's instrument)
    const playBtn = document.createElement('button');
    playBtn.className = 'play-btn';
    playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> ${instrumentLabels[cardInstrument]} 재생`;
    playBtn.addEventListener('click', async () => {
      const instLabel = instrumentLabels[cardInstrument];
      playBtn.classList.add('playing');
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg> ${instLabel} 재생 중`;
      await ChordAudio.playChord(chordName, 2.0, cardInstrument);
      playBtn.classList.remove('playing');
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> ${instLabel} 재생`;
    });

    header.appendChild(left);
    header.appendChild(playBtn);
    card.appendChild(header);

    const tabBar = document.createElement('div');
    tabBar.className = 'flex flex-wrap gap-2 mb-4';

    const panels = {};

    tabs.forEach(({ id, label, instrument }) => {
      const isActive = id === defaultTabId;
      const btn = document.createElement('button');
      btn.className = `instrument-tab${isActive ? ' active' : ''}`;
      btn.textContent = label;
      btn.dataset.panel = `${chordName}-${id}`;

      btn.addEventListener('click', () => {
        tabBar.querySelectorAll('.instrument-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Object.values(panels).forEach(p => p.classList.remove('active'));
        panels[id].classList.add('active');

        // Update instrument for this card's play button
        cardInstrument = instrument;
        const instLabel = instrumentLabels[instrument];
        playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> ${instLabel} 재생`;
      });

      tabBar.appendChild(btn);

      // Create panel
      const panel = document.createElement('div');
      panel.className = `notation-panel${isActive ? ' active' : ''}`;
      panels[id] = panel;
    });

    card.appendChild(tabBar);

    // Render notation into panels
    const singleChord = [chordName];
    Renderers.renderStaffNotation(panels['staff'], singleChord);
    Renderers.renderGuitarTab(panels['guitar-tab'], singleChord);
    Renderers.renderGuitarDiagrams(panels['guitar-diagram'], singleChord);
    Renderers.renderUkuleleTab(panels['ukulele-tab'], singleChord);
    Renderers.renderUkuleleDiagrams(panels['ukulele-diagram'], singleChord);
    Renderers.renderPianoKeyboards(panels['piano'], singleChord);

    Object.values(panels).forEach(p => card.appendChild(p));

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
