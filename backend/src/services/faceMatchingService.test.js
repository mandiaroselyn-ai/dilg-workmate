import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareFaceDescriptors,
  FACE_MATCH_DISTANCE_THRESHOLD,
  isValidFaceDescriptor
} from './faceMatchingService.js';

test('accepts identical 128-value face descriptors', () => {
  const descriptor = Array(128).fill(0.25);
  assert.equal(isValidFaceDescriptor(descriptor), true);
  assert.deepEqual(compareFaceDescriptors(descriptor, descriptor), {
    distance: 0,
    matched: true
  });
});

test('rejects descriptors beyond the configured distance threshold', () => {
  const enrolled = Array(128).fill(0);
  const different = Array(128).fill(0);
  different[0] = FACE_MATCH_DISTANCE_THRESHOLD + 0.001;

  const result = compareFaceDescriptors(enrolled, different);
  assert.equal(result.matched, false);
  assert.ok(result.distance > FACE_MATCH_DISTANCE_THRESHOLD);
});

test('requires finite 128-value descriptors', () => {
  assert.equal(isValidFaceDescriptor(Array(127).fill(0)), false);
  assert.equal(isValidFaceDescriptor([...Array(127).fill(0), Number.NaN]), false);
  assert.throws(
    () => compareFaceDescriptors(Array(128).fill(0), Array(127).fill(0)),
    /128 finite numbers/
  );
});
