import assert from 'node:assert/strict';
import test from 'node:test';
import { HR2_DESK_VIEWS, awaitsHead, doesHrStep, hrStepOf, isHr2Notice, isLeaveWithHr, leaveCreditCertification, needsCreditCertification, readRecommendation, usesHr2Desk } from './hrSteps.js';

test('a leave goes to HR 2, a Travel Order straight to the Head; HR 1 takes no step on requests', () => {
  assert.equal(hrStepOf({ type: 'Leave Request', status: 'Pending' }), 'pre-approval');
  assert.equal(hrStepOf({ type: 'Leave Request', status: 'Pending Review' }), 'pre-approval');
  // A leave HR 1 certified before HR 2 took that step too still goes to HR 2.
  assert.equal(hrStepOf({ type: 'Leave Request', status: 'For Pre-approval' }), 'pre-approval');
  // A Travel Order never waits for HR; the Head decides it, even one filed before (still Pending).
  for (const status of ['Pending', 'Pending Review', 'For Supervisor']) {
    assert.equal(hrStepOf({ type: 'Travel Order', status }), null, status);
    assert.equal(awaitsHead({ type: 'Travel Order', status }), true, status);
  }
  assert.equal(awaitsHead({ type: 'Leave Request', status: 'Pending' }), false);
  assert.equal(awaitsHead({ type: 'Leave Request', status: 'For Supervisor' }), true);
  assert.equal(awaitsHead({ type: 'Travel Order', status: 'Approved' }), false);
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

test('HR 2 also certifies the leave credits of a leave not certified yet', () => {
  assert.equal(needsCreditCertification({ type: 'Leave Request' }), true);
  assert.equal(needsCreditCertification({ type: 'Leave Request', creditCertification: { asOf: '2026-11-09' } }), false);
  assert.equal(needsCreditCertification({ type: 'Travel Order' }), false);
});

test('HR 2 certifies the leave credits as approving the leave will charge them', () => {
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

test('HR 2 has a desk of only pre-approval and leave credits; HR 1 keeps the whole HR desk', () => {
  assert.equal(usesHr2Desk({ accessLevel: 'hr_admin', hrTask: 'pre-approval' }), true);
  assert.equal(usesHr2Desk({ accessLevel: 'hr_admin', hrTask: 'leave-credits' }), false);
  // An HR account without a step yet keeps the whole desk, and only HR accounts have HR steps.
  assert.equal(usesHr2Desk({ accessLevel: 'hr_admin', hrTask: '' }), false);
  assert.equal(usesHr2Desk({ accessLevel: 'employee', hrTask: 'pre-approval' }), false);
  assert.deepEqual(HR2_DESK_VIEWS.slice(0, 2), ['hr_leave_records', 'hr_leave_credits']);
  // HR 2 gets the notices about requests, not the other HR notices.
  assert.equal(isHr2Notice({ type: 'request', title: 'Leave Request Approved by Supervisor' }), true);
  assert.equal(isHr2Notice({ type: 'request', action: 'review_request', targetId: 'LV-1' }), true);
  // A Travel Order's certificate or report is not HR 2's, though it opens the request.
  assert.equal(isHr2Notice({ type: 'travel_document', action: 'review_request', targetId: 'TO-1' }), false);
  for (const type of ['employee_management', 'biometric_enrollment', 'attendance', 'support', 'system']) {
    assert.equal(isHr2Notice({ type }), false, type);
  }
});

test('a leave is with HR 2 until HR 2 sends it to the Head; then the Head decides it', () => {
  for (const status of ['Pending', 'Pending Review', 'For Pre-approval']) {
    assert.equal(isLeaveWithHr({ type: 'Leave Request', status }), true, status);
    // A Travel Order is not held back from the Head.
    assert.equal(isLeaveWithHr({ type: 'Travel Order', status }), false, status);
  }
  for (const status of ['For Supervisor', 'Approved', 'Rejected', 'Returned', 'Withdrawn', 'Draft']) {
    assert.equal(isLeaveWithHr({ type: 'Leave Request', status }), false, status);
  }
});
