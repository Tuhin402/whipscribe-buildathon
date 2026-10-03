# Operations Runbook

## Daily development checks

```bash
npm test
npm run check
git diff --check
```

## Start / stop

```bash
npm start
```

Stop with `Ctrl+C`. The server handles `SIGINT` and `SIGTERM` and closes the HTTP listener before exiting.

## Important environment variables

- `DEMO_MODE`: seeded deterministic mode vs live provider mode.
- `WHIPSCRIBE_API_KEY`: server-only API credential.
- `WHIPSCRIBE_USER_EMAIL`: optional account hint for server-to-server requests.
- `POLL_INTERVAL_MS`: provider polling cadence; default 3000ms.
- `POLL_TIMEOUT_MS`: maximum provider polling window.
- `WHIPSCRIBE_TIMEOUT_MS`: HTTP timeout per provider request.
- `WHIPSCRIBE_MAX_RETRIES`: transient failure retry count.
- `MAX_UPLOAD_BYTES`: local upload safety ceiling.
- `RATE_LIMIT_PER_MINUTE`: in-memory API request limit.

## Workflow state meanings

| State | Meaning |
|---|---|
| `queued` | accepted by DecisionTrace, not yet finished |
| `processing` | provider job is being submitted/polled |
| `done` | transcript processed into memory |
| `no_speech` | provider completed but detected no transcribable speech |
| `locked` | provider returned a paywalled/locked transcript state |
| `failed` | provider, validation, network, or server workflow failure |

## If a workflow is stuck

1. Open `/api/workflows/<workflow-id>`.
2. Check `message`, `providerJobId`, and `error.code`.
3. If the provider job exists, compare it with `GET /api/provider/jobs` in live mode.
4. If the process restarted, the workflow should show `WORKFLOW_INTERRUPTED` rather than remain silently processing.

## Common provider errors

The current WhipScribe API docs define these useful cases:

- `NO_CREDITS` → account needs usable credit.
- `transcript_locked` → finished transcript is restricted for the current account.
- `AUDIO_EXPIRED` → source audio retention window has elapsed, but transcript may remain available.
- `BAD_MIME` / `FILE_TOO_LARGE` → local or provider upload validation issue.
- `FEATURES_NOT_READY` → clip candidate index is still preparing.
- `429 RATE_LIMITED` / `429 QUOTA_EXCEEDED` → retry or resolve account limits.
- `502 BACKEND_ERROR` / `502 BACKEND_UNREACHABLE` → safe transient failure class.

WhipScribe's docs also state that `speech_detected=false` is a successful no-speech result, not a transcription error.

## Security notes

Never put the following into `public/`:

- `WHIPSCRIBE_API_KEY`
- OAuth tokens
- claim tokens
- provider Authorization headers

The browser only receives safe application state and short-lived playback URLs after an authenticated server-side provider request.

## Demo reset

```http
POST /api/demo/reset
```

Only enabled when `DEMO_MODE=true`.

## Data recovery

The local store writes `memory.json` through a temporary file followed by rename. This keeps a partially-written JSON document from becoming the active state during a normal write.

For real production data, use a transactional database instead of extending this JSON store indefinitely.
