import apiHandler from '../[...path].js';

const actionRoutes = {
	'authenticate-options': '/api/biometric/authenticate/options',
	'authenticate-verify': '/api/biometric/authenticate/verify',
	'register-options': '/api/biometric/register/options',
	'register-verify': '/api/biometric/register/verify'
};

export default function handler(req, res) {
	const requestUrl = new URL(req.url || '/', 'http://localhost');
	const target = actionRoutes[requestUrl.searchParams.get('action')];
	if (target) req.url = target;
	return apiHandler(req, res);
}