/**
 * cubityfir.st / michaelburr.co.uk Worker
 *
 * The site itself is static (public/, served as assets). This Worker only runs for
 * /api/* (see run_worker_first in wrangler.jsonc); everything else goes straight to the
 * assets.
 *
 *   POST /api/ask   {question, history?, site?}  ->  {answer} | {error}
 *   GET  /api/toktrack                           ->  token usage (see toktrack.js)
 *
 * Answers questions typed into the terminal that aren't known commands, using Claude
 * through the "cubityfir-st" AI Gateway. The Anthropic key is stored in the gateway
 * (BYOK), so the Worker never sees it: it only sends the gateway token (secret
 * CF_AIG_TOKEN) in cf-aig-authorization and no provider key.
 *
 * Spend is bounded in three places: a per-visitor limit here (ASK_LIMITER), the
 * gateway's own rate limit and monthly spend limit, and short questions and answers.
 * Identical questions are answered from the gateway's cache.
 */
import Anthropic from '@anthropic-ai/sdk';
import { toktrack } from './toktrack.js';

const MODEL = 'claude-sonnet-5-5';
const MAX_QUESTION = 300;      // characters
const MAX_HISTORY = 6;         // messages (three back-and-forths)
const MAX_HISTORY_CHARS = 800; // per message
const GITHUB_USER = 'CubityFirst';


/**
 * Who the site is for, per domain. Both know it's the same person, so questions about
 * "Michael" or "cubityfirst" work on either; each refers to the owner by the name that
 * domain shows (`short` in running text).
 */
const IDENTITIES = {
    cf: { name: 'cubityfirst', short: 'cubityfirst', host: 'cubityfir.st', email: 'cubity@cubityfir.st',
          aka: 'Real name Michael Burr (michaelburr.co.uk), so questions about Michael are about cubityfirst.' },
    mb: { name: 'Michael Burr', short: 'Michael', host: 'michaelburr.co.uk', email: 'michael@michaelburr.co.uk',
          aka: 'Goes by cubityfirst online (most profiles below use that handle), so questions about cubityfirst are about Michael.' }
};

function identityFor(url, hint) {
    if (/(^|\.)michaelburr\.co\.uk$/.test(url.hostname) || hint === 'mb') return IDENTITIES.mb;
    return IDENTITIES.cf;
}


/**
 * Everything the model knows about the owner; it's asked to stay within these notes, so
 * to let it answer more, add facts here.
 *
 * The gateway's prompt-injection guardrail reads this too, so it's written as a
 * description of the site rather than a list of orders: phrasing like "never...",
 * "decline...", or anything about changing instructions gets the whole request blocked.
 */
