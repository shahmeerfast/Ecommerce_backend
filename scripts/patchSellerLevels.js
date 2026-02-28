import mongoose from 'mongoose';
import Seller from '../models/Seller.js';

async function patchSellerLevels() {
  await mongoose.connect('mongodb://localhost:27017/e-commerce'); // <-- Replace with your DB name

  // Set level to 'new' if missing
  const result = await Seller.updateMany(
    { $or: [ { level: { $exists: false } }, { level: null }, { level: '' } ] },
    { $set: { level: 'new' } }
  );
  console.log('Patched sellers:', result);

  await mongoose.disconnect();
  process.exit(0);
}

patchSellerLevels(); 