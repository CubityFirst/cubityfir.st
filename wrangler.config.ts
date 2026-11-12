import { defineWranglerConfig } from "wrangler/experimental-config";

// Wrangler build settings for `cf dev` / `cf build` / `cf deploy` (cf delegates the build
// to Wrangler). The Worker config and bindings live in cloudflare.config.ts. Every mode
// (production, newsite, Previews) serves the same static site.
export default defineWranglerConfig({
	assetsDirectory: "public",
});