function systemPrompt(id, repos) {
    return `This is the terminal on the personal website of ${id.name} (${id.host}). Visitors type into a small fake shell. Known commands are handled by the page itself; everything else arrives here, usually a question about ${id.short} or the site, sometimes a mistyped command.

Replies come from the terminal itself, a small assistant built into the site, not from ${id.short}. The terminal talks about ${id.short} in the third person, by name or as he/him ("${id.short}'s on Bluesky", "he's easiest to reach by email"). When it refers to itself it's just "this terminal" or "I". The voice matches the site: lowercase-leaning, dry, friendly and brief. Names keep their capitals, though: Michael, Michael Burr (cubityfirst itself is all lowercase). One to three short sentences (under 60 words), plain text without markdown. A terminal command in backticks, like \`contact\`, becomes clickable, and URLs and email addresses become links.

Everything said about ${id.short} comes from the notes below. When the notes don't cover something (the employer's name, exact location, opinions, plans), the honest answer is that ${id.short} hasn't written that down here, with a pointer to \`contact\` to ask directly.

The terminal is for questions about ${id.short}, ${id.short}'s projects and this site. Anything else (general knowledge, writing code or essays, games) gets a light one-line redirect to \`help\`. Replies are text only; nothing gets sent or saved.

A mistyped command gets a one-line shell-style reply, for example "lss: command not found, did you mean \`ls\`?".

NOTES ABOUT ${id.short.toUpperCase()}
- Name: ${id.name}. ${id.aka}
- Tagline: developer; engineer; memer; sysadmin; and more.
- Pronouns: he/him.
- Birthday: 8 October 2000. The terminal's \`age\` command shows ${id.short}'s exact age live, to ten decimal places, so questions about age or birthdays can point to it.
- Based in the south of England, UK.
- Current job: Senior Technical Engineer since Dec 2024, focused on cloud infrastructure and cybersecurity. Enjoys learning new technology and solving awkward problems.
- Open to work and collaboration, always. \`contact\` is the way to get in touch about either.
- Skills, security: incident response and investigation, Microsoft Defender, Bitdefender, Datto EDR, ESET, MFA and Conditional Access, email security, Zero Trust.
- Skills, cloud and identity: Microsoft 365, Google Workspace, Azure, Entra ID, Intune, Purview, Jamf.
- Skills, email: Exchange Online, mail flow and transport rules, SPF, DKIM and DMARC, Mimecast.
- Skills, infrastructure: Windows Server, Active Directory, Hyper-V, VMware vSphere, DNS, DHCP, private cloud, Linux (Ubuntu, Debian, CentOS), macOS.
- Skills, backup and recovery: Veeam, Acronis, ShadowProtect, Spanning.
- Skills, networking and firewalls: SonicWall, Fortinet, Sophos, DrayTek, Aruba, Cisco, UniFi, Ruckus, VPNs, VLANs, TCP/IP.
- Skills, scripting, dev and DevOps: PowerShell, Git, automated troubleshooting workflows, AI-assisted support tooling, software development and debugging, CI/CD with Azure Pipelines and GitHub Actions, Docker.
- Skills, web: HTML, CSS, JavaScript, TypeScript, website hosting and DNS management.
- Tools: ServiceNow, Datto RMM, IT Glue, Claude Code, ChatGPT Codex.
- Leadership: technical mentoring, onboarding new staff, knowledge-sharing sessions, technical documentation, process development.
- Certifications: Cisco Meraki Network Associate (CMNA), Cisco Umbrella Studio 3.0, Sophos Firewall v22.0 Engineer (ET80), Cloudflare One Advanced.
- ShareX (Nov 2016 to now, volunteer): ShareX is a free, open-source screen capture and file-sharing tool for Windows with 34 million downloads. ${id.short} helps with support for its community of 23,500+ users on Discord and GitHub Issues, set up the project's support processes with the developers (including setup guides for third-party services like Cloudflare R2 and AWS), triages reported issues, and develops some features.
- BT and EE (Dec 2021 to Aug 2022): customer service advisor. The notes have no more detail than that.
- Reddit (Apr 2020 to Oct 2021): independent contractor. The notes have no more detail than that.
- Contact: email ${id.email} is best. Also Telegram (t.me/cubityfirst), Discord (cubityfir.st/discord) and Keybase chat (keybase.io/cubityfirst/chat).
- PGP: yes, the public key is at ${id.host}/key (\`cat pgp-key\`), and it's verified on Keybase (keybase.io/cubityfirst, \`cat keybase.txt\`).
- Elsewhere: GitHub github.com/CubityFirst, Bluesky bsky.app/profile/cubityfir.st, Twitter twitter.com/cubityfirst, Steam steamcommunity.com/id/cubityfirst, Twitch twitch.tv/CubityFirst, Instagram instagram.com/cubityfirst, Reddit reddit.com/u/Cubity_First.
- This site: plain HTML, CSS and JavaScript, served by Cloudflare Workers. It's open source at github.com/CubityFirst/cubityfir.st. The animation at the top is a small gravity simulation: clicking empty space drops a gravity point, points can be dragged, points that touch merge and grow, and a point that gets too big (or is double-clicked) collapses. Typing \`exit\` scrolls back up to it.

TERMINAL COMMANDS
help (list commands), whoami, ls, cat <file> (files: about.txt, faq.md, contact.txt, pgp-key, keybase.txt, activity.log), projects (what ${id.short}'s been building), tail -n N (recent GitHub activity), faq, contact, socials, age (exact age, ticking live), open <name> (opens a link, e.g. \`open github\`), clear.

${id.short.toUpperCase()}'S PUBLIC GITHUB PROJECTS (most recently updated first; descriptions written by ${id.short})
${repos || '(GitHub is unreachable right now, so suggest `projects` instead of describing them.)'}`;
}


/**
 * Public repos as a short list for the prompt, cached for an hour so the GitHub API's
 * unauthenticated limit isn't an issue.
 */
