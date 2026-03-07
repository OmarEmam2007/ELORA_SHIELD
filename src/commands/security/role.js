const { PermissionFlagsBits } = require('discord.js');

const DONE_EMOJI = '<:555:1479967165619634348>';

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
    name: 'role',
    aliases: ['addrole', 'giverole', 'r'],
    async execute(message, client, args) {
        if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(`${DONE_EMOJI} **ʏᴏᴜ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ʀᴏʟᴇꜱ ᴛᴏ ᴜꜱᴇ ᴛʜɪꜱ.**`);
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply(`${DONE_EMOJI} **ᴜꜱᴀɢᴇ: .ʀ @ᴜꜱᴇʀ [ʀᴏʟᴇ]**`);
        }

        const roleQuery = args.slice(1).join(' ').trim();
        if (!roleQuery) {
            return message.reply(`${DONE_EMOJI} **ᴜꜱᴀɢᴇ: .ʀ @ᴜꜱᴇʀ [ʀᴏʟᴇ]**`);
        }

        const role = findRole(message.guild, roleQuery);
        if (!role) {
            return message.reply(`${DONE_EMOJI} **ʀᴏʟᴇ ɴᴏᴛ ꜰᴏᴜɴᴅ.**`);
        }

        if (role.managed || role.name === '@everyone') {
            return message.reply(`${DONE_EMOJI} **ɪ ᴄᴀɴ'ᴛ ɢɪᴠᴇ ᴛʜɪꜱ ʀᴏʟᴇ.**`);
        }

        const botMember = message.guild.members.me;
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(`${DONE_EMOJI} **ɪ ɴᴇᴇᴅ ᴍᴀɴᴀɢᴇ ʀᴏʟᴇꜱ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        if (!role.editable || (botMember.roles.highest?.position ?? 0) <= role.position) {
            return message.reply(`${DONE_EMOJI} **ɪ ᴄᴀɴ'ᴛ ɢɪᴠᴇ ᴛʜɪꜱ ʀᴏʟᴇ (ʜɪᴇʀᴀʀᴄʜʏ).**`);
        }

        if (targetMember.roles.cache.has(role.id)) {
            return message.reply(`${DONE_EMOJI} **ᴛʜɪꜱ ᴜꜱᴇʀ ᴀʟʀᴇᴀᴅʏ ʜᴀꜱ ᴛʜᴀᴛ ʀᴏʟᴇ.**`);
        }

        try {
            await targetMember.roles.add(role, `Prefix role assignment by ${message.author.tag}`);

            return message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ᴛʜᴇ ʀᴏʟᴇ ʜᴀꜱ ʙᴇᴇɴ ɢɪᴠᴇɴ.**`);
        } catch (e) {
            console.error('role command error:', e);
            return message.reply(`${DONE_EMOJI} **ᴇʀʀᴏʀ.**`);
        }
    }
};
