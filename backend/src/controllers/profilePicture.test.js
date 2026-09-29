import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'profile-picture-test-secret';
const { isValidProfilePicture } = await import('./userController.js');

test('accepts small embedded photos, linked avatars, and removing the photo', () => {
  assert.equal(isValidProfilePicture(''), true);
  assert.equal(isValidProfilePicture(`data:image/jpeg;base64,${'a'.repeat(1000)}`), true);
  assert.equal(isValidProfilePicture('https://lh3.googleusercontent.com/a/avatar'), true);
});

test('rejects oversized, non-image, and non-HTTPS profile photos', () => {
  assert.equal(isValidProfilePicture(`data:image/jpeg;base64,${'a'.repeat(400 * 1024)}`), false);
  assert.equal(isValidProfilePicture('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isValidProfilePicture('http://example.com/photo.jpg'), false);
  assert.equal(isValidProfilePicture({ url: 'x' }), false);
});
