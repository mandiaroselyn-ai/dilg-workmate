export const validateApiBody = (req, res, next) => {
  if (req.body && typeof req.body !== 'object') {
    return res.status(400).json({ success: false, error: 'Request body must be a JSON object.' });
  }

  const body = req.body || {};
  // SMS text is capped at 918 characters (6 SMS segments). Other messages, such as a
  // notification that quotes long review remarks, may be longer.
  const textLimit = (req.path || '').startsWith('/sms') ? 918 : 5000;
  const stringLimits = {
    email: 254,
    password: 256,
    message: textLimit,
    content: textLimit,
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
  const enrollmentImageFields = ['dilgIdImage', 'dilgIdBackImage', 'selfieImage'];
  let enrollmentImageBytes = 0;
  let biometricImageBytes = 0;
  for (const field of imageFields) {
    const value = field === 'record.selfieUrl' ? body.record.selfieUrl : body[field];
    if (typeof value === 'string' && value.length > 8 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Biometric image is too large.' });
    }
    if (typeof value === 'string') {
      const valueBytes = Buffer.byteLength(value, 'utf8');
      biometricImageBytes += valueBytes;
      if (enrollmentImageFields.includes(field)) enrollmentImageBytes += valueBytes;
    }
  }
  if (enrollmentImageBytes > 4_000_000) {
    return res.status(413).json({ success: false, error: 'The three enrollment images exceed the secure upload size. Retake them closer with good lighting and retry.' });
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
// Logs the real error on the server but only returns a generic message, so internal
// details such as database errors are not shown to users.
export const sendServerError = (res, error) => {
  // A record the database rejects (a missing or malformed field) is the sender's input,
  // not a server fault, so say which fields to fix.
  if (error?.name === 'ValidationError' || error?.name === 'CastError') {
    const fields = error.errors ? Object.keys(error.errors) : [error.path].filter(Boolean);
    return res.status(400).json({
      success: false,
      error: `Missing or invalid field${fields.length === 1 ? '' : 's'}: ${fields.join(', ') || 'request data'}.`
    });
  }
  console.error('API error:', error);
  return res.status(500).json({ success: false, error: 'Internal server error.' });
};
