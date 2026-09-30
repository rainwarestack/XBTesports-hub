# Discord sign-in setup

Password sign-in continues to work. Discord buttons appear only when the public Social Worker has all three settings below. No existing account is matched by handle or email: sign in normally, open Edit Profile, and select **Link Discord to this account** to keep your profile.

1. Create an application in https://discord.com/developers/applications named XBTesports Social.
2. Under OAuth2, add this exact redirect:
   `https://xbtesports-social.smithrock87.workers.dev/api/social/oauth/callback`
3. Add `DISCORD_CLIENT_ID` and `OAUTH_BASE_URL` (`https://xbtesports-social.smithrock87.workers.dev`) to the **xbtesports-social** Worker variables. Add `DISCORD_CLIENT_SECRET` as an encrypted secret. Never paste the secret into chat or commit it to Git.
4. Apply migration `0004_oauth.sql` and deploy the Social Worker. In the Cloudflare dashboard, saving variables may offer a new deployment; use Save and deploy.
5. Verify Sign in with Discord opens Discord, returns to the verification page, and signs you in on Social. First-time users choose an unused XBT handle. Existing players should link from Edit Profile before using the new sign-in button.

Only the `identify` scope is requested. Discord tokens are exchanged server-side and never sent to the browser or saved. Short-lived state, a secure HttpOnly popup cookie, a separate browser verifier, and one-time completion protect the flow. Account suspension checks apply. Provider-only accounts recover access through Discord.

Reference: https://docs.discord.com/developers/topics/oauth2


## Google sign-in

Create a **Web application** OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/clients). Configure the consent screen for XBTesports Social and add the website's privacy policy and terms URLs as required by Google. In testing mode, add your test users; publish the consent configuration when ready for public use.

Add this exact authorized redirect URI:
`https://xbtesports-social.smithrock87.workers.dev/api/social/oauth/google/callback`

Set `GOOGLE_CLIENT_ID` and `OAUTH_BASE_URL` on the public **xbtesports-social** Worker and add `GOOGLE_CLIENT_SECRET` as an encrypted secret. Store non-secret variables in `worker/social.wrangler.toml` too, so a future Wrangler deployment preserves them. Never place the client secret in the repository or chat. Migration `0005_google_oauth.sql` adds provider selection and Google PKCE state to the existing flow.

Google's button appears only when configured. Existing players should sign in normally, open Edit Profile, and use **Link Google to this account**. Provider identities remain separate; matching handles or emails never silently merge accounts. Google authentication requests only `openid profile`, exchanges the code server-side with PKCE, and verifies identity through Google's HTTPS UserInfo endpoint. Provider access tokens are not stored.

Reference: https://developers.google.com/identity/protocols/oauth2/web-server
