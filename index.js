require('dotenv').config(); // Load environment variables dari file .env

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Database sementara di memori
const userDatabase = new Map(); // Store Discord ID -> GrowID/UID
const hostDatabase = new Map(); // Store Active Hosts

const PREFIX = '!';

client.on('ready', () => {
    console.log(`✅ Bot successfully online as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. Command: !add [UID/GrowID]
    if (command === 'add') {
        const uid = args[0];
        if (!uid) {
            return message.reply('❌ Please provide your GrowID/UID! Usage: `!add 123456`');
        }

        userDatabase.set(message.author.id, uid);

        const embed = new EmbedBuilder()
            .setTitle('✅ ID Registered')
            .setDescription(`**User:** <@${message.author.id}>\n**GrowID/UID:** \`${uid}\``)
            .setColor('#00FF00')
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // 2. Command: !host (Aktif 5 Jam Otomatis)
    if (command === 'host') {
        const uid = userDatabase.get(message.author.id);
        if (!uid) {
            return message.reply('❌ You havent registered your ID yet! Please use `!add [UID]` first.');
        }

        const expireTime = Date.now() + (5 * 60 * 60 * 1000); // Now + 5 Hours
        hostDatabase.set(message.author.id, { uid, expireTime });

        const embed = new EmbedBuilder()
            .setTitle('🎰 Host Session Started')
            .setDescription(`**Host:** <@${message.author.id}>\n**UID:** \`${uid}\`\n**Active Until:** <t:${Math.floor(expireTime / 1000)}:F> (<t:${Math.floor(expireTime / 1000)}:R>)`)
            .setColor('#FFA500')
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // 3. Command: !showhost (Cek Daftar Host Aktif)
    if (command === 'showhost') {
        const now = Date.now();
        let hostList = '';
        let count = 0;

        // Filter & Auto-remove host yang sudah lewat 5 jam
        for (const [userId, data] of hostDatabase.entries()) {
            if (now > data.expireTime) {
                hostDatabase.delete(userId); // Auto-expire
            } else {
                count++;
                hostList += `${count}. <@${userId}> | UID: \`${data.uid}\` | Expires: <t:${Math.floor(data.expireTime / 1000)}:R>\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Active Hosters List')
            .setDescription(hostList || 'No active hosters right now.')
            .setColor('#0099FF')
            .setFooter({ text: `Total Active Hosters: ${count}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
});

// Panggil Token dari file .env
client.login(process.env.DISCORD_TOKEN);