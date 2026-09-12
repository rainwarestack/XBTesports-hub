# XBT calendar editor — Phase 2

## Active deployment

- Private editor: https://xbtesports-calendar.smithrock87.workers.dev/
- Public event feed: https://xbtesports-calendar-public.smithrock87.workers.dev/api/events
- Database: xbtesports-calendar, binding CALENDAR_DB.
- Owner: smithrock87@gmail.com.
- Access application: XBT Calendar Editor.
- Access team: https://broad-mouse-8ba0.cloudflareaccess.com

Cloudflare Access protects the calendar editor's production and preview URLs. Its Allow policy matches only the exact owner email. The login cookie is HttpOnly. The Worker independently verifies the signed Access token, its issuer, audience, expiry and owner email. The owner login was verified in the deployed editor on September 12, 2026.

The public feed is a separate Worker. It exposes only GET /api/events, queries published records only, and has no assets or administrative endpoints. No Access bypass policy is needed. The existing scoreboard Worker is unchanged.

## Editing

Open the editor and continue with Cloudflare sign-in. New events default to private drafts. Set Visibility to Published to display an event on the public calendar. Save a draft to keep it private. Every update/delete checks the event revision, preventing an older tab from overwriting newer changes.

The event timezone controls the meaning of entered start/end times. Daylight-saving gaps are rejected; repeated times offer first/second occurrence selection. Visitors see the corresponding time in their selected timezone.

The editor supports create/edit/delete, draft/publication status, source timezone, category, tournament status, description, game, format, prize, links and a featured flag. The featured flag is stored for future presentation; it does not yet pin entries. Recurring events, holiday customization and dragging/resizing are future increments.

## Public website

public/activetournament/config.js points to the public feed. Publish the GitHub Pages repository after changing this file. The calendar fetches saved events on page load; reload an already-open calendar after publishing an event. Empty schedules remain empty, and API failures display an error rather than sample events. Only an intentionally blank API setting returns to the Phase 1 sample preview.

## Deployment

- Editor: node node_modules/wrangler/bin/wrangler.js deploy --config worker/calendar.wrangler.toml
- Public feed: node node_modules/wrangler/bin/wrangler.js deploy --config worker/calendar-public.wrangler.toml
- Database migrations: node node_modules/wrangler/bin/wrangler.js d1 migrations apply xbtesports-calendar --remote --config worker/calendar.wrangler.toml

Keep the Access identifiers in the editor configuration aligned with the saved application. Do not remove the Access protection or add a development login bypass. Application audience and team domain are non-secret configuration; authentication tokens must never be committed.

## Verification

- node tests/calendar.test.mjs
- node --test tests/calendar-api.test.mjs tests/calendar-public.test.mjs
- node --check calendar-admin/script.js

The integration tests use signed RSA tokens and real SQLite storage behind a D1 adapter. They cover signature/claim rejection, verified Access cookies, private/public visibility, persistence, stale writes, unsafe links, invalid dates and DST transitions. Public-reader tests confirm drafts are excluded and mutation/admin paths are unavailable.

Deployment checks confirmed an anonymous request to the editor redirects to Cloudflare Access. The owner then signed in successfully and the editor enabled Save. No real tournaments or production test events were created during setup.

References:
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
