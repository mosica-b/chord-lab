/**
 * Authentication Module
 * Supabase Auth + backend-managed AES-256-GCM app loader.
 *
 * The public bundle contains only encrypted app code. The raw master key is
 * stored in Supabase Edge Function secrets and returned only after login.
 */
const Auth = (() => {
  const SESSION_KEY = 'chord_lab_auth';
  const LEGACY_MK_OVERRIDE_KEY = 'chord_lab_mk';
  const SUPABASE_URL = 'https://uciiyjxknkxgaynbmqki.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zHEGT9xPZlgM5zihVIrIFg_K_L5aON2';
  const MASTER_KEY_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/get-master-key`;
  const AUTH_TOKEN_URL = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_SECONDS = 30;

  let encryptedBundle = null;
  let legacyEncryptedBundle = null;
  let currentAccessToken = null;

  window.ChordLabAuth = {
    getAccessToken: () => currentAccessToken,
    clear: () => { currentAccessToken = null; },
  };

  /* -- Base64 helpers -- */
  function b64ToU8(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  /* -- Crypto helpers -- */
  async function aesDecrypt(key, iv, data) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  }

  /* -- Rate limiting -- */
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

  /* -- Supabase helpers -- */
  function loginIdToEmail(loginId) {
    return loginId.trim().toLowerCase();
  }

  async function signIn(loginId, password) {
    const res = await fetch(AUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: loginIdToEmail(loginId),
        password,
      }),
    });

    if (!res.ok) {
      throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error('로그인 응답을 확인할 수 없습니다.');
    }
    return data.access_token;
  }

  async function fetchMasterKey(accessToken) {
    const res = await fetch(MASTER_KEY_FUNCTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app: 'song-chord-lab' }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('관리자 권한을 확인할 수 없습니다.');
    }
    if (!res.ok) {
      throw new Error('인증 서버에서 키를 가져올 수 없습니다.');
    }

    const data = await res.json();
    if (!data.masterKey) {
      throw new Error('인증 서버 응답이 올바르지 않습니다.');
    }
    return b64ToU8(data.masterKey);
  }

  /* -- Fetch encrypted bundle -- */
  async function fetchBundle(url, useLegacyCache = false) {
    const cached = useLegacyCache ? legacyEncryptedBundle : encryptedBundle;
    if (cached) return cached;

    const res = await fetch(url);
    if (!res.ok) throw new Error('암호화 파일을 불러올 수 없습니다.');
    const bundle = await res.json();
    if (!bundle.app || bundle.mk) {
      throw new Error('암호화 파일 형식이 올바르지 않습니다.');
    }
    if (useLegacyCache) legacyEncryptedBundle = bundle;
    else encryptedBundle = bundle;
    return bundle;
  }

  /* -- Core: decrypt and load app -- */
  async function decryptAndLoad(masterKeyRaw) {
    const masterKey = await crypto.subtle.importKey(
      'raw', masterKeyRaw, { name: 'AES-GCM' }, false, ['decrypt']
    );

    let appPlain;
    try {
      const bundle = await fetchBundle('js/app.encrypted?v=63');
      appPlain = await aesDecrypt(masterKey, b64ToU8(bundle.app.iv), b64ToU8(bundle.app.data));
    } catch (_) {
      // During master-key rotation, existing sessions can still load the previous bundle.
      try {
        const legacyBundle = await fetchBundle('js/app.legacy.encrypted?v=1', true);
        appPlain = await aesDecrypt(masterKey, b64ToU8(legacyBundle.app.iv), b64ToU8(legacyBundle.app.data));
      } catch (_) {
        throw new Error('현재 키로 앱을 복호화할 수 없습니다.');
      }
    }
    const appCode = new TextDecoder().decode(appPlain);

    const script = document.createElement('script');
    script.textContent = appCode;
    document.body.appendChild(script);
    installLyricsIntroLoadingIndicator();
  }

  /* -- UI helpers -- */
  function installLyricsIntroLoadingIndicator() {
    if (typeof ITunesSearch === 'undefined' || typeof ITunesSearch.fetchLyricsIntro !== 'function') return;
    if (ITunesSearch.fetchLyricsIntro._showsLyricsIntroLoading) return;

    const originalFetchLyricsIntro = ITunesSearch.fetchLyricsIntro;
    let pendingFetches = 0;

    const setLoading = (isLoading) => {
      const indicator = document.getElementById('lyricsIntroLoading');
      const textarea = document.getElementById('lyricsIntro');
      if (indicator) indicator.classList.toggle('hidden', !isLoading);
      if (textarea) {
        textarea.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      }
    };

    ITunesSearch.fetchLyricsIntro = async (...args) => {
      pendingFetches += 1;
      setLoading(true);
      try {
        return await originalFetchLyricsIntro.apply(ITunesSearch, args);
      } finally {
        pendingFetches = Math.max(0, pendingFetches - 1);
        if (pendingFetches === 0) setLoading(false);
      }
    };
    ITunesSearch.fetchLyricsIntro._showsLyricsIntroLoading = true;
  }

  function showApp() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('appContent').classList.remove('hidden');
    document.getElementById('appHeader').classList.remove('hidden');
    App.init();
  }

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

  function init() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_MK_OVERRIDE_KEY);

    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    const rl = checkRateLimit();
    if (rl.locked) startCountdown(loginError, submitBtn);

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const loginId = document.getElementById('loginId').value;
      const password = document.getElementById('loginPassword').value;
      if (!loginId || !password) return;

      const rlCheck = checkRateLimit();
      if (rlCheck.locked) {
        startCountdown(loginError, submitBtn);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '로그인 중...';
      loginError.textContent = '';

      try {
        const accessToken = await signIn(loginId, password);
        currentAccessToken = accessToken;
        const masterKeyRaw = await fetchMasterKey(accessToken);
        await decryptAndLoad(masterKeyRaw);
        sessionStorage.setItem(SESSION_KEY, '1');
        setRateLimit({});
        showApp();
      } catch (err) {
        currentAccessToken = null;
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

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        currentAccessToken = null;
        sessionStorage.removeItem(SESSION_KEY);
        location.reload();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {};
})();
