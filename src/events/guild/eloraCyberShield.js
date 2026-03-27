const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');

// ======================================================
// ELORA Cyber-Shield (Anti-Phishing & Scam)
// Module: eloraCyberShield.js
// Event: messageCreate
// ======================================================
// Source feed (no API keys required):
// - SinkingYachts: https://phish.sinking.yachts/v2/all
//
// Performance model:
// - Fetch once at startup, cache in a Set
// - Refresh every 6 hours in background
//
// You may configure:
// - Optional fixed log channel: set ELORA_SECURITY_LOG_CHANNEL_ID in .env

const FEED_URL = 'https://phish.sinking.yachts/v2/all';
const REFRESH_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 24 * 60 * 60 * 1000;

const LOG_CHANNEL_ID = process.env.ELORA_SECURITY_LOG_CHANNEL_ID || null;

let feedStarted = false;
let badDomains = new Set();
let lastFeedUpdateAt = 0;

async function resolveLogChannel(guild, client) {
    if (!guild) return null;

    if (LOG_CHANNEL_ID) {
        const ch = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (ch && ch.isTextBased?.()) return ch;
    }

    return getGuildLogChannel(guild, client).catch(() => null);
}

function normalizeHost(host) {
    const h = String(host || '').trim().toLowerCase();
    if (!h) return null;

    // Remove leading/trailing dots and common prefixes
    const trimmed = h.replace(/^\.+|\.+$/g, '');
    const noWww = trimmed.startsWith('www.') ? trimmed.slice(4) : trimmed;

    // Strip any port if present
    return noWww.split(':')[0];
}

function defangDomain(domain) {
    return String(domain || '').replace(/\./g, '[.]');
}

function hostMatchesBadSet(host) {
    const normalized = normalizeHost(host);
    if (!normalized) return null;

    // Exact match
    if (badDomains.has(normalized)) return normalized;

    // Subdomain handling: check suffixes (a.b.c -> b.c -> c)
    const parts = normalized.split('.').filter(Boolean);
    if (parts.length < 2) return null;

    for (let i = 1; i < parts.length - 1; i++) {
        const suffix = parts.slice(i).join('.');
        if (badDomains.has(suffix)) return suffix;
    }

    return null;
}

function extractHostsFromMessage(content) {
    const text = String(content || '');
    if (!text) return [];

    const hosts = new Set();

    // 1) Full URLs (http/https)
    const urlRegex = /https?:\/\/[^\s<>()]+/gi;
    const urlMatches = text.match(urlRegex) || [];
    for (const raw of urlMatches) {
        try {
            const u = new URL(raw);
            const host = normalizeHost(u.hostname);
            if (host) hosts.add(host);
        } catch (_) {
            // Ignore malformed URLs
        }
    }

    // 2) Bare domains (common scam pattern: "discord-nitro.com")
    // Avoid matching emails by requiring a dot + TLD and a word boundary.
    const domainRegex = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;
    const domainMatches = text.match(domainRegex) || [];
    for (const raw of domainMatches) {
        const host = normalizeHost(raw);
        if (host) hosts.add(host);
    }

    return Array.from(hosts);
}

async function fetchBadDomainSet() {
    // Node 18+ has global fetch
    const res = await fetch(FEED_URL, {
        method: 'GET',
        headers: {
            'accept': 'application/json'
        }
    });

    if (!res.ok) {
        throw new Error(`Feed HTTP ${res.status}`);
    }

    const json = await res.json();

    // SinkingYachts currently returns an array of domain strings.
    // We accept a few shapes defensively.
    const next = new Set();
    if (Array.isArray(json)) {
        for (const item of json) {
            if (typeof item === 'string') {
                const host = normalizeHost(item);
                if (host) next.add(host);
            } else if (item && typeof item === 'object') {
                const d = normalizeHost(item.domain || item.host || item.hostname);
                if (d) next.add(d);
            }
        }
    } else if (json && typeof json === 'object') {
        const arr = json.domains || json.data || json.blacklist || [];
        if (Array.isArray(arr)) {
            for (const item of arr) {
                const host = normalizeHost(item);
                if (host) next.add(host);
            }
        }
    }

    if (next.size === 0) {
        throw new Error('Feed parsed but produced empty domain set');
    }

    badDomains = next;
    lastFeedUpdateAt = Date.now();
}

function startFeedUpdater() {
    if (feedStarted) return;
    feedStarted = true;

    // Initial fetch (do not block message handling; failures are logged)
    fetchBadDomainSet().catch((e) => {
        console.error('[ELORA Cyber-Shield] Initial feed fetch failed:', e);
    });

    setInterval(() => {
        fetchBadDomainSet().catch((e) => {
            console.error('[ELORA Cyber-Shield] Feed refresh failed:', e);
        });
    }, REFRESH_MS).unref?.();
}

function buildAlertEmbed({ offender, channel, domain }) {
    const lines = [
        '```ansi',
        '\u001b[2;31m[ELORA CYBER-SHIELD]\u001b[0m \u001b[1;31mSCAM LINK NEUTRALIZED\u001b[0m',
        `Domain: ${defangDomain(domain)}`,
        'Status: THREAT REMOVED + USER QUARANTINED',
        '```'
    ].join('\n');

    return new EmbedBuilder()
        .setColor(THEME?.COLORS?.ERROR || '#8B0000')
        .setTitle('⟁ SCAM LINK NEUTRALIZED')
        .setDescription(lines)
        .addFields(
            {
                name: 'Offender',
                value: `${offender} (\`${offender.id}\`)`,
                inline: false
            },
            {
                name: 'Channel',
                value: `${channel} (\`${channel.id}\`)`,
                inline: false
            },
            {
                name: 'Malicious Domain',
                value: `\`${defangDomain(domain)}\``,
                inline: false
            },
            {
                name: 'Action Taken',
                value: 'Message Deleted & User Timed Out for 24h',
                inline: false
            }
        )
        .setTimestamp();
}

module.exports = {
    // NOTE: Cyber-Shield has been merged into src/events/guild/messageCreate.js for deterministic priority.
    // This file is intentionally disabled to prevent double-processing.
    name: 'eloraCyberShieldDisabled',
    async execute() {
        return;
    }
};
