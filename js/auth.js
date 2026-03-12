/**
 * Authentication Module
 * Manages Firebase Auth login gate for the admin panel.
 */
const Auth = (() => {
  let appInitialized = false;

  function init() {
    const loginSection = document.getElementById('loginSection');
    const appContent = document.getElementById('appContent');
    const appHeader = document.getElementById('appHeader');
    const notationModal = document.getElementById('notationModal');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');
    const userEmail = document.getElementById('userEmail');

    // Listen for auth state changes
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        // Authenticated — show app
        loginSection.classList.add('hidden');
        appContent.classList.remove('hidden');
        appHeader.classList.remove('hidden');
        if (notationModal) notationModal.classList.remove('hidden');
        if (userEmail) userEmail.textContent = user.email;

        // Initialize app only once
        if (!appInitialized) {
          appInitialized = true;
          App.init();
        }
      } else {
        // Not authenticated — show login
        loginSection.classList.remove('hidden');
        appContent.classList.add('hidden');
        appHeader.classList.add('hidden');
        if (notationModal) notationModal.classList.add('hidden');
        loginError.textContent = '';
        appInitialized = false;
      }
    });

    // Login form submit
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!email || !password) return;

      submitBtn.disabled = true;
      submitBtn.textContent = '로그인 중...';
      loginError.textContent = '';

      try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
      } catch (err) {
        const messages = {
          'auth/user-not-found': '등록되지 않은 계정입니다.',
          'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
          'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
          'auth/too-many-requests': '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
          'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
        };
        loginError.textContent = messages[err.code] || '로그인에 실패했습니다.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '로그인';
      }
    });

    // Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        firebase.auth().signOut();
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
