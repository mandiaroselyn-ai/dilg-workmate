import assert from 'node:assert/strict';
import test from 'node:test';
import { validateApiBody } from './requestSecurity.js';

const invokeValidator = body => {
  let statusCode = 200;
  let responseBody;
  let nextCalled = false;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    }
  };
  validateApiBody({ body }, response, () => { nextCalled = true; });
  return { statusCode, responseBody, nextCalled };
};

test('rejects combined biometric images that exceed the JSON payload budget', () => {
  const payload = 'x'.repeat(3 * 1024 * 1024);
  const result = invokeValidator({
    dilgIdImage: payload,
    dilgIdBackImage: payload,
    selfieImage: payload
  });

  assert.equal(result.statusCode, 413);
  assert.equal(result.responseBody.error, 'Combined biometric images are too large. Resize the images and try again.');
  assert.equal(result.nextCalled, false);
});

test('allows compressed front, back, and selfie images within the payload budget', () => {
  const payload = 'x'.repeat(2 * 1024 * 1024);
  const result = invokeValidator({
    dilgIdImage: payload,
    dilgIdBackImage: payload,
    selfieImage: payload
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.nextCalled, true);
});

test('includes the nested attendance selfie in biometric payload limits', () => {
  const result = invokeValidator({
    action: 'clock-in',
    record: { selfieUrl: 'x'.repeat(8 * 1024 * 1024 + 1) }
  });

  assert.equal(result.statusCode, 413);
  assert.equal(result.responseBody.error, 'Biometric image is too large.');
  assert.equal(result.nextCalled, false);
});
