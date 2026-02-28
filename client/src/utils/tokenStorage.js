/**
 * Token storage with cookie fallback for mobile browsers.
 *
 * Some mobile browsers (Safari private mode, Samsung Internet, etc.)
 * can aggressively purge localStorage when the browser is closed or
 * when the device is low on storage. By writing the JWT to both
 * localStorage AND a cookie we have a reliable fallback.
 */

const TOKEN_KEY = "token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

// ── Cookie helpers ──────────────────────────────────────────────
function setCookie(name, value, maxAge) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function getCookie(name) {
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

// ── Public API ──────────────────────────────────────────────────
export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage may be unavailable (private mode on some browsers)
  }
  setCookie(TOKEN_KEY, token, COOKIE_MAX_AGE);
}

export function getToken() {
  let token = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    // Ignore
  }

  // Fallback: read from cookie if localStorage lost the token
  if (!token) {
    token = getCookie(TOKEN_KEY);
    // Re-sync to localStorage so future reads are fast
    if (token) {
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {
        // Ignore
      }
    }
  }

  return token;
}

export function removeToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore
  }
  deleteCookie(TOKEN_KEY);
}
