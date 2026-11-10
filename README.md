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
Supabase database and first run
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

For an existing multi-event deployment, run
[`supabase/migrations/20261110_forced_pairs.sql`](supabase/migrations/20261110_forced_pairs.sql)
once before deploying the forced-pairings feature. Original single-event databases
must first run the multi-event migration above, then this migration. New databases
using the current fresh schema already include this feature. The migration
preserves existing participants and draws.

Then run [`supabase/migrations/20261110_review_draw.sql`](supabase/migrations/20261110_review_draw.sql)
once to enable draft review and confirmation. Existing generated draws remain
confirmed and locked, preserving their assignments and email delivery status.
New databases using the current fresh schema need neither of these migrations.

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
6. Optionally add giver → recipient choices under **Forced pairings**, then click
   **Save forced pairings**. These choices are stored for the event and remain
   after refreshing or logging in again. Duplicate givers/recipients, self or
   reciprocal pairs, and combinations that cannot produce a complete draw are
   rejected. Click **Generate draft draw** with at least three participants.
   Initial forced pairings are honoured and everyone else is assigned automatically.
   This closes registration and saves a draft without sending assignment emails.
7. Under **Review assignments**, change recipients as needed, including overriding
   an initial forced choice. Each person must give once and receive once, with no
   self or reciprocal pairings. When moving recipients, update all affected rows,
   then click **Save draft changes**. Drafts persist after refreshing. Concurrent
   edits or confirmations from an outdated review are rejected.
8. Click **Confirm draw & send all emails** after reviewing the saved draft.
   This permanently locks the assignments and starts sending. Keep the dashboard
   open: it automatically sends successive batches of five within Vercel request
   limits. If sending stops or you close the page, use **Send pending emails** to
   continue. It stops automatically when a batch makes no progress, so failures
   do not cause endless retries. Retries use the confirmed assignments.
   Claims prevent overlapping requests from sending the same batch. After a
   request interruption, wait two minutes for claims to expire. SMTP cannot
   guarantee exactly-once delivery: a timeout after acceptance, or interruption
   before recording success, can result in a duplicate email when retried.

Registration is saved even if confirmation email fails. The success page always
shows a private edit link to save; that link works until registration closes.
If a participant loses their link, expand their entry on the admin dashboard and
click **Generate new edit link & email**. This invalidates their previous link,
automatically emails the replacement to their registered address, and shows a
private link you can copy and share directly even if email delivery fails.
Save it before leaving the dashboard; only its hash is stored in the database.
Replacement links are available only while registration is open, before its
deadline and before the draw. This feature uses the existing database schema.
The organiser can view participant details, while the assigned giver receives
the recipient's gift preferences by email.

### Import an expected participant list

On the admin dashboard, paste the two **Name** and **Email** columns copied from
Excel into **Import expected participants**. Headers are optional: without headers,
use name then email; with headers, either column order is accepted. Quoted Excel
cells and CSV lists are also supported, up to 1,000 rows per paste.

The preview compares email addresses without case sensitivity and identifies
missing people, existing registrations, duplicate rows and invalid entries.
Correct invalid rows, then click **Import missing participants & email**. Only
missing people are registered; existing names, preferences and edit links are
preserved, and existing participants receive no additional email.

Imported participants start with blank likes/dislikes and no categories. Each
new participant receives a registration email with their private edit link so
they can add preferences. Imports run in batches of five; keep the page open
until completion. An email failure does not undo registration: the results show
a private edit link to copy, and **Generate new edit link & email** can retry.
After an interrupted request, reload the dashboard before retrying; already
registered participants will be skipped. Import requires open registration,
an unexpired deadline, and no generated draft or confirmed draw. No additional
database migration is needed for importing participants.

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
