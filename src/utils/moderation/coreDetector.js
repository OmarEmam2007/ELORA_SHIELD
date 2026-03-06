const profanityList = require('../profanityList');
let GoogleGenerativeAI = null;
try {
    ({ GoogleGenerativeAI } = require('@google/generative-ai'));
} catch (e) {
    GoogleGenerativeAI = null;
}

// Initialize Gemini for context checks if available
const genAI = (process.env.GEMINI_API_KEY && GoogleGenerativeAI) ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const geminiModelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
const model = genAI ? genAI.getGenerativeModel({ model: geminiModelName }) : null;

const _geminiCache = new Map();
function _cacheGet(key) {
    const ttl = Number(process.env.GEMINI_CACHE_TTL_MS || 60000);
    const hit = _geminiCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > ttl) {
        _geminiCache.delete(key);
        return null;
    }
    return hit.val;
}

function _cacheSet(key, val) {
    _geminiCache.set(key, { at: Date.now(), val });
    if (_geminiCache.size > 500) {
        const firstKey = _geminiCache.keys().next().value;
        if (firstKey) _geminiCache.delete(firstKey);
    }
}

async function classifyWithGemini(text) {
    if (!model) return { ok: false };
    const raw = String(text || '');
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true, isViolation: false, confidence: 1, reason: 'empty' };

    const maxLen = Number(process.env.GEMINI_MAX_CHARS || 500);
    const input = trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;

    const cacheKey = `${geminiModelName}:${input}`;
    const cached = _cacheGet(cacheKey);
    if (cached) return cached;

    const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 5000);
    const prompt =
        `You are a strict profanity moderation classifier for Discord messages.\n` +
        `Detect profanity/insults/slurs/sexual insults in Arabic dialects (EG/Gulf/etc), MSA, English, and Franco-Arabic.\n` +
        `Return ONLY valid minified JSON: {"isViolation":boolean,"confidence":number,"reason":string}.\n` +
        `confidence must be between 0 and 1.\n` +
        `Message: ${JSON.stringify(input)}`;

    try {
        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, rej) => setTimeout(() => rej(new Error('GEMINI_TIMEOUT')), timeoutMs))
        ]);

        const jsonString = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonString);
        const out = {
            ok: true,
            isViolation: Boolean(parsed.isViolation),
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence))),
            reason: String(parsed.reason || '')
        };
        _cacheSet(cacheKey, out);
        return out;
    } catch (e) {
        return { ok: false, error: String(e?.message || e) };
    }
}

async function detectProfanityAI(content, { extraTerms = [], whitelist = [] } = {}) {
    const mode = String(process.env.GEMINI_MODE || 'hybrid').toLowerCase();
    const aiThreshold = Math.max(0, Math.min(1, Number(process.env.GEMINI_CONFIDENCE_THRESHOLD || 0.85)));
    const failSafe = String(process.env.GEMINI_FAILSAFE || 'on').toLowerCase() !== 'off';

    // Always keep rules in the loop for exact blacklist hits + whitelists.
    const rules = detectProfanitySmart(content, { extraTerms, whitelist });

    // In hybrid mode: only consult AI when rules are suspicious.
    // In first mode: consult AI for every message, then optionally fail-safe to rules.
    const shouldAskAI = model && (mode === 'first' || rules.isViolation);
    if (!shouldAskAI) return { ...rules, source: 'rules' };

    const ai = await classifyWithGemini(content);
    if (ai.ok) {
        if (ai.isViolation && ai.confidence >= aiThreshold) {
            return { isViolation: true, matches: rules.matches || [], source: 'ai', ai };
        }
        // If AI says NOT violation, prefer AI to reduce false positives.
        if (!ai.isViolation) {
            // But in fail-safe mode, keep explicit rules hits.
            if (failSafe && rules.isViolation) return { ...rules, source: 'rules', ai };
            return { isViolation: false, matches: [], source: 'ai', ai };
        }
        // AI unsure / low confidence
        return failSafe ? { ...rules, source: 'rules', ai } : { isViolation: false, matches: [], source: 'ai', ai };
    }

    // AI unavailable -> fallback
    return { ...rules, source: 'rules', ai };
}

