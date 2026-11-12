import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'travel-documents-test-secret';
process.env.HTTPSMS_API_KEY = '';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Leave } = await import('./models/leaveModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { TravelDocument } = await import('./models/travelDocumentModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();

const juan = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
const maria = { _id: 'e-7', email: 'maria@dilg.gov.ph', employeeId: 'E7', name: 'Maria Santos', accessLevel: 'employee', accountStatus: 'Active' };
const pedro = { _id: 'e-9', email: 'pedro@dilg.gov.ph', employeeId: 'E9', name: 'Pedro Reyes', accessLevel: 'employee', accountStatus: 'Active' };
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', name: 'Ma. Joane O. Salcedo', accessLevel: 'hr_admin', hrTask: 'leave-credits', accountStatus: 'Active' };
const head = { _id: 's-1', email: 'boss@dilg.gov.ph', employeeId: 'S1', name: 'Ivan Fadri', accessLevel: 'supervisor', accountStatus: 'Active' };
const people = Object.fromEntries([juan, maria, pedro, hr, head].map(person => [person.email, person]));

const pdf = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

// TO-APPROVED was approved (its travel is still ahead); TO-WAITING is still with the Provincial
// Director.
const useTravelOrders = t => {
  const orders = {
    'TO-APPROVED': { id: 'TO-APPROVED', customId: 'TO-APPROVED', type: 'Travel Order', status: 'Approved', travelActivity: 'Resource speaker', startDate: '2026-11-19', endDate: '2026-11-20', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', companions: [{ employeeId: 'E7', name: 'Maria Santos' }], travelDocuments: [] },
    'TO-WAITING': { id: 'TO-WAITING', customId: 'TO-WAITING', type: 'Travel Order', status: 'For Supervisor', startDate: '2026-11-02', endDate: '2026-11-03', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', travelDocuments: [] }
  };
  const files = new Map();
  t.mock.method(User, 'findByEmail', async email => people[email] || null);
  t.mock.method(Leave, 'findByCustomId', async id => (orders[id] ? structuredClone(orders[id]) : null));
  t.mock.method(Leave, 'addTravelDocument', async (id, note, max) => {
    if (orders[id].travelDocuments.length >= max) return null;
    orders[id].travelDocuments.push(note);
    return structuredClone(orders[id]);
  });
  t.mock.method(Leave, 'removeTravelDocument', async (id, documentId) => {
    orders[id].travelDocuments = orders[id].travelDocuments.filter(item => item.id !== documentId);
    return structuredClone(orders[id]);
  });
  t.mock.method(TravelDocument, 'save', async doc => { files.set(doc.documentId, { ...doc, data: Buffer.from(doc.bytes), uploadedAt: new Date() }); });
  t.mock.method(TravelDocument, 'find', async (ref, id) => {
    const doc = files.get(id);
    return doc && doc.ref === ref ? { ...doc, size: doc.data.length } : null;
  });
  t.mock.method(TravelDocument, 'remove', async (_ref, id) => { files.delete(id); });
  const notices = t.mock.method(Announcement, 'createNotification', async notice => notice);
  const as = person => `Bearer ${createAuthToken(person)}`;
  return {
    files,
    notices,
    upload: (person, body) => request(app).post('/api/travel-documents').set('Authorization', as(person)).send(body),
    view: (person, ref, id) => request(app).get(`/api/travel-documents?ref=${ref}&id=${id}`).set('Authorization', as(person)),
    remove: (person, ref, id) => request(app).delete(`/api/travel-documents?ref=${ref}&id=${id}`).set('Authorization', as(person))
  };
};
const fileOf = (bytes, fileName = 'file.pdf') => ({ fileName, data: bytes.toString('base64') });

test('once a Travel Order is approved, each employee on it attaches a Post Activity Report or Certificate of Appearance, and HR is told', async t => {
  const session = useTravelOrders(t);
  const report = await session.upload(juan, { ref: 'TO-APPROVED', kind: 'report', ...fileOf(pdf, 'post-activity-report.pdf') });
  assert.equal(report.status, 201, JSON.stringify(report.body));
  const [note] = report.body.request.travelDocuments;
  assert.equal(note.kind, 'report');
  assert.equal(note.mimeType, 'application/pdf');
  assert.equal(note.uploadedBy, 'Juan Dela Cruz');
  // A colleague the filer included attaches their own.
  const certificate = await session.upload(maria, { ref: 'TO-APPROVED', kind: 'certificate', ...fileOf(png, 'maria.png') });
  assert.equal(certificate.status, 201, JSON.stringify(certificate.body));
  assert.equal(certificate.body.request.travelDocuments[1].kind, 'certificate');
  assert.equal(certificate.body.request.travelDocuments[1].mimeType, 'image/png');
  // HR keeps them: it is notified, and the notice opens the Travel Order.
  const notice = session.notices.mock.calls[0].arguments[0];
  assert.equal(notice.recipientRole, 'hr_admin');
  assert.equal(notice.type, 'travel_document');
  assert.equal(notice.targetId, 'TO-APPROVED');
  assert.match(notice.message, /Juan Dela Cruz attached a Post Activity Report to Travel Order TO-APPROVED \(Resource speaker\)/);
  assert.match(session.notices.mock.calls[1].arguments[0].message, /Maria Santos attached a Certificate of Appearance/);
});

test('the employee says which one they attach', async t => {
  const session = useTravelOrders(t);
  for (const kind of [undefined, '', 'receipt']) {
    const response = await session.upload(juan, { ref: 'TO-APPROVED', kind, ...fileOf(pdf) });
    assert.equal(response.status, 400, String(kind));
    assert.match(response.body.error, /Post Activity Report or a Certificate of Appearance/);
  }
  assert.equal(session.files.size, 0);
});

test('only the employees on an approved Travel Order attach files', async t => {
  const session = useTravelOrders(t);
  for (const person of [pedro, hr, head]) {
    assert.equal((await session.upload(person, { ref: 'TO-APPROVED', kind: 'report', ...fileOf(pdf) })).status, 403, person.name);
  }
  const waiting = await session.upload(juan, { ref: 'TO-WAITING', kind: 'report', ...fileOf(pdf) });
  assert.equal(waiting.status, 409);
  assert.match(waiting.body.error, /once the Travel Order is approved/);
  assert.equal(session.files.size, 0);
});

test('an attached file is a PDF, JPG, or PNG of 3 MB at most', async t => {
  const session = useTravelOrders(t);
  const notAFile = await session.upload(juan, { ref: 'TO-APPROVED', kind: 'report', ...fileOf(Buffer.from('<html><script>'), 'page.pdf') });
  assert.equal(notAFile.status, 400);
  assert.match(notAFile.body.error, /PDF, JPG, or PNG/);
  const large = Buffer.concat([pdf, Buffer.alloc(3 * 1024 * 1024)]);
  assert.match((await session.upload(juan, { ref: 'TO-APPROVED', kind: 'report', ...fileOf(large) })).body.error, /too large/);
  assert.match((await session.upload(juan, { ref: 'TO-APPROVED', kind: 'report', fileName: 'x.pdf', data: '' })).body.error, /Choose the file/);
  assert.equal(session.files.size, 0);
});

test('the employees on the Travel Order, HR, and the Supervisor open the files; the uploader removes their own', async t => {
  const session = useTravelOrders(t);
  const uploaded = await session.upload(juan, { ref: 'TO-APPROVED', kind: 'certificate', ...fileOf(pdf) });
  const { id } = uploaded.body.request.travelDocuments[0];
  for (const person of [juan, maria, hr, head]) {
    const opened = await session.view(person, 'TO-APPROVED', id);
    assert.equal(opened.status, 200, person.name);
    assert.deepEqual(Buffer.from(opened.body.document.data, 'base64'), pdf);
  }
  assert.equal((await session.view(pedro, 'TO-APPROVED', id)).status, 404);
  // Only the one who attached it removes it.
  assert.equal((await session.remove(maria, 'TO-APPROVED', id)).status, 403);
  assert.equal((await session.remove(hr, 'TO-APPROVED', id)).status, 403);
  const removed = await session.remove(juan, 'TO-APPROVED', id);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.request.travelDocuments, []);
  assert.equal(session.files.size, 0);
});

test('a Travel Order keeps up to 10 attached files', async t => {
  const session = useTravelOrders(t);
  for (let index = 0; index < 10; index += 1) {
    assert.equal((await session.upload(juan, { ref: 'TO-APPROVED', kind: 'report', ...fileOf(pdf, `r${index}.pdf`) })).status, 201);
  }
  const extra = await session.upload(juan, { ref: 'TO-APPROVED', kind: 'report', ...fileOf(pdf) });
  assert.equal(extra.status, 409);
  assert.match(extra.body.error, /up to 10 uploaded files/);
  assert.equal(session.files.size, 10);
});
