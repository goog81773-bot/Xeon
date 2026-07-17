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

/* إعداد المجلدات */
const DB_DIR = path.join(__dirname, 'database');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SECURE_PRODUCTS_DIR = path.join(__dirname, 'secure_files'); 
const RECEIPTS_DIR = path.join(__dirname, 'uploads', 'receipts'); 
const PUBLIC_IMAGES_DIR = path.join(__dirname, 'uploads', 'images'); 

[DB_DIR, UPLOADS_DIR, SECURE_PRODUCTS_DIR, RECEIPTS_DIR, PUBLIC_IMAGES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/* قاعدة البيانات */
const USERS_FILE = path.join(DB_DIR, 'users.json');
const PRODUCTS_FILE = path.join(DB_DIR, 'products.json');
const ORDERS_FILE = path.join(DB_DIR, 'orders.json');
const REQUESTS_FILE = path.join(DB_DIR, 'requests.json');

const readDB = (file, defaultData = []) => {
    if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(defaultData, null, 4)); return defaultData; }
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return defaultData; }
};
const writeDB = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 4), 'utf8');

/* حساب الإدارة */
const initialUsers = [{ id: "u-admin", username: "admin", password: "tarzanb", role: "admin", totalSpent: 0, purchasesCount: 0 }];
readDB(USERS_FILE, initialUsers);
readDB(PRODUCTS_FILE, []); readDB(ORDERS_FILE, []); readDB(REQUESTS_FILE, []);

/* نظام الرفع */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'new-prod-file') cb(null, SECURE_PRODUCTS_DIR);
        else if (file.fieldname === 'cust-receipt-file') cb(null, RECEIPTS_DIR);
        else cb(null, PUBLIC_IMAGES_DIR);
    },
    filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname))); 

/* الحماية */
const authenticateUser = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ success: false, message: 'غير مصرح! سجل دخولك.' });
    const user = readDB(USERS_FILE).find(u => u.id === userId);
    if (!user) return res.status(401).json({ success: false, message: 'جلسة منتهية.' });
    req.user = user; next();
};

const requireAdmin = (req, res, next) => {
    authenticateUser(req, res, () => {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'صلاحيات إدارة فقط.' });
        next();
    });
};

/* تسجيل الدخول */
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'أكمل البيانات.' });
    const users = readDB(USERS_FILE);
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(400).json({ success: false, message: 'الاسم مستخدم.' });
    const newUser = { id: `u-${Date.now()}`, username, password, role: 'user', totalSpent: 0, purchasesCount: 0 };
    users.push(newUser); writeDB(USERS_FILE, users);
    res.status(201).json({ success: true, message: 'تم التسجيل!', user: newUser });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = readDB(USERS_FILE).find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    if (!user) return res.status(400).json({ success: false, message: 'بيانات خاطئة.' });
    res.json({ success: true, message: 'تم الدخول!', user });
});

/* المنتجات */
app.get('/api/products', (req, res) => res.json(readDB(PRODUCTS_FILE).map(({ securePath, ...rest }) => rest)));

app.post('/api/products', requireAdmin, upload.fields([{ name: 'new-prod-file', maxCount: 1 }, { name: 'new-prod-image-file', maxCount: 1 }]), (req, res) => {
    const { title, price, type, description } = req.body;
    if (!req.files['new-prod-file']) return res.status(400).json({ success: false, message: 'ارفع الملف البرمجي.' });
    
    const prodFile = req.files['new-prod-file'][0];
    const imageFile = req.files['new-prod-image-file'] ? `/uploads/images/${req.files['new-prod-image-file'][0].filename}` : 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&q=80';
    
    const products = readDB(PRODUCTS_FILE);
    const newProduct = { id: `prod-${Date.now()}`, title, description, price: parseFloat(price), type, image: imageFile, fileName: prodFile.originalname, securePath: prodFile.path };
    products.push(newProduct); writeDB(PRODUCTS_FILE, products);
    res.status(201).json({ success: true, message: 'تم رفع المنتج!', product: newProduct });
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
    let products = readDB(PRODUCTS_FILE);
    const product = products.find(p => p.id === req.params.id);
    if (product && fs.existsSync(product.securePath)) try { fs.unlinkSync(product.securePath); } catch (e) {}
    writeDB(PRODUCTS_FILE, products.filter(p => p.id !== req.params.id));
    res.json({ success: true, message: 'تم الحذف.' });
});