/**
 * Normalizes text for better detection (Arabic/English)
 */
function normalizeText(text) {
    if (!text) return '';

    // 1) Convert to lowercase
    let normalized = String(text).toLowerCase();

    // Remove emojis (unicode pictographs) early
    normalized = normalized.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, ' ');

    // 1.5) Collapse elongated letters early (helps Franco like a7aaaaaaaa)
    normalized = normalized.replace(/([a-z])\1{1,}/g, '$1');
    normalized = normalized.replace(/([\u0621-\u064Aء])\1{1,}/g, '$1');

    // 2) Normalize common "Franco-Arabic" numerals
    // IMPORTANT: only convert digits when they are used as letters (adjacent to [a-z]).
    // This prevents false positives for plain numbers like "5" or "55555".
    normalized = normalized
        .replace(/(?<=[a-z])2|2(?=[a-z])/g, 'ء')
        .replace(/(?<=[a-z])3|3(?=[a-z])/g, 'ع')
        .replace(/(?<=[a-z])4|4(?=[a-z])/g, 'ش')
        .replace(/(?<=[a-z])5|5(?=[a-z])/g, 'خ')
        .replace(/(?<=[a-z])6|6(?=[a-z])/g, 'ط')
        .replace(/(?<=[a-z])7|7(?=[a-z])/g, 'ح')
        .replace(/(?<=[a-z])8|8(?=[a-z])/g, 'ق')
        .replace(/(?<=[a-z])9|9(?=[a-z])/g, 'ص');

    // 3) Normalize Arabic characters (Alef, Yeh, etc.)
    normalized = normalized
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ى]/g, 'ي')
        .replace(/[ة]/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي');

    // 4) Remove diacritics / tatweel
    normalized = normalized
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/ـ/g, '');

    // 5) Reduce repeated characters to handle elongations
    // - Latin: collapse repeats to 1 ("fuuuuuck" -> "fuck")
    // - Arabic: collapse repeats to 1 ("منيووووك" -> "منيوك")
    normalized = normalized.replace(/([a-z])\1{1,}/g, '$1');
    normalized = normalized.replace(/([\u0621-\u064Aء])\1{1,}/g, '$1');

    // 6) Keep letters/numbers/spaces; convert other chars to spaces (so boundaries still work)
    normalized = normalized.replace(/[^a-z0-9\s\u0621-\u064Aء]/gi, ' ');
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

// Global whitelist for common false positives
const GLOBAL_WHITELIST = new Set([
    'warning', 'warnings', 'restart', 'restarts', 'message', 'messages', 'class', 'classes',
    'assessment', 'assessments', 'assume', 'assumed', 'assuming', 'pass', 'passed', 'passing',
    'grass', 'glass', 'mass', 'brass', 'compass', 'bass', 'embassy', 'classic', 'classical',
    'associate', 'association', 'asset', 'assets', 'assignment', 'assign', 'assigned',
    'hoeing', 'shoe', 'shoes', 'backhoe', 'titans', 'titanic', 'title', 'titled', 'titles',
    'shitting', 'shifting', 'shirt', 'shirts', 'short', 'shorts', 'shot', 'shots', 'shoot',
    'sheet', 'sheets', 'shell', 'shells', 'shelf', 'shelves', 'shall', 'shape', 'shapes',
    'share', 'shared', 'sharing', 'sharp', 'sharply', 'shake', 'shaken', 'shaking',
    'احلام', 'احلامي', 'احلامك', 'احلامنا', 'احلامكم', 'احلامهم',
    'احسن', 'احسنت', 'احسنتم', 'احسنا', 'احسنوا', 'احسني',
    'احساس', 'احاسيس', 'احساسي', 'احساسك', 'احساسنا', 'احساسكم', 'احساسهم',
    'احمر', 'حمراء', 'حمرة', 'حمار'
]);

