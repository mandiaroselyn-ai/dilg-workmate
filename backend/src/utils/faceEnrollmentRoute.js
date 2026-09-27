export const resolveFaceEnrollmentRoute = ({ method, action, employeeId }) => {
  if (action === 'status' && method === 'GET') return '/api/face/enrollment/status';
  if (action === 'review' && method === 'POST' && employeeId) {
    return `/api/face/enrollment/${encodeURIComponent(employeeId)}/review`;
  }
  if (!action && method === 'POST' && !employeeId) return '/api/face/enrollment';
  if (!action && method === 'GET' && employeeId) {
    return `/api/face/enrollment/${encodeURIComponent(employeeId)}`;
  }
  return null;
};
