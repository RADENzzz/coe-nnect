# Password recovery email

CoE-NNECT supports an optional, verified recovery email for password resets.
It is deliberately separate from the Supabase login email: users keep signing
in with their institutional address, but can receive reset links at a personal
address they control.

The feature is optional. If SMTP is not configured the API still starts, the
Settings page shows a notice, and the recovery endpoints answer `503` with
`RECOVERY_EMAIL_UNAVAILABLE`.

## How it works

1. A signed-in user opens **Settings → Security → Recovery email** and enters
   an address.
2. The backend stores it as pending and emails a verification link.
3. The link opens `/recovery/verify?token=...`. The token is consumed and the
   address becomes verified.
4. On the sign-in page, **Forgot password?** calls
   `POST /api/v1/recovery/request` with either the login email or the verified
   recovery email.
5. The backend emails a single-use reset link to the login address or the
   verified recovery address.
6. `/reset-password?token=...` sets the new password through the Supabase admin
   API. Supabase revokes the account's existing sessions when the password
   changes.

A user can have one recovery address at a time, and a verified address can
belong to only one account. An unverified claim on an address does not block
the account that has already verified it.

### Tokens and limits

| Item | Value |
| --- | --- |
| Verification token lifetime | 24 hours |
| Reset token lifetime | 30 minutes |
| Token format | 32 random bytes, base64url |
| Stored value | SHA-256 hash only |
| Reuse | Verification and reset tokens are single-use |
| Public route limit | `RECOVERY_THROTTLE_LIMIT` per 15 minutes per IP (default 10) |
| Reset requests | 3 per 15 minutes per submitted address, excess silently dropped |
| Recovery-email changes | 5 per hour per user |
| Global API limit | Also applies (`THROTTLE_LIMIT`) |

Requesting a new reset link replaces the previous reset token, so older reset
links stop working. Changing or removing a recovery address also clears any
outstanding reset token.

## Endpoints

All paths are relative to the API base (default `/api`).

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/recovery/me` | Bearer JWT | Current recovery address, verification state, and whether SMTP is configured. |
| `PUT` | `/v1/recovery/me` | Bearer JWT | Add or change the recovery address and send a verification link. |
| `DELETE` | `/v1/recovery/me` | Bearer JWT | Remove the address and clear outstanding tokens. |
| `POST` | `/v1/recovery/request` | Public | Send a reset link to a login email or verified recovery email. Always answers `{ "success": true }`. |
| `POST` | `/v1/recovery/verify` | Public | Consume a verification token. |
| `POST` | `/v1/recovery/reset` | Public | Consume a reset token and set the new password. |

The three public routes are exempt from the maintenance gate so a reset still
works while the rest of the application is walled.

## Backend configuration

Set these in `apps/backend/.env` (or the deployment's environment). See
`apps/backend/.env.example` for the annotated template.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_PUBLIC_URL` | First `FRONTEND_URL` entry, or `http://localhost:5173` outside production | Public frontend origin used in email links. No trailing slash. |
| `SMTP_HOST` | — | Mox hostname, e.g. `mail.example.edu`. Required to enable email. |
| `SMTP_PORT` | `587` | Submission port. Mox usually offers `465` (implicit TLS) and `587` (STARTTLS). |
| `SMTP_SECURE` | `true` when port is `465`, otherwise `false` | Use implicit TLS instead of STARTTLS. |
| `SMTP_USER` | — | SMTP login, normally the full sender address. |
| `SMTP_PASSWORD` | — | SMTP password. Required when `SMTP_USER` is set. |
| `SMTP_FROM` | — | From header, e.g. `CoE-NNECT <no-reply@example.edu>`. Required to enable email. |
| `SMTP_REQUIRE_TLS` | `true` | Refuse to send without TLS. Set `false` only for a trusted local relay. |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` | Verify the SMTP server certificate. Set `false` only for a local Mox instance with a self-signed certificate. |
| `RECOVERY_THROTTLE_LIMIT` | `10` | Requests per 15 minutes per IP for the public recovery routes. |

Email is enabled only when `SMTP_HOST`, `SMTP_FROM`, and an app URL are all
present. A `SMTP_USER` without `SMTP_PASSWORD` disables the feature and logs a
warning instead of crashing the API.

Example:

```dotenv
APP_PUBLIC_URL=https://coe-nnect.example.edu
SMTP_HOST=mail.example.edu
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@example.edu
SMTP_PASSWORD=replace-with-a-long-password
SMTP_FROM="CoE-NNECT <no-reply@example.edu>"
```

## Set up Mox

Mox is a self-hosted mail server with a standard SMTP submission listener. Run
it on a Linux host with a public IP, a hostname such as `mail.example.edu`, and
control of the domain's DNS. The official install guide is
<https://www.xmox.nl/install/>.

1. Install Mox and run the quickstart as the Mox user:

   ```bash
   ./mox quickstart you@example.edu
   ```

   The quickstart writes the configuration, prints the initial admin and
   account passwords, and prints the DNS records to publish. It also checks
   outbound port 25 unless `-skipdial` is passed.

2. Publish the DNS records. MX, SPF, DKIM, DMARC, and reverse DNS (PTR) must all
   be correct for reliable delivery. Re-print and check them with:

   ```bash
   ./mox config dnsrecords example.edu
   ./mox config dnscheck example.edu
   ```

3. Create a dedicated sender account. `mox setaccountpassword` reads the
   password from standard input:

   ```bash
   ./mox config account add no-reply no-reply@example.edu
   ./mox setaccountpassword no-reply
   ```

4. Confirm the submission listener. The quickstart normally enables
   `Submissions` on port `465` (implicit TLS) and `Submission` on port `587`
   (STARTTLS). Use the matching `SMTP_PORT` and `SMTP_SECURE` values in the
   backend.

5. Make sure the host can deliver outbound mail on port 25. Many cloud providers
   block it; if yours does, configure a smarthost transport in Mox or use a
   provider that permits direct delivery. Submission from the backend to Mox is
   not affected by a blocked port 25, but delivery from Mox to the recipient is.

6. Send a test message and inspect the queue if it does not arrive:

   ```bash
   ./mox queue list
   ```

The backend connects to Mox over the submission port; it does not need IMAP or
the Mox web interface.

### Optional: Supabase Auth SMTP

The application's recovery flow sends mail directly from the backend, so
Supabase custom SMTP is **not** required for password resets. Configure
**Supabase Dashboard → Authentication → SMTP Settings** only if you also want
Supabase-generated auth mail (invitations, confirmations, magic links) to go
through Mox. Use the same host, port, sender address, and credentials.

## Apply the migration

The recovery table lives in `public.user_recovery`. Apply the migration with the
Supabase CLI or directly:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20261114000000_add_user_recovery.sql
```

