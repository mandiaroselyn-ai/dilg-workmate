export const apiFetch = async (input, init = {}) => {
  const token = window.localStorage.getItem('dilg_auth_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await window.fetch(input, { ...init, headers });
  if (response.status === 401 && response.headers.get('X-Authentication-Error') === 'true') {
    window.localStorage.removeItem('dilg_auth_token');
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
// Saves the session token that apiFetch sends with each request.
export const storeSessionToken = token => {
  window.localStorage.setItem('dilg_auth_token', token);
};
