import express from 'express';
import { getRequests, createRequest, updateRequestStatus, bulkUpdateRequests } from '../controllers/requestController.js';
import { authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/requests', getRequests);
router.post('/requests', createRequest);
router.patch('/requests/:id', authorizeRoles('supervisor', 'hr_admin'), updateRequestStatus);
router.put('/requests', authorizeRoles('hr_admin'), bulkUpdateRequests);

export default router;
