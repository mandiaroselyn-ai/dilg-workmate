import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, parseApiResponse } from './api.js';

const runApiFetchWith401 = async headers => {
  const previousWindow = globalThis.window;
  const storage = new Map([['dilg_auth_token', 'test-session-token']]);
  const events = [];
  globalThis.window = {
    localStorage: {
      getItem: key => storage.get(key) || null,
      removeItem: key => storage.delete(key)
    },
    fetch: async () => new Response('Unauthorized', { status: 401, headers }),
    dispatchEvent: event => events.push(event.type)
  };

  try {
    await apiFetch('/api/test');
    return { token: storage.get('dilg_auth_token'), events };
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
};

test('apiFetch preserves the session for an unmarked biometric 401', async () => {
  const result = await runApiFetchWith401();

  assert.equal(result.token, 'test-session-token');
  assert.deepEqual(result.events, []);
});

test('apiFetch expires the session for an authentication-marked 401', async () => {
  const result = await runApiFetchWith401({ 'X-Authentication-Error': 'true' });

  assert.equal(result.token, undefined);
  assert.deepEqual(result.events, ['dilg:auth-expired']);
});

test('parseApiResponse returns valid JSON response bodies', async () => {
  const response = new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  assert.deepEqual(await parseApiResponse(response), { success: true });
});

test('parseApiResponse explains when a deployment returns a non-JSON 404 page', async () => {
  const response = new Response('The page could not be found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  });

  await assert.rejects(
    parseApiResponse(response, 'Biometric enrollment status'),
    /Biometric enrollment status endpoint was not found \(HTTP 404\)/
  );
});
