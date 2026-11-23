import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'punch-liveness-test-secret';
const { checkPunchLiveness } = await import('./punchLiveness.js');
const { createLivenessChallenge, createVerificationProof } = await import('./verificationProof.js');
const { FaceImageError } = await import('../services/faceMatchingService.js');

const employeeId = 'EMP-LIVE-1';
const selfieFace = { descriptor: Array(128).fill(0.1), turn: 0 };
const turnPhoto = 'data:image/jpeg;base64,/9j/turn';

// Checks a punch whose head-turn photo the face check (`checkTurn`) judges as `result`.
const check = ({ liveness, result = { passed: true, reason: '', change: -0.41 }, seen = [] } = {}) => checkPunchLiveness({
  liveness,
  employeeId,
  selfieFace,
  punch: 'Time In',
  checkTurn: async args => {
    seen.push(args);
    if (result instanceof Error) throw result;
    return result;
  }
});

test('the server picks the side to turn, and the check uses that side', async () => {
  const challenge = createLivenessChallenge({ employeeId });
  assert.ok(['left', 'right'].includes(challenge.direction));
  const seen = [];
  const passed = await check({ liveness: { token: challenge.token, selfie: turnPhoto }, seen });
  assert.deepEqual(passed, { verified: true, change: 0.41 });
  assert.equal(seen[0].direction, challenge.direction);
  assert.equal(seen[0].turnImage, turnPhoto);
});

test('a punch without the head turn, or with a token not given to this employee, is refused', async () => {
  const missing = await check({ liveness: null });
  assert.equal(missing.statusCode, 400);
  assert.match(missing.error, /head-turn check is missing/);

  const someoneElses = createLivenessChallenge({ employeeId: 'EMP-OTHER' });
  assert.match((await check({ liveness: { token: someoneElses.token, selfie: turnPhoto } })).error, /expired/);
  // A fingerprint proof is not a head-turn token.
  const fingerprintProof = createVerificationProof({ employeeId, type: 'fingerprint' });
  assert.match((await check({ liveness: { token: fingerprintProof, selfie: turnPhoto } })).error, /expired/);
});

test('a head turn the face check does not accept is refused with what to do', async () => {
  const liveness = { token: createLivenessChallenge({ employeeId }).token, selfie: turnPhoto };
  const notTurned = await check({ liveness, result: { passed: false, reason: 'no-turn', change: 0.02 } });
  assert.equal(notTurned.statusCode, 403);
  assert.match(notTurned.error, /turn your head a little toward it/);
  assert.equal(notTurned.audit, 'attendance-liveness-no-turn');

  const otherFace = await check({ liveness, result: { passed: false, reason: 'different-face', change: -0.4 } });
  assert.equal(otherFace.statusCode, 403);
  assert.equal(otherFace.audit, 'attendance-liveness-different-face');

  const noFace = await check({ liveness, result: new FaceImageError('No face was detected.') });
  assert.equal(noFace.statusCode, 422);
  assert.match(noFace.error, /whole face stays in the frame/);
});
