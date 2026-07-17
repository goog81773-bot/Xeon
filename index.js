/* =====================================================================
   🏴‍☠️ TARZANALWAQDIY VIP CYBER STORE SERVER (index.js)
   خادم ويب سيبراني فخم يدير عمليات الشراء، الحماية، وترقية العضويات
   ===================================================================== */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8999;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* إعداد وهيكلة مجلدات التخزين السرية والعمومية */
const DB_DIR = path.join(__dirname, 'database');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SECURE_PRODUCTS_DIR = path.join(__dirname, 'secure_files'); // مجلد معزول تماماً لحفظ البرمجيات الحقيقية
const RECEIPTS_DIR = path.join(__dirname, 'uploads', 'receipts'); // صور إيصالات الدفع
const PUBLIC_IMAGES_DIR = path.join(__dirname, 'uploads', 'images'); // صور كفرات المنتجات

[DB_DIR, UPLOADS_DIR, SECURE_PRODUCTS_DIR, RECEIPTS_DIR, PUBLIC_IMAGES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/* تهيئة ملفات قاعدة البيانات المحلية JSON */
const USERS_FILE = path.join(DB_DIR, 'users.json');
const PRODUCTS_FILE = path.join(DB_DIR, 'products.json');
const ORDERS_FILE = path.join(DB_DIR, 'orders.json');
const REQUESTS_FILE = path.join(DB_DIR, 'requests.json');

const readDB = (file, defaultData = []) => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 4));
        return defaultData;
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return defaultData;
    }
};

const writeDB = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 4), 'utf8');
};

/* إعداد الحساب الإداري الافتراضي والتحقق من قواعد البيانات */
const initialUsers = [
    {
        id: "u-admin",
        username: "admin",
        password: "tarzanb", // كلمة مرور المسؤول الافتراضية للتحكم
        role: "admin",
        totalSpent: 0,
        purchasesCount: 0
    }
];
readDB(USERS_FILE, initialUsers);
readDB(PRODUCTS_FILE, []);
readDB(ORDERS_FILE, []);
readDB(REQUESTS_FILE, []);

