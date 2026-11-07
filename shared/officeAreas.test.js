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

test('a municipal office is its town hall, and 50 m around it for GPS inside the building', () => {
  const boac = resolveOfficeArea('boac');
  assert.equal(boac.areaMarginMeters, 50);
  assert.match(boac.label, /^DILG Municipal Office - Boac, Boac Municipal Hall, Brgy\. Isok I \(Pob\.\), Boac/);
  // Metres east of the town hall's east side (121.8419366), along its latitude.
  const east = metres => [13.4466, 121.8419366 + metres / (111320 * Math.cos(13.4466 * Math.PI / 180))];
  assert.equal(isWithinAssignedLocation(boac.latitude, boac.longitude, boac), true, 'inside the town hall');
  assert.equal(isWithinAssignedLocation(...east(40), boac), true, '40 m from it');
  assert.equal(isWithinAssignedLocation(...east(80), boac), false, '80 m from it');
  // The Provincial Capitol Compound has no margin.
  assert.equal(compound.areaMarginMeters, 0);
});

test('every DILG office has its own grounds on the map', async () => {
  const { MARINDUQUE_OFFICES } = await import('./marinduqueLocations.js');
  for (const office of MARINDUQUE_OFFICES) {
    const area = resolveOfficeArea(office.id);
    assert.equal(area.geometry.type, 'Polygon', office.id);
    assert.equal(isWithinAssignedLocation(area.latitude, area.longitude, area), true, `${office.id} is centered inside its grounds`);
  }
  assert.equal(resolveOfficeArea('nowhere'), null);
});