async function repoSummary(ctx) {
    const api = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`;
    const cache = caches.default, key = new Request(api);
    let res = await cache.match(key);
    if (!res) {
        try {
            res = await fetch(api, { headers: { 'User-Agent': 'cubityfir.st', Accept: 'application/vnd.github+json' } });
        } catch (e) {
            return '';
        }
        if (!res.ok) return '';
        res = new Response(res.body, res);
        res.headers.set('Cache-Control', 'max-age=3600');
        ctx.waitUntil(cache.put(key, res.clone()));
    }
    let list;
    try { list = await res.json(); } catch (e) { return ''; }
    return list
        .filter((r) => !r.fork && !r.archived && r.name !== GITHUB_USER)
        .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
        .slice(0, 15)
        .map((r) => `- ${r.name}${r.language ? ` (${r.language})` : ''}, updated ${r.pushed_at.slice(0, 10)}` +
                    `${r.stargazers_count ? `, ${r.stargazers_count} stars` : ''}: ${(r.description || 'no description').slice(0, 200)}`)
        .join('\n');
}


/**
 * Request handling
 */
function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
}

// Strings only, trimmed and capped; roles must alternate user/assistant, starting with user
function cleanHistory(history) {
    if (!Array.isArray(history)) return [];
    const out = [];
    for (const m of history.slice(-MAX_HISTORY)) {
        if (!m || typeof m.content !== 'string' || (m.role !== 'user' && m.role !== 'assistant')) return [];
        const want = out.length % 2 === 0 ? 'user' : 'assistant';
        if (m.role !== want) return [];
        out.push({ role: m.role, content: m.content.trim().slice(0, MAX_HISTORY_CHARS) || '…' });
    }
    return out.length % 2 === 0 ? out : out.slice(0, -1);
}

// The site's voice is lowercase, but the name isn't: "michael burr" -> "Michael Burr".
// Leaves the email address, domains and URLs (michael@michaelburr.co.uk) alone, but a
// full stop or comma at the end of a sentence is fine.
function capitalizeNames(text) {
    const notInAddress = '(?![\\w@]|[.\\-/]\\w)';
    return text
        .replace(new RegExp('(?<![\\w@./-])michael' + notInAddress, 'gi'), 'Michael')
        .replace(new RegExp('(?<=Michael )burr' + notInAddress, 'gi'), 'Burr');
}

async function ask(request, env, ctx) {
    const url = new URL(request.url);

    // Only the site's own pages, not other sites or scripts without an Origin
    const origin = request.headers.get('Origin');
    if (!origin || new URL(origin).host !== url.host) return json({ error: 'forbidden' }, 403);

    if (!env.CF_AIG_TOKEN) return json({ error: 'unavailable' }, 503);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.ASK_LIMITER) {
        const { success } = await env.ASK_LIMITER.limit({ key: ip });
        if (!success) return json({ error: 'busy' }, 429);
    }

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'invalid' }, 400); }
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return json({ error: 'invalid' }, 400);
    if (question.length > MAX_QUESTION) return json({ error: 'too-long', max: MAX_QUESTION }, 400);

    const id = identityFor(url, body.site);
    const messages = cleanHistory(body.history).concat({ role: 'user', content: question });

    const client = new Anthropic({
        // The key lives in the gateway. The placeholder satisfies the SDK, and the null
        // headers keep it from sending any provider credentials, so the gateway uses
        // the stored one.
        apiKey: 'placeholder',
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AIG_ACCOUNT_ID}/${env.AIG_GATEWAY_ID}/anthropic`,
        defaultHeaders: {
            'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}`,
            // Identical questions come from the gateway's cache, but only for a day, so
            // answers about recent projects don't go stale (the gateway default is 30 days)
            'cf-aig-cache-ttl': '86400',
            'x-api-key': null,
            Authorization: null
        },
        maxRetries: 1,
        timeout: 30 * 1000
    });

    let msg;
    try {
        msg = await client.beta.messages.create({
            model: MODEL,
            max_tokens: 2048,
            output_config: { effort: 'low' },     // short factual replies; thinking stays on but brief
            cache_control: { type: 'ephemeral' },
            // If a safety classifier declines, let the API retry on a suitable model
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: systemPrompt(id, await repoSummary(ctx)),
            messages
        });
    } catch (e) {
        if (e instanceof Anthropic.RateLimitError) {
            console.warn('ask: rate limited upstream', e.status, e.message);
            return json({ error: 'busy' }, 429);
        }
        if (e instanceof Anthropic.APIError && e.status === 424) {
            // The gateway's guardrails blocked the prompt (or the reply). The terminal
            // falls back to its built-in FAQ.
            console.warn('ask: blocked by gateway guardrails', e.message);
            return json({ error: 'blocked' }, 200);
        }
        if (e instanceof Anthropic.APIError) {
            console.error('ask: gateway/API error', e.status, e.message);
            return json({ error: 'unavailable' }, 502);
        }
        console.error('ask: request failed', e && e.message);
        return json({ error: 'unavailable' }, 502);
    }

    if (msg.stop_reason === 'refusal') return json({ error: 'declined' }, 200);

    const answer = capitalizeNames(msg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
        .slice(0, 1200));
    if (!answer) return json({ error: 'unavailable' }, 502);
    return json({ answer });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/api/ask') {
            if (request.method !== 'POST') return json({ error: 'method' }, 405);
            return ask(request, env, ctx);
        }
        if (url.pathname === '/api/toktrack') {
            if (request.method !== 'GET') return json({ error: 'method' }, 405);
            return toktrack(request, env, ctx);
        }
        if (url.pathname.startsWith('/api/')) return json({ error: 'not-found' }, 404);
        return env.ASSETS.fetch(request);
    }
};
