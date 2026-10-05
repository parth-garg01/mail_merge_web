# Smart Mail Merger (web)

Personalised Gmail campaigns from a spreadsheet, running on a server instead of your laptop.

Connect a Google Sheet, write a template with `{{Column}}` placeholders, pick a sending window, and start. The server sends the emails on schedule from your own Gmail account. With auto-sync on, it keeps reading the sheet and emails every new row that appears, so you can close the browser and switch your laptop off.

## How it works

- **Server** (`server/`): Express app that holds the queue, the scheduler and the Google connection. All state is JSON files in `DATA_DIR`.
- **Client** (`client/`): React app, built into `server/public` and served by the same server.
- **Sheet sync** (`server/sheetSync.js`): every 5 minutes, each running campaign with auto-sync re-reads its sheet. Addresses it has not seen are queued and scheduled behind anything already waiting. A person is never emailed twice in one campaign, and rows with a blank or half-typed address are picked up once they are complete.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev        # client on http://localhost:3000, API on http://localhost:5000
```

Or as one process, the way it runs when hosted:

```bash
npm run build
npm start          # http://localhost:5000
```

Tests: `npm test`

## Google setup (once)

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Gmail API** and the **Google Sheets API**.
2. Configure the OAuth consent screen and add your own Google account as a test user.
3. Create an **OAuth client ID** of type *Web application*. Add the redirect URI shown on the app's Settings page (`<your app address>/oauth2callback`).
4. Put the client ID and secret into the Settings page (or the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` variables), then press **Connect Gmail**.

If you connected Gmail before the Sheets feature existed, disconnect and connect again so Google grants read access to your sheets.

While the consent screen is in *Testing* mode, Google expires the sign-in after 7 days. Publish the consent screen (*In production*) to keep the server connected long term.

## Host it so it runs without your laptop

The app needs a host that stays awake and keeps a disk. Free tiers that sleep when idle will pause your sends.

### Render

1. Push this repo to GitHub.
2. In Render choose **New > Blueprint** and select the repo. `render.yaml` creates the service and a 1 GB disk at `/data`.
3. Fill in `APP_PASSWORD` (8+ characters), `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and change `TZ` if you are not in India.
4. Open the app, unlock it with the password, copy the redirect URI from Settings into your Google OAuth client, and connect Gmail.

### Any Docker host (VPS, Railway, Fly.io)

```bash
docker build -t mail-merger .
docker run -d --restart unless-stopped -p 5000:5000 -v mailmerger-data:/data \
  -e APP_PASSWORD=choose-a-long-one \
  -e PUBLIC_URL=https://mail.example.com \
  -e TZ=Asia/Kolkata \
  mail-merger
```

Serve it over HTTPS (the platform's proxy, or Caddy/nginx in front). Google only accepts `http://` redirect URIs for localhost.

## Configuration

Every variable is described in `.env.example`. The ones that matter on a host:

| Variable | Purpose |
| --- | --- |
| `APP_PASSWORD` | Seeds the app password. Required in production. |
| `DATA_DIR` | Persistent folder for campaigns, queues, logs, attachments and the Google token. |
| `PUBLIC_URL` | Public address, used for the Google redirect URI. |
| `TZ` | Timezone for sending windows and start times. |
| `SHEET_SYNC_MINUTES` | How often linked sheets are checked. Default 5. |

## Good to know

- Gmail limits sending to roughly 500 emails a day on a personal account and 2,000 on Workspace.
- The app is single-user and single-instance: one password, one Google account, one server process.
- After a restart the app asks for the password again; running campaigns resume by themselves.
