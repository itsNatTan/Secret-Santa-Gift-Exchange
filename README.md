# Gift Exchange

A Next.js App Router app hosted on Vercel, with Supabase Postgres and Gmail SMTP.
Anyone can create an event without an account. Participants join via `/events/CODE`
or enter a code on the home page. Each event has its own settings, registrations,
and Secret Santa draw. The same email address can join multiple events.

## Local development

Requires Node.js 22.13+ (the tests use Node's TypeScript stripping).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill in `.env.local` before accessing event pages or creating an event.
Never expose the Supabase service-role key in a `NEXT_PUBLIC_` variable.

## Database setup

For an **existing deployment of the original single-event app**, back up the
Supabase database and run **only**
[`supabase/migrations/20261103_multi_event.sql`](supabase/migrations/20261103_multi_event.sql)
once in Supabase's SQL editor. Run it before deploying the new application;
avoid registrations during the migration/deployment window.

The migration preserves all participant IDs, private edit links, settings and
assignments. The original exchange becomes **NSCC Gift Exchange**, with join code
**NSCC2026**. Keep the existing `ADMIN_PASSWORD` in Vercel: use it as the private
admin code for this migrated event. It has no access to other events. The old
`event_settings` table remains as an unused backup. Existing sessions must log in again.

Historical assignment email delivery status is unknown. Migrated assignments are
shown as pending; clicking Send pending emails may send another copy. If you know
all old emails were delivered, mark those historical rows as sent in Supabase
before using that action.

For a **brand-new database**, run [`supabase/schema.sql`](supabase/schema.sql)
once instead. Do not run the fresh schema on the existing deployment, and do not
run both scripts. All app tables have RLS enabled with no browser access policies;
route handlers use the server-only service-role key. Draw and email-claim RPCs
are restricted to `service_role`.

## Vercel and Gmail setup

Configure these environment variables for each relevant Vercel environment,
then redeploy:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing service-role key; server only |
| `NEXT_PUBLIC_SITE_URL` | Optional canonical app origin, e.g. `https://your-app.vercel.app`; defaults to the registration request's origin |
| `ADMIN_SESSION_SECRET` | A long random secret used to sign eight-hour admin sessions |
| `GOOGLE_SMTP_USER` | The Gmail address used to send every event's emails |
| `GOOGLE_SMTP_APP_PASSWORD` | A Google app password, not your usual account password |
| `ADMIN_PASSWORD` | Only needed to keep admin access to the migrated NSCC2026 event |

Enable Google 2-Step Verification, then create an app password at
[Google App Passwords](https://myaccount.google.com/apppasswords). Some managed
accounts do not allow app passwords; see
[Google's requirements](https://support.google.com/accounts/answer/185833?hl=en).

Email uses Nodemailer over TLS to `smtp.gmail.com:465`, sending from
`GOOGLE_SMTP_USER`. A custom domain is not required. Gmail sending limits and
account restrictions still apply; see
[Nodemailer's Gmail guide](https://nodemailer.com/guides/using-gmail).
The obsolete `RESEND_API_KEY` and `EMAIL_FROM` variables can be removed.

After deployment, create a test exchange, join with a real mailbox and confirm
that the private edit email arrives. Then test a draw with three test participants.
Live Gmail delivery requires credentials and is not covered by the local tests.

## Organiser workflow

1. Create an event on the home page. It opens an admin session automatically.
2. **Save/download the private admin code immediately.** The raw code is shown
   once and only its SHA-256 hash is stored. There is no account-based recovery.
3. Share the join URL or event code with participants. Keep the admin code private.
4. On `/admin`, enter the event code and private admin code to access that event.
   Log out to switch to another exchange. The session lasts eight hours.
5. Set budget, date and registration deadline, inspect participant preferences,
   and close registration when ready. Deadline inputs use the organiser's browser
   timezone; public event pages show Singapore time.
6. Generate the draw with at least three participants. The database commits it
   atomically, closes registration, and prevents another draw. Self-assignments
   and reciprocal pairs are prohibited.
7. Emails are sent in batches of five to fit within Vercel request limits. Use
   **Send pending emails** until all are sent. Retries use the saved assignments.
   Claims prevent overlapping requests from sending the same batch. After a
   request interruption, wait two minutes for claims to expire. SMTP cannot
   guarantee exactly-once delivery: a timeout after acceptance, or interruption
   before recording success, can result in a duplicate email when retried.

Registration is saved even if confirmation email fails. The success page always
shows a private edit link to save; that link works until registration closes.
The organiser can view participant details, while the assigned giver receives
the recipient's gift preferences by email.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

For HTTP checks, start a production preview on port 3100 using
`node node_modules/next/dist/bin/next start -p 3100`, then run
`node scripts/http-smoke.cjs` in another terminal.

Tests use an isolated in-memory PostgreSQL runtime (PGlite), without live
Supabase credentials. They cover event isolation, duplicate registrations,
closed registration, atomic/one-time draws, email claims, server-only RPC
permissions, migration preservation, signed session expiry/tampering, input
validation and matching constraints. The PostgreSQL test runtime omits the
`pgcrypto` extension declaration because `gen_random_uuid()` is built in.

`package-lock.json` pins dependencies for Vercel. A PostCSS override keeps the
Next.js 15 dependency patched without a framework major-version migration.
