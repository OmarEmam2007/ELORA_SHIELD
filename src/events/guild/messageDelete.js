const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');

module.exports = {
    name: 'messageDelete',
    async execute(message, client) {
        try {
            if (!message) return;

            // Try to fetch if partial
            try {
                if (message.partial && typeof message.fetch === 'function') {
                    message = await message.fetch().catch(() => message);
                }
            } catch (_) { }

            if (!message.guild) return;
            if (!message.author) return;
            if (message.author.bot) return;

            const logChannel = await getGuildLogChannel(message.guild, client);
            if (!logChannel) return;

            // Best-effort: who deleted the message?
            let executorId = null;
            let deletedByValue = 'Unknown';
            try {
                const me = message.guild.members.me;
                if (me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog)) {
                    const logs = await message.guild.fetchAuditLogs({ limit: 6, type: AuditLogEvent.MessageDelete }).catch(() => null);
                    const entry = logs?.entries?.find(e => {
                        const targetId = e?.target?.id;
                        const extraCh = e?.extra?.channel?.id;
                        const created = e?.createdTimestamp || 0;
                        const isRecent = Math.abs(Date.now() - created) < 8000;
                        return isRecent && targetId === message.author.id && extraCh === message.channelId;
                    }) || null;

                    if (entry?.executor) {
                        executorId = entry.executor.id;
                    }
                    // If no executor entry was found, it's often a self-delete or too-old audit entry.
                    deletedByValue = executorId
                        ? `<@${executorId}> (\`${executorId}\`)`
                        : `${message.author} (\`${message.author.id}\`) [Self / Not In Audit]`;
                } else {
                    deletedByValue = `${message.author} (\`${message.author.id}\`) [Missing Audit Access]`;
                }
            } catch (_) { }

            const createdTs = message.createdTimestamp ? `<t:${Math.floor(message.createdTimestamp / 1000)}:F>` : 'Unknown';
            const contentRaw = String(message.content || '').trim();
            const content = contentRaw.length ? contentRaw.slice(0, 1800) : '[No Content]';

            const embed = THEME.makeEmbed(EmbedBuilder, 'GRAVITY')
                .setTitle('🗑️ Message Deleted')
                .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .addFields(
                    { name: 'User', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
                    { name: 'Channel', value: `${message.channel} (\`${message.channelId}\`)`, inline: true },
                    { name: 'Message ID', value: `\`${message.id}\``, inline: true },
                    { name: 'Created', value: createdTs, inline: true },
                    {
                        name: 'Deleted By',
                        value: deletedByValue,
                        inline: true
                    },
                    { name: 'Content', value: `\`\`\`\n${content}\n\`\`\``, inline: false }
                );

            const files = [];
            const attachments = message.attachments ? [...message.attachments.values()] : [];
            for (const att of attachments.slice(0, 5)) {
                if (!att) continue;
                const url = att.url || att.proxyURL;
                if (!url) continue;
                files.push(url);
            }

            const hasAttachments = attachments.length > 0;
            if (hasAttachments) {
                const list = attachments
                    .slice(0, 10)
                    .map(a => {
                        const name = a?.name || 'file';
                        const size = typeof a?.size === 'number' ? `${Math.round(a.size / 1024)}KB` : '';
                        const url = a?.url || a?.proxyURL;
                        return url ? `- [${name}](${url}) ${size}`.trim() : `- ${name} ${size}`.trim();
                    })
                    .join('\n');
                embed.addFields({ name: 'Attachments', value: list.slice(0, 1024), inline: false });

                const first = attachments[0];
                const firstUrl = first?.url || first?.proxyURL;
                const isImage = first?.contentType ? String(first.contentType).startsWith('image/') : (firstUrl ? /\.(png|jpe?g|gif|webp)$/i.test(firstUrl) : false);
                if (isImage && firstUrl) {
                    embed.setImage(firstUrl);
                }
            }

            await logChannel.send({ embeds: [embed], files: files.length ? files : undefined }).catch(() => null);
        } catch (e) {
            // ignore
        }
    },
};
