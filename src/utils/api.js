const TOKEN_KEY = 'dilg_auth_token';

// The session token lives in localStorage when the person chose "Remember me", so it
// survives closing the browser, and in sessionStorage otherwise, so it survives refreshing
// this tab only. Either way the server ends the session after 8 hours. Storage can be
// blocked (for example, in a private window), so every access is guarded.
const tokenStores = () => [window.sessionStorage, window.localStorage].filter(Boolean);
const readFrom = store => {
  try {
    return store.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

// Also kept in memory, so requests stay signed in when storage is blocked.
let memoryToken = '';

export const readSessionToken = () => tokenStores().map(readFrom).find(Boolean) || memoryToken;

export const clearSessionToken = () => {
  memoryToken = '';
  tokenStores().forEach(store => {
    try {
      store.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clear when storage is blocked.
    }
  });
};

// Saves the session token that apiFetch sends with each request. `remember` picks where it
// is kept; left out, it stays where the current token is (for example, after a password
// change).
export const storeSessionToken = (token, remember) => {
  const keep = remember ?? Boolean(window.localStorage && readFrom(window.localStorage));
  clearSessionToken();
  memoryToken = token;
  try {
    (keep ? window.localStorage : window.sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    // The in-memory copy keeps the session working until the page is closed.
  }
};

export const apiFetch = async (input, init = {}) => {
  const token = readSessionToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await window.fetch(input, { ...init, headers });
  if (response.status === 401 && response.headers.get('X-Authentication-Error') === 'true') {
    clearSessionToken();
    window.dispatchEvent(new Event('dilg:auth-expired'));
  }
  return response;
};

export const parseApiResponse = async (response, context = 'API request') => {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const message = response.status === 404
      ? `${context} endpoint was not found (HTTP 404). The deployment may not include this API route yet.`
      : `${context} returned an invalid response (HTTP ${response.status}). Please retry or contact the administrator.`;
    throw new Error(message);
  }
};
