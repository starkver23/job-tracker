# Setting up your Google client ID

This app reads Gmail through **your own** Google OAuth client. It's free, takes about ten minutes, and you only do it once.

## Why this is needed

Google only lets an app read email if that app has an OAuth client. A single shared client used by many strangers would need Google's verification and a paid yearly security assessment. When you create your own client and add yourself as a test user, it counts as your personal app, and none of that applies.

## Step by step

### 1. Create a project

Open [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate), give the project any name (for example `Job tracker`) and click **Create**. Make sure the new project is selected in the top bar.

### 2. Enable the Gmail API

Go to **APIs & Services → Library**, search for **Gmail API**, open it and click **Enable**.

### 3. Set up the consent screen

Go to **Google Auth Platform** (older consoles: **APIs & Services → OAuth consent screen**) and click **Get started**.

- **App name**: anything, e.g. `My job tracker`
- **User support email**: your email
- **Audience**: **External**
- **Contact information**: your email

Accept the policy and click **Create**.

### 4. Add yourself as a test user

In **Google Auth Platform → Audience**, under **Test users**, click **Add users** and enter the Gmail address you want to scan. Leave the app in **Testing**; you don't need to publish it.

### 5. (Optional) Declare the Gmail permission

In **Data access**, click **Add or remove scopes**, search for `gmail.readonly`, tick it and save. The app asks for this permission anyway, so this step only makes the consent screen tidier.

### 6. Create the OAuth client

Go to **Google Auth Platform → Clients** (older consoles: **APIs & Services → Credentials → Create credentials → OAuth client ID**).

- **Application type**: **Web application**
- **Name**: anything
- **Authorised JavaScript origins**: add every address you'll open the app from, with no trailing slash and no path:
  - `http://localhost:5173` for `npm run dev`
  - `http://localhost:4173` for `npm run preview`
  - `https://<your-username>.github.io` for GitHub Pages
- **Authorised redirect URIs**: leave empty

Click **Create** and copy the **Client ID**. It looks like `1234567890-abc123def456.apps.googleusercontent.com`. You don't need the client secret.

### 7. Paste it into the app

Open the app, click **Settings**, paste the client ID and click **Save**. Then click **Connect Gmail**.

## What you'll see when connecting

1. A Google sign-in popup. Choose the account you added as a test user.
2. **"Google hasn't verified this app"**. Click **Continue**. This is normal for personal apps.
3. A permission screen for **"View your email messages and settings"**. Tick it and click **Continue**.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Error 400: redirect_uri_mismatch` or `origin_mismatch` | The address in your browser isn't listed in **Authorised JavaScript origins**. Add it exactly (scheme, host and port) and wait a few minutes. |
| `Error 403: access_denied` | The Google account isn't a test user. Add it under **Audience → Test users**. |
| "Gmail refused the request… API has not been used" | Enable the Gmail API for the same project (step 2). |
| Popup opens and closes immediately | Allow popups for the site, and turn off extensions that block `accounts.google.com`. |
| Sign-in doesn't work when opening `index.html` directly | Google sign-in needs a web address. Use `npm run dev`, `npm run preview`, or a hosted copy. |
| Connected, but have to reconnect after an hour | Expected. Browser-only apps get short-lived tokens with no refresh token, so nothing long-lived is stored. |

## Removing access

In the app: **Settings → Disconnect**. Or at any time from your Google account: [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Deleting the Google Cloud project removes the client entirely.
