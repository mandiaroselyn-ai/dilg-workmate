import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApiResponse } from './api.js';

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
