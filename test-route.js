import express from 'express';
const router = express.Router();

router.post('/admin/first-register', (req, res) => {
    console.log('Route hit:', req.path);
    console.log('Request body:', req.body);
    res.json({ message: 'Test route hit' });
});

export default router; 