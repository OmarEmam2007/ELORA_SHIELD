const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const ModSettings = require('../../models/ModSettings');
const { detectProfanitySimple } = require('../../utils/moderation/coreDetector');
const THEME = require('../../utils/theme');
const { CHANNELS } = require('../../utils/logConfig');

module.exports = {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage, client) {
        if (!oldMessage.author || oldMessage.author.bot) return;
        // Fetch full message if partial (edits often arrive partial depending on cache/intents)
        try {
            if (newMessage?.partial) {
                newMessage = await newMessage.fetch().catch(() => newMessage);
            }
            if (oldMessage?.partial) {
                oldMessage = await oldMessage.fetch().catch(() => oldMessage);
            }
        } catch (e) {
            // best-effort
        }

        const oldContent = String(oldMessage?.content || '');
        const newContent = String(newMessage?.content || '');
        if (oldContent === newContent) return; // Only process content changes

        // Ignore stickers / emoji-only edits for anti-swear
        const hasStickers = Boolean(newMessage?.stickers && newMessage.stickers.size > 0);
        const withoutCustomEmoji = newContent.replace(/<a?:\w+:\d+>/g, ' ');
        const withoutUnicodeEmoji = withoutCustomEmoji.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, ' ');
        const textForModeration = withoutUnicodeEmoji.replace(/\s+/g, ' ').trim();
        if (hasStickers && !textForModeration) return;

        const ANTISWEAR_DEBUG = process.env.ANTISWEAR_DEBUG === '1';

        // --- 🤖 Smart Anti-Swearing on EDIT ---
        try {
            const guild = newMessage.guild || oldMessage.guild;
            if (!guild) return;

            const member = newMessage.member || oldMessage.member;

            let modSettings = null;
            try {
                modSettings = await ModSettings.findOne({ guildId: guild.id }).catch(() => null);
            } catch (e) {
                modSettings = null;
            }

            const antiSwearEnabled = modSettings?.antiSwearEnabled !== false;
            const disabledChannels = Array.isArray(modSettings?.antiSwearDisabledChannels) ? modSettings.antiSwearDisabledChannels : [];
            const channelId = newMessage.channelId || oldMessage.channelId;
            const antiSwearEnabledHere = antiSwearEnabled && (!channelId || !disabledChannels.includes(channelId));
            if (!antiSwearEnabledHere) return;

            // Anti-swear is independent from other moderation toggles.
            const isModLiteEnabled = true;
            const whitelistRoles = Array.isArray(modSettings?.whitelistRoles) ? modSettings.whitelistRoles : [];
            const whitelistChannels = Array.isArray(modSettings?.whitelistChannels) ? modSettings.whitelistChannels : [];
            const isWhitelisted = Boolean(
                (channelId && whitelistChannels.includes(channelId)) ||
                (member?.roles?.cache && whitelistRoles.some(r => member.roles.cache.has(r)))
            );

            const isServerOwner = guild?.ownerId && oldMessage.author.id === guild.ownerId;
            const isAdministrator = Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
            const shouldApplyAntiSwear = isModLiteEnabled && !isWhitelisted && !isServerOwner && !isAdministrator;

            if (ANTISWEAR_DEBUG) {
                console.log('[ANTISWEAR][EDIT] gates=', {
                    enabled: isModLiteEnabled,
                    isWhitelisted,
                    isServerOwner,
                    isAdministrator,
                    shouldApplyAntiSwear,
                });
                console.log('[ANTISWEAR][EDIT] textForModeration=', { text: textForModeration || newContent });
            }

            if (shouldApplyAntiSwear) {
                if (!textForModeration && !newContent) return;
                const detection = detectProfanitySimple(textForModeration || newContent, {
                    extraTerms: Array.isArray(modSettings?.customBlacklist) ? modSettings.customBlacklist : [],
                    whitelist: Array.isArray(modSettings?.antiSwearWhitelist) ? modSettings.antiSwearWhitelist : []
                });

                if (ANTISWEAR_DEBUG) console.log('[ANTISWEAR][EDIT] detection=', { isViolation: detection?.isViolation, source: detection?.source, ai: detection?.ai ? { ok: detection.ai.ok, confidence: detection.ai.confidence, reason: detection.ai.reason } : undefined });

                if (detection?.isViolation) {
                    await newMessage.delete().catch((e) => {
                        if (ANTISWEAR_DEBUG) console.log('[ANTISWEAR][EDIT] delete failed:', e?.message || e);
                    });

                    await oldMessage.author.send('DO NOT SAY BAD WORDS!').catch(() => { });

                    const logChannel = await getGuildLogChannel(guild, client).catch(() => null);
                    if (logChannel) {
                        const detected = (detection.matches || []).slice(0, 10);
                        const embed = new EmbedBuilder()
                            .setColor(THEME.COLORS.ERROR)
                            .setTitle('Smart Anti-Swearing (Edit)')
                            .setDescription('Blocked an edited message containing prohibited language.')
                            .addFields(
                                { name: 'User', value: `${oldMessage.author.tag} (\`${oldMessage.author.id}\`)`, inline: true },
                                { name: 'Channel', value: `${newMessage.channel} (\`${channelId}\`)`, inline: true },
                                { name: 'Detected', value: `\`${detected.join(', ') || 'n/a'}\``, inline: false },
                                { name: 'Before', value: `\`\`\`${String(oldMessage.content || '').slice(0, 450)}\`\`\``, inline: false },
                                { name: 'After', value: `\`\`\`${String(newMessage.content || '').slice(0, 450)}\`\`\``, inline: false }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [embed] }).catch(() => { });
                    }

                    return;
                }
            }
        } catch (e) {
            console.error('[ANTISWEAR][EDIT] error:', e);
        }

        const logChannel = await getGuildLogChannel(oldMessage.guild, client);
        
        // --- New Messages Log System ---
        const newLogChannel = await oldMessage.guild.channels.fetch(CHANNELS.MESSAGES).catch(() => null);

        const beforeText = String(oldMessage.content || '');
        const afterText = String(newMessage.content || '');
        const createdTs = oldMessage.createdTimestamp ? `<t:${Math.floor(oldMessage.createdTimestamp / 1000)}:F>` : 'Unknown';
        const editedTs = newMessage.editedTimestamp ? `<t:${Math.floor(newMessage.editedTimestamp / 1000)}:F>` : 'Now';
        const jump = (newMessage.url || oldMessage.url) ? `[Jump](${newMessage.url || oldMessage.url})` : 'N/A';

        const embed = THEME.makeEmbed(EmbedBuilder, 'ACCENT')
            .setTitle('📝 Message Edited')
            .setAuthor({ name: oldMessage.author.tag, iconURL: oldMessage.author.displayAvatarURL({ dynamic: true }) })
            .addFields(
                { name: 'User', value: `${oldMessage.author} (\`${oldMessage.author.id}\`)`, inline: true },
                { name: 'Channel', value: `${oldMessage.channel} (\`${oldMessage.channelId}\`)`, inline: true },
                { name: 'Message ID', value: `\`${oldMessage.id}\``, inline: true },
                { name: 'Created', value: createdTs, inline: true },
                { name: 'Edited', value: editedTs, inline: true },
                { name: 'Link', value: jump, inline: true },
                { name: 'Before', value: `\`\`\`\n${beforeText.slice(0, 900) || '[No Content]'}\n\`\`\``, inline: false },
                { name: 'After', value: `\`\`\`\n${afterText.slice(0, 900) || '[No Content]'}\n\`\`\``, inline: false }
            );

        // Attachment diff (best-effort)
        const oldAtt = oldMessage.attachments ? [...oldMessage.attachments.values()] : [];
        const newAtt = newMessage.attachments ? [...newMessage.attachments.values()] : [];
        if (oldAtt.length || newAtt.length) {
            embed.addFields({
                name: 'Attachments',
                value: `Before: ${oldAtt.map(a => a?.name ? `\`${a.name}\`` : '`file`').join(', ') || 'None'}\nAfter: ${newAtt.map(a => a?.name ? `\`${a.name}\`` : '`file`').join(', ') || 'None'}`.slice(0, 1024),
                inline: false
            });

            const first = newAtt[0];
            const firstUrl = first?.url || first?.proxyURL;
            const isImage = first?.contentType ? String(first.contentType).startsWith('image/') : (firstUrl ? /\.(png|jpe?g|gif|webp)$/i.test(firstUrl) : false);
            if (isImage && firstUrl) {
                embed.setImage(firstUrl);
            }
        }

        if (logChannel) {
            await logChannel.send({ embeds: [embed] }).catch(() => null);
        }

        // Send to new messages log channel if it exists
        if (newLogChannel && newLogChannel.isTextBased() && (!logChannel || newLogChannel.id !== logChannel.id)) {
            await newLogChannel.send({ embeds: [embed] }).catch(() => null);
        }
    },
};
