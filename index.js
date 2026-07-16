const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8999;

// إعداد مجلدات التخزين للملفات والصور المرفوعة
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// قواعد البيانات المحلية البسيطة (JSON) لضمان عدم فقدان البيانات
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');

const initFile = (filePath, defaultData) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
};
initFile(PRODUCTS_FILE, [
    {
        id: "1",
        title: "سكربت بوت تليجرام متطور",
        description: "سكربت NodeJS متكامل لإدارة المجموعات وحماية الأعضاء تلقائياً مع لوحة تحكم كاملة.",
        price: 15,
        type: "code",
        image: "https://images.unsplash.com/photo-1618401471353-b98aedd07871?auto=format&fit=crop&w=400&q=80",
        downloadUrl: "https://example.com/files/telegram-bot.zip"
    },
    {
        id: "2",
        title: "تصميم موقع شخصي فخم",
        description: "قالب HTML/TailwindCSS لإنشاء بورتفوليو شخصي لعرض أعمالك واحترافيتك.",
        price: 25,
        type: "file",
        image: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=400&q=80",
        downloadUrl: "https://example.com/files/portfolio.zip"
    }
]);
initFile(ORDERS_FILE, []);

const getProducts = () => JSON.parse(fs.readFileSync(PRODUCTS_FILE));
const saveProducts = (data) => fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));
const getOrders = () => JSON.parse(fs.readFileSync(ORDERS_FILE));
const saveOrders = (data) => fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));

// إعدادات Multer لرفع الصور والملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// تقديم كود الواجهة الرسومية الأساسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ديناميكية خدمة الـ Manifest والـ Service Worker لدعم الـ PWA بدون ملفات إضافية
app.get('/manifest.json', (req, res) => {
    res.json({
        "name": "متجر طرزان الوقدي",
        "short_name": "Tarzanalwaqdiy",
        "description": "متجر فخم لبيع الأكواد والملفات البرمجية",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0f172a",
        "theme_color": "#b45309",
        "icons": [
            {
                "src": "https://cdn-icons-png.flaticon.com/512/3081/3081840.png",
                "sizes": "192x192",
                "type": "image/png"
            },
            {
                "src": "https://cdn-icons-png.flaticon.com/512/3081/3081840.png",
                "sizes": "512x512",
                "type": "image/png"
            }
        ]
    });
});

app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`
        const CACHE_NAME = 'tarzan-store-v1';
        const urlsToCache = ['/', '/manifest.json'];
        self.addEventListener('install', event => {
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
        });
        self.addEventListener('fetch', event => {
            event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
        });
    `);
});

// --- API المسارات الخاصة بالمتجر والمنتجات ---

// جلب جميع المنتجات
app.get('/api/products', (req, res) => {
    res.json(getProducts());
});

// إضافة منتج جديد (لوحة التحكم)
app.post('/api/products', upload.single('imageFile'), (req, res) => {
    const { title, description, price, type, downloadUrl } = req.body;
    let imageUrl = req.body.imageUrl || 'https://images.unsplash.com/photo-1618401471353-b98aedd07871?auto=format&fit=crop&w=400&q=80';
    
    if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
    }

    const newProduct = {
        id: uuidv4(),
        title,
        description,
        price: parseFloat(price),
        type,
        image: imageUrl,
        downloadUrl
    };

    const products = getProducts();
    products.push(newProduct);
    saveProducts(products);

    res.status(201).json({ success: true, product: newProduct });
});

// إزالة منتج (لوحة التحكم)
app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    let products = getProducts();
    products = products.filter(p => p.id !== id);
    saveProducts(products);
    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
});

// إرسال طلب شراء جديد مع رفع صورة إيصال الدفع
app.post('/api/orders', upload.single('receipt'), (req, res) => {
    const { customerName, telegramContact, items, total } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'يرجى رفع صورة إثبات الدفع' });
    }

    const newOrder = {
        id: uuidv4(),
        customerName,
        telegramContact,
        items: JSON.parse(items),
        total: parseFloat(total),
        receiptImg: `/uploads/${req.file.filename}`,
        status: 'pending', // pending, accepted, rejected
        date: new Date().toLocaleString('ar-YE')
    };

    const orders = getOrders();
    orders.push(newOrder);
    saveOrders(orders);

    res.status(201).json({ success: true, orderId: newOrder.id });
});

// جلب الطلبات (لوحة التحكم - تتطلب تحقق في الفرونت اند)
app.get('/api/orders', (req, res) => {
    res.json(getOrders());
});

// تعديل حالة الطلب (قبول أو رفض)
app.post('/api/orders/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // accepted or rejected
    
    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.id === id);
    
    if (orderIndex === -1) {
        return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    orders[orderIndex].status = status;
    saveOrders(orders);
    res.json({ success: true, message: `تم تحديث حالة الطلب بنجاح إلى: ${status}` });
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`=== متجر Tarzanalwaqdiy يعمل بنجاح ===`);
    console.log(`الرابط المحلي: http://localhost:${PORT}`);
});
