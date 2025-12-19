const mongoose = require('mongoose');

// models/Product.js
const ProductSchema = new mongoose.Schema({
    nama: { type: String, required: true },
    harga: { type: Number, required: true },
    stok: { type: Number, default: 0 },
    kategori: { type: String, default: 'Lain-lain' } // Pastikan ada ini
});

module.exports = mongoose.model('Product', ProductSchema);