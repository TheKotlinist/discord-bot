require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('registeruid')
        .setDescription('Register a UID for another Discord user')
        .addUserOption(option => option.setName('target').setDescription('User to register').setRequired(true))
        .addStringOption(option => option.setName('uid').setDescription('UID to register').setRequired(true)),
    new SlashCommandBuilder()
        .setName('changeuid')
        .setDescription('Change an existing UID')
        .addUserOption(option => option.setName('target').setDescription('User to change').setRequired(true))
        .addStringOption(option => option.setName('uid').setDescription('New UID').setRequired(true)),
    new SlashCommandBuilder().setName('myuid').setDescription('Show your registered UID'),
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Show user information')
        .addUserOption(option => option.setName('target').setDescription('User to inspect').setRequired(true)),
    new SlashCommandBuilder()
        .setName('lookupuid')
        .setDescription('Look up a user by UID')
        .addStringOption(option => option.setName('uid').setDescription('UID to look up').setRequired(true)),
    new SlashCommandBuilder().setName('help').setDescription('Show all available bot commands'),
    new SlashCommandBuilder().setName('host').setDescription('Start host session'),
    new SlashCommandBuilder().setName('showhost').setDescription('Show active hosters'),
    new SlashCommandBuilder().setName('unhost').setDescription('Stop your active host session'),
    new SlashCommandBuilder().setName('setrank').setDescription('Set host rank (Staff only)')
        .addUserOption(option => option.setName('target').setDescription('User to set rank').setRequired(true))
        .addStringOption(option => option.setName('rank').setDescription('Rank: rookie/veteran/supreme/mafia').setRequired(true)),
    new SlashCommandBuilder().setName('check').setDescription('Check user information (Staff only)')
        .addUserOption(option => option.setName('target').setDescription('User to check').setRequired(true))
    ,
    new SlashCommandBuilder()
        .setName('autopost')
        .setDescription('Manage autopost settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Save autopost settings')
                .addStringOption(option => option.setName('channel_id').setDescription('Target channel ID').setRequired(true))
                .addStringOption(option => option.setName('message').setDescription('Message content').setRequired(true))
                .addIntegerOption(option => option.setName('delay_seconds').setDescription('Delay in seconds').setRequired(true))
                .addStringOption(option => option.setName('bot_token').setDescription('Discord bot token. Leave blank to use DISCORD_TOKEN').setRequired(false))
                .addStringOption(option => option.setName('webhook_url').setDescription('Optional fallback webhook URL').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Show autopost control panel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Enable autopost')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Disable autopost')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current autopost settings')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Delete saved autopost settings')
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log("✅ Slash Commands registered successfully!");
    } catch (error) {
        console.error(error);
    }
})();
