require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const { PREFIX, HOST_DURATION } = require('./config/settings');
const getHostRole = require('./utils/getHostRole');

// Database sementara
const userDatabase = new Map();
const hostDatabase = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`✅ Bot successfully online as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // =========================
    // !add
    // =========================
    if (command === 'add') {

        const uid = args[0];

        if (!uid) {
            return message.reply(
                '❌ Please provide your GrowID/UID!\nUsage: `!add 123456`'
            );
        }

        const role = getHostRole(message.member);

        if (!role) {
            return message.reply(
                '❌ You do not have a hosting role.\nPlease contact Manager/Owner.'
            );
        }

        userDatabase.set(message.author.id, {
            uid
        });

        const embed = new EmbedBuilder()
            .setTitle('✅ UID Registered')
            .setColor('Green')
            .setDescription(
                `**User:** <@${message.author.id}>
**UID:** \`${uid}\`
**Rank:** **${role}**`
            )
            .setTimestamp();

        return message.reply({
            embeds: [embed]
        });
    }

    // =========================
    // !host
    // =========================
    if (command === 'host') {

        const user = userDatabase.get(message.author.id);

        if (!user) {
            return message.reply(
                '❌ You have not registered your UID.\nUse `!add [UID]` first.'
            );
        }

        const role = getHostRole(message.member);

        if (!role) {
            return message.reply(
                '❌ Your hosting role was not found.\nPlease contact Manager/Owner.'
            );
        }

        const expireTime = Date.now() + HOST_DURATION;

        hostDatabase.set(message.author.id, {
            uid: user.uid,
            expireTime
        });

        const embed = new EmbedBuilder()
            .setTitle('🎰 Host Session Started')
            .setColor('Orange')
            .setDescription(
                `**Host:** <@${message.author.id}>
**UID:** \`${user.uid}\`
**Rank:** **${role}**
**Active Until:** <t:${Math.floor(expireTime / 1000)}:F>
(<t:${Math.floor(expireTime / 1000)}:R>)`
            )
            .setTimestamp();

        return message.reply({
            embeds: [embed]
        });
    }

    // =========================
    // !showhost
    // =========================
    if (command === 'showhost') {

        const now = Date.now();

        let count = 0;
        let hostList = '';

        for (const [userId, data] of hostDatabase.entries()) {

            if (now > data.expireTime) {
                hostDatabase.delete(userId);
                continue;
            }

            const member = await message.guild.members.fetch(userId).catch(() => null);

            if (!member) continue;

            const role = getHostRole(member) || "Unknown";

            count++;

            hostList +=
                `${count}. <@${userId}>
UID: \`${data.uid}\`
Rank: **${role}**
Expires: <t:${Math.floor(data.expireTime / 1000)}:R>

`;
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Active Hosters')
            .setColor('#0099FF')
            .setDescription(hostList || 'No active hosters.')
            .setFooter({
                text: `Total Active Hosters: ${count}`
            })
            .setTimestamp();

        return message.reply({
            embeds: [embed]
        });
    }

});

client.login(process.env.DISCORD_TOKEN);