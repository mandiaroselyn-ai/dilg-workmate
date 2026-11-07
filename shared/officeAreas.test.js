import assert from 'node:assert/strict';
import test from 'node:test';
import { isWithinAssignedLocation } from './assignmentGeofence.js';
import { MARINDUQUE_BARANGAY_AREAS } from './marinduqueBarangayAreas.js';
import { resolveOfficeArea } from './officeAreas.js';

const compound = resolveOfficeArea('provincial');
const inside = (latitude, longitude) => isWithinAssignedLocation(latitude, longitude, compound);

test('the DILG Provincial Office\'s area is the whole Provincial Capitol Compound', () => {
  assert.equal(compound.mode, 'office');
  assert.equal(compound.barangay, 'Bangbangalon');
  assert.equal(compound.geometry.type, 'Polygon');
  assert.match(compound.label, /^DILG Provincial Office, Marinduque Provincial Capitol Compound, Brgy\. Bangbangalon, Boac/);
  // The Capitol, the Hall of Justice, and the compound's southern and eastern grounds.
  assert.equal(inside(13.4419838, 121.8277131), true, 'the Capitol');
  assert.equal(inside(13.4423, 121.8281), true, 'the Hall of Justice');
  assert.equal(inside(13.4413, 121.8277), true, 'south of the Capitol');
  assert.equal(inside(13.4420, 121.8286), true, 'east of the Capitol');
});

test('outside the compound is out of range, even close to it', () => {
  assert.equal(inside(13.4423, 121.8266), false, 'Bangbangalon Elementary School');
  assert.equal(inside(13.4436, 121.8282), false, 'the Provincial Hospital');
  assert.equal(inside(13.4434, 121.8268), false, 'across the Circumferential Road');
  assert.equal(inside(13.4406, 121.8276), false, '40 m south of the compound');
  assert.equal(inside(...MARINDUQUE_BARANGAY_AREAS.Boac.Tanza.center), false, 'Brgy. Tanza');
});

test('other offices have no mapped grounds and are found by their address', () => {
  assert.equal(resolveOfficeArea('boac'), null);
  assert.equal(resolveOfficeArea('nowhere'), null);
});
