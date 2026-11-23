import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareFaceDescriptors,
  FACE_MATCH_DISTANCE_THRESHOLD,
  headTurnOf,
  isValidFaceDescriptor,
  judgeHeadTurn
} from './faceMatchingService.js';

// The 68 face-api landmarks that headTurnOf reads: the two ends of the jaw and the nose tip.
const faceWithNoseAt = noseX => Object.assign([], { 0: { x: 10, y: 40 }, 16: { x: 110, y: 40 }, 30: { x: noseX, y: 60 } });

test('a head turned to one side moves the nose toward that side of the photo', () => {
  assert.equal(headTurnOf(faceWithNoseAt(60)), 0);
  assert.ok(headTurnOf(faceWithNoseAt(35)) < -0.4);
  assert.ok(headTurnOf(faceWithNoseAt(85)) > 0.4);
  assert.equal(headTurnOf([]), 0);
});

test('the head-turn photo must be the same face, turned the way the server asked', () => {
  const descriptor = Array(128).fill(0.1);
  const selfieFace = { descriptor, turn: 0.05 };
  const turnedTo = turn => ({ descriptor, turn });
  assert.equal(judgeHeadTurn({ selfieFace, turnFace: turnedTo(-0.4), direction: 'left' }).passed, true);
  assert.equal(judgeHeadTurn({ selfieFace, turnFace: turnedTo(0.45), direction: 'right' }).passed, true);
  // The other way, or barely turned (as a tilted flat photo is), does not pass.
  assert.equal(judgeHeadTurn({ selfieFace, turnFace: turnedTo(0.45), direction: 'left' }).reason, 'no-turn');
  assert.equal(judgeHeadTurn({ selfieFace, turnFace: turnedTo(0.15), direction: 'right' }).reason, 'no-turn');
  const someoneElse = { descriptor: descriptor.map((value, index) => (index === 0 ? value + 1 : value)), turn: -0.5 };
  assert.equal(judgeHeadTurn({ selfieFace, turnFace: someoneElse, direction: 'left' }).reason, 'different-face');
});

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
