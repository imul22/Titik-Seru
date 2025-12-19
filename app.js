require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const ExcelJS = require('exceljs');

// Import Models
const Product = require('./models/Product');
const Transaction = require('./models/Transaction');

const app = express();

// Konfigurasi Express & View Engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true })); // Penting: true agar bisa baca array/object dari form
app.use(express.json());

// Koneksi MongoDB Atlas
// const dbURI = 'mongodb+srv://futsal_db_user:mkmg@cluster0.1ohinel.mongodb.net/?appName=Cluster0'; 
// mongoose.connect(dbURI)
const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI, {
    serverSelectionTimeoutMS: 5000 // Berhenti mencoba setelah 5 detik jika gagal
})
.then(() => console.log('✅ Berhasil konek ke MongoDB'))
.catch(err => console.error('❌ Gagal konek:', err));

// ==========================================
// ROUTE KASIR (FRONT-END)
// ==========================================

app.get('/', async (req, res) => {
    try {
        const products = await Product.find({ stok: { $gt: 0 } });
        res.render('index', { products });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/checkout', async (req, res) => {
    try {
        const { items, tunai } = req.body;
        if (!items) return res.redirect('/');

        let totalBayar = 0;
        let finalItems = [];
        const itemArray = Object.values(items);

        for (const item of itemArray) {
            const product = await Product.findById(item.id);
            const qty = parseInt(item.qty);

            if (product && product.stok >= qty) {
                product.stok -= qty;
                await product.save();

                const subtotal = product.harga * qty;
                totalBayar += subtotal;
                finalItems.push({
                    nama: product.nama,
                    harga: product.harga,
                    qty: qty,
                    subtotal: subtotal
                });
            }
        }

        const newTrx = await Transaction.create({
            items: finalItems,
            totalBayar: totalBayar,
            tunai: parseInt(tunai),
            kembalian: parseInt(tunai) - totalBayar
        });

        res.redirect(`/struk/${newTrx._id}`);
    } catch (err) {
        res.status(500).send("Gagal Checkout: " + err.message);
    }
});

app.get('/struk/:id', async (req, res) => {
    const trx = await Transaction.findById(req.params.id);
    res.render('struk', { trx });
});

// ==========================================
// ROUTE ADMIN (BACK-END)
// ==========================================

// Dashboard: List Barang & Update Stok/Harga
app.get('/admin', async (req, res) => {
    const products = await Product.find();
    res.render('admin/dashboard', { products });
});

// Create Produk Baru
app.post('/admin/add-product', async (req, res) => {
    await Product.create(req.body);
    res.redirect('/admin');
});

// Update Produk (Nama, Harga, Stok)
app.post('/admin/update-product', async (req, res) => {
    const { id, nama, harga, stok } = req.body;
    await Product.findByIdAndUpdate(id, { nama, harga, stok });
    res.redirect('/admin');
});

// Halaman Laporan Penjualan
app.get('/admin/laporan', async (req, res) => {
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
});

// Export Excel
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

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server on: http://localhost:${PORT}`));
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => console.log(`Server on: http://localhost:${PORT}`));
}

module.exports = app; // PENTING untuk Vercel