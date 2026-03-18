/**
 * Song Database Module
 * Handles Synology NAS API communication for song CRUD operations.
 */
const SongDB = (() => {
  const API_BASE = 'https://mosica.net/chord-lab-api/index.php';
  const API_KEY = '096d10b7d1134473f2e9634089329a7893f6e06521f0ede251c9ab3f6be6f50b';

  let currentPage = 1;
  let currentQuery = '';
  let debounceTimer = null;
  const TRASH_KEY = 'songChordLab_trash';

  /* ── Trash (localStorage) ── */

  function getTrash() {
    try {
      return JSON.parse(localStorage.getItem(TRASH_KEY) || '[]');
    } catch { return []; }
  }

  function saveTrash(items) {
    localStorage.setItem(TRASH_KEY, JSON.stringify(items));
    updateTrashCount();
  }

  function addToTrash(songRaw) {
    const trash = getTrash();
    trash.unshift({
      ...songRaw,
      _deletedAt: new Date().toISOString(),
    });
    saveTrash(trash);
  }

  function removeFromTrash(index) {
    const trash = getTrash();
    trash.splice(index, 1);
    saveTrash(trash);
  }

  function updateTrashCount() {
    const badge = document.getElementById('dbTrashCount');
    if (!badge) return;
    const count = getTrash().length;
    badge.textContent = count > 0 ? `(${count})` : '';
  }

  /* ── API helpers ── */

  async function apiRequest(url, options = {}) {
    options.headers = {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...(options.headers || {}),
    };
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (e) {
      if (e.name === 'TypeError') {
        throw new Error('NAS 서버에 연결할 수 없습니다.');
      }
      throw e;
    }
  }

  /**
   * Save current song to DB (upsert by song_name + artist)
   */
  async function saveSong(state) {
    return apiRequest(`${API_BASE}?action=save`, {
      method: 'POST',
      body: JSON.stringify({
        song_name: state.metadata.songName,
        artist: state.metadata.artist,
        album_name: state.metadata.albumName,
        composer: state.metadata.composer,
        lyricist: state.metadata.lyricist,
        tempo: state.metadata.tempo,
        time_signature: state.metadata.timeSignature,
        key_signature: state.metadata.key,
        lyrics_intro: state.metadata.lyricsIntro,
        genius_url: state.metadata.geniusUrl || '',
        apple_music_url: state.metadata.appleMusicUrl || '',
        selected_chords: state.selectedChords,
        capo_position: state.capoPosition,
      }),
    });
  }

  /**
   * Search songs by query string
   */
  const PER_PAGE = 7;

  async function searchSongs(query, page = 1) {
    return apiRequest(`${API_BASE}?action=search&q=${encodeURIComponent(query)}&page=${page}&per_page=${PER_PAGE}`);
  }

  /**
   * Get recent songs
   */
  async function recentSongs(page = 1) {
    return apiRequest(`${API_BASE}?action=recent&page=${page}&per_page=${PER_PAGE}`);
  }

  /**
   * Load a single song by ID and return in App.state format
   */
  async function loadSong(id) {
    const s = await apiRequest(`${API_BASE}?action=get&id=${id}`);
    return {
      metadata: {
        songName: s.song_name || '',
        artist: s.artist || '',
        albumName: s.album_name || '',
        composer: s.composer || '',
        lyricist: s.lyricist || '',
        tempo: s.tempo || '',
        timeSignature: s.time_signature || '',
        key: s.key_signature || '',
        lyricsIntro: s.lyrics_intro || '',
        geniusUrl: s.genius_url || '',
        appleMusicUrl: s.apple_music_url || '',
      },
      selectedChords: s.selected_chords || [],
      capoPosition: s.capo_position || 0,
    };
  }

  /**
   * Delete a song by ID
   */
  async function deleteSong(id) {
    return apiRequest(`${API_BASE}?action=delete&id=${id}`, { method: 'DELETE' });
  }

  /* ── UI ── */

  function renderResults(data) {
    const container = document.getElementById('dbSearchResults');
    const pagination = document.getElementById('dbPagination');

    if (!data.songs || data.songs.length === 0) {
      container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">검색 결과가 없습니다.</p>';
      pagination.innerHTML = '';
      return;
    }

    // Limit display to PER_PAGE items (safety fallback if server ignores per_page)
    const songs = data.songs.slice(0, PER_PAGE);

    container.innerHTML = songs.map(s => {
      const date = (s.updated_at || '').substring(0, 10);
      return `
        <div class="db-result-item" data-id="${s.id}">
          <div style="flex:1;min-width:0;">
            <div class="db-result-title">${escapeHtml(s.song_name)}</div>
            <div class="db-result-meta">${escapeHtml(s.artist || '아티스트 없음')}${s.album_name ? ' · ' + escapeHtml(s.album_name) : ''}${s.key_signature ? ' · ' + s.key_signature : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span class="text-xs text-gray-400" style="white-space:nowrap;">${date}</span>
            <button class="db-action-btn db-edit-btn" data-id="${s.id}" title="수정">수정</button>
            <button class="db-action-btn db-delete-btn" data-id="${s.id}" title="삭제">삭제</button>
          </div>
        </div>`;
    }).join('');

    // Click row to load
    container.querySelectorAll('.db-result-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('.db-action-btn')) return;
        const id = el.dataset.id;
        try {
          el.style.opacity = '0.5';
          const songData = await loadSong(id);
          App.loadFromDB(songData);
          document.getElementById('dbLoadModal').classList.add('hidden');
        } catch (err) {
          alert('불러오기 실패: ' + err.message);
          el.style.opacity = '1';
        }
      });
    });

    // Edit buttons — load song, close modal (user edits, then saves to overwrite)
    container.querySelectorAll('.db-edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          btn.textContent = '...';
          const songData = await loadSong(id);
          App.loadFromDB(songData, true);
          document.getElementById('dbLoadModal').classList.add('hidden');
        } catch (err) {
          alert('불러오기 실패: ' + err.message);
          btn.textContent = '수정';
        }
      });
    });

    // Delete buttons — move to trash first, then delete from DB
    container.querySelectorAll('.db-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          btn.textContent = '...';
          // Save song data to trash before deleting
          const songRaw = await apiRequest(`${API_BASE}?action=get&id=${id}`);
          addToTrash(songRaw);
          await deleteSong(id);
          loadResults();
        } catch (err) {
          alert('삭제 실패: ' + err.message);
          btn.textContent = '삭제';
        }
      });
    });

    // Pagination
    if (data.totalPages > 1) {
      pagination.innerHTML = `
        <button class="db-page-btn text-xs px-3 py-1 border rounded ${data.page <= 1 ? 'opacity-30' : 'hover:bg-gray-100'}" ${data.page <= 1 ? 'disabled' : ''} data-page="${data.page - 1}">&laquo; 이전</button>
        <span class="text-xs text-gray-500">${data.page} / ${data.totalPages}</span>
        <button class="db-page-btn text-xs px-3 py-1 border rounded ${data.page >= data.totalPages ? 'opacity-30' : 'hover:bg-gray-100'}" ${data.page >= data.totalPages ? 'disabled' : ''} data-page="${data.page + 1}">다음 &raquo;</button>`;

      pagination.querySelectorAll('.db-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          currentPage = parseInt(btn.dataset.page);
          loadResults();
        });
      });
    } else {
      pagination.innerHTML = '';
    }
  }

  async function loadResults() {
    const container = document.getElementById('dbSearchResults');
    container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">로딩 중...</p>';
    try {
      const data = currentQuery
        ? await searchSongs(currentQuery, currentPage)
        : await recentSongs(currentPage);
      renderResults(data);
    } catch (err) {
      container.innerHTML = `<p class="text-sm text-red-500 text-center py-8">${err.message}</p>`;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Trash UI ── */

  function renderTrash() {
    const container = document.getElementById('dbTrashResults');
    const actions = document.getElementById('dbTrashActions');
    const trash = getTrash();

    if (trash.length === 0) {
      container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">휴지통이 비어있습니다.</p>';
      actions.innerHTML = '';
      return;
    }

    container.innerHTML = trash.map((s, i) => {
      const deletedDate = (s._deletedAt || '').substring(0, 10);
      return `
        <div class="db-result-item">
          <div style="flex:1;min-width:0;">
            <div class="db-result-title" style="opacity:0.6;">${escapeHtml(s.song_name || '')}</div>
            <div class="db-result-meta">${escapeHtml(s.artist || '아티스트 없음')}${s.album_name ? ' · ' + escapeHtml(s.album_name) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span class="text-xs text-gray-400" style="white-space:nowrap;">${deletedDate}</span>
            <button class="db-action-btn db-restore-btn" data-idx="${i}" title="복원" style="background:#10b981;color:white;">복원</button>
            <button class="db-action-btn db-perma-delete-btn" data-idx="${i}" title="영구 삭제" style="background:#ef4444;color:white;">영구삭제</button>
          </div>
        </div>`;
    }).join('');

    // Restore buttons
    container.querySelectorAll('.db-restore-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        const item = trash[idx];
        try {
          btn.textContent = '...';
          // Re-save to DB
          await apiRequest(`${API_BASE}?action=save`, {
            method: 'POST',
            body: JSON.stringify({
              song_name: item.song_name,
              artist: item.artist,
              album_name: item.album_name || '',
              composer: item.composer || '',
              lyricist: item.lyricist || '',
              tempo: item.tempo || '',
              time_signature: item.time_signature || '',
              key_signature: item.key_signature || '',
              lyrics_intro: item.lyrics_intro || '',
              genius_url: item.genius_url || '',
              apple_music_url: item.apple_music_url || '',
              selected_chords: item.selected_chords || [],
              capo_position: item.capo_position || 0,
            }),
          });
          removeFromTrash(idx);
          renderTrash();
        } catch (err) {
          alert('복원 실패: ' + err.message);
          btn.textContent = '복원';
        }
      });
    });

    // Permanent delete buttons
    container.querySelectorAll('.db-perma-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        removeFromTrash(idx);
        renderTrash();
      });
    });

    // Empty all
    actions.innerHTML = `<button id="dbEmptyTrash" class="text-xs px-4 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 font-medium">휴지통 비우기</button>`;
    document.getElementById('dbEmptyTrash').addEventListener('click', () => {
      if (!confirm('휴지통을 비울까요? 영구적으로 삭제됩니다.')) return;
      saveTrash([]);
      renderTrash();
    });
  }

  function switchTab(tab) {
    const songsTab = document.getElementById('dbSongsTab');
    const trashTab = document.getElementById('dbTrashTab');
    const tabSongs = document.getElementById('dbTabSongs');
    const tabTrash = document.getElementById('dbTabTrash');

    if (tab === 'trash') {
      songsTab.style.display = 'none';
      trashTab.style.display = '';
      trashTab.classList.remove('hidden');
      tabSongs.className = 'text-sm font-medium px-3 py-1 rounded-lg text-gray-400 hover:text-gray-600';
      tabTrash.className = 'text-sm font-semibold px-3 py-1 rounded-lg bg-red-100 text-red-700';
      renderTrash();
    } else {
      songsTab.style.display = '';
      trashTab.style.display = 'none';
      tabSongs.className = 'text-sm font-semibold px-3 py-1 rounded-lg bg-blue-100 text-blue-700';
      tabTrash.className = 'text-sm font-medium px-3 py-1 rounded-lg text-gray-400 hover:text-gray-600';
      loadResults();
    }
  }

  /**
   * Initialize UI event handlers (called from App.init)
   */
  function initUI() {
    const saveBtn = document.getElementById('saveToDbBtn');
    const loadBtn = document.getElementById('loadFromDbBtn');
    const modal = document.getElementById('dbLoadModal');
    const closeBtn = document.getElementById('dbLoadClose');
    const searchInput = document.getElementById('dbSearchInput');

    if (!saveBtn || !loadBtn || !modal) return;

    // Save button
    saveBtn.addEventListener('click', async () => {
      if (!App.state.metadata.songName.trim()) {
        alert('곡명을 먼저 입력해주세요.');
        return;
      }
      const origText = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';
      try {
        await saveSong(App.state);
        saveBtn.textContent = '저장됨!';
        saveBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600', 'bg-amber-500', 'hover:bg-amber-600');
        saveBtn.classList.add('bg-green-500');
        App.clearEditingFlag();
        setTimeout(() => {
          App.updateSaveBtnState();
        }, 1500);
      } catch (err) {
        alert('저장 실패: ' + err.message);
        App.updateSaveBtnState();
      } finally {
        saveBtn.disabled = false;
      }
    });

    // Load button — open modal (always start on songs tab)
    loadBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      searchInput.value = '';
      currentQuery = '';
      currentPage = 1;
      switchTab('songs');
      searchInput.focus();
      updateTrashCount();
    });

    // Close modal
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    // Search input with debounce
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentQuery = searchInput.value.trim();
        currentPage = 1;
        loadResults();
      }, 300);
    });

    // Tab switching
    const tabSongs = document.getElementById('dbTabSongs');
    const tabTrash = document.getElementById('dbTabTrash');
    if (tabSongs) tabSongs.addEventListener('click', () => switchTab('songs'));
    if (tabTrash) tabTrash.addEventListener('click', () => switchTab('trash'));

    // Init trash count badge
    updateTrashCount();
  }

  return { saveSong, searchSongs, recentSongs, loadSong, deleteSong, initUI };
})();
