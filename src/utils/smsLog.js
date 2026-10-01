// Helpers for HR's SMS panel and SMS Log page.

const lower = value => String(value || '').trim().toLowerCase();

// The last ten digits of a Philippine mobile number (9171234567), for matching numbers
// written as 0917…, +63917…, or with spaces.
const numberKey = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

// A mobile number written the way people read it: 0917 123 4567.
export const formatMobile = value => {
  const key = numberKey(value);
  return /^9\d{9}$/.test(key) ? `0${key.slice(0, 3)} ${key.slice(3, 6)} ${key.slice(6)}` : String(value || '');
};

// What a message was about: 'attendance', 'account', 'manual', 'reply', or 'other'.
// Messages saved before this was recorded are recognized by their text.
export const smsKind = (sms = {}) => {
  if (sms.kind) return sms.kind;
  if (sms.direction === 'inbound') return 'reply';
  const message = String(sms.message || '');
  if (/account has been approved/i.test(message)) return 'account';
  if (/\btime (in|out)\b/i.test(message)) return 'attendance';
  return 'other';
};

export const SMS_KIND_LABELS = {
  attendance: 'Attendance',
  account: 'Account approved',
  manual: 'Sent by staff',
  reply: 'Reply',
  other: 'Other'
};

// 'Sent', 'Failed', or 'Received'.
export const smsStatus = (sms = {}) => {
  if (sms.direction === 'inbound') return 'Received';
  return sms.status === 'Failed' ? 'Failed' : 'Sent';
};

export const smsTime = (sms = {}) => {
  const time = Date.parse(sms.createdAt || '') || Date.parse(sms.timestamp || '');
  return Number.isFinite(time) ? time : null;
};

// When a message was sent or received, such as "Oct 1, 9:02 AM".
export const smsWhen = (sms = {}) => {
  const time = smsTime(sms);
  if (time === null) return sms.timestamp || '';
  return new Date(time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// The employee a message was sent to or received from, matched by employee ID, email, or
// mobile number, with a key that groups their messages together.
export const smsPerson = (sms = {}, employees = []) => {
  const number = sms.direction === 'inbound' ? sms.sender || sms.recipient : sms.recipient;
  const employee = employees.find(person => (sms.employeeId && person.employeeId === sms.employeeId)
    || (sms.employeeEmail && lower(person.email) === lower(sms.employeeEmail))
    || (numberKey(number) && numberKey(person.phoneNumber) === numberKey(number)));
  return {
    key: employee ? `employee:${lower(employee.employeeId || employee.email)}` : `number:${numberKey(number)}`,
    name: employee?.name || formatMobile(number) || 'Unknown number',
    number: formatMobile(number),
    employee: employee || null
  };
};

export const SMS_FILTERS = ['all', 'failed', 'reply', 'attendance', 'account'];

export const matchesSmsFilter = (sms, filter) => {
  if (filter === 'all') return true;
  if (filter === 'failed') return smsStatus(sms) === 'Failed';
  return smsKind(sms) === filter;
};

// How many messages each filter holds.
export const smsFilterCounts = (list = []) => Object.fromEntries(
  SMS_FILTERS.map(filter => [filter, list.filter(sms => matchesSmsFilter(sms, filter)).length])
);

// Messages grouped by person, newest conversation first; each thread's messages run
// oldest to newest, and `latest` is the newest.
export const smsThreads = (list = [], employees = []) => {
  const threads = new Map();
  for (const sms of list) {
    const person = smsPerson(sms, employees);
    if (!threads.has(person.key)) threads.set(person.key, { ...person, messages: [] });
    threads.get(person.key).messages.push(sms);
  }
  return [...threads.values()]
    .map(thread => {
      const messages = [...thread.messages].sort((a, b) => (smsTime(a) ?? 0) - (smsTime(b) ?? 0));
      return { ...thread, messages, latest: messages[messages.length - 1] };
    })
    .sort((a, b) => (smsTime(b.latest) ?? 0) - (smsTime(a.latest) ?? 0));
};

// Messages that need HR's attention (failed texts and replies) that arrived after `since`.
export const unseenSmsCount = (list = [], since = 0) => list.filter(sms => {
  const status = smsStatus(sms);
  return (status === 'Failed' || status === 'Received') && (smsTime(sms) ?? 0) > since;
}).length;

// Matches a message by the person's name or number, or by its text.
export const matchesSmsSearch = (sms, employees, query) => {
  const search = lower(query);
  if (!search) return true;
  const person = smsPerson(sms, employees);
  return lower(`${person.name} ${person.number} ${sms.message}`).includes(search);
};

export const SMS_CSV_HEADERS = ['Date and time', 'Name', 'Mobile number', 'Type', 'Status', 'Message', 'Reason not delivered'];

// One CSV row per message, in the order of SMS_CSV_HEADERS.
export const smsCsvRows = (list = [], employees = []) => list.map(sms => {
  const person = smsPerson(sms, employees);
  return [smsWhen(sms), person.employee ? person.name : '', person.number, SMS_KIND_LABELS[smsKind(sms)], smsStatus(sms), sms.message || '', sms.error || ''];
});
