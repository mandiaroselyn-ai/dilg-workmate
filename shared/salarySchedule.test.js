import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyRate, monthlySalary, pesoText, SALARY_GRADE_OPTIONS, salaryFields, withoutPayAmount } from './salarySchedule.js';

test('the schedule has the DBM third tranche figures', () => {
  assert.equal(monthlySalary(1, 1), 14634);
  assert.equal(monthlySalary(1, 8), 15456);
  assert.equal(monthlySalary(15, 1), 42178);
  assert.equal(monthlySalary(24, 8), 114301);
  assert.equal(monthlySalary(33, 2), 462329);
  assert.equal(monthlySalary(33, 3), null);
  assert.equal(monthlySalary(34, 1), null);
  assert.equal(SALARY_GRADE_OPTIONS.length, 33);
});

test('salaries rise with each step and each grade', () => {
  for (let grade = 1; grade <= 33; grade += 1) {
    for (let step = 2; monthlySalary(grade, step) !== null; step += 1) {
      assert.ok(monthlySalary(grade, step) > monthlySalary(grade, step - 1), `SG ${grade} step ${step}`);
    }
    if (grade > 1) assert.ok(monthlySalary(grade, 1) > monthlySalary(grade - 1, 1), `SG ${grade}`);
  }
});

test('HR\'s grade and step give the monthly salary to save', () => {
  assert.deepEqual(salaryFields('SG 15', 'Step 3'), { salaryGrade: 'SG 15', salaryStep: 'Step 3', salary: 'PHP 43,015' });
  // A grade typed before the choices existed is read too, and no step means Step 1.
  assert.deepEqual(salaryFields('SG 11, Step 2', ''), { salaryGrade: 'SG 11', salaryStep: 'Step 2', salary: 'PHP 31,820' });
  assert.deepEqual(salaryFields('18', ''), { salaryGrade: 'SG 18', salaryStep: 'Step 1', salary: 'PHP 53,818' });
  assert.deepEqual(salaryFields('', ''), { salaryGrade: '', salaryStep: '', salary: '' });
  assert.match(salaryFields('SG 40', 'Step 1').error, /SG 1 to SG 33/);
  assert.match(salaryFields('SG 33', 'Step 5').error, /steps 1 to 2/);
});

test('the daily rate is the monthly salary over 22 working days', () => {
  assert.equal(dailyRate(42178), 1917.18);
  assert.equal(pesoText(1917.18), 'PHP 1,917.18');
  assert.equal(pesoText(42178), 'PHP 42,178');
});

test('days without pay are worth the daily rate of the person\'s grade and step', () => {
  // SG 15, Step 1: 42,178 ÷ 22 = 1,917.18 a day.
  assert.equal(withoutPayAmount({ salaryGrade: 'SG 15', salaryStep: 'Step 1' }, 0.5), 958.59);
  assert.equal(withoutPayAmount({ salaryGrade: 'SG 15, Step 1' }, 1), 1917.18);
  assert.equal(withoutPayAmount({}, 1), null);
  assert.equal(withoutPayAmount({ salaryGrade: 'SG 15', salaryStep: 'Step 1' }, 0), null);
});
