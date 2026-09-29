import apiHandler from '../[...path].js';

const actionRoutes = {
	'geofence-check': '/api/dtr/geofence/check',
	'geofence-resolve': '/api/dtr/geofence/resolve',
	'location-update': '/api/dtr/location/update',
	// Vercel only routes one level below /api/dtr to this file, so HR's live map uses
	// /api/dtr/action?action=location-live instead of /api/dtr/location/live.
	'location-live': '/api/dtr/location/live'
};

export default function handler(req, res) {
	const requestUrl = new URL(req.url || '/', 'http://localhost');
	const target = actionRoutes[requestUrl.searchParams.get('action')];
	if (target) req.url = target;
	return apiHandler(req, res);
}