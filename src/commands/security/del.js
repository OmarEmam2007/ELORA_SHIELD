const { PermissionFlagsBits } = require('discord.js');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';

const SMALL_CAPS_MAP = {
    'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ғ': 'f',
    'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l',
    'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ꞯ': 'q', 'ʀ': 'r',
    'ꜱ': 's', 's': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w',
    'x': 'x', 'ʏ': 'y', 'ᴢ': 'z'
};

function normalizeRoleQuery(input) {
    if (!input) return '';

    const lowered = String(input).toLowerCase().normalize('NFKD');
    const mapped = lowered.replace(/[\s\S]/g, (ch) => SMALL_CAPS_MAP[ch] || ch);

    return mapped
        .replace(/[\p{M}]/gu, '')
        .replace(/[^a-z0-9]/g, '');
}

function findRole(guild, roleQuery) {
    if (!guild) return null;

    const idMatch = String(roleQuery).match(/<@&(\d+)>/) || String(roleQuery).match(/\b(\d{15,25})\b/);
    if (idMatch) {
        const byId = guild.roles.cache.get(idMatch[1]);
        if (byId) return byId;
    }

    const qNorm = normalizeRoleQuery(roleQuery);
    if (!qNorm) return null;

    const roles = [...guild.roles.cache.values()].filter(r => r && r.name && r.name !== '@everyone');

    const exact = roles.find(r => normalizeRoleQuery(r.name) === qNorm);
    if (exact) return exact;

    const partial = roles.find(r => normalizeRoleQuery(r.name).includes(qNorm));
    if (partial) return partial;

    const rawLower = String(roleQuery).toLowerCase();
    const raw = roles.find(r => String(r.name).toLowerCase().includes(rawLower));
    if (raw) return raw;

    return null;
}

module.exports = {
    name: 'del',
    aliases: ['rem', 'remove'],
    async execute(message, client, args) {
        if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(`${ERROR_EMOJI} **ʏᴏᴜ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ʀᴏʟᴇꜱ ᴛᴏ ᴜꜱᴇ ᴛʜɪꜱ.**`);
        }

        const isRoleSubcommand = args[0]?.toLowerCase() === 'role';
        if (!isRoleSubcommand) {
            return message.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴅᴇʟ ʀᴏʟᴇ @ᴜꜱᴇʀ [ʀᴏʟᴇ]**`);
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴅᴇʟ ʀᴏʟᴇ @ᴜꜱᴇʀ [ʀᴏʟᴇ]**`);
        }

        const roleQuery = args.slice(2).join(' ').trim();
        if (!roleQuery) {
            return message.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴅᴇʟ ʀᴏʟᴇ @ᴜꜱᴇʀ [ʀᴏʟᴇ]**`);
        }

        const role = findRole(message.guild, roleQuery);
        if (!role) {
            return message.reply(`${ERROR_EMOJI} **ʀᴏʟᴇ ɴᴏᴛ ꜰᴏᴜɴᴅ.**`);
        }

        if (role.managed || role.name === '@everyone') {
            return message.reply(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ʀᴇᴍᴏᴠᴇ ᴛʜɪꜱ ʀᴏʟᴇ.**`);
        }

        const botMember = message.guild.members.me;
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(`${ERROR_EMOJI} **ɪ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ʀᴏʟᴇꜱ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        if (!role.editable || (botMember.roles.highest?.position ?? 0) <= role.position) {
            return message.reply(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ʀᴇᴍᴏᴠᴇ ᴛʜɪꜱ ʀᴏʟᴇ (ʜɪᴇʀᴀʀᴄʜʏ).**`);
        }

        if (!targetMember.roles.cache.has(role.id)) {
            return message.reply(`${ERROR_EMOJI} **ᴛʜɪꜱ ᴜꜱᴇʀ ᴅᴏᴇꜱɴ'ᴛ ʜᴀᴠᴇ ᴛʜᴀᴛ ʀᴏʟᴇ.**`);
        }

        try {
            await targetMember.roles.remove(role, `Prefix role removal by ${message.author.tag}`);

            return message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ${targetMember} ʟᴏꜱᴛ ᴛʜᴇ ʀᴏʟᴇ (${String(role?.name || 'role').toUpperCase()}).**`);
        } catch (e) {
            console.error('del role command error:', e);
            return message.reply(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`);
        }
    }
};
