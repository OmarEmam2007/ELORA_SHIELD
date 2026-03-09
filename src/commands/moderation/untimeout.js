const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const { buildAssetAttachment } = require('../../utils/responseAssets');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';

module.exports = {
    name: 'untimeout',
    aliases: ['untimeout', 'un-timeout'],
    data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove timeout from a user.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option => option.setName('target').setDescription('The user to remove timeout from').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason (optional)')),

    async execute(interaction, client, args) {
        const isSlash = interaction.isChatInputCommand?.();
        const user = isSlash ? interaction.user : interaction.author;

        const memberInvoker = interaction.member;
        const hasModerateMembers = Boolean(memberInvoker?.permissions?.has?.(PermissionFlagsBits.ModerateMembers));
        if (!hasModerateMembers) {
            if (isSlash) {
                return interaction.reply({ content: '❌ You need **Moderate Members** permission to use this command.', ephemeral: true }).catch(() => null);
            }
            return interaction.reply(`${ERROR_EMOJI} **You need Moderate Members permission to use this command.**`).catch(() => null);
        }

        // Signature check
        let mainMsg = interaction;
        let bot = client;
        let commandArgs = args;

        if (interaction.isChatInputCommand === undefined && client instanceof Array) {
            mainMsg = interaction;
            commandArgs = client;
            bot = args;
        }

        let targetUser, reason;

        if (isSlash) {
            targetUser = interaction.options.getUser('target');
            reason = interaction.options.getString('reason') || 'Timeout removed';
        } else {
            const targetId = commandArgs[0]?.replace(/[<@!>]/g, '');
            if (!targetId) {
                return mainMsg.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴜɴᴛɪᴍᴇᴏᴜᴛ @ᴜꜱᴇʀ [ʀᴇᴀꜱᴏɴ]**`);
            }
            try {
                targetUser = await bot.users.fetch(targetId);
            } catch (e) {
                return mainMsg.reply(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɴᴏᴛ ꜰᴏᴜɴᴅ.**`);
            }
            reason = commandArgs.slice(1).join(' ') || 'Timeout removed';
        }

        const member = await mainMsg.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            if (isSlash) {
                return interaction.reply({ content: '❌ User is not in this server.', ephemeral: true }).catch(() => null);
            }
            return mainMsg.reply(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɪꜱ ɴᴏᴛ ɪɴ ᴛʜɪꜱ ꜱᴇʀᴠᴇʀ.**`);
        }

        if (!member.moderatable) {
            if (isSlash) {
                const err = new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('⛔ Cannot remove timeout from this user (higher role / missing permissions).');
                const badAsset = buildAssetAttachment('wrong');
                if (badAsset?.url) err.setImage(badAsset.url);
                return interaction.reply({ embeds: [err], files: badAsset?.attachment ? [badAsset.attachment] : [], ephemeral: true });
            }
            return mainMsg.reply(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴜɴᴛɪᴍᴇᴏᴜᴛ ᴛʜɪꜱ ᴜꜱᴇʀ.**`);
        }

        try {
            await member.timeout(null, reason);

            if (isSlash) {
                const ok = new EmbedBuilder()
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(`✅ Timeout removed for **${targetUser.tag}**\nReason: ${reason}`)
                    .setTimestamp();

                const okAsset = buildAssetAttachment('ok');
                if (okAsset?.url) ok.setImage(okAsset.url);

                return interaction.reply({ embeds: [ok], files: okAsset?.attachment ? [okAsset.attachment] : [], ephemeral: true });
            }

            return mainMsg.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ${targetUser} ʜᴀꜱ ʙᴇᴇɴ ᴜɴᴛɪᴍᴇᴅ ᴏᴜᴛ.**`);
        } catch (e) {
            console.error('[UNTIMEOUT] error:', e);
            if (isSlash) {
                return interaction.reply({ content: '❌ Failed to remove timeout.', ephemeral: true }).catch(() => null);
            }
            return mainMsg.reply(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`).catch(() => null);
        }
    },
};
