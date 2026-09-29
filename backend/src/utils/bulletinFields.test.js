import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAnnouncementInput, normalizeEventInput } from './bulletinFields.js';

test('accepts a complete announcement and fills in defaults', () => {
  const { value, error } = normalizeAnnouncementInput({ title: ' DTR schedule ', content: 'Submit DTRs by Friday.' });
  assert.equal(error, undefined);
  assert.equal(value.title, 'DTR schedule');
  assert.equal(value.category, 'Memorandum');
  assert.match(value.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('rejects announcements without a title or with an unknown category', () => {
  assert.match(normalizeAnnouncementInput({ content: 'Text' }).error, /Title/);
  assert.match(normalizeAnnouncementInput({ title: 'T', content: 'C', category: 'Gossip' }).error, /category/);
  assert.match(normalizeAnnouncementInput({ title: 'T', content: { $gt: '' } }).error, /text/);
});

test('announcement edits only change the fields that were sent', () => {
  assert.deepEqual(normalizeAnnouncementInput({ important: true }, { partial: true }).value, { important: true });
  assert.match(normalizeAnnouncementInput({}, { partial: true }).error, /No changes/);
});

test('validates calendar events', () => {
  const { value } = normalizeEventInput({ title: 'LGU Summit', date: '2026-10-05', time: '09:00 AM', type: 'training' });
  assert.equal(value.type, 'training');
  assert.match(normalizeEventInput({ title: 'X', date: 'next week', time: '9' }).error, /date/);
  assert.match(normalizeEventInput({ title: 'X', date: '2026-10-05', time: '9', type: 'party' }).error, /type/);
});
