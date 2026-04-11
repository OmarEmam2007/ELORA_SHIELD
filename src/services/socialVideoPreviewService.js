const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const MAX_DISCORD_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function extractUrls(text) {
    const matches = String(text || '').match(/https?:\/\/[^\s<>()]+/gi);
    return Array.isArray(matches) ? matches : [];
}

function isSocialVideoUrl(url) {
    const u = String(url || '').toLowerCase();

    if (/^https?:\/\/(?:www\.)?tiktok\.com\//i.test(u)) return true;
    if (/^https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels)\//i.test(u)) return true;
    if (/^https?:\/\/(?:www\.)?youtube\.com\/shorts\//i.test(u)) return true;
    if (/^https?:\/\/(?:www\.)?youtu\.be\//i.test(u) && u.includes('shorts')) return true;
    if (/^https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/(?:pin|idea-pin)\//i.test(u)) return true;
    if (/^https?:\/\/(?:www\.)?reddit\.com\//i.test(u)) return true;
    if (/^https?:\/\/v\.redd\.it\//i.test(u)) return true;

    return false;
}

function formatCount(n) {
    if (n === null || n === undefined) return 'n/a';
    const num = Number(n);
    if (!Number.isFinite(num)) return 'n/a';
    if (num < 1000) return String(Math.round(num));
    if (num < 1000000) return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}K`;
    if (num < 1000000000) return `${(num / 1000000).toFixed(num >= 10000000 ? 0 : 1)}M`;
    return `${(num / 1000000000).toFixed(1)}B`;
}

async function downloadToBufferWithLimit(url, maxBytes) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength) {
        const len = Number(contentLength);
        if (Number.isFinite(len) && len > maxBytes) {
            throw new Error('FILE_TOO_LARGE');
        }
    }

    if (!res.body) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > maxBytes) throw new Error('FILE_TOO_LARGE');
        return buf;
    }

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maxBytes) {
            try { await reader.cancel(); } catch (_) {}
            throw new Error('FILE_TOO_LARGE');
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks, total);
}

async function fetchRedditStats(url) {
    const clean = String(url || '').split('?')[0].replace(/\/$/, '');
    const jsonUrl = `${clean}.json?raw_json=1`;

    const res = await fetch(jsonUrl, {
        headers: {
            'User-Agent': 'ELORA_SHIELD/1.0 (Discord Bot; social video preview)'
        }
    }).catch(() => null);

    if (!res || !res.ok) return { likes: null, shares: null };

    const data = await res.json().catch(() => null);
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) return { likes: null, shares: null };

    const likes = typeof post.ups === 'number' ? post.ups : null;
    const shares = typeof post.num_crossposts === 'number' ? post.num_crossposts : null;
    return { likes, shares };
}

async function cobaltDownload(url) {
    const base = String(process.env.COBALT_API_URL || 'https://co.wuk.sh').replace(/\/+$/, '');

    const res = await fetch(`${base}/`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(process.env.COBALT_API_KEY ? { Authorization: `Api-Key ${process.env.COBALT_API_KEY}` } : {})
        },
        body: JSON.stringify({
            url,
            downloadMode: 'auto',
            videoQuality: '1080',
            youtubeVideoCodec: 'h264',
            youtubeVideoContainer: 'mp4',
            filenameStyle: 'basic',
            allowH265: false,
            alwaysProxy: true,
            localProcessing: 'disabled'
        })
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
        throw new Error(`COBALT_ERROR_${res.status}`);
    }

    if (json.status !== 'tunnel' && json.status !== 'redirect') {
        throw new Error(`COBALT_UNSUPPORTED_${json.status || 'unknown'}`);
    }

    return {
        url: json.url,
        filename: json.filename || 'Downloaded_Video.mp4'
    };
}

async function handleSocialVideoPreview(message) {
    const content = String(message.content || '');
    const urls = extractUrls(content)
        .map(u => u.replace(/[),.!?]+$/g, '').split('#')[0])
        .filter(isSocialVideoUrl);

    if (!urls.length) return false;

    const targetUrl = urls[0];

    let likes = null;
    let shares = null;
    if (/reddit\.com|v\.redd\.it/i.test(targetUrl)) {
        const stats = await fetchRedditStats(targetUrl);
        likes = stats.likes;
        shares = stats.shares;
    }

    const dl = await cobaltDownload(targetUrl);
    const buf = await downloadToBufferWithLimit(dl.url, MAX_DISCORD_ATTACHMENT_BYTES);

    const filename = String(dl.filename || 'Downloaded_Video.mp4');

    const attachment = new AttachmentBuilder(buf, { name: filename });

    const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('✦ Sourced')
        .setDescription(`> **Posted by:** <@${message.author.id}>`);

    if (likes !== null && shares !== null) {
        embed.addFields({
            name: '\u200b',
            value: `Likes: \`${formatCount(likes)}\` | Shares: \`${formatCount(shares)}\``,
            inline: true
        });
    }

    await message.reply({ embeds: [embed], files: [attachment] });
    return true;
}

module.exports = {
    handleSocialVideoPreview
};
