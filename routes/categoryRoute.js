import express from 'express';
import { getAllCategories, addCategory, editCategory, deleteCategory } from '../controllers/categoryController.js';

const router = express.Router();

router.get('/all', getAllCategories);
router.post('/', addCategory);
router.put('/:id', editCategory);
router.delete('/:id', deleteCategory);

export default router; 