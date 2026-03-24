const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { checkLink, extractUrls } = require('../../utils/securityUtils');
const ModSettings = require('../../models/ModSettings');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const { detectProfanitySimple } = require('../../utils/moderation/coreDetector');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');

 const ELORA_CYBERSHIELD_FEED_URL = 'https://phish.sinking.yachts/v2/all';
 const ELORA_CYBERSHIELD_REFRESH_MS = 6 * 60 * 60 * 1000;
 const ELORA_CYBERSHIELD_TIMEOUT_MS = 24 * 60 * 60 * 1000;
 const ELORA_CYBERSHIELD_LOG_CHANNEL_ID = process.env.ELORA_SECURITY_LOG_CHANNEL_ID || null;

 let eloraBadDomains = new Set();
 let eloraCyberShieldStarted = false;

 function eloraNormalizeHost(host) {
     const h = String(host || '').trim().toLowerCase();
     if (!h) return null;
     const trimmed = h.replace(/^\.+|\.+$/g, '');
     const noWww = trimmed.startsWith('www.') ? trimmed.slice(4) : trimmed;
     return noWww.split(':')[0];
 }

 function eloraDefangDomain(domain) {
     return String(domain || '').replace(/\./g, '[.]');
 }

 function eloraHostMatchesBadSet(host) {
     const normalized = eloraNormalizeHost(host);
     if (!normalized) return null;

     if (eloraBadDomains.has(normalized)) return normalized;

     const parts = normalized.split('.').filter(Boolean);
     if (parts.length < 2) return null;

     for (let i = 1; i < parts.length - 1; i++) {
         const suffix = parts.slice(i).join('.');
         if (eloraBadDomains.has(suffix)) return suffix;
     }

     return null;
 }

 function eloraExtractHostsFromMessage(content) {
     const text = String(content || '');
     if (!text) return [];

     const hosts = new Set();

     const urlRegex = /https?:\/\/[^\s<>()]+/gi;
     const urlMatches = text.match(urlRegex) || [];
     for (const raw of urlMatches) {
         try {
             const u = new URL(raw);
             const host = eloraNormalizeHost(u.hostname);
             if (host) hosts.add(host);
         } catch (_) {}
     }

     const domainRegex = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;
     const domainMatches = text.match(domainRegex) || [];
     for (const raw of domainMatches) {
         const host = eloraNormalizeHost(raw);
         if (host) hosts.add(host);
     }

     return Array.from(hosts);
 }

 async function eloraFetchBadDomainSet() {
     const res = await fetch(ELORA_CYBERSHIELD_FEED_URL, {
         method: 'GET',
         headers: { accept: 'application/json' }
     });

     if (!res.ok) throw new Error(`CyberShield feed HTTP ${res.status}`);

     const json = await res.json();
     const next = new Set();

     if (Array.isArray(json)) {
         for (const item of json) {
             if (typeof item === 'string') {
                 const host = eloraNormalizeHost(item);
                 if (host) next.add(host);
             } else if (item && typeof item === 'object') {
                 const d = eloraNormalizeHost(item.domain || item.host || item.hostname);
                 if (d) next.add(d);
             }
         }
     } else if (json && typeof json === 'object') {
         const arr = json.domains || json.data || json.blacklist || [];
         if (Array.isArray(arr)) {
             for (const item of arr) {
                 const host = eloraNormalizeHost(item);
                 if (host) next.add(host);
             }
         }
     }

     if (next.size === 0) throw new Error('CyberShield feed parsed but produced empty set');

     eloraBadDomains = next;
 }

 function eloraStartCyberShieldFeed() {
     if (eloraCyberShieldStarted) return;
     eloraCyberShieldStarted = true;

     eloraFetchBadDomainSet().catch((e) => {
         console.error('[ELORA Cyber-Shield] Initial feed fetch failed:', e);
     });

     setInterval(() => {
         eloraFetchBadDomainSet().catch((e) => {
             console.error('[ELORA Cyber-Shield] Feed refresh failed:', e);
         });
     }, ELORA_CYBERSHIELD_REFRESH_MS).unref?.();
 }

 async function eloraResolveLogChannel(guild, client) {
     if (!guild) return null;
     if (ELORA_CYBERSHIELD_LOG_CHANNEL_ID) {
         const ch = await guild.channels.fetch(ELORA_CYBERSHIELD_LOG_CHANNEL_ID).catch(() => null);
         if (ch && ch.isTextBased?.()) return ch;
     }
     return getGuildLogChannel(guild, client).catch(() => null);
 }

 function eloraBuildCyberShieldEmbed({ offender, channel, domain }) {
     const lines = [
         '```ansi',
         '\u001b[2;31m[ELORA CYBER-SHIELD]\u001b[0m \u001b[1;31mSCAM LINK NEUTRALIZED\u001b[0m',
         `Domain: ${eloraDefangDomain(domain)}`,
         'Status: THREAT REMOVED + USER QUARANTINED',
         '```'
     ].join('\n');

     return new EmbedBuilder()
         .setColor(THEME?.COLORS?.ERROR || '#8B0000')
         .setTitle('⚠️ SCAM LINK NEUTRALIZED')
         .setDescription(lines)
         .addFields(
             { name: 'Offender', value: `${offender} (\`${offender.id}\`)`, inline: false },
             { name: 'Channel', value: `${channel} (\`${channel.id}\`)`, inline: false },
             { name: 'The Malicious Domain', value: `\`${eloraDefangDomain(domain)}\``, inline: false },
             { name: 'Action Taken', value: 'Message Deleted & User Timed Out for 24h', inline: false },
         )
         .setTimestamp();
 }

 eloraStartCyberShieldFeed();

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

         try {
             const content = String(message.content || '');
             if (content && eloraBadDomains && eloraBadDomains.size > 0) {
                 const hosts = eloraExtractHostsFromMessage(content);
                 if (hosts.length > 0) {
                     let matched = null;
                     for (const host of hosts) {
                         const hit = eloraHostMatchesBadSet(host);
                         if (hit) {
                             matched = hit;
                             break;
                         }
                     }

                     if (matched) {
                         try {
                             await message.delete().catch(() => null);
                         } catch (_) {}

                         try {
                             const member = message.member;
                             if (member) {
                                 const me = message.guild.members.me;
                                 const canModerate = me?.permissions?.has(PermissionFlagsBits.ModerateMembers);
                                 if (canModerate && member.moderatable) {
                                     await member.timeout(ELORA_CYBERSHIELD_TIMEOUT_MS, `ELORA Cyber-Shield: scam domain detected (${matched})`).catch(() => null);
                                 }
                             }
                         } catch (e) {
                             console.error('[ELORA Cyber-Shield] Failed to timeout member:', e);
                         }

                         try {
                             const logChannel = await eloraResolveLogChannel(message.guild, client);
                             if (logChannel) {
                                 const embed = eloraBuildCyberShieldEmbed({ offender: message.author, channel: message.channel, domain: matched });
                                 await logChannel.send({ embeds: [embed] }).catch(() => null);
                             }
                         } catch (e) {
                             console.error('[ELORA Cyber-Shield] Failed to log alert:', e);
                         }

                         return;
                     }
                 }
             }
         } catch (e) {
             console.error('[ELORA Cyber-Shield] Scanner error:', e);
         }

         // --- حطه / حطيه (Ban Command) ---
         // Format:
         // حطه @mention reason...
         // حطيه @mention reason...
         // Requirements:
         // - Server owner OR member has BanMembers permission
         // Responses must be fully bold and include specific custom emoji IDs.
         try {
             const raw = String(message.content || '').trim();
             const parts = raw.split(/\s+/).filter(Boolean);
             const cmd = parts[0];
             const isBanCmd = cmd === 'حطه' || cmd === 'حطيه';
             if (isBanCmd) {
                 const isServerOwner = message.guild?.ownerId === message.author.id;
                 const canBan = message.member?.permissions?.has(PermissionFlagsBits.BanMembers);
                 if (!isServerOwner && !canBan) return;

                 const EMOJI_OK = '<:elora:1479538799712276702>';
                 const EMOJI_NEED_MENTION = '<:elora:1479539014611505253>';

                 const targetMember = message.mentions?.members?.first?.() || null;
                 if (!targetMember) {
                     await message.reply({ content: `**لازم تعمل منشن يا قلبي صحصح كده ${EMOJI_NEED_MENTION}**` }).catch(() => null);
                     return;
                 }

                 // Extract reason: remove the command word and the mention token if present
                 // parts[0] is the command word
                 const reasonParts = parts.slice(2);
                 const reason = reasonParts.join(' ').trim() || `Banned by ${message.author.tag}`;

                 // Safety checks
                 if (targetMember.id === message.guild.ownerId) return;
                 if (!targetMember.bannable) {
                     await message.reply({ content: `**مش قادر أبند الشخص ده (Hierarchy/Permissions). ${EMOJI_NEED_MENTION}**` }).catch(() => null);
                     return;
                 }

                 await targetMember.ban({ reason }).catch(() => null);
                 await message.reply({ content: `**خرج من زوروا يا روحي ${EMOJI_OK}**` }).catch(() => null);
                 return;
             }
         } catch (e) {
             console.error('[لف BAN] Error:', e);
         }

        const ANTISWEAR_DEBUG = process.env.ANTISWEAR_DEBUG === '1';

        // --- Anti-Swear Toggle Commands (per-channel) ---
        // We handle these early so the command itself never gets deleted by anti-swear.
        try {
            const raw = String(message.content || '').trim();
            const lower = raw.toLowerCase();
            const isToggleCmd = lower === '/turn_on_anti' || lower === '/turn_off_anti';
            if (isToggleCmd) {
                const isServerOwner = message.guild?.ownerId === message.author.id;
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
                if (!isServerOwner && !isAdministrator) {
                    await message.reply({ content: '❌ You need Administrator permission to use this command.' }).catch(() => null);
                    return;
                }

                const guildId = message.guild.id;
                const channelId = message.channelId;
                const modSettings = await ModSettings.findOneAndUpdate(
                    { guildId },
                    { $setOnInsert: { guildId } },
                    { upsert: true, new: true }
                ).catch(() => null);

                if (!modSettings) {
                    await message.reply({ content: '❌ Failed to update anti-swear settings (database error).' }).catch(() => null);
                    return;
                }

                const disabled = Array.isArray(modSettings.antiSwearDisabledChannels) ? modSettings.antiSwearDisabledChannels : [];
                const disabledSet = new Set(disabled);

                if (lower === '/turn_off_anti') {
                    disabledSet.add(channelId);
                    modSettings.antiSwearDisabledChannels = Array.from(disabledSet);
                    await modSettings.save().catch(() => null);
                    await message.reply({ content: '✅ Anti-swear system is now **OFF** in this room.' }).catch(() => null);
                    return;
                }

                if (lower === '/turn_on_anti') {
                    disabledSet.delete(channelId);
                    modSettings.antiSwearDisabledChannels = Array.from(disabledSet);
                    await modSettings.save().catch(() => null);
                    await message.reply({ content: '✅ Anti-swear system is now **ON** in this room.' }).catch(() => null);
                    return;
                }
            }
        } catch (e) {
            console.error('[ANTISWEAR TOGGLE] Error:', e);
        }

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

        // --- Instagram/TikTok Auto-Processing (never delete social links) ---
        try {
            const securityCfg = await GuildSecurityConfig.findOne({ guildId: message.guild.id }).catch(() => null);
            const antiLinkEnabled = securityCfg?.antiLinkEnabled !== false;

            const content = String(message.content || '');
            const socialType = checkLink(content);
            if (socialType === 'INSTAGRAM' || socialType === 'TIKTOK') {
                const urls = extractUrls(content).slice(0, 3);

                await message.reply({ content: 'Processing your video...' }).catch(() => null);

                for (const url of urls) {
                    let embedUrl = url;
                    if (socialType === 'TIKTOK') {
                        embedUrl = url.replace(/https?:\/\/(www\.)?tiktok\.com\//i, 'https://www.vxtiktok.com/');
                    } else {
                        embedUrl = url.replace(/https?:\/\/(www\.)?instagram\.com\//i, 'https://ddinstagram.com/');
                    }
                    await message.channel.send({ content: embedUrl }).catch(() => null);
                }
                return;
            }

            if (antiLinkEnabled) {
                const isServerOwner = message.guild?.ownerId === message.author.id;
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

                const modSettings = await ModSettings.findOne({ guildId: message.guild.id }).catch(() => null);
                const whitelistRoles = Array.isArray(modSettings?.whitelistRoles) ? modSettings.whitelistRoles : [];
                const whitelistChannels = Array.isArray(modSettings?.whitelistChannels) ? modSettings.whitelistChannels : [];
                const isWhitelisted = Boolean(
                    message.channelId === '1475546263977066606' ||
                    (message.channelId && whitelistChannels.includes(message.channelId)) ||
                    (message.member?.roles?.cache && whitelistRoles.some(r => message.member.roles.cache.has(r)))
                );

                if (!isServerOwner && !isAdministrator && !isWhitelisted) {
                    const linkType = checkLink(content);

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
            const disabledChannels = Array.isArray(modSettings?.antiSwearDisabledChannels) ? modSettings.antiSwearDisabledChannels : [];
            const antiSwearEnabledHere = antiSwearEnabled && !disabledChannels.includes(message.channelId);

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
                    antiSwearEnabledHere,
                    isServerOwner,
                    isAdministrator,
                    isWhitelisted,
                });
                console.log('[ANTISWEAR] textForModeration=', { text: textForModeration || message.content });
            }

            if (antiSwearEnabledHere && !isServerOwner && !isAdministrator && !isWhitelisted) {
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
