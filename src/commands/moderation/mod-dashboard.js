const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { generateDashboard } = require('../../utils/moderation/modDashboard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mod-dashboard')
        .setDescription('Deploys the Elora Smart Moderation Dashboard.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, client) {
        const hasAdministrator = Boolean(interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator));
        if (!hasAdministrator) {
            return interaction.reply({ content: '❌ You need **Administrator** permission to use this command.', ephemeral: true }).catch(() => null);
        }

        await interaction.deferReply({ ephemeral: true });

        const dashboard = await generateDashboard(interaction.guildId);

        await interaction.channel.send(dashboard);
        await interaction.editReply('✅ Smart Moderation Dashboard deployed to this channel.');
    },
};
