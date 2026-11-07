import assert from 'node:assert/strict';
import test from 'node:test';
import { doesHrStep, hrStepOf, leaveCreditCertification, readRecommendation } from './hrSteps.js';

test('a leave goes to HR 1, then HR 2; a Travel Order goes straight to HR 2', () => {
  assert.equal(hrStepOf({ type: 'Leave Request', status: 'Pending' }), 'leave-credits');
  assert.equal(hrStepOf({ type: 'Leave Request', status: 'For Pre-approval' }), 'pre-approval');
  assert.equal(hrStepOf({ type: 'Travel Order', status: 'Pending' }), 'pre-approval');
  for (const status of ['Draft', 'For Supervisor', 'Approved', 'Rejected', 'Returned', 'Withdrawn']) {
    assert.equal(hrStepOf({ type: 'Leave Request', status }), null, status);
  }
});

test('an HR account does HR 1\'s step or HR 2\'s, never both', () => {
  assert.equal(doesHrStep('leave-credits', 'leave-credits'), true);
  assert.equal(doesHrStep('leave-credits', 'pre-approval'), false);
  assert.equal(doesHrStep('pre-approval', 'pre-approval'), true);
  assert.equal(doesHrStep('pre-approval', 'leave-credits'), false);
  // An account not set yet, or saved as both before the steps were split, does neither.
  for (const task of ['both', undefined, '']) {
    assert.equal(doesHrStep(task, 'leave-credits'), false);
    assert.equal(doesHrStep(task, 'pre-approval'), false);
  }
  assert.equal(doesHrStep('leave-credits', null), false);
});

test('HR 1 certifies the leave credits as approving the leave will charge them', () => {
  const employee = { vacationLeaveCredits: 10.5, sickLeaveCredits: 2 };
  // Sick leave comes from sick leave, then vacation leave, then without pay.
  assert.deepEqual(leaveCreditCertification({ leaveType: 'Sick Leave', days: 3, employee, asOf: '2026-11-09' }), {
    asOf: '2026-11-09',
    vacationLeave: { earned: 10.5, less: 1, balance: 9.5 },
    sickLeave: { earned: 2, less: 2, balance: 0 },
    withoutPayDays: 0
  });
  const vacation = leaveCreditCertification({ leaveType: 'Vacation Leave', days: 12, employee, asOf: '2026-11-09' });
  assert.deepEqual(vacation.vacationLeave, { earned: 10.5, less: 10.5, balance: 0 });
  assert.equal(vacation.withoutPayDays, 1.5);
  // Maternity leave has its own entitlement and takes nothing from either.
  const maternity = leaveCreditCertification({ leaveType: 'Maternity Leave', days: 105, employee, asOf: '2026-11-09' });
  assert.deepEqual([maternity.vacationLeave.less, maternity.sickLeave.less, maternity.withoutPayDays], [0, 0, 0]);
});

test('HR 2 recommends approval, or disapproval with a reason', () => {
  assert.deepEqual(readRecommendation({ decision: 'approval', reason: 'ignored' }), { value: { decision: 'approval', reason: '' } });
  assert.deepEqual(readRecommendation({ decision: 'disapproval', reason: ' Exigency of the service ' }), { value: { decision: 'disapproval', reason: 'Exigency of the service' } });
  assert.match(readRecommendation({ decision: 'disapproval' }).error, /why/);
  assert.match(readRecommendation({}).error, /Choose the recommendation/);
  assert.match(readRecommendation({ decision: 'disapproval', reason: 'x'.repeat(301) }).error, /300/);
});
