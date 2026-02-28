import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';

async function patchProductSellers() {
  await mongoose.connect('mongodb://localhost:27017/e-commerce'); // Use your DB name

  // Find a default seller to use
  const defaultSeller = await Seller.findOne();
  if (!defaultSeller) {
    console.error('No sellers found in the database!');
    process.exit(1);
  }
  console.log('Using default seller:', defaultSeller._id, defaultSeller.fullName);

  // Update products with null or missing seller
  const result = await Product.updateMany(
    { $or: [ { seller: null }, { seller: { $exists: false } } ] },
    { $set: { seller: defaultSeller._id } }
  );
  console.log('Patched products:', result);

  await mongoose.disconnect();
  process.exit(0);
}

patchProductSellers(); 