function normalizeTextKeepDigits(text) {
    if (!text) return '';
    let normalized = String(text).toLowerCase();
    normalized = normalized
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ى]/g, 'ي')
        .replace(/[ة]/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي');
    normalized = normalized
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/ـ/g, '');

    // Handle elongations (same as normalizeText)
    normalized = normalized.replace(/([a-z])\1{1,}/g, '$1');
    normalized = normalized.replace(/([\u0621-\u064Aء])\1{1,}/g, '$1');
    normalized = normalized.replace(/[^a-z0-9\s\u0621-\u064Aء]/gi, ' ');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitIntoWords(text) {
    const raw = String(text || '');
    if (!raw.trim()) return [];
    // split on whitespace; keep punctuation attached to word for per-word cleanup
    return raw.split(/\s+/).filter(Boolean);
}

function stripInternalSymbols(word) {
    // Deep stripping: remove ALL non-alphanumeric chars from inside the word ONLY.
    // This catches bypass like: b.e.d.o -> bedo, f.u.c.k -> fuck, بـيـدوفـيـلـي -> بيدوفيلي
    // NOTE: word boundaries are handled by the outer loop (split by whitespace).
    return String(word || '').replace(/[^a-zA-Z0-9\u0621-\u064Aء]/g, '');
}

function normalizeArabicWord(word) {
    let w = String(word || '');
    if (!w) return '';
    w = w
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ى]/g, 'ي')
        .replace(/[ة]/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي');
    w = w
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/ـ/g, '');
    // collapse repeats
    w = w.replace(/([\u0621-\u064Aء])\1{1,}/g, '$1');
    return w;
}

function normalizeEnglishWord(word) {
    let w = String(word || '').toLowerCase();
    if (!w) return '';
    // map common look-alikes
    w = w
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/8/g, 'b');
    // collapse only HEAVY repeats (3+ extra) to avoid false positives like cook -> cok
    // still catches extreme elongations (fuuuuuck, fuckkkkkkkk)
    w = w.replace(/([a-z])\1{2,}/g, '$1');
    return w;
}

function collapseRepeatsAggressive(word) {
    // used only as an additional matching variant for LONG blacklist terms
    // collapse 2+ repeats: fuuuck -> fuck, fuckkkkk -> fuck
    return String(word || '').replace(/([a-z])\1{1,}/gi, '$1').replace(/([\u0621-\u064Aء])\1{1,}/g, '$1');
}

function normalizeWordDeep(word) {
    // IMPORTANT: per-word normalization only, to avoid cross-word merges
    const stripped = stripInternalSymbols(word);
    if (!stripped) return '';
    const hasArabic = /[\u0600-\u06FF]/.test(stripped);
    const hasLatin = /[a-zA-Z]/.test(stripped);

    let out = stripped;
    if (hasArabic) out = normalizeArabicWord(out);
    if (hasLatin) out = normalizeEnglishWord(out);
    // drop anything that isn't a letter/digit after normalization
    out = out.replace(/[^a-z0-9\u0621-\u064Aء]/gi, '');
    return out;
}

function hasNonAlnum(word) {
    return /[^a-zA-Z0-9\u0621-\u064Aء]/.test(String(word || ''));
}

function buildWildcardGapPatternFromCleanTerm(cleanTerm) {
    // builds a pattern that allows ANY number of non-alphanumeric separators between letters
    // e.g. "porn" -> p[^a-z0-9\u0621-\u064Aء]*o[^...]*r[^...]*n
    const chars = String(cleanTerm || '').split('').map(escapeRegex);
    if (!chars.length) return null;
    const gap = '[^a-z0-9\u0621-\u064Aء]*';
    return chars.join(gap);
}

