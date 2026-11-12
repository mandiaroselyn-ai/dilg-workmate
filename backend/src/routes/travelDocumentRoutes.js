import express from 'express';
import { getTravelDocument, removeTravelDocument, uploadTravelDocument } from '../controllers/travelDocumentController.js';

// The certificates and reports uploaded after a Travel Order (see travelDocumentController). One
// path, so it works on Vercel without a rewrite.
const router = express.Router();

router.get('/travel-documents', getTravelDocument);
router.post('/travel-documents', uploadTravelDocument);
router.delete('/travel-documents', removeTravelDocument);

export default router;
