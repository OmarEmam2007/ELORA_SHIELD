const { PermissionFlagsBits, ChannelType } = require('discord.js');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';
const MUTED_ROLE_NAME = 'ᴍᴜᴛᴇᴅ';

async function ensureMutedRole(guild) {
    const existing = guild.roles.cache.find(r => r && r.name === MUTED_ROLE_NAME) || null;
    if (existing) return existing;

    // Create role with no perms (overwrites handle restrictions)
    const role = await guild.roles.create({
        name: MUTED_ROLE_NAME,
        permissions: [],
        reason: 'Auto-created muted role for moderation mute command'
    });
    return role;
}

async function applyMutedOverwrites(guild, mutedRole, reason) {
    const channels = guild.channels.cache.values();

    for (const ch of channels) {
        if (!ch) continue;
        if (!('permissionOverwrites' in ch) || !ch.permissionOverwrites) continue;

        // Skip categories themselves; children inherit
        if (ch.type === ChannelType.GuildCategory) continue;

        // Only apply to channels where it makes sense
        const isTextLike = [
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.AnnouncementThread,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.GuildForum
        ].includes(ch.type);

        const isVoiceLike = [
            ChannelType.GuildVoice,
            ChannelType.GuildStageVoice
        ].includes(ch.type);

        try {
            if (isTextLike) {
                await ch.permissionOverwrites.edit(
                    mutedRole,
                    {
                        SendMessages: false,
                        SendMessagesInThreads: false,
                        AddReactions: false,
                        CreatePublicThreads: false,
                        CreatePrivateThreads: false
                    },
                    { reason }
                );
            } else if (isVoiceLike) {
                // Optional voice mute behavior (prevents speaking)
                await ch.permissionOverwrites.edit(
                    mutedRole,
                    {
                        Speak: false,
                        Stream: false
                    },
                    { reason }
                );
            }
        } catch (_) {
            // ignore per-channel permission errors
        }
    }
}

module.exports = {
    name: 'mute',
    aliases: ['m', 'mute', 'اسكت'],

    async execute(message, client, args) {
        if (!message.guild) return;

        if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(`${ERROR_EMOJI} **ʏᴏᴜ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ʀᴏʟᴇꜱ ᴛᴏ ᴜꜱᴇ ᴛʜɪꜱ.**`);
        }

        const me = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
        if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(`${ERROR_EMOJI} **ɪ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ʀᴏʟᴇꜱ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴍ @ᴜꜱᴇʀ**`);
        }

        // Role hierarchy safety
        if ((me.roles.highest?.position ?? 0) <= (target.roles.highest?.position ?? 0)) {
            return message.reply(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴍᴜᴛᴇ ᴛʜɪꜱ ᴜꜱᴇʀ (ʜɪɢʜᴇʀ ʀᴏʟᴇ).**`);
        }

        try {
            const mutedRole = await ensureMutedRole(message.guild);

            // Ensure overwrites exist across channels (best-effort)
            await applyMutedOverwrites(message.guild, mutedRole, `Mute role overwrites set by ${message.author.tag}`);

            if (target.roles.cache.has(mutedRole.id)) {
                return message.reply(`${ERROR_EMOJI} **ᴛʜɪꜱ ᴜꜱᴇʀ ɪꜱ ᴀʟʀᴇᴀᴅʏ ᴍᴜᴛᴇᴅ.**`);
            }

            await target.roles.add(mutedRole, `Muted by ${message.author.tag}`);
            return message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ${target} ʜᴀꜱ ʙᴇᴇɴ ᴍᴜᴛᴇᴅ.**`);
        } catch (e) {
            console.error('[MUTE] error:', e);
            return message.reply(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`);
        }
    }
};
