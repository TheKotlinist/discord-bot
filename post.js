require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, WebhookClient } = require('discord.js');

const CONFIG_PATH = path.join(__dirname, 'autopost.config.json');

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error(`Missing config file: ${CONFIG_PATH}`);
    }

    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
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

        for (const channelConfig of config.channels) {
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
    });

    await client.login(token);
}

main().catch((err) => {
    console.error('Autopost startup error:', err.message);
    process.exit(1);
});
