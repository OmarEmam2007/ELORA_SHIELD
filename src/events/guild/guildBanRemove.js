const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { CHANNELS } = require('../../utils/logConfig');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');

module.exports = {
    name: 'guildBanRemove',
    async execute(ban, client) {
        try {
            const { guild, user } = ban;
            
            // Log Channel
            const logChannel = await getGuildLogChannel(guild, client);
            const unbanLogChannel = await guild.channels.fetch(CHANNELS.UNBAN).catch(() => null);

            if (!logChannel && (!unbanLogChannel || !unbanLogChannel.isTextBased())) return;

            // Fetch Audit Log
            let executor = null;

            try {
                const me = guild.members.me;
                if (me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
                    const auditLogs = await guild.fetchAuditLogs({
                        limit: 1,
                        type: AuditLogEvent.MemberBanRemove
                    });
                    const entry = auditLogs.entries.first();
                    if (entry && entry.target.id === user.id && (Date.now() - entry.createdTimestamp < 10000)) {
                        executor = entry.executor;
                    }
                }
            } catch (e) {}

            const embed = THEME.makeEmbed(EmbedBuilder, 'SUCCESS')
                .setTitle('🔓 Member Unbanned')
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User', value: `${user} (\`${user.id}\`)`, inline: true },
                    { name: 'Unbanned By', value: executor ? `${executor} (\`${executor.id}\`)` : 'Unknown', inline: true }
                )
                .setTimestamp();

            if (logChannel) await logChannel.send({ embeds: [embed] }).catch(() => null);
            if (unbanLogChannel && unbanLogChannel.isTextBased() && unbanLogChannel.id !== logChannel?.id) {
                await unbanLogChannel.send({ embeds: [embed] }).catch(() => null);
            }
        } catch (e) {
            console.error('Error in guildBanRemove log:', e);
        }
    }
};
