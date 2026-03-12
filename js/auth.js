/**
 * Authentication Module
 * Simple SHA-256 password gate for admin panel.
 * No external service required.
 */
const Auth = (() => {
  // Default password hash (SHA-256 of initial password)
  const DEFAULT_HASH = '51f83d4b7f969a7883ea333eca0ecb42e9dc5e8437e50630feccee8bdb07d172';
  const STORAGE_KEY = 'chord_lab_pw_hash';
  const SESSION_KEY = 'chord_lab_auth';

  let appInitialized = false;

  /** Compute SHA-256 hex digest of a string */
  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Get the stored password hash (or default) */
  function getHash() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_HASH;
  }

  /** Show the app, hide login */
  function showApp() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('appContent').classList.remove('hidden');
    document.getElementById('appHeader').classList.remove('hidden');
    const modal = document.getElementById('notationModal');
    if (modal) modal.classList.remove('hidden');

    if (!appInitialized) {
      appInitialized = true;
      App.init();
    }
  }

  /** Show login, hide app */
  function showLogin() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('appContent').classList.add('hidden');
    document.getElementById('appHeader').classList.add('hidden');
    const modal = document.getElementById('notationModal');
    if (modal) modal.classList.add('hidden');
    appInitialized = false;
  }

  function init() {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');

    // Check session (persists until tab/browser closed)
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
      showApp();
    }

    // Login form submit
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('loginPassword').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!password) return;

      submitBtn.disabled = true;
      submitBtn.textContent = '확인 중...';
      loginError.textContent = '';

      const hash = await sha256(password);
      if (hash === getHash()) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        showApp();
      } else {
        loginError.textContent = '비밀번호가 올바르지 않습니다.';
      }

      submitBtn.disabled = false;
      submitBtn.textContent = '로그인';
    });

    // Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        showLogin();
      });
    }

    // Change password modal
    const changePwBtn = document.getElementById('changePwBtn');
    const changePwModal = document.getElementById('changePwModal');
    const changePwForm = document.getElementById('changePwForm');
    const changePwError = document.getElementById('changePwError');
    const changePwSuccess = document.getElementById('changePwSuccess');
    const changePwClose = document.getElementById('changePwClose');

    if (changePwBtn && changePwModal) {
      changePwBtn.addEventListener('click', () => {
        changePwModal.classList.remove('hidden');
        changePwError.textContent = '';
        changePwSuccess.textContent = '';
        changePwForm.reset();
      });

      changePwClose.addEventListener('click', () => {
        changePwModal.classList.add('hidden');
      });

      changePwModal.addEventListener('click', (e) => {
        if (e.target === changePwModal) changePwModal.classList.add('hidden');
      });

      changePwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPw = document.getElementById('currentPassword').value;
        const newPw = document.getElementById('newPassword').value;
        const confirmPw = document.getElementById('confirmPassword').value;
        const submitBtn = changePwForm.querySelector('button[type="submit"]');

        changePwError.textContent = '';
        changePwSuccess.textContent = '';

        // Verify current password
        const currentHash = await sha256(currentPw);
        if (currentHash !== getHash()) {
          changePwError.textContent = '현재 비밀번호가 올바르지 않습니다.';
          return;
        }

        if (newPw.length < 8) {
          changePwError.textContent = '새 비밀번호는 8자 이상이어야 합니다.';
          return;
        }
        if (newPw !== confirmPw) {
          changePwError.textContent = '새 비밀번호가 일치하지 않습니다.';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '변경 중...';

        const newHash = await sha256(newPw);
        localStorage.setItem(STORAGE_KEY, newHash);
        changePwSuccess.textContent = '비밀번호가 변경되었습니다.';
        changePwForm.reset();

        submitBtn.disabled = false;
        submitBtn.textContent = '비밀번호 변경';
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {};
})();
