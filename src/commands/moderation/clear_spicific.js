const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const { buildAssetAttachment } = require('../../utils/responseAssets');

module.exports = {
    name: 'clear_spicific',
    aliases: ['clear_spicific'],
    data: new SlashCommandBuilder()
        .setName('clear_spicific')
        .setDescription('Deletes ALL messages in this channel that contain the provided word (exact match).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('word')
                .setDescription('The exact word to search for (case sensitive)')
                .setRequired(true)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        const member = interaction.member;
        const hasManageMessages = Boolean(member?.permissions?.has?.(PermissionFlagsBits.ManageMessages));
        if (!hasManageMessages) {
            return interaction.reply({ content: '❌ You need **Manage Messages** permission to use this command.', ephemeral: true }).catch(() => null);
        }

        if (!interaction.guild || !interaction.channel) {
            return interaction.reply({ content: '❌ This command can only be used in a server channel.', ephemeral: true }).catch(() => null);
        }

        const word = interaction.options.getString('word');
        if (!word || !word.length) {
            return interaction.reply({ content: '❌ Missing word.', ephemeral: true }).catch(() => null);
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        const channel = interaction.channel;
        let totalDeleted = 0;
        let scanned = 0;
        let lastId = null;
        const maxScan = 5000; // safety cap

        try {
            while (scanned < maxScan) {
                const fetchOptions = { limit: 100 };
                if (lastId) fetchOptions.before = lastId;

                const messages = await channel.messages.fetch(fetchOptions);
                if (!messages || messages.size === 0) break;

                scanned += messages.size;
                lastId = messages.last().id;

                // EXACT / literal / case-sensitive substring match
                const matched = messages.filter(m => !m.author?.bot && String(m.content || '').includes(word));

                if (matched.size) {
                    // bulkDelete can only delete messages < 14 days, and max 100 at a time
                    const deleted = await channel.bulkDelete(matched, true).catch(() => null);
                    totalDeleted += deleted?.size || 0;
                }

                // Avoid rate limits a bit
                await new Promise(r => setTimeout(r, 1100));
            }

            const successEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.SUCCESS)
                .setDescription(`✅ Deleted **${totalDeleted}** messages containing: \`${word}\``)
                .setTimestamp();

            const okAsset = buildAssetAttachment('ok');
            if (okAsset?.url) successEmbed.setImage(okAsset.url);

            return interaction.editReply({ embeds: [successEmbed], files: okAsset?.attachment ? [okAsset.attachment] : [] });
        } catch (error) {
            console.error('[CLEAR_SPICIFIC] error:', error);

            const err = new EmbedBuilder()
                .setColor(THEME.COLORS.ERROR)
                .setDescription('❌ Failed to clear messages. (Possible rate limit / missing permissions / messages too old)');

            const badAsset = buildAssetAttachment('wrong');
            if (badAsset?.url) err.setImage(badAsset.url);

            return interaction.editReply({ embeds: [err], files: badAsset?.attachment ? [badAsset.attachment] : [] }).catch(() => null);
        }
    },
};
