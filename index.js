require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { HOST_ROLES, STAFF_ROLES } = require("./config/roles");
const pool = require("./config/db");


const { PREFIX, HOST_DURATION } = require('./config/settings');
const getHostRole = require('./utils/getHostRole');

const hostDatabase = new Map();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
    console.log(`✅ Bot successfully online as ${client.user.tag}!`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, user, guild } = interaction;

    // =========================
    // !add
    // =========================
    if (commandName === "add") {
        const uid = options.getString('uid');
        if (!uid) return interaction.reply({ content: "❌ Please provide your GrowID/UID!", ephemeral: true });

        const role = getHostRole(member);
        if (!role) return interaction.reply({ content: "❌ You do not have a hosting role.\nPlease contact Manager/Owner.", ephemeral: true });

        try {
            await pool.query(
                `INSERT INTO users (discord_id, uid) VALUES ($1, $2)
             ON CONFLICT (discord_id) DO UPDATE SET uid = EXCLUDED.uid`,
                [user.id, uid]
            );

            const embed = new EmbedBuilder()
                .setTitle("✅ UID Registered")
                .setColor("Green")
                .setDescription(`**User:** <@${user.id}>\n**UID:** \`${uid}\`\n**Rank:** **${role}**`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("ADD UID ERROR:", err);
            return interaction.reply({ content: "❌ Failed to save UID to the database.", ephemeral: true });
        }
    }

    // =========================
    // !host
    // =========================
    if (commandName === "host") {
        try {
            const result = await pool.query("SELECT uid FROM users WHERE discord_id = $1", [user.id]);

            if (result.rows.length === 0) {
                return interaction.reply({ content: "❌ You have not registered your UID.\nUse `/add` first.", ephemeral: true });
            }

            const uid = result.rows[0].uid;
            const role = getHostRole(member);

            if (!role) {
                return interaction.reply({ content: "❌ You do not have a hosting role.\nPlease contact Manager/Owner.", ephemeral: true });
            }

            const expireTime = Date.now() + HOST_DURATION;

            await pool.query(
                `INSERT INTO hosts (discord_id, uid, expire_at)
             VALUES ($1, $2, TO_TIMESTAMP($3))
             ON CONFLICT (discord_id) DO UPDATE SET uid = EXCLUDED.uid, expire_at = EXCLUDED.expire_at`,
                [user.id, uid, expireTime / 1000]
            );

            const embed = new EmbedBuilder()
                .setTitle("🎰 Host Session Started")
                .setColor("Orange")
                .setDescription(`**Host:** <@${user.id}>\n**UID:** \`${uid}\`\n**Rank:** **${role}**\n\n**Active Until:** <t:${Math.floor(expireTime / 1000)}:F>\n(<t:${Math.floor(expireTime / 1000)}:R>)`)
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
            await pool.query(`DELETE FROM hosts WHERE expire_at < NOW()`);
            const result = await pool.query(`SELECT * FROM hosts WHERE expire_at > NOW() ORDER BY expire_at ASC`);

            let count = 0;
            let hostList = "";

            for (const row of result.rows) {
                const hostMember = await guild.members.fetch(row.discord_id).catch(() => null);
                if (!hostMember) continue;

                const role = getHostRole(hostMember) || "Unknown";
                count++;
                hostList += `**${count}.** <@${row.discord_id}>\nUID: \`${row.uid}\`\nRank: **${role}**\nExpires: <t:${Math.floor(new Date(row.expire_at).getTime() / 1000)}:R>\n\n`;
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
        const isStaff = member.roles.cache.has(STAFF_ROLES.MANAGER) || member.roles.cache.has(STAFF_ROLES.OWNER);

        if (!isStaff) {
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
    // !myuid
    // =========================
    if (commandName === "myuid") {
        try {
            const result = await pool.query("SELECT uid FROM users WHERE discord_id = $1", [user.id]);

            if (result.rows.length === 0) {
                return interaction.reply({ content: "❌ You have not registered your UID.\nUse `/add` first.", ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle("🆔 Your UID")
                .setColor("Blue")
                .setDescription(`**User:** ${user}\n\n**UID:** \`${result.rows[0].uid}\``)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error("MYUID ERROR:", err);
            return interaction.reply({ content: "❌ Failed to retrieve your UID.", ephemeral: true });
        }
    }

    // =========================
    // !check @user
    // =========================
    if (commandName === "check") {
        const isStaff = member.roles.cache.has(STAFF_ROLES.MANAGER) || member.roles.cache.has(STAFF_ROLES.OWNER);

        if (!isStaff) {
            return interaction.reply({ content: "❌ Only Manager / Owner can use this command.", ephemeral: true });
        }

        const target = options.getMember('target');
        if (!target) return interaction.reply({ content: "❌ Target user not found.", ephemeral: true });

        try {
            const userData = await pool.query("SELECT uid FROM users WHERE discord_id = $1", [target.id]);
            const hostData = await pool.query("SELECT expire_at FROM hosts WHERE discord_id = $1", [target.id]);

            const rank = getHostRole(target) || "No Rank";
            const uid = userData.rows.length ? userData.rows[0].uid : "Not Registered";
            const hostStatus = hostData.rows.length ? `Active until <t:${Math.floor(new Date(hostData.rows[0].expire_at).getTime() / 1000)}:R>` : "Not Hosting";

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
    // !removeuid @user
    // =========================
    if (commandName === "removeuid") {

        const isStaff =
            member.roles.cache.has(STAFF_ROLES.MANAGER) ||
            member.roles.cache.has(STAFF_ROLES.OWNER);

        if (!isStaff) {
            return interaction.reply({
                content: "❌ Only Manager / Owner can use this command.",
                ephemeral: true
            });
        }

        const target = options.getMember('target');

        if (!target) {
            return interaction.reply({
                content: "❌ Target user not found.",
                ephemeral: true
            });
        }

        try {

            await pool.query(
                `
            DELETE FROM users
            WHERE discord_id = $1
            `,
                [target.id]
            );

            return interaction.reply({
                content: `✅ UID removed from ${target}.`
            });

        } catch (err) {

            console.error("REMOVEUID ERROR:", err);

            return interaction.reply({
                content: "❌ Failed removing UID.",
                ephemeral: true
            });

        }

    }

    // =========================
    // /unhost
    // =========================
    if (commandName === "unhost") {

        try {

            const result = await pool.query(
                `
            DELETE FROM hosts
            WHERE discord_id = $1
            RETURNING *
            `,
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


    // =========================
    // /edithost <uid>
    // =========================
    if (commandName === "edithost") {

        const newUid = options.getString('uid');

        if (!newUid) {
            return interaction.reply({
                content: "❌ Please provide a new UID.",
                ephemeral: true
            });
        }

        try {

            const hostCheck = await pool.query(
                `
            SELECT *
            FROM hosts
            WHERE discord_id = $1
            `,
                [user.id]
            );

            if (hostCheck.rows.length === 0) {

                return interaction.reply({
                    content: "❌ You don't have an active host session.",
                    ephemeral: true
                });

            }

            await pool.query(
                `
            UPDATE hosts
            SET uid = $1
            WHERE discord_id = $2
            `,
                [
                    newUid,
                    user.id
                ]
            );

            await pool.query(
                `
            UPDATE users
            SET uid = $1
            WHERE discord_id = $2
            `,
                [
                    newUid,
                    user.id
                ]
            );

            const embed = new EmbedBuilder()
                .setTitle("✏️ Host UID Updated")
                .setColor("Yellow")
                .setDescription(
                    `**User:** ${user}

**New UID:** \`${newUid}\``
                )
                .setTimestamp();

            return interaction.reply({
                embeds: [embed]
            });

        } catch (err) {

            console.error("EDITHOST ERROR:", err);

            return interaction.reply({
                content: "❌ Failed changing host UID.",
                ephemeral: true
            });

        }

    }

});

client.login(process.env.DISCORD_TOKEN);