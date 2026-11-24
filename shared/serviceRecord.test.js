import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SERVICE_RECORD_LINES, normalizeServiceRecord, serviceRecordHtml, serviceRecordRow } from './serviceRecord.js';

const line = { from: '2020-01-06', to: '2022-12-31', designation: 'Administrative Aide IV', status: 'Permanent', salary: '199,476', office: 'DILG Marinduque', station: 'Boac', branch: 'National' };

test('Service Record lines need a From date and a designation, and are kept oldest first', () => {
  const later = { from: '2023-01-01', designation: 'Administrative Assistant II', salary: '' };
  const { value } = normalizeServiceRecord([later, line]);
  assert.deepEqual(value.map(entry => entry.from), ['2020-01-06', '2023-01-01']);
  // Commas in the salary are allowed; it is saved as a number.
  assert.equal(value[0].salary, '199476');
  // Every field is kept, blank when not given.
  assert.equal(value[1].to, '');
  assert.equal(value[1].leaveWithoutPay, '');
  assert.deepEqual(normalizeServiceRecord([]).value, []);
});

test('Service Record lines with a wrong entry say which line', () => {
  assert.match(normalizeServiceRecord([line, { designation: 'Clerk' }]).error, /^Line 2: enter the From date/);
  assert.match(normalizeServiceRecord([{ from: '2020-01-06' }]).error, /designation/);
  assert.match(normalizeServiceRecord([{ ...line, to: '2019-01-01' }]).error, /before the From date/);
  assert.match(normalizeServiceRecord([{ ...line, salary: 'a lot' }]).error, /must be a number/);
  assert.match(normalizeServiceRecord([{ ...line, branch: 'Private' }]).error, /National or Local/);
  assert.match(normalizeServiceRecord([{ ...line, separationDate: '2026-13-01' }]).error, /separation date/);
  assert.ok(normalizeServiceRecord('lines').error);
  assert.ok(normalizeServiceRecord(Array.from({ length: MAX_SERVICE_RECORD_LINES + 1 }, () => line)).error);
});

test('the printed Service Record shows the lines, Present for an open line, and escapes text', () => {
  const row = serviceRecordRow({ ...normalizeServiceRecord([line]).value[0], to: '' });
  assert.equal(row.from, '01/06/2020');
  assert.equal(row.to, 'Present');
  assert.equal(row.salary, '199,476.00');
  const html = serviceRecordHtml(
    { firstName: 'Ana', middleName: 'Santos', lastName: 'Reyes', name: 'Ana Santos Reyes', employeeId: 'E1', dateOfBirth: '1990-05-01', role: 'Administrative Aide IV' },
    [{ ...line, designation: '<b>Clerk</b>' }],
    { certifiedBy: { name: 'Maria Cruz', position: 'HRMO II' }, printedAt: 'November 25, 2026' }
  );
  assert.match(html, /SERVICE RECORD/);
  assert.match(html, /Reyes, Ana Santos/);
  assert.match(html, /05\/01\/1990/);
  assert.match(html, /&lt;b&gt;Clerk&lt;\/b&gt;/);
  assert.match(html, /Maria Cruz/);
  assert.match(serviceRecordHtml({ name: 'Ana' }, []), /No service record lines yet/);
});
