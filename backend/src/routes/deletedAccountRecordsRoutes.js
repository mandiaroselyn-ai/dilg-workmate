import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { countDeletedAccountRecords, removeDeletedAccountRecords } from '../services/deletedAccountRecords.js';

// The one-time clean-up of records that accounts deleted during testing left behind (see
// services/deletedAccountRecords.js), for HR. One path, so it works on Vercel without a rewrite:
// GET counts them, DELETE removes them.
const router = express.Router();

router.get('/deleted-account-records', requireAdmin, async (req, res) => {
  try {
    res.status(200).json({ success: true, counts: await countDeletedAccountRecords() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Unable to count the records of deleted accounts.' });
  }
});

router.delete('/deleted-account-records', requireAdmin, async (req, res) => {
  try {
    const removed = await removeDeletedAccountRecords();
    console.info('Records of deleted accounts removed by', req.user?.email || req.user?._id, removed);
    res.status(200).json({ success: true, removed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Unable to remove the records of deleted accounts.' });
  }
});

export default router;
