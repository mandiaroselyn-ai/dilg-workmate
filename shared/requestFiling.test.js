import assert from 'node:assert/strict';
import test from 'node:test';
import { filingDate, lateFilingProblem } from './requestFiling.js';

const today = '2026-11-02';
const leave = (leaveType, startDate) => ({ type: 'Leave Request', leaveType, startDate, endDate: startDate });

test('vacation, forced, study, and adoption leave cannot start before the day they are filed', () => {
  for (const type of ['Vacation Leave', 'Mandatory / Forced Leave', 'Study Leave', 'Adoption Leave']) {
    assert.match(lateFilingProblem(leave(type, '2026-10-01'), today), /Oct 1, 2026 has already passed/);
    assert.equal(lateFilingProblem(leave(type, today), today), null);
    assert.equal(lateFilingProblem(leave(type, '2026-11-09'), today), null);
  }
  assert.match(lateFilingProblem(leave('Vacation Leave', '2026-10-01'), today), /file Sick Leave instead/);
});

test('leave the rules let an employee file after it starts can have past dates', () => {
  for (const type of [
    'Sick Leave', 'Special Privilege Leave', 'Solo Parent Leave', 'Maternity Leave', 'Paternity Leave',
    '10-Day VAWC Leave', 'Rehabilitation Privilege', 'Special Leave Benefits for Women', 'Special Emergency (Calamity) Leave'
  ]) {
    assert.equal(lateFilingProblem(leave(type, '2026-10-01'), today), null, type);
  }
});

test('a travel order cannot start before the day it is filed', () => {
  const travel = { type: 'Travel Order', startDate: '2026-11-01', endDate: '2026-11-03' };
  assert.match(lateFilingProblem(travel, today), /travel order is filed before the travel\. Nov 1, 2026 has already passed/);
  assert.equal(lateFilingProblem({ ...travel, startDate: today }, today), null);
});

test('a returned request keeps the day it was first submitted', () => {
  const returned = {
    status: 'Returned',
    submissionDate: '2026-10-30',
    statusHistory: [
      { status: 'Draft', date: '2026-09-25' },
      { status: 'Pending', date: '2026-09-28' },
      { status: 'Returned', date: '2026-09-29' },
      { status: 'Pending', date: '2026-10-30' }
    ]
  };
  assert.equal(filingDate(returned, today), '2026-09-28');
  // Filed on Sep 28 for Oct 1, so it was filed in time and can be submitted again.
  assert.equal(lateFilingProblem(leave('Vacation Leave', '2026-10-01'), filingDate(returned, today)), null);
  assert.equal(filingDate({ status: 'Draft' }, today), today);
  assert.equal(filingDate({ status: 'Returned', submissionDate: '2026-10-05' }, today), '2026-10-05');
});
