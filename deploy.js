// deploy.js
require("dotenv").config();
const { REST, Routes } = require('discord.js');
const { clientId, guildId } = require('./config.json');
const { commands } = require('./commands.js');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Starte das Aktualisieren der Slash-Befehle...');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log('Slash-Befehle wurden erfolgreich aktualisiert!');
    } catch (error) {
        console.error('Fehler beim Aktualisieren der Slash-Befehle:', error);
    }
})();