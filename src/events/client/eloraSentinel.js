const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');

// ======================================================
// ELORA Sentinel (Anti-Nuke / Anti-Vandal)
// Module: eloraSentinel.js
// ======================================================
// CONFIG YOU MUST SET:
// - OWNER_ID: your server owner's user id (used for emergency ping)
// - LOG_CHANNEL_ID: your security/log channel id (optional; falls back to getGuildLogChannel())
//
// NOTE:
// This system uses the guildAuditLogEntryCreate event for immediate executor attribution.
// Threshold window: 60 seconds
// - Member Purge: 3+ kicks/bans in 60s
// - Channel Nuke: 2+ channel deletions in 60s
//
// Neutralization order (must be executed in-order):
// 1) Strip roles from offender
// 2) Lockdown server by removing @everyone SendMessages + Connect permissions
// 3) Send emergency embed alert + ping owner

const OWNER_ID = '1085496418745200730';

// Optional: set this to a specific channel id for ELORA security alerts.
// If left null, the system falls back to getGuildLogChannel(guild, client).
const LOG_CHANNEL_ID = process.env.ELORA_SECURITY_LOG_CHANNEL_ID || null;

const WINDOW_MS = 60_000;
const THRESHOLD_MEMBER_PURGE = 3;
const THRESHOLD_CHANNEL_NUKE = 2;

// executorId => { kicks: number[], bans: number[], channelDeletes: number[], lastSeenAt: number }
const actionCache = new Map();

// executorId => lastNeutralizedAt
const neutralized = new Map();

let gcTimerStarted = false;
function startGarbageCollector() {
    if (gcTimerStarted) return;
    gcTimerStarted = true;

    // Lightweight GC: prune old timestamps and remove idle users
    setInterval(() => {
        const now = Date.now();
        for (const [userId, entry] of actionCache.entries()) {
            if (!entry) {
                actionCache.delete(userId);
                continue;
            }

            entry.kicks = Array.isArray(entry.kicks) ? entry.kicks.filter(t => now - t <= WINDOW_MS) : [];
            entry.bans = Array.isArray(entry.bans) ? entry.bans.filter(t => now - t <= WINDOW_MS) : [];
            entry.channelDeletes = Array.isArray(entry.channelDeletes) ? entry.channelDeletes.filter(t => now - t <= WINDOW_MS) : [];

            const isEmpty = entry.kicks.length === 0 && entry.bans.length === 0 && entry.channelDeletes.length === 0;
            const idleTooLong = now - (entry.lastSeenAt || 0) > WINDOW_MS * 5;
            if (isEmpty || idleTooLong) {
                actionCache.delete(userId);
            }
        }

        // Neutralized cache: keep it short to prevent memory leaks
        for (const [userId, ts] of neutralized.entries()) {
            if (now - ts > 10 * 60_000) neutralized.delete(userId);
        }
    }, 30_000).unref?.();
}

function getOrCreateEntry(executorId) {
    const existing = actionCache.get(executorId);
    if (existing) return existing;
    const fresh = { kicks: [], bans: [], channelDeletes: [], lastSeenAt: Date.now() };
    actionCache.set(executorId, fresh);
    return fresh;
}

function pruneWindow(arr) {
    const now = Date.now();
    return (Array.isArray(arr) ? arr : []).filter(t => now - t <= WINDOW_MS);
}

async function resolveLogChannel(guild, client) {
    if (!guild) return null;

    if (LOG_CHANNEL_ID) {
        const ch = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (ch && ch.isTextBased?.()) return ch;
    }

    return getGuildLogChannel(guild, client).catch(() => null);
}

async function stripRolesSafely(guild, member, client) {
    if (!guild || !member) return { ok: false, reason: 'Missing guild/member' };

    const me = guild.members.me || (client?.user?.id ? await guild.members.fetch(client.user.id).catch(() => null) : null);
    if (!me) return { ok: false, reason: 'Could not resolve bot member in guild' };

    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return { ok: false, reason: 'Bot lacks ManageRoles permission' };
    }

    // CRITICAL: bot role must be higher than the target's top role
    if (me.roles.highest.position <= member.roles.highest.position) {
        return { ok: false, reason: 'Bot role is not higher than target role (role hierarchy prevents stripping)' };
    }

    // Remove all roles (Discord will keep @everyone automatically)
    await member.roles.set([]).catch((e) => {
        throw new Error(`Failed to strip roles: ${e?.message || e}`);
    });

    return { ok: true };
}

async function lockdownServer(guild, client) {
    if (!guild) return { ok: false, reason: 'Missing guild' };

    const me = guild.members.me || (client?.user?.id ? await guild.members.fetch(client.user.id).catch(() => null) : null);
    if (!me) return { ok: false, reason: 'Could not resolve bot member in guild' };

    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        // Editing @everyone permissions requires ManageRoles.
        return { ok: false, reason: 'Bot lacks ManageRoles permission for lockdown' };
    }

    const everyone = guild.roles.everyone;
    if (!everyone) return { ok: false, reason: 'Could not resolve @everyone role' };

    // "Deny" at role level is represented by removing those base permissions.
    // This is lightweight and immediate; note that channel overwrites can still be more specific.
    const newPerms = everyone.permissions.remove([PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect]);
    await everyone.setPermissions(newPerms).catch((e) => {
        throw new Error(`Failed to lockdown @everyone role: ${e?.message || e}`);
    });

    return { ok: true };
}

