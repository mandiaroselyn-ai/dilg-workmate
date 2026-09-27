export const resolveFaceEnrollmentRoute = ({ method, action, employeeId, userId }) => {
  if (action === 'status' && method === 'GET') return '/api/face/enrollment/status';
  if (action === 'review' && method === 'POST' && employeeId) {
    return `/api/face/enrollment/${encodeURIComponent(employeeId)}/review`;
  }
  if (!action && method === 'GET' && userId) {
    return `/api/face/enrollment/id/${encodeURIComponent(userId)}`;
  }
  if (!action && method === 'POST' && !employeeId) return '/api/face/enrollment';
  if (!action && method === 'GET' && employeeId) {
    return `/api/face/enrollment/${encodeURIComponent(employeeId)}`;
  }
  return null;
};
