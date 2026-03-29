const { EmbedBuilder, ChannelType } = require('discord.js');
const {
    AuditLogEvent,
    getConfig,
    isWhitelistedMember,
    fetchRecentAuditExecutor
} = require('../../services/guildSecurityService');

const CHANNEL_CREATE_WINDOW_MS = 10 * 1000;
const CHANNEL_CREATE_THRESHOLD = 3;

// Map<GuildId, Map<ExecutorId, number[]>>
const channelCreateTracker = new Map();

async function sendSecurityLog(guild, config, payload) {
    try {
        const logChannelId = config?.securityLogChannelId;
        if (!logChannelId) return;
        const ch = await guild.channels.fetch(logChannelId).catch(() => null);
        if (!ch || ch.type !== ChannelType.GuildText) return;
        await ch.send(payload).catch(() => { });
    } catch (_) { }
}

module.exports = {
    name: 'channelCreate',
    async execute(channel) {
        try {
            const guild = channel.guild;
            if (!guild) return;

            const config = await getConfig(guild.id);
            if (!config?.antiNukeEnabled) return;

            const audit = await fetchRecentAuditExecutor({ guild, event: AuditLogEvent.ChannelCreate, targetId: channel.id });
            const executorId = audit?.executorId;
            if (!executorId) return;

            const executorMember = await guild.members.fetch(executorId).catch(() => null);
            if (isWhitelistedMember(executorMember, config)) return;

            const now = Date.now();
            if (!channelCreateTracker.has(guild.id)) channelCreateTracker.set(guild.id, new Map());
            const guildMap = channelCreateTracker.get(guild.id);
            const arr = Array.isArray(guildMap.get(executorId)) ? guildMap.get(executorId) : [];
            const pruned = arr.filter(t => now - t <= CHANNEL_CREATE_WINDOW_MS);
            pruned.push(now);
            guildMap.set(executorId, pruned);

            if (pruned.length > CHANNEL_CREATE_THRESHOLD) {
                if (guild.ownerId !== executorId) {
                    await guild.members.ban(executorId, { reason: 'Anti-Nuke: channel creation threshold exceeded' }).catch(() => null);
                }

                const embed = new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('**✖ Anti-Nuke: Channel Protection Triggered**')
                    .setDescription(
                        `**▫️ User <@${executorId}> just triggered the anti-nuke channel creation threshold.**\n` +
                        `**▫️ Channels Created: ${pruned.length}**\n` +
                        `**▫️ Action Taken: Permanent Ban.**`
                    )
                    .setFooter({ text: '**<a:custom_check:1487391271759646750>**' });

                await sendSecurityLog(guild, config, { embeds: [embed] });

                // Best-effort cleanup: remove the newly created channel
                await channel.delete('Anti-Nuke: channel creation threshold exceeded').catch(() => null);
                return;
            }
        } catch (e) {
            console.error('channelCreate anti-nuke error:', e);
        }
    }
};
