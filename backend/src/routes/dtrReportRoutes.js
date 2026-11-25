import express from 'express';
import { getDtrReports, reviewDtrReport } from '../controllers/dtrReportController.js';

// The monthly DTR reports (see dtrReportController). One path, so it works on Vercel without a
// rewrite: GET lists, PATCH returns one to HR or marks it forwarded.
const router = express.Router();

router.get('/dtr-reports', getDtrReports);
router.patch('/dtr-reports', reviewDtrReport);

export default router;
