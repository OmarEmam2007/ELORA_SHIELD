const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ModSettings = require('../../models/ModSettings');

module.exports = {
    name: 'turn_off_anti',
    aliases: ['turn_off_anti'],
    data: new SlashCommandBuilder()
        .setName('turn_off_anti')
        .setDescription('Disable the anti-swearing system in this channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client, args) {
        const isSlash = interaction.isChatInputCommand?.();

        // Hybrid input support
        let mainMsg = interaction;
        let bot = client;
        let commandArgs = args;

        if (interaction.isChatInputCommand === undefined && client instanceof Array) {
            mainMsg = interaction;
            commandArgs = client;
            bot = args;
        }

        if (!isSlash) {
            // This command is intended as a Slash Command.
            // If called via prefix handler, ignore.
            return;
        }

        if (!mainMsg.guildId || !mainMsg.channelId) {
            return mainMsg.reply({ content: '❌ This command can only be used in a server channel.', ephemeral: true }).catch(() => null);
        }

        const guildId = mainMsg.guildId;
        const channelId = mainMsg.channelId;

        const modSettings = await ModSettings.findOneAndUpdate(
            { guildId },
            { $setOnInsert: { guildId } },
            { upsert: true, new: true }
        ).catch(() => null);

        if (!modSettings) {
            return mainMsg.reply({ content: '❌ Failed to update anti-swear settings (database error).', ephemeral: true }).catch(() => null);
        }

        const disabled = Array.isArray(modSettings.antiSwearDisabledChannels) ? modSettings.antiSwearDisabledChannels : [];
        const disabledSet = new Set(disabled);
        disabledSet.add(channelId);

        modSettings.antiSwearDisabledChannels = Array.from(disabledSet);
        await modSettings.save().catch(() => null);

        return mainMsg.reply({ content: '✅ Anti-swear system is now **OFF** in this room.', ephemeral: true }).catch(() => null);
    }
};
