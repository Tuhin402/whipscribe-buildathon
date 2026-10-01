# Deployment

## Recommended topology

```text
Browser
  ↓
DecisionTrace Node server
  ↓
WhipScribe API
```

Do not put `WHIPSCRIBE_API_KEY` in browser JavaScript.

## Render / Railway / Fly / any Node host

Set the start command to:

```text
npm start
```

Set:

```env
PORT=<platform-provided-or-default>
DEMO_MODE=true
WHIPSCRIBE_BASE_URL=https://whipscribe.com/api/v1
```

For the live API:

```env
DEMO_MODE=false
WHIPSCRIBE_API_KEY=<secret>
```

Keep the key in the host's secret/environment-variable system.

## GitHub

GitHub hosts the source of truth:

```text
apps/tuhin-organizational-memory/
```

Use the hosted Node app for the live demo link in the Track 4 PR.

GitHub Pages is suitable for static documentation, but not for a deployment
that needs a private server-side API key.

## Before public submission

Run:

```bash
npm install
npm start
```

Then verify:

```text
GET /api/health
GET /api/dashboard
POST /api/demo/reset
POST /api/search
```

In Demo Mode the dashboard must work without a WhipScribe API key.

A live API run should only be claimed after a real recording has been sent with
a valid key and the returned transcript has been observed.
