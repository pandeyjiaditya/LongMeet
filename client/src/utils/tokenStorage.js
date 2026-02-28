const TOKEN_KEY = "token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

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

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
  setCookie(TOKEN_KEY, token, COOKIE_MAX_AGE);
}

export function getToken() {
  let token = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {}

  if (!token) {
    token = getCookie(TOKEN_KEY);
    if (token) {
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {}
    }
  }

  return token;
}

export function removeToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  deleteCookie(TOKEN_KEY);
}
