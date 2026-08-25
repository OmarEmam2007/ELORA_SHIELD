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
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
});

client.commands = new Collection();
client.config = require('../config.json');

const app = express();
app.get('/', (req, res) => res.send('ELORA SHIELD is Online'));
app.listen(process.env.PORT || 7860, () => console.log('✓ Web server ready'));

client.once('ready', () => {
    try {
        client.user.setActivity('ELORA SHIELD', { type: ActivityType.Playing });
    } catch (_) {}
    console.log(`✓ [ELORA SHIELD] Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    // أمر عرض السيرفرات + الـ IDs
    if (message.content === '!servers' && message.author.id === '1085496418745200730') {
        const serverCount = client.guilds.cache.size;
        const serverList = client.guilds.cache.map(g => 
            `✦ ${g.name}\n🆔 \`${g.id}\``
        ).join('\n\n');
        
        message.reply(`البوت في **${serverCount}** سيرفر:\n\`\`\`\n${serverList}\n\`\`\``);
    }

    // أمر خروج البوت من سيرفر معين
    if (message.content.startsWith('!leave ') && message.author.id === '1085496418745200730') {
        const guildId = message.content.split(' ')[1];
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            return message.reply('❌ مش لاقي السيرفر ده، تأكد من الـ ID.');
        }

        try {
            await guild.leave();
            message.reply(`✅ خرجت من السيرفر: **${guild.name}**`);
        } catch (err) {
            message.reply('❌ حصل خطأ وأنا بحاول أخرج من السيرفر.');
            console.error(err);
        }
    }
});

(async () => {
    try {
        const token = process.env.DISCORD_TOKEN;
        if (!token) throw new Error('Missing DISCORD_TOKEN');

        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (mongoUri) {
            await mongoose.connect(mongoUri);
            console.log('✓ MongoDB connected');
        }

        await loadCommands(client);
        await loadPrefixCommands(client);
        console.log('✓ [ELORA SHIELD] Loaded: Moderation Commands');
        console.log('✓ [ELORA SHIELD] Loaded: Security Commands');
        await loadEvents(client);
        await client.login(token);
    } catch (err) {
        console.error('✖ [ELORA SHIELD] Startup error:', err);
        process.exitCode = 1;
    }
})();

process.on('unhandledRejection', (reason) => console.error('✖ [Unhandled Rejection]', reason));
process.on('uncaughtException', (error) => console.error('✖ [Uncaught Exception]', error));