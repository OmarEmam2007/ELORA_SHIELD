const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const ModSettings = require('../../models/ModSettings');
const User = require('../../models/User');
const profanityList = require('../../utils/profanityList');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mod-config')
        .setDescription('Configure Elora Smart Moderation settings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('logs')
                .setDescription('Set the moderation logs channel.')
                .addChannelOption(opt => opt.setName('channel').setDescription('The channel to send logs to').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(sub =>
            sub.setName('toggle')
                .setDescription('Turn the filter on or off.')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Whether to enable the filter').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('whitelist-add')
                .setDescription('Add a safe word/phrase that should never be flagged by anti-swearing.')
                .addStringOption(opt =>
                    opt.setName('term')
                        .setDescription('Word or short phrase to whitelist')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('whitelist-remove')
                .setDescription('Remove a safe word/phrase from the anti-swearing whitelist.')
                .addStringOption(opt =>
                    opt.setName('term')
                        .setDescription('Word or short phrase to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('whitelist-list')
                .setDescription('List all currently whitelisted safe words/phrases for anti-swearing.')
        )
        .addSubcommand(sub =>
            sub.setName('blacklist-add')
                .setDescription('Add a custom word/phrase to the anti-swearing blacklist for this server.')
                .addStringOption(opt =>
                    opt.setName('term')
                        .setDescription('Word or short phrase to block')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('blacklist-remove')
                .setDescription('Remove a term from the custom anti-swearing blacklist.')
                .addStringOption(opt =>
                    opt.setName('term')
                        .setDescription('Word or short phrase to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('blacklist-list')
                .setDescription('List all custom blocked terms (anti-swearing) for this server.')
        )
        .addSubcommand(sub =>
            sub.setName('blacklist-list-all')
                .setDescription('List all blocked terms (built-in + custom) for this server.')
        ),
    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'logs') {
            const channel = interaction.options.getChannel('channel');
            await ModSettings.findOneAndUpdate(
                { guildId: interaction.guildId },
                { logChannelId: channel.id },
                { upsert: true }
            );
            return interaction.reply({ content: `✅ Moderation logs will now be sent to ${channel}.`, ephemeral: true });
        }

        if (sub === 'toggle') {
            const enabled = interaction.options.getBoolean('enabled');
            await ModSettings.findOneAndUpdate(
                { guildId: interaction.guildId },
                { enabled: enabled },
                { upsert: true }
            );
            return interaction.reply({ content: `✅ Smart Moderation has been ${enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
        }

        if (sub === 'whitelist-add') {
            const raw = interaction.options.getString('term');
            const term = String(raw || '').trim();
            if (!term) return interaction.reply({ content: '❌ Please provide a valid term.', ephemeral: true });
            if (term.length > 64) return interaction.reply({ content: '❌ Term is too long (max 64 characters).', ephemeral: true });

            const settings = await ModSettings.findOne({ guildId: interaction.guildId }).catch(() => null);
            const current = Array.isArray(settings?.antiSwearWhitelist) ? settings.antiSwearWhitelist : [];
            const exists = current.some(t => String(t).toLowerCase() === term.toLowerCase());
            if (exists) {
                return interaction.reply({ content: `ℹ️ "${term}" is already whitelisted.`, ephemeral: true });
            }

            await ModSettings.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $addToSet: { antiSwearWhitelist: term } },
                { upsert: true }
            );

            return interaction.reply({ content: `✅ Added "${term}" to the anti-swearing whitelist.`, ephemeral: true });
        }

        if (sub === 'whitelist-remove') {
            const raw = interaction.options.getString('term');
            const term = String(raw || '').trim();
            if (!term) return interaction.reply({ content: '❌ Please provide a valid term.', ephemeral: true });

            await ModSettings.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $pull: { antiSwearWhitelist: term } },
                { upsert: true }
            );

            return interaction.reply({ content: `✅ Removed "${term}" from the anti-swearing whitelist.`, ephemeral: true });
        }

        if (sub === 'whitelist-list') {
            const settings = await ModSettings.findOne({ guildId: interaction.guildId }).lean().catch(() => null);
            const list = Array.isArray(settings?.antiSwearWhitelist) ? settings.antiSwearWhitelist : [];
            if (!list.length) {
                return interaction.reply({ content: 'ℹ️ No whitelisted terms set for this server.', ephemeral: true });
            }
            const shown = list.slice(0, 50).map((t, i) => `${i + 1}. ${t}`).join('\n');
            const extra = list.length > 50 ? `\n\n…and ${list.length - 50} more.` : '';
            return interaction.reply({ content: `Anti-swearing whitelist (${list.length}):\n${shown}${extra}`, ephemeral: true });
        }

        if (sub === 'blacklist-add') {
            const raw = interaction.options.getString('term');
            const term = String(raw || '').trim();
            if (!term) return interaction.reply({ content: '❌ Please provide a valid term.', ephemeral: true });
            if (term.length > 64) return interaction.reply({ content: '❌ Term is too long (max 64 characters).', ephemeral: true });

            // Prevent adding whitelisted terms by mistake.
            const settings = await ModSettings.findOne({ guildId: interaction.guildId }).lean().catch(() => null);
            const wl = Array.isArray(settings?.antiSwearWhitelist) ? settings.antiSwearWhitelist : [];
            if (wl.some(t => String(t).toLowerCase() === term.toLowerCase())) {
                return interaction.reply({ content: `❌ "${term}" is currently whitelisted. Remove it from whitelist first.`, ephemeral: true });
            }

            await ModSettings.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $addToSet: { customBlacklist: term } },
                { upsert: true }
            );

            return interaction.reply({ content: `✅ Added "${term}" to the custom anti-swearing blacklist.`, ephemeral: true });
        }

        if (sub === 'blacklist-remove') {
            const raw = interaction.options.getString('term');
            const term = String(raw || '').trim();
            if (!term) return interaction.reply({ content: '❌ Please provide a valid term.', ephemeral: true });

            await ModSettings.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $pull: { customBlacklist: term } },
                { upsert: true }
            );

            return interaction.reply({ content: `✅ Removed "${term}" from the custom anti-swearing blacklist.`, ephemeral: true });
        }

        if (sub === 'blacklist-list') {
            const settings = await ModSettings.findOne({ guildId: interaction.guildId }).lean().catch(() => null);
            const list = Array.isArray(settings?.customBlacklist) ? settings.customBlacklist : [];
            if (!list.length) {
                return interaction.reply({ content: 'ℹ️ No custom blacklisted terms set for this server.', ephemeral: true });
            }
            const shown = list.slice(0, 50).map((t, i) => `${i + 1}. ${t}`).join('\n');
            const extra = list.length > 50 ? `\n\n…and ${list.length - 50} more.` : '';
            return interaction.reply({ content: `Custom anti-swear blacklist (${list.length}):\n${shown}${extra}`, ephemeral: true });
        }

        if (sub === 'blacklist-list-all') {
            const settings = await ModSettings.findOne({ guildId: interaction.guildId }).lean().catch(() => null);
            const custom = Array.isArray(settings?.customBlacklist) ? settings.customBlacklist : [];
            const builtIn = Array.isArray(profanityList) ? profanityList : [];

            const builtInShown = builtIn.slice(0, 50).map((t, i) => `${i + 1}. ${t}`).join('\n');
            const builtInExtra = builtIn.length > 50 ? `\n\n…and ${builtIn.length - 50} more.` : '';

            const customShown = custom.slice(0, 50).map((t, i) => `${i + 1}. ${t}`).join('\n');
            const customExtra = custom.length > 50 ? `\n\n…and ${custom.length - 50} more.` : '';

            const builtInBlock = builtIn.length
                ? `Built-in blacklist (${builtIn.length}):\n${builtInShown}${builtInExtra}`
                : 'Built-in blacklist (0):\n(no built-in terms found)';

            const customBlock = custom.length
                ? `Custom blacklist (${custom.length}):\n${customShown}${customExtra}`
                : 'Custom blacklist (0):\n(no custom terms set for this server)';

            // Keep within Discord limits comfortably
            let content = `${builtInBlock}\n\n${customBlock}`;
            if (content.length > 1800) {
                content = content.slice(0, 1800) + '\n\n…(truncated)';
            }

            return interaction.reply({ content, ephemeral: true });
        }
    },
};