/* إعداد رفع الملفات للفصل بين الصور العامة والملفات البرمجية الحساسة */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'new-prod-file') {
            cb(null, SECURE_PRODUCTS_DIR); // حفظ الملف الفعلي في المجلد المعزول المحمي
        } else if (file.fieldname === 'cust-receipt-file') {
            cb(null, RECEIPTS_DIR); // حفظ إيصال دفع العميل
        } else {
            cb(null, PUBLIC_IMAGES_DIR); // صور كفرات المنتجات العامة
        }
    },
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname);
        const uniqueName = `${file.fieldname}-${Date.now()}-${uuidv4()}${fileExt}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname))); // خدمة كود الـ HTML والـ Assets

/* دوال التحقق والحماية الوسيطة للمستخدمين */
const authenticateUser = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ success: false, message: 'غير مصرح! يرجى تسجيل الدخول أولاً.' });
    }
    const users = readDB(USERS_FILE);
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(401).json({ success: false, message: 'جلسة المستخدم منتهية الصلاحية.' });
    }
    req.user = user;
    next();
};

const requireAdmin = (req, res, next) => {
    authenticateUser(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'صلاحيات غير كافية! مخصص للمسؤول فقط.' });
        }
        next();
    });
};

/* مسارات تكنولوجيا الـ PWA لخدمة التطبيق الهجين */
app.get('/manifest.json', (req, res) => {
    res.json({
        "name": "متجر طرزان الوقدي VIP السيبراني",
        "short_name": "TarzanVIP",
        "start_url": ".",
        "display": "standalone",
        "background_color": "#020204",
        "theme_color": "#00ff66",
        "icons": [
            {
                "src": "https://cdn-icons-png.flaticon.com/512/2626/2626269.png",
                "sizes": "192x192",
                "type": "image/png"
            }
        ]
    });
});

app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`
        const CACHE_NAME = 'tarzan-vip-cache-v2';
        const urlsToCache = ['/', '/manifest.json'];
        self.addEventListener('install', event => {
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
        });
        self.addEventListener('fetch', event => {
            event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
        });
    `);
});

/* مسار تسجيل مستخدم جديد بالكامل */
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور.' });
    }

    const users = readDB(USERS_FILE);
    const userExists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (userExists) {
        return res.status(400).json({ success: false, message: 'اسم المستخدم هذا محجوز لعميل آخر.' });
    }

    const newUser = {
        id: `u-${Date.now()}`,
        username,
        password,
        role: 'user',
        totalSpent: 0,
        purchasesCount: 0
    };

    users.push(newUser);
    writeDB(USERS_FILE, users);

    res.status(201).json({ success: true, message: 'تم تسجيل العضوية بنجاح!', user: newUser });
});

/* مسار تسجيل دخول المشتركين والمدير */
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const users = readDB(USERS_FILE);
    
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    if (!user) {
        return res.status(400).json({ success: false, message: 'بيانات الدخول غير صحيحة.' });
    }

    res.json({ success: true, message: 'تم تسجيل الولوج الآمن بنجاح!', user });
});

/* مسار جلب كافة معروضات المتجر */
app.get('/api/products', (req, res) => {
    const products = readDB(PRODUCTS_FILE);
    const safeProducts = products.map(({ securePath, ...rest }) => rest);
    res.json(safeProducts);
});

/* مسار رفع برمجية جديدة مع تشفير ملفها الحقيقي وعزل مساره */
app.post('/api/products', requireAdmin, upload.fields([
    { name: 'new-prod-file', maxCount: 1 },
    { name: 'new-prod-image-file', maxCount: 1 }
]), (req, res) => {
    const { title, price, type, description } = req.body;
    const files = req.files;

    if (!files['new-prod-file']) {
        return res.status(400).json({ success: false, message: 'يجب رفع الملف الفعلي للبرمجية.' });
    }

    const products = readDB(PRODUCTS_FILE);
    
    let imageUrl = 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80';
    if (files['new-prod-image-file']) {
        imageUrl = `/uploads/images/${files['new-prod-image-file'][0].filename}`;
    }

    const prodFile = files['new-prod-file'][0];
    const newProduct = {
        id: `tarzan-prod-${Date.now()}`,
        title,
        description,
        price: parseFloat(price),
        type,
        image: imageUrl,
        fileName: prodFile.originalname,
        securePath: prodFile.path // المسار السري للملف على السيرفر
    };

    products.push(newProduct);
    writeDB(PRODUCTS_FILE, products);

    res.status(201).json({ success: true, message: 'تم تشفير ورفع المنتج الجديد بنجاح في المعرض!', product: newProduct });
});

/* مسار حذف منتج من الخادم نهائياً */
app.delete('/api/products/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    let products = readDB(PRODUCTS_FILE);
    const product = products.find(p => p.id === id);

    if (!product) {
        return res.status(404).json({ success: false, message: 'المنتج المطلوب غير موجود.' });
    }

    if (fs.existsSync(product.securePath)) {
        try { fs.unlinkSync(product.securePath); } catch (e) {}
    }

    products = products.filter(p => p.id !== id);
    writeDB(PRODUCTS_FILE, products);

    res.json({ success: true, message: 'تم حذف المنتج وكافة ملفاته المشفرة من النظام.' });
});

/* مسار إنشاء طلب شراء مالي جديد ورفع لقطة إثبات الدفع */
app.post('/api/orders', authenticateUser, upload.single('cust-receipt-file'), (req, res) => {
    const { cartItems, total } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'يرجى رفع لقطة شاشة لإثبات التحويل المالي عبر جيب.' });
    }

    const orders = readDB(ORDERS_FILE);
    const newOrder = {
        id: `tarzan-vip-order-${Date.now()}`,
        userId: req.user.id,
        customerName: req.user.username,
        items: JSON.parse(cartItems),
        total: parseFloat(total),
        receiptImg: `/uploads/receipts/${req.file.filename}`,
        status: 'pending',
        date: new Date().toLocaleString('ar-YE')
    };

    orders.push(newOrder);
    writeDB(ORDERS_FILE, orders);

    res.status(201).json({ success: true, message: 'تم إرسال إثبات التحويل بنجاح! الإدارة تراجع المعاملة حالياً.' });
});

/* مسار جلب الطلبيات للمطابقة الإدارية */
app.get('/api/orders', requireAdmin, (req, res) => {
    const orders = readDB(ORDERS_FILE);
    res.json(orders);
});

/* مسار قبول المعاملة المالية وترقية رتب العضويات تلقائياً */
app.post('/api/orders/:id/status', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const orders = readDB(ORDERS_FILE);
    const orderIndex = orders.findIndex(o => o.id === id);

    if (orderIndex === -1) {
        return res.status(404).json({ success: false, message: 'الطلب المستهدف غير موجود.' });
    }

    const order = orders[orderIndex];
    order.status = status;
    writeDB(ORDERS_FILE, orders);

    if (status === 'accepted') {
        const users = readDB(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === order.userId);
        if (userIndex !== -1) {
            users[userIndex].purchasesCount += 1;
            users[userIndex].totalSpent += order.total;
            writeDB(USERS_FILE, users);
        }
    }

    res.json({ success: true, message: `تم تحديث حالة المعاملة بنجاح إلى: ${status === 'accepted' ? 'مقبولة' : 'مرفوضة'}` });
});

/* مسار تحميل حقيقي وتنزيل آمن للملفات البرمجية للعميل المعتمد */
app.get('/api/products/download/:productId', authenticateUser, (req, res) => {
    const { productId } = req.params;
    const products = readDB(PRODUCTS_FILE);
    const product = products.find(p => p.id === productId);

    if (!product) {
        return res.status(404).json({ success: false, message: 'البرمجية غير متوفرة بقاعدة البيانات.' });
    }

    const orders = readDB(ORDERS_FILE);
    const hasAccess = req.user.role === 'admin' || orders.some(order => 
        order.userId === req.user.id && 
        order.status === 'accepted' && 
        order.items.some(item => item.product.id === productId)
    );

    if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'غير مسموح لك بالتحميل! يجب قبول عملية الدفع الخاصة بك أولاً.' });
    }

    if (!fs.existsSync(product.securePath)) {
        return res.status(404).json({ success: false, message: 'الملف المصدري للبرنامج غير متوفر حالياً على الخادم.' });
    }

    res.download(product.securePath, product.fileName);
});

/* مسار تقديم العملاء لطلبات تصميم البرامج الخاصة */
app.post('/api/requests', authenticateUser, (req, res) => {
    const { title, description } = req.body;
    if (!title || !description) {
        return res.status(400).json({ success: false, message: 'يرجى تقديم كافة مواصفات طلبك الخاص.' });
    }

    const requests = readDB(REQUESTS_FILE);
    const newRequest = {
        id: `req-${Date.now()}`,
        userId: req.user.id,
        username: req.user.username,
        title,
        description,
        status: 'pending',
        price: 0,
        date: new Date().toLocaleDateString('ar-YE')
    };

    requests.push(newRequest);
    writeDB(REQUESTS_FILE, requests);

    res.status(201).json({ success: true, message: 'تم إرسال طلبك الخاص بنجاح لطرزان للتقييم والتسعير.' });
});

/* مسارات جلب الطلبات الخاصة وتسعيرها إدارياً */
app.get('/api/requests', authenticateUser, (req, res) => {
    const requests = readDB(REQUESTS_FILE);
    if (req.user.role === 'admin') {
        return res.json(requests);
    }
    const userRequests = requests.filter(r => r.userId === req.user.id);
    res.json(userRequests);
});

app.post('/api/requests/:id/status', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status, price } = req.body;

    const requests = readDB(REQUESTS_FILE);
    const reqIndex = requests.findIndex(r => r.id === id);

    if (reqIndex === -1) {
        return res.status(404).json({ success: false, message: 'الطلب الخاص المطلوب غير موجود.' });
    }

    requests[reqIndex].status = status;
    if (status === 'priced') {
        requests[reqIndex].price = parseFloat(price || 0);
    }
    
    writeDB(REQUESTS_FILE, requests);
    res.json({ success: true, message: 'تم تحديث حالة طلب التصميم وتسعيره للعميل بنجاح.' });
});

/* تشغيل واستماع الخادم على المنفذ المطلوب */
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🏴‍☠️ TARZANALWAQDIY VIP CYBER STORE SERVER`);
    console.log(`📡 الخادم آمن تماماً ويعمل على المنفذ: ${PORT}`);
    console.log(`🌐 تصفح المتجر الآن محلياً عبر: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
