const normalizeOrigin = value => {
  if (!value) return null;
  try {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
};

export const getFrontendOrigin = (req) => {
  const configuredOrigin = normalizeOrigin(process.env.FRONTEND_URL);
  if (configuredOrigin) return configuredOrigin;

  const vercelOrigin = normalizeOrigin(
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  );
  if (vercelOrigin) return vercelOrigin;

  if (process.env.VERCEL && req) {
    const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
    const host = forwardedHost?.toString().split(',')[0].trim();
    const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0].trim() || 'https';
    const requestOrigin = normalizeOrigin(host ? `${proto}://${host}` : null);
    if (requestOrigin) return requestOrigin;
  }

  return `http://localhost:${process.env.PORT || 5173}`;
};

export const getAllowedFrontendOrigins = () => new Set([
  normalizeOrigin(process.env.FRONTEND_URL),
  normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  normalizeOrigin(process.env.VERCEL_URL)
].filter(Boolean));