The table has RLS enabled with no policies, and `anon`/`authenticated` grants
are revoked. Only the backend's database/service role can read it.

## Verify end to end

1. Start the backend with SMTP configured and confirm the feature is enabled:

   ```bash
   curl -s "$API/v1/recovery/me" \
     -H "Authorization: Bearer $TOKEN"
   ```

   `mailConfigured` must be `true`.

2. In **Settings → Security**, add a personal address. Confirm the verification
   email arrives and open the link. The page should report success.

3. Sign out and use **Forgot password?** with the verified recovery address.
   Confirm the reset email arrives, open the link, set a new password, and sign
   in with it.

4. Repeat with the login email. A reset link should be sent even when no
   recovery address is set.

5. Confirm tokens are consumed and hashed:

   ```sql
   select user_id, recovery_email, verified_at,
          verification_token_hash, reset_token_hash
   from public.user_recovery;
   ```

   Used tokens must be `null`, and stored hashes must never equal a link token.

6. Reuse an old reset link. It must be rejected, and the newest link must be the
   only one that works.

7. Request a reset for an unknown address. The response must still be
   `{ "success": true }` and no mail should be sent.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Settings says email recovery is not configured | `SMTP_HOST`, `SMTP_FROM`, and `APP_PUBLIC_URL`/`FRONTEND_URL` are set; inspect the backend startup log for the SMTP warning. |
| `503 RECOVERY_EMAIL_SEND_FAILED` | SMTP host/port, credentials, and TLS mode. Try `openssl s_client -connect mail.example.edu:465` or `swaks` from the backend host. |
| Certificate error against a local Mox | Use the correct hostname in `SMTP_HOST`, or set `SMTP_TLS_REJECT_UNAUTHORIZED=false` for local development only. |
| Link points at `localhost` | Set `APP_PUBLIC_URL` to the public frontend origin and restart the backend. |
| API returns success but no mail arrives | Check the Mox queue (`mox queue list`), spam/junk, and SPF/DKIM/DMARC alignment. |
| Mail queues but never delivers | Outbound port 25 is blocked, or PTR/SPF/DNS is wrong. Use `mox queue list` and the Mox logs; configure a smarthost if needed. |
| `429 Too many requests` | Wait for the window to pass, or raise `RECOVERY_THROTTLE_LIMIT`. Per-address reset limits are intentionally silent. |
| Verification link invalid or expired | Request a new verification email from Settings → Security. Links last 24 hours and only the latest token is valid. |
| Reset link invalid or expired | Request a new link. Reset links last 30 minutes, are single-use, and are replaced by newer requests. |

## Security notes

- Token hashes are stored in a separate table that the browser cannot read:
  RLS is enabled with no policies and `anon`/`authenticated` grants are revoked.
- Verification and reset tokens are random, hashed with SHA-256, single-use, and
  time-limited.
- Reset requests return the same response for known, unknown, and inactive
  accounts, which prevents account enumeration.
- A verified recovery address can belong to only one account. Unverified claims
  are ignored when routing reset mail.
- Recovery-email changes are audited (`user.recovery_email_updated` and
  `user.recovery_email_removed`).
- Existing sessions are revoked by Supabase when the password changes.
