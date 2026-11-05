/**
 * GET /api/toktrack  ->  token usage for the terminal's `toktrack` command
 *
 * The raw data is the output of `toktrack daily --json`, uploaded to R2 as
 * TOKTRACK_KEY. It's about 1 KB per day, mostly per-model detail, so it's boiled down
 * here to what the terminal draws: totals per day, week and month (with the main
 * model and cache use for the daily table), a total per model, and the headline
 * numbers. The result is cached for a few minutes.
 */
const TOKTRACK_KEY = 'daily.json';
const CACHE_SECONDS = 600;
const TOP_MODELS = 12;
const SUMMARY_VERSION = 2;

// Same total toktrack uses for a day (see types/usage.rs)
function tokensOf(u, prefix = '') {
    return (u[prefix + 'input_tokens'] || 0) + (u[prefix + 'output_tokens'] || 0)
        + (u[prefix + 'cache_read_tokens'] || 0) + (u[prefix + 'cache_creation_tokens'] || 0)
        + (u[prefix + 'reasoning_tokens'] || 0);
}

/**
 * Friendly model names, ported from toktrack's display_name (services/normalizer.rs):
 * "claude-opus-4-5" -> "Opus 4.5", "gpt-6-1-sol::openai" -> "GPT-6.1 Sol".
 */
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

function versionAndTier(rest) {
    const version = [], tier = [];
    for (const p of rest.split('-')) {
        if (/^\d+$/.test(p) && !tier.length) version.push(p);
        else tier.push(cap(p));
    }
    return [version.join('.'), tier.join(' ')].filter(Boolean).join(' ');
}

export function displayName(key) {
    const model = key.split('::')[0];
    let m;
    if ((m = /^claude-(.*)$/.exec(model))) {
        const i = m[1].indexOf('-');
        return i < 0 ? 'Claude ' + cap(m[1]) : cap(m[1].slice(0, i)) + ' ' + m[1].slice(i + 1).replace(/-/g, '.');
    }
    if ((m = /^gpt-(.*)$/.exec(model))) {
        const p = m[1].split('-');
        if (p.length >= 2 && /^\d{1,2}$/.test(p[1])) {
            return 'GPT-' + p[0] + '.' + p[1] + (p.length > 2 ? ' ' + p.slice(2).map(cap).join(' ') : '');
        }
        return 'GPT-' + p[0] + (p.length > 1 ? ' ' + p.slice(1).map(cap).join(' ') : '');
    }
    if ((m = /^gemini-(.*)$/.exec(model))) return 'Gemini ' + versionAndTier(m[1]);
    if ((m = /^grok-(.*)$/.exec(model))) return ('Grok ' + versionAndTier(m[1])).trim();
    if ((m = /^codex-(.*)$/.exec(model))) {
        const rest = m[1].replace(/-latest$/, '');
        return rest ? 'Codex ' + rest.split('-').map(cap).join(' ') : 'Codex';
    }
    if (/^o\d/.test(model)) {
        const i = model.indexOf('-');
        return i < 0 ? model : model.slice(0, i) + ' ' + cap(model.slice(i + 1));
    }
    return model;
}

/**
 * Rows for the daily / weekly / monthly table, like the app's:
 *   [label, tokens, cost, cache tokens, main model, how many other models]
 * The main model is the one that cost the most in that period (as in the app's
 * daily view); "others" counts the rest that were used at all.
 */
function periodRows(daily, labelOf) {
    const periods = new Map();
    for (const d of daily) {
        const label = labelOf(d.date);
        const p = periods.get(label) || { label, tokens: 0, cost: 0, cache: 0, models: new Map() };
        p.tokens += tokensOf(d, 'total_');
        p.cost += d.total_cost_usd || 0;
        p.cache += (d.total_cache_read_tokens || 0) + (d.total_cache_creation_tokens || 0);
        for (const [key, u] of Object.entries(d.models || {})) {
            if (!tokensOf(u)) continue;
            p.models.set(key, (p.models.get(key) || 0) + (u.cost_usd || 0));
        }
        periods.set(label, p);
    }
    return [...periods.values()]
        .sort((a, b) => a.label < b.label ? -1 : 1)
        .map(p => {
            let top = null;
            for (const [key, cost] of p.models) if (!top || cost > top[1]) top = [key, cost];
            return [p.label, p.tokens, round(p.cost), p.cache,
                    top ? displayName(top[0]) : 'unknown', Math.max(0, p.models.size - 1)];
        });
}

// Weeks start on Sunday and are labelled by that date, as in `toktrack weekly`
function weekOf(date) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
}

const round = n => Math.round(n * 100) / 100;

export function summarise(input) {
    const daily = input.filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
    const days = daily
        .map(d => ({ date: d.date, tokens: tokensOf(d, 'total_'), cost: d.total_cost_usd || 0 }))
        .sort((a, b) => a.date < b.date ? -1 : 1);

    // Per model, merged by display name (the same model through different providers)
    const byName = new Map();
    for (const d of daily) {
        for (const [key, u] of Object.entries(d.models || {})) {
            const name = displayName(key);
            const m = byName.get(name) || { name, tokens: 0, cost: 0 };
            m.tokens += tokensOf(u);
            m.cost += u.cost_usd || 0;
            byName.set(name, m);
        }
    }
    const ranked = [...byName.values()].sort((a, b) => b.tokens - a.tokens);
    const models = ranked.slice(0, TOP_MODELS);
    const rest = ranked.slice(TOP_MODELS);
    if (rest.length) {
        models.push({
            name: `${rest.length} others`,
            tokens: rest.reduce((s, m) => s + m.tokens, 0),
            cost: rest.reduce((s, m) => s + m.cost, 0),
            other: true
        });
    }

    const totalTokens = days.reduce((s, d) => s + d.tokens, 0);
    const totalCost = days.reduce((s, d) => s + d.cost, 0);
    const peak = days.reduce((p, d) => (!p || d.tokens > p.tokens ? d : p), null);
    const active = days.filter(d => d.tokens > 0).length;

    return {
        updated: days.length ? days[days.length - 1].date : null,
        stats: {
            totalTokens, totalCost: round(totalCost), activeDays: active,
            dailyAvgTokens: active ? Math.floor(totalTokens / active) : 0,
            dailyAvgCost: active ? round(totalCost / active) : 0,
            peakDay: peak ? { date: peak.date, tokens: peak.tokens } : null
        },
        // Same row shape for all three: [label, tokens, cost, cache, main model, others]
        days: periodRows(daily, date => date),
        weeks: periodRows(daily, weekOf),
        months: periodRows(daily, date => date.slice(0, 7)),
        models: models.map(m => ({ ...m, cost: round(m.cost) }))
    };
}

export async function toktrack(request, env, ctx) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (!env.TOKTRACK) {
        return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } });
    }

    // The version is part of the cache key, so changing the response shape skips old entries
    const cache = caches.default, key = new Request(new URL('/api/toktrack?v=' + SUMMARY_VERSION, request.url));
    const hit = await cache.match(key);
    if (hit) return hit;

    const obj = await env.TOKTRACK.get(TOKTRACK_KEY);
    if (!obj) {
        return new Response(JSON.stringify({ error: 'no-data' }), { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } });
    }

    let body;
    try {
        body = JSON.stringify(summarise(await obj.json()));
    } catch {
        return new Response(JSON.stringify({ error: 'bad-data' }), { status: 500, headers: { ...headers, 'Cache-Control': 'no-store' } });
    }
    const res = new Response(body, { headers: { ...headers, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
}
