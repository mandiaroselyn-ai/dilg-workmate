import express from 'express';
import { getRequests, createRequest, updateRequestStatus, bulkUpdateRequests } from '../controllers/requestController.js';
import { authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/requests', getRequests);
router.post('/requests', createRequest);
// Employees may PATCH their own drafts; the controller checks the role and ownership.
router.patch('/requests/:id', updateRequestStatus);
router.put('/requests', authorizeRoles('hr_admin'), bulkUpdateRequests);

export default router;
