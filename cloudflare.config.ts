import { bindings, defineConfig } from "cf/config";

/**
 * Static site in public/ (assets directory is set in wrangler.config.ts); the Worker only
 * handles /api/* (the terminal's /api/ask and /api/toktrack).
 *
 * Modes (select with `--mode`):
 *   default  production: cubityfir.st and michaelburr.co.uk
 *   newsite  test site: a separate worker (cubityfirst-newsite) on newsite.cubityfir.st,
 *            leaving production untouched. Its CF_AIG_TOKEN secret is set separately.
 *
 * The AI Gateway the terminal's questions go through holds the Anthropic key; the Worker
 * authenticates with the CF_AIG_TOKEN secret.
 *
 * Previews: Previews don't inherit production settings, and the old Wrangler config had an
 * empty `previews` block, so the ctx.isPreview branches deliberately carry only the
 * assets binding (no vars, R2, or rate limiter). /api/ask isn't expected to work in a
 * Preview; add Preview-safe bindings there if that changes.
 * @see https://developers.cloudflare.com/workers/previews/configuration/
 * @see https://developers.cloudflare.com/workers/wrangler/environments/
 */

export default defineConfig((ctx) => {
	switch (ctx.mode) {
		case "newsite": {
			if (ctx.isPreview) {
				return {
					worker: {
						name: "cubityfirst-newsite",
						compatibilityDate: "2026-10-01",
						entrypoint: "src/worker.js",
						workersDev: false,
						previewUrls: true,
						assets: {
							notFoundHandling: "404-page",
							runWorkerFirst: [
								"/api/*",
							],
						},
						domains: [
							"newsite.cubityfir.st",
						],
						env: {
							ASSETS: bindings.assets(),
						},
					},
				};
			}
			return {
				worker: {
					name: "cubityfirst-newsite",
					compatibilityDate: "2026-10-01",
					entrypoint: "src/worker.js",
					workersDev: false,
					previewUrls: true,
					assets: {
						notFoundHandling: "404-page",
						runWorkerFirst: [
							"/api/*",
						],
					},
					domains: [
						"newsite.cubityfir.st",
					],
					env: {
						AIG_ACCOUNT_ID: bindings.text("d843ae90cab33e54f4d284bc65d2fd6a"),
						AIG_GATEWAY_ID: bindings.text("cubityfir-st"),
						TOKTRACK: bindings.r2({
							name: "cubityfirst-toktrack",
						}),
						ASK_LIMITER: bindings.rateLimit({
							namespace: "1002",
							simple: {
								limit: 6,
								period: 60,
							},
						}),
						ASSETS: bindings.assets(),
					},
				},
			};
		}
		default: {
			if (ctx.isPreview) {
				return {
					worker: {
						name: "cubityfirst",
						compatibilityDate: "2026-10-01",
						entrypoint: "src/worker.js",
						workersDev: true,
						previewUrls: true,
						assets: {
							notFoundHandling: "404-page",
							runWorkerFirst: [
								"/api/*",
							],
						},
						domains: [
							"cubityfir.st",
							"michaelburr.co.uk",
						],
						env: {
							ASSETS: bindings.assets(),
						},
					},
				};
			}
			return {
				worker: {
					name: "cubityfirst",
					compatibilityDate: "2026-10-01",
					entrypoint: "src/worker.js",
					workersDev: true,
					previewUrls: true,
					assets: {
						notFoundHandling: "404-page",
						runWorkerFirst: [
							"/api/*",
						],
					},
					domains: [
						"cubityfir.st",
						"michaelburr.co.uk",
					],
					env: {
						AIG_ACCOUNT_ID: bindings.text("d843ae90cab33e54f4d284bc65d2fd6a"),
						AIG_GATEWAY_ID: bindings.text("cubityfir-st"),
						TOKTRACK: bindings.r2({
							name: "cubityfirst-toktrack",
						}),
						ASK_LIMITER: bindings.rateLimit({
							namespace: "1001",
							simple: {
								limit: 6,
								period: 60,
							},
						}),
						ASSETS: bindings.assets(),
					},
				},
			};
		}
	}
});
