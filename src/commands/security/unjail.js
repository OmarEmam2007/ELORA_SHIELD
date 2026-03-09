const User = require('../../models/User');
 
const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';
const { canActOnTarget } = require('../../utils/moderationHierarchy');

const MODERATOR_ROLE = '1467467348595314740';
const ADMIN_ROLE = '1467466915902394461';
const JAILED_ROLE = '1467467538551279769';
const CASINO_LOGS_ID = '1467466000214655150';

module.exports = {
    name: 'unjail',
    async execute(message, client, args) {
        if (!message.guild) return;

        if (!message.member.roles.cache.has(MODERATOR_ROLE) && !message.member.roles.cache.has(ADMIN_ROLE)) {
            return message.reply(`${ERROR_EMOJI} **ʏᴏᴜ ᴅᴏ ɴᴏᴛ ʜᴀᴠᴇ ᴘᴇʀᴍɪꜱꜱɪᴏɴ.**`);
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴜɴᴊᴀɪʟ @ᴜꜱᴇʀ**`);
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return message.reply(`${ERROR_EMOJI} **ᴜꜱᴇʀ ɴᴏᴛ ꜰᴏᴜɴᴅ ɪɴ ᴛʜɪꜱ ꜱᴇʀᴠᴇʀ.**`);
        }

        const hierarchy = canActOnTarget({ guild: message.guild, invokerMember: message.member, targetMember: targetMember });
        if (!hierarchy.ok) {
            return message.reply(`${ERROR_EMOJI} **ɪ ᴄᴀɴ'ᴛ ᴜɴᴊᴀɪʟ ᴛʜɪꜱ ᴜꜱᴇʀ.**`);
        }

        const jailedRole = message.guild.roles.cache.get(JAILED_ROLE);
        if (jailedRole && targetMember.roles.cache.has(JAILED_ROLE)) {
            await targetMember.roles.remove(jailedRole).catch(() => { });
        }

        let userProfile = await User.findOne({ userId: targetUser.id, guildId: message.guild.id });
        if (userProfile) {
            userProfile.jailed = false;
            userProfile.jailReleaseTime = null;
            await userProfile.save();
        }

        await message.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ${targetUser} ʜᴀꜱ ʙᴇᴇɴ ᴜɴᴊᴀɪʟᴇᴅ.**`);

        const logChannel = message.guild.channels.cache.get(CASINO_LOGS_ID);
        if (logChannel) {
            await logChannel.send(`${DONE_EMOJI} **ᴜɴᴊᴀɪʟ | ${message.author.tag} -> ${targetUser.tag}**`).catch(() => { });
        }
    }
};
