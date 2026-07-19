const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    jidNormalizedUser 
} = require('@whiskeysockets/baileys');
const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let sock = null;
let botStatus = 'Disconnected'; 
let pairingCode = null;
let botLogs = [];
const commands = new Map();

function logSystem(type, message) {
    const time = new Date().toLocaleTimeString('ar-SA');
    const logEntry = { time, type, message };
    botLogs.push(logEntry);
    
    if (botLogs.length > 300) botLogs.shift();
    console.log(`[${time}] [${type}] ${message}`);
}

function initDirectories() {
    const commandFolder = path.join(__dirname, 'tarzan');
    if (!fs.existsSync(commandFolder)) {
        fs.mkdirSync(commandFolder, { recursive: true });
        logSystem('SYSTEM', 'تم إنشاء مجلد الأوامر (tarzan) بنجاح.');
    }

    const imgFolder = path.join(__dirname, 'src', 'img');
    if (!fs.existsSync(imgFolder)) {
        fs.mkdirSync(imgFolder, { recursive: true });
    }
    
    // Create a 1x1 pixel blank image if menu.jpg is missing to avoid crashes
    const imgPath = path.join(imgFolder, 'menu.jpg');
    if (!fs.existsSync(imgPath)) {
        const placeholderJpg = Buffer.from(
            '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 
            'base64'
        );
        fs.writeFileSync(imgPath, placeholderJpg);
        logSystem('SYSTEM', 'تم إنشاء صورة القائمة الافتراضية menu.jpg');
    }
}

function loadCommands() {
    commands.clear();
    const commandFolder = path.join(__dirname, 'tarzan');
    
    try {
        const files = fs.readdirSync(commandFolder).filter(file => file.endsWith('.js'));
        for (const file of files) {
            const filePath = path.join(commandFolder, file);
            delete require.cache[require.resolve(filePath)]; // Allow hot-reload
            const cmd = require(filePath);
            
            if (cmd.name && typeof cmd.execute === 'function') {
                commands.set(cmd.name, cmd);
                if (cmd.aliases && Array.isArray(cmd.aliases)) {
                    cmd.aliases.forEach(alias => commands.set(alias, cmd));
                }
                logSystem('SYSTEM', `تم تحميل الأمر: ${cmd.name}`);
            }
        }
    } catch (error) {
        logSystem('ERROR', `فشل في تحميل الأوامر: ${error.message}`);
    }
}

async function connectToWhatsApp(phoneNumber = null) {
    try {
        logSystem('BOT', 'جاري بدء الاتصال بخوادم واتساب الرسمية (Baileys)...');
        botStatus = 'Connecting';
        
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'session'));
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false, // Force pairing code mode
            logger: pino({ level: 'silent' }), // Hide messy baileys logs
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        if (phoneNumber && !sock.authState.creds.registered) {
            logSystem('BOT', `جاري طلب كود الربط للرقم: ${phoneNumber}`);
            setTimeout(async () => {
                try {
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                    const code = await sock.requestPairingCode(cleanPhone);
                    pairingCode = code;
                    logSystem('SUCCESS', `كود الربط جاهز: ${code}`);
                } catch (err) {
                    logSystem('ERROR', `فشل توليد الكود: ${err.message}`);
                    botStatus = 'Disconnected';
                }
            }, 3000); // Small delay to ensure socket is ready
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                logSystem('BOT', `انقطع الاتصال. السبب: ${lastDisconnect?.error?.message}`);
                botStatus = 'Disconnected';
                pairingCode = null;

                if (shouldReconnect) {
                    logSystem('BOT', 'جاري إعادة الاتصال تلقائياً...');
                    connectToWhatsApp(phoneNumber);
                } else {
                    logSystem('WARNING', 'تم تسجيل الخروج. يرجى مسح مجلد session وبدء ربط جديد.');
                }
            } else if (connection === 'open') {
                logSystem('SUCCESS', `تم الاتصال بنجاح! حساب البوت: ${jidNormalizedUser(sock.user.id)}`);
                botStatus = 'Connected';
                pairingCode = null;
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const m = chatUpdate.messages[0];
                if (!m.message || m.key.fromMe) return;

                const from = m.key.remoteJid;
                const body = m.message.conversation || 
                             m.message.extendedTextMessage?.text || 
                             m.message.imageMessage?.caption || 
                             m.message.videoMessage?.caption || '';

                const prefix = '.';
                if (!body.startsWith(prefix)) return;

                const args = body.slice(prefix.length).trim().split(/ +/);
                const cmdName = args.shift().toLowerCase();

                if (commands.has(cmdName)) {
                    const command = commands.get(cmdName);
                    logSystem('EXECUTE', `مستخدم طلب أمر [${command.name}]`);
                    
                    const reply = async (text) => {
                        await sock.sendMessage(from, { text: text }, { quoted: m });
                    };

                    try {
                        await command.execute(sock, m, args, reply, commands);
                    } catch (cmdErr) {
                        logSystem('ERROR', `خطأ في أمر ${cmdName}: ${cmdErr.message}`);
                        reply(`❌ حدث خطأ داخلي: \n${cmdErr.message}`);
                    }
                }
            } catch (err) {
                logSystem('ERROR', `خطأ في معالجة الرسالة: ${err.message}`);
            }
        });

    } catch (e) {
        logSystem('ERROR', `فشل الإقلاع: ${e.message}`);
        botStatus = 'Disconnected';
    }
}

app.get('/api/status', (req, res) => res.json({ status: botStatus, pairingCode, totalCommands: commands.size }));
app.get('/api/logs', (req, res) => res.json(botLogs));

app.post('/api/connect', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'رقم هاتف غير صالح' });
    pairingCode = null;
    connectToWhatsApp(phone);
    res.json({ message: 'جاري بدء عملية الاتصال وتوليد الكود...' });
});

app.post('/api/restart', (req, res) => {
    logSystem('SYSTEM', 'إعادة تحميل الأوامر برمجياً...');
    loadCommands();
    res.json({ message: 'تم التحديث بنجاح.' });
});

initDirectories();
loadCommands();

app.listen(PORT, () => {
    logSystem('SYSTEM', `سيرفر الويب يعمل على المنفذ ${PORT}`);
});

// Auto-connect if session exists
connectToWhatsApp();
