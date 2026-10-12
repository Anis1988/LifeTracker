# LifeTracker

Everything you pay regularly in one place: subscriptions, mortgage, insurance, utilities, phone, loans, memberships.
As automatic as possible: reads your bank (read-only), your Gmail receipts and the documents you upload, finds
recurring bills, warns you about price rises, trials ending and renewals, and fills a Google Calendar.
**Home**: this month's spending against a usual month, an "Ask LifeTracker" bar, a timeline of everything coming up.
**Money**: bills, spending by category with budgets, returns & warranties from order emails. **Me**: important dates & car care, where your name shows up online, people-search sites, data breaches, mailing lists (unsubscribe), documents
that expire, credit freeze, and a weekly "My week" summary.

- **Database, sign-in, files, server functions, daily run:** Supabase
- **Website:** GitHub Pages (Supabase doesn't host websites), built and deployed by `.github/workflows/deploy.yml` on every push to `main`
- **AI:** free ones first (Gemini, Groq…), Claude (paid) only when they can't; each with a daily limit (Settings → AI)

## Setup (one time)

### 1. Supabase project
1. Create a project at [supabase.com](https://supabase.com) (free plan is fine).
2. **Authentication → URL configuration**: *Site URL* = your website address (step 3), e.g. `https://anis1988.github.io/LifeTracker/`.
   Optional: **Authentication → Providers → Google** to show "Continue with Google" on the sign-in page.
3. **Authentication → Sign In / Providers**: after you have signed up yourself, you can turn off "Allow new users to sign up" (just for you for now).

### 2. GitHub repository settings
- **Settings → Pages → Source: GitHub Actions.**
- **Settings → Secrets and variables → Actions**
  - Secrets: `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access tokens), `SUPABASE_DB_PASSWORD` (the database password)
  - Variables (or Secrets, either works): `SUPABASE_PROJECT_REF` (the id in your project URL), `VITE_SUPABASE_URL` (`https://<ref>.supabase.co`), `VITE_SUPABASE_ANON_KEY` (Project Settings → API → anon / publishable key: safe to be public)
- Push to `main` (or Actions → Deploy → Run workflow): the database tables, the server functions and the website are deployed.

### 3. Server secrets (Supabase → Edge Functions → Secrets)
| Secret | What |
|---|---|
| `LT_SECRET_KEY` | long random text (encrypts the bank link and Google sign-in) |
| `CRON_SECRET` | another random text (protects the morning run) |
| `SITE_URL` | the website address |
| `LT_ALLOWED_EMAILS` | your email: only listed people can use the bank, Google and AI parts |
| `GEMINI_API_KEY` | free, aistudio.google.com |
| `GROQ_API_KEY` | optional, free, console.groq.com |
| `OPENROUTER_API_KEY` | optional, free models |
| `ANTHROPIC_API_KEY` | optional, Claude: only used when the free ones can't |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar / Gmail (step 4) |
| `RESEND_API_KEY`, `RESEND_FROM` | optional, morning email (resend.com, free) |

### 4. Google (Calendar and Gmail)
Google Cloud console → new project → enable **Google Calendar API** and **Gmail API** → OAuth consent screen (External, add yourself as a test user) → Credentials → OAuth client **Web application** with redirect URI
`https://<ref>.supabase.co/functions/v1/google-callback`. Put the client id/secret in the Supabase secrets. Publish the consent screen so the sign-in doesn't expire every 7 days.

### 5. Morning run
Supabase → **Vault** → add two secrets: `lt_project_url` = `https://<ref>.supabase.co` and `lt_cron_secret` = the same text as `CRON_SECRET`.
The database runs it every day at 11:15 UTC (see `supabase/migrations/…_storage_cron.sql`).

### 6. Mailing lists (optional)
Google Cloud → Google Auth Platform → **Data Access** → add the scope `https://www.googleapis.com/auth/gmail.modify`; then in the app, Settings → Mailing lists → Allow “Manage mailing lists” (to unsubscribe by email, block spam senders and tidy the inbox; nothing is ever deleted). One-tap unsubscribe works without it.

### 7. Bank
Free: turn on **purchase alerts by email** in each bank's app (Settings → Bank & cards shows the steps for Bank of America, SoFi, Capital One) and connect Gmail; the alert emails are read every morning with free patterns. Paid alternative: SimpleFIN (direct bank link).

## Develop
```
cp .env.example .env.local   # your project URL + anon key
npm install && npm run dev
npm run typecheck
npx deno check supabase/functions/api/index.ts   # server functions
```
