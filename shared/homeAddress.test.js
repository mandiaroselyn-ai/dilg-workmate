import assert from 'node:assert/strict';
import test from 'node:test';
import { OTHER_ADDRESS, joinHomeAddress, splitHomeAddress } from './homeAddress.js';

test('a Marinduque address is saved as one line and read back into its parts', () => {
  const parts = { town: 'Boac', barangay: 'Santol', street: '12 Mabini St.', other: '' };
  assert.equal(joinHomeAddress(parts), '12 Mabini St., Santol, Boac, Marinduque');
  assert.deepEqual(splitHomeAddress('12 Mabini St., Santol, Boac, Marinduque'), parts);
  assert.equal(joinHomeAddress({ town: 'Santa Cruz', barangay: 'Pag-Asa Pob.' }), 'Pag-Asa Pob., Santa Cruz, Marinduque');
  assert.deepEqual(splitHomeAddress('Pag-Asa Pob., Santa Cruz, Marinduque'), { town: 'Santa Cruz', barangay: 'Pag-Asa Pob.', street: '', other: '' });
});

test('a street with a comma stays whole', () => {
  const parts = { town: 'Gasan', barangay: 'Barangay I (Pob.)', street: 'Blk 2, Lot 5', other: '' };
  assert.deepEqual(splitHomeAddress(joinHomeAddress(parts)), parts);
});

test('a town chosen before its barangay reads back the same', () => {
  for (const parts of [
    { town: 'Mogpog', barangay: '', street: '', other: '' },
    { town: 'Mogpog', barangay: '', street: 'Purok 3', other: '' }
  ]) {
    assert.deepEqual(splitHomeAddress(joinHomeAddress(parts)), parts);
  }
});

test('an address typed before, or outside Marinduque, is kept as Other', () => {
  assert.deepEqual(splitHomeAddress('Lucena City, Quezon'), { town: OTHER_ADDRESS, barangay: '', street: '', other: 'Lucena City, Quezon' });
  assert.deepEqual(splitHomeAddress('Brgy. Santol, Boac'), { town: OTHER_ADDRESS, barangay: '', street: '', other: 'Brgy. Santol, Boac' });
  assert.equal(joinHomeAddress({ town: OTHER_ADDRESS, other: '  Lucena City, Quezon ' }), 'Lucena City, Quezon');
});

test('names typed in other letter cases are matched to the lists', () => {
  assert.deepEqual(splitHomeAddress('santol, boac, marinduque'), { town: 'Boac', barangay: 'Santol', street: '', other: '' });
});

test('no address gives empty parts', () => {
  assert.deepEqual(splitHomeAddress(''), { town: '', barangay: '', street: '', other: '' });
  assert.equal(joinHomeAddress({ town: '' }), '');
});
