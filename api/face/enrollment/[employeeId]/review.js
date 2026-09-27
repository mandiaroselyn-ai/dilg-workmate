import apiHandler from '../../../[...path].js';

export default function handler(req, res) {
  const employeeId = encodeURIComponent(req.query.employeeId);
  const search = new URL(req.url || '/', 'http://localhost').search;
  req.url = `/api/face/enrollment/${employeeId}/review${search}`;
  return apiHandler(req, res);
}
