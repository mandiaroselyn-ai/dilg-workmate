export const apiFetch = (input, init = {}) => {
  const token = window.localStorage.getItem('dilg_auth_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return window.fetch(input, { ...init, headers });
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