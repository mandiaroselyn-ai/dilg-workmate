import express from 'express';
import { getRequests, createRequest, updateRequestStatus } from '../controllers/requestController.js';

const router = express.Router();

// Travel Orders share a unified storage with leaves, represented as requests
router.get('/travels', getRequests);
router.post('/travels', createRequest);
// Employees may PATCH their own drafts; the controller checks the role and ownership.
router.patch('/travels/:id', updateRequestStatus);

export default router;
