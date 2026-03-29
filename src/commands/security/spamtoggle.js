const { PermissionFlagsBits } = require('discord.js');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');

module.exports = {
    name: 'spamtoggle',
    aliases: ['spamtoggle'],

    async execute(message, client, args) {
        if (!message?.guild) return;

        const hasAdministrator = Boolean(message.member?.permissions?.has?.(PermissionFlagsBits.Administrator));
        if (!hasAdministrator) {
            await message.reply({ content: '**✖ You need Administrator permission to use this command.**' }).catch(() => null);
            return;
        }

        const sub = String(args?.[0] || '').toLowerCase();
        if (!sub || (sub !== 'on' && sub !== 'off')) {
            await message.reply({ content: '**✖ Invalid syntax. Use: .spamtoggle on OR .spamtoggle off**' }).catch(() => null);
            return;
        }

        const enabled = sub === 'on';
        await GuildSecurityConfig.findOneAndUpdate(
            { guildId: message.guild.id },
            { $set: { antiSpamEnabled: enabled }, $setOnInsert: { guildId: message.guild.id } },
            { upsert: true, new: true }
        ).catch(() => null);

        await message.reply({ content: `**<a:custom_check:1487391271759646750> Anti-spam is now ${enabled ? 'enabled' : 'disabled'}.**` }).catch(() => null);
    }
};
