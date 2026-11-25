import express from 'express';
import { getDtrReports, reviewDtrReport, sendDtrReport } from '../controllers/dtrReportController.js';

// The monthly DTR reports (see dtrReportController). One path, so it works on Vercel without a
// rewrite: GET lists, POST is HR sending one to the PD, PATCH returns one to HR or marks it forwarded.
const router = express.Router();

router.get('/dtr-reports', getDtrReports);
router.post('/dtr-reports', sendDtrReport);
router.patch('/dtr-reports', reviewDtrReport);

export default router;
