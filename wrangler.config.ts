import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig((ctx) => {
	switch (ctx.mode) {
		case "newsite": {
			if (ctx.isPreview) {
				return {
					assetsDirectory: "public",
				};
			}
			return {
				assetsDirectory: "public",
			};
		}
		default: {
			if (ctx.isPreview) {
				return {
					assetsDirectory: "public",
				};
			}
			return {
				assetsDirectory: "public",
			};
		}
	}
});
