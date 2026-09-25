# Job Application Tracker

A job application tracker that runs entirely in your browser. Track every application by stage, and optionally connect **your own Gmail** so the app can suggest updates from confirmation, assessment, interview and rejection emails. You approve every change.

- **No server, no sign-up.** Your tracker is stored in your browser (IndexedDB). Emails go straight from Google to the page.
- **Read-only Gmail access.** The app can't send, change or delete anything in your mailbox.
- **Your own Google app.** Each person uses their own free Google Cloud client ID, so there's no shared app that needs Google's verification.

## Features

- Add, edit and delete applications; one-click stage changes (Applied → OA to do → OA done → Interview → Offer / Rejected)
- Filter by stage, search, and sort; deadlines for assessments shown up front
- **Scan Gmail**: finds recruiting emails since your last scan, groups them per job, and queues suggestions such as "Rejection email on 16 Sep" or "Assessment invite, due about 28 Sep"
- Review panel with Accept, Dismiss, "Accept all confident", and a link to open each source email
- **Job Preferences** decide what gets suggested: role categories (software, AI/ML, data, cloud, security, tech consulting, graduate tech) plus your own keywords, excluded job types (stock taker, retail, warehouse… editable), employment types, optional preferred companies and locations. Each suggestion is labelled "Strong match" or "Possible match"; weak matches are never shown
- Rules never move a rejected application back to an earlier stage, and skip job alerts and newsletters
- Light, dark or system theme, remembered between visits
- Backup and restore as JSON, export to CSV
- Works on phones; follows your light or dark theme

## Quick start

You need [Node.js 18+](https://nodejs.org/).

```bash
git clone https://github.com/<your-username>/gmail-job-tracker.git
cd gmail-job-tracker
npm install
npm run dev
```

Open http://localhost:5173. You can use the tracker straight away. To turn on Gmail scanning, follow the next section.

## Connect your Gmail (about 10 minutes, once)

Google requires every app that reads email to have its own OAuth client. You create a personal one for free:

1. Open [Google Cloud Console](https://console.cloud.google.com/projectcreate) and **create a project** (any name, e.g. "Job tracker").
2. Go to **APIs & Services → Library**, search for **Gmail API**, and click **Enable**.
3. Go to **Google Auth Platform** (called **OAuth consent screen** in older menus) and click **Get started**. Enter an app name and your email, choose **External**, and finish.
4. Under **Audience → Test users**, add your own Gmail address.
5. Under **Clients** (or **Credentials → Create credentials → OAuth client ID**), choose **Web application**. Under **Authorised JavaScript origins**, add the address you open the app from:
   - `http://localhost:5173` when running `npm run dev`
   - `https://<your-username>.github.io` if you deploy to GitHub Pages (origin only, no path)

   Leave **Authorised redirect URIs** empty and click **Create**.
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
7. In the app, open **Settings**, paste the client ID, and click **Save**. Then click **Connect Gmail**.

When you connect, Google shows **"Google hasn't verified this app"**. That's expected: it's your own private app. Click **Continue**, and allow the "View your email messages and settings" permission.

The in-app Settings screen repeats these steps and shows the exact origin to copy. More detail and troubleshooting: [docs/google-setup.md](docs/google-setup.md).

### Optional: build your client ID in

Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID`. The app then skips the paste step. Only do this for your own copy; anyone using your build would be signing in to *your* Google app.

## Deploy your own copy to GitHub Pages

1. Push the repo to GitHub.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds and publishes the site at `https://<your-username>.github.io/<repo-name>/`.
4. Add `https://<your-username>.github.io` as an authorised JavaScript origin on your Google client.

Anyone can use a hosted copy with **their own** client ID: they add the site's origin to their own Google client and paste their client ID in Settings. Their data still stays in their browser.

## How the scanning works

1. **Search**: Gmail is queried for recruiting wording ("thank you for applying", "online assessment", "unfortunately", interview invites and so on) since the last scan, skipping promotions and social tabs.
2. **Read**: subject, sender and preview are fetched for each thread. When a preview is too vague (for example "Update on your application"), the full message is read.
3. **Classify**: a transparent rules engine in [`src/gmail/classify.ts`](src/gmail/classify.ts) decides the outcome, then works out the company by cross-checking names in the email against the sender's domain, and finds the role and any deadline ("you have 7 days", "by 30 September").
4. **Fold**: emails about the same job are merged, keeping the latest stage. Only fields that actually change become a suggestion.
5. **Review**: nothing touches your tracker until you accept.

Rules are simpler than an AI model, so each suggestion links to its source email and uncertain ones are flagged "check this one". Improvements to the patterns are very welcome; add a test in `src/gmail/classify.test.ts` with each change.

## Gmail quota

Gmail limits each user to about 250 quota units per second. A scan makes 1 search call plus 1 small metadata call per email not seen before (5 units each), capped at 25/50/100 emails (Settings → Gmail connection), and reads at most 15 full emails when the preview isn't enough. Requests run 2 at a time with a minimum gap between them, and rate-limit responses are retried after 1, 2 and 4 seconds before the scan stops with a clear message. Every email fetched is cached in the browser, so an interrupted scan resumes without re-downloading, and clicking Scan again within 2 minutes shows the last result without calling Gmail.

To see scan progress in the browser console, run `localStorage.setItem("job-tracker-debug", "1")`. Only counts are logged, never email content or tokens.

## Privacy and security

- Access token is kept in memory only and expires after about an hour. Click **Connect Gmail** to renew it. No refresh token is stored.
- The only permission requested is `gmail.readonly`.
- All data lives in your browser's IndexedDB under this site's address. Clearing site data deletes it, so use **Backup** regularly.
- **Settings → Disconnect** revokes the token. You can also remove access any time at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Tech stack

| Part | Choice |
|---|---|
| UI | React 18 + TypeScript, built with Vite |
| Google sign-in | Google Identity Services (token model) |
| Email | Gmail REST API (`threads.list`, `threads.get`) |
| Classification | Rules engine in TypeScript, unit-tested with Vitest |
| Storage | IndexedDB via Dexie.js |
| Hosting | Any static host; GitHub Pages workflow included |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app at http://localhost:5173 |
| `npm test` | Run the rules-engine tests |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build locally |

## Project layout

```
src/
  App.tsx                 main screen: tracker, filters, scan button
  components/             dialogs and the suggestions panel
  gmail/auth.ts           Google sign-in with the user's client ID
  gmail/api.ts            read-only Gmail REST calls
  gmail/classify.ts       rules engine (outcome, company, role, deadline)
  gmail/scan.ts           search → classify → filter → suggestions; accept/dismiss
  gmail/errors.ts         quota vs disabled-API vs sign-in error handling
  jobs/preferences.ts     role categories, exclusions and defaults
  jobs/evaluate.ts        job title/type/location extraction and relevance score
  lib/theme.ts            light / dark / system theme
  db.ts                   IndexedDB tables
docs/google-setup.md      detailed Google Cloud walkthrough
```

## Limitations

- Scanning runs while the page is open; there's no background scan.
- Testing-mode Google apps allow up to 100 test users, which is plenty for personal use.
- Recruiting systems word things differently, so some emails will be missed or misread. Everything is reviewable before it's applied.

## License

MIT. See [LICENSE](LICENSE).
