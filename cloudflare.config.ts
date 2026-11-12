import { bindings, defineConfig } from "cf/config";

/**
 * cubityfir.st / michaelburr.co.uk: a static site in public/ (the assets directory is a
 * build setting, so it lives in wrangler.config.ts). The Worker only handles /api/*: the
 * terminal's /api/ask and /api/toktrack.
 *
 * Modes (select with `--mode`):
 *   default  production: the `cubityfirst` Worker on cubityfir.st and michaelburr.co.uk.
 *            Deployed by Workers Builds on every push to master (`npx cf deploy`), or by
 *            hand with `npm run deploy`.
 *   newsite  test site: a separate Worker (`cubityfirst-newsite`) on newsite.cubityfir.st,
 *            leaving production untouched. Deploy it with `npm run deploy:newsite`.
 *
 * Secrets aren't part of this file and are kept across deploys. The terminal's questions
 * go through an AI Gateway that holds the Anthropic key; the Worker authenticates to it
 * with the CF_AIG_TOKEN secret, set per Worker:
 *   npx wrangler secret put CF_AIG_TOKEN --name cubityfirst
 *   npx wrangler secret put CF_AIG_TOKEN --name cubityfirst-newsite
 *
 * Previews: Previews don't inherit production bindings, and this Worker has never given
 * them any, so the ctx.isPreview branch carries only the assets binding (no vars, R2 or
 * rate limiter). /api/ask isn't expected to work in a Preview; add Preview-safe bindings
 * there if that changes.
 * @see https://developers.cloudflare.com/workers/previews/configuration/
 */

const MODES = {
	default: {
		name: "cubityfirst",
		workersDev: true,
		domains: ["cubityfir.st", "michaelburr.co.uk"],
		askLimiterNamespace: "1001",
	},
	newsite: {
		name: "cubityfirst-newsite",
		workersDev: false,
		domains: ["newsite.cubityfir.st"],
		// Rate limiter namespaces are account-wide, so the test site gets its own.
		askLimiterNamespace: "1002",
	},
};

export default defineConfig((ctx) => {
	const mode = ctx.mode === "newsite" ? MODES.newsite : MODES.default;

	const env = ctx.isPreview
		? { ASSETS: bindings.assets() }
		: {
				// AI Gateway the terminal's questions go through (see CF_AIG_TOKEN above).
				AIG_ACCOUNT_ID: bindings.text("d843ae90cab33e54f4d284bc65d2fd6a"),
				AIG_GATEWAY_ID: bindings.text("cubityfir-st"),
				// toktrack usage data for the terminal's `toktrack` command (src/toktrack.js),
				// uploaded every 12 hours by scripts/upload-toktrack.ps1.
				TOKTRACK: bindings.r2({
					name: "cubityfirst-toktrack",
				}),
				// Questions per visitor (IP) per minute.
				ASK_LIMITER: bindings.rateLimit({
					namespace: mode.askLimiterNamespace,
					simple: {
						limit: 6,
						period: 60,
					},
				}),
				ASSETS: bindings.assets(),
			};

	return {
		accountId: "d843ae90cab33e54f4d284bc65d2fd6a",
		worker: {
			name: mode.name,
			compatibilityDate: "2026-10-01",
			entrypoint: "src/worker.js",
			workersDev: mode.workersDev,
			previewUrls: true,
			assets: {
				notFoundHandling: "404-page",
				// Everything else is served straight from public/ without invoking the Worker.
				runWorkerFirst: ["/api/*"],
			},
			domains: mode.domains,
			env,
		},
	};
});
