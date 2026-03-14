const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { CHANNELS } = require('../../utils/logConfig');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');

module.exports = {
    name: 'guildBanAdd',
    async execute(ban, client) {
        try {
            const { guild, user } = ban;
            
            // Log Channel
            const logChannel = await getGuildLogChannel(guild, client);
            const banLogChannel = await guild.channels.fetch(CHANNELS.BAN_KICK).catch(() => null);

            if (!logChannel && (!banLogChannel || !banLogChannel.isTextBased())) return;

            // Fetch Audit Log
            let executor = null;
            let reason = ban.reason || 'No reason provided';

            try {
                const me = guild.members.me;
                if (me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
                    const auditLogs = await guild.fetchAuditLogs({
                        limit: 1,
                        type: AuditLogEvent.MemberBanAdd
                    });
                    const entry = auditLogs.entries.first();
                    if (entry && entry.target.id === user.id && (Date.now() - entry.createdTimestamp < 10000)) {
                        executor = entry.executor;
                        reason = entry.reason || reason;
                    }
                }
            } catch (e) {}

            const embed = THEME.makeEmbed(EmbedBuilder, 'ERROR')
                .setTitle('🔨 Member Banned')
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User', value: `${user} (\`${user.id}\`)`, inline: true },
                    { name: 'Banned By', value: executor ? `${executor} (\`${executor.id}\`)` : 'Unknown', inline: true },
                    { name: 'Reason', value: `\`\`\`${reason}\`\`\``, inline: false }
                )
                .setTimestamp();

            if (logChannel) await logChannel.send({ embeds: [embed] }).catch(() => null);
            if (banLogChannel && banLogChannel.isTextBased() && banLogChannel.id !== logChannel?.id) {
                await banLogChannel.send({ embeds: [embed] }).catch(() => null);
            }
        } catch (e) {
            console.error('Error in guildBanAdd log:', e);
        }
    }
};
