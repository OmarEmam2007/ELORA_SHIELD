const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { checkLink, checkRateLimit } = require('../../utils/securityUtils');
const User = require('../../models/User');
const ModSettings = require('../../models/ModSettings');
const ModLog = require('../../models/ModLog');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const { detectProfanitySmart, detectProfanityHybrid } = require('../../utils/moderation/coreDetector');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // --- Language filter: block Arabic in specific channel ---
        try {
            if (message.channelId === '1462025794481164461') {
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
                if (!isAdministrator) {
                    const hasArabic = /[\u0600-\u06FF]/.test(String(message.content || ''));
                    if (hasArabic) {
                        await message.delete().catch(() => {});
                        const warn = await message.channel.send({
                            content: 'Please use the Arabic language channel here: <#1462079159332372480>'
                        }).catch(() => null);
                        if (warn) {
                            setTimeout(() => warn.delete().catch(() => {}), 7000);
                        }
                        return;
                    }
                }
            }
        } catch (e) {
            console.error('[LANG FILTER] Error:', e);
        }

        // --- Anti-Link / Anti-Invite ---
        try {
            const securityCfg = await GuildSecurityConfig.findOne({ guildId: message.guild.id }).catch(() => null);
            const antiLinkEnabled = securityCfg?.antiLinkEnabled !== false;

            if (antiLinkEnabled) {
                const isServerOwner = message.guild?.ownerId === message.author.id;
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

                const modSettings = await ModSettings.findOne({ guildId: message.guild.id }).catch(() => null);
                const whitelistRoles = Array.isArray(modSettings?.whitelistRoles) ? modSettings.whitelistRoles : [];
                const whitelistChannels = Array.isArray(modSettings?.whitelistChannels) ? modSettings.whitelistChannels : [];
                const isWhitelisted = Boolean(
                    (message.channelId && whitelistChannels.includes(message.channelId)) ||
                    (message.member?.roles?.cache && whitelistRoles.some(r => message.member.roles.cache.has(r)))
                );

                if (!isServerOwner && !isAdministrator && !isWhitelisted) {
                    const linkType = checkLink(String(message.content || ''));
                    if (linkType) {
                        await message.delete().catch(() => {});

                        const warn = await message.channel.send({
                            content: `⚠️ ${message.author}, links are not allowed in this server.`
                        }).catch(() => null);
                        if (warn) {
                            setTimeout(() => warn.delete().catch(() => {}), 5000);
                        }
                        return;
                    }
                }
            }
        } catch (e) {
            console.error('[ANTILINK] Error:', e);
        }

        // --- Lightweight Moderation (Anti-Invite, etc.) ---
        const hasStickers = Boolean(message.stickers && message.stickers.size > 0);
        const rawText = String(message.content || '');
        const withoutCustomEmoji = rawText.replace(/<a?:\w+:\d+>/g, ' ');
        const withoutUnicodeEmoji = withoutCustomEmoji.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, ' ');
        const textForModeration = withoutUnicodeEmoji.replace(/\s+/g, ' ').trim();
        if (hasStickers && !textForModeration) return;

        // --- Smart Anti-Swearing (PRIORITY #1) ---
        try {
            const modSettings = await ModSettings.findOne({ guildId: message.guild.id }).catch(() => null);
            const antiSwearEnabled = modSettings?.antiSwearEnabled !== false;

            const isServerOwner = message.guild?.ownerId === message.author.id;
            const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

            const whitelistRoles = Array.isArray(modSettings?.whitelistRoles) ? modSettings.whitelistRoles : [];
            const whitelistChannels = Array.isArray(modSettings?.whitelistChannels) ? modSettings.whitelistChannels : [];
            const isWhitelisted = Boolean(
                (message.channelId && whitelistChannels.includes(message.channelId)) ||
                (message.member?.roles?.cache && whitelistRoles.some(r => message.member.roles.cache.has(r)))
            );

            if (antiSwearEnabled && !isServerOwner && !isAdministrator && !isWhitelisted) {
                const detector = typeof detectProfanityHybrid === 'function' ? detectProfanityHybrid : async (c, o) => detectProfanitySmart(c, o);

                const detection = await detector(textForModeration || message.content, {
                    extraTerms: Array.isArray(modSettings?.customBlacklist) ? modSettings.customBlacklist : [],
                    whitelist: Array.isArray(modSettings?.antiSwearWhitelist) ? modSettings.antiSwearWhitelist : []
                });

                if (detection?.isViolation) {
                    const threshold = modSettings?.antiSwearThreshold ? Math.max(2, Math.min(20, Number(modSettings.antiSwearThreshold))) : 5;
                    await message.delete().catch(() => {});

                    const detectedWord = (detection.matches || [])[0] || '';
                    const isArabic = /[\u0600-\u06FF]/.test(detectedWord);
                    const warnMsg = isArabic
                        ? `⚠️ ${message.author}, ممنوع الشتائم في هذا السيرفر!`
                        : `⚠️ ${message.author}, Profanity is not allowed in this server!`;

                    const publicWarn = await message.channel.send(warnMsg).catch(() => null);
                    if (publicWarn) {
                        setTimeout(() => publicWarn.delete().catch(() => {}), 5000);
                    }

                    let userProfile = await User.findOne({ userId: message.author.id, guildId: message.guild.id }).catch(() => null);
                    if (!userProfile) userProfile = new User({ userId: message.author.id, guildId: message.guild.id });

                    const prevCount = Number(userProfile.antiSwearWarningsCount || 0);
                    const nextCount = Math.min(threshold, prevCount + 1);
                    userProfile.antiSwearWarningsCount = nextCount;
                    userProfile.antiSwearLastAt = new Date();
                    await userProfile.save().catch(() => {});

                    const warnText = `Your message was removed because it contained prohibited language.\nWarning: ${nextCount}/${threshold}. If you reach ${threshold} warnings, you will be timed out for 1 hour.`;
                    await message.author.send(warnText).catch(() => {});

                    const logChannel = await getGuildLogChannel(message.guild, client);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setColor(THEME.COLORS.ERROR)
                            .setTitle('Smart Anti-Swearing')
                            .setDescription('Blocked a message containing prohibited language.')
                            .addFields(
                                { name: 'User', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
                                { name: 'Channel', value: `${message.channel} (\`${message.channelId}\`)`, inline: true },
                                { name: 'Warnings', value: `\`${nextCount}/${threshold}\``, inline: true },
                                { name: 'Detected', value: `\`${(detection.matches || []).slice(0, 10).join(', ') || 'n/a'}\``, inline: false },
                                { name: 'Message', value: `\`\`\`${String(message.content || '').slice(0, 900)}\`\`\``, inline: false }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [embed] }).catch(() => {});
                    }

                    if (nextCount >= threshold) {
                        if (message.member?.moderatable) {
                            await message.member.timeout(60 * 60 * 1000, `Smart Anti-Swearing: ${threshold} warnings`).catch(() => {});
                        }
                        await User.findOneAndUpdate(
                            { userId: message.author.id, guildId: message.guild.id },
                            { antiSwearWarningsCount: 0, antiSwearLastAt: new Date() },
                            { upsert: true }
                        ).catch(() => {});
                    }
                    return;
                }
            }
        } catch (e) {
            console.error('[ANTISWEAR] Error:', e);
        }

        // --- 🎮 Prefix Commands (Moderation/Security only) ---
        // Only runs if the message survived all moderation checks.
        try {
            if (typeof handlePrefixCommand === 'function') {
                const wasCommand = await handlePrefixCommand(message, client);
                if (wasCommand) return;
            }
        } catch (e) {
            console.error('[PREFIX] Error:', e);
        }
    }
};
