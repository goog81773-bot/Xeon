const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'menu',
    aliases: ['الاوامر', 'القائمه', 'طرزان'],
    category: 'info',
    description: 'يظهر لك قائمة الأوامر التفاعلية الفخمة بمظهر الموقع.',
    
    execute: async (sock, m, args, reply, commands) => {
        const listRows = [];
        const seenCommands = new Set();

        commands.forEach((cmd) => {
            if (commands.get(cmd.name) === cmd && !seenCommands.has(cmd.name)) {
                seenCommands.add(cmd.name);
                listRows.push({
                    title: `⚡ ${cmd.name}`,
                    id: `.${cmd.name}`,
                    description: cmd.description || 'بدون وصف'
                });
            }
        });

        const imagePath = path.join(__dirname, '..', 'src', 'img', 'menu.jpg');
        let thumbBuffer = null;
        try {
            if (fs.existsSync(imagePath)) {
                thumbBuffer = fs.readFileSync(imagePath);
            }
        } catch (e) {
            console.error("فشل قراءة الصورة", e);
        }

        let msgContent = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ 
                            text: "🦁 *طــرزان ســتــور - الـقـائـمـة الـرئـيـسـيـة*\n\nالرجاء اختيار أحد الخيارات من القائمة أدناه لعرض الأوامر." 
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: "Tarzan Premium Bot ©" }),
                        
                        // هنا السحر: استخدام Location Message لعمل الواجهة الفخمة التي طلبتها
                        header: proto.Message.InteractiveMessage.Header.create({
                            hasMediaAttachment: true,
                            locationMessage: proto.Message.LocationMessage.create({
                                degreesLatitude: 24.7136, // الرياض كمثال (يمكنك تركها 0)
                                degreesLongitude: 46.6753, 
                                name: "Tarzan Store", // اسم المتجر/البوت
                                address: "Riyadh, Saudi Arabia", // العنوان
                                jpegThumbnail: thumbBuffer // صورة الغلاف المصغرة
                            })
                        }),
                        
                        // زر القائمة المنسدلة (List) + الزر العادي (Quick Reply)
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "single_select", // زر القائمة (1 List Button)
                                    buttonParamsJson: JSON.stringify({
                                        title: "📋 افتح القائمة", // نص الزر
                                        sections: [
                                            {
                                                title: "الـقـائـمـة الـرئـيـسـيـة",
                                                rows: listRows
                                            }
                                        ]
                                    })
                                },
                                {
                                    name: "quick_reply", // الزر العادي (1 Normal Button)
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "💻 المطور",
                                        id: ".المطور"
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        };

        const msg = generateWAMessageFromContent(m.key.remoteJid, msgContent, { quoted: m });
        await sock.relayMessage(m.key.remoteJid, msg.message, { messageId: msg.key.id });
    }
};

module.exports.owner = {
    name: 'المطور',
    aliases: ['مطور', 'owner'],
    category: 'info',
    description: 'يعرض تفاصيل ومعلومات مطور البوت.',
    execute: async (sock, m, args, reply) => {
        const info = `💻 *مــطــور الــبــوت:*\n\n👤 *الاسم:* Tarzan Dev\n🚀 *النسخة:* v2.0.0 (Native Flow Edition)\n\n🤖 تم بناء البوت ليتحمل كافة المجموعات الضخمة!`;
        await reply(info);
    }
};

module.exports.ping = {
    name: 'ping',
    aliases: ['بنج'],
    category: 'info',
    description: 'سرعة استجابة البوت.',
    execute: async (sock, m, args, reply) => {
        const start = Date.now();
        await reply('⚡ جاري القياس...');
        await reply(`🚀 *الاستجابة:* \`${Date.now() - start}ms\``);
    }
};
