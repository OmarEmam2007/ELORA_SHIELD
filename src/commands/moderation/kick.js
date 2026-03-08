const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const { buildAssetAttachment } = require('../../utils/responseAssets');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';

module.exports = {
    name: 'kick',
    aliases: ['k', 'kick', 'برا'],
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks a user from the server with Lunar authority.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(option => option.setName('target').setDescription('The user to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for the kick')),

    async execute(interaction, client, args) {
        // --- 1. Hybrid Input Handling ---
        const isSlash = interaction.isChatInputCommand?.();
        const user = isSlash ? interaction.user : interaction.author;

        // Signature check: handle both (interaction, client, args) and (message, args, client)
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
            reason = interaction.options.getString('reason') || 'Minor Infraction';
        } else {
            // Prefix: .k @User [Reason]
            const targetId = commandArgs[0]?.replace(/[<@!>]/g, '');
            if (!targetId) {
                return mainMsg.channel.send(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴋ @ᴜꜱᴇʀ [ʀᴇᴀꜱᴏɴ]**`);
            }

            try {
                targetUser = await bot.users.fetch(targetId);
            } catch (e) {
                return mainMsg.channel.send(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɴᴏᴛ ꜰᴏᴜɴᴅ.**`);
            }

            reason = commandArgs.slice(1).join(' ') || 'Minor Infraction';
        }

        const member = await mainMsg.guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) {
            return mainMsg.channel.send(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɪꜱ ɴᴏᴛ ɪɴ ᴛʜɪꜱ ꜱᴇʀᴠᴇʀ.**`);
        }

        const SPECIAL_EXECUTOR_ID = '1380794290350981130';
        const SPECIAL_TARGET_ID = '1258440001616744542';
        if (user?.id === SPECIAL_EXECUTOR_ID && targetUser?.id === SPECIAL_TARGET_ID) {
            if (isSlash) {
                return interaction.reply({ content: "AhMeD_kErA has complete control now, i can't kick him." });
            }
            return mainMsg.channel.send(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴋɪᴄᴋ ᴛʜɪꜱ ᴜꜱᴇʀ.**`);
        }

        if (!member.kickable) {
            if (isSlash) {
                const err = new EmbedBuilder()
                    .setColor(THEME.COLORS.ERROR)
                    .setDescription(`🚫 **Privilege Error:** Cannot kick **${targetUser.tag}** (Higher Rank).`);
                const badAsset = buildAssetAttachment('wrong');
                if (badAsset?.url) err.setImage(badAsset.url);
                return interaction.reply({ embeds: [err], files: badAsset?.attachment ? [badAsset.attachment] : [], ephemeral: true });
            }
            return mainMsg.channel.send(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴋɪᴄᴋ ᴛʜɪꜱ ᴜꜱᴇʀ.**`);
        }

        // --- 2. Pseudo-Animation ---
        const frames = [
            '⚠️ Initiating Removal Protocol...',
            '📉 Decreasing Social Credit...',
            '👢 Calibrating Boot...',
            '💨 Execute.'
        ];

        let responseMsg;
        if (isSlash) {
            const initialEmbed = new EmbedBuilder().setColor(THEME.COLORS.WARNING).setDescription(`${frames[0]}`);
            const loadingAsset = buildAssetAttachment('loading');
            if (loadingAsset?.url) initialEmbed.setImage(loadingAsset.url);
            await mainMsg.reply({ embeds: [initialEmbed], files: loadingAsset?.attachment ? [loadingAsset.attachment] : [] });
            responseMsg = mainMsg;

            for (let i = 1; i < frames.length; i++) {
                await new Promise(r => setTimeout(r, 700));
                const step = new EmbedBuilder().setColor(THEME.COLORS.WARNING).setDescription(`${frames[i]}`);
                if (loadingAsset?.url) step.setImage(loadingAsset.url);
                await mainMsg.editReply({ embeds: [step] });
            }
        }

        // --- 3. Execution ---
        try {
            // DM (prefix must never send embeds; slash can keep its own style)
            if (isSlash) {
                await targetUser.send(`👢 **Kicked from ${mainMsg.guild.name}**\nReason: ${reason}`).catch(() => { });
            } else {
                await targetUser.send(
                    `${DONE_EMOJI} **ʏᴏᴜ ʜᴀᴠᴇ ʙᴇᴇɴ ᴋɪᴄᴋᴇᴅ ꜰʀᴏᴍ ${String(mainMsg.guild.name || '').toUpperCase()}.**\n` +
                    `${DONE_EMOJI} **ʀᴇᴀꜱᴏɴ: ${reason}**`
                ).catch(() => { });
            }

            await member.kick(reason);

            if (isSlash) {
                const successEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.WARNING) // Yellow/Gold for Kicks
                    .setAuthor({
                        name: '👢 KICK EXECUTED',
                        iconURL: targetUser.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription(
                        `**Target:** ${targetUser.tag}\n` +
                        `**Reason:** ${reason}\n` +
                        `**Moderator:** ${user}`
                    )
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                const okAsset = buildAssetAttachment('ok');
                if (okAsset?.url) successEmbed.setImage(okAsset.url);
                await mainMsg.editReply({ embeds: [successEmbed], files: okAsset?.attachment ? [okAsset.attachment] : [] });
            } else {
                await mainMsg.channel.send(`${DONE_EMOJI} **ᴅᴏɴᴇ, ᴛʜᴇ ᴜꜱᴇʀ ʜᴀꜱ ʙᴇᴇɴ ᴋɪᴄᴋᴇᴅ.**`);
            }

        } catch (error) {
            console.error(error);
            if (isSlash) {
                const errEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.ERROR)
                    .setDescription('❌ **Error:** Kick sequence failed.');

                const badAsset = buildAssetAttachment('wrong');
                if (badAsset?.url) errEmbed.setImage(badAsset.url);
                await mainMsg.editReply({ embeds: [errEmbed], files: badAsset?.attachment ? [badAsset.attachment] : [] });
            } else {
                await mainMsg.channel.send(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`);
            }
        }
    },
};
