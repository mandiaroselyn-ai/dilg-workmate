import assert from 'node:assert/strict';
import test from 'node:test';
import { isNotificationReadBy, markReadUpdate, markUnreadUpdate, notificationFilter, notificationReaderKey } from './announcementModel.js';

const audienceOf = filter => filter.$and[0].$or;
const sinceOf = filter => filter.$and[1].createdAt.$gte.toISOString();

test('HR/Admins see HR notices and their own, not employees\' personal ones', () => {
  const hr = { accessLevel: 'hr_admin', employeeId: 'DILG-2015-4421', email: 'HR@dilg.gov.ph' };
  assert.deepEqual(audienceOf(notificationFilter(hr)), [
    { employeeId: 'DILG-2015-4421' },
    { employeeEmail: 'hr@dilg.gov.ph' },
    { recipientRole: 'hr_admin' }
  ]);
});

test('employees see their own notices and ones sent to every employee', () => {
  const employee = { accessLevel: 'employee', employeeId: 'DILG-2026-145195', email: 'rimhelyn9@gmail.com' };
  assert.deepEqual(audienceOf(notificationFilter(employee)), [
    { employeeId: 'DILG-2026-145195' },
    { employeeEmail: 'rimhelyn9@gmail.com' },
    { employeeId: '', employeeEmail: '', recipientRole: '' }
  ]);
});

test('notifications from before the account existed or before "Clear all" are hidden', () => {
  const createdAt = '2026-09-29T07:51:45.000Z';
  assert.equal(sinceOf(notificationFilter({ accessLevel: 'employee', employeeId: 'E1', createdAt })), createdAt);
  assert.equal(sinceOf(notificationFilter({ accessLevel: 'hr_admin', employeeId: 'H1', createdAt, notificationsClearedAt: '2026-09-30T01:00:00.000Z' })), '2026-09-30T01:00:00.000Z');
  assert.equal(sinceOf(notificationFilter({ accessLevel: 'hr_admin', employeeId: 'H1' })), '1970-01-01T00:00:00.000Z');
});

test('a notice is read or unread for each reader on their own', () => {
  assert.equal(isNotificationReadBy({ readBy: ['e1'] }, 'e1'), true);
  assert.equal(isNotificationReadBy({ readBy: ['e1'] }, 'e2'), false);
  assert.equal(isNotificationReadBy({ readBy: [], unreadBy: ['e1'] }, 'e1'), false);
  assert.equal(isNotificationReadBy({}, ''), false);
});

test('a notice read before readBy existed can still be marked unread, for that reader only', () => {
  const legacy = { read: true, readBy: [], unreadBy: ['e1'] };
  assert.equal(isNotificationReadBy(legacy, 'e1'), false);
  assert.equal(isNotificationReadBy(legacy, 'e2'), true);
});

test('marking read and unread move the reader between readBy and unreadBy', () => {
  assert.deepEqual(markReadUpdate('e1'), { $addToSet: { readBy: 'e1' }, $pull: { unreadBy: 'e1' } });
  assert.deepEqual(markUnreadUpdate('e1'), { $pull: { readBy: 'e1' }, $addToSet: { unreadBy: 'e1' } });
});

test('a missing email never turns into a match-everything condition', () => {
  assert.deepEqual(audienceOf(notificationFilter({ accessLevel: 'supervisor' })), [{ recipientRole: 'supervisor' }]);
  assert.deepEqual(audienceOf(notificationFilter({})), [{ _id: null }]);
  assert.equal(notificationReaderKey({ email: 'A@B.com' }), 'a@b.com');
});
