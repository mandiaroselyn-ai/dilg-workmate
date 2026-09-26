import express from 'express';
import { getRequests, createRequest, updateRequestStatus } from '../controllers/requestController.js';
import { authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Travel Orders share a unified storage with leaves, represented as requests
router.get('/travels', getRequests);
router.post('/travels', createRequest);
router.patch('/travels/:id', authorizeRoles('supervisor', 'hr_admin'), updateRequestStatus);

export default router;
