import apiHandler from './[...path].js';
import { resolveFaceEnrollmentRoute } from '../backend/src/utils/faceEnrollmentRoute.js';

export default function handler(req, res) {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const action = requestUrl.searchParams.get('action');
  const employeeId = requestUrl.searchParams.get('employeeId');
  const route = resolveFaceEnrollmentRoute({ method: req.method, action, employeeId });

  if (!route) {
    return res.status(400).json({ success: false, error: 'Invalid biometric enrollment API request.' });
  }

  requestUrl.searchParams.delete('action');
  requestUrl.searchParams.delete('employeeId');
  const remainingQuery = requestUrl.searchParams.toString();
  req.url = `${route}${remainingQuery ? `?${remainingQuery}` : ''}`;
  return apiHandler(req, res);
}
