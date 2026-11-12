import express from 'express';
import { getSignedDocument, uploadSignedDocument } from '../controllers/signedDocumentController.js';

// Forms signed in Adobe (see signedDocumentController). One path, so it works on Vercel without a
// rewrite: GET ?kind=&ref= sends the signed PDF, POST uploads one.
const router = express.Router();

router.get('/signed-documents', getSignedDocument);
router.post('/signed-documents', uploadSignedDocument);

export default router;
