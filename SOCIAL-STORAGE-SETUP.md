# Social media storage

R2 bucket: `xbtesports-social-media` (Standard). The bucket stays private; the
application serves media after checking the profile/post visibility rules.

Both `worker/social.wrangler.toml` and `worker/calendar.wrangler.toml` bind this
bucket as `MEDIA` and the shared `xbtesports-social` D1 database as `SOCIAL_DB`.
The separate calendar database and Access owner authorization are preserved.

Uploads require a signed-in, unmuted account and are rate-limited to eight per
hour. Images accept PNG/JPEG/WebP up to 4 MiB. Clips accept self-contained MP4
up to 20 MiB and 45 seconds, checked against the server-parsed sample timeline.
Video transcoding and generated thumbnails are not configured.

The public service is https://xbtesports-social.smithrock87.workers.dev/social.
The protected editor is https://xbtesports-calendar.smithrock87.workers.dev/social/admin.
`GET /api/social/health` returns `uploads: true` when the media binding exists.

New player passwords use versioned scrypt hashes (N=32768, r=8, p=3). Cloudflare's
production PBKDF2 API rejects iteration counts above 100000, so the original
210000-iteration implementation could not create production accounts. Legacy
hash verification is retained for existing local development fixtures.

Validation: `node --test tests/social.test.mjs tests/calendar-api.test.mjs tests/calendar-public.test.mjs`.
