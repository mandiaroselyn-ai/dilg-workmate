import assert from 'node:assert/strict';
import test from 'node:test';
import { Announcement } from '../models/announcementModel.js';
import { createEvent } from './announcementController.js';

const call = async (handler, body) => {
  let statusCode = 200;
  let json;
  const res = { status(code) { statusCode = code; return this; }, json(value) { json = value; return this; } };
  await handler({ user: { accessLevel: 'hr_admin', name: 'HR One' }, params: {}, body }, res);
  return { statusCode, json };
};

const eventBody = { title: 'Quarterly Staff Meeting', date: '2026-10-05', time: '09:00 AM', type: 'meeting' };

test('a new calendar event notifies every employee', async t => {
  t.mock.method(Announcement, 'createEvent', async value => ({ ...value, id: 'evt-1' }));
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);

  const { statusCode, json } = await call(createEvent, eventBody);

  assert.equal(statusCode, 201);
  assert.equal(json.event.id, 'evt-1');
  assert.equal(notify.mock.callCount(), 1);
  const notice = notify.mock.calls[0].arguments[0];
  assert.equal(notice.title, 'New Event');
  assert.equal(notice.message, 'Quarterly Staff Meeting is scheduled on 2026-10-05 at 09:00 AM. See the Calendar for details.');
  // No recipient means every employee sees it.
  assert.equal(notice.employeeId, undefined);
  assert.equal(notice.employeeEmail, undefined);
  assert.equal(notice.recipientRole, undefined);
});

test('the event is still saved when the notification fails', async t => {
  t.mock.method(Announcement, 'createEvent', async value => ({ ...value, id: 'evt-2' }));
  t.mock.method(Announcement, 'createNotification', async () => { throw new Error('database unavailable'); });
  t.mock.method(console, 'error', () => {});

  const { statusCode, json } = await call(createEvent, eventBody);

  assert.equal(statusCode, 201);
  assert.equal(json.event.id, 'evt-2');
});

test('an invalid event is rejected without notifying anyone', async t => {
  const save = t.mock.method(Announcement, 'createEvent', async value => value);
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);

  const { statusCode } = await call(createEvent, { ...eventBody, date: 'next week' });

  assert.equal(statusCode, 400);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(notify.mock.callCount(), 0);
});
