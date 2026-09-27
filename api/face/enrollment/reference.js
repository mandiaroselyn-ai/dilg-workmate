import apiHandler from '../../[...path].js';

export default function handler(req, res) {
  const search = new URL(req.url || '/', 'http://localhost').search;
  req.url = `/api/face/enrollment/reference${search}`;
  return apiHandler(req, res);
}
