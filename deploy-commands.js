require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder().setName('add').setDescription('Register your GrowID/UID')
        .addStringOption(option => option.setName('uid').setDescription('Your GrowID/UID').setRequired(true)),
    new SlashCommandBuilder().setName('host').setDescription('Start host session'),
    new SlashCommandBuilder().setName('showhost').setDescription('Show active hosters'),
    new SlashCommandBuilder().setName('myuid').setDescription('Show your registered UID'),
    new SlashCommandBuilder().setName('unhost').setDescription('Stop your active host session'),
    new SlashCommandBuilder().setName('edithost').setDescription('Edit your host UID')
        .addStringOption(option => option.setName('uid').setDescription('New GrowID/UID').setRequired(true)),
    new SlashCommandBuilder().setName('setrank').setDescription('Set host rank (Staff only)')
        .addUserOption(option => option.setName('target').setDescription('User to set rank').setRequired(true))
        .addStringOption(option => option.setName('rank').setDescription('Rank: rookie/veteran/supreme/mafia').setRequired(true)),
    new SlashCommandBuilder().setName('check').setDescription('Check user information (Staff only)')
        .addUserOption(option => option.setName('target').setDescription('User to check').setRequired(true)),
    new SlashCommandBuilder().setName('removeuid').setDescription('Remove user UID (Staff only)')
        .addUserOption(option => option.setName('target').setDescription('User to remove').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🔄 Registering Slash Commands...');
        // Kamu bisa ganti Routes.applicationCommands(CLIENT_ID) kalau mau global
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Slash Commands registered successfully!');
    } catch (error) {
        console.error(error);
    }
})();