function buildAlertEmbed({ guild, offenderUser, offenderId, reasonLabel, counts }) {
    const desc = [
        `**Threat Neutralized + Lockdown Activated**`,
        ``,
        `- **Server**: ${guild?.name || 'Unknown'} (\`${guild?.id || 'n/a'}\`)`,
        `- **Attacker**: ${offenderUser ? `${offenderUser.tag} (\`${offenderId}\`)` : `\`${offenderId}\``}`,
        `- **Trigger**: ${reasonLabel}`,
        `- **Window**: 60 seconds`,
        counts ? `- **Counts**: ${counts}` : null,
        ``,
        `**Actions Taken (in-order)**`,
        `1) Stripped offender roles`,
        `2) Locked down @everyone (no SendMessages / no Connect)`,
        `3) Sent this alert`,
    ].filter(Boolean).join('\n');

    return new EmbedBuilder()
        .setColor(THEME?.COLORS?.ERROR || 0xFF0000)
        .setTitle('ELORA Sentinel | Anti-Nuke Alert')
        .setDescription(desc)
        .setTimestamp();
}

async function sendEmergencyAlert({ guild, client, offenderUser, offenderId, reasonLabel, counts }) {
    const logChannel = await resolveLogChannel(guild, client);
    if (!logChannel) return;

    const embed = buildAlertEmbed({ guild, offenderUser, offenderId, reasonLabel, counts });
    const content = `🚨 <@${OWNER_ID}> **SECURITY ALERT** — Immediate action was taken.`;

    await logChannel.send({ content, embeds: [embed], allowedMentions: { users: [OWNER_ID] } }).catch(() => null);
}

async function neutralizeExecutor({ guild, client, executorId, reasonLabel, counts }) {
    if (!guild || !executorId) return;

    // Prevent repeated neutralization spam
    const now = Date.now();
    const last = neutralized.get(executorId) || 0;
    if (now - last < 60_000) return;
    neutralized.set(executorId, now);

    // Never punish the server owner
    if (guild.ownerId === executorId) return;

    const offenderMember = await guild.members.fetch(executorId).catch(() => null);
    const offenderUser = offenderMember?.user || null;

    // 1) Strip roles
    try {
        if (offenderMember) {
            await stripRolesSafely(guild, offenderMember, client);
        }
    } catch (e) {
        console.error('[ELORA Sentinel] Strip roles failed:', e);
    }

    // 2) Lockdown server
    try {
        await lockdownServer(guild, client);
    } catch (e) {
        console.error('[ELORA Sentinel] Lockdown failed:', e);
    }

    // 3) Emergency alert
    try {
        await sendEmergencyAlert({ guild, client, offenderUser, offenderId: executorId, reasonLabel, counts });
    } catch (e) {
        console.error('[ELORA Sentinel] Alert send failed:', e);
    }
}

module.exports = {
    name: 'guildAuditLogEntryCreate',
    async execute(entry, guild, client) {
        try {
            startGarbageCollector();

            if (!guild || !entry) return;

            // entry.executor can be null in some edge cases
            const executorId = entry.executorId || entry.executor?.id;
            if (!executorId) return;

            // Ignore self and other bots
            if (executorId === client?.user?.id) return;
            if (entry.executor?.bot) return;

            const now = Date.now();
            const cacheEntry = getOrCreateEntry(executorId);
            cacheEntry.lastSeenAt = now;

            // Track relevant actions
            let triggered = null;
            let counts = null;

            if (entry.action === AuditLogEvent.MemberKick) {
                cacheEntry.kicks = pruneWindow(cacheEntry.kicks);
                cacheEntry.kicks.push(now);
            } else if (entry.action === AuditLogEvent.MemberBanAdd) {
                cacheEntry.bans = pruneWindow(cacheEntry.bans);
                cacheEntry.bans.push(now);
            } else if (entry.action === AuditLogEvent.ChannelDelete) {
                cacheEntry.channelDeletes = pruneWindow(cacheEntry.channelDeletes);
                cacheEntry.channelDeletes.push(now);
            } else {
                return;
            }

            // Re-prune all for accuracy
            cacheEntry.kicks = pruneWindow(cacheEntry.kicks);
            cacheEntry.bans = pruneWindow(cacheEntry.bans);
            cacheEntry.channelDeletes = pruneWindow(cacheEntry.channelDeletes);

            const purgeCount = cacheEntry.kicks.length + cacheEntry.bans.length;
            const channelDeleteCount = cacheEntry.channelDeletes.length;

            if (purgeCount >= THRESHOLD_MEMBER_PURGE) {
                triggered = `Member Purge (\u2265 ${THRESHOLD_MEMBER_PURGE} kicks/bans)`;
                counts = `kicks=${cacheEntry.kicks.length}, bans=${cacheEntry.bans.length}`;
            } else if (channelDeleteCount >= THRESHOLD_CHANNEL_NUKE) {
                triggered = `Channel Nuke (\u2265 ${THRESHOLD_CHANNEL_NUKE} channel deletions)`;
                counts = `channelDeletes=${channelDeleteCount}`;
            }

            if (!triggered) return;

            await neutralizeExecutor({
                guild,
                client,
                executorId,
                reasonLabel: triggered,
                counts,
            });
        } catch (e) {
            console.error('[ELORA Sentinel] guildAuditLogEntryCreate handler error:', e);
        }
    }
};
