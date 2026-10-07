# Account security and password recovery

Players can open **My Profile → Account Security**, or click their handle and choose **Account Security**.

## Player setup

1. Choose **Enable two-factor**. Confirm your password, or use a sign-in from the last five minutes.
2. In an authenticator app, add a time-based account named XBTesports Social and paste the setup key. Setup uses standard six-digit TOTP codes with a 30-second period.
3. Enter the app’s current code to finish. Two-factor is not enabled before this confirmation.
4. Save the eight single-use backup codes separately from the authenticator. Password and Discord/Google sign-ins both require the extra code once enabled.
5. Once email sending is connected, choose **Add recovery email**, confirm your identity, and follow the emailed verification link while signed in to that player account. The address is private.
6. Use **Forgot password?** on the sign-in screen to request an email reset. Existing accounts must add and verify an address first; OAuth provider addresses are not silently imported.

Reset links expire after 15 minutes. Verification links expire after 30 minutes. Both are single-use. Requesting a newer link invalidates the older link of the same kind. Changing the verified address invalidates existing reset links.

A password reset signs out all sessions, rotates the emergency recovery key, and **keeps two-factor authentication enabled**. It still requires an authenticator or unused backup code. The original recovery-key flow remains available as a fallback and also respects two-factor. Losing all second-factor methods does not automatically disable protection through email or Discord.

## Connect email delivery with Resend

Email features stay visibly unavailable until both settings below exist. This deployment does not create a Resend account, buy a plan, or modify DNS automatically.

1. Create or sign in to [Resend](https://resend.com/).
2. In **Domains**, add `account.xbtesports.nyc` as a sending subdomain. Copy the exact DNS records Resend supplies into Cloudflare DNS. Keep existing website and mailbox records. Wait until Resend marks the domain verified. [Verified domains documentation](https://resend.com/docs/dashboard/domains/introduction).
3. Leave open/click tracking off for this transactional domain, especially because recovery links carry a private token in their fragment.
4. Create a **Sending access** API key, restricted to this domain. [API key documentation](https://resend.com/docs/dashboard/api-keys/introduction).
5. Cloudflare → Workers & Pages → **xbtesports-social** → Settings → Variables and Secrets:
   - Add `RESEND_API_KEY` as a **Secret** with that API key.
   - Add `AUTH_EMAIL_FROM` as a **Text** variable: `XBTesports Social <security@account.xbtesports.nyc>`.
   - Save/deploy. Do not paste the API key into chat or commit it to Git.
6. Open your player profile on the public site, add your recovery email, verify it, then test **Forgot password?**. Confirm delivery to an actual mailbox and inspect Resend delivery logs if it does not arrive.

Only `xbtesports-social` needs the mail sender for the public account flow. All email links open `https://xbtesports.nyc/social/`; no redirect destination is accepted from user input or request headers.

## Deployment and maintenance

- Apply `worker/social/migrations/0007_account_security.sql` to the shared social D1 database before deploying. It preserves existing users, profiles and sessions.
- Both social-serving Workers need the same 64-hex-character `ACCOUNT_SECURITY_KEY` secret. Initial setup: `node scripts/configure-account-security.mjs`. The script checks for an existing key first, generates a cryptographically random value in memory, and sends it directly to Wrangler; it does not print or save the key to a local file.
- **Keep this key stable.** Deleting or changing it makes existing authenticator secrets unreadable. Any future rotation needs a deliberate re-encryption migration.
- TOTP secrets are AES-GCM encrypted with user-bound authenticated data. Backup codes, sign-in challenges and email tokens are stored as hashes. Authentication secrets and email addresses are stored outside public profiles.
- Challenges expire after five minutes. Code attempts, recovery requests and security changes are rate limited. Used TOTP time steps and backup codes cannot be reused.
- Sensitive settings require the current password or a sign-in within five minutes, plus the existing second factor. Security changes revoke previous sessions using account versions as well as deleting session records.
- Email requests return the same response for known and unknown addresses. The public Worker performs delivery through `waitUntil` so mail-provider timing does not reveal account existence. Failed delivery logs contain no address or reset token.
- Cloudflare Access protects the separate owner editor. Its synthetic `access-owner` identity cannot enroll or change a player’s private security settings.

Validation: `node --test tests/account-security.test.mjs tests/account-security-ui.test.mjs tests/social.test.mjs`.
