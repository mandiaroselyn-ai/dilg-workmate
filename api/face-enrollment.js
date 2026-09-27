import apiHandler from './[...path].js';
import { resolveFaceEnrollmentRoute } from '../backend/src/utils/faceEnrollmentRoute.js';

export default function handler(req, res) {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const action = requestUrl.searchParams.get('action');
  const employeeId = requestUrl.searchParams.get('employeeId');
  const userId = requestUrl.searchParams.get('userId');
  const route = resolveFaceEnrollmentRoute({ method: req.method, action, employeeId, userId });

  if (!route) {
    return res.status(400).json({ success: false, error: 'Invalid biometric enrollment API request.' });
  }

  requestUrl.searchParams.delete('action');
  requestUrl.searchParams.delete('employeeId');
  requestUrl.searchParams.delete('userId');
  const remainingQuery = requestUrl.searchParams.toString();
  req.url = `${route}${remainingQuery ? `?${remainingQuery}` : ''}`;
  return apiHandler(req, res);
}