function buildMissingOneLetterPatternFromCleanTerm(cleanTerm) {
    // Allow exactly ONE missing letter (replaced by 0+ non-alphanumerics) for long terms.
    // Example: fuck (len 4) is handled by explicit term variants in the list.
    // Example: pedophile (len>=5): allow one skipped letter to catch patterns like ب.دوفيلي.
    const t = String(cleanTerm || '');
    if (t.length < 5) return null;
    const gap = '[^a-z0-9\u0621-\u064Aء]*';
    const out = [];
    for (let skip = 1; skip < t.length - 1; skip++) {
        const left = t.slice(0, skip).split('').map(escapeRegex).join(gap);
        const right = t.slice(skip + 1).split('').map(escapeRegex).join(gap);
        out.push(`${left}${gap}${right}`);
    }
    if (!out.length) return null;
    return `(?:${out.join('|')})`;
}

function buildSkeletonRegexFromCleanTerm(cleanTerm) {
    // Safety-only for long terms: starts with first letter, ends with last letter,
    // and total alphanumeric length is either same or -1.
    const t = String(cleanTerm || '');
    if (t.length < 5) return null;
    const first = escapeRegex(t[0]);
    const last = escapeRegex(t[t.length - 1]);
    const len = t.length;
    // allow 3..(len-2) internal chars (so total is len or len-1)
    const innerSame = `{${Math.max(0, len - 2)}}`;
    const innerMinusOne = `{${Math.max(0, len - 3)}}`;
    const body = `(?:${first}[a-z0-9\u0621-\u064Aء]${innerMinusOne}${last}|${first}[a-z0-9\u0621-\u064Aء]${innerSame}${last})`;
    return new RegExp(`^${body}$`, 'i');
}

function isSingleCharToken(token) {
    const t = String(token || '');
    if (!t) return false;
    const ultra = stripInternalSymbols(t);
    if (!ultra) return false;
    // exactly one Arabic letter or one ASCII letter/digit after stripping
    return /^[a-zA-Z0-9\u0621-\u064Aء]$/.test(ultra);
}

function detectViolationForSingleCleanWord(cleanedWord, ultraNorm, rawWord, list, wl) {
    if (!cleanedWord) return null;
    if (GLOBAL_WHITELIST.has(cleanedWord) || wl.has(cleanedWord)) return null;

    for (const term of list) {
        if (!term || typeof term !== 'string') continue;
        const cleanedTerm = normalizeWordDeep(term);
        if (!cleanedTerm) continue;
        if (GLOBAL_WHITELIST.has(cleanedTerm) || wl.has(cleanedTerm)) continue;

        if (cleanedTerm.length <= 4) {
            if (cleanedWord === cleanedTerm || (ultraNorm && ultraNorm === cleanedTerm)) {
                return { term, rawWord, cleanedWord, ultraNorm: ultraNorm || '' };
            }
            continue;
        }

        const rx = buildPerWordFuzzyRegex(term);
        if (!rx) continue;
        if (rx.test(cleanedWord) || (ultraNorm && rx.test(ultraNorm))) {
            return { term, rawWord, cleanedWord, ultraNorm: ultraNorm || '' };
        }
    }

    return null;
}

function buildPerWordFuzzyRegex(term) {
    const t = normalizeWordDeep(term);
    if (!t) return null;

    const isAsciiAlpha = /^[a-z]+$/.test(t);
    const isArabic = /[\u0600-\u06FF]/.test(t);

    // build char-by-char pattern that tolerates repeats: f+u+c+k+
    // NOTE: anchoring is ALWAYS applied by the caller (^...$)
    let body = t.split('').map(ch => `${escapeRegex(ch)}+`).join('');

    // Arabic: tolerate optional Alef after initial B (بايدوفيلي vs بيدوفيلي)
    if (isArabic) {
        body = body.replace(/^ب\+ي\+/, 'ب\\+ا\\*ي\\+');
    }

    // standalone word only (no substring inside other words)
    // Always anchored ^...$ to enforce isolated whole-word matching.
    if (isAsciiAlpha) {
        return new RegExp(`^${body}$`, 'i');
    }
    return new RegExp(`^${body}$`);
}

