# XBT calendar editor — Phase 2

## Deployed components

- Editor: https://xbtesports-calendar.smithrock87.workers.dev/
- Public read-only events: https://xbtesports-calendar.smithrock87.workers.dev/api/events
- D1 database: xbtesports-calendar (binding CALENDAR_DB).
- Sole administrator: smithrock87@gmail.com, checked in the server-verified Access JWT.
- Production sign-in is **not configured yet**. Admin reads and writes fail closed until both ACCESS_TEAM_DOMAIN and ACCESS_AUD are set.

The existing GitHub Pages website and scoreboard Worker remain separate. The editor uses HTML/CSS/vanilla JavaScript; the new calendar Worker provides authenticated event management and durable D1 storage.

## Finish administrator sign-in

1. In Cloudflare Zero Trust, create or select your team. Record its HTTPS team domain, ending in `.cloudflareaccess.com`.
2. Create a self-hosted Access application for `xbtesports-calendar.smithrock87.workers.dev`. Enable Workers.dev Access protection if prompted. Use Google sign-in or One-time PIN.
3. Set its Allow policy to the **exact email** `smithrock87@gmail.com`. Do not allow everyone or all Gmail accounts. Set a session duration appropriate for administration (for example, 8 hours).
4. Leave `/api/events` and `/api/status` public using separate, more-specific path applications with Bypass policies. These two endpoints contain no private data. Do not bypass `/api/admin/*`.
5. Copy the application's audience (AUD) tag and team domain into `worker/calendar.wrangler.toml` as ACCESS_AUD and ACCESS_TEAM_DOMAIN. These identifiers are configuration, not login secrets.
6. Deploy using `node node_modules/wrangler/bin/wrangler.js deploy --config worker/calendar.wrangler.toml`.
7. Open the editor, sign in as the owner, create a private draft, reload and confirm it persists. Confirm the draft is absent from `/api/events`. Publish it and confirm it appears; unpublish it and confirm it disappears. An incognito visitor must not be able to list drafts or mutate events.

JWT signatures, issuer, audience, expiry, and owner email are verified by the Worker. There is no local bypass, no shared password in JavaScript, and no hidden-control security assumption. Mutations also require same-origin JSON and an event revision to avoid overwriting newer changes.

Cloudflare references:
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/workers/static-assets/binding/

## Connect the public calendar

`public/activetournament/config.js` deliberately leaves XBT_CALENDAR_API blank while sign-in setup is pending, preserving the Phase 1 sample preview. When the owner can manage real events, set it to `https://xbtesports-calendar.smithrock87.workers.dev` and publish the existing GitHub Pages repository. Empty live schedules stay empty; network failures show an unavailable message rather than fictional tournaments. Reloading the calendar fetches the latest saved events.

The modal enables configured HTTPS registration/tournament links. Drafts are filtered by the server, not merely hidden by the UI. Registration actions are disabled for cancelled, postponed, completed, or registration-closed events.

## Local development / checks

- `node tests/calendar.test.mjs`
- `node --test tests/calendar-api.test.mjs` (Node 24, built-in SQLite; no new dependencies).
- `node --check calendar-admin/script.js`
- `node --check worker/calendar-api.mjs`

API tests use genuine signed RSA tokens and a real SQLite database behind a D1-compatible adapter. They cover rejected credentials, private/public visibility, persistence, stale updates/deletes, malicious links, input validation, and spring/fall daylight-saving transitions. They do not claim an end-to-end production login test before Access is connected.

A static local preview can display the editor form but cannot save events or bypass login. Do not add production test credentials or deploy a development bypass.

## Next additions

Recurring rules, drag/reschedule interactions, registration windows, holiday editing and rich customization are future increments. Phase 2 currently supports create/edit/delete, private drafts/publication, event timezone, DST ambiguity selection, status/category, description, game/format, prize, links, and featured flag. Featured is saved for future presentation; it does not yet pin calendar entries.
