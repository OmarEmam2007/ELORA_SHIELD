const { PermissionFlagsBits } = require('discord.js');
const ModSettings = require('../../models/ModSettings');

const VERIFY_ROLE_ID = '1461769279195058342';
const VERIFY_EMOJI_ID = '1479967165619634348';

function toSmallCaps(text) {
    const map = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
        n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
    };
    return String(text || '').toLowerCase().split('').map(ch => map[ch] || ch).join('');
}

module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user, client) {
        try {
            if (!reaction || !user) return;
            if (user.bot) return;

            // Handle partials
            if (reaction.partial) {
                try { reaction = await reaction.fetch(); } catch (_) { return; }
            }
            if (reaction.message?.partial) {
                try { await reaction.message.fetch(); } catch (_) { /* ignore */ }
            }

            const message = reaction.message;
            const guild = message?.guild;
            if (!guild) return;

            const emojiId = reaction.emoji?.id || null;
            if (emojiId !== VERIFY_EMOJI_ID) return;

            const settings = await ModSettings.findOne({ guildId: guild.id }).lean().catch(() => null);
            const panelMessageId = settings?.verificationPanelMessageId;
            if (!panelMessageId) return;
            if (message.id !== panelMessageId) return;

            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) return;

            // Basic permission sanity (bot must be able to manage roles)
            const me = guild.members.me || (client?.user ? await guild.members.fetch(client.user.id).catch(() => null) : null);
            if (!me) return;
            if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return;

            if (member.roles.cache.has(VERIFY_ROLE_ID)) return;

            await member.roles.add(VERIFY_ROLE_ID, 'Verification reaction').catch(() => null);
            await user.send(toSmallCaps('YOU ARE NOW VERIFIED')).catch(() => null);
        } catch (e) {
            console.error('[VERIFY] messageReactionAdd error:', e);
        }
    }
};