function detectProfanityPerWord(content, { extraTerms = [], whitelist = [] } = {}) {
    const wordsRaw = splitIntoWords(content);
    if (!wordsRaw.length) return { isViolation: false, matches: [], hits: [] };

    // Build blacklist once; de-dup at the term level.
    const list = [...new Set([...(Array.isArray(profanityList) ? profanityList : []), ...(Array.isArray(extraTerms) ? extraTerms : [])])];

    const wl = new Set(
        (Array.isArray(whitelist) ? whitelist : [])
            .map(t => normalizeWordDeep(t))
            .filter(Boolean)
    );

    const matches = [];
    const hits = [];
    // STRICT LOOP RULE:
    // for each isolated word: clean -> check whole word against blacklist -> if no match, move to next word
    for (const rawWord of wordsRaw) {
        const wordHadSymbols = hasNonAlnum(rawWord);
        const ultraCleanedWord = stripInternalSymbols(rawWord);
        const cleanedWord = normalizeWordDeep(rawWord);
        if (!cleanedWord) continue;
        if (GLOBAL_WHITELIST.has(cleanedWord) || wl.has(cleanedWord)) continue;

        const ultraNorm = ultraCleanedWord ? normalizeWordDeep(ultraCleanedWord) : '';
        const ultraRepeatCollapsed = ultraNorm ? collapseRepeatsAggressive(ultraNorm) : '';

        const hit = detectViolationForSingleCleanWord(cleanedWord, ultraNorm, rawWord, list, wl);
        if (hit) {
            matches.push(hit.term);
            hits.push(hit);
            continue;
        }

        // Long-term repeat bypass (e.g., fuckkkkkkkkk): only for terms >= 5
        if (ultraRepeatCollapsed && ultraRepeatCollapsed !== ultraNorm) {
            for (const term of list) {
                if (!term || typeof term !== 'string') continue;
                const cleanedTerm = normalizeWordDeep(term);
                if (!cleanedTerm) continue;
                if (GLOBAL_WHITELIST.has(cleanedTerm) || wl.has(cleanedTerm)) continue;
                if (cleanedTerm.length < 5) continue;

                const rx = buildPerWordFuzzyRegex(term);
                if (!rx) continue;
                if (rx.test(ultraRepeatCollapsed)) {
                    matches.push(term);
                    hits.push({ term, rawWord, cleanedWord, ultraNorm: ultraRepeatCollapsed });
                    break;
                }
            }
        }

        // If the word used symbols as bypass, try gap/wildcard and skeleton checks (LONG TERMS ONLY)
        if (wordHadSymbols) {
            for (const term of list) {
                if (!term || typeof term !== 'string') continue;
                const cleanedTerm = normalizeWordDeep(term);
                if (!cleanedTerm) continue;
                if (GLOBAL_WHITELIST.has(cleanedTerm) || wl.has(cleanedTerm)) continue;
                if (cleanedTerm.length < 5) continue;

                // 1) allow arbitrary symbol gaps between letters (p.o.r.n)
                const gapPattern = buildWildcardGapPatternFromCleanTerm(cleanedTerm);
                if (gapPattern) {
                    const isAscii = /^[a-z]+$/.test(cleanedTerm);
                    const gapRx = new RegExp(`^${gapPattern}$`, isAscii ? 'i' : undefined);
                    if (gapRx.test(String(rawWord || ''))) {
                        matches.push(term);
                        hits.push({ term, rawWord, cleanedWord, ultraNorm: ultraNorm || '' });
                        break;
                    }
                }

                // 2) allow exactly one missing letter replaced by symbols (for long terms)
                const missingOne = buildMissingOneLetterPatternFromCleanTerm(cleanedTerm);
                if (missingOne) {
                    const isAscii = /^[a-z]+$/.test(cleanedTerm);
                    const missRx = new RegExp(`^${missingOne}$`, isAscii ? 'i' : undefined);
                    if (missRx.test(String(rawWord || ''))) {
                        matches.push(term);
                        hits.push({ term, rawWord, cleanedWord, ultraNorm: ultraNorm || '' });
                        break;
                    }
                }

                // 3) skeleton safety check (long terms only)
                const skRx = buildSkeletonRegexFromCleanTerm(cleanedTerm);
                if (skRx && (skRx.test(cleanedWord) || (ultraNorm && skRx.test(ultraNorm)))) {
                    matches.push(term);
                    hits.push({ term, rawWord, cleanedWord, ultraNorm: ultraNorm || '' });
                    break;
                }
            }
        }
    }

    // spaced-letter bypass: catch sequences like "ا ح ا" or "f u c k"
    // Safety rule: only join runs of single-character tokens.
    // - Arabic: allow len >= 3
    // - English: allow len >= 4
    for (let i = 0; i < wordsRaw.length; i++) {
        if (!isSingleCharToken(wordsRaw[i])) continue;
        let j = i;
        const buf = [];
        while (j < wordsRaw.length && isSingleCharToken(wordsRaw[j])) {
            buf.push(stripInternalSymbols(wordsRaw[j]));
            j++;
        }

        if (buf.length) {
            const candidateRaw = buf.join('');
            const candidateClean = normalizeWordDeep(candidateRaw);

            const isArabic = /[\u0600-\u06FF]/.test(candidateClean);
            const minLen = isArabic ? 3 : 4;

            if (candidateClean && candidateClean.length >= minLen) {
                const hit = detectViolationForSingleCleanWord(candidateClean, candidateClean, buf.join(' '), list, wl);
                if (hit) {
                    matches.push(hit.term);
                    hits.push({ ...hit, rawWord: `spaced:${hit.rawWord}` });
                }
            }
        }

        i = j - 1;
    }

    if (!matches.length) return { isViolation: false, matches: [], hits: [] };
    return { isViolation: true, matches: [...new Set(matches)], hits: hits.slice(0, 20) };
}

