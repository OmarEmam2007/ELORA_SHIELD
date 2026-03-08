const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const { buildAssetAttachment } = require('../../utils/responseAssets');

const DONE_EMOJI = '<:555:1479967165619634348>';
const ERROR_EMOJI = '<:661071whitex:1479988133704761515>';

module.exports = {
    name: 'clear',
    aliases: ['clear'],
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Vaporizes messages from existence.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .addUserOption(option => option.setName('target').setDescription('Only delete from this user (optional)'))
        .addBooleanOption(option => option.setName('bots').setDescription('Only delete messages sent by bots (optional)'))
        .addStringOption(option => option.setName('contains').setDescription('Only delete messages containing this text (optional)').setMaxLength(100)),

    async execute(interaction, client, args) {
        // --- 1. Hybrid Input ---
        const isSlash = interaction.isChatInputCommand?.();
        const user = isSlash ? interaction.user : interaction.author;

        // Signature check
        let mainMsg = interaction;
        let bot = client;
        let commandArgs = args;

        if (interaction.isChatInputCommand === undefined && client instanceof Array) {
            mainMsg = interaction;
            commandArgs = client;
            bot = args;
        }

        let amount, targetUser, botsOnly, contains;

        if (isSlash) {
            amount = interaction.options.getInteger('amount');
            targetUser = interaction.options.getUser('target');
            botsOnly = interaction.options.getBoolean('bots');
            contains = interaction.options.getString('contains');
        } else {
            // Prefix: .clear [Amount]
            amount = parseInt(commandArgs[0]);
            if (isNaN(amount) || amount < 1 || amount > 100) {
                return mainMsg.reply(`${ERROR_EMOJI} **ᴜꜱᴀɢᴇ: .ᴄʟᴇᴀʀ [1-100]**`);
            }
            
            // Basic prefix target detection
            if (commandArgs[1]) {
                const targetId = commandArgs[1].replace(/[<@!>]/g, '');
                try {
                    targetUser = await bot.users.fetch(targetId);
                } catch (e) {
                    // ignore
                }
            }
        }

        let responseMsg;
        if (isSlash) {
            // --- 2. Pseudo-Animation (Vaporize) ---
            const initEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.ACCENT)
                .setDescription('💥 **Preparing Vaporization Beam...**');

            const loadingAsset = buildAssetAttachment('loading');
            if (loadingAsset?.url) initEmbed.setImage(loadingAsset.url);

            await mainMsg.reply({ embeds: [initEmbed], files: loadingAsset?.attachment ? [loadingAsset.attachment] : [], ephemeral: true });
            responseMsg = mainMsg;
            await new Promise(r => setTimeout(r, 1000));
        }

        // --- 3. Execute ---
        try {
            const channel = mainMsg.channel;
            const messages = await channel.messages.fetch({ limit: amount });

            let toDelete = messages;
            if (targetUser) {
                toDelete = messages.filter(m => m.author.id === targetUser.id);
            }

            if (botsOnly) {
                toDelete = toDelete.filter(m => Boolean(m.author?.bot));
            }

            if (contains && contains.trim().length) {
                const needle = contains.trim().toLowerCase();
                toDelete = toDelete.filter(m => String(m.content || '').toLowerCase().includes(needle));
            }

            // Delete
            await channel.bulkDelete(toDelete, true);

            if (isSlash) {
                const successEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(`💥 **Vaporized ${toDelete.size} messages**`)
                    .setTimestamp();

                const okAsset = buildAssetAttachment('ok');
                if (okAsset?.url) successEmbed.setImage(okAsset.url);
                await mainMsg.editReply({ embeds: [successEmbed], files: okAsset?.attachment ? [okAsset.attachment] : [] });
            } else {
                await mainMsg.reply(`${DONE_EMOJI} **ᴅᴏɴᴇ, ᴛʜᴇ ᴍᴇꜱꜱᴀɢᴇꜱ ʜᴀꜱ ʙᴇᴇɴ ᴄʟᴇᴀʀᴇᴅ${targetUser ? ` ꜰᴏʀ ${targetUser}` : ''}.**`).catch(() => { });
            }

        } catch (error) {
            console.error(error);
            if (isSlash) {
                const err = new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('❌ **Error:** Messages too old or missing.');
                const badAsset = buildAssetAttachment('wrong');
                if (badAsset?.url) err.setImage(badAsset.url);
                await mainMsg.editReply({ embeds: [err], files: badAsset?.attachment ? [badAsset.attachment] : [] });
            } else {
                await mainMsg.channel.send(`${ERROR_EMOJI} **ᴇʀʀᴏʀ.**`).catch(() => { });
            }
        }
    },
};
