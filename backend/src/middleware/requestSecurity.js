export const validateApiBody = (req, res, next) => {
  if (req.body && typeof req.body !== 'object') {
    return res.status(400).json({ success: false, error: 'Request body must be a JSON object.' });
  }

  const body = req.body || {};
  const stringLimits = {
    email: 254,
    password: 256,
    message: 918,
    content: 918,
    employeeId: 64
  };
  for (const [field, limit] of Object.entries(stringLimits)) {
    if (typeof body[field] === 'string' && body[field].length > limit) {
      return res.status(400).json({ success: false, error: `${field} exceeds the maximum length.` });
    }
  }

  const imageFields = [
    'image',
    'dilgIdImage',
    'dilgIdBackImage',
    'selfieImage',
    ...(typeof body.record?.selfieUrl === 'string' ? ['record.selfieUrl'] : [])
  ];
  let biometricImageBytes = 0;
  for (const field of imageFields) {
    const value = field === 'record.selfieUrl' ? body.record.selfieUrl : body[field];
    if (typeof value === 'string' && value.length > 8 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Biometric image is too large.' });
    }
    if (typeof value === 'string') biometricImageBytes += Buffer.byteLength(value, 'utf8');
  }
  if (biometricImageBytes > 8 * 1024 * 1024) {
    return res.status(413).json({ success: false, error: 'Combined biometric images are too large. Resize the images and try again.' });
  }
  next();
};

export const apiNotFound = (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found.' });
};

export const apiErrorHandler = (error, req, res, next) => {
  if (!req.path.startsWith('/api')) return next(error);
  console.error('API error:', error);
  res.status(error.statusCode || 500).json({ success: false, error: 'Internal server error.' });
};