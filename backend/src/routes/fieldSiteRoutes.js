import express from 'express';
import { deleteFieldSite, getFieldSites, saveFieldSite } from '../controllers/fieldSiteController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// The barangays' field sites. One path (with ?municipality=&barangay= to remove one), so it needs
// no nested-path rewrite on Vercel.
router.get('/field-sites', getFieldSites);
router.put('/field-sites', requireAdmin, saveFieldSite);
router.delete('/field-sites', requireAdmin, deleteFieldSite);

export default router;
