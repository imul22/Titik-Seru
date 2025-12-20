const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    items: [{ nama: String, harga: Number, qty: Number, subtotal: Number }],
    totalBayar: Number,
    tunai: Number,
    metode: String,
    kembalian: Number,
    tanggal: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);