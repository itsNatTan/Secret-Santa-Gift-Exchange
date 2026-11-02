# NSCC Gift Exchange

A small Next.js app for a private Secret Santa-style exchange. Deployable to Vercel.

## Features
- Public sign-up; no `@nscc.sg` restriction
- Optional gift categories, likes/dislikes and up to five wishlist URLs
- Private emailed edit link; participants can edit until the deadline
- Password-protected organiser dashboard
- Random one-to-one draw with no self-assignments and no reciprocal pairs
- Individual assignment emails containing the recipient's wishlist

## 1. Create the Supabase database
1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. In Project Settings → API, copy the Project URL and `service_role` key. Keep the service-role key secret.

## 2. Configure email
1. Create a Resend account and verify a domain you control.
2. Create an API key.
3. Set `EMAIL_FROM` to an address on the verified domain, e.g. `NSCC Gift Exchange <gifts@yourdomain.com>`.

Note: Vercel hosting does not automatically provide email sending. Resend is used for registration/edit links and assignment notifications.

## 3. Run locally
```bash
npm install
cp .env.example .env.local
# Fill in the environment variables
npm run dev
```
Open http://localhost:3000. Admin: http://localhost:3000/admin.

## 4. Deploy to Vercel
1. Push this project to a private GitHub repository.
2. Import the repository in Vercel.
3. Add every variable from `.env.example` in Vercel → Project → Settings → Environment Variables.
4. Set `NEXT_PUBLIC_SITE_URL` to the deployed URL, e.g. `https://giftexchange.nscc.sg`.
5. Deploy. Add the custom domain in Vercel and configure its DNS as instructed by Vercel.

## 5. Organiser workflow
1. Visit `/admin` and log in with `ADMIN_PASSWORD`.
2. Set gift budget, exchange date and registration deadline. Save.
3. Share the public homepage URL.
4. Participants sign up. They receive a private edit link by email and can edit until the deadline.
5. Close registration, then click **Generate & email assignments** once.
6. The app requires at least 3 participants. It prevents self-assignments and reciprocal two-person swaps.

## Important operational notes
- The draw is deliberately one-time. The dashboard disables the draw after it is generated.
- If an email fails after the draw, do not redraw. Check Resend logs and manually resend the affected assignment.
- The app does not expose the participant list or assignments publicly. The admin dashboard shows participant names, emails and categories.
- Keep Supabase service-role and admin secrets only in Vercel server environment variables. Never prefix them with `NEXT_PUBLIC_`.
- Use a strong, unique `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`.
- Before using real staff data, have the deployment and data-handling approach reviewed against NSCC's internal IT/security and privacy requirements.
- This starter is an MVP; add rate limiting, CAPTCHA, audit logging and stronger admin identity management before using it for a large or sensitive event.
