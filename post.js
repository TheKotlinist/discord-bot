require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, WebhookClient } = require('discord.js');
const pool = require("./config/db");

const CONFIG_PATH = process.env.AUTPOST_CONFIG_PATH
    ? path.resolve(process.env.AUTPOST_CONFIG_PATH)
    : path.join(__dirname, 'autopost.config.json');
const FALLBACK_CONFIG_PATH = path.join(process.cwd(), 'autopost.config.json');
const BOT_CLIENTS = new Map();
const SENT_TOKENS = new Map();

function loadConfig() {
    const candidatePaths = [CONFIG_PATH, FALLBACK_CONFIG_PATH].filter((value, index, array) => {
        return value && array.indexOf(value) === index;
    });

    const configPath = candidatePaths.find((value) => fs.existsSync(value));

    if (!configPath) {
        throw new Error(`Missing config file: ${candidatePaths.join(' | ')}`);
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    if (!Array.isArray(config.channels) || config.channels.length === 0) {
        throw new Error('config.channels must be a non-empty array');
    }

    return config;
}

function getDelayMs(value) {
    const delay = Number(value);
    if (!Number.isFinite(delay) || delay < 0) {
        return 0;
    }

    return delay < 1000 ? delay * 1000 : delay;
}

async function sendViaWebhook(webhookUrl, message) {
    const webhook = new WebhookClient({ url: webhookUrl });
    await webhook.send({ content: message });
}

function getTokenKey(token) {
    return String(token || "").trim();
}

function shouldSkipDueToDelay(key, delaySeconds) {
    const now = Date.now();
    const lastSent = SENT_TOKENS.get(key) || 0;
    const intervalMs = Math.max(0, Number(delaySeconds) || 0) * 1000;
    return intervalMs > 0 && now - lastSent < intervalMs;
}

async function getClientForToken(token) {
    const key = getTokenKey(token);
    if (!key) return null;

    if (BOT_CLIENTS.has(key)) {
        return BOT_CLIENTS.get(key);
    }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(key);
    await new Promise((resolve) => client.once("ready", resolve));
    BOT_CLIENTS.set(key, client);
    return client;
}

async function sendFromSettings(settings) {
    const channelId = String(settings.channel_id || '').trim();
    const message = String(settings.message_content || '').trim();
    const webhookUrl = String(settings.webhook_url || '').trim();
    const token = String(settings.bot_token || '').trim();
    const delaySeconds = Number(settings.delay_seconds || 0);
    const dedupeKey = `${settings.discord_id}:${channelId}:${message}`;

    if (shouldSkipDueToDelay(dedupeKey, delaySeconds)) {
        return;
    }

    if (webhookUrl) {
        await sendViaWebhook(webhookUrl, message);
        SENT_TOKENS.set(dedupeKey, Date.now());
        return;
    }

    if (!token) {
        throw new Error(`Missing bot_token for ${settings.discord_id}`);
    }

    const client = await getClientForToken(token);
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error(`Invalid or non-text channel: ${channelId}`);
    }

    await channel.send({ content: message });
    SENT_TOKENS.set(dedupeKey, Date.now());
}

async function runAutopostCycle() {
    const result = await pool.query(
        `SELECT discord_id, bot_token, webhook_url, channel_id, message_content, delay_seconds, is_active
         FROM autopost_settings
         WHERE is_active = TRUE`
    );

    for (const settings of result.rows) {
        try {
            await sendFromSettings(settings);
            console.log(`Sent autopost for ${settings.discord_id}`);
        } catch (err) {
            console.error(`Failed autopost for ${settings.discord_id}:`, err.message);
        }
    }
}

async function main() {
    const config = loadConfig();
    const token = config.bot_token || process.env.DISCORD_TOKEN;

    if (!token) {
        throw new Error('Missing bot token. Set config.bot_token or DISCORD_TOKEN.');
    }

    const client = new Client({
        intents: [GatewayIntentBits.Guilds]
    });

    client.once('ready', async () => {
        console.log(`Autopost ready as ${client.user.tag}`);
        const configEntries = Array.isArray(config.channels) ? config.channels : [];
        if (configEntries.length > 0) {
            for (const channelConfig of configEntries) {
                const channelId = String(channelConfig.channel_id || '').trim();
                const message = String(channelConfig.message || '').trim();
                const delayMs = getDelayMs(channelConfig.delay ?? 0);
                const webhookUrl = String(channelConfig.linkwebhook || config.linkwebhook || '').trim();

                if (!channelId && !webhookUrl) {
                    console.warn('Skipping entry without channel_id or webhook_url.');
                    continue;
                }

                const task = async () => {
                    try {
                        if (webhookUrl) {
                            await sendViaWebhook(webhookUrl, message);
                            console.log(`Sent webhook message.`);
                            return;
                        }

                        const channel = await client.channels.fetch(channelId).catch(() => null);
                        if (!channel || !channel.isTextBased()) {
                            console.warn(`Skipping invalid channel: ${channelId}`);
                            return;
                        }

                        await channel.send({ content: message });
                        console.log(`Sent message to ${channelId}`);
                    } catch (err) {
                        console.error(`Failed to send to ${channelId || webhookUrl}:`, err.message);
                    }
                };

                if (delayMs > 0) {
                    setTimeout(task, delayMs);
                } else {
                    await task();
                }

                if (channelConfig.repeat === true) {
                    const intervalMs = getDelayMs(channelConfig.interval ?? channelConfig.delay ?? 300000);
                    if (intervalMs > 0) {
                        setInterval(task, intervalMs);
                    }
                }
            }
        }

        setInterval(runAutopostCycle, 60 * 1000);
        await runAutopostCycle();
    });

    await client.login(token);
}

main().catch((err) => {
    console.error('Autopost startup error:', err.message);
    process.exit(1);
});
