require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const ExcelJS = require('exceljs');

// Import Models
const Product = require('./models/Product');
const Transaction = require('./models/Transaction');

const app = express();

// ==========================================
// KONFIGURASI EXPRESS & VIEW ENGINE
// ==========================================
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', false);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public/images')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// KONEKSI MONGODB
// ==========================================
const dbURI = process.env.MONGODB_URI;
mongoose.connect(dbURI, {
    serverSelectionTimeoutMS: 5000
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// ROUTE KASIR (FRONT-END)
// ==========================================

// Halaman Utama Kasir
app.get('/', async (req, res) => {
    try {
        const products = await Product.find({ stok: { $gt: 0 } });
        res.render('index', { products });
    } catch (err) {
        res.status(500).send("Error: " + err.message);
    }
});

// Proses Transaksi (Versi Modern Fetch API)
app.post('/transaksi', async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: "Keranjang kosong" });
        }

        let totalBayar = 0;
        let processedItems = [];

        // Gunakan loop for...of untuk mendukung async/await dengan benar
        for (const item of items) {
            const product = await Product.findById(item.id);
            if (product && product.stok >= item.qty) {
                // Kurangi stok permanen
                product.stok -= item.qty;
                await product.save();

                const subtotal = product.harga * item.qty;
                totalBayar += subtotal;
                processedItems.push({
                    nama: product.nama,
                    harga: product.harga,
                    qty: item.qty,
                    subtotal: subtotal
                });
            }
        }

        const savedTrx = await Transaction.create({
            items: processedItems,
            totalBayar: totalBayar,
            tanggal: new Date()
        });

        res.json({ success: true, trxId: savedTrx._id });
    } catch (err) {
        console.error("Transaction Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Tampilan Struk
app.get('/struk/:id', async (req, res) => {
    try {
        const trx = await Transaction.findById(req.params.id);
        if (!trx) return res.redirect('/');
        res.render('struk', { trx });
    } catch (err) {
        res.status(404).send("Struk tidak ditemukan");
    }
});

// ==========================================
// ROUTE ADMIN (BACK-END)
// ==========================================

// Dashboard Admin
app.get('/admin', async (req, res) => {
    const products = await Product.find();
    res.render('admin/dashboard', { products });
});

app.post('/admin/add-product', async (req, res) => {
    await Product.create(req.body);
    res.redirect('/admin');
});

app.post('/admin/update-product', async (req, res) => {
    const { id, nama, harga, stok } = req.body;
    await Product.findByIdAndUpdate(id, { nama, harga, stok });
    res.redirect('/admin');
});

// Hapus Produk
app.post('/admin/delete-product', async (req, res) => {
    try {
        const { id } = req.body;
        await Product.findByIdAndDelete(id);
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send("Gagal menghapus produk: " + err.message);
    }
});

// Laporan Penjualan (Harian & Bulanan)
app.get('/admin/laporan', async (req, res) => {
    try {
        const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);

        const harian = await Transaction.aggregate([
            { $match: { tanggal: { $gte: startOfDay } } },
            { $group: { _id: null, total: { $sum: "$totalBayar" }, count: { $sum: 1 } } }
        ]);

        const bulanan = await Transaction.aggregate([
            { $match: { tanggal: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: "$totalBayar" }, count: { $sum: 1 } } }
        ]);

        const history = await Transaction.find().sort({ tanggal: -1 }).limit(50);

        res.render('admin/laporan', { 
            harian: harian[0] || { total: 0, count: 0 }, 
            bulanan: bulanan[0] || { total: 0, count: 0 },
            history
        });
    } catch (err) {
        res.status(500).send("Error Laporan: " + err.message);
    }
});

// Export Data ke Excel
app.get('/admin/export-excel', async (req, res) => {
    const transactions = await Transaction.find().sort({ tanggal: -1 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Laporan Penjualan');

    sheet.columns = [
        { header: 'ID Transaksi', key: 'id', width: 25 },
        { header: 'Tanggal', key: 'tgl', width: 20 },
        { header: 'Produk Terjual', key: 'produk', width: 40 },
        { header: 'Total Bayar', key: 'total', width: 15 }
    ];

    transactions.forEach(trx => {
        sheet.addRow({
            id: trx._id,
            tgl: trx.tanggal.toLocaleString('id-ID'),
            produk: trx.items.map(i => `${i.nama} (x${i.qty})`).join(', '),
            total: trx.totalBayar
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Laporan_Penjualan.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

// ==========================================
// SERVER LISTENER (VERCEL COMPATIBLE)
// ==========================================
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}


module.exports = app;
