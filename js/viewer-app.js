/**
 * Viewer App Module
 * Chord viewer page logic - reads URL params, renders notation cards, plays audio
 * Global tab bar switches all cards at once
 * Everyone can drag-reorder badges (session only, refreshes to original)
 * Custom combo builder: drag or tap chords to build & play custom progressions
 */
const ViewerApp = (() => {
  let chords = [];
  let originalChords = []; // preserved from URL, for reset
  let customChords = [];
  let defaultType = null;
  let currentType = 'staff';
  let capoPosition = 0;
  let capoDirection = 'down'; // 'down' = 실음→셰이프 (기존), 'up' = 카포→실음
  let horizontalMode = false;
  const CAPO_TYPES = new Set(['guitar-tab', 'guitar-diagram', 'ukulele-tab', 'ukulele-diagram']);

  // Voicing index state: Map<chordName, { guitar: number, ukulele: number }>
  const voicingIndices = new Map();
  function getVoicingIndex(chordName, instrument) {
    const entry = voicingIndices.get(chordName);
    return entry ? (entry[instrument] || 0) : 0;
  }
  function setVoicingIndex(chordName, instrument, index) {
    if (!voicingIndices.has(chordName)) {
      voicingIndices.set(chordName, { guitar: 0, ukulele: 0 });
    }
    voicingIndices.get(chordName)[instrument] = index;
  }
  const isAdmin = !!sessionStorage.getItem('chord_lab_auth');

  // Drag tracking (shared between main badges and custom combo)
  let dragSource = null;  // 'main' | 'custom'
  let dragChordName = '';
  let dragIdx = -1;

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

    const params = new URLSearchParams(window.location.search);
    const chordsParam = params.get('chords');
    const typeParam = params.get('type');

    if (chordsParam) {
      chords = chordsParam.split(',').map(c => c.trim()).filter(Boolean);
    }
    originalChords = chords.slice(); // save original order

    if (typeParam) {
      const validTypes = TABS.map(t => t.id);
      if (validTypes.includes(typeParam)) defaultType = typeParam;
    }
    currentType = defaultType || 'staff';

    if (isAdmin) {
      const adminControls = document.getElementById('adminControls');
      if (adminControls) adminControls.style.display = '';
      const backToLabLink = document.getElementById('backToLabLink');
      if (backToLabLink) backToLabLink.style.display = '';
    }

    setupGlobalTabs();
    if (isAdmin) setupAddChord();
    setupPlayAll();
    setupResetOrder();
    setupCustomCombo();
    setupHorizontalToggle();
    setupVoicingModal();
    render();

    // Open accordion by default on initial load, then auto-collapse after 1s
    const topBody = document.getElementById('topAccordionBody');
    const topToggle = document.getElementById('topAccordionToggle');
    const topHint = document.getElementById('topAccordionHint');
    if (topBody && chords.length > 0) {
      topBody.classList.add('open');
      if (topToggle) topToggle.classList.add('open');
      if (topHint) topHint.textContent = '접기';

      // Auto-collapse after 1s, then start attention animation
      setTimeout(() => {
        topBody.classList.remove('open');
        if (topToggle) topToggle.classList.remove('open');
        if (topHint) topHint.textContent = '열기';
        startNotationAttention();
      }, 1000);
    }
  }

  // =========================================
  // Notation Accordion Attention Animation
  // =========================================
  let _notationAttentionTimer = null;

  function startNotationAttention() {
    const el = document.getElementById('topAccordion');
    if (!el || el.classList.contains('hidden')) return;
    _notationAttentionTimer = setInterval(() => {
      el.classList.remove('notation-attention');
      void el.offsetWidth;
      el.classList.add('notation-attention');
    }, 1500);
  }

  function stopNotationAttention() {
    if (_notationAttentionTimer) {
      clearInterval(_notationAttentionTimer);
      _notationAttentionTimer = null;
    }
    const el = document.getElementById('topAccordion');
    if (el) el.classList.remove('notation-attention');
  }

  // =========================================
  // Global notation tab switching
  // =========================================

  function syncAllSelectors() {
    const tabObj = TABS.find(t => t.id === currentType) || TABS[0];
    const topLabel = document.getElementById('topAccordionLabel');
    if (topLabel) topLabel.textContent = tabObj.label;
    document.querySelectorAll('#topAccordionBody .top-accordion-row').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === currentType);
    });
    document.querySelectorAll('#fabAccordion .fab-accordion-item').forEach(item => {
      item.classList.toggle('active', item.dataset.type === currentType);
    });
  }

  function setupGlobalTabs() {
    const fabAccordion = document.getElementById('fabAccordion');
    const fabBtn = document.getElementById('fabNotation');
    const fabTop = document.getElementById('fabTop');
    const fabItems = fabAccordion.querySelectorAll('.fab-accordion-item');

    fabItems.forEach(item => {
      item.classList.toggle('active', item.dataset.type === currentType);
      item.addEventListener('click', () => {
        currentType = item.dataset.type;
        switchAllPanels(currentType);
        syncAllSelectors();
        // Capo types → keep FAB open so user can select capo
        if (!CAPO_TYPES.has(currentType)) {
          fabAccordion.classList.add('hidden');
        }
      });
    });

    fabBtn.addEventListener('click', () => {
      fabAccordion.classList.toggle('hidden');
    });

    fabTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.addEventListener('click', (e) => {
      if (!fabAccordion.contains(e.target) && e.target !== fabBtn && !fabBtn.contains(e.target)) {
        fabAccordion.classList.add('hidden');
      }
    });

    const topToggle = document.getElementById('topAccordionToggle');
    const topBody = document.getElementById('topAccordionBody');
    syncAllSelectors();

    const topHint = document.getElementById('topAccordionHint');
    topToggle.addEventListener('click', () => {
      const isOpen = topBody.classList.toggle('open');
      topToggle.classList.toggle('open', isOpen);
      if (topHint) topHint.textContent = isOpen ? '접기' : '열기';
    });

    topBody.querySelectorAll('.top-accordion-row').forEach(btn => {
      btn.addEventListener('click', () => {
        currentType = btn.dataset.type;
        switchAllPanels(currentType);
        syncAllSelectors();
        // Top accordion never auto-closes on type selection
      });
    });

    // Capo buttons (both top and FAB)
    setupCapoButtons();
  }

  function setupCapoButtons() {
    document.querySelectorAll('.capo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        capoPosition = parseInt(btn.dataset.capo, 10);
        // Sync all capo buttons (top + FAB)
        document.querySelectorAll('.capo-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.capo, 10) === capoPosition);
        });
        renderCards();
        // Close FAB accordion after capo selection (top accordion stays as-is)
        const fabAccordion = document.getElementById('fabAccordion');
        if (fabAccordion) fabAccordion.classList.add('hidden');
      });
    });
    // Direction toggle buttons
    document.querySelectorAll('.capo-dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        capoDirection = btn.dataset.dir;
        document.querySelectorAll('.capo-dir-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.dir === capoDirection);
        });
        renderCards();
      });
    });
  }

  function switchAllPanels(typeId) {
    document.querySelectorAll('.notation-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.type === typeId);
    });
    const tab = TABS.find(t => t.id === typeId);
    const instLabel = instrumentLabels[tab ? tab.instrument : 'piano'];
    document.querySelectorAll('.card-play-btn').forEach(btn => {
      btn.dataset.instrument = tab ? tab.instrument : 'piano';
      if (!btn.classList.contains('playing')) {
        if (btn.classList.contains('arp-btn')) {
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 14v-2h2v2H3zm3-3v-2h2v2H6zm3-3V6h2v2H9zm3-3V3h2v2h-2z"/></svg> 아르페지오`;
        } else {
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> 재생`;
        }
      }
    });
    // Show/hide capo row and card labels
    const showCapo = CAPO_TYPES.has(typeId);
    const capoRow = document.getElementById('capoRow');
    const fabCapoRow = document.getElementById('fabCapoRow');
    if (capoRow) capoRow.style.display = showCapo ? 'flex' : 'none';
    if (fabCapoRow) fabCapoRow.style.display = showCapo ? 'flex' : 'none';
    document.querySelectorAll('.capo-shape-label').forEach(label => {
      label.style.display = (showCapo && capoPosition > 0) ? '' : 'none';
    });
    // In horizontal mode, re-render since there are no per-card panels to toggle
    if (horizontalMode) renderCards();
  }

  // =========================================
  // Render
  // =========================================

  function render(skipURLUpdate) {
    renderBadges();
    renderCards();
    renderCustomCombo();
    updateResetBtn();
    if (!skipURLUpdate) updateURL();

    const emptyState = document.getElementById('emptyState');
    const cardsContainer = document.getElementById('chordCards');
    const fabContainer = document.getElementById('fabContainer');
    const topAccordion = document.getElementById('topAccordion');
    const customRow = document.getElementById('customComboRow');

    if (chords.length === 0) {
      emptyState.classList.remove('hidden');
      cardsContainer.classList.add('hidden');
      if (fabContainer) fabContainer.style.display = 'none';
      if (topAccordion) topAccordion.classList.add('hidden');
      if (customRow) customRow.style.display = 'none';
    } else {
      emptyState.classList.add('hidden');
      cardsContainer.classList.remove('hidden');
      if (fabContainer) fabContainer.style.display = '';
      if (topAccordion) topAccordion.classList.remove('hidden');
      if (customRow) customRow.style.display = '';
      // Sync capo row visibility with current type
      const showCapo = CAPO_TYPES.has(currentType);
      const capoRow = document.getElementById('capoRow');
      const fabCapoRow = document.getElementById('fabCapoRow');
      if (capoRow) capoRow.style.display = showCapo ? 'flex' : 'none';
      if (fabCapoRow) fabCapoRow.style.display = showCapo ? 'flex' : 'none';
    }
  }

  // =========================================
  // Reset Order
  // =========================================

  function setupResetOrder() {
    const btn = document.getElementById('resetOrderBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      chords = originalChords.slice();
      render(true); // skip URL update (already matches original)
    });
  }

  function updateResetBtn() {
    const btn = document.getElementById('resetOrderBtn');
    if (!btn) return;
    // Show if current order differs from original
    const changed = chords.length === originalChords.length
      && chords.some((c, i) => c !== originalChords[i]);
    btn.classList.toggle('visible', changed);
  }

  // =========================================
  // Badge rendering (everyone can drag to reorder)
  // =========================================

  function renderBadges() {
    const container = document.getElementById('chordBadges');
    // Remove only badge elements, keep static buttons
    container.querySelectorAll('.chord-chip').forEach(b => b.remove());
    const insertBefore = document.getElementById('resetOrderBtn');

    chords.forEach((name, i) => {
      const badge = document.createElement('span');
      badge.className = 'chord-chip';
      badge.draggable = true;
      badge.dataset.index = i;
      badge.dataset.chord = name;

      if (isAdmin) {
        badge.innerHTML = `${esc(name)}<button class="remove-chord" title="제거">&times;</button>`;
        badge.querySelector('.remove-chord').addEventListener('click', (e) => {
          e.stopPropagation();
          chords.splice(i, 1);
          // Also update original for admin add/remove
          originalChords = chords.slice();
          render();
        });
      } else {
        badge.textContent = name;
      }

      // Click to add to custom combo
      badge.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-chord')) return;
        customChords.push(name);
        renderCustomCombo();
      });

      // --- Desktop drag & drop ---
      badge.addEventListener('dragstart', (e) => {
        dragSource = 'main';
        dragChordName = name;
        dragIdx = i;
        badge.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('text/plain', name);
      });
      badge.addEventListener('dragend', () => {
        badge.style.opacity = '';
        dragSource = null;
        dragChordName = '';
        dragIdx = -1;
        container.querySelectorAll('.chord-chip').forEach(b => b.classList.remove('drag-over'));
      });
      badge.addEventListener('dragover', (e) => {
        if (dragSource !== 'main') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        badge.classList.add('drag-over');
      });
      badge.addEventListener('dragleave', () => {
        badge.classList.remove('drag-over');
      });
      badge.addEventListener('drop', (e) => {
        e.preventDefault();
        badge.classList.remove('drag-over');
        if (dragSource !== 'main' || dragIdx < 0 || dragIdx === i) return;
        const moved = chords.splice(dragIdx, 1)[0];
        chords.splice(i, 0, moved);
        render(true); // skip URL update → reorder is session-only
      });

      // --- Touch drag ---
      let touchClone = null;
      let touchStartIdx = -1;

      badge.addEventListener('touchstart', (e) => {
        if (e.target.classList.contains('remove-chord')) return;
        touchStartIdx = i;
        dragSource = 'main';
        dragChordName = name;
        const touch = e.touches[0];
        touchClone = badge.cloneNode(true);
        touchClone.style.cssText = `position:fixed;z-index:9999;pointer-events:none;opacity:0.8;
          left:${touch.clientX - 30}px;top:${touch.clientY - 15}px;`;
        document.body.appendChild(touchClone);
        badge.style.opacity = '0.4';
      }, { passive: true });

      badge.addEventListener('touchmove', (e) => {
        if (!touchClone) return;
        e.preventDefault();
        const touch = e.touches[0];
        touchClone.style.left = `${touch.clientX - 30}px`;
        touchClone.style.top = `${touch.clientY - 15}px`;
        // Clear all highlights
        container.querySelectorAll('.chord-chip').forEach(b => b.classList.remove('drag-over'));
        const customZone = document.getElementById('customComboZone');
        if (customZone) customZone.classList.remove('drag-over');
        // Highlight target
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (el) {
          if (el.closest('.chord-chip') && el.closest('#chordBadges')) {
            el.closest('.chord-chip').classList.add('drag-over');
          } else if (el.closest('#customComboZone')) {
            customZone.classList.add('drag-over');
          }
        }
      }, { passive: false });

      badge.addEventListener('touchend', (e) => {
        if (!touchClone) return;
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const customZone = document.getElementById('customComboZone');

        if (el && el.closest('#customComboZone')) {
          // Dropped on custom zone → add chord
          customChords.push(name);
          renderCustomCombo();
        } else {
          // Check reorder within badges
          const target = el && el.closest('.chord-chip');
          if (target && target.closest('#chordBadges')) {
            const targetIdx = Array.from(container.children).indexOf(target);
            if (targetIdx >= 0 && targetIdx !== touchStartIdx) {
              const moved = chords.splice(touchStartIdx, 1)[0];
              chords.splice(targetIdx, 0, moved);
              render(true);
            }
          }
        }

        badge.style.opacity = '';
        touchClone.remove();
        touchClone = null;
        if (customZone) customZone.classList.remove('drag-over');
        container.querySelectorAll('.chord-chip').forEach(b => b.classList.remove('drag-over'));
        dragSource = null;
        dragChordName = '';
      });

      container.insertBefore(badge, insertBefore);
    });
  }

  // =========================================
  // Card rendering (unchanged)
  // =========================================

  function renderCards() {
    const container = document.getElementById('chordCards');
    container.innerHTML = '';

    if (horizontalMode) {
      renderHorizontalView(container);
      return;
    }

    const cardPairs = [];
    chords.forEach(name => {
      const card = createChordCard(name);
      container.appendChild(card);
      cardPairs.push({ card, name });
    });
    cardPairs.forEach(({ card, name }) => {
      renderCardNotations(card, name);
    });
  }

  function renderHorizontalView(container) {
    // Build chord list with capo transposition applied
    const displayChords = chords.map(name => {
      if (capoPosition > 0 && CAPO_TYPES.has(currentType)) {
        return MusicTheory.transposeChord(name, capoDirection === 'up' ? capoPosition : -capoPosition);
      }
      return name;
    });

    // Capo info bar
    if (capoPosition > 0 && CAPO_TYPES.has(currentType)) {
      const capoInfo = document.createElement('div');
      capoInfo.className = 'horizontal-capo-info';
      capoInfo.textContent = capoDirection === 'up'
        ? `카포 ${capoPosition} → 실음 표시`
        : `카포 ${capoPosition} → 셰이프 표시`;
      container.appendChild(capoInfo);
    }

    // Single notation panel
    const panel = document.createElement('div');
    panel.className = 'horizontal-panel';
    container.appendChild(panel);

    switch (currentType) {
      case 'staff': Renderers.renderStaffNotation(panel, displayChords); break;
      case 'guitar-tab': {
        const idxMap = {};
        displayChords.forEach(n => { idxMap[n] = getVoicingIndex(n, 'guitar'); });
        Renderers.renderGuitarTab(panel, displayChords, idxMap);
        break;
      }
      case 'guitar-diagram': {
        const idxMap = {};
        displayChords.forEach(n => { idxMap[n] = getVoicingIndex(n, 'guitar'); });
        Renderers.renderGuitarDiagrams(panel, displayChords, idxMap);
        break;
      }
      case 'ukulele-tab': {
        const idxMap = {};
        displayChords.forEach(n => { idxMap[n] = getVoicingIndex(n, 'ukulele'); });
        Renderers.renderUkuleleTab(panel, displayChords, idxMap);
        break;
      }
      case 'ukulele-diagram': {
        const idxMap = {};
        displayChords.forEach(n => { idxMap[n] = getVoicingIndex(n, 'ukulele'); });
        Renderers.renderUkuleleDiagrams(panel, displayChords, idxMap);
        break;
      }
      case 'piano': Renderers.renderPianoKeyboards(panel, displayChords); break;
    }
  }

  function renderCardNotations(card, chordName) {
    const transposedName = capoPosition > 0
      ? MusicTheory.transposeChord(chordName, capoDirection === 'up' ? capoPosition : -capoPosition)
      : chordName;

    card.querySelectorAll('.notation-panel').forEach(panel => {
      const type = panel.dataset.type;
      const useChord = CAPO_TYPES.has(type) && capoPosition > 0 ? transposedName : chordName;
      const singleChord = [useChord];
      switch (type) {
        case 'staff': Renderers.renderStaffNotation(panel, singleChord); break;
        case 'guitar-tab': {
          const idxMap = { [useChord]: getVoicingIndex(useChord, 'guitar') };
          Renderers.renderGuitarTab(panel, singleChord, idxMap);
          addVoicingControls(panel, useChord, 'guitar', card, chordName, 'tab');
          break;
        }
        case 'guitar-diagram': {
          const idxMap = { [useChord]: getVoicingIndex(useChord, 'guitar') };
          Renderers.renderGuitarDiagrams(panel, singleChord, idxMap);
          addVoicingControls(panel, useChord, 'guitar', card, chordName, 'diagram');
          break;
        }
        case 'ukulele-tab': {
          const idxMap = { [useChord]: getVoicingIndex(useChord, 'ukulele') };
          Renderers.renderUkuleleTab(panel, singleChord, idxMap);
          addVoicingControls(panel, useChord, 'ukulele', card, chordName, 'tab');
          break;
        }
        case 'ukulele-diagram': {
          const idxMap = { [useChord]: getVoicingIndex(useChord, 'ukulele') };
          Renderers.renderUkuleleDiagrams(panel, singleChord, idxMap);
          addVoicingControls(panel, useChord, 'ukulele', card, chordName, 'diagram');
          break;
        }
        case 'piano': Renderers.renderPianoKeyboards(panel, singleChord); break;
      }
    });

    // Update capo label on card
    const capoLabel = card.querySelector('.capo-shape-label');
    if (capoPosition > 0 && CAPO_TYPES.has(currentType)) {
      if (capoLabel) {
        capoLabel.textContent = capoDirection === 'up'
          ? `${chordName} 폼 + 카포 ${capoPosition} = ${transposedName} 실음`
          : `카포 ${capoPosition} → ${transposedName} 폼`;
        capoLabel.style.display = '';
      }
    } else {
      if (capoLabel) capoLabel.style.display = 'none';
    }
  }

  /**
   * Add voicing navigation controls below a diagram panel
   */
  function addVoicingControls(panel, useChord, instrument, card, originalChordName, notationType) {
    const positions = instrument === 'guitar'
      ? ChordDB.getGuitarChord(useChord)
      : ChordDB.getUkuleleChord(useChord);
    if (!positions || positions.length <= 1) return;

    const total = positions.length;
    const currentIdx = getVoicingIndex(useChord, instrument);

    const controls = document.createElement('div');
    controls.className = 'voicing-controls';
    controls.innerHTML =
      `<button class="voicing-nav voicing-prev" title="이전 운지법">&#8249;</button>` +
      `<span class="voicing-indicator">${currentIdx + 1} / ${total}</span>` +
      `<button class="voicing-nav voicing-next" title="다음 운지법">&#8250;</button>` +
      `<button class="voicing-all-btn" title="모든 운지법 보기">&#8943;</button>`;

    controls.querySelector('.voicing-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      setVoicingIndex(useChord, instrument, (currentIdx - 1 + total) % total);
      renderCardNotations(card, originalChordName);
    });
    controls.querySelector('.voicing-next').addEventListener('click', (e) => {
      e.stopPropagation();
      setVoicingIndex(useChord, instrument, (currentIdx + 1) % total);
      renderCardNotations(card, originalChordName);
    });
    controls.querySelector('.voicing-all-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openVoicingModal(useChord, instrument, card, originalChordName, notationType);
    });

    panel.appendChild(controls);
  }

  function createChordCard(chordName) {
    const card = document.createElement('div');
    card.className = 'chord-card';
    card.id = `card-${chordName}`;

    const header = document.createElement('div');
    header.className = 'card-header';

    const left = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-2xl font-bold text-gray-800 mb-1';
    title.textContent = chordName;
    left.appendChild(title);

    const notesDiv = document.createElement('div');
    notesDiv.className = 'flex flex-wrap gap-1';
    const chordNotes = MusicTheory.getChordNotesDisplay(chordName);
    chordNotes.forEach(note => {
      const badge = document.createElement('span');
      badge.className = 'chord-notes-badge highlighted';
      badge.textContent = MusicTheory.formatNoteDisplay(note);
      notesDiv.appendChild(badge);
    });

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

    // Capo shape label
    const capoLabel = document.createElement('div');
    capoLabel.className = 'capo-shape-label';
    capoLabel.style.display = 'none';
    left.appendChild(capoLabel);

    const currentTab = TABS.find(t => t.id === currentType) || TABS[0];

    // Button container for play + arpeggio
    const btnGroup = document.createElement('div');
    btnGroup.className = 'play-btn-group';

    const playBtn = document.createElement('button');
    playBtn.className = 'play-btn card-play-btn';
    playBtn.dataset.instrument = currentTab.instrument;
    playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> 재생`;
    playBtn.addEventListener('click', async () => {
      const inst = playBtn.dataset.instrument;
      playBtn.classList.add('playing');
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg> 재생 중`;
      await ChordAudio.playChord(chordName, 2.0, inst);
      playBtn.classList.remove('playing');
      playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> 재생`;
    });

    const arpBtn = document.createElement('button');
    arpBtn.className = 'play-btn arp-btn card-play-btn';
    arpBtn.dataset.instrument = currentTab.instrument;
    arpBtn.title = '아르페지오 (한 음씩 상행)';
    arpBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 14v-2h2v2H3zm3-3v-2h2v2H6zm3-3V6h2v2H9zm3-3V3h2v2h-2z"/></svg> 아르페지오`;
    arpBtn.addEventListener('click', async () => {
      const inst = arpBtn.dataset.instrument;
      arpBtn.classList.add('playing');
      arpBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg> 재생 중`;
      await ChordAudio.playChordArpeggio(chordName, 0.18, 1.2, inst);
      arpBtn.classList.remove('playing');
      arpBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 14v-2h2v2H3zm3-3v-2h2v2H6zm3-3V6h2v2H9zm3-3V3h2v2h-2z"/></svg> 아르페지오`;
    });

    btnGroup.appendChild(playBtn);
    btnGroup.appendChild(arpBtn);

    header.appendChild(left);
    header.appendChild(btnGroup);
    card.appendChild(header);

    TABS.forEach(({ id }) => {
      const panel = document.createElement('div');
      panel.className = `notation-panel${id === currentType ? ' active' : ''}`;
      panel.dataset.type = id;
      card.appendChild(panel);
    });

    return card;
  }

  // =========================================
  // Admin: add chord
  // =========================================

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
        originalChords = chords.slice(); // admin add updates original
        render();
      }
      input.value = '';
    }

    btn.addEventListener('click', addFromInput);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addFromInput(); }
    });
  }

  // =========================================
  // Custom Combo Builder
  // =========================================

  function setupCustomCombo() {
    const zone = document.getElementById('customComboZone');
    if (!zone) return;

    // Desktop drop on zone (append to end)
    zone.addEventListener('dragover', (e) => {
      if (dragSource === 'main' || dragSource === 'custom') {
        e.preventDefault();
        e.dataTransfer.dropEffect = dragSource === 'main' ? 'copy' : 'move';
        zone.classList.add('drag-over');
      }
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('drag-over');
      }
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (dragSource === 'main' && dragChordName) {
        customChords.push(dragChordName);
        renderCustomCombo();
      }
      // custom → custom reorder is handled by chip drop handlers
    });

    // Play button
    const playBtn = document.getElementById('customPlayBtn');
    playBtn.addEventListener('click', () => {
      if (playBtn.classList.contains('playing')) {
        ChordAudio.stopPlayback();
        resetCustomPlayUI();
        resetPlayAllUI();
        return;
      }
      playCustomCombo();
    });

    // Clear button
    const clearBtn = document.getElementById('customClearBtn');
    clearBtn.addEventListener('click', () => {
      customChords = [];
      renderCustomCombo();
    });
  }

  function renderCustomCombo() {
    const zone = document.getElementById('customComboZone');
    const playBtn = document.getElementById('customPlayBtn');
    const clearBtn = document.getElementById('customClearBtn');
    if (!zone) return;

    zone.innerHTML = '';

    if (customChords.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'drop-hint';
      hint.textContent = '코드를 클릭하거나 끌어다 놓아 추가하세요';
      zone.appendChild(hint);
      if (playBtn) playBtn.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    if (playBtn) playBtn.style.display = '';
    if (clearBtn) clearBtn.style.display = '';

    customChords.forEach((name, i) => {
      // Arrow between chips
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'custom-arrow';
        arrow.textContent = '→';
        zone.appendChild(arrow);
      }

      const chip = document.createElement('span');
      chip.className = 'custom-combo-chip';
      chip.draggable = true;
      chip.dataset.index = i;
      chip.dataset.chord = name;
      chip.innerHTML = `${esc(name)}<button class="remove-custom" title="제거">&times;</button>`;

      chip.querySelector('.remove-custom').addEventListener('click', (e) => {
        e.stopPropagation();
        customChords.splice(i, 1);
        renderCustomCombo();
      });

      // Drag to reorder within custom zone
      chip.addEventListener('dragstart', (e) => {
        dragSource = 'custom';
        dragChordName = name;
        dragIdx = i;
        chip.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', name);
      });
      chip.addEventListener('dragend', () => {
        chip.style.opacity = '';
        dragSource = null;
        dragChordName = '';
        dragIdx = -1;
        zone.querySelectorAll('.custom-combo-chip').forEach(c => c.classList.remove('drag-over'));
      });
      chip.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragSource === 'custom') {
          e.dataTransfer.dropEffect = 'move';
          chip.classList.add('drag-over');
        } else if (dragSource === 'main') {
          e.dataTransfer.dropEffect = 'copy';
          chip.classList.add('drag-over');
        }
      });
      chip.addEventListener('dragleave', () => {
        chip.classList.remove('drag-over');
      });
      chip.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation(); // prevent zone-level drop
        chip.classList.remove('drag-over');
        if (dragSource === 'custom' && dragIdx >= 0 && dragIdx !== i) {
          const moved = customChords.splice(dragIdx, 1)[0];
          customChords.splice(i, 0, moved);
          renderCustomCombo();
        } else if (dragSource === 'main' && dragChordName) {
          // Insert after this chip
          customChords.splice(i + 1, 0, dragChordName);
          renderCustomCombo();
        }
      });

      // Touch drag for custom chips
      let touchClone = null;
      let touchStartIdx = -1;

      chip.addEventListener('touchstart', (e) => {
        if (e.target.classList.contains('remove-custom')) return;
        touchStartIdx = i;
        dragSource = 'custom';
        dragChordName = name;
        const touch = e.touches[0];
        touchClone = chip.cloneNode(true);
        touchClone.style.cssText = `position:fixed;z-index:9999;pointer-events:none;opacity:0.8;
          left:${touch.clientX - 30}px;top:${touch.clientY - 12}px;`;
        document.body.appendChild(touchClone);
        chip.style.opacity = '0.4';
      }, { passive: true });

      chip.addEventListener('touchmove', (e) => {
        if (!touchClone) return;
        e.preventDefault();
        const touch = e.touches[0];
        touchClone.style.left = `${touch.clientX - 30}px`;
        touchClone.style.top = `${touch.clientY - 12}px`;
        zone.querySelectorAll('.custom-combo-chip').forEach(c => c.classList.remove('drag-over'));
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (el && el.closest('.custom-combo-chip')) {
          el.closest('.custom-combo-chip').classList.add('drag-over');
        }
      }, { passive: false });

      chip.addEventListener('touchend', (e) => {
        if (!touchClone) return;
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const target = el && el.closest('.custom-combo-chip');
        if (target) {
          const targetIdx = parseInt(target.dataset.index);
          if (!isNaN(targetIdx) && targetIdx !== touchStartIdx) {
            const moved = customChords.splice(touchStartIdx, 1)[0];
            customChords.splice(targetIdx, 0, moved);
            renderCustomCombo();
          }
        }
        chip.style.opacity = '';
        touchClone.remove();
        touchClone = null;
        zone.querySelectorAll('.custom-combo-chip').forEach(c => c.classList.remove('drag-over'));
        dragSource = null;
        dragChordName = '';
      });

      zone.appendChild(chip);
    });
  }

  // =========================================
  // Custom combo playback
  // =========================================

  let customPlayGen = 0;

  function resetCustomPlayUI() {
    const btn = document.getElementById('customPlayBtn');
    if (!btn) return;
    btn.classList.remove('playing');
    btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> 재생';
    btn.classList.remove('bg-red-500', 'hover:bg-red-600');
    btn.classList.add('bg-amber-500', 'hover:bg-amber-600');
    document.querySelectorAll('#customComboZone .custom-combo-chip').forEach(c => c.classList.remove('playing'));
    hidePlaybackModal();
  }

  async function playCustomCombo() {
    if (customChords.length === 0) return;

    // Cancel any main playback
    resetPlayAllUI();

    customPlayGen++;
    const myGen = customPlayGen;

    const btn = document.getElementById('customPlayBtn');
    btn.classList.add('playing');
    btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg> 정지';
    btn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
    btn.classList.add('bg-red-500', 'hover:bg-red-600');

    const currentTab = TABS.find(t => t.id === currentType) || TABS[0];
    await ChordAudio.playChordSequence(customChords, 2.0, (name, idx) => {
      if (myGen !== customPlayGen) return;
      const chips = document.querySelectorAll('#customComboZone .custom-combo-chip');
      chips.forEach(c => c.classList.remove('playing'));
      if (idx >= 0 && idx < chips.length) chips[idx].classList.add('playing');
      showPlaybackModal(name);
    }, currentTab.instrument);

    if (myGen === customPlayGen) {
      resetCustomPlayUI();
    }
  }

  // =========================================
  // Playback modal (bottom sheet)
  // =========================================

  function showPlaybackModal(chordName) {
    const modal = document.getElementById('playbackModal');
    const titleEl = document.getElementById('playbackModalTitle');
    const typeEl = document.getElementById('playbackModalType');
    const notesEl = document.getElementById('playbackModalNotes');
    const contentEl = document.getElementById('playbackModalContent');

    titleEl.textContent = chordName;

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
      typeEl.textContent = typeNames[intervalKey] || parsed.suffix || '';
    } else {
      typeEl.textContent = '';
    }

    notesEl.innerHTML = '';
    MusicTheory.getChordNotesDisplay(chordName).forEach(n => {
      const badge = document.createElement('span');
      badge.className = 'chord-notes-badge highlighted';
      badge.textContent = MusicTheory.formatNoteDisplay(n);
      notesEl.appendChild(badge);
    });

    contentEl.innerHTML = '';
    const panel = document.createElement('div');
    const transposedName = (capoPosition > 0 && CAPO_TYPES.has(currentType))
      ? MusicTheory.transposeChord(chordName, capoDirection === 'up' ? capoPosition : -capoPosition)
      : chordName;
    const singleChord = [transposedName];
    switch (currentType) {
      case 'staff': Renderers.renderStaffNotation(panel, singleChord); break;
      case 'guitar-tab': Renderers.renderGuitarTab(panel, singleChord); break;
      case 'guitar-diagram': Renderers.renderGuitarDiagrams(panel, singleChord); break;
      case 'ukulele-tab': Renderers.renderUkuleleTab(panel, singleChord); break;
      case 'ukulele-diagram': Renderers.renderUkuleleDiagrams(panel, singleChord); break;
      case 'piano': Renderers.renderPianoKeyboards(panel, singleChord); break;
    }
    contentEl.appendChild(panel);

    modal.classList.add('show');
  }

  function hidePlaybackModal() {
    document.getElementById('playbackModal').classList.remove('show');
  }

  // =========================================
  // Main play all
  // =========================================

  function highlightBadge(idx) {
    const badges = document.querySelectorAll('#chordBadges .chord-chip');
    badges.forEach(b => b.classList.remove('playing'));
    if (idx >= 0 && idx < badges.length) {
      badges[idx].classList.add('playing');
    }
  }

  function clearBadgeHighlights() {
    document.querySelectorAll('#chordBadges .chord-chip').forEach(b => b.classList.remove('playing'));
  }

  let playAllGen = 0;

  function resetPlayAllUI() {
    const btn = document.getElementById('playAllBtn');
    btn.classList.remove('playing');
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg> 전체 재생';
    clearBadgeHighlights();
    hidePlaybackModal();
  }

  function setupPlayAll() {
    const btn = document.getElementById('playAllBtn');
    btn.addEventListener('click', async () => {
      // If main is playing, stop
      if (btn.classList.contains('playing')) {
        ChordAudio.stopPlayback();
        resetPlayAllUI();
        resetCustomPlayUI();
        return;
      }

      // Cancel any custom playback
      resetCustomPlayUI();

      playAllGen++;
      const myGen = playAllGen;

      btn.classList.add('playing');
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg> 정지';

      await ChordAudio.playChordSequence(chords, 2.0, (name, idx) => {
        if (myGen !== playAllGen) return;
        highlightBadge(idx);
        showPlaybackModal(name);
      });

      if (myGen === playAllGen) {
        resetPlayAllUI();
      }
    });
  }

  // =========================================
  // Horizontal mode toggle
  // =========================================

  function setupHorizontalToggle() {
    const btn = document.getElementById('horizontalToggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
      horizontalMode = !horizontalMode;
      btn.classList.toggle('active', horizontalMode);
      renderCards();
    });
  }

  // =========================================
  // URL & Utility
  // =========================================

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

  // =========================================
  // Voicing Modal
  // =========================================
  let activeVoicingModal = null;

  function setupVoicingModal() {
    const overlay = document.getElementById('voicingModal');
    const closeBtn = document.getElementById('voicingModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeVoicingModal);
    if (overlay) overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeVoicingModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
        closeVoicingModal();
      }
    });
  }

  function openVoicingModal(chordName, instrument, card, originalChordName, notationType) {
    const overlay = document.getElementById('voicingModal');
    const title = document.getElementById('voicingModalTitle');
    const grid = document.getElementById('voicingModalGrid');
    if (!overlay || !grid) return;

    const positions = instrument === 'guitar'
      ? ChordDB.getGuitarChord(chordName)
      : ChordDB.getUkuleleChord(chordName);
    if (!positions || positions.length === 0) return;

    activeVoicingModal = { chordName, instrument, card, originalChordName };
    const currentIdx = getVoicingIndex(chordName, instrument);
    const isTab = notationType === 'tab';

    title.textContent = `${chordName} 운지법 (${positions.length}개)`;
    grid.innerHTML = '';
    // Switch grid layout for tab vs diagram
    grid.classList.toggle('voicing-modal-grid-tab', isTab);

    if (isTab) {
      // Tab mode: render each voicing as a single-chord tab (compact width for bigger display)
      const renderTabFn = instrument === 'guitar'
        ? Renderers.renderGuitarTab
        : Renderers.renderUkuleleTab;
      const compactWidth = instrument === 'guitar' ? 130 : 110;

      positions.forEach((pos, i) => {
        const item = document.createElement('div');
        item.className = 'voicing-modal-item voicing-modal-item-tab' + (i === currentIdx ? ' selected' : '');

        const numberLabel = document.createElement('span');
        numberLabel.className = 'voicing-number';
        numberLabel.textContent = `#${i + 1}`;
        item.appendChild(numberLabel);

        const tabContainer = document.createElement('div');
        tabContainer.style.overflow = 'hidden';
        item.appendChild(tabContainer);

        renderTabFn(tabContainer, [chordName], { [chordName]: i }, { compactWidth });

        item.addEventListener('click', () => {
          setVoicingIndex(chordName, instrument, i);
          renderCardNotations(activeVoicingModal.card, activeVoicingModal.originalChordName);
          closeVoicingModal();
        });

        grid.appendChild(item);
      });
    } else {
      // Diagram mode
      const drawFn = instrument === 'guitar'
        ? Renderers.drawGuitarDiagram
        : Renderers.drawUkuleleDiagram;

      positions.forEach((pos, i) => {
        const item = document.createElement('div');
        item.className = 'voicing-modal-item' + (i === currentIdx ? ' selected' : '');

        const numberLabel = document.createElement('span');
        numberLabel.className = 'voicing-number';
        numberLabel.textContent = `#${i + 1}`;
        item.appendChild(numberLabel);

        const svgContainer = document.createElement('div');
        svgContainer.style.width = instrument === 'guitar' ? '100px' : '80px';
        svgContainer.style.height = '150px';
        svgContainer.style.margin = '0 auto';
        item.appendChild(svgContainer);

        drawFn(svgContainer, pos, chordName);

        item.addEventListener('click', () => {
          setVoicingIndex(chordName, instrument, i);
          renderCardNotations(activeVoicingModal.card, activeVoicingModal.originalChordName);
          closeVoicingModal();
        });

        grid.appendChild(item);
      });
    }

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeVoicingModal() {
    const overlay = document.getElementById('voicingModal');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
    activeVoicingModal = null;
  }

  return {};
})();
