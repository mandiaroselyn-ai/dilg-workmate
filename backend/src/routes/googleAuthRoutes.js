import express from 'express';
import { googleAuthUrl, googleAuthCallback } from '../controllers/googleAuthController.js';

const router = express.Router();

router.get('/google/url', googleAuthUrl);
router.get('/google/callback', googleAuthCallback);

export default router;
