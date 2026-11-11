import assert from 'node:assert/strict';
import test from 'node:test';
import { dtrSignatures, dtrStatusText } from './dtrSubmission.js';

const employeeSignature = { image: 'data:image/png;base64,AAAA', name: 'Juan Dela Cruz', signedAt: '2026-11-02T01:15:00Z' };
const verification = { image: 'data:image/png;base64,BBBB', name: 'Ivan Stephen F. Fadri, CESE', signedAt: '2026-11-03T02:30:00Z' };

test('the form carries the employee\'s signature, and the In-charge\'s once verified', () => {
  assert.equal(dtrSignatures(null), null);
  assert.deepEqual(dtrSignatures({ status: 'Submitted', employeeSignature }), { employee: employeeSignature, verification: null });
  assert.deepEqual(dtrSignatures({ status: 'Verified', employeeSignature, verification }), { employee: employeeSignature, verification });
  // A returned DTR is signed again, so its old verification never shows.
  assert.deepEqual(dtrSignatures({ status: 'Returned', employeeSignature, verification }), { employee: employeeSignature, verification: null });
});

test('where a signed DTR stands, in a few words', () => {
  assert.equal(dtrStatusText(null), '');
  assert.equal(dtrStatusText({ status: 'Submitted', employeeSignature }), 'Signed Nov 2, 2026, waiting for the Supervisor\'s verification');
  assert.equal(dtrStatusText({ status: 'Verified', employeeSignature, verification }), 'Verified by Ivan Stephen F. Fadri, CESE on Nov 3, 2026');
  assert.equal(dtrStatusText({ status: 'Returned', remarks: 'Oct 6 has no Time Out.' }), 'Returned: Oct 6 has no Time Out.');
});
