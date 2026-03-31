/**
 * Authentication Module
 * AES-256-GCM encrypted app loader with rate limiting.
 *
 * Two-layer encryption:
 *   1. Master key encrypts all app JS (AES-GCM)
 *   2. Password encrypts the master key (PBKDF2 + AES-GCM)
 * Password changes only re-encrypt the master key (stored in localStorage).
 */
const Auth = (() => {
  const SESSION_KEY = 'chord_lab_auth';
  const MK_OVERRIDE_KEY = 'chord_lab_mk';
  const PBKDF2_ITERATIONS = 100000;
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_SECONDS = 30;

  let encryptedBundle = null; // cached fetch result
  let decryptedMasterKey = null; // cached for password change

  /* ── Base64 helpers ── */
  function b64ToU8(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function u8ToB64(u8) {
    let bin = '';
    const chunk = 8192;
    for (let i = 0; i < u8.length; i += chunk) {
      bin += String.fromCharCode.apply(null, u8.slice(i, i + chunk));
    }
    return btoa(bin);
  }

  /* ── Crypto helpers ── */
  async function deriveKey(password, salt, usages) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      usages
    );
  }

  async function aesDecrypt(key, iv, data) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  }

  async function aesEncrypt(key, iv, data) {
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  }

  /* ── Rate limiting ── */
  function getRateLimit() {
    try {
      return JSON.parse(sessionStorage.getItem('chord_lab_rl') || '{}');
    } catch { return {}; }
  }
  function setRateLimit(obj) {
    sessionStorage.setItem('chord_lab_rl', JSON.stringify(obj));
  }
  function checkRateLimit() {
    const rl = getRateLimit();
    if (!rl.lockedUntil) return { locked: false, remaining: MAX_ATTEMPTS - (rl.attempts || 0) };
    const remaining = Math.ceil((rl.lockedUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      setRateLimit({});
      return { locked: false, remaining: MAX_ATTEMPTS };
    }
    return { locked: true, seconds: remaining };
  }
  function recordFailedAttempt() {
    const rl = getRateLimit();
    const attempts = (rl.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      setRateLimit({ attempts: 0, lockedUntil: Date.now() + LOCKOUT_SECONDS * 1000 });
    } else {
      setRateLimit({ attempts });
    }
  }

  /* ── Fetch encrypted bundle ── */
  async function fetchBundle() {
    if (encryptedBundle) return encryptedBundle;
    const res = await fetch('js/app.encrypted?v=17');
    if (!res.ok) throw new Error('암호화 파일을 불러올 수 없습니다.');
    encryptedBundle = await res.json();
    return encryptedBundle;
  }

  /* ── Core: decrypt and load app ── */
  async function decryptAndLoad(password) {
    const bundle = await fetchBundle();

    // Use localStorage override if password was changed, else use file's mk
    const localMk = localStorage.getItem(MK_OVERRIDE_KEY);
    const mkData = localMk ? JSON.parse(localMk) : bundle.mk;

    // Derive key from password
    const pwKey = await deriveKey(password, b64ToU8(mkData.salt), ['decrypt']);

    // Decrypt master key
    let masterKeyRaw;
    try {
      masterKeyRaw = await aesDecrypt(pwKey, b64ToU8(mkData.iv), b64ToU8(mkData.data));
    } catch {
      throw new Error('비밀번호가 올바르지 않습니다.');
    }

    // Cache for password change
    decryptedMasterKey = new Uint8Array(masterKeyRaw);

    // Import master key
    const masterKey = await crypto.subtle.importKey(
      'raw', masterKeyRaw, { name: 'AES-GCM' }, false, ['decrypt']
    );

    // Decrypt app code
    const appPlain = await aesDecrypt(masterKey, b64ToU8(bundle.app.iv), b64ToU8(bundle.app.data));
    const appCode = new TextDecoder().decode(appPlain);

    // Execute decrypted JS
    const script = document.createElement('script');
    script.textContent = appCode;
    document.body.appendChild(script);
  }

  /* ── UI helpers ── */
  function showApp() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('appContent').classList.remove('hidden');
    document.getElementById('appHeader').classList.remove('hidden');
    App.init();
  }

  function showLogin() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('appContent').classList.add('hidden');
    document.getElementById('appHeader').classList.add('hidden');
  }

  /* ── Lockout countdown ── */
  function startCountdown(errorEl, submitBtn) {
    const tick = () => {
      const rl = checkRateLimit();
      if (rl.locked) {
        errorEl.textContent = `너무 많은 시도입니다. ${rl.seconds}초 후 다시 시도해주세요.`;
        submitBtn.disabled = true;
        requestAnimationFrame(() => setTimeout(tick, 1000));
      } else {
        errorEl.textContent = '';
        submitBtn.disabled = false;
      }
    };
    tick();
  }

  /* ── Init ── */
  function init() {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    // Check if already locked out
    const rl = checkRateLimit();
    if (rl.locked) startCountdown(loginError, submitBtn);

    // Login form submit
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('loginPassword').value;
      if (!password) return;

      // Rate limit check
      const rlCheck = checkRateLimit();
      if (rlCheck.locked) {
        startCountdown(loginError, submitBtn);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '복호화 중...';
      loginError.textContent = '';

      try {
        await decryptAndLoad(password);
        sessionStorage.setItem(SESSION_KEY, password); // for session restore
        setRateLimit({}); // reset on success
        showApp();
      } catch (err) {
        recordFailedAttempt();
        const rlAfter = checkRateLimit();
        if (rlAfter.locked) {
          startCountdown(loginError, submitBtn);
        } else {
          loginError.textContent = `${err.message} (${rlAfter.remaining}회 남음)`;
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '로그인';
      }
    });

    // Session restore (already logged in this tab)
    const savedPw = sessionStorage.getItem(SESSION_KEY);
    if (savedPw) {
      // Auto-login silently
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-white flex items-center justify-center z-50';
      overlay.innerHTML = '<p class="text-gray-400 text-sm">로딩 중...</p>';
      document.body.appendChild(overlay);

      decryptAndLoad(savedPw)
        .then(() => { overlay.remove(); showApp(); })
        .catch(() => {
          overlay.remove();
          sessionStorage.removeItem(SESSION_KEY);
          // password changed elsewhere, show login
        });
    }

    // Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        decryptedMasterKey = null;
        location.reload();
      });
    }

    // ── Change Password ──
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
        const pwSubmitBtn = changePwForm.querySelector('button[type="submit"]');

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

        pwSubmitBtn.disabled = true;
        pwSubmitBtn.textContent = '변경 중...';

        try {
          // Verify current password by attempting to decrypt master key
          const bundle = await fetchBundle();
          const localMk = localStorage.getItem(MK_OVERRIDE_KEY);
          const mkData = localMk ? JSON.parse(localMk) : bundle.mk;

          const oldKey = await deriveKey(currentPw, b64ToU8(mkData.salt), ['decrypt']);
          let mkRaw;
          try {
            mkRaw = await aesDecrypt(oldKey, b64ToU8(mkData.iv), b64ToU8(mkData.data));
          } catch {
            changePwError.textContent = '현재 비밀번호가 올바르지 않습니다.';
            return;
          }

          // Re-encrypt master key with new password
          const newSalt = crypto.getRandomValues(new Uint8Array(16));
          const newKey = await deriveKey(newPw, newSalt, ['encrypt']);
          const newIv = crypto.getRandomValues(new Uint8Array(12));
          const newMkEncrypted = await aesEncrypt(newKey, newIv, mkRaw);

          // Save to localStorage
          const newMkData = {
            salt: u8ToB64(newSalt),
            iv: u8ToB64(newIv),
            data: u8ToB64(new Uint8Array(newMkEncrypted)),
          };
          localStorage.setItem(MK_OVERRIDE_KEY, JSON.stringify(newMkData));

          // Update session password
          sessionStorage.setItem(SESSION_KEY, newPw);

          changePwSuccess.textContent = '비밀번호가 변경되었습니다.';
          changePwForm.reset();
        } catch (err) {
          changePwError.textContent = '비밀번호 변경에 실패했습니다.';
        } finally {
          pwSubmitBtn.disabled = false;
          pwSubmitBtn.textContent = '비밀번호 변경';
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
