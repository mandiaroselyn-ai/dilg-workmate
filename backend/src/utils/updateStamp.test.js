import assert from 'node:assert/strict';
import test from 'node:test';
import { stampOf } from './updateStamp.js';

// Stands in for a Mongoose model holding the given records.
const fakeModel = records => ({
  countDocuments: async () => records.length,
  findOne: () => ({
    sort: () => ({
      select: () => ({
        lean: async () => [...records].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null
      })
    })
  })
});

test('the fingerprint changes when a record is added, edited, or deleted', async () => {
  const records = [{ updatedAt: new Date('2026-09-30T01:00:00Z') }, { updatedAt: new Date('2026-09-30T02:00:00Z') }];
  const before = await stampOf(fakeModel(records));
  assert.equal(before, `2:${Date.parse('2026-09-30T02:00:00Z')}`);

  assert.notEqual(await stampOf(fakeModel([...records, { updatedAt: new Date('2026-09-30T03:00:00Z') }])), before);
  assert.notEqual(await stampOf(fakeModel([records[0], { updatedAt: new Date('2026-09-30T04:00:00Z') }])), before);
  assert.notEqual(await stampOf(fakeModel([records[1]])), before);
  assert.equal(await stampOf(fakeModel(records)), before);
});

test('an empty list has a fingerprint too', async () => {
  assert.equal(await stampOf(fakeModel([])), '0:0');
});
