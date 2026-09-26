import apiHandler from '../[...path].js';

const actionRoutes = {
	'geofence-check': '/api/dtr/geofence/check',
	'geofence-resolve': '/api/dtr/geofence/resolve',
	'location-update': '/api/dtr/location/update'
};

export default function handler(req, res) {
	const requestUrl = new URL(req.url || '/', 'http://localhost');
	const target = actionRoutes[requestUrl.searchParams.get('action')];
	if (target) req.url = target;
	return apiHandler(req, res);
}