import { escapeHtml } from './utils.js';

export function setCookie(name, value, days, expTimestamp) {
  let expires = '';
  if (expTimestamp) {
    const date = new Date(expTimestamp * 1000);
    expires = '; expires=' + date.toUTCString();
  } else if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = name + '=' + (value || '') + expires + '; path=/';
}

export function getCookie(name) {
  const nameEQ = `${name}=`;
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trimStart();
    if (trimmed.startsWith(nameEQ)) {
      return trimmed.substring(nameEQ.length);
    }
  }
  return null;
}

export function getJwtExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload?.exp ? Number(payload.exp) : null;
    return exp && !Number.isNaN(exp) ? Math.floor(exp) : null;
  } catch {
    return null;
  }
}

export function setIdTokenCookie(token) {
  const exp = getJwtExp(token);
  if (!exp) {
    throw new Error('id token missing or invalid "exp" claim');
  }
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) {
    throw new Error('id token is expired');
  }
  // Use setCookie with explicit expTimestamp; do not fall back to a default expiry
  setCookie('idToken', token, 0, exp);
}

export function getIdToken() {
  return window.idToken || null;
}

export function deleteCookie(name) {
  try {
    const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
    const paths = ['/', ''];
    const domains = [document.domain, `.${document.domain}`];
    const flags = ['', '; SameSite=None; Secure'];

    for (const p of paths) {
      document.cookie = `${name}=; expires=${expires}; path=${p}`;
      document.cookie = `${name}=; Max-Age=0; path=${p}`;
      for (const d of domains) {
        for (const f of flags) {
          try {
            document.cookie = `${name}=; expires=${expires}; path=${p}; domain=${d}${f}`;
            document.cookie = `${name}=; Max-Age=0; path=${p}; domain=${d}${f}`;
          } catch {
            // ignore malformed combinations
          }
        }
      }
    }

    return getCookie(name) === null;
  } catch {
    return false;
  }
}

export function showSignedIn() {
  const elements = {
    signin: document.getElementById('g_id_signin'),
    status: document.getElementById('signin-status'),
    bannerSignout: document.getElementById('bannerSignout'),
  };

  elements.signin?.classList.add('hidden');

  if (elements.status) {
    elements.status.classList.remove('hidden');
    setTimeout(() => elements.status.classList.add('hidden'), 3000);
  }

  elements.bannerSignout?.classList.remove('hidden');
}

export function signOut() {
  const elements = {
    fileInfo: document.getElementById('fileInfo'),
    bannerSignout: document.getElementById('bannerSignout'),
    signinStatus: document.getElementById('signin-status'),
    signinDiv: document.getElementById('g_id_signin'),
    uploadButton: document.getElementById('uploadButton'),
    videoInput: document.getElementById('videoInput'),
  };

  try {
    const clientDeleted = deleteCookie('idToken');
    setCookie('idToken', '', -1);

    try {
      localStorage.removeItem('g_state');
    } catch (e) {
      console.warn('Could not remove g_state:', e);
    }

    if (window.google?.accounts?.id?.disableAutoSelect) {
      try {
        google.accounts.id.disableAutoSelect();
      } catch (err) {
        console.warn('google.accounts.id.disableAutoSelect() failed:', err);
      }
    }

    window.idToken = null;

    if (clientDeleted || getCookie('idToken') === null) {
      if (elements.fileInfo) {
        elements.fileInfo.innerHTML = '<span class="success">Signed out.</span>';
      }
    } else if (elements.fileInfo) {
      elements.fileInfo.innerHTML =
        '<span class="error">Sign-out incomplete: cookie could not be removed by client. Server-side sign-out may still be required.</span>';
    }
  } catch (err) {
    console.warn('Error during signout cleanup:', err);
    if (elements.fileInfo) {
      elements.fileInfo.innerHTML = `<span class="error">Sign-out error: ${escapeHtml(err.message)}</span>`;
    }
  }

  // Update UI
  elements.bannerSignout?.classList.add('hidden');
  elements.signinStatus?.classList.add('hidden');
  elements.signinDiv?.classList.remove('hidden');

  // Re-enable upload button if file is selected
  if (elements.uploadButton && elements.videoInput) {
    const MOCK_UPLOAD = window.MOCK_UPLOAD || false;
    elements.uploadButton.disabled = !(
      elements.videoInput.files.length &&
      (getIdToken() || MOCK_UPLOAD)
    );
  }
}
