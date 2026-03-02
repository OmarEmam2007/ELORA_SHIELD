const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const ModSettings = require('../../models/ModSettings');
const ModLog = require('../../models/ModLog');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const { recordDismissal } = require('../../utils/moderation/patternLearner');
const { generateDashboard } = require('../../utils/moderation/modDashboard');
const THEME = require('../../utils/theme');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        const safeReply = async (payload) => {
            try {
                if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
                return await interaction.reply(payload);
            } catch (_) { }
        };

        const safeEdit = async (payload) => {
            try {
                if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
                return await interaction.reply(payload);
            } catch (_) { }
        };

        const safeUpdate = async (payload) => {
            try {
                return await interaction.update(payload);
            } catch (_) {
                return safeReply(payload);
            }
        };

        // --- ⚙️ SETTINGS PANEL MODALS (Admin only) ---
        if (interaction.isModalSubmit() && (interaction.customId === 'settings_modal_whitelist_role' || interaction.customId === 'settings_modal_whitelist_channel')) {
            return safeReply({ content: '❌ Settings panel is not available on ELORA_SHIELD.', ephemeral: true });
        }

        // --- ⚙️ SETTINGS PANEL SELECT MENU (Admin only) ---
        if (interaction.isStringSelectMenu?.() && interaction.customId === 'settings_menu') {
            return safeReply({ content: '❌ Settings panel is not available on ELORA_SHIELD.', ephemeral: true });
        }

        try {
        if (interaction.isButton()) {
            // --- ⚙️ SETTINGS PANEL BUTTONS (Admin only) ---
            if (interaction.customId && interaction.customId.startsWith('settings_')) {
                return safeReply({ content: '❌ Settings panel is not available on ELORA_SHIELD.', ephemeral: true });
            }

            // --- Verification Button ---
            if (interaction.customId === 'verify_astray') {
                const roleId = client.config.astrayRoleId;
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return safeReply({ content: '❌ Role not found.', ephemeral: true });
                if (interaction.member.roles.cache.has(roleId)) return safeReply({ content: 'ℹ️ Already verified.', ephemeral: true });
                try {
                    await interaction.member.roles.add(role);
                    return safeReply({ content: '🗝️ **Access Granted.**', ephemeral: true });
                } catch (error) {
                    return safeReply({ content: '❌ Hierarchy error.', ephemeral: true });
                }
            }

            // --- 🛡️ SMART MODERATION BUTTONS ---
            if (interaction.customId.startsWith('mod_') || interaction.customId.startsWith('dash_')) {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return safeReply({ content: '❌ No permission.', ephemeral: true });
                const parts = interaction.customId.split('_');
                const action = parts[1];

                try {
                    if (interaction.customId.startsWith('mod_')) {
                        const userId = parts[2];
                        const caseId = parts[3];
                        if (action === 'dismiss') {
                            const modCase = await ModLog.findOne({ guildId: interaction.guildId, caseId });
                            if (modCase && modCase.content) {
                                for (const word of modCase.content.split(/\s+/)) await recordDismissal(interaction.guildId, word);
                                modCase.status = 'Dismissed';
                                await modCase.save();
                            }
                            const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor('#2F3136').setFooter({ text: `Case #${caseId} | DISMISSED BY ${interaction.user.username}` });
                            return safeUpdate({ embeds: [embed], components: [] });
                        }
                        const target = await interaction.guild.members.fetch(userId).catch(() => null);
                        if (!target) return safeReply({ content: '❌ User left.', ephemeral: true });
                        switch (action) {
                            case 'warn': await target.send('⚠️ Warning: Severe profanity detected.').catch(() => { }); break;
                            case 'timeout': if (target.moderatable) await target.timeout(10 * 60 * 1000); break;
                            case 'ban': if (target.bannable) await target.ban({ reason: 'Smart Mod' }); break;
                        }
                        return safeReply({ content: `✅ Action: ${action} applied.`, ephemeral: true });
                    }

                    if (interaction.customId.startsWith('dash_')) {
                        let settings = await ModSettings.findOne({ guildId: interaction.guildId }) || new ModSettings({ guildId: interaction.guildId });
                        
                        // dash_toggle_filter
                        // dash_toggle_learning
                        // dash_sensitivity_up
                        // dash_sensitivity_down
                        
                        if (action === 'toggle') {
                            if (parts[2] === 'filter') settings.enabled = !settings.enabled;
                            if (parts[2] === 'learning') settings.learningMode = !settings.learningMode;
                        } else if (action === 'sensitivity') {
                            if (parts[2] === 'up') settings.sensitivity = Math.min(5, (settings.sensitivity || 3) + 1);
                            if (parts[2] === 'down') settings.sensitivity = Math.max(1, (settings.sensitivity || 3) - 1);
                        }
                        
                        await settings.save();
                        const dashboard = await generateDashboard(interaction.guildId);
                        return safeUpdate(dashboard);
                    }
                } catch (e) { return safeReply({ content: `❌ ${e.message}`, ephemeral: true }); }
            }
        }

        // --- 🧠 CUSTOM REPLIES MODAL SUBMIT ---
        if (interaction.isModalSubmit() && interaction.customId === 'cr_modal_add') {
            const OWNER_ROLE_ID = '1461766723274412126';
            const hasOwnerRole = interaction.member?.roles?.cache?.has(OWNER_ROLE_ID);
            const isOwnerId = client?.config?.ownerId && interaction.user.id === client.config.ownerId;
            if (!hasOwnerRole && !isOwnerId) return safeReply({ content: '❌ Owner only.', ephemeral: true });

            const trigger = interaction.fields.getTextInputValue('cr_trigger')?.trim();
            const reply = interaction.fields.getTextInputValue('cr_reply')?.trim();
            const matchRaw = interaction.fields.getTextInputValue('cr_match')?.trim()?.toLowerCase();

            if (!trigger || !reply) return safeReply({ content: '❌ Missing trigger or reply.', ephemeral: true });

            const matchType = matchRaw === 'startswith' || matchRaw === 'start' || matchRaw === 'sw' ? 'startsWith' : 'exact';

            try {
                await CustomReply.findOneAndUpdate(
                    { guildId: interaction.guildId, trigger },
                    {
                        $set: { reply, matchType, enabled: true, createdBy: interaction.user.id },
                        $setOnInsert: { guildId: interaction.guildId, trigger }
                    },
                    { upsert: true, new: true }
                );

                const ok = new EmbedBuilder()
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(`✅ Saved custom reply for trigger: \`${trigger}\``)
                    .setFooter(THEME.FOOTER);

                return safeReply({ embeds: [ok], ephemeral: true });
            } catch (e) {
                return safeReply({ content: `❌ Failed to save: ${e.message || e}`, ephemeral: true });
            }
        }

        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(error);
            await safeReply({ content: 'Error executing command!', ephemeral: true });
        }
        }
        catch (e) {
            console.error('interactionCreate handler error:', e);
        }
    }
};
