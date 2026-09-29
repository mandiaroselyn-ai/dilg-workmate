import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationProof, readVerificationProof } from './verificationProof.js';

process.env.JWT_SECRET ||= 'test-secret-for-verification-proofs';

test('a fingerprint proof records which registered fingerprint was checked', () => {
  const proof = createVerificationProof({ employeeId: 'EMP-1', type: 'fingerprint', method: 'browser' });
  assert.equal(readVerificationProof(proof, { employeeId: 'EMP-1', type: 'fingerprint' }).method, 'browser');
  assert.equal(readVerificationProof(proof, { employeeId: 'EMP-2', type: 'fingerprint' }), null);
});
