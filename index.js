require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
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
    syncAutopostConfigFile,
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

client.once('clientReady', () => {
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
        `**Bot Token:** ${settings.bot_token ? "Saved" : "Using DISCORD_TOKEN"}`,
        `**Webhook:** ${settings.webhook_url ? "Saved as fallback" : "Not set"}`,
        `**Updated:** ${settings.updated_at ? `<t:${Math.floor(new Date(settings.updated_at).getTime() / 1000)}:F>` : "Not available"}`,
    ].join("\n");
}

function buildAutopostPanel(settings) {
    const embed = new EmbedBuilder()
        .setTitle("Discord Token Autopost Panel")
        .setColor(settings?.is_active ? "Green" : "Blue")
        .setDescription([
            "Gunakan tombol di bawah untuk mengelola autopost. Kamu bisa simpan token bot kedua di UI ini.",
            "",
            formatAutopostSettings(settings),
        ].join("\n"));

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("autopost:add")
            .setLabel("Add Bot")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("autopost:manage")
            .setLabel("Edit Bot")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("autopost:start")
            .setLabel("Start")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("autopost:stop")
            .setLabel("Stop")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("autopost:status")
            .setLabel("Statistics")
            .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("autopost:delete")
            .setLabel("Delete")
            .setStyle(ButtonStyle.Danger),
    );

    return { embeds: [embed], components: [row1, row2], ephemeral: true };
}

