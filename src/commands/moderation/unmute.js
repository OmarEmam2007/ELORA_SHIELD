const { PermissionFlagsBits } = require('discord.js');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';
const MUTED_ROLE_NAME = 'ᴍᴜᴛᴇᴅ';

module.exports = {
    name: 'unmute',
    aliases: ['unmute', 'فك', 'تكلم'],

    async execute(message) {
        if (!message.guild) return;

        if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.channel.send(`${ERROR_EMOJI} **ʏᴏᴜ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ʀᴏʟᴇꜱ ᴛᴏ ᴜꜱᴇ ᴛʜɪꜱ.**`);
        }

        const me = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.channel.send(`${ERROR_EMOJI} **ɪ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ʀᴏʟᴇꜱ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.channel.send(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴜɴᴍᴜᴛᴇ @ᴜꜱᴇʀ**`);
        }

        const mutedRole = message.guild.roles.cache.find(r => r && r.name === MUTED_ROLE_NAME) || null;
        if (!mutedRole) {
            return message.channel.send(`${ERROR_EMOJI} **ɴᴏ ᴍᴜᴛᴇ ʀᴏʟᴇ ꜰᴏᴜɴᴅ.**`);
        }

        if (!target.roles.cache.has(mutedRole.id)) {
            return message.channel.send(`${ERROR_EMOJI} **ᴛʜɪꜱ ᴜꜱᴇʀ ɪꜱ ɴᴏᴛ ᴍᴜᴛᴇᴅ.**`);
        }

        try {
            await target.roles.remove(mutedRole, `Unmuted by ${message.author.tag}`);
            return message.channel.send(`${DONE_EMOJI} **ᴅᴏɴᴇ, ${target} ʜᴀꜱ ʙᴇᴇɴ ᴜɴᴍᴜᴛᴇᴅ.**`);
        } catch (e) {
            console.error('[UNMUTE] error:', e);
            return message.channel.send(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`);
        }
    }
};
