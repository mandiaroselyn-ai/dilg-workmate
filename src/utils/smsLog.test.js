import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMobile,
  matchesSmsSearch,
  smsCsvRows,
  smsFilterCounts,
  smsKind,
  smsStatus,
  smsThreads,
  unseenSmsCount
} from './smsLog.js';

const juan = { name: 'Juan Dela Cruz', employeeId: 'DILG-2026-1', email: 'juan@gmail.com', phoneNumber: '0917 123 4567' };
const ana = { name: 'Ana Reyes', employeeId: 'DILG-2026-2', email: 'ana@gmail.com', phoneNumber: '+63 918 222 3344' };
const employees = [juan, ana];

const approvalFailed = { id: 's1', recipient: '+639171234567', employeeId: 'DILG-2026-1', message: 'Your account has been approved by HR.', status: 'Failed', kind: 'account', error: 'Invalid number', createdAt: '2026-10-01T01:02:00Z' };
const timeIn = { id: 's2', recipient: '+639182223344', message: 'WorkMate: Time In recorded at 7:52 AM.', status: 'Sent', createdAt: '2026-09-30T23:52:00Z' };
const reply = { id: 's3', recipient: '+639182223344', sender: '+639182223344', direction: 'inbound', message: 'Ok po, salamat!', status: 'Received', createdAt: '2026-10-01T00:15:00Z' };
const stranger = { id: 's4', recipient: '+639990001111', message: 'Hello', status: 'Sent', kind: 'manual', createdAt: '2026-09-29T00:00:00Z' };

test('mobile numbers are shown the way people read them', () => {
  assert.equal(formatMobile('+639171234567'), '0917 123 4567');
  assert.equal(formatMobile('09171234567'), '0917 123 4567');
  assert.equal(formatMobile('(042) 332 1234'), '(042) 332 1234');
});

test('older messages are sorted into attendance, account, and replies by their text', () => {
  assert.equal(smsKind(approvalFailed), 'account');
  assert.equal(smsKind(timeIn), 'attendance');
  assert.equal(smsKind(reply), 'reply');
  assert.equal(smsKind({ message: 'Your account has been approved by HR.' }), 'account');
  assert.equal(smsKind({ message: 'Meeting at 3 PM' }), 'other');
  assert.equal(smsStatus(approvalFailed), 'Failed');
  assert.equal(smsStatus(reply), 'Received');
  assert.equal(smsStatus(timeIn), 'Sent');
});

test('messages are grouped by person with their names, newest conversation first', () => {
  const threads = smsThreads([timeIn, approvalFailed, reply, stranger], employees);
  assert.deepEqual(threads.map(thread => thread.name), ['Juan Dela Cruz', 'Ana Reyes', '0999 000 1111']);
  // Ana's reply is matched to her by number, so it joins her Time In message.
  assert.deepEqual(threads[1].messages.map(sms => sms.id), ['s2', 's3']);
  assert.equal(threads[1].latest.id, 's3');
  assert.equal(threads[0].number, '0917 123 4567');
});

test('filters count failed texts, replies, attendance, and account approvals', () => {
  assert.deepEqual(smsFilterCounts([timeIn, approvalFailed, reply, stranger]), { all: 4, failed: 1, reply: 1, attendance: 1, account: 1 });
});

test('the badge counts only new failed texts and replies', () => {
  const list = [timeIn, approvalFailed, reply, stranger];
  assert.equal(unseenSmsCount(list, 0), 2);
  assert.equal(unseenSmsCount(list, Date.parse('2026-10-01T00:30:00Z')), 1);
  assert.equal(unseenSmsCount(list, Date.parse('2026-10-01T02:00:00Z')), 0);
});

test('the SMS log can be searched by name, number, or text', () => {
  assert.equal(matchesSmsSearch(reply, employees, 'ana'), true);
  assert.equal(matchesSmsSearch(reply, employees, '0918'), true);
  assert.equal(matchesSmsSearch(reply, employees, 'salamat'), true);
  assert.equal(matchesSmsSearch(reply, employees, 'juan'), false);
});

test('the CSV export has one row per message', () => {
  const [row] = smsCsvRows([approvalFailed], employees);
  assert.equal(row[1], 'Juan Dela Cruz');
  assert.equal(row[2], '0917 123 4567');
  assert.equal(row[3], 'Account approved');
  assert.equal(row[4], 'Failed');
  assert.equal(row[6], 'Invalid number');
});
