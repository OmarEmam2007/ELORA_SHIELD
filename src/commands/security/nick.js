const { PermissionFlagsBits } = require('discord.js');
const NicknameLock = require('../../models/NicknameLock');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';

module.exports = {
    name: 'nick',
    async execute(message, client, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            return message.channel.send(`${ERROR_EMOJI} **ʏᴏᴜ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ɴɪᴄᴋɴᴀᴍᴇꜱ ᴛᴏ ᴜꜱᴇ ᴛʜɪꜱ.**`);
        }

        const me = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            return message.channel.send(`${ERROR_EMOJI} **ɪ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ɴɪᴄᴋɴᴀᴍᴇꜱ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.channel.send(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ɴɪᴄᴋ @ᴍᴇᴍʙᴇʀ [ɴᴇᴡ_ɴɪᴄᴋɴᴀᴍᴇ] | .ɴɪᴄᴋ @ᴍᴇᴍʙᴇʀ ʀᴇꜱᴇᴛ**`);
        }

        const OWNER_ROLE_ID = '1461766723274412126';
        const hasOwnerRole = message.member?.roles?.cache?.has(OWNER_ROLE_ID);
        const isOwnerId = client?.config?.ownerId && message.author.id === client.config.ownerId;
        const isOwner = hasOwnerRole || isOwnerId;

        if (target.id === message.author.id && !isOwner) {
            const lock = await NicknameLock.findOne({ guildId: message.guild.id, userId: target.id, locked: true }).catch(() => null);
            if (lock) {
                return message.channel.send(`${ERROR_EMOJI} **ᴛʜɪꜱ ɴɪᴄᴋɴᴀᴍᴇ ɪꜱ ʟᴏᴄᴋᴇᴅ.**`);
            }
        }

        const mentionIndex = args.findIndex((a) => a.includes('<@'));
        const nickname = args.slice(Math.max(mentionIndex, 0) + 1).join(' ').trim();

        if (!nickname) {
            return message.channel.send(`${ERROR_EMOJI} **ᴘʟᴇᴀꜱᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ɴɪᴄᴋɴᴀᴍᴇ.**`);
        }

        const lowered = nickname.toLowerCase();
        const shouldReset = ['reset', 'clear', 'off', 'remove', 'none', 'default'].includes(lowered);

        if (shouldReset) {
            try {
                await target.setNickname(null);
                await NicknameLock.findOneAndDelete({ guildId: message.guild.id, userId: target.id }).catch(() => { });
                return message.channel.send(`${DONE_EMOJI} **ᴅᴏɴᴇ, ɴɪᴄᴋɴᴀᴍᴇ ᴄʟᴇᴀʀᴇᴅ.**`);
            } catch (e) {
                return message.channel.send(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴄʜᴀɴɢᴇ ᴛʜɪꜱ ɴɪᴄᴋɴᴀᴍᴇ.**`);
            }
        }

        if (nickname.length > 32) {
            return message.channel.send(`${ERROR_EMOJI} **ɴɪᴄᴋɴᴀᴍᴇ ɪꜱ ᴛᴏᴏ ʟᴏɴɢ (ᴍᴀx 32).**`);
        }

        try {
            await target.setNickname(nickname);
            await NicknameLock.findOneAndUpdate(
                { guildId: message.guild.id, userId: target.id },
                {
                    $set: { nickname: nickname, locked: true, setBy: message.author.id },
                    $setOnInsert: { guildId: message.guild.id, userId: target.id }
                },
                { upsert: true, new: true }
            ).catch(() => { });
            return message.channel.send(`${DONE_EMOJI} **ᴅᴏɴᴇ, ɴɪᴄᴋɴᴀᴍᴇ ᴜᴘᴅᴀᴛᴇᴅ.**`);
        } catch (e) {
            return message.channel.send(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴄʜᴀɴɢᴇ ᴛʜɪꜱ ɴɪᴄᴋɴᴀᴍᴇ.**`);
        }
    },
};
