import assert from 'node:assert/strict';
import test from 'node:test';
import { isAgencyEmailAddress } from './agencyEmail.js';

test('recognizes agency emails, including regional subdomains', () => {
  assert.equal(isAgencyEmailAddress('Juan.DelaCruz@DILG.gov.ph'), true);
  assert.equal(isAgencyEmailAddress('maria@mimaropa.dilg.gov.ph'), true);
});

test('does not treat look-alike or personal domains as agency emails', () => {
  assert.equal(isAgencyEmailAddress('juan@gmail.com'), false);
  assert.equal(isAgencyEmailAddress('juan@fakedilg.gov.ph'), false);
  assert.equal(isAgencyEmailAddress('juan@dilg.gov.ph.example.com'), false);
  assert.equal(isAgencyEmailAddress(''), false);
});
