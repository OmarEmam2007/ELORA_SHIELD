const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+)/gi;
const inviteRegex = /(discord\.gg|discord\.com\/invite)\/.+/i;
const allowedGifRegex = /(tenor\.com|giphy\.com|\.gif(\b|\?|#))/i;

const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/[\w\-./?%=&#+]+/i;
const tiktokRegex = /https?:\/\/(www\.)?tiktok\.com\/[\w\-./?%=&#+]+/i;

// Simple in-memory tracker for anti-nuke (Rate Limits)
// Map<GuildID, Map<UserID, { action: count, lastTime: timestamp }>>
const antiNukeMap = new Map();

function checkLink(content) {
    if (allowedGifRegex.test(content)) return null;
    if (inviteRegex.test(content)) return 'INVITE';
    if (instagramRegex.test(content)) return 'INSTAGRAM';
    if (tiktokRegex.test(content)) return 'TIKTOK';
    if (linkRegex.test(content)) return 'LINK';
    return null;
}

function extractUrls(content) {
    const text = String(content || '');
    const matches = text.match(/https?:\/\/[^\s<>()]+/gi);
    return Array.isArray(matches) ? matches : [];
}

function checkRateLimit(guildId, userId, action, limit, timeWindow) {
    if (!antiNukeMap.has(guildId)) antiNukeMap.set(guildId, new Map());
    const guildMap = antiNukeMap.get(guildId);

    if (!guildMap.has(userId)) guildMap.set(userId, {});
    const userStats = guildMap.get(userId);

    const now = Date.now();

    if (!userStats[action] || now - userStats[action].lastTime > timeWindow) {
        userStats[action] = { count: 1, lastTime: now };
    } else {
        userStats[action].count++;
    }

    if (userStats[action].count > limit) {
        return true;
    }
    return false;
}

module.exports = { checkLink, extractUrls, checkRateLimit };
