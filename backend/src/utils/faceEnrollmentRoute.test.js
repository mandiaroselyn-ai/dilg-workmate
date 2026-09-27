import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFaceEnrollmentRoute } from './faceEnrollmentRoute.js';

test('routes flat enrollment API requests to employee enrollment endpoints', () => {
  assert.equal(resolveFaceEnrollmentRoute({ method: 'POST' }), '/api/face/enrollment');
  assert.equal(resolveFaceEnrollmentRoute({ method: 'GET', action: 'status' }), '/api/face/enrollment/status');
  assert.equal(resolveFaceEnrollmentRoute({ method: 'GET', action: 'reference' }), null);
  assert.equal(resolveFaceEnrollmentRoute({ method: 'GET', employeeId: 'DILG-001' }), '/api/face/enrollment/DILG-001');
  assert.equal(resolveFaceEnrollmentRoute({ method: 'GET', userId: '507f1f77bcf86cd799439011' }), '/api/face/enrollment/id/507f1f77bcf86cd799439011');
  assert.equal(
    resolveFaceEnrollmentRoute({ method: 'POST', action: 'review', employeeId: 'DILG 001' }),
    '/api/face/enrollment/DILG%20001/review'
  );
});

test('rejects unsupported enrollment API method and route combinations', () => {
  assert.equal(resolveFaceEnrollmentRoute({ method: 'DELETE', employeeId: 'DILG-001' }), null);
  assert.equal(resolveFaceEnrollmentRoute({ method: 'POST', action: 'review' }), null);
  assert.equal(resolveFaceEnrollmentRoute({ method: 'GET', action: 'status', employeeId: 'DILG-001' }), '/api/face/enrollment/status');
});