function tokenize(text) {
    const clean = normalizeText(text);
    if (!clean) return [];
    return clean.split(/\s+/).filter(Boolean);
}

function buildWordRegex(term) {
    const t = normalizeText(term);
    const parts = t.split(/\s+/).filter(Boolean).map(escapeRegex);
    if (!parts.length) return null;

    let body = parts.join('\\s+');

    if (parts.length === 1) {
        const rawPart = parts[0];
        const norm = normalizeText(term);
        const isAsciiAlpha = /^[a-z]+$/.test(norm);
        
        if (isAsciiAlpha) {
            if (norm.length <= 3) {
                body = `\\b${rawPart}\\b`;
            } else {
                const flexibleBody = rawPart.split('').map(char => `${char}+`).join('');
                body = `\\b${flexibleBody}(?:s|es|\\'s)?\\b`;
            }
        } else {
            body = `(?:^|\\s)(${rawPart})(?=$|\\s)`;
        }
    } else {
        body = `(?:^|\\s)(${body})(?=$|\\s)`;
    }

    return new RegExp(body, 'i');
}

function detectProfanitySmart(content, { extraTerms = [], whitelist = [] } = {}) {
    // Per-word detection to avoid cross-word merges and reduce false positives
    return detectProfanityPerWord(content, { extraTerms, whitelist });
}

