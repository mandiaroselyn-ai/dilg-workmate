export const apiFetch = (input, init = {}) => {
  const token = window.localStorage.getItem('dilg_auth_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return window.fetch(input, { ...init, headers });
};