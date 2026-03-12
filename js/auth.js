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

        try {
          const user = firebase.auth().currentUser;
          const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);
          await user.reauthenticateWithCredential(credential);
          await user.updatePassword(newPw);
          changePwSuccess.textContent = '비밀번호가 변경되었습니다.';
          changePwForm.reset();
        } catch (err) {
          const messages = {
            'auth/wrong-password': '현재 비밀번호가 올바르지 않습니다.',
            'auth/invalid-credential': '현재 비밀번호가 올바르지 않습니다.',
            'auth/weak-password': '비밀번호가 너무 약합니다. 더 강한 비밀번호를 사용해주세요.',
            'auth/too-many-requests': '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.',
          };
          changePwError.textContent = messages[err.code] || '비밀번호 변경에 실패했습니다.';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = '비밀번호 변경';
        }
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
