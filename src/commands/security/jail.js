const { PermissionFlagsBits } = require('discord.js');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';
const { canActOnTarget } = require('../../utils/moderationHierarchy');
const { parseDurationToMs, jailMember } = require('../../services/jailService');

module.exports = {
    name: 'jail',
    async execute(message, client, args) {
        if (!message.guild) return;

        if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(`${ERROR_EMOJI} **You need the Manage Roles permission to use this command.**`);
        }

        const targetMember = message.mentions.members.first() || (args?.[0] ? await message.guild.members.fetch(String(args[0]).replace(/\D/g, '')).catch(() => null) : null);
        if (!targetMember) {
            return message.reply(`${ERROR_EMOJI} **Usage: .jail @user <duration>**`);
        }

        const hierarchy = canActOnTarget({ guild: message.guild, invokerMember: message.member, targetMember });
        if (!hierarchy.ok) {
            return message.reply(`${ERROR_EMOJI} **You cannot jail this user due to role hierarchy.**`);
        }

        const durationToken = args?.[1] ? String(args[1]).trim() : '';
        const durationMs = durationToken ? parseDurationToMs(durationToken) : null;
        if (durationToken && !durationMs) {
            return message.reply(`${ERROR_EMOJI} **Invalid duration. Examples: 30m, 2h, 1d, 1w.**`);
        }

        try {
            const res = await jailMember({
                guild: message.guild,
                invokerTag: message.author.tag,
                targetMember,
                durationMs,
            });

            if (!res.ok) {
                return message.reply(`${ERROR_EMOJI} **${res.error}**`);
            }

            if (res.record?.releaseAt) {
                const ts = Math.floor(new Date(res.record.releaseAt).getTime() / 1000);
                return message.reply(`${DONE_EMOJI} **${targetMember.user.tag} has been jailed until <t:${ts}:F>.**`);
            }

            return message.reply(`${DONE_EMOJI} **${targetMember.user.tag} has been jailed permanently (until manually unjailed).**`);
        } catch (e) {
            return message.reply(`${ERROR_EMOJI} **An error occurred while jailing this user.**`);
        }
    }
};
