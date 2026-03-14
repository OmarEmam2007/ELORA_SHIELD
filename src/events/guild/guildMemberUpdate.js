const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const NicknameLock = require('../../models/NicknameLock');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const { CHANNELS } = require('../../utils/logConfig');
const THEME = require('../../utils/theme');

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember, client) {
        try {
            if (!oldMember || !newMember) return;
            const guild = newMember.guild;
            if (!guild) return;

            // --- Nickname Changes Log ---
            const oldNick = oldMember.nickname || oldMember.user.username;
            const newNick = newMember.nickname || newMember.user.username;

            if (oldNick !== newNick) {
                const nickLogChannel = await guild.channels.fetch(CHANNELS.NICKNAME).catch(() => null);
                if (nickLogChannel && nickLogChannel.isTextBased()) {
                    let executor = null;
                    try {
                        const me = guild.members.me;
                        if (me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
                            const auditLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberUpdate });
                            const entry = auditLogs.entries.find(e => 
                                e.target.id === newMember.id && 
                                e.changes.some(c => c.key === 'nick') &&
                                (Date.now() - e.createdTimestamp < 10000)
                            );
                            if (entry) executor = entry.executor;
                        }
                    } catch (e) {
                        console.error('Audit log fetch error (nickname):', e);
                    }

                    const embed = THEME.makeEmbed(EmbedBuilder, 'ACCENT')
                        .setTitle('📝 Nickname Changed')
                        .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) })
                        .addFields(
                            { name: 'User', value: `${newMember.user} (\`${newMember.id}\`)`, inline: true },
                            { name: 'Changed By', value: executor ? `${executor} (\`${executor.id}\`)` : (executor === null ? 'Self' : 'Unknown'), inline: true },
                            { name: 'Old Nickname', value: `\`${oldNick}\``, inline: true },
                            { name: 'New Nickname', value: `\`${newNick}\``, inline: true }
                        )
                        .setTimestamp();

                    await nickLogChannel.send({ embeds: [embed] }).catch(err => console.error('Failed to send nickname log:', err));
                }

                // Existing Nickname Lock enforcement logic
                const lock = await NicknameLock.findOne({ guildId: guild.id, userId: newMember.id, locked: true }).catch(() => null);
                if (lock) {
                    const isGuildOwner = guild.ownerId && newMember.id === guild.ownerId;
                    const isBotOwner = client?.config?.ownerId && newMember.id === client.config.ownerId;
                    const canManageNicks = Boolean(newMember.permissions?.has?.(PermissionFlagsBits.ManageNicknames));

                    if (!isGuildOwner && !isBotOwner && !canManageNicks) {
                        const desiredNick = lock.nickname ?? null;
                        if ((newMember.nickname ?? null) !== (desiredNick ?? null)) {
                            await newMember.setNickname(desiredNick, 'NicknameLock enforcement').catch(() => null);
                            const logChannel = await getGuildLogChannel(guild, 'security').catch(() => null);
                            if (logChannel) {
                                const embed = new EmbedBuilder()
                                    .setColor('#ff0000')
                                    .setTitle('🔒 Nickname Lock Enforced')
                                    .setDescription(`Blocked **${newMember.user.tag}** from changing their nickname.`)
                                    .addFields(
                                        { name: 'Locked Nickname', value: `${desiredNick ?? 'None'}`, inline: true },
                                        { name: 'Attempted Nickname', value: `${newMember.nickname ?? 'None'}`, inline: true }
                                    )
                                    .setTimestamp();
                                await logChannel.send({ embeds: [embed] }).catch(() => null);
                            }
                        }
                    }
                }
            }

            // --- Roles Changes Log ---
            const oldRoles = oldMember.roles.cache;
            const newRoles = newMember.roles.cache;

            if (oldRoles.size !== newRoles.size) {
                const rolesLogChannel = await guild.channels.fetch(CHANNELS.ROLES).catch(() => null);
                if (rolesLogChannel && rolesLogChannel.isTextBased()) {
                    const addedRoles = newRoles.filter(r => !oldRoles.has(r.id));
                    const removedRoles = oldRoles.filter(r => !newRoles.has(r.id));

                    if (addedRoles.size > 0 || removedRoles.size > 0) {
                        let executor = null;
                        try {
                            if (guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
                                const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberRoleUpdate });
                                const entry = auditLogs.entries.first();
                                if (entry && entry.target.id === newMember.id) {
                                    executor = entry.executor;
                                }
                            }
                        } catch (e) {}

                        const embed = THEME.makeEmbed(EmbedBuilder, 'INFO')
                            .setTitle('🛡️ Roles Updated')
                            .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) })
                            .addFields(
                                { name: 'User', value: `${newMember.user} (\`${newMember.id}\`)`, inline: true },
                                { name: 'Updated By', value: executor ? `${executor} (\`${executor.id}\`)` : 'Unknown', inline: true }
                            );

                        if (addedRoles.size > 0) {
                            embed.addFields({ name: 'Added Roles', value: addedRoles.map(r => `${r}`).join(', '), inline: false });
                        }
                        if (removedRoles.size > 0) {
                            embed.addFields({ name: 'Removed Roles', value: removedRoles.map(r => `${r}`).join(', '), inline: false });
                        }

                        embed.setTimestamp();
                        await rolesLogChannel.send({ embeds: [embed] }).catch(() => null);
                    }
                }
            }
        } catch (e) {
            console.error('Error in guildMemberUpdate log:', e);
        }
    }
};
