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
    new SlashCommandBuilder().setName('host').setDescription('Start host session'),
    new SlashCommandBuilder().setName('showhost').setDescription('Show active hosters'),
    new SlashCommandBuilder().setName('unhost').setDescription('Stop your active host session'),
    new SlashCommandBuilder().setName('setrank').setDescription('Set host rank (Staff only)')
        .addUserOption(option => option.setName('target').setDescription('User to set rank').setRequired(true))
        .addStringOption(option => option.setName('rank').setDescription('Rank: rookie/veteran/supreme/mafia').setRequired(true)),
    new SlashCommandBuilder().setName('check').setDescription('Check user information (Staff only)')
        .addUserOption(option => option.setName('target').setDescription('User to check').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🔄 Registering Slash Commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Slash Commands registered successfully!');
    } catch (error) {
        console.error(error);
    }
})();
