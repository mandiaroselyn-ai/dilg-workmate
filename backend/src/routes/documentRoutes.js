import express from 'express';
import {
  answerCertificateRequest,
  deleteDocument,
  getDocumentFile,
  getDocuments,
  requestCertificate,
  uploadDocument
} from '../controllers/documentController.js';
import { authorizeRoles } from '../middleware/auth.js';

const router = express.Router();
const employeeOrHr = authorizeRoles('employee', 'hr_admin');

router.get('/documents', employeeOrHr, getDocuments);
// The controller checks what each role may upload, open, and remove.
router.post('/documents', employeeOrHr, uploadDocument);
router.post('/documents/requests', authorizeRoles('employee'), requestCertificate);
router.patch('/documents/:id', authorizeRoles('hr_admin'), answerCertificateRequest);
router.get('/documents/:id/file', employeeOrHr, getDocumentFile);
router.delete('/documents/:id', employeeOrHr, deleteDocument);

export default router;
