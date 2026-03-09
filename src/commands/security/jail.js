const User = require('../../models/User');
 
const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';
const { canActOnTarget } = require('../../utils/moderationHierarchy');

const MODERATOR_ROLE = '1467467348595314740';
const ADMIN_ROLE = '1467466915902394461';
const JAILED_ROLE = process.env.JAILED_ROLE_ID || '1467467538551279769';
const CASINO_LOGS_ID = '1467466000214655150';

module.exports = {
    name: 'jail',
    async execute(message, client, args) {
        if (!message.guild) return;

        if (!message.member.roles.cache.has(MODERATOR_ROLE) && !message.member.roles.cache.has(ADMIN_ROLE)) {
            return message.reply(`${ERROR_EMOJI} **ʏᴏᴜ ᴅᴏ ɴᴏᴛ ʜᴀᴠᴇ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        const targetUser = message.mentions.users.first();
        const duration = parseInt(args[1]);

        if (!targetUser) {
            return message.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴊᴀɪʟ @ᴜꜱᴇʀ [ʜᴏᴜʀꜱ]**`);
        }

        if (!duration || isNaN(duration) || duration <= 0) {
            return message.reply(`${ERROR_EMOJI} **ᴘʟᴇᴀꜱᴇ ꜱᴘᴇᴄɪꜰʏ ᴀ ᴠᴀʟɪᴅ ᴅᴜʀᴀᴛɪᴏɴ ɪɴ ʜᴏᴜʀꜱ.**`);
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return message.reply(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɴᴏᴛ ꜰᴏᴜɴᴅ ɪɴ ᴛʜɪꜱ ꜱᴇʀᴠᴇʀ.**`);
        }

        const hierarchy = canActOnTarget({ guild: message.guild, invokerMember: message.member, targetMember: targetMember });
        if (!hierarchy.ok) {
            return message.reply(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴊᴀɪʟ ᴛʜɪꜱ ᴜꜱᴇʀ.**`);
        }

        const jailedRole = message.guild.roles.cache.get(JAILED_ROLE);
        if (jailedRole) {
            await targetMember.roles.add(jailedRole).catch(() => { });
        }

        let userProfile = await User.findOne({ userId: targetUser.id, guildId: message.guild.id });
        if (!userProfile) {
            userProfile = new User({ userId: targetUser.id, guildId: message.guild.id });
        }

        userProfile.jailed = true;
        userProfile.jailReleaseTime = new Date(Date.now() + duration * 60 * 60 * 1000);
        await userProfile.save();

        await message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ${targetUser} ʜᴀꜱ ʙᴇᴇɴ ᴊᴀɪʟᴇᴅ.**`);

        const logChannel = message.guild.channels.cache.get(CASINO_LOGS_ID);
        if (logChannel) {
            await logChannel.send(`${DONE_EMOJI} **ᴊᴀɪʟ | ${message.author.tag} -> ${targetUser.tag} | ${duration}h**`).catch(() => { });
        }
    }
};
