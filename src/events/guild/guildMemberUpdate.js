const { EmbedBuilder } = require('discord.js');
const { PermissionFlagsBits } = require('discord.js');
const NicknameLock = require('../../models/NicknameLock');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember, client) {
        try {
            if (!oldMember || !newMember) return;
            if (!newMember.guild) return;
            if (oldMember.nickname === newMember.nickname) return;

            const lock = await NicknameLock.findOne({ guildId: newMember.guild.id, userId: newMember.id, locked: true }).catch(() => null);
            if (!lock) return;

            const isGuildOwner = newMember.guild.ownerId && newMember.id === newMember.guild.ownerId;
            const isBotOwner = client?.config?.ownerId && newMember.id === client.config.ownerId;
            const canManageNicks = Boolean(newMember.permissions?.has?.(PermissionFlagsBits.ManageNicknames));

            if (isGuildOwner || isBotOwner || canManageNicks) return;

            const desiredNick = lock.nickname ?? null;
            if ((newMember.nickname ?? null) === (desiredNick ?? null)) return;

            await newMember.setNickname(desiredNick, 'NicknameLock enforcement').catch(() => null);

            const logChannel = await getGuildLogChannel(newMember.guild, 'security').catch(() => null);
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
        } catch (e) {
            // ignore enforcement errors
        }
    }
};
