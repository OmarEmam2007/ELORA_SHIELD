const { EmbedBuilder } = require('discord.js');
const { PermissionFlagsBits } = require('discord.js');
const NicknameLock = require('../../models/NicknameLock');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');

module.exports = {
    name: 'guildMemberUpdate',
    async execute() {
        return;
    }
};
