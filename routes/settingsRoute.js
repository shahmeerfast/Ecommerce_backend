import express from 'express';
import { getSettings, updateSettings, getCompanyNetWorth, adjustCompanyNetWorth } from '../controllers/settingsController.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

router.get('/', getSettings);
router.put('/', adminAuth, updateSettings);
router.get('/net-worth', adminAuth, getCompanyNetWorth);
router.post('/net-worth/adjust', adminAuth, adjustCompanyNetWorth);

export default router; 