// Static assets (public/) handle everything, including public/_redirects.
// Workers' _redirects only accepts relative or https:// targets, so the plain-http ones live here.
const HTTP_REDIRECTS = {
  "/music": "http://185.220.35.56:8000/128",
  "/whatpulseref": "http://whatpulse.org/ref/1297842",
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const target = HTTP_REDIRECTS[pathname];
    if (target) return Response.redirect(target, 302);
    return env.ASSETS.fetch(request);
  },
};
