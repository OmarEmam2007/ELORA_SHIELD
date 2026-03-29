const {
    AuditLogEvent,
    getConfig,
    isWhitelistedMember,
    fetchRecentAuditExecutor,
    timeoutMember
} = require('../../services/guildSecurityService');

const { EmbedBuilder, ChannelType } = require('discord.js');

const ROLE_DELETE_WINDOW_MS = 10 * 1000;
const ROLE_DELETE_THRESHOLD = 3;

// Map<GuildId, Map<ExecutorId, number[]>>
const roleDeleteTracker = new Map();

async function sendSecurityLog(guild, config, payload) {
    try {
        if (!config?.securityLogChannelId) return;
        const ch = await guild.channels.fetch(config.securityLogChannelId).catch(() => null);
        if (!ch || ch.type !== ChannelType.GuildText) return;
        await ch.send(payload).catch(() => { });
    } catch (_) { }
}

function serializeRole(role) {
    return {
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: role.permissions?.bitfield?.toString?.() || '0'
    };
}

async function restoreDeletedRole(guild, snapshot) {
    const created = await guild.roles.create({
        name: snapshot.name,
        color: snapshot.color,
        hoist: snapshot.hoist,
        mentionable: snapshot.mentionable,
        permissions: BigInt(snapshot.permissions || '0')
    });
    return created;
}

module.exports = {
    name: 'roleDelete',
    async execute(role) {
        try {
            const guild = role.guild;
            if (!guild) return;

            const config = await getConfig(guild.id);
            if (!config?.antiNukeEnabled) return;

            const snapshot = serializeRole(role);

            const audit = await fetchRecentAuditExecutor({ guild, event: AuditLogEvent.RoleDelete, targetId: role.id });
            const executorId = audit?.executorId;
            if (!executorId) return;

            const executorMember = await guild.members.fetch(executorId).catch(() => null);
            if (isWhitelistedMember(executorMember, config)) return;

            // Threshold tracking: 3+ role deletions in 10 seconds
            const now = Date.now();
            if (!roleDeleteTracker.has(guild.id)) roleDeleteTracker.set(guild.id, new Map());
            const guildMap = roleDeleteTracker.get(guild.id);
            const arr = Array.isArray(guildMap.get(executorId)) ? guildMap.get(executorId) : [];
            const pruned = arr.filter(t => now - t <= ROLE_DELETE_WINDOW_MS);
            pruned.push(now);
            guildMap.set(executorId, pruned);

            if (pruned.length > ROLE_DELETE_THRESHOLD) {
                if (guild.ownerId !== executorId) {
                    await guild.members.ban(executorId, { reason: 'Anti-Nuke: role deletion threshold exceeded' }).catch(() => null);
                }

                const embed = new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('**✖ Anti-Nuke: Role Protection Triggered**')
                    .setDescription(
                        `**▫️ User <@${executorId}> just triggered the anti-nuke role deletion threshold.**\n` +
                        `**▫️ Roles Deleted: ${pruned.length}**\n` +
                        `**▫️ Action Taken: Permanent Ban.**`
                    )
                    .setFooter({ text: '**<a:custom_check:1487391271759646750>**' });

                await sendSecurityLog(guild, config, { embeds: [embed] });
                return;
            }

            let restored = null;
            try {
                restored = await restoreDeletedRole(guild, snapshot);
            } catch (_) {
                restored = null;
            }

            const hours = Number(config.punishmentTimeoutHours || 12);
            const punished = await timeoutMember(executorMember, hours, 'Anti-nuke: unauthorized role deletion');

            await sendSecurityLog(guild, config, {
                content: `**⟁ Anti-Nuke: Role deleted: ${role.name} (\`${role.id}\`)**\n` +
                    `**▫️ Executor: <@${executorId}> (\`${executorId}\`)**\n` +
                    `**▫️ Action: ${punished ? `Timeout ${hours}h applied` : 'Unable to apply timeout'}**\n` +
                    `**▫️ Restore: ${restored ? `Restored as ${restored.name}` : 'Restore failed'}**`
            });
        } catch (e) {
            console.error('roleDelete anti-nuke error:', e);
        }
    }
};