function levenshteinDistance(s1, s2) {
    if (s1.length < s2.length) return levenshteinDistance(s2, s1);
    if (s2.length === 0) return s1.length;
    let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
    for (let i = 0; i < s1.length; i++) {
        let currentRow = [i + 1];
        for (let j = 0; j < s2.length; j++) {
            const insertions = previousRow[j + 1] + 1;
            const deletions = currentRow[j] + 1;
            const substitutions = previousRow[j] + (s1[i] !== s2[j] ? 1 : 0);
            currentRow.push(Math.min(insertions, deletions, substitutions));
        }
        previousRow = currentRow;
    }
    return previousRow[s2.length];
}

function getFuzzyMatch(word, blacklist) {
    for (const bad of blacklist) {
        if (bad.length < 3) continue;
        const distance = levenshteinDistance(word, bad);
        const threshold = Math.floor(bad.length * 0.3);
        if (distance <= threshold) return { matched: bad, confidence: 100 - (distance * 10) };
    }
    return null;
}

async function aiContextCheck(text, detectedWords) {
    if (!model) return { isViolation: true, confidence: 80 };
    try {
        const prompt =
            `You are a strict profanity moderation classifier. Decide if the message contains profanity/insults/slurs in English or Arabic (including Franco-Arabic).
Return ONLY valid minified JSON with keys: {"isViolation":boolean,"confidence":number,"reason":string}.
confidence must be between 0 and 1.
Message: ${JSON.stringify(String(text || ''))}
Suspected terms: ${JSON.stringify(detectedWords.slice(0, 10))}`;

        const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 5000);
        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, rej) => setTimeout(() => rej(new Error('GEMINI_TIMEOUT')), timeoutMs))
        ]);
        const jsonString = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonString);
        const conf = Math.max(0, Math.min(1, Number(parsed.confidence)));
        return {
            isViolation: Boolean(parsed.isViolation),
            confidence: conf,
            reason: String(parsed.reason || '')
        };
    } catch (e) {
        return { isViolation: true, confidence: 0.7, reason: 'AI_error' };
    }
}

async function detectProfanityHybrid(content, { extraTerms = [], whitelist = [] } = {}) {
    const base = detectProfanitySmart(content, { extraTerms, whitelist });
    if (!base.isViolation) return { ...base, source: 'rules' };

    // If no AI available, keep rules decision.
    if (!model) return { ...base, source: 'rules' };

    const ai = await aiContextCheck(content, base.matches || []);
    const threshold = Math.max(0, Math.min(1, Number(process.env.GEMINI_CONFIDENCE_THRESHOLD || 0.85)));

    // Only act if AI is confident it's a violation; otherwise treat as non-violation to reduce false positives.
    if (ai?.isViolation && Number(ai.confidence) >= threshold) {
        return { isViolation: true, matches: base.matches || [], source: 'ai', ai };
    }
    return { isViolation: false, matches: [], source: 'ai', ai };
}

async function analyzeMessage(messageContent) {
    const rawContent = messageContent;
    const cleanContent = normalizeText(rawContent);
    const words = cleanContent.split(/\s+/);
    let matches = [];
    let severityScore = 0;
    for (const word of words) {
        if (profanityList.includes(word)) {
            matches.push(word);
            severityScore += 10;
        } else {
            const fuzzy = getFuzzyMatch(word, profanityList);
            if (fuzzy) {
                matches.push(word);
                severityScore += 8;
            }
        }
    }
    if (matches.length === 0) return { isViolation: false };
    if (severityScore < 30) {
        const aiResult = await aiContextCheck(rawContent, matches);
        return { isViolation: aiResult.isViolation, matches: matches, confidence: aiResult.confidence, severity: aiResult.severity, reason: aiResult.reason };
    }
    return { isViolation: true, matches: matches, confidence: 95, severity: severityScore > 50 ? 'Extreme' : 'Severe', reason: 'Direct word match' };
}

module.exports = { analyzeMessage, normalizeText, levenshteinDistance, detectProfanitySmart, detectProfanityHybrid, detectProfanityAI, tokenize };
