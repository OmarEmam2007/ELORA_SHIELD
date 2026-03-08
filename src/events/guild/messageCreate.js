const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { checkLink, extractUrls } = require('../../utils/securityUtils');
const ModSettings = require('../../models/ModSettings');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const { detectProfanitySimple } = require('../../utils/moderation/coreDetector');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        const ANTISWEAR_DEBUG = process.env.ANTISWEAR_DEBUG === '1';

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

                    if (linkType === 'INVITE') {
                        await message.delete().catch(() => {});

                        const warn = await message.channel.send({
                            content: `⚠️ ${message.author}, Discord invite links are not allowed in this server.`
                        }).catch(() => null);
                        if (warn) {
                            setTimeout(() => warn.delete().catch(() => {}), 5000);
                        }
                        return;
                    }

                    if (linkType === 'INSTAGRAM' || linkType === 'TIKTOK') {
                        const urls = extractUrls(String(message.content || '')).slice(0, 3);

                        await message.reply({ content: 'Processing your video...' }).catch(() => null);

                        for (const url of urls) {
                            let embedUrl = url;
                            if (linkType === 'TIKTOK') {
                                // Discord does not always unfurl TikTok reliably; vxtiktok helps render.
                                embedUrl = url.replace(/https?:\/\/(www\.)?tiktok\.com\//i, 'https://www.vxtiktok.com/');
                            } else if (linkType === 'INSTAGRAM') {
                                // ddinstagram helps render Instagram reels/posts.
                                embedUrl = url.replace(/https?:\/\/(www\.)?instagram\.com\//i, 'https://ddinstagram.com/');
                            }

                            await message.channel.send({ content: embedUrl }).catch(() => null);
                        }
                        return;
                    }

                    if (linkType === 'LINK') {
                        const text = String(message.content || '').toLowerCase();
                        const suspicious = /(free\s*nitro|steam\s*gift|airdrop|giveaway|\bscam\b|\bphish\b|\blogin\b.*\bdiscord\b|discord\.(gift|nitro)|bit\.ly|tinyurl\.com)/i.test(text);
                        if (suspicious) {
                            await message.delete().catch(() => {});

                            const warn = await message.channel.send({
                                content: `⚠️ ${message.author}, that link looks suspicious and was removed.`
                            }).catch(() => null);
                            if (warn) {
                                setTimeout(() => warn.delete().catch(() => {}), 7000);
                            }
                            return;
                        }
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

            if (ANTISWEAR_DEBUG) {
                console.log('[ANTISWEAR] gates=', {
                    guildId: message.guild.id,
                    channelId: message.channelId,
                    userId: message.author.id,
                    antiSwearEnabled,
                    isServerOwner,
                    isAdministrator,
                    isWhitelisted,
                });
                console.log('[ANTISWEAR] textForModeration=', { text: textForModeration || message.content });
            }

            if (antiSwearEnabled && !isServerOwner && !isAdministrator && !isWhitelisted) {
                const detection = detectProfanitySimple(textForModeration || message.content, {
                    extraTerms: Array.isArray(modSettings?.customBlacklist) ? modSettings.customBlacklist : [],
                    whitelist: Array.isArray(modSettings?.antiSwearWhitelist) ? modSettings.antiSwearWhitelist : []
                });

                if (ANTISWEAR_DEBUG) {
                    console.log('[ANTISWEAR] detection=', {
                        isViolation: detection?.isViolation,
                        source: detection?.source,
                        matches: detection?.matches,
                        hits: detection?.hits,
                    });
                }

                if (detection?.isViolation) {
                    await message.delete().catch(() => {});

                    await message.author.send('DO NOT SAY BAD WORDS!').catch(() => {});

                    const logChannel = await getGuildLogChannel(message.guild, client).catch(() => null);
                    if (logChannel) {
                        const detected = (detection.matches || []).slice(0, 10);
                        const embed = new EmbedBuilder()
                            .setColor(THEME.COLORS.ERROR)
                            .setTitle('Smart Anti-Swearing')
                            .setDescription('Blocked a message containing prohibited language.')
                            .addFields(
                                { name: 'User', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
                                { name: 'Channel', value: `${message.channel} (\`${message.channelId}\`)`, inline: true },
                                { name: 'Detected', value: `\`${detected.join(', ') || 'n/a'}\``, inline: false },
                                { name: 'Message', value: `\`\`\`${String(message.content || '').slice(0, 900)}\`\`\``, inline: false }
                            )
                            .setTimestamp();

                        await logChannel.send({ embeds: [embed] }).catch(() => {});
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
