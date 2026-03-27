const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const SEVERITY_COLORS = {
    'Mild': '#57F287', // Green
    'Severe': '#FEE75C', // Yellow
    'Extreme': '#ED4245' // Red
};

/**
 * Creates a modern, high-end moderation log embed
 */
function createLogEmbed(data) {
    const { user, channel, action, severity, confidence, violationType, originalMessage, matches, reason, caseId } = data;

    // Censor matches in the message
    let censoredMessage = originalMessage;
    matches.forEach(match => {
        const regex = new RegExp(match, 'gi');
        censoredMessage = censoredMessage.replace(regex, match[0] + '*'.repeat(match.length - 1));
    });

    const embed = new EmbedBuilder()
        .setTitle('🛡️  𝐒 𝐌 𝐀 𝐑 𝐓  𝐌 𝐎 𝐃 𝐄 𝐑 𝐀 𝐓 𝐈 𝐎 𝐍  🛡️')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor(SEVERITY_COLORS[severity] || '#2F3136')
        .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━\n**Incident Detected in ${channel}**\n━━━━━━━━━━━━━━━━━━━━━━━━`)
        .addFields(
            { name: '👤 User', value: `${user} (\`${user.id}\`)`, inline: true },
            { name: '⚖️ Action', value: `\`${action}\``, inline: true },
            { name: '🌡️ Severity', value: `${severity === 'Extreme' ? '🔴' : severity === 'Severe' ? '🟡' : '▫️'} ${severity}`, inline: true },
            { name: '📊 Confidence', value: `\`${confidence}%\``, inline: true },
            { name: '🚫 Violation', value: `\`${violationType}\``, inline: true },
            { name: '📝 Reason', value: `*${reason}*`, inline: true },
            { name: '💬 Original Message', value: `\`\`\`${censoredMessage}\`\`\``, inline: false },
            { name: '🔍 Matched Patterns', value: matches.map(m => `\`${m}\``).join(', '), inline: false }
        )
        .setFooter({ text: `Case #${caseId.toString().padStart(4, '0')} | Elora Sentient Defense`, iconURL: user.client.user.displayAvatarURL() })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`mod_warn_${user.id}_${caseId}`)
                .setLabel('Warn')
                .setEmoji('⟁')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`mod_timeout_${user.id}_${caseId}`)
                .setLabel('Timeout')
                .setEmoji('⏳')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`mod_ban_${user.id}_${caseId}`)
                .setLabel('Ban')
                .setEmoji('🔨')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`mod_dismiss_${caseId}`)
                .setLabel('False Positive')
                .setEmoji('✓')
                .setStyle(ButtonStyle.Success)
        );

    return { embeds: [embed], components: [row] };
}

module.exports = { createLogEmbed };
