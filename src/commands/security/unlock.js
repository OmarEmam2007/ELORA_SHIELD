const { PermissionFlagsBits, ChannelType } = require('discord.js');

const DONE_EMOJI = '<a:10:1430395692299456704>';
const ERROR_EMOJI = '<a:false:1433339552876990465>';

module.exports = {
    name: 'unlock',
    aliases: ['unlock'],
    async execute(message, client, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply(`${ERROR_EMOJI} **ʏᴏᴜ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ᴄʜᴀɴɴᴇʟꜱ ᴛᴏ ᴜꜱᴇ ᴛʜɪꜱ.**`);
        }

        const me = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply(`${ERROR_EMOJI} **ɪ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ᴄʜᴀɴɴᴇʟꜱ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        const unlockAll = (args[0] || '').toLowerCase() === 'all';

        const applyUnlock = async (channel) => {
            if (!channel || !channel.permissionOverwrites) return false;
            if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return false;
            const reason = `Unlocked by ${message.author.tag}`;

            await channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: null,
                    SendMessagesInThreads: null,
                    AddReactions: null
                },
                { reason }
            );

            let cleared = 0;
            for (const overwrite of channel.permissionOverwrites.cache.values()) {
                if (overwrite.type !== 0) continue;
                if (overwrite.id === message.guild.roles.everyone.id) continue;

                const deny = overwrite.deny;
                if (deny?.has(PermissionFlagsBits.SendMessages) || deny?.has(PermissionFlagsBits.SendMessagesInThreads) || deny?.has(PermissionFlagsBits.AddReactions)) {
                    await channel.permissionOverwrites.edit(
                        overwrite.id,
                        {
                            SendMessages: null,
                            SendMessagesInThreads: null,
                            AddReactions: null
                        },
                        { reason }
                    ).catch(() => { });
                    cleared++;
                }
            }

            channel.__eloraUnlockCleared = cleared;
            return true;
        };

        try {
            if (!unlockAll) {
                const ok = await applyUnlock(message.channel);
                if (!ok) return message.reply(`${ERROR_EMOJI} **ᴛʜɪꜱ ᴄʜᴀɴɴᴇʟ ᴛʏᴘᴇ ɪꜱ ɴᴏᴛ ꜱᴜᴘᴘᴏʀᴛᴇᴅ.**`);
                return message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ᴄʜᴀɴɴᴇʟ ʜᴀꜱ ʙᴇᴇɴ ᴜɴʟᴏᴄᴋᴇᴅ.**`);
            }

            let okCount = 0;
            let failCount = 0;

            const channels = message.guild.channels.cache
                .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type));

            for (const [, ch] of channels) {
                try {
                    const ok = await applyUnlock(ch);
                    if (ok) okCount++;
                    else failCount++;
                } catch (_) {
                    failCount++;
                }
            }

            return message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ᴄʜᴀɴɴᴇʟ ʜᴀꜱ ʙᴇᴇɴ ᴜɴʟᴏᴄᴋᴇᴅ.**`);
        } catch (e) {
            return message.reply(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`);
        }
    },
};
