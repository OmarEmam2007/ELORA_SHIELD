const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const ModSettings = require('../../models/ModSettings');

const VERIFY_ROLE_ID = '1461769279195058342';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify_setup')
        .setDescription('Post the verification panel (button verification).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const hasAdministrator = Boolean(interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator));
        if (!hasAdministrator) {
            return interaction.reply({ content: '**✖ You need Administrator permission to use this command.**', ephemeral: true }).catch(() => null);
        }

        if (!interaction.inGuild?.()) {
            return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const assetPath = path.join(__dirname, '../../../assets/new banner1.png');
        const file = new AttachmentBuilder(assetPath, { name: 'new_banner1.png' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`verify_${VERIFY_ROLE_ID}`)
                .setLabel('Verify')
                .setStyle(ButtonStyle.Success)
        );

        const panelMsg = await interaction.channel.send({ files: [file], components: [row] });

        await ModSettings.findOneAndUpdate(
            { guildId: interaction.guildId },
            { verificationPanelChannelId: interaction.channelId, verificationPanelMessageId: panelMsg.id },
            { upsert: true }
        ).catch(() => null);

        return interaction.editReply({ content: `**✓ Verification panel posted in ${interaction.channel} and saved.**` });
    }
};
