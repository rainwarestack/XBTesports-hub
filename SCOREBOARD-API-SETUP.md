# Shared OBS synchronization

GitHub Pages cannot share browser `localStorage` with OBS. The included `worker/scoreboard-api.ts` is a small Cloudflare Worker backed by KV.

1. Create a Cloudflare KV namespace and copy its ID into `worker/scoreboard-api.wrangler.toml`.
2. From the repository root, deploy it with `npx wrangler deploy -c worker/scoreboard-api.wrangler.toml`.
3. Set `window.XBT_SCOREBOARD_API` to the Worker URL in both `public/admin/index.html` and `public/overlay/index.html`, before `scoreboard-data.js` loads.
4. Commit and push the site. The admin will PUT updates to the Worker, and OBS will GET the latest data on each poll.

Use a Cloudflare secret for `ADMIN_TOKEN` before a public tournament. The current UI continues to work locally when the API URL is blank.