function buildAutopostModal(customId, title, settings = {}) {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    const tokenInput = new TextInputBuilder()
        .setCustomId("bot_token")
        .setLabel("Bot Token (optional, overrides DISCORD_TOKEN)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(settings.bot_token || "");

    const webhookInput = new TextInputBuilder()
        .setCustomId("webhook_url")
        .setLabel("Webhook URL (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(settings.webhook_url || "");

    const channelInput = new TextInputBuilder()
        .setCustomId("channel_id")
        .setLabel("Target Channel ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(settings.channel_id || "");

    const messageInput = new TextInputBuilder()
        .setCustomId("message_content")
        .setLabel("Message Content")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(settings.message_content || "");

    const delayInput = new TextInputBuilder()
        .setCustomId("delay_seconds")
        .setLabel("Delay Seconds")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(settings.delay_seconds != null ? String(settings.delay_seconds) : "");

    modal.addComponents(
        new ActionRowBuilder().addComponents(tokenInput),
        new ActionRowBuilder().addComponents(webhookInput),
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(messageInput),
        new ActionRowBuilder().addComponents(delayInput),
    );

    return modal;
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
    if (interaction.isButton()) {
        if (!interaction.customId.startsWith("autopost:")) return;

        const action = interaction.customId.split(":")[1];
        if (action === "add" || action === "manage") {
            let settings = {};
            if (action === "manage") {
                settings = await Promise.race([
                    getAutopostSettings(interaction.user.id),
                    new Promise((resolve) => setTimeout(() => resolve({}), 1200)),
                ]) || {};
            }

            const modal = buildAutopostModal(
                action === "add" ? "autopost:addModal" : "autopost:manageModal",
                action === "add" ? "Add Bot Token" : "Edit Bot Token",
                settings || {}
            );
            return interaction.showModal(modal);
        }

        const settings = await getAutopostSettings(interaction.user.id);
        await interaction.deferReply({ ephemeral: true });

        if (action === "start") {
            if (!settings) {
                return interaction.editReply({ content: "❌ No autopost settings found. Use Add Bot first." });
            }
            await setAutopostActive(interaction.user.id, true);
            await syncAutopostConfigFile();
            return interaction.editReply({ content: "✅ Autopost started." });
        }

        if (action === "stop") {
            if (!settings) {
                return interaction.editReply({ content: "❌ No autopost settings found." });
            }
            await setAutopostActive(interaction.user.id, false);
            await syncAutopostConfigFile();
            return interaction.editReply({ content: "✅ Autopost stopped." });
        }

        if (action === "status") {
            return interaction.editReply({
                ...buildAutopostPanel(settings),
            });
        }

        if (action === "delete") {
            const deleted = await deleteAutopostSettings(interaction.user.id);
            if (deleted) {
                await syncAutopostConfigFile();
            }
            return interaction.editReply({
                content: deleted ? "✅ Autopost settings deleted." : "❌ No autopost settings found.",
            });
        }

        return interaction.editReply({ content: "❌ Unknown autopost action." });
    }

    if (interaction.isModalSubmit()) {
        if (!interaction.customId.startsWith("autopost:")) return;

        const action = interaction.customId.split(":")[1];
        const botToken = interaction.fields.getTextInputValue("bot_token")?.trim();
        const webhookUrl = interaction.fields.getTextInputValue("webhook_url")?.trim();
        const channelId = interaction.fields.getTextInputValue("channel_id")?.trim();
        const messageContent = interaction.fields.getTextInputValue("message_content")?.trim();
        const delayRaw = interaction.fields.getTextInputValue("delay_seconds")?.trim();
        const delaySeconds = Number(delayRaw);
        const resolvedBotToken = botToken || process.env.DISCORD_TOKEN || "";

        if (!channelId || !messageContent || !Number.isInteger(delaySeconds) || delaySeconds < 0) {
            return interaction.reply({ content: "❌ Channel, message, and delay are required and delay must be a valid number.", ephemeral: true });
        }

        if (!resolvedBotToken && !webhookUrl) {
            return interaction.reply({ content: "❌ Missing bot token, `DISCORD_TOKEN`, or webhook URL.", ephemeral: true });
        }

        const saved = await upsertAutopostSettings({
            discordId: interaction.user.id,
            botToken: resolvedBotToken,
            webhookUrl,
            channelId,
            messageContent,
            delaySeconds,
        });

        if (action === "add") {
            await setAutopostActive(interaction.user.id, true);
        }

        const panel = buildAutopostPanel(saved);
        return interaction.reply({
            ...panel,
            content: action === "add" ? "✅ Account added and autopost enabled." : "✅ Account updated.",
            ephemeral: true,
        });
    }

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
                const resolvedBotToken = botToken || process.env.DISCORD_TOKEN || "";

                if (!resolvedBotToken && !webhookUrl) {
                    return interaction.reply({
                        content: "❌ Provide bot token, `DISCORD_TOKEN`, or `webhook_url`.",
                        ephemeral: true,
                    });
                }

                const saved = await upsertAutopostSettings({
                    discordId: user.id,
                    botToken: resolvedBotToken,
                    webhookUrl,
                    channelId,
                    messageContent: message,
                    delaySeconds,
                });
                await syncAutopostConfigFile();

                const embed = new EmbedBuilder()
                    .setTitle("✅ Autopost Saved")
                    .setColor("Green")
                    .setDescription(formatAutopostSettings(saved));

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (subcommand === "panel") {
                const settings = await getAutopostSettings(user.id);
                return interaction.reply(buildAutopostPanel(settings));
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
                await syncAutopostConfigFile();
                return interaction.reply({
                    content: `✅ Autopost started for <#${updated.channel_id}>.`,
                    ephemeral: true,
                });
            }

            if (subcommand === "stop") {
                const updated = await setAutopostActive(user.id, false);
                await syncAutopostConfigFile();
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
                if (deleted) {
                    await syncAutopostConfigFile();
                }
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

            const rankOrder = ["ROOKIE", "VETERAN", "SUPREME", "MAFIA"];
            const rankLabels = {
                ROOKIE: "Rookie",
                VETERAN: "Veteran",
                SUPREME: "Supreme",
                MAFIA: "Mafia",
            };
            const groupedHosts = new Map(rankOrder.map((rank) => [rank, []]));

            for (const row of result.rows) {
                const hostMember = await guild.members.fetch(row.discord_id).catch(() => null);
                if (!hostMember) continue;

                const role = getHostRole(hostMember);
                const rank = rankOrder.includes(role) ? role : "ROOKIE";
                groupedHosts.get(rank).push({
                    discordId: row.discord_id,
                    name: hostMember.displayName || hostMember.user?.username || "Unknown",
                    uid: row.uid,
                    expireUnix: Number(row.expire_unix),
                });
            }

            let totalCount = 0;
            let hostList = "";

            for (const rank of rankOrder) {
                const hosts = groupedHosts.get(rank) || [];
                hostList += `**${rankLabels[rank]}** (${hosts.length})\n`;

                if (!hosts.length) {
                    hostList += "-\n\n";
                    continue;
                }

                totalCount += hosts.length;

                hosts.forEach((host, index) => {
                    hostList += `**${index + 1}.** ${host.name}\n`;
                    hostList += `UID: \`${host.uid}\`\n`;
                    hostList += `Berlaku sampai:\n${formatTimestampLine(host.expireUnix)}\n\n`;
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("📋 Daftar Host Aktif")
                .setColor("#0099FF")
                .setDescription(hostList || "Tidak ada host yang aktif.")
                .setFooter({ text: `Total Host Aktif: ${totalCount}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("SHOWHOST ERROR:", err);
            return interaction.reply({ content: "❌ Gagal mengambil daftar host aktif.", ephemeral: true });
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
