import express from 'express';
import { getSigningId, removeSigningId, saveSigningId } from '../controllers/signingIdController.js';

// The signer's own digital ID made in WorkMate (see signingIdController). One path, so it works on
// Vercel without a rewrite: GET sends it, PUT keeps a new one, DELETE removes it.
const router = express.Router();

router.get('/signing-id', getSigningId);
router.put('/signing-id', saveSigningId);
router.delete('/signing-id', removeSigningId);

export default router;
