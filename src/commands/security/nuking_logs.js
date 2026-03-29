const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nuking_logs')
        .setDescription('Set the anti-nuke log channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Channel to send anti-nuke logs to')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    async execute(interaction) {
        const hasAdministrator = Boolean(interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator));
        if (!hasAdministrator) {
            return interaction.reply({ content: '**✖ You need Administrator permission to use this command.**', ephemeral: true }).catch(() => null);
        }

        if (!interaction.guild) {
            return interaction.reply({ content: '**✖ This command can only be used in a server.**', ephemeral: true }).catch(() => null);
        }

        const channel = interaction.options.getChannel('channel');
        await GuildSecurityConfig.findOneAndUpdate(
            { guildId: interaction.guildId },
            { $set: { securityLogChannelId: channel.id }, $setOnInsert: { guildId: interaction.guildId } },
            { upsert: true, new: true }
        ).catch(() => null);

        return interaction.reply({ content: `**<a:custom_check:1487391271759646750> Nuking logs will be sent to ${channel}.**`, ephemeral: true }).catch(() => null);
    }
};
