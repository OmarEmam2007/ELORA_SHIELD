require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, Partials, ActivityType, Collection } = require('discord.js');
const { loadEvents } = require('./handlers/eventHandler');
const { loadCommands } = require('./handlers/commandHandler');
const { loadPrefixCommands } = require('./handlers/prefixCommandHandler');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

client.commands = new Collection();
client.config = require('../config.json');

const app = express();
app.get('/', (req, res) => res.send('ELORA SHIELD is Online'));
app.listen(process.env.PORT || 7860, () => console.log('✅ Web server ready'));

client.once('ready', () => {
    try {
        client.user.setActivity('ELORA SHIELD', { type: ActivityType.Playing });
    } catch (_) {}
    console.log(`✅ [ELORA SHIELD] Logged in as ${client.user.tag}`);
});

(async () => {
    try {
        const token = process.env.DISCORD_TOKEN;
        if (!token) throw new Error('Missing DISCORD_TOKEN');

        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (mongoUri) {
            await mongoose.connect(mongoUri);
            console.log('✅ MongoDB connected');
        }

        await loadCommands(client);
        await loadPrefixCommands(client);
        console.log('✅ [ELORA SHIELD] Loaded: Moderation Commands');
        console.log('✅ [ELORA SHIELD] Loaded: Security Commands');
        await loadEvents(client);
        await client.login(token);
    } catch (err) {
        console.error('❌ [ELORA SHIELD] Startup error:', err);
        process.exitCode = 1;
    }
})();

process.on('unhandledRejection', (reason) => console.error('❌ [Unhandled Rejection]', reason));
process.on('uncaughtException', (error) => console.error('❌ [Uncaught Exception]', error));
