require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { HOST_ROLES, STAFF_ROLES } = require("./config/roles");
const pool = require("./config/db");
const getHostRole = require('./utils/getHostRole');
const isStaff = require('./utils/isStaff');
const { getCurrentSessionEndUnix, formatWibTime } = require('./utils/hostTime');
const {
    getAutopostSettings,
    upsertAutopostSettings,
    setAutopostActive,
    deleteAutopostSettings,
} = require('./utils/autopostService');
const {
    getUserUID,
    findUID,
    registerUID,
    changeUID,
    getUserInfoByDiscordId,
    getUserInfoByUID,
    normalizeUid,
} = require('./utils/uidService');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
    console.log(`✅ Bot successfully online as ${client.user.tag}!`);
});

function toUnix(value) {
    return Math.floor(new Date(value).getTime() / 1000);
}

function formatTimestampLine(unixSeconds) {
    return `<t:${unixSeconds}:F>\n(<t:${unixSeconds}:R>)`;
}

function buildEmbed(title, color, description) {
    return new EmbedBuilder().setTitle(title).setColor(color).setDescription(description);
}

function formatAutopostSettings(settings) {
    if (!settings) return "No autopost settings saved.";

    return [
        `**Active:** ${settings.is_active ? "Yes" : "No"}`,
        `**Channel:** ${settings.channel_id ? `<#${settings.channel_id}>` : "Not set"}`,
        `**Delay:** ${settings.delay_seconds != null ? `${settings.delay_seconds} seconds` : "Not set"}`,
        `**Message:** ${settings.message_content ? `\`${settings.message_content}\`` : "Not set"}`,
        `**Bot Token:** ${settings.bot_token ? "Saved" : "Not set"}`,
        `**Webhook:** ${settings.webhook_url ? "Saved" : "Not set"}`,
        `**Updated:** ${settings.updated_at ? `<t:${Math.floor(new Date(settings.updated_at).getTime() / 1000)}:F>` : "Not available"}`,
    ].join("\n");
}

async function getActiveHostByDiscordId(discordId) {
    const nowUnix = Math.floor(Date.now() / 1000);
    const result = await pool.query(
        `SELECT discord_id, uid, EXTRACT(EPOCH FROM expire_at)::bigint AS expire_unix
         FROM hosts
         WHERE discord_id = $1
         AND EXTRACT(EPOCH FROM expire_at) > $2`,
        [discordId, nowUnix]
    );

    return result.rows[0] || null;
}

async function getHostingStatusByUID(uid) {
    const nowUnix = Math.floor(Date.now() / 1000);
    const result = await pool.query(
        `SELECT h.discord_id, h.uid, EXTRACT(EPOCH FROM h.expire_at)::bigint AS expire_unix
         FROM hosts h
         WHERE h.uid = $1
         AND EXTRACT(EPOCH FROM h.expire_at) > $2`,
        [normalizeUid(uid), nowUnix]
    );

    return result.rows[0] || null;
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, user, guild } = interaction;

    // /help
    if (commandName === "help") {
        const embed = new EmbedBuilder()
            .setTitle("Command Help")
            .setColor("Blue")
            .addFields(
                {
                    name: "UID Management",
                    value: [
                        "`/registeruid target:<user> uid:<uid>` - Owner/Manager only",
                        "`/changeuid target:<user> uid:<uid>` - Owner/Manager only",
                        "`/myuid` - View your own UID",
                        "`/userinfo target:<user>` - View user profile",
                        "`/lookupuid uid:<uid>` - Search by UID",
                    ].join("\n"),
                },
                {
                    name: "Hosting",
                    value: [
                        "`/host` - Start host session",
                        "`/showhost` - Show active hosters",
                        "`/unhost` - Stop your host session",
                        "`/check target:<user>` - Staff only",
                    ].join("\n"),
                },
                {
                    name: "Roles",
                    value: [
                        "`/setrank target:<user> rank:<rank>` - Staff only",
                    ].join("\n"),
                }
            );

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /registeruid
    if (commandName === "registeruid") {
        if (!isStaff(member)) {
            return interaction.reply({ content: "❌ Only Owner / Manager can use this command.", ephemeral: true });
        }

        const target = options.getUser('target');
        const uid = normalizeUid(options.getString('uid'));

        if (!target || !uid) {
            return interaction.reply({ content: "❌ Target user and UID are required.", ephemeral: true });
        }

        try {
            const existingUser = await getUserUID(target.id);
            if (existingUser) {
                return interaction.reply({
                    content: "❌ That user already has a UID. Use `/changeuid` instead.",
                    ephemeral: true,
                });
            }

            const existingUID = await findUID(uid);
            if (existingUID) {
                return interaction.reply({ content: "❌ That UID is already registered to another user.", ephemeral: true });
            }

            const registered = await registerUID({
                targetId: target.id,
                uid,
                performedById: user.id,
            });

            const embed = new EmbedBuilder()
                .setTitle("✅ UID Registered")
                .setColor("Green")
                .addFields(
                    { name: "User", value: `<@${target.id}>`, inline: true },
                    { name: "UID", value: `\`${registered.uid}\``, inline: true },
                    { name: "Registered By", value: `<@${user.id}>`, inline: true },
                    { name: "Registered At", value: formatTimestampLine(toUnix(registered.registered_at)), inline: false }
                );

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("REGISTERUID ERROR:", err);
            if (err.code === "TARGET_HAS_UID") {
                return interaction.reply({ content: "❌ That user already has a UID. Use `/changeuid` instead.", ephemeral: true });
            }
            if (err.code === "UID_EXISTS") {
                return interaction.reply({ content: "❌ That UID is already registered to another user.", ephemeral: true });
            }

            return interaction.reply({ content: "❌ Failed to register UID.", ephemeral: true });
        }
    }

    // /changeuid
    if (commandName === "changeuid") {
        if (!isStaff(member)) {
            return interaction.reply({ content: "❌ Only Owner / Manager can use this command.", ephemeral: true });
        }

        const target = options.getUser('target');
        const uid = normalizeUid(options.getString('uid'));

        if (!target || !uid) {
            return interaction.reply({ content: "❌ Target user and new UID are required.", ephemeral: true });
        }

        try {
            const existingUser = await getUserUID(target.id);
            if (!existingUser) {
                return interaction.reply({ content: "❌ That user does not have a UID yet. Use `/registeruid` first.", ephemeral: true });
            }

            const uidOwner = await findUID(uid);
            if (uidOwner && uidOwner.discord_id !== target.id) {
                return interaction.reply({ content: "❌ That UID is already used by another user.", ephemeral: true });
            }

            const result = await changeUID({
                targetId: target.id,
                uid,
                performedById: user.id,
            });

            const embed = new EmbedBuilder()
                .setTitle("✏️ UID Updated")
                .setColor("Green")
                .addFields(
                    { name: "User", value: `<@${target.id}>`, inline: true },
                    { name: "Old UID", value: `\`${result.currentUser.uid}\``, inline: true },
                    { name: "New UID", value: `\`${result.updatedUser.uid}\``, inline: true },
                    { name: "Changed By", value: `<@${user.id}>`, inline: true },
                    { name: "Changed At", value: formatTimestampLine(toUnix(result.updatedUser.updated_at)), inline: false }
                );

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("CHANGEUID ERROR:", err);
            if (err.code === "TARGET_NO_UID") {
                return interaction.reply({ content: "❌ That user does not have a UID yet. Use `/registeruid` first.", ephemeral: true });
            }
            if (err.code === "UID_EXISTS") {
                return interaction.reply({ content: "❌ That UID is already used by another user.", ephemeral: true });
            }

            return interaction.reply({ content: "❌ Failed to update UID.", ephemeral: true });
        }
    }

    // /myuid
    if (commandName === "myuid") {
        try {
            const record = await getUserUID(user.id);

            if (!record) {
                const embed = buildEmbed(
                    "❌ Error",
                    "Red",
                    "You don't have a registered UID.\n\nPlease contact an Owner or Manager to register your UID."
                );
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle("Your UID")
                .setColor("Blue")
                .addFields(
                    { name: "UID", value: `\`${record.uid}\`` },
                    { name: "Registered By Management", value: "Only the management team can modify registered UIDs." },
                    { name: "Need to change your UID?", value: "Please pay the required A Fee and contact an Owner or Manager." }
                );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error("MYUID ERROR:", err);
            return interaction.reply({ content: "❌ Failed to retrieve your UID.", ephemeral: true });
        }
    }

    // /userinfo
    if (commandName === "userinfo") {
        const target = options.getUser('target');
        if (!target) {
            return interaction.reply({ content: "❌ Target user not found.", ephemeral: true });
        }

        try {
            const info = await getUserInfoByDiscordId(target.id);
            const host = await getActiveHostByDiscordId(target.id);
            const rank = getHostRole(await guild.members.fetch(target.id).catch(() => null)) || "No Rank";

            const embed = new EmbedBuilder()
                .setTitle("User Information")
                .setColor("Blue")
                .addFields(
                    { name: "Discord", value: `<@${target.id}>`, inline: true },
                    { name: "UID", value: info ? `\`${info.uid}\`` : "Not registered", inline: true },
                    { name: "Rank", value: `**${rank}**`, inline: true },
                    { name: "Hosting Status", value: host ? `Expires:\n${formatTimestampLine(Number(host.expire_unix))}` : "Not Hosting", inline: false },
                    { name: "Registered At", value: info?.registered_at ? formatTimestampLine(toUnix(info.registered_at)) : "Not available", inline: true },
                    { name: "Last UID Change", value: info?.updated_at ? formatTimestampLine(toUnix(info.updated_at)) : "Not available", inline: true },
                    { name: "Registered By", value: info?.registered_by ? `<@${info.registered_by}>` : "Not available", inline: true },
                    { name: "Last Changed By", value: info?.updated_by ? `<@${info.updated_by}>` : "Not available", inline: true }
                );

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("USERINFO ERROR:", err);
            return interaction.reply({ content: "❌ Failed to retrieve user information.", ephemeral: true });
        }
    }

    // /lookupuid
    if (commandName === "lookupuid") {
        const uid = normalizeUid(options.getString('uid'));
        if (!uid) {
            return interaction.reply({ content: "❌ Please provide a UID.", ephemeral: true });
        }

        try {
            const info = await getUserInfoByUID(uid);
            if (!info) {
                const embed = buildEmbed("Information", "Blue", `No user found for UID \`${uid}\`.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const host = await getHostingStatusByUID(uid);
            const member = await guild.members.fetch(info.discord_id).catch(() => null);
            const rank = getHostRole(member) || "No Rank";

            const embed = new EmbedBuilder()
                .setTitle("UID Lookup")
                .setColor("Blue")
                .addFields(
                    { name: "UID", value: `\`${info.uid}\``, inline: true },
                    { name: "Discord User", value: `<@${info.discord_id}>`, inline: true },
                    { name: "Rank", value: `**${rank}**`, inline: true },
                    { name: "Hosting Status", value: host ? `Expires:\n${formatTimestampLine(Number(host.expire_unix))}` : "Not Hosting", inline: false }
                );

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("LOOKUPUID ERROR:", err);
            return interaction.reply({ content: "❌ Failed to lookup that UID.", ephemeral: true });
        }
    }

    if (commandName === "autopost") {
        const subcommand = options.getSubcommand();

        try {
            if (subcommand === "set") {
                const botToken = options.getString("bot_token");
                const webhookUrl = options.getString("webhook_url");
                const channelId = options.getString("channel_id");
                const message = options.getString("message");
                const delaySeconds = options.getInteger("delay_seconds");

                if (!botToken && !webhookUrl) {
                    return interaction.reply({
                        content: "❌ Provide either `bot_token` or `webhook_url`.",
                        ephemeral: true,
                    });
                }

                const saved = await upsertAutopostSettings({
                    discordId: user.id,
                    botToken,
                    webhookUrl,
                    channelId,
                    messageContent: message,
                    delaySeconds,
                });

                const embed = new EmbedBuilder()
                    .setTitle("✅ Autopost Saved")
                    .setColor("Green")
                    .setDescription(formatAutopostSettings(saved));

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (subcommand === "start") {
                const settings = await getAutopostSettings(user.id);
                if (!settings) {
                    return interaction.reply({
                        content: "❌ No autopost settings found. Use `/autopost set` first.",
                        ephemeral: true,
                    });
                }

                const updated = await setAutopostActive(user.id, true);
                return interaction.reply({
                    content: `✅ Autopost started for <#${updated.channel_id}>.`,
                    ephemeral: true,
                });
            }

            if (subcommand === "stop") {
                const updated = await setAutopostActive(user.id, false);
                if (!updated) {
                    return interaction.reply({
                        content: "❌ No autopost settings found.",
                        ephemeral: true,
                    });
                }

                return interaction.reply({
                    content: "✅ Autopost stopped.",
                    ephemeral: true,
                });
            }

            if (subcommand === "status") {
                const settings = await getAutopostSettings(user.id);
                const embed = new EmbedBuilder()
                    .setTitle("Autopost Status")
                    .setColor(settings?.is_active ? "Green" : "Blue")
                    .setDescription(formatAutopostSettings(settings));

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (subcommand === "reset") {
                const deleted = await deleteAutopostSettings(user.id);
                return interaction.reply({
                    content: deleted ? "✅ Autopost settings deleted." : "❌ No autopost settings found.",
                    ephemeral: true,
                });
            }
        } catch (err) {
            console.error("AUTOPOST ERROR:", err);
            return interaction.reply({
                content: "❌ Failed to process autopost settings.",
                ephemeral: true,
            });
        }
    }

    // =========================
    // !host
    // =========================
    if (commandName === "host") {
        try {
            const result = await pool.query("SELECT uid FROM users WHERE discord_id = $1", [user.id]);

            if (result.rows.length === 0) {
                return interaction.reply({ content: "❌ You have not registered your UID.\nUse `/registeruid` or contact Owner/Manager.", ephemeral: true });
            }

            const uid = result.rows[0].uid;
            const role = getHostRole(member);

            if (!role) {
                return interaction.reply({ content: "❌ You do not have a hosting role.\nPlease contact Manager/Owner.", ephemeral: true });
            }

            const expireUnix = getCurrentSessionEndUnix();

            await pool.query(
                `INSERT INTO hosts (discord_id, uid, expire_at)
                 VALUES ($1, $2, TO_TIMESTAMP($3))
                 ON CONFLICT (discord_id) DO UPDATE SET uid = EXCLUDED.uid, expire_at = EXCLUDED.expire_at`,
                [user.id, uid, expireUnix]
            );

            const embed = new EmbedBuilder()
                .setTitle("🎰 Host Session Started")
                .setColor("Orange")
                .setDescription(`**Host:** <@${user.id}>\n**UID:** \`${uid}\`\n**Rank:** **${role}**\n\n**Active Until:** ${formatWibTime(expireUnix)} WIB\n(<t:${expireUnix}:R>)\n\nDiscord: <t:${expireUnix}:F>`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("HOST ERROR:", err);
            return interaction.reply({ content: "❌ Failed to start host session.", ephemeral: true });
        }
    }

    // =========================
    // !showhost
    // =========================
    if (commandName === "showhost") {
        try {
            const nowUnix = Math.floor(Date.now() / 1000);
            await pool.query(`DELETE FROM hosts WHERE EXTRACT(EPOCH FROM expire_at) <= $1`, [nowUnix]);
            const result = await pool.query(
                `SELECT discord_id, uid, EXTRACT(EPOCH FROM expire_at)::bigint AS expire_unix
                 FROM hosts
                 WHERE EXTRACT(EPOCH FROM expire_at) > $1
                 ORDER BY EXTRACT(EPOCH FROM expire_at) ASC`,
                [nowUnix]
            );

            let count = 0;
            let hostList = "";

            for (const row of result.rows) {
                const hostMember = await guild.members.fetch(row.discord_id).catch(() => null);
                if (!hostMember) continue;

                const role = getHostRole(hostMember) || "Unknown";
                count++;
                hostList += `**${count}.** <@${row.discord_id}>\nUID: \`${row.uid}\`\nRank: **${role}**\nExpires:\n${formatTimestampLine(Number(row.expire_unix))}\n\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle("📋 Active Hosters")
                .setColor("#0099FF")
                .setDescription(hostList || "There are no active hosters.")
                .setFooter({ text: `Total Active Hosters: ${count}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("SHOWHOST ERROR:", err);
            return interaction.reply({ content: "❌ Failed to retrieve active hosters.", ephemeral: true });
        }
    }

    // =========================
    // !setrank
    // =========================
    if (commandName === "setrank") {
        const staff = isStaff(member);

        if (!staff) {
            return interaction.reply({ content: "❌ Only Manager / Owner can use this command.", ephemeral: true });
        }

        const target = options.getMember('target');
        const rank = options.getString('rank')?.toUpperCase();

        if (!target || !HOST_ROLES[rank]) {
            return interaction.reply({ content: "❌ Rank must be rookie, veteran, supreme or mafia.", ephemeral: true });
        }

        try {
            await target.roles.remove(Object.values(HOST_ROLES));
            await target.roles.add(HOST_ROLES[rank]);

            const embed = new EmbedBuilder()
                .setColor("Green")
                .setTitle("✅ Rank Updated")
                .setDescription(`**User:** ${target}\n**New Rank:** **${rank}**\n**Changed By:** ${member}`);

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: "❌ I don't have permission to change that user's roles.", ephemeral: true });
        }
    }

    // =========================
    // !check @user
    // =========================
    if (commandName === "check") {
        const staff = isStaff(member);

        if (!staff) {
            return interaction.reply({ content: "❌ Only Manager / Owner can use this command.", ephemeral: true });
        }

        const target = options.getMember('target');
        if (!target) return interaction.reply({ content: "❌ Target user not found.", ephemeral: true });

        try {
            const userData = await getUserUID(target.id);
            const hostData = await getActiveHostByDiscordId(target.id);

            const rank = getHostRole(target) || "No Rank";
            const uid = userData ? userData.uid : "Not Registered";
            const hostStatus = hostData ? `Active until\n${formatTimestampLine(Number(hostData.expire_unix))}` : "Not Hosting";

            const embed = new EmbedBuilder()
                .setTitle("🔎 User Information")
                .setColor("Blue")
                .setDescription(`**User:** ${target}\n\n**UID:** \`${uid}\`\n\n**Rank:** **${rank}**\n\n**Host Status:** ${hostStatus}`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("CHECK ERROR:", err);
            return interaction.reply({ content: "❌ Failed checking user.", ephemeral: true });
        }
    }

    // =========================
    // /unhost
    // =========================
    if (commandName === "unhost") {
        try {
            const result = await pool.query(
                `DELETE FROM hosts
                 WHERE discord_id = $1
                 RETURNING *`,
                [user.id]
            );

            if (result.rows.length === 0) {
                return interaction.reply({
                    content: "❌ You don't have an active host session.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: "✅ Your host session has been stopped."
            });
        } catch (err) {
            console.error("UNHOST ERROR:", err);
            return interaction.reply({
                content: "❌ Failed stopping host session.",
                ephemeral: true
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
