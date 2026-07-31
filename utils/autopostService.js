const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

function normalizeText(value) {
    return String(value || "").trim();
}

function normalizeDelaySeconds(value) {
    const delay = Number(value);
    if (!Number.isFinite(delay) || delay < 0) {
        return null;
    }

    return Math.floor(delay);
}

function normalizeBoolean(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}

function getAutopostConfigPath() {
    if (process.env.AUTPOST_CONFIG_PATH) {
        return path.resolve(process.env.AUTPOST_CONFIG_PATH);
    }

    return path.join(process.cwd(), "autopost.config.json");
}

async function buildAutopostConfig() {
    const result = await pool.query(
        `SELECT bot_token, webhook_url, channel_id, message_content, delay_seconds, is_active
         FROM autopost_settings
         WHERE is_active = TRUE
         ORDER BY updated_at DESC`
    );

    const channels = result.rows
        .map((row) => ({
            channel_id: row.channel_id || "",
            message: row.message_content || "",
            delay: row.delay_seconds ?? 0,
            repeat: false,
            ...(row.webhook_url ? { linkwebhook: row.webhook_url } : {}),
        }))
        .filter((row) => row.channel_id || row.linkwebhook);

    const firstTokenRow = result.rows.find((row) => row.bot_token);

    return {
        bot_token: firstTokenRow?.bot_token || "",
        linkwebhook: "",
        channels,
    };
}

async function syncAutopostConfigFile() {
    const configPath = getAutopostConfigPath();
    const configDir = path.dirname(configPath);
    const config = await buildAutopostConfig();

    await fs.promises.mkdir(configDir, { recursive: true });

    const tempPath = `${configPath}.tmp`;
    await fs.promises.writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await fs.promises.rename(tempPath, configPath);

    return configPath;
}

async function getAutopostSettings(discordId) {
    const result = await pool.query(
        `SELECT discord_id, bot_token, webhook_url, channel_id, message_content, delay_seconds, is_active, created_at, updated_at
         FROM autopost_settings
         WHERE discord_id = $1`,
        [discordId]
    );

    return result.rows[0] || null;
}

async function upsertAutopostSettings({
    discordId,
    botToken,
    webhookUrl,
    channelId,
    messageContent,
    delaySeconds,
}) {
    const result = await pool.query(
        `INSERT INTO autopost_settings
            (discord_id, bot_token, webhook_url, channel_id, message_content, delay_seconds, is_active, created_at, updated_at)
         VALUES
            ($1, $2, $3, $4, $5, $6, FALSE, NOW(), NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
            bot_token = EXCLUDED.bot_token,
            webhook_url = EXCLUDED.webhook_url,
            channel_id = EXCLUDED.channel_id,
            message_content = EXCLUDED.message_content,
            delay_seconds = EXCLUDED.delay_seconds,
            updated_at = NOW()
         RETURNING discord_id, bot_token, webhook_url, channel_id, message_content, delay_seconds, is_active, created_at, updated_at`,
        [
            discordId,
            normalizeText(botToken),
            normalizeText(webhookUrl),
            normalizeText(channelId),
            normalizeText(messageContent),
            normalizeDelaySeconds(delaySeconds),
        ]
    );

    return result.rows[0];
}

async function setAutopostActive(discordId, isActive) {
    const result = await pool.query(
        `UPDATE autopost_settings
         SET is_active = $2,
             updated_at = NOW()
         WHERE discord_id = $1
         RETURNING discord_id, bot_token, webhook_url, channel_id, message_content, delay_seconds, is_active, created_at, updated_at`,
        [discordId, normalizeBoolean(isActive)]
    );

    return result.rows[0] || null;
}

async function deleteAutopostSettings(discordId) {
    const result = await pool.query(
        `DELETE FROM autopost_settings
         WHERE discord_id = $1
         RETURNING discord_id`,
        [discordId]
    );

    return result.rowCount > 0;
}

module.exports = {
    normalizeText,
    normalizeDelaySeconds,
    normalizeBoolean,
    syncAutopostConfigFile,
    getAutopostSettings,
    upsertAutopostSettings,
    setAutopostActive,
    deleteAutopostSettings,
};
