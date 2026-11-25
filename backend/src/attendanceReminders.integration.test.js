import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'attendance-reminders-test-secret';
// No database here: every model call the reminders make is mocked in each test.

const { createApiApp } = await import('./app.js');
const { sendAttendanceReminders } = await import('./services/attendanceReminders.js');
const { User } = await import('./models/User.js');
const { Holiday } = await import('./models/holidayModel.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { Leave } = await import('./models/leaveModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { AttendanceReminder } = await import('./models/attendanceReminderModel.js');

const app = createApiApp();

// Manila is UTC+8: Tuesday, December 1, 2026 at `hour`:`minute`.
const tuesdayAt = (hour, minute = 0) => new Date(Date.UTC(2026, 11, 1, hour - 8, minute));

const people = {
  notIn: { employeeId: 'E-1', email: 'one@dilg.gov.ph', office: 'Provincial Office' },
  timedIn: { employeeId: 'E-2', email: 'two@dilg.gov.ph' },
  onLeave: { employeeId: 'E-3', email: 'three@dilg.gov.ph' },
  onTravel: { employeeId: 'E-4', email: 'four@dilg.gov.ph' },
  hiredLater: { employeeId: 'E-5', email: 'five@dilg.gov.ph', dateHired: '2026-12-15' },
  gasan: { employeeId: 'E-6', email: 'six@dilg.gov.ph', office: 'Office of the MLGOO - Gasan' }
};

// Mocks the database with `logs` for the day, and returns the notifications sent and the
// reminders already recorded as sent.
const mockDay = (t, { logs = [], holidays = [], sentBefore = [] } = {}) => {
  const sent = [];
  const claimed = new Set(sentBefore);
  t.mock.method(User, 'findAttendanceReminderRecipients', async () => Object.values(people));
  t.mock.method(Holiday, 'findAll', async () => holidays);
  t.mock.method(DtrLog, 'findPunchesOnDate', async () => logs);
  t.mock.method(Leave, 'findApprovedAbsencesOn', async () => [
    { id: 'LV-1', type: 'Leave Request', status: 'Approved', startDate: '2026-11-30', endDate: '2026-12-02', employeeId: 'E-3' },
    { id: 'TO-1', type: 'Travel Order', status: 'Approved', startDate: '2026-12-01', endDate: '2026-12-01', employeeId: 'E-9', companions: [{ employeeId: 'E-4' }] }
  ]);
  t.mock.method(AttendanceReminder, 'claim', async keys => keys.filter(key => !claimed.has(key) && claimed.add(key)));
  t.mock.method(Announcement, 'createNotification', async notice => { sent.push(notice); return notice; });
  return { sent, claimed };
};

test('the Time In reminder goes only to those due to Time In that day', async t => {
  const { sent } = mockDay(t, { logs: [{ employeeId: 'E-2', timeIn: '08:10 AM' }] });
  const result = await sendAttendanceReminders(tuesdayAt(8, 35));
  assert.equal(result.sent, 2);
  assert.deepEqual(sent.map(notice => notice.employeeId).sort(), ['E-1', 'E-6']);
  for (const notice of sent) {
    assert.equal(notice.title, 'Time In Reminder');
    assert.equal(notice.type, 'attendance');
    assert.equal(notice.view, 'attendance');
    assert.equal(notice.waitForPush, true);
    assert.equal(notice.ring, true);
  }
});

test('a town holiday skips only that town, and each reminder is sent once a day', async t => {
  const { sent } = mockDay(t, { holidays: [{ date: '2026-12-01', name: 'Town fiesta', place: 'Gasan' }] });
  await sendAttendanceReminders(tuesdayAt(8, 35));
  await sendAttendanceReminders(tuesdayAt(8, 50));
  assert.deepEqual(sent.map(notice => notice.employeeId), ['E-1', 'E-2']);
});

test('Lunch Out, Lunch In, and Time Out reminders follow each one\'s punches', async t => {
  const { sent } = mockDay(t, {
    logs: [
      { employeeId: 'E-1', timeIn: '07:30 AM' },
      { employeeEmail: 'TWO@dilg.gov.ph', timeIn: '08:00 AM', lunchOut: '12:01 PM' },
      { employeeId: 'E-6', timeIn: '07:00 AM', lunchOut: '12:00 PM', lunchIn: '12:58 PM', timeOut: '04:00 PM' }
    ]
  });
  await sendAttendanceReminders(tuesdayAt(12, 5));
  assert.deepEqual(sent.map(notice => [notice.employeeId, notice.title]), [['E-1', 'Lunch Out Reminder']]);

  sent.length = 0;
  await sendAttendanceReminders(tuesdayAt(12, 50));
  assert.deepEqual(sent.map(notice => [notice.employeeId, notice.title]), [['E-2', 'Lunch In Reminder']]);

  sent.length = 0;
  // E-1 came in at 7:30, so the day ends at 4:30 PM; E-2 at 8:00 ends at 5:00 PM; E-6 is out.
  await sendAttendanceReminders(tuesdayAt(16, 20));
  assert.deepEqual(sent.map(notice => [notice.employeeId, notice.message]), [
    ['E-1', 'Your eight working hours today end at 4:30 PM. Record your Time Out before you leave.']
  ]);
});

test('a run with no reminder due reads nothing', async t => {
  mockDay(t);
  const result = await sendAttendanceReminders(tuesdayAt(10, 0));
  assert.equal(result.sent, 0);
  assert.equal(User.findAttendanceReminderRecipients.mock.callCount(), 0);
});

test('the scheduler reaches the endpoint without a sign-in, and CRON_SECRET locks it when set', async t => {
  mockDay(t);
  t.after(() => { delete process.env.CRON_SECRET; });

  const open = await request(app).post('/api/attendance-reminders');
  assert.equal(open.status, 200);
  assert.equal(open.body.success, true);

  process.env.CRON_SECRET = 'a-long-random-cron-secret';
  const refused = await request(app).post('/api/attendance-reminders');
  assert.equal(refused.status, 401);
  const wrong = await request(app).post('/api/attendance-reminders').set('Authorization', 'Bearer nope');
  assert.equal(wrong.status, 401);
  const allowed = await request(app).post('/api/attendance-reminders').set('Authorization', 'Bearer a-long-random-cron-secret');
  assert.equal(allowed.status, 200);
});
