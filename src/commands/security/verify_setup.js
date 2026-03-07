const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const path = require('path');
const ModSettings = require('../../models/ModSettings');

const VERIFY_EMOJI_NAME = '555';
const VERIFY_EMOJI_ID = '1479967165619634348';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify_setup')
        .setDescription('Post the verification panel and configure reaction verification.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.inGuild?.()) {
            return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const assetPath = path.join(__dirname, '../../assets/555.png');
        const file = new AttachmentBuilder(assetPath, { name: '555.png' });

        const panelMsg = await interaction.channel.send({ files: [file] });

        const emoji = `<:${VERIFY_EMOJI_NAME}:${VERIFY_EMOJI_ID}>`;
        await panelMsg.react(emoji).catch(() => null);

        await ModSettings.findOneAndUpdate(
            { guildId: interaction.guildId },
            { verificationPanelChannelId: interaction.channelId, verificationPanelMessageId: panelMsg.id },
            { upsert: true }
        ).catch(() => null);

        return interaction.editReply({ content: `✅ Verification panel posted in ${interaction.channel} and saved.` });
    }
};
