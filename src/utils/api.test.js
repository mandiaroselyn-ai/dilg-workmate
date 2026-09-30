import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, clearSessionToken, parseApiResponse, readSessionToken, storeSessionToken } from './api.js';

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

// A browser with localStorage and sessionStorage; `blocked` makes both throw, as in some
// private windows.
const withBrowserStorage = async (run, { blocked = false } = {}) => {
  const previousWindow = globalThis.window;
  const makeStore = () => {
    const values = new Map();
    const guard = () => { if (blocked) throw new Error('Storage is blocked.'); };
    return {
      values,
      getItem: key => { guard(); return values.get(key) ?? null; },
      setItem: (key, value) => { guard(); values.set(key, String(value)); },
      removeItem: key => { guard(); values.delete(key); }
    };
  };
  const local = makeStore();
  const session = makeStore();
  globalThis.window = { localStorage: local, sessionStorage: session };
  try {
    clearSessionToken();
    return await run({ local: local.values, session: session.values });
  } finally {
    clearSessionToken();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
};

test('Remember me keeps the session in localStorage, otherwise only for this tab', async () => {
  await withBrowserStorage(({ local, session }) => {
    storeSessionToken('remembered', true);
    assert.equal(local.get('dilg_auth_token'), 'remembered');
    assert.equal(session.has('dilg_auth_token'), false);
    assert.equal(readSessionToken(), 'remembered');

    storeSessionToken('this-tab-only', false);
    assert.equal(local.has('dilg_auth_token'), false);
    assert.equal(session.get('dilg_auth_token'), 'this-tab-only');
    assert.equal(readSessionToken(), 'this-tab-only');

    clearSessionToken();
    assert.equal(readSessionToken(), '');
  });
});

test('a new token after a password change stays where the session was kept', async () => {
  await withBrowserStorage(({ local, session }) => {
    storeSessionToken('first', true);
    storeSessionToken('after-password-change');
    assert.equal(local.get('dilg_auth_token'), 'after-password-change');

    storeSessionToken('tab', false);
    storeSessionToken('after-password-change-2');
    assert.equal(session.get('dilg_auth_token'), 'after-password-change-2');
    assert.equal(local.has('dilg_auth_token'), false);
  });
});

test('the session still works for this page when storage is blocked', async () => {
  await withBrowserStorage(() => {
    storeSessionToken('in-memory', true);
    assert.equal(readSessionToken(), 'in-memory');
    clearSessionToken();
    assert.equal(readSessionToken(), '');
  }, { blocked: true });
});
