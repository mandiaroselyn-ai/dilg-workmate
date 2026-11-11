import express from 'express';
import { getDtrSubmissions, reviewDtrSubmission, submitDtr } from '../controllers/dtrSubmissionController.js';

// Monthly DTR submission and e-signing (see dtrSubmissionController). One path, so it works on
// Vercel without a rewrite: GET lists (or ?id= one), POST submits, PATCH verifies or returns.
const router = express.Router();

router.get('/dtr-submissions', getDtrSubmissions);
router.post('/dtr-submissions', submitDtr);
router.patch('/dtr-submissions', reviewDtrSubmission);

export default router;
