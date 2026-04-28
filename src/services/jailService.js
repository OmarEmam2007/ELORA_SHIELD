const { PermissionFlagsBits } = require('discord.js');
const JailRecord = require('../models/JailRecord');

const JAIL_CHANNEL_ID = '1498649057898401822';
const JAILED_ROLE_ID = '1498649099644178532';

function parseDurationToMs(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return null;

    const m = raw.match(/^(\d+)([mhdw])$/);
    if (!m) return null;

    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;

    const unit = m[2];
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;

    if (unit === 'm') return n * minute;
    if (unit === 'h') return n * hour;
    if (unit === 'd') return n * day;
    if (unit === 'w') return n * week;
    return null;
}

async function ensureJailOverwrites(guild, jailedRole, jailChannel, reason) {
    const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    const canManageChannels = Boolean(me?.permissions?.has(PermissionFlagsBits.ManageChannels));
    if (!canManageChannels) {
        return { ok: false, error: 'I need the Manage Channels permission to configure jail channel visibility.' };
    }

    const channels = guild.channels.cache;

    for (const [, ch] of channels) {
        if (!ch || typeof ch.permissionOverwrites?.edit !== 'function') continue;
        if (jailChannel && ch.id === jailChannel.id) continue;

        try {
            await ch.permissionOverwrites.edit(
                jailedRole,
                { ViewChannel: false },
                { reason }
            );
        } catch (_) {
            // best-effort
        }
    }

    if (jailChannel && typeof jailChannel.permissionOverwrites?.edit === 'function') {
        try {
            await jailChannel.permissionOverwrites.edit(
                jailedRole,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                },
                { reason }
            );
        } catch (e) {
            return { ok: false, error: 'Failed to configure jail channel permissions. Please check my permissions and channel settings.' };
        }
    }

    return { ok: true };
}

async function jailMember({ guild, invokerTag, targetMember, durationMs }) {
    const jailedRole = guild.roles.cache.get(JAILED_ROLE_ID) || (await guild.roles.fetch(JAILED_ROLE_ID).catch(() => null));
    if (!jailedRole) {
        return { ok: false, error: 'Jailed role was not found. Please verify the jailed role ID is correct.' };
    }

    const jailChannel = guild.channels.cache.get(JAIL_CHANNEL_ID) || (await guild.channels.fetch(JAIL_CHANNEL_ID).catch(() => null));
    if (!jailChannel) {
        return { ok: false, error: 'Jail channel was not found. Please verify the jail channel ID is correct.' };
    }

    const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
        return { ok: false, error: 'I need the Manage Roles permission to jail members.' };
    }

    if ((me.roles.highest?.position ?? 0) <= (jailedRole.position ?? 0)) {
        return { ok: false, error: 'My highest role must be higher than the jailed role.' };
    }

    if ((me.roles.highest?.position ?? 0) <= (targetMember.roles.highest?.position ?? 0)) {
        return { ok: false, error: 'My highest role must be higher than the target member’s highest role.' };
    }

    const existingActive = await JailRecord.findOne({ guildId: guild.id, userId: targetMember.id, active: true }).lean();

    const currentRoleIds = targetMember.roles.cache
        .filter(r => r && r.id !== guild.id && r.id !== jailedRole.id)
        .map(r => r.id);

    const roleIdsToStore = (existingActive?.roles?.length ? existingActive.roles : currentRoleIds);

    const now = new Date();
    const releaseAt = durationMs ? new Date(Date.now() + durationMs) : null;

    const record = await JailRecord.findOneAndUpdate(
        { guildId: guild.id, userId: targetMember.id, active: true },
        {
            $set: {
                roles: roleIdsToStore,
                jailedAt: now,
                releaseAt,
                active: true,
            },
        },
        { new: true, upsert: true }
    );

    const permRes = await ensureJailOverwrites(
        guild,
        jailedRole,
        jailChannel,
        `Jail system configured by ${invokerTag}`
    );

    if (!permRes.ok) {
        return { ok: false, error: permRes.error };
    }

    try {
        await targetMember.roles.set([jailedRole.id], `Jailed by ${invokerTag}`);
    } catch (e) {
        return { ok: false, error: 'Failed to apply jail role changes. Please check role hierarchy and permissions.' };
    }

    return { ok: true, record, jailedRole, jailChannel };
}

async function unjailMember({ guild, invokerTag, targetMember, markInactive = true }) {
    const jailedRole = guild.roles.cache.get(JAILED_ROLE_ID) || (await guild.roles.fetch(JAILED_ROLE_ID).catch(() => null));
    if (!jailedRole) {
        return { ok: false, error: 'Jailed role was not found. Please verify the jailed role ID is correct.' };
    }

    const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
        return { ok: false, error: 'I need the Manage Roles permission to unjail members.' };
    }

    if ((me.roles.highest?.position ?? 0) <= (jailedRole.position ?? 0)) {
        return { ok: false, error: 'My highest role must be higher than the jailed role.' };
    }

    if ((me.roles.highest?.position ?? 0) <= (targetMember.roles.highest?.position ?? 0)) {
        return { ok: false, error: 'My highest role must be higher than the target member’s highest role.' };
    }

    const record = await JailRecord.findOne({ guildId: guild.id, userId: targetMember.id, active: true });

    const rolesToRestore = (record?.roles || [])
        .map(id => guild.roles.cache.get(id))
        .filter(r => r && r.id !== guild.id && !r.managed)
        .filter(r => (me.roles.highest?.position ?? 0) > (r.position ?? 0));

    try {
        if (targetMember.roles.cache.has(jailedRole.id)) {
            await targetMember.roles.remove(jailedRole.id, `Unjailed by ${invokerTag}`);
        }

        if (rolesToRestore.length) {
            await targetMember.roles.add(rolesToRestore, `Restoring roles after jail by ${invokerTag}`);
        }
    } catch (e) {
        return { ok: false, error: 'Failed to restore roles. Please check role hierarchy and permissions.' };
    }

    if (markInactive && record) {
        await JailRecord.updateOne(
            { _id: record._id },
            { $set: { active: false } }
        ).catch(() => {});
    }

    return { ok: true, record, restoredRoles: rolesToRestore.map(r => r.id) };
}

async function runJailSchedulerTick(client) {
    const now = new Date();

    const due = await JailRecord.find({
        active: true,
        releaseAt: { $ne: null, $lte: now },
    })
        .limit(25)
        .lean();

    if (!due.length) return;

    for (const rec of due) {
        const guild = client.guilds.cache.get(rec.guildId) || (await client.guilds.fetch(rec.guildId).catch(() => null));
        if (!guild) {
            await JailRecord.updateOne({ _id: rec._id }, { $set: { active: false } }).catch(() => {});
            continue;
        }

        const member = await guild.members.fetch(rec.userId).catch(() => null);
        if (!member) {
            await JailRecord.updateOne({ _id: rec._id }, { $set: { active: false } }).catch(() => {});
            continue;
        }

        const res = await unjailMember({ guild, invokerTag: 'Jail Scheduler', targetMember: member, markInactive: true });
        if (!res.ok) {
            // keep active so it retries later
            continue;
        }
    }
}

module.exports = {
    JAIL_CHANNEL_ID,
    JAILED_ROLE_ID,
    parseDurationToMs,
    jailMember,
    unjailMember,
    runJailSchedulerTick,
};
