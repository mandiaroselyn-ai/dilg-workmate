import crypto from 'node:crypto';

// Record IDs combine the time with a random suffix, so records created in the same
// millisecond (for example, several employees clocking in at 8:00 AM) never share an ID.
export const createRecordId = prefix => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
