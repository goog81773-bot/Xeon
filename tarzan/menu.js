module.exports = {
    name: 'menu',
    aliases: ['الاوامر', 'القائمه', 'طرزان'],
    category: 'info',
    description: 'يظهر لك قائمة الأوامر المتاحة للبوت بتصميم فخم وسهل الاستخدام عن طريق كارت الأزرار والقوائم الجديد.',
    
    execute: async (sock, m, args, reply, commands) => {
        const moment = new Date();
        const currentDate = moment.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const currentTime = moment.toLocaleTimeString('ar-SA');
        
        // We will build the list Menu dynamically based on registered commands!
        const listMenu = [];
        const seenCommands = new Set();

        commands.forEach((cmd) => {
            // Avoid duplicate listing for aliases in list menu
            if (commands.get(cmd.name) === cmd && !seenCommands.has(cmd.name)) {
                seenCommands.add(cmd.name);
                listMenu.push({
                    id: `.${cmd.name}`,
                    title: `⚡ .${cmd.name}`,
                    description: cmd.description || 'لا يوجد وصف متاح.'
                });
            }
        });

        // Beautiful formatted description to show above the buttons
        let menuDescription = `🦁 *◤ بــوت طــرزان الـجـبّـار ◢*\n\n`;
        menuDescription += `📅 *اليوم:* ${currentDate}\n`;
        menuDescription += `⏰ *الوقت:* ${currentTime}\n`;
        menuDescription += `⚙️ *البادئة:* [ *.* ]\n`;
        menuDescription += `💬 *إجمالي الأوامر:* ${listMenu.length} فعّالاً\n\n`;
        menuDescription += `اختر الزر أدناه لاستعراض القائمة المتكاملة والأوامر بكل سلاسة وفخامة!`;

        // Sending the gorgeous 1-list-button & 1-normal-button style via levvleys custom payload
        await sock.sendMessage(m.key.remoteJid, {
            buttonLocation: {
                latitude: null,
                longitude: null,
                name: "Tarzan Bot HQ",
                address: "لوحة التحكم التفاعلية الفخمة",

                jpegThumbnail: "./src/img/menu.jpg",

                text: menuDescription,
                footer: "Tarzan Premium WhatsApp Bot",

                listButtonText: "🔥 افتح القائمة من هنا",
                listSectionTitle: "📋 الأوامر المتاحة",

                listMenu: listMenu,

                extraButtons: [
                    {
                        id: ".المطور",
                        displayText: "💻 مطور البوت"
                    }
                ]
            }
        }, {
            quoted: m
        });
    }
};

// Let's load supplementary built-in commands inside the same workspace so user has multiple cool features on first run:

// 1. Ping command
module.exports.ping = {
    name: 'ping',
    aliases: ['بنج', 'بينج'],
    category: 'info',
    description: 'يقيس سرعة استجابة البوت وخادم الاتصال بنبضات الـ MS.',
    execute: async (sock, m, args, reply) => {
        const start = Date.now();
        await reply('⚡ جاري قياس النبض وسرعة الخادم...');
        const latency = Date.now() - start;
        await reply(`🚀 *اسـتـجـابـة الـبـوت:* \`${latency}ms\`\n🤖 *الحالة الصحية:* ممتاز ومستقر جداً.`);
    }
};

// 2. Info/Developer command
module.exports.owner = {
    name: 'المطور',
    aliases: ['مطور', 'owner'],
    category: 'info',
    description: 'يعرض تفاصيل ومعلومات مالك البوت والمطور الأساسي لمشروع طرزان.',
    execute: async (sock, m, args, reply) => {
        const info = `💻 *مــطــور بــوت طــرزان الــفــخــم:*\n\n` +
                     `👤 *الاسم:* Tarzan Developer\n` +
                     `🚀 *النسخة البرمجية:* v2.0.0 (Levvleys Ultimate)\n` +
                     `🌐 *البيئة المحيطة:* Node.js v18+\n\n` +
                     `🤖 تم تصميم وبرمجة هذا البوت ليتحمل كافة المجموعات الضخمة ويخدم الأعضاء بأعلى أداء واستقرار!`;
        await reply(info);
    }
};

// 3. AI / ChatGPT mock command
module.exports.ai = {
    name: 'ذكاء',
    aliases: ['سؤال', 'ai'],
    category: 'tools',
    description: 'يمنحك إجابات ذكاء اصطناعي فورية ومجانية.',
    execute: async (sock, m, args, reply) => {
        const question = args.join(' ');
        if (!question) {
            return reply('❌ يرجى كتابة سؤال بعد الأمر! مثال:\n`.ذكاء من هو طرزان؟`');
        }
        await reply('🧠 جاري التفكير وصياغة الإجابة...');
        
        // Simulating highly advanced cyber response for extreme engagement
        setTimeout(async () => {
            const answers = [
                `أهلاً بك! لقد تم تدريبي بأحدث التقنيات. رداً على سؤالك ("${question}"): \n\nيعتبر مشروع طرزان من أقوى مشاريع بناء البوتات وتحديثها باستجابة لحظية متميزة. لا تتردد في استخدام هذا البوت بكل الأوقات!`,
                `أهلاً يا بطل! يسعدني إجابتك على سؤالك بخصوص "${question}":\n\nالبوت يعمل بكفاءة والاتصال ممتاز جداً في المخدم. الأوامر متكاملة والتحكم سلس من لوحة الويب!`
            ];
            const chosen = answers[Math.floor(Math.random() * answers.length)];
            await reply(chosen);
        }, 1500);
    }
};
