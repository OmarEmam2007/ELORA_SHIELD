const { PermissionFlagsBits, ChannelType } = require('discord.js');

const DONE_EMOJI = '<a:555:1430395692299456704>';
const ERROR_EMOJI = '<a:661071whitex:1433339552876990465>';

module.exports = {
    name: 'lock',
    aliases: ['lock'],
    async execute(message, client, args) {
        if (!message.guild) return;

        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply(`${ERROR_EMOJI} **ʏᴏᴜ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ᴄʜᴀɴɴᴇʟꜱ ᴛᴏ ᴜꜱᴇ ᴛʜɪꜱ.**`);
        }

        const me = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply(`${ERROR_EMOJI} **ɪ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ᴄʜᴀɴɴᴇʟꜱ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        const lockAll = (args[0] || '').toLowerCase() === 'all';

        const applyLock = async (channel) => {
            if (!channel || !channel.permissionOverwrites) return false;
            if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return false;
            const reason = `Locked by ${message.author.tag}`;

            await channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    AddReactions: false
                },
                { reason }
            );

            let tightened = 0;
            for (const overwrite of channel.permissionOverwrites.cache.values()) {
                if (overwrite.type !== 0) continue;
                if (overwrite.id === message.guild.roles.everyone.id) continue;

                const allow = overwrite.allow;
                if (allow?.has(PermissionFlagsBits.SendMessages) || allow?.has(PermissionFlagsBits.SendMessagesInThreads)) {
                    await channel.permissionOverwrites.edit(
                        overwrite.id,
                        {
                            SendMessages: false,
                            SendMessagesInThreads: false
                        },
                        { reason }
                    ).catch(() => { });
                    tightened++;
                }
            }

            channel.__eloraLockTightened = tightened;
            return true;
        };

        try {
            if (!lockAll) {
                const ok = await applyLock(message.channel);
                if (!ok) return message.reply(`${ERROR_EMOJI} **ᴛʜɪꜱ ᴄʜᴀɴɴᴇʟ ᴛʏᴘᴇ ɪꜱ ɴᴏᴛ ꜱᴜᴘᴘᴏʀᴛᴇᴅ.**`);
                return message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ᴄʜᴀɴɴᴇʟ ʜᴀꜱ ʙᴇᴇɴ ʟᴏᴄᴋᴇᴅ.**`);
            }

            let okCount = 0;
            let failCount = 0;

            const channels = message.guild.channels.cache
                .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type));

            for (const [, ch] of channels) {
                try {
                    const ok = await applyLock(ch);
                    if (ok) okCount++;
                    else failCount++;
                } catch (_) {
                    failCount++;
                }
            }

            return message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ᴄʜᴀɴɴᴇʟ ʜᴀꜱ ʙᴇᴇɴ ʟᴏᴄᴋᴇᴅ.**`);
        } catch (e) {
            return message.reply(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`);
        }
    },
};
