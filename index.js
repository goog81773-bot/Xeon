const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    jidNormalizedUser 
} = require('levvleys'); // Updated dependency to levvleys
const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Global application state
let sock = null;
let botStatus = 'Disconnected'; // Disconnected, Connecting, Connected
let pairingCode = null;
let botLogs = [];
const commands = new Map();

function logSystem(type, message) {
    const time = new Date().toLocaleTimeString('ar-SA');
    const logEntry = { time, type, message };
    botLogs.push(logEntry);
    
    // Limit log memory to prevent leaks
    if (botLogs.length > 300) botLogs.shift();
    
    // Output to server terminal
    console.log(`[${time}] [${type}] ${message}`);
}

function loadCommands() {
    commands.clear();
    const commandFolder = path.join(__dirname, 'tarzan');
    
    if (!fs.existsSync(commandFolder)) {
        fs.mkdirSync(commandFolder, { recursive: true });
        logSystem('SYSTEM', 'تم إنشاء مجلد الأوامر (tarzan) تلقائياً.');
    }

    // Ensure src/img exists and menu.jpg is present to prevent crashes on thumbnail read
    const imgFolder = path.join(__dirname, 'src', 'img');
    if (!fs.existsSync(imgFolder)) {
        fs.mkdirSync(imgFolder, { recursive: true });
        logSystem('SYSTEM', 'تم إنشاء مجلد صور القائمة تلقائياً.');
    }
    const imgPath = path.join(imgFolder, 'menu.jpg');
    if (!fs.existsSync(imgPath)) {
        // Safe tiny 1x1 black pixel or basic mock JPEG buffer
        const placeholderJpg = Buffer.from(
            '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 
            'base64'
        );
        fs.writeFileSync(imgPath, placeholderJpg);
        logSystem('SYSTEM', 'تم إنشاء غلاف القائمة الافتراضي menu.jpg بنجاح.');
    }

    try {
        const files = fs.readdirSync(commandFolder).filter(file => file.endsWith('.js'));
        for (const file of files) {
            const filePath = path.join(commandFolder, file);
            // Delete cache to allow dynamic reloading
            delete require.cache[require.resolve(filePath)];
            const cmd = require(filePath);
            
            if (cmd.name && typeof cmd.execute === 'function') {
                commands.set(cmd.name, cmd);
                if (cmd.aliases && Array.isArray(cmd.aliases)) {
                    cmd.aliases.forEach(alias => commands.set(alias, cmd));
                }
                logSystem('SYSTEM', `تم تحميل الأمر بنجاح: ${cmd.name}`);
            }
        }
        logSystem('SYSTEM', `إجمالي الأوامر النشطة المحملة: ${commands.size / 2 || commands.size}`);
    } catch (error) {
        logSystem('ERROR', `فشل في تحميل الأوامر: ${error.message}`);
    }
}

async function connectToWhatsApp(phoneNumber = null) {
    try {
        logSystem('BOT', 'بدء إعداد جلسة الاتصال بالواتساب باستخدام محرك Levvleys...');
        botStatus = 'Connecting';
        
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'session'));
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false, // Force pairing code
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        // Request pairing code if phone number is provided and we are not logged in
        if (phoneNumber && !sock.authState.creds.registered) {
            logSystem('BOT', `جاري طلب كود الربط للرقم: ${phoneNumber}`);
            setTimeout(async () => {
                try {
                    // Clean phone number format
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                    const code = await sock.requestPairingCode(cleanPhone);
                    pairingCode = code;
                    logSystem('SUCCESS', `كود الربط الخاص بك جاهز: ${code}`);
                } catch (err) {
                    logSystem('ERROR', `فشل في توليد كود الربط: ${err.message}`);
                    botStatus = 'Disconnected';
                }
            }, 3000);
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                logSystem('BOT', `تم إغلاق الاتصال. السبب: ${lastDisconnect?.error?.message || 'غير معروف'}`);
                botStatus = 'Disconnected';
                pairingCode = null;

                if (shouldReconnect) {
                    logSystem('BOT', 'إعادة الاتصال بالواتساب تلقائياً...');
                    connectToWhatsApp(phoneNumber);
                } else {
                    logSystem('WARNING', 'تم تسجيل الخروج من الجلسة. يرجى مسح مجلد session وإعادة الربط.');
                }
            } else if (connection === 'open') {
                logSystem('SUCCESS', `تم الاتصال بنجاح بالرقم: ${jidNormalizedUser(sock.user.id)}`);
                botStatus = 'Connected';
                pairingCode = null;
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const m = chatUpdate.messages[0];
                if (!m.message) return;
                if (m.key.fromMe) return; // Ignore self messages

                const from = m.key.remoteJid;
                const body = m.message.conversation || 
                             m.message.extendedTextMessage?.text || 
                             m.message.imageMessage?.caption || 
                             m.message.videoMessage?.caption || '';

                const prefix = '.'; // Set default bot prefix
                if (!body.startsWith(prefix)) return;

                const args = body.slice(prefix.length).trim().split(/ +/);
                const cmdName = args.shift().toLowerCase();

                logSystem('MESSAGE', `رسالة واردة من [${from}] بمحتوى: ${body}`);

                if (commands.has(cmdName)) {
                    const command = commands.get(cmdName);
                    logSystem('EXECUTE', `جاري تنفيذ أمر [${command.name}] بواسطة [${from}]`);
                    
                    // Standard helper sender function
                    const reply = async (text) => {
                        await sock.sendMessage(from, { text: text }, { quoted: m });
                    };

                    try {
                        await command.execute(sock, m, args, reply, commands);
                    } catch (cmdErr) {
                        logSystem('ERROR', `خطأ في تنفيذ الأمر ${cmdName}: ${cmdErr.message}`);
                        reply(`❌ حدث خطأ داخلي أثناء تنفيذ الأمر: \n${cmdErr.message}`);
                    }
                }
            } catch (err) {
                logSystem('ERROR', `خطأ في معالجة الرسائل: ${err.message}`);
            }
        });

    } catch (e) {
        logSystem('ERROR', `فشل تهيئة البوت: ${e.message}`);
        botStatus = 'Disconnected';
    }
}

app.get('/api/status', (req, res) => {
    res.json({
        status: botStatus,
        pairingCode: pairingCode,
        totalCommands: commands.size
    });
});

app.get('/api/logs', (req, res) => {
    res.json(botLogs);
});

app.post('/api/connect', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'الرجاء إدخال رقم هاتف صحيح مع رمز الدولة بدون (+)' });
    }
    
    pairingCode = null;
    connectToWhatsApp(phone);
    res.json({ message: 'جاري بدء عملية الاتصال وتوليد الكود...' });
});

app.post('/api/restart', (req, res) => {
    logSystem('SYSTEM', 'إعادة تشغيل البوت وتحديث الأوامر برمجياً...');
    loadCommands();
    res.json({ message: 'تم تحديث الأوامر وإعادة تشغيل البوت بنجاح.' });
});

// Start-up sequence
loadCommands();
// Start Express Server
app.listen(PORT, () => {
    logSystem('SYSTEM', `لوحة التحكم تعمل الآن على: http://localhost:${PORT}`);
});

// Try to auto-connect on start if session files exist
connectToWhatsApp();
