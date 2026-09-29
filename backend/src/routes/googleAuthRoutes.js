import express from 'express';
import { googleAuthUrl, googleAuthCallback, googleMobileExchange } from '../controllers/googleAuthController.js';

const router = express.Router();

router.get('/google/url', googleAuthUrl);
router.get('/google/callback', googleAuthCallback);
router.post('/google/exchange', googleMobileExchange);

export default router;
