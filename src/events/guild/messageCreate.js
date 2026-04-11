const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { checkLink, extractUrls } = require('../../utils/securityUtils');
const ModSettings = require('../../models/ModSettings');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const WarnCase = require('../../models/WarnCase');
const { detectProfanitySimple } = require('../../utils/moderation/coreDetector');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');
 const { handleSocialVideoPreview } = require('../../services/socialVideoPreviewService');

 const PARTNERS_CHAT_CHANNEL_ID = '1475546263977066606';
 const PARTNERS_CHAT_WRITER_ROLE_ID = '1484963266177531986';

 const ANTISWEAR_DEBUG = String(process.env.ANTISWEAR_DEBUG || '').toLowerCase() === 'true';

const ANTI_SPAM_TIMEOUT_MS = 60 * 60 * 1000;
const ANTI_SPAM_RATE_WINDOW_MS = 10 * 1000;
const ANTI_SPAM_RATE_LIMIT = 10;
const ANTI_SPAM_IDENTICAL_WINDOW_MS = 10 * 1000;
const ANTI_SPAM_IDENTICAL_LIMIT = 10;
const ANTI_SPAM_MENTION_LIMIT = 10;

// Map<GuildId, Map<UserId, { recentMsgs: { t: number, c: string }[], identical: Map<string, { t: number, c: string }[]>, punishedUntil: number }>>
const antiSpamTracker = new Map();
// Map<GuildId, Map<UserId, { strikes: number, lastStrikeAt: number }>>
const antiSpamStrikeTracker = new Map();
// Map<GuildId, { cfg: any, fetchedAt: number }>
const antiSpamConfigCache = new Map();
const ANTI_SPAM_CFG_TTL_MS = 30 * 1000;

const ANTI_SPAM_ENFORCE_COOLDOWN_MS = 5 * 1000;

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

function eloraParseHumanDurationToMs(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return null;
    const m = raw.match(/^(\d+)([a-z])?$/i);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = (m[2] || '').toLowerCase();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    if (!unit) return n * minute;
    if (unit === 'h') return n * hour;
    if (unit === 'd') return n * day;
    if (unit === 'w') return n * week;
    if (unit === 'm') return n * month;
    return null;
}

