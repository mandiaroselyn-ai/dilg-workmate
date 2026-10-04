import express from 'express';
import { createSupportRequest } from '../controllers/supportController.js';
import { authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.post('/support-requests', authorizeRoles('employee'), createSupportRequest);

export default router;
