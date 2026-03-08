const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const { buildAssetAttachment } = require('../../utils/responseAssets');

const DONE_EMOJI = '<a:10:1430395692299456704>';
const ERROR_EMOJI = '<a:false:1433339552876990465>';

module.exports = {
    name: 'ban',
    aliases: ['ban', 'اديهولوا', 'شد', 'ببتاعي'],
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a user from the server with Lunar authority.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(option => option.setName('target').setDescription('The user to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for the ban'))
        .addBooleanOption(option => option.setName('delete_messages').setDescription('Delete messages from last 7 days?')),

    async execute(interaction, client, args) {
        // --- 1. Hybrid Input Handling ---
        const isSlash = interaction.isChatInputCommand?.();
        const user = isSlash ? interaction.user : interaction.author;

        // Signature check: if interaction is the client, we were called as execute(message, client, args)
        let mainMsg = interaction;
        let bot = client;
        let commandArgs = args;

        if (interaction.isChatInputCommand === undefined && client instanceof Array) {
            // We are in execute(message, args, client)
            mainMsg = interaction;
            commandArgs = client;
            bot = args;
        }

        let targetUser, reason, deleteMsgs;

        if (isSlash) {
            targetUser = interaction.options.getUser('target');
            reason = interaction.options.getString('reason') || 'Violation of Lunar Protocols';
            deleteMsgs = interaction.options.getBoolean('delete_messages') || false;
        } else {
            // Prefix: .ban @User [Reason]
            const targetId = commandArgs[0]?.replace(/[<@!>]/g, '');
            if (!targetId) {
                return interaction.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ʙᴀɴ @ᴜꜱᴇʀ [ʀᴇᴀꜱᴏɴ]**`);
            }

            try {
                targetUser = await bot.users.fetch(targetId);
            } catch (e) {
                return interaction.reply(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɴᴏᴛ ꜰᴏᴜɴᴅ.**`);
            }

            reason = commandArgs.slice(1).join(' ') || 'Violation of Lunar Protocols';
            deleteMsgs = false;
        }

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (member) {
            if (!member.bannable) {
                if (isSlash) {
                    const err = new EmbedBuilder()
                        .setColor(THEME.COLORS.ERROR)
                        .setAuthor({ name: 'Access Denied', iconURL: THEME.ICONS.CROSS })
                        .setDescription(`**Target Shielded:** I cannot ban **${targetUser.tag}** (Higher or Equal Clearance).`)
                        .setFooter(THEME.FOOTER);
                    const badAsset = buildAssetAttachment('wrong');
                    if (badAsset?.url) err.setImage(badAsset.url);
                    return interaction.reply({ embeds: [err], files: badAsset?.attachment ? [badAsset.attachment] : [], ephemeral: true });
                }
                return interaction.reply(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ʙᴀɴ ᴛʜɪꜱ ᴜꜱᴇʀ.**`);
            }
        }

        // --- 2. Pseudo-Animation (slash only) ---
        let responseMsg;
        const frames = THEME.ANIMATIONS.EXECUTING_BAN;
        const loadingAsset = buildAssetAttachment('loading');
        if (isSlash) {
            const initialEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.WARNING)
                .setDescription(`${frames[0]}`);
            if (loadingAsset?.url) initialEmbed.setImage(loadingAsset.url);
            await interaction.reply({ embeds: [initialEmbed], files: loadingAsset?.attachment ? [loadingAsset.attachment] : [] });
            responseMsg = interaction;

            for (let i = 1; i < frames.length; i++) {
                await new Promise(r => setTimeout(r, 800));
                const updateEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.WARNING)
                    .setDescription(`${frames[i]}`);
                if (loadingAsset?.url) updateEmbed.setImage(loadingAsset.url);
                await interaction.editReply({ embeds: [updateEmbed] });
            }
        }

        // --- 3. Execution ---
        try {
            // DM (prefix must never send embeds)
            if (isSlash) {
                const dmEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.ERROR)
                    .setThumbnail(THEME.ICONS.MOON_FULL)
                    .setTitle(`💥 Ejected from ${interaction.guild.name}`)
                    .setDescription(`You have been exiled to the dark side of the moon.\n\n**Reason:** ${reason}`)
                    .setTimestamp();
                await targetUser.send({ embeds: [dmEmbed] }).catch(() => { });
            } else {
                await targetUser.send(
                    `${DONE_EMOJI} **ʏᴏᴜ ʜᴀᴠᴇ ʙᴇᴇɴ ʙᴀɴɴᴇᴅ ꜰʀᴏᴍ ${String(interaction.guild.name || '').toUpperCase()}.**\n` +
                    `${DONE_EMOJI} **ʀᴇᴀꜱᴏɴ: ${reason}**`
                ).catch(() => { });
            }

            await interaction.guild.members.ban(targetUser, {
                reason: reason,
                deleteMessageSeconds: deleteMsgs ? 7 * 24 * 60 * 60 : 0
            });

            // Success Embed
            const successEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.ACCENT) // Cyber Cyan
                .setAuthor({ 
                    name: '🌑 BAN EXECUTED', 
                    iconURL: targetUser.displayAvatarURL({ dynamic: true }) 
                })
                .setDescription(
                    `**Target:** ${targetUser.tag}\n` +
                    `**Server:** ${interaction.guild.name}\n` +
                    `**Reason:** ${reason}\n` +
                    `**Moderator:** ${user}`
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            const okAsset = buildAssetAttachment('diamond');
            if (okAsset?.url) successEmbed.setImage(okAsset.url);

            if (isSlash) {
                await interaction.editReply({ embeds: [successEmbed], files: okAsset?.attachment ? [okAsset.attachment] : [] });
            } else {
                await interaction.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ${targetUser} ʜᴀꜱ ʙᴇᴇɴ ʙᴀɴɴᴇᴅ.**`);
            }

        } catch (error) {
            console.error(error);
            if (isSlash) {
                const errEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.ERROR)
                    .setDescription('❌ **Critical Failure:** Ejection system malfunction.');

                const badAsset = buildAssetAttachment('wrong');
                if (badAsset?.url) errEmbed.setImage(badAsset.url);
                await interaction.editReply({ embeds: [errEmbed], files: badAsset?.attachment ? [badAsset.attachment] : [] });
            } else {
                await interaction.reply(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`);
            }
        }
    },
};