/* الطلبات */
app.post('/api/orders', authenticateUser, upload.single('cust-receipt-file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'ارفع الإيصال.' });
    const orders = readDB(ORDERS_FILE);
    const newOrder = { id: `ord-${Date.now()}`, userId: req.user.id, customerName: req.user.username, items: JSON.parse(req.body.cartItems), total: parseFloat(req.body.total), receiptImg: `/uploads/receipts/${req.file.filename}`, status: 'pending', date: new Date().toLocaleString('ar-YE') };
    orders.push(newOrder); writeDB(ORDERS_FILE, orders);
    res.status(201).json({ success: true, message: 'الطلب قيد المراجعة.' });
});

app.get('/api/orders', requireAdmin, (req, res) => res.json(readDB(ORDERS_FILE)));
app.get('/api/user-orders', authenticateUser, (req, res) => res.json(req.user.role === 'admin' ? readDB(ORDERS_FILE) : readDB(ORDERS_FILE).filter(o => o.userId === req.user.id)));

app.post('/api/orders/:id/status', requireAdmin, (req, res) => {
    const orders = readDB(ORDERS_FILE);
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ success: false });
    order.status = req.body.status;
    writeDB(ORDERS_FILE, orders);
    
    if (req.body.status === 'accepted') {
        const users = readDB(USERS_FILE);
        const user = users.find(u => u.id === order.userId);
        if (user) { user.purchasesCount += 1; user.totalSpent += order.total; writeDB(USERS_FILE, users); }
    }
    res.json({ success: true, message: 'تم التحديث.' });
});

/* التحميل المشفر (السر لحل المشكلة) */
app.get('/api/products/download/:productId', authenticateUser, (req, res) => {
    const product = readDB(PRODUCTS_FILE).find(p => p.id === req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });

    const hasAccess = req.user.role === 'admin' || readDB(ORDERS_FILE).some(o => o.userId === req.user.id && o.status === 'accepted' && o.items.some(i => i.product.id === req.params.productId));
    if (!hasAccess) return res.status(403).json({ success: false, message: 'التحميل غير مصرح. يرجى الدفع وقبول الإدارة.' });
    if (!fs.existsSync(product.securePath)) return res.status(404).json({ success: false, message: 'الملف محذوف من الخادم.' });

    // إرسال الملف بطريقة تدعم الـ Fetch من الفرونت اند
    res.download(product.securePath, product.fileName);
});

/* الطلبات الخاصة (التفصيل) */
app.post('/api/requests', authenticateUser, (req, res) => {
    const requests = readDB(REQUESTS_FILE);
    const newRequest = { id: `req-${Date.now()}`, userId: req.user.id, username: req.user.username, title: req.body.title, description: req.body.description, status: 'pending', price: 0, date: new Date().toLocaleDateString('ar-YE') };
    requests.push(newRequest); writeDB(REQUESTS_FILE, requests);
    res.status(201).json({ success: true, message: 'تم إرسال طلبك للإدارة.' });
});

app.get('/api/requests', authenticateUser, (req, res) => res.json(req.user.role === 'admin' ? readDB(REQUESTS_FILE) : readDB(REQUESTS_FILE).filter(r => r.userId === req.user.id)));

app.post('/api/requests/:id/status', requireAdmin, (req, res) => {
    const requests = readDB(REQUESTS_FILE);
    const reqIndex = requests.findIndex(r => r.id === req.params.id);
    requests[reqIndex].status = req.body.status;
    if (req.body.status === 'priced') requests[reqIndex].price = parseFloat(req.body.price);
    writeDB(REQUESTS_FILE, requests);
    res.json({ success: true, message: 'تم التسعير/التحديث.' });
});

app.get('/api/user-profile', authenticateUser, (req, res) => res.json({ success: true, user: req.user }));

app.listen(PORT, () => console.log(`🚀 السيرفر يعمل كالنار على: ${PORT}`));
