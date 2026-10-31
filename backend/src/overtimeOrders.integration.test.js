import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'overtime-order-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { OvertimeOrder } = await import('./models/overtimeOrderModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { normalizeOvertimeOrder } = await import('./utils/overtimeOrders.js');

const app = createApiApp();
const hrAdmin = { _id: '64b000000000000000000051', email: 'hr@dilg.gov.ph', employeeId: 'HR-5', name: 'Maria Santos', accessLevel: 'hr_admin', accountStatus: 'Active' };
const employee = { _id: '64b000000000000000000052', email: 'juan@dilg.gov.ph', employeeId: 'EMP-5', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
const order = { orderNumber: ' OO No. 2026-014 ', purpose: 'Year-end reports', startDate: '2026-12-05', endDate: '2026-12-06', startTime: '08:00', endTime: '17:00', employeeIds: ['EMP-5', 'EMP-5', 'EMP-6'] };

const as = (t, person) => {
  t.mock.method(User, 'findByEmail', async () => person);
  const token = `Bearer ${createAuthToken(person)}`;
  return {
    post: body => request(app).post('/api/overtime-orders').set('Authorization', token).send(body),
    remove: id => request(app).delete(`/api/overtime-orders?id=${id}`).set('Authorization', token)
  };
};

test('HR adds an office order for overtime', async t => {
  const created = t.mock.method(OvertimeOrder, 'create', async saved => [{ id: 'o1', ...saved }]);
  const response = await as(t, hrAdmin).post(order);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const [saved, addedBy] = created.mock.calls[0].arguments;
  assert.equal(saved.orderNumber, 'OO No. 2026-014');
  assert.deepEqual(saved.employeeIds, ['EMP-5', 'EMP-6']);
  assert.equal(addedBy, 'Maria Santos');
  assert.equal(response.body.overtimeOrders[0].id, 'o1');
});

test('HR removes an office order, and one that is not there is a 404', async t => {
  t.mock.method(OvertimeOrder, 'findAll', async () => []);
  const removed = t.mock.method(OvertimeOrder, 'remove', async id => id === 'o1');
  const hr = as(t, hrAdmin);
  assert.equal((await hr.remove('o1')).status, 200);
  assert.equal((await hr.remove('o2')).status, 404);
  assert.equal(removed.mock.callCount(), 2);
});

test('an employee cannot add or remove office orders', async t => {
  const created = t.mock.method(OvertimeOrder, 'create', async () => []);
  const removed = t.mock.method(OvertimeOrder, 'remove', async () => true);
  const person = as(t, employee);
  assert.equal((await person.post(order)).status, 403);
  assert.equal((await person.remove('o1')).status, 403);
  assert.equal(created.mock.callCount(), 0);
  assert.equal(removed.mock.callCount(), 0);
});

test('HR loads every office order, an employee only their own, and a supervisor none', async t => {
  const { default: mongoose } = await import('mongoose');
  const { connectDB } = await import('./config/db.js');
  const { Announcement } = await import('./models/announcementModel.js');
  const { DtrLog } = await import('./models/dtrLogModel.js');
  const { Holiday } = await import('./models/holidayModel.js');
  const { Leave } = await import('./models/leaveModel.js');

  // Marks the database as connected without connecting to one.
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://test.invalid/workmate';
  t.mock.method(mongoose, 'connect', async () => mongoose);
  await connectDB();

  for (const [model, methods] of [
    [DtrLog, ['findListForEmployee', 'findForHrList']],
    [Leave, ['findAllRequests']],
    [Announcement, ['findEvents', 'findNotificationsFor', 'findSmsAlerts', 'getAcknowledged', 'findAnnouncementPosts']],
    [Holiday, ['findAll']]
  ]) methods.forEach(method => t.mock.method(model, method, async () => []));
  t.mock.method(User, 'countActiveEmployees', async () => 1);

  const stored = { _id: new mongoose.Types.ObjectId(), orderNumber: 'OO 14', purpose: 'Reports', startDate: '2026-12-05', endDate: '2026-12-05', startTime: '08:00', endTime: '17:00', employeeIds: ['EMP-5'] };
  const query = { sort: () => query, lean: async () => [stored] };
  const find = t.mock.method(mongoose.models.OvertimeOrder, 'find', () => query);
  const state = async person => {
    User.findByEmail.mock?.restore();
    t.mock.method(User, 'findByEmail', async () => person);
    return request(app).get('/api/state').set('Authorization', `Bearer ${createAuthToken(person)}`);
  };

  const hr = await state(hrAdmin);
  assert.equal(hr.status, 200, JSON.stringify(hr.body));
  assert.deepEqual(find.mock.calls[0].arguments, []);
  assert.deepEqual(hr.body.overtimeOrders, [{ id: stored._id.toString(), orderNumber: 'OO 14', purpose: 'Reports', startDate: '2026-12-05', endDate: '2026-12-05', startTime: '08:00', endTime: '17:00', employeeIds: ['EMP-5'] }]);

  const own = await state(employee);
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.deepEqual(find.mock.calls[1].arguments, [{ employeeIds: { $in: ['EMP-5', 'juan@dilg.gov.ph'] } }]);

  const supervisor = await state({ ...hrAdmin, _id: '64b000000000000000000053', email: 'sup@dilg.gov.ph', accessLevel: 'supervisor' });
  assert.equal(supervisor.status, 200, JSON.stringify(supervisor.body));
  assert.deepEqual(supervisor.body.overtimeOrders, []);
  assert.equal(find.mock.callCount(), 2);
});

test('an office order must say who, for what, and when', () => {
  assert.equal(normalizeOvertimeOrder(order).order.orderNumber, 'OO No. 2026-014');
  const rejected = [
    [{ orderNumber: '' }, /office order number/],
    [{ purpose: '  ' }, /purpose/],
    [{ startDate: '2026-02-30', endDate: '2026-03-01' }, /real date/],
    [{ startDate: '2026-13-01' }, /real date/],
    [{ startDate: '2026-12-07' }, /last date/],
    [{ endTime: '5 PM' }, /written like 17:30/],
    [{ startTime: '24:00' }, /written like 17:30/],
    [{ startTime: '17:00', endTime: '17:00' }, /after the start time/],
    [{ employeeIds: [] }, /at least one employee/],
    [{ employeeIds: ['EMP-5', ' '] }, /employee ID or email/]
  ];
  for (const [changes, message] of rejected) {
    assert.match(normalizeOvertimeOrder({ ...order, ...changes }).error, message);
  }
});
