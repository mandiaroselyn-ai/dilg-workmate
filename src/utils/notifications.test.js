import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionLabel,
  dayGroup,
  employeeNotificationView,
  isActionPending,
  notificationAction,
  notificationCounts,
  notificationKind,
  notificationSections,
  notificationWhen
} from './notifications.js';

const now = new Date('2026-10-01T10:00:00').getTime();
const at = text => new Date(text).toISOString();
const juan = { name: 'Juan Dela Cruz', employeeId: 'DILG-2026-1', email: 'juan@gmail.com', accountStatus: 'Pending', biometricEnrollmentStatus: 'pending' };
const leave = { id: 'LV-2026-0142', status: 'Pending' };
const context = { role: 'hr_admin', employees: [juan], requests: [leave] };

const newAccount = { id: 'n1', title: 'New Account Awaiting Approval', message: 'Juan', type: 'employee_management', action: 'review_account', targetId: 'DILG-2026-1', createdAt: at('2026-10-01T09:55:00'), read: false };
const newRequest = { id: 'n2', title: 'New Request Submitted', message: 'Juan submitted a Leave Application (Ref LV-2026-0142) for HR review.', type: 'request', createdAt: at('2026-10-01T08:00:00'), read: true };
const announcement = { id: 'n3', title: 'New Announcement', message: 'Flag ceremony', type: 'announcement', createdAt: at('2026-09-30T16:12:00'), read: true };
const oldNotice = { id: 'n4', title: 'Staff Account Change', message: 'Ana made Lito a Supervisor.', type: 'employee_management', createdAt: at('2026-09-20T09:00:00'), read: false };

test('older notifications get their action from the title and message', () => {
  assert.deepEqual(notificationAction(newRequest), { action: 'review_request', targetId: 'LV-2026-0142' });
  assert.deepEqual(
    notificationAction({ title: 'New Account Awaiting Approval', message: 'Juan Dela Cruz (juan@gmail.com) signed up through the sign-up form.' }),
    { action: 'review_account', targetId: 'juan@gmail.com' }
  );
  assert.deepEqual(
    notificationAction({ title: 'Password Reset Requested', message: 'Maria (maria@dilg.gov.ph, DILG-2026-100200) asked HR to reset their password.' }),
    { action: 'reset_password', targetId: 'maria@dilg.gov.ph' }
  );
  assert.deepEqual(
    notificationAction({ title: 'Request Ready for Review', message: 'Leave Application LV-2026-0142 was validated by HR/Admin and is ready for your review.' }),
    { action: 'review_request', targetId: 'LV-2026-0142' }
  );
  assert.equal(notificationAction(announcement), null);
});

test('a notification needs action only until it is done', () => {
  assert.equal(isActionPending(newAccount, context), true);
  assert.equal(isActionPending(newAccount, { ...context, employees: [{ ...juan, accountStatus: 'Active' }] }), false);
  assert.equal(isActionPending(newAccount, { ...context, employees: [] }), false);

  assert.equal(isActionPending(newRequest, context), true);
  assert.equal(isActionPending(newRequest, { ...context, requests: [{ ...leave, status: 'For Supervisor' }] }), false);
  // The supervisor acts on requests HR forwarded.
  assert.equal(isActionPending(newRequest, { role: 'supervisor', requests: [{ ...leave, status: 'For Supervisor' }] }), true);

  const enrollment = { title: 'Biometric Enrollment Submitted', action: 'review_enrollment', targetId: 'juan@gmail.com' };
  assert.equal(isActionPending(enrollment, context), true);
  assert.equal(isActionPending(enrollment, { ...context, employees: [{ ...juan, biometricEnrollmentStatus: 'hr-approved' }] }), false);

  const reset = { title: 'Password Reset Requested', action: 'reset_password', targetId: 'DILG-2026-1', createdAt: at('2026-10-01T09:00:00') };
  assert.equal(isActionPending(reset, context), true);
  assert.equal(isActionPending(reset, { ...context, employees: [{ ...juan, passwordChangedAt: at('2026-10-01T09:30:00') }] }), false);
  assert.equal(isActionPending(reset, { ...context, employees: [{ ...juan, passwordChangedAt: at('2026-09-01T09:30:00') }] }), true);
});

test('action buttons say what they do', () => {
  assert.equal(actionLabel('review_account', true), 'Review account');
  assert.equal(actionLabel('review_account', false), 'Open profile');
  assert.equal(actionLabel('review_request', false), 'View request');
  assert.equal(actionLabel('unknown', true), '');
});

test('each kind of notification gets its own icon', () => {
  assert.equal(notificationKind(newAccount), 'account');
  assert.equal(notificationKind(newRequest), 'request');
  assert.equal(notificationKind({ title: 'Request Withdrawn', type: 'request' }), 'withdrawn');
  assert.equal(notificationKind(announcement), 'announcement');
  assert.equal(notificationKind({ title: 'Biometric Enrollment Submitted', type: 'biometric_enrollment' }), 'biometric');
  assert.equal(notificationKind(oldNotice), 'people');
});

test('notifications show how long ago they arrived', () => {
  assert.equal(dayGroup(new Date('2026-10-01T00:30:00').getTime(), now), 'Today');
  assert.equal(dayGroup(new Date('2026-09-30T23:30:00').getTime(), now), 'Yesterday');
  assert.equal(dayGroup(new Date('2026-09-29T12:00:00').getTime(), now), 'Earlier');
  assert.equal(notificationWhen(newAccount, now), '5 min ago');
  assert.equal(notificationWhen(newRequest, now), '2 hr ago');
  assert.equal(notificationWhen(announcement, now), '4:12 PM');
  assert.equal(notificationWhen(oldNotice, now), 'Sep 20');
  assert.equal(notificationWhen({ time: 'Just now' }, now), 'Just now');
});

test('notifications are grouped with the ones needing action first', () => {
  const list = [announcement, oldNotice, newRequest, newAccount];
  const sections = notificationSections(list, { context, now });
  assert.deepEqual(sections.map(section => section.label), ['Needs action', 'Yesterday', 'Earlier']);
  assert.deepEqual(sections[0].items.map(item => item.notification.id), ['n1', 'n2']);

  assert.deepEqual(notificationSections(list, { tab: 'unread', context, now }).flatMap(s => s.items.map(i => i.notification.id)), ['n1', 'n4']);
  assert.deepEqual(notificationSections(list, { tab: 'action', context, now }).flatMap(s => s.items.map(i => i.notification.id)), ['n1', 'n2']);
  assert.deepEqual(notificationSections(list, { query: 'flag', context, now }).flatMap(s => s.items.map(i => i.notification.id)), ['n3']);
  assert.deepEqual(notificationCounts(list, context), { all: 4, unread: 2, action: 2 });
});

test("an employee's notification opens its saved page, or its kind's page", () => {
  assert.equal(employeeNotificationView({ type: 'system', view: 'settings' }), 'settings');
  assert.equal(employeeNotificationView({ type: 'request' }), 'requests');
  assert.equal(employeeNotificationView({ type: 'attendance' }), 'attendance');
  assert.equal(employeeNotificationView({ type: 'biometric_enrollment' }), 'profile');
  assert.equal(employeeNotificationView({ type: 'system' }), '');
});