async function eloraResolveTargetMember(message, parts, idTokenIndex) {
    const mentioned = message.mentions?.members?.first?.() || null;
    if (mentioned) return mentioned;

    const token = String(parts?.[idTokenIndex] || '').trim();
    const id = token.replace(/\D/g, '');
    if (!id || id.length < 15) return null;
    return message.guild.members.fetch(id).catch(() => null);
}

 function eloraNormalizeForSpamKey(content) {
     const raw = String(content || '');
     return raw
         .toLowerCase()
         .replace(/\s+/g, ' ')
         .trim()
         .slice(0, 300);
 }

 function eloraSafeUserTag(user) {
     if (!user) return 'Unknown';
     const direct = user.tag;
     if (direct) return direct;
     const username = user.username || 'Unknown';
     const disc = user.discriminator;
     if (disc && disc !== '0') return `${username}#${disc}`;
     return username;
 }

 function eloraBuildSpamEvidenceText(evidenceMessages) {
     const msgs = Array.isArray(evidenceMessages) ? evidenceMessages : [];
     const lines = [];
     for (let i = 0; i < msgs.length; i++) {
         const raw = String(msgs[i] ?? '');
         const safe = raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
         lines.push(`${i + 1}) ${safe || '[empty]'}`);
     }
     const joined = lines.join('\n');
     return joined.length > 1000 ? `${joined.slice(0, 1000)}…` : joined;
 }

 async function eloraGetGuildSecurityConfigCached(guildId) {
     if (!guildId) return null;
     const now = Date.now();
     const hit = antiSpamConfigCache.get(guildId);
     if (hit && now - hit.fetchedAt < ANTI_SPAM_CFG_TTL_MS) return hit.cfg;
     const cfg = await GuildSecurityConfig.findOneAndUpdate(
         { guildId },
         { $setOnInsert: { guildId } },
         { upsert: true, new: true }
     ).catch(() => null);
     antiSpamConfigCache.set(guildId, { cfg, fetchedAt: now });
     return cfg;
 }

 function eloraIsStaffExempt(message, cfg) {
     const member = message.member;
     if (!member) return false;

     // Owner is always exempt
     if (member.id === member.guild.ownerId) return true;

     const perms = member.permissions;
     const isAdmin = Boolean(perms?.has?.(PermissionFlagsBits.Administrator));
     if (isAdmin) return true;

     // Partners chat hybrid: treat writers as staff-exempt inside that channel
     if (message.channelId === PARTNERS_CHAT_CHANNEL_ID) {
         const hasWriterRole = Boolean(member.roles?.cache?.has?.(PARTNERS_CHAT_WRITER_ROLE_ID));
         if (hasWriterRole) return true;
     }

     const wlUsers = Array.isArray(cfg?.whitelistUsers) ? cfg.whitelistUsers : [];
     if (wlUsers.includes(message.author.id)) return true;

     const wlRoles = Array.isArray(cfg?.whitelistRoles) ? cfg.whitelistRoles : [];
     if (wlRoles.length > 0) {
         const roleIds = member.roles?.cache ? Array.from(member.roles.cache.keys()) : [];
         for (const r of roleIds) {
             if (wlRoles.includes(r)) return true;
         }
     }

     return false;
 }

 async function eloraAntiSpamLogAlert({ guild, client, cfg, offenderId, offenderTag, channelId, penaltyHours, spamType, triggerCount, evidenceMessages }) {
     const logChannelId = cfg?.spamLogChannelId || null;
     if (!logChannelId) return;
     const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
     if (!logChannel) return;

     const hours = Number(penaltyHours || 1);
     const tag = String(offenderTag || '').trim() || `Unknown | ${offenderId}`;
     const type = String(spamType || 'Unknown').trim();
     const count = Number.isFinite(Number(triggerCount)) ? Number(triggerCount) : null;
     const evidenceText = eloraBuildSpamEvidenceText(evidenceMessages);

     const embed = new EmbedBuilder()
         .setColor('#000000')
         .setTitle('**⟁ Anti-Spam Alert**')
         .addFields(
             { name: 'OFFENDER', value: `**${tag} | ${offenderId}**`, inline: false },
             { name: 'SPAM TYPE', value: `**${type || 'Unknown'}**`, inline: false },
             { name: 'TRIGGER COUNT', value: `**${count === null ? 'Unknown' : String(count)}**`, inline: false },
             { name: 'EVIDENCE', value: `\`\`\`\n${evidenceText || '[no evidence captured]'}\n\`\`\``, inline: false },
             { name: 'ACTION', value: `**Timeout: ${hours} hour(s)**\n**Deleted: last 10 messages**`, inline: false }
         )
         .setFooter({ text: '**<a:custom_check:1487391271759646750>**' });

     await logChannel.send({ embeds: [embed] }).catch(() => null);
 }

 async function eloraAntiSpamEnforce(message, cfg, penaltyHours, meta) {
     const member = message.member;
     const hours = Math.max(1, Number(penaltyHours || 1));
     const timeoutMs = hours * 60 * 60 * 1000;
     if (member) {
         const me = message.guild.members.me;
         const canModerate = Boolean(me?.permissions?.has?.(PermissionFlagsBits.ModerateMembers));
         if (canModerate && member.moderatable) {
             await member.timeout(timeoutMs, '⟁ Anti-Spam: spam detected').catch(() => null);
         }
     }

     try {
         const fetched = await message.channel.messages.fetch({ limit: 50 }).catch(() => null);
         if (fetched) {
             const toDelete = fetched
                 .filter(m => m?.author?.id === message.author.id)
                 .first(10);
             for (const m of toDelete) {
                 await m.delete().catch(() => null);
             }
         }
     } catch (_) {}

     await eloraAntiSpamLogAlert({
         guild: message.guild,
         client: message.client,
         cfg,
         offenderId: message.author.id,
         offenderTag: eloraSafeUserTag(message.author),
         channelId: message.channelId,
         penaltyHours: hours,
         spamType: meta?.spamType,
         triggerCount: meta?.triggerCount,
         evidenceMessages: meta?.evidenceMessages
     });
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
         .setTitle('⟁ SCAM LINK NEUTRALIZED')
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

        if (message.channelId === PARTNERS_CHAT_CHANNEL_ID) return;

         try {
             const cfg = await eloraGetGuildSecurityConfigCached(message.guild.id);
             const antiSpamEnabled = cfg?.antiSpamEnabled !== false;
             if (antiSpamEnabled && !eloraIsStaffExempt(message, cfg)) {
                 const guildId = message.guild.id;
                 const userId = message.author.id;
                 const now = Date.now();

                 if (!antiSpamTracker.has(guildId)) antiSpamTracker.set(guildId, new Map());
                 const guildMap = antiSpamTracker.get(guildId);

                 if (!guildMap.has(userId)) {
                     guildMap.set(userId, { recentMsgs: [], identical: new Map(), punishedUntil: 0 });
                 }

                 const state = guildMap.get(userId);
                 if (state.punishedUntil && now < state.punishedUntil) {
                     return;
                 }

                 // Escalation tracker: 1h, 2h, 3h...
                 if (!antiSpamStrikeTracker.has(guildId)) antiSpamStrikeTracker.set(guildId, new Map());
                 const strikeMap = antiSpamStrikeTracker.get(guildId);
                 const strikeEntry = strikeMap.get(userId) || { strikes: 0, lastStrikeAt: 0 };

                 // Mentions spam (single message)
                 const mentionCount = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0);
                 const mentionSpam = mentionCount > ANTI_SPAM_MENTION_LIMIT;

                 // Rate spam (messages per window)
                 state.recentMsgs = Array.isArray(state.recentMsgs) ? state.recentMsgs : [];
                 state.recentMsgs.push({ t: now, c: String(message.content || '') });
                 state.recentMsgs = state.recentMsgs.filter(m => m && (now - m.t <= ANTI_SPAM_RATE_WINDOW_MS));
                 if (state.recentMsgs.length > 50) state.recentMsgs = state.recentMsgs.slice(-50);
                 const rateSpam = state.recentMsgs.length > ANTI_SPAM_RATE_LIMIT;

                 // Identical spam (same content within window)
                 const key = eloraNormalizeForSpamKey(message.content);
                 if (!state.identical || !(state.identical instanceof Map)) state.identical = new Map();
                 if (key) {
                     const arr = state.identical.get(key) || [];
                     arr.push({ t: now, c: String(message.content || '') });
                     const filtered = arr.filter(m => m && (now - m.t <= ANTI_SPAM_IDENTICAL_WINDOW_MS));
                     state.identical.set(key, filtered.length > 10 ? filtered.slice(-10) : filtered);
                 }
                 const identicalArr = key ? (state.identical.get(key) || []) : [];
                 const identicalSpam = identicalArr.length >= ANTI_SPAM_IDENTICAL_LIMIT;

                 if (mentionSpam || rateSpam || identicalSpam) {
                     // prevent repeated enforcement spam for the same burst, but allow re-trigger later
                     state.punishedUntil = now + ANTI_SPAM_ENFORCE_COOLDOWN_MS;

                     strikeEntry.strikes = Number(strikeEntry.strikes || 0) + 1;
                     strikeEntry.lastStrikeAt = now;
                     strikeMap.set(userId, strikeEntry);

                     const penaltyHours = strikeEntry.strikes;
                     let spamType = 'Unknown';
                     let triggerCount = 0;
                     let evidenceMessages = [];

                     if (mentionSpam) {
                         spamType = 'Mass Mentions';
                         triggerCount = mentionCount;
                         evidenceMessages = [String(message.content || '')];
                     } else if (identicalSpam) {
                         spamType = 'Identical Messages';
                         triggerCount = identicalArr.length;
                         evidenceMessages = identicalArr.map(m => String(m?.c || '')).filter(Boolean);
                     } else if (rateSpam) {
                         spamType = 'Rate Limit (Flood)';
                         triggerCount = state.recentMsgs.length;
                         evidenceMessages = state.recentMsgs.map(m => String(m?.c || '')).filter(Boolean);
                     }

                     await eloraAntiSpamEnforce(message, cfg, penaltyHours, { spamType, triggerCount, evidenceMessages });
                     return;
                 }
             }
         } catch (_) {
             // ignore
         }

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
        // حطه @mention|id reason...
        // حطيه @mention|id reason...
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

                const targetMember = await eloraResolveTargetMember(message, parts, 1);
                if (!targetMember) {
                    await message.reply({ content: `**لازم تعمل منشن يا قلبي صحصح كده ${EMOJI_NEED_MENTION}**` }).catch(() => null);
                    return;
                }

                const reason = parts.slice(2).join(' ').trim() || `Banned by ${message.author.tag}`;

                if (targetMember.id === message.guild.ownerId) return;
                if (!targetMember.bannable) {
                    await message.reply({ content: `**مش قادر أبند الشخص ده (Hierarchy/Permissions). ${EMOJI_NEED_MENTION}**` }).catch(() => null);
                    return;
                }

                const banDmText =
                    `**✖ Banned from ELORA**\n` +
                    `**⤿ You have been permanently banned.**\n` +
                    `**▫️ Reason: ${reason}**`;
                await targetMember.user?.send?.(banDmText).catch(() => null);

                await targetMember.ban({ reason }).catch(() => null);
                await message.reply({ content: `**خرج من زوروا يا روحي ${EMOJI_OK}**` }).catch(() => null);
                return;
            }
        } catch (e) {
            console.error('[لف BAN] Error:', e);
        }

        // --- .warn / .تحذير + .reset warn / .اعفاء ---
        try {
            const raw = String(message.content || '').trim();
            const parts = raw.split(/\s+/).filter(Boolean);
            const cmd = parts[0];
            const isWarnCmd = cmd === '.warn' || cmd === '.تحذير';
            const isWarnsCmd = cmd === '.warns';
            const isResetWarnCmd = (cmd === '.reset' && parts[1]?.toLowerCase?.() === 'warn') || cmd === '.اعفاء';

            if (isWarnsCmd) {
                let targetUserId = null;

                const refMessageId = message.reference?.messageId || null;
                if (refMessageId) {
                    const refMsg = await message.channel.messages.fetch(refMessageId).catch(() => null);
                    if (refMsg?.author?.id) targetUserId = refMsg.author.id;
                }

                if (!targetUserId) {
                    const targetMember = await eloraResolveTargetMember(message, parts, 1);
                    if (targetMember?.user?.id) targetUserId = targetMember.user.id;
                }

                if (!targetUserId) {
                    await message.reply({ content: '**✖ Invalid syntax. Use: .warns @mention OR reply with .warns OR .warns userId**' }).catch(() => null);
                    return;
                }

                const warnCount = await WarnCase.countDocuments({ guildId: message.guild.id, userId: targetUserId }).catch(() => 0);
                const warnWord = warnCount === 1 ? 'warning' : 'warnings';
                await message.reply({ content: `**this user, <@${targetUserId}> has ${warnCount} ${warnWord}**` }).catch(() => null);
                return;
            }

            if (isResetWarnCmd) {
                const canManageMessages = message.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
                if (!canManageMessages && !isAdministrator) {
                    await message.reply({ content: '**✖ You cannot use this command.**' }).catch(() => null);
                    return;
                }

                const targetIndex = cmd === '.reset' ? 2 : 1;
                const targetMember = await eloraResolveTargetMember(message, parts, targetIndex);
                const targetUser = targetMember?.user || null;
                if (!targetUser) {
                    await message.reply({ content: '**✖ Invalid syntax. Use: .reset warn @mention**' }).catch(() => null);
                    return;
                }

                const res = await WarnCase.deleteMany({ guildId: message.guild.id, userId: targetUser.id }).catch(() => null);
                const deleted = res?.deletedCount || 0;
                await message.reply({ content: `**✓ Cleared ${deleted} warning(s) for <@${targetUser.id}>.**` }).catch(() => null);
                return;
            }

            if (isWarnCmd) {
                const canManageMessages = message.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
                if (!canManageMessages && !isAdministrator) {
                    await message.reply({ content: '**✖ You cannot use this command.**' }).catch(() => null);
                    return;
                }

                const targetMember = await eloraResolveTargetMember(message, parts, 1);
                const targetUser = targetMember?.user || null;
                if (!targetUser || !targetMember) {
                    await message.reply({ content: '**✖ Invalid syntax. Use: .warn @mention [reason]**' }).catch(() => null);
                    return;
                }

                const isSelf = targetUser.id === message.author.id;
                const isBot = Boolean(targetUser.bot);
                const isTargetAdmin = Boolean(targetMember?.permissions?.has?.(PermissionFlagsBits.Administrator));
                if (isSelf || isBot || isTargetAdmin) {
                    await message.reply({ content: '**✖ You cannot warn this user.**' }).catch(() => null);
                    return;
                }

                const reasonRaw = parts.slice(2).join(' ').trim();
                const hasReason = Boolean(reasonRaw);
                const reasonLine = hasReason
                    ? `**▫️ Reason: ${reasonRaw}**`
                    : '**▫️ No reason provided.**';

                await WarnCase.create({
                    guildId: message.guild.id,
                    userId: targetUser.id,
                    moderatorId: message.author.id,
                    reason: hasReason ? reasonRaw : 'No reason provided.'
                }).catch(() => null);

                const warnCount = await WarnCase.countDocuments({ guildId: message.guild.id, userId: targetUser.id }).catch(() => 0);

                if (warnCount >= 3) {
                    const finalDmText =
                        `**✖ Banned from ELORA**\n` +
                        `**⤿ You have been permanently banned.**\n` +
                        `**▫️ Reason: Reached the maximum limit of 3 warnings.**`;

                    await targetUser.send(finalDmText).catch(() => null);
                    await message.guild.members.ban(targetUser.id, { reason: 'Reached 3 warnings' }).catch(() => null);
                    await WarnCase.deleteMany({ guildId: message.guild.id, userId: targetUser.id }).catch(() => null);

                    await message.reply({
                        content: `**❖ The user <@${targetUser.id}> has reached 3 warnings and has been permanently banned.**`
                    }).catch(() => null);
                    return;
                }

                const dmText =
                    `**⟁ Warning Received**\n` +
                    `**⤿ You have been warned by <@${message.author.id}>.**\n` +
                    `${reasonLine}\n` +
                    `**▫️ Warning Count: ${warnCount}/3**`;

                await targetUser.send(dmText).catch(() => null);
                await message.reply({ content: `**✓ The user <@${targetUser.id}> has been warned.**` }).catch(() => null);
                return;
            }
        } catch (e) {
            console.error('[WARN/AUTOBAN] Error:', e);
        }

        try {
            const raw = String(message.content || '').trim();
            const lower = raw.toLowerCase();
            const isToggleCmd = lower === '/turn_on_anti' || lower === '/turn_off_anti';
            if (isToggleCmd) {
                const isServerOwner = message.guild?.ownerId === message.author.id;
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
                if (!isServerOwner && !isAdministrator) {
                    await message.reply({ content: '**✖ You need Administrator permission to use this command.**' }).catch(() => null);
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
                    await message.reply({ content: '**✖ Failed to update anti-swear settings (database error).**' }).catch(() => null);
                    return;
                }

                const disabled = Array.isArray(modSettings.antiSwearDisabledChannels) ? modSettings.antiSwearDisabledChannels : [];
                const disabledSet = new Set(disabled);

                if (lower === '/turn_off_anti') {
                    disabledSet.add(channelId);
                    modSettings.antiSwearDisabledChannels = Array.from(disabledSet);
                    await modSettings.save().catch(() => null);
                    await message.reply({ content: '**✓ Anti-swear system is now OFF in this room.**' }).catch(() => null);
                    return;
                }

                if (lower === '/turn_on_anti') {
                    disabledSet.delete(channelId);
                    modSettings.antiSwearDisabledChannels = Array.from(disabledSet);
                    await modSettings.save().catch(() => null);
                    await message.reply({ content: '**✓ Anti-swear system is now ON in this room.**' }).catch(() => null);
                    return;
                }
            }
        } catch (e) {
            console.error('[ANTISWEAR TOGGLE] Error:', e);
        }

        // --- Social Video Link Detection + Premium Preview (Cobalt MP4 attach) ---
        try {
            const didPreview = await handleSocialVideoPreview(message).catch(() => false);
            if (didPreview) return;

            const securityCfg = await GuildSecurityConfig.findOne({ guildId: message.guild.id }).catch(() => null);
            const antiLinkEnabled = securityCfg?.antiLinkEnabled !== false;

            if (antiLinkEnabled && message.channelId !== PARTNERS_CHAT_CHANNEL_ID) {
                const isServerOwner = message.guild?.ownerId === message.author.id;
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

                const modSettings = await ModSettings.findOne({ guildId: message.guild.id }).catch(() => null);
                const whitelistRoles = Array.isArray(modSettings?.whitelistRoles) ? modSettings.whitelistRoles : [];
                const whitelistChannels = Array.isArray(modSettings?.whitelistChannels) ? modSettings.whitelistChannels : [];
                const hasPartnersWriterRole = Boolean(message.member?.roles?.cache?.has?.(PARTNERS_CHAT_WRITER_ROLE_ID));
                const isWhitelisted = Boolean(
                    message.channelId === PARTNERS_CHAT_CHANNEL_ID ||
                    hasPartnersWriterRole ||
                    (message.channelId && whitelistChannels.includes(message.channelId)) ||
                    (message.member?.roles?.cache && whitelistRoles.some(r => message.member.roles.cache.has(r)))
                );

                if (!isServerOwner && !isAdministrator && !isWhitelisted) {
                    const content = String(message.content || '');
                    const linkType = checkLink(content);

                    if (linkType === 'INVITE') {
                        await message.delete().catch(() => {});

                        const warn = await message.channel.send({
                            content: `**⟁ ${message.author}, Discord invite links are not allowed in this server.**`
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
                                content: `**⟁ ${message.author}, that link looks suspicious and was removed.**`
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
            console.error('[SOCIAL_PREVIEW/ANTILINK] Error:', e);
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
            const hasPartnersWriterRole = Boolean(message.member?.roles?.cache?.has?.(PARTNERS_CHAT_WRITER_ROLE_ID));
            const isWhitelisted = Boolean(
                (message.channelId === PARTNERS_CHAT_CHANNEL_ID && hasPartnersWriterRole) ||
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
