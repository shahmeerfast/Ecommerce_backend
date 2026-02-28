import Category from '../models/categoryModel.js';

// Get all categories
export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Add a new category
export const addCategory = async (req, res) => {
  try {
    const { name, subcategories } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const exists = await Category.findOne({ name });
    if (exists) return res.status(400).json({ error: 'Category already exists' });
    const category = new Category({ name, subcategories: Array.isArray(subcategories) ? subcategories : [] });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Edit a category
export const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subcategories } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const category = await Category.findByIdAndUpdate(id, { name, subcategories: Array.isArray(subcategories) ? subcategories : [] }, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete a category
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}; 