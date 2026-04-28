const { PermissionFlagsBits } = require('discord.js');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';
const { canActOnTarget } = require('../../utils/moderationHierarchy');
const { unjailMember } = require('../../services/jailService');

module.exports = {
    name: 'unjail',
    async execute(message, client, args) {
        if (!message.guild) return;

        if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(`${ERROR_EMOJI} **You need the Manage Roles permission to use this command.**`);
        }

        const targetMember = message.mentions.members.first() || (args?.[0] ? await message.guild.members.fetch(String(args[0]).replace(/\D/g, '')).catch(() => null) : null);
        if (!targetMember) {
            return message.reply(`${ERROR_EMOJI} **Usage: .unjail @user**`);
        }

        const hierarchy = canActOnTarget({ guild: message.guild, invokerMember: message.member, targetMember });
        if (!hierarchy.ok) {
            return message.reply(`${ERROR_EMOJI} **You cannot unjail this user due to role hierarchy.**`);
        }

        try {
            const res = await unjailMember({
                guild: message.guild,
                invokerTag: message.author.tag,
                targetMember,
                markInactive: true,
            });

            if (!res.ok) {
                return message.reply(`${ERROR_EMOJI} **${res.error}**`);
            }

            return message.reply(`${DONE_EMOJI} **${targetMember.user.tag} has been unjailed and their roles have been restored (best-effort).**`);
        } catch (e) {
            return message.reply(`${ERROR_EMOJI} **An error occurred while unjailing this user.**`);
        }
    }
};
