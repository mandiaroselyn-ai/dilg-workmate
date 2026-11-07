import assert from 'node:assert/strict';
import test from 'node:test';
import { MARINDUQUE_MUNICIPALITIES, MARINDUQUE_OFFICES, PROVINCE_LGU, lguOfStation } from './marinduqueLocations.js';

test('the Assigned LGU follows the Assigned Station', () => {
  assert.equal(lguOfStation('DILG Provincial Office'), PROVINCE_LGU);
  assert.equal(lguOfStation('DILG Municipal Office - Boac'), 'Boac');
  assert.equal(lguOfStation('DILG Municipal Office - Santa Cruz'), 'Santa Cruz');
  // Every municipal office's LGU is its town.
  for (const office of MARINDUQUE_OFFICES.filter(item => item.id !== 'provincial')) {
    assert.ok(MARINDUQUE_MUNICIPALITIES[lguOfStation(office.name)], office.name);
  }
  // A station typed before the list, or none, has no LGU to go with it.
  assert.equal(lguOfStation('Boac Field Office'), '');
  assert.equal(lguOfStation(''), '');
});
