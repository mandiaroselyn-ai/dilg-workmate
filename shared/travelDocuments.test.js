import assert from 'node:assert/strict';
import test from 'node:test';
import { sniffTravelDocumentType, travelDocumentsOpen } from './travelDocuments.js';

test('files are attached to a Travel Order once it is approved', () => {
  const order = { type: 'Travel Order', status: 'Approved', startDate: '2026-11-09', endDate: '2026-11-10' };
  assert.equal(travelDocumentsOpen(order), true);
  for (const status of ['Draft', 'For Supervisor', 'Pending', 'Rejected', 'Returned', 'Withdrawn']) {
    assert.equal(travelDocumentsOpen({ ...order, status }), false, status);
  }
  assert.equal(travelDocumentsOpen({ ...order, type: 'Leave Request' }), false);
});

test('only a PDF, JPG, or PNG is taken, by what its bytes are', () => {
  assert.equal(sniffTravelDocumentType(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  assert.equal(sniffTravelDocumentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffTravelDocumentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'image/png');
  assert.equal(sniffTravelDocumentType(Buffer.from('MZ executable')), '');
  assert.equal(sniffTravelDocumentType(Buffer.from('<html>')), '');
});
