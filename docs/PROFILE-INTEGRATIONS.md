# Profile favorites and widgets

Players open their profile → Favorites & Widgets, or Edit Profile → Save & Edit Favorites / Widgets.

- IGDB: up to eight favorite games, with cover art. This is a favorites collection, not a claim of verified game ownership, achievements, rank, or playtime.
- Last.fm: a public username displays three recent tracks and a Now playing indicator when Last.fm supplies it. Refreshes once per minute. This is not verified account linking.
- Favorite shots: up to six uploaded screenshots or Unsplash photographs. Uploaded screenshots use the existing R2 upload service. Unsplash images retain their original image URLs and photographer attribution.
- Flip clock: opt-in current time in the player's chosen IANA timezone, including daylight-saving changes. No API key is needed.

## Connect services

In Cloudflare → Workers & Pages → **xbtesports-social** → Settings → Variables and Secrets, add the following. Never put secret values in Git, chat, browser JavaScript, or screenshots.

| Variable | Type | Obtain from |
| --- | --- | --- |
| `IGDB_CLIENT_ID` | Text | Twitch Developer Console application Client ID |
| `IGDB_CLIENT_SECRET` | Secret | Same Twitch application, Client secret |
| `LASTFM_API_KEY` | Secret | Last.fm API account API key |
| `UNSPLASH_ACCESS_KEY` | Secret | Unsplash developer application Access Key |

1. **IGDB:** create a Confidential application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps), with two-factor authentication enabled on the Twitch account. IGDB's app-token flow does not use a login redirect; its [setup guide](https://api-docs.igdb.com/#account-creation) says to enter localhost for the required redirect field. Generate a Client secret. The Worker obtains and caches an app access token automatically. IGDB lists free non-commercial use; check its commercial partnership terms if applicable to the site's use.
2. **Last.fm:** create an [API account](https://www.last.fm/api/account/create). Use XBTesports Social and `https://xbtesports.nyc` for the application details. This integration only reads public recent tracks; it does not need a Last.fm shared secret or authorization callback. [Method documentation](https://www.last.fm/api/show/user.getRecentTracks).
3. **Unsplash:** register an application in [Unsplash Developers](https://unsplash.com/developers), follow its API guidelines, and use the Access Key. A Secret Key is not needed. Demo applications have a limited hourly request allowance; request production access for wider use. The integration caches searches, hotlinks image URLs, displays photographer/Unsplash credit, and triggers the download endpoint when an image is newly saved to a profile. [API documentation](https://unsplash.com/documentation).
4. Save and deploy the Worker, then refresh Edit Profile. Search controls appear when their service is configured. Screenshot uploads and the timezone clock work without these credentials. If the protected owner editor also needs these searches, configure the same integration variables on `xbtesports-calendar`.

Keep existing Discord and OAuth settings. `keep_vars = true` on the public Worker preserves dashboard variables during Wrangler deployments, including the current Google-sign-in setting.

## Deployment and validation

Apply `0006_profile_extras.sql` to the existing SOCIAL_DB before publishing the Worker. It adds a separate preferences table; it does not remove old match records, posts, or relationships.

```powershell
node scripts/prepare-social.mjs
node --test tests/profile-extras.test.mjs tests/social.test.mjs tests/calendar-api.test.mjs tests/calendar-public.test.mjs tests/calendar.test.mjs
node_modules/.bin/wrangler.cmd d1 migrations apply xbtesports-social --remote --config worker/social.wrangler.toml
node_modules/.bin/wrangler.cmd deploy --config worker/social.wrangler.toml
node_modules/.bin/wrangler.cmd deploy --config worker/calendar.wrangler.toml
```

The static GitHub Pages files must also be published through the repository's Pages workflow. Without real provider credentials, automated provider checks use mocked responses; verify live searches/listening after setup. Missing or failed providers leave the rest of the profile usable.
