import { getManilaDateString } from '../../../shared/localDate.js';

// Validation for HR announcements and calendar events. Each function returns
// { value } with the cleaned fields, or { error } with a message for HR.

export const ANNOUNCEMENT_CATEGORIES = ['Memorandum', 'Meeting', 'Guidelines', 'Training'];
export const EVENT_TYPES = ['meeting', 'training', 'event'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const readText = (body, field, { required = false, max, label = field }) => {
  const raw = body?.[field];
  if (raw === undefined || raw === null) return required ? { error: `${label} is required.` } : { skip: true };
  if (typeof raw !== 'string') return { error: `${label} must be text.` };
  const text = raw.trim();
  if (required && !text) return { error: `${label} is required.` };
  if (text.length > max) return { error: `${label} must be ${max} characters or fewer.` };
  return { text };
};

// `partial` is used for edits: fields that are not sent are left unchanged.
export const normalizeAnnouncementInput = (body, { partial = false } = {}) => {
  const value = {};
  const fields = [
    ['title', { required: !partial, max: 200, label: 'Title' }],
    ['content', { required: !partial, max: 5000, label: 'Announcement text' }],
    ['referenceNo', { max: 100, label: 'Reference number' }]
  ];
  for (const [field, options] of fields) {
    const result = readText(body, field, options);
    if (result.error) return { error: result.error };
    if (!result.skip) value[field] = result.text;
  }
  if (body?.category !== undefined || !partial) {
    const category = body?.category ?? 'Memorandum';
    if (!ANNOUNCEMENT_CATEGORIES.includes(category)) return { error: 'Choose a valid announcement category.' };
    value.category = category;
  }
  if (body?.date !== undefined || !partial) {
    const date = body?.date || getManilaDateString();
    if (typeof date !== 'string' || !DATE_PATTERN.test(date)) return { error: 'Use a valid date.' };
    value.date = date;
  }
  if (body?.important !== undefined) value.important = body.important === true;
  if (partial && Object.keys(value).length === 0) return { error: 'No changes were sent.' };
  return { value };
};

export const normalizeEventInput = (body, { partial = false } = {}) => {
  const value = {};
  const fields = [
    ['title', { required: !partial, max: 200, label: 'Title' }],
    ['time', { required: !partial, max: 20, label: 'Time' }],
    ['description', { max: 2000, label: 'Description' }],
    ['location', { max: 200, label: 'Location' }]
  ];
  for (const [field, options] of fields) {
    const result = readText(body, field, options);
    if (result.error) return { error: result.error };
    if (!result.skip) value[field] = result.text;
  }
  if (body?.date !== undefined || !partial) {
    if (typeof body?.date !== 'string' || !DATE_PATTERN.test(body.date)) return { error: 'Use a valid event date.' };
    value.date = body.date;
  }
  if (body?.type !== undefined || !partial) {
    const type = body?.type ?? 'event';
    if (!EVENT_TYPES.includes(type)) return { error: 'Choose a valid event type.' };
    value.type = type;
  }
  if (partial && Object.keys(value).length === 0) return { error: 'No changes were sent.' };
  return { value };
};
