import assert from 'node:assert/strict';
import test from 'node:test';
import { leaveCreditDeduction, leaveCreditField } from './leaveCredits.js';

test('charges vacation, forced, and sick leave to the right balance', () => {
  assert.equal(leaveCreditField('Vacation Leave'), 'vacationLeaveCredits');
  assert.equal(leaveCreditField('Mandatory / Forced Leave'), 'vacationLeaveCredits');
  assert.equal(leaveCreditField('Sick Leave'), 'sickLeaveCredits');
  assert.equal(leaveCreditField('Maternity Leave'), null);
});

test('deducts credits only when a leave request first becomes Approved', () => {
  const approved = { type: 'Leave Request', status: 'Approved', leaveType: 'Vacation Leave', workingDays: 3 };
  assert.deepEqual(leaveCreditDeduction({ status: 'Pending' }, approved), { field: 'vacationLeaveCredits', days: 3 });
  assert.equal(leaveCreditDeduction({ status: 'Approved' }, approved), null);
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, status: 'Rejected' }), null);
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, type: 'Travel Order' }), null);
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, workingDays: 0 }), null);
});
