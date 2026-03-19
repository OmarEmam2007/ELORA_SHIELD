const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const { buildAssetAttachment } = require('../../utils/responseAssets');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';

module.exports = {
    name: 'unban',
    aliases: ['unban', 'فك_بان', 'un-ban'],
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unbans a user from the server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('The user ID to unban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason (optional)')),

    async execute(interaction, client, args) {
        const isSlash = interaction.isChatInputCommand?.();
        const user = isSlash ? interaction.user : interaction.author;

        const memberInvoker = interaction.member;
        const hasBanMembers = Boolean(memberInvoker?.permissions?.has?.(PermissionFlagsBits.BanMembers));
        if (!hasBanMembers) {
            if (isSlash) {
                return interaction.reply({ content: '❌ You need **Ban Members** permission to use this command.', ephemeral: true }).catch(() => null);
            }
            return interaction.reply(`${ERROR_EMOJI} **You need Ban Members permission to use this command.**`).catch(() => null);
        }

        let mainMsg = interaction;
        let bot = client;
        let commandArgs = args;

        if (interaction.isChatInputCommand === undefined && client instanceof Array) {
            mainMsg = interaction;
            commandArgs = client;
            bot = args;
        }

        let targetId;
        let reason;

        if (isSlash) {
            targetId = interaction.options.getString('userid')?.trim();
            reason = interaction.options.getString('reason') || `Unbanned by ${user?.tag || user?.username || 'moderator'}`;
        } else {
            targetId = String(commandArgs[0] || '').replace(/[<@!>]/g, '').trim();
            if (!targetId) {
                return mainMsg.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴜɴʙᴀɴ <ᴜꜱᴇʀɪᴅ>**`);
            }
            reason = commandArgs.slice(1).join(' ') || `Unbanned by ${mainMsg.author?.tag || 'moderator'}`;
        }

        if (!/^\d{15,25}$/.test(String(targetId || ''))) {
            if (isSlash) {
                return interaction.reply({ content: '❌ Invalid user id.', ephemeral: true }).catch(() => null);
            }
            return mainMsg.reply(`${ERROR_EMOJI} **ɪɴᴠᴀʟɪᴅ ᴜꜱᴇʀ ɪᴅ.**`);
        }

        try {
            const bans = await mainMsg.guild.bans.fetch().catch(() => null);
            const isBanned = Boolean(bans?.has?.(targetId));
            if (!isBanned) {
                if (isSlash) {
                    return interaction.reply({ content: 'ℹ️ This user is not banned.', ephemeral: true }).catch(() => null);
                }
                return mainMsg.reply(`${ERROR_EMOJI} **ᴛʜɪꜱ ᴜꜱᴇʀ ɪꜱ ɴᴏᴛ ʙᴀɴɴᴇᴅ.**`);
            }

            await mainMsg.guild.members.unban(targetId, reason);

            if (isSlash) {
                const ok = new EmbedBuilder()
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(`✅ Unbanned: \`${targetId}\`\nReason: ${reason}`)
                    .setTimestamp();

                const okAsset = buildAssetAttachment('ok');
                if (okAsset?.url) ok.setImage(okAsset.url);

                return interaction.reply({ embeds: [ok], files: okAsset?.attachment ? [okAsset.attachment] : [], ephemeral: true });
            }

            return mainMsg.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, \`${targetId}\` ʜᴀꜱ ʙᴇᴇɴ ᴜɴʙᴀɴɴᴇᴅ.**`);
        } catch (e) {
            console.error('[UNBAN] error:', e);
            if (isSlash) {
                const err = new EmbedBuilder()
                    .setColor(THEME.COLORS.ERROR)
                    .setDescription('❌ Failed to unban user.');

                const badAsset = buildAssetAttachment('wrong');
                if (badAsset?.url) err.setImage(badAsset.url);

                return interaction.reply({ embeds: [err], files: badAsset?.attachment ? [badAsset.attachment] : [], ephemeral: true }).catch(() => null);
            }
            return mainMsg.reply(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`).catch(() => null);
        }
    },
};
