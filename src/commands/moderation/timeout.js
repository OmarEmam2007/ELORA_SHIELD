const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const { buildAssetAttachment } = require('../../utils/responseAssets');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';

module.exports = {
    name: 'timeout',
    aliases: ['time', 'timeout'],
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Temporarily silences a user using Lunar stasis.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option => option.setName('target').setDescription('The user to timeout').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for the silence')),

    async execute(interaction, client, args) {
        // --- 1. Hybrid Input ---
        const isSlash = interaction.isChatInputCommand?.();
        const user = isSlash ? interaction.user : interaction.author;

        // Signature check
        let mainMsg = interaction;
        let bot = client;
        let commandArgs = args;

        if (interaction.isChatInputCommand === undefined && client instanceof Array) {
            mainMsg = interaction;
            commandArgs = client;
            bot = args;
        }

        let targetUser, duration, reason;

        if (isSlash) {
            targetUser = interaction.options.getUser('target');
            duration = interaction.options.getInteger('duration');
            reason = interaction.options.getString('reason') || 'Temporal Stasis Protocol';
        } else {
            // Prefix: .time @User [Minutes] [Reason]
            const targetId = commandArgs[0]?.replace(/[<@!>]/g, '');
            if (!targetId || !commandArgs[1]) {
                return interaction.channel.send(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴛɪᴍᴇ @ᴜꜱᴇʀ [ᴍɪɴᴜᴛᴇꜱ] [ʀᴇᴀꜱᴏɴ]**`);
            }
            try {
                targetUser = await bot.users.fetch(targetId);
            } catch (error) {
                return interaction.channel.send(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɴᴏᴛ ꜰᴏᴜɴᴅ.**`);
            }

            duration = parseInt(commandArgs[1]);
            if (isNaN(duration)) return interaction.channel.send(`${ERROR_EMOJI} **ɪɴᴠᴀʟɪᴅ ᴅᴜʀᴀᴛɪᴏɴ.**`);
            reason = commandArgs.slice(2).join(' ') || 'Temporal Stasis Protocol';
        }

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.channel.send(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɪꜱ ɴᴏᴛ ɪɴ ᴛʜɪꜱ ꜱᴇʀᴠᴇʀ.**`);
        }

        const SPECIAL_EXECUTOR_ID = '1380794290350981130';
        const SPECIAL_TARGET_ID = '1258440001616744542';
        if (user?.id === SPECIAL_EXECUTOR_ID && targetUser?.id === SPECIAL_TARGET_ID) {
            return interaction.reply({ content: "AhMeD_kErA has complete control now, i can't kick him." });
        }

        if (!member.moderatable) {
            if (isSlash) {
                const err = new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('⛔ Cannot timeout this user (higher role / missing permissions).');
                const badAsset = buildAssetAttachment('wrong');
                if (badAsset?.url) err.setImage(badAsset.url);
                return interaction.reply({ embeds: [err], files: badAsset?.attachment ? [badAsset.attachment] : [], ephemeral: true });
            }
            return interaction.channel.send(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴛɪᴍᴇᴏᴜᴛ ᴛʜɪꜱ ᴜꜱᴇʀ.**`);
        }

        // --- 2. Animation (slash only) ---
        const frames = [
            '🧊 Initializing Stasis Field...',
            '⏳ Warping Timeline...',
            '🔇 Applying Silence...',
            '🧊 Stasis Complete.'
        ];

        const loadingAsset = buildAssetAttachment('loading');
        if (isSlash) {
            const initEmbed = new EmbedBuilder().setColor(THEME.COLORS.ACCENT).setDescription(`${frames[0]}`);
            if (loadingAsset?.url) initEmbed.setImage(loadingAsset.url);
            await interaction.reply({ embeds: [initEmbed], files: loadingAsset?.attachment ? [loadingAsset.attachment] : [] });

            for (let i = 1; i < frames.length; i++) {
                await new Promise(r => setTimeout(r, 600));
                const embed = new EmbedBuilder().setColor(THEME.COLORS.ACCENT).setDescription(`${frames[i]}`);
                if (loadingAsset?.url) embed.setImage(loadingAsset.url);
                await interaction.editReply({ embeds: [embed] });
            }
        }

        // --- 3. Execute ---
        try {
            await member.timeout(duration * 60 * 1000, reason);

            // DM (prefix must never send embeds)
            if (isSlash) {
                const dmEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.WARNING)
                    .setTitle(`🔇 Silenced in ${interaction.guild.name}`)
                    .setDescription(`You remain in stasis for **${duration} minutes**.\nReason: ${reason}`)
                    .setTimestamp();
                await targetUser.send({ embeds: [dmEmbed] }).catch(() => { });
            } else {
                await targetUser.send(
                    `${DONE_EMOJI} **ʏᴏᴜ ʜᴀᴠᴇ ʙᴇᴇɴ ᴛɪᴍᴇᴅ ᴏᴜᴛ ɪɴ ${String(interaction.guild.name || '').toUpperCase()}.**\n` +
                    `${DONE_EMOJI} **ᴅᴜʀᴀᴛɪᴏɴ: ${duration} ᴍɪɴᴜᴛᴇꜱ**\n` +
                    `${DONE_EMOJI} **ʀᴇᴀꜱᴏɴ: ${reason}**`
                ).catch(() => { });
            }

            const successEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.ACCENT)
                .setAuthor({ 
                    name: '🔇 STASIS ACTIVE', 
                    iconURL: targetUser.displayAvatarURL({ dynamic: true }) 
                })
                .setDescription(
                    `**Target:** ${targetUser.tag}\n` +
                    `**Duration:** ${duration} minutes\n` +
                    `**Reason:** ${reason}\n` +
                    `**Moderator:** ${user}`
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            const okAsset = buildAssetAttachment(duration >= 60 ? 'diamond' : 'ok');
            if (okAsset?.url) successEmbed.setImage(okAsset.url);

            if (isSlash) {
                await interaction.editReply({ embeds: [successEmbed], files: okAsset?.attachment ? [okAsset.attachment] : [] });
            } else {
                await interaction.channel.send(`${DONE_EMOJI} **ᴅᴏɴᴇ, ᴛʜᴇ ᴜꜱᴇʀ ʜᴀꜱ ʙᴇᴇɴ ᴛɪᴍᴇᴅ ᴏᴜᴛ.**`);
            }

        } catch (error) {
            console.error(error);
            if (isSlash) {
                const err = new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('❌ Stasis field collapse (Error).');
                const badAsset = buildAssetAttachment('wrong');
                if (badAsset?.url) err.setImage(badAsset.url);
                await interaction.editReply({ embeds: [err], files: badAsset?.attachment ? [badAsset.attachment] : [] });
            } else {
                await interaction.channel.send(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`);
            }
        }
    },
};
