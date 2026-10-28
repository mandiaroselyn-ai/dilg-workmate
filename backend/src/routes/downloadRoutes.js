import express from 'express';
import { createDownload, getDownload } from '../controllers/downloadController.js';

const router = express.Router();

// Files the WorkMate Android app downloads (see downloadController). One path, with the link
// as ?token=, so it needs no nested-path rewrite on Vercel. Fetching a file needs no sign-in.
router.post('/downloads', createDownload);
router.get('/downloads', getDownload);

export default router;
