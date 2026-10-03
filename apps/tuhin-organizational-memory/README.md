# DecisionTrace — Organizational Memory & Decision Intelligence

DecisionTrace is my Track 4 workflow for the WhipScribe Buildathon.

It starts from one specific user: a product or engineering team lead who runs recurring meetings and loses important decision context once the meeting ends.

The product question is not only **"what was said?"**. It is:

- What did we decide?
- Why did we decide it?
- Which assumptions supported the decision?
- Who disagreed?
- What did someone promise to do?
- Did later evidence show completion?
- Did a later meeting change the decision?
- What source moment supports each claim?

## What changed in this production-ready pass

The first prototype waited for the entire WhipScribe job inside one HTTP request. That made long recordings vulnerable to browser/proxy timeouts and gave the UI very little visibility.

This pass moves the transcription path behind a persisted workflow record:

```text
Browser
  ↓ 202 Accepted + workflow ID
DecisionTrace workflow runner
  ↓
WhipScribe POST /transcribe or POST /transcribe/url
  ↓
Poll GET /jobs/{job_id}
  ↓
GET /result?format=json
  ↓
Extract evidence
  ↓
Update organizational memory
```

The application also adds:

- server-side timeout and retry handling for transient WhipScribe failures;
- `Retry-After` and exponential-backoff support;
- idempotency-key propagation;
- file validation and disk-backed temporary uploads instead of a multi-GB in-memory upload buffer;
- atomic persistence for the local memory store;
- request IDs and structured JSON logs;
- basic security headers and API rate limiting;
- provider account / retention visibility using `GET /api/v1/me`;
- recent WhipScribe job inspection using `GET /api/v1/jobs`;
- public URL ingestion using `POST /api/v1/transcribe/url`;
- short-lived audio playback through a server-side refresh endpoint;
- clip discovery using WhipScribe's documented preprocess/candidate endpoints;
- workflow recovery that marks interrupted in-process jobs explicitly instead of silently pretending they completed;
- expanded tests for extraction, drift, promises, storage, and upstream retry behavior.

## WhipScribe API integration

The implementation is intentionally limited to the public `/api/v1/*` surface described in the current WhipScribe API documentation. The current docs say that paths under `/api/v1/*` are the public, versioned integration surface and that response objects are additive within the same version.

The live client currently uses these documented integration points:

| DecisionTrace feature | WhipScribe endpoint |
|---|---|
| File transcription | `POST /api/v1/transcribe` |
| URL transcription | `POST /api/v1/transcribe/url` |
| Polling | `GET /api/v1/jobs/{job_id}` |
| Transcript evidence | `GET /api/v1/jobs/{job_id}/result?format=json` |
| Account / retention | `GET /api/v1/me` |
| Recent provider jobs | `GET /api/v1/jobs?limit=...` |
| Playback | `GET /api/v1/jobs/{job_id}/audio/url` |
| Clip index | `POST /api/v1/jobs/{job_id}/clips/preprocess` |
| Clip candidates | `GET /api/v1/jobs/{job_id}/clips/candidates?...` |
| Clip rendering | `POST /api/v1/jobs/{job_id}/clips` |
| Clip status | `GET /api/v1/clips/{clip_id}` |
| Optional insights | `GET /api/v1/jobs/{job_id}/insights` |

WhipScribe documents multipart file uploads, a maximum of 10 hours per file, diarization, word timestamps, the `source` field, asynchronous job processing, `speech_detected`, transcript JSON, short-lived playback URLs, and idempotency keys. It also documents `429` and `502` retryable failure modes and the `transcript_locked` / `NO_CREDITS` cases that clients should surface rather than hide.

### Important API boundaries

The current docs describe Google Drive connector support as early access and account-scoped. The connector also requires OAuth-specific account setup, so this prototype does **not** pretend to implement Drive OAuth itself.

The current docs also describe clip rendering as limited to uploaded or recorded jobs and bounded to a 3–180 second source range. DecisionTrace therefore exposes clip discovery for live jobs but keeps URL-based jobs transcript-first.

The API documentation is currently marked **Preview**, so the integration layer is isolated in `server/whipscribe.js` to keep future API changes localized.

## Demo Mode vs Live Mode

### Demo Mode

`DEMO_MODE=true`

The application seeds two deterministic meetings showing:

```text
MongoDB launch decision
        ↓ benchmark evidence
PostgreSQL launch decision
```

and:

```text
Sarah promises benchmark results
        ↓ later meeting evidence
Promise marked completed
```

No WhipScribe API key is required for the demo.

### Live Mode

Set:

```env
DEMO_MODE=false
WHIPSCRIBE_API_KEY=your_key
```

The server then sends recordings to the live WhipScribe API. The API key is never sent to browser JavaScript.

## Local setup

Requirements: **Node.js 22.12+** and npm.

```bash
cd apps/tuhin-organizational-memory
cp .env.example .env
npm install
npm test
npm run check
npm start
```

Open:

```text
http://127.0.0.1:3000
```

For demo mode, keep `DEMO_MODE=true` and leave the API key blank.

## Environment

```env
PORT=3000
HOST=127.0.0.1
WHIPSCRIBE_BASE_URL=https://whipscribe.com/api/v1
WHIPSCRIBE_API_KEY=
WHIPSCRIBE_USER_EMAIL=tuhinsarkar581@gmail.com
DEMO_MODE=true
DATA_DIR=./data
UPLOAD_DIR=./uploads
POLL_INTERVAL_MS=3000
POLL_TIMEOUT_MS=900000
WHIPSCRIBE_TIMEOUT_MS=30000
WHIPSCRIBE_MAX_RETRIES=3
MAX_UPLOAD_BYTES=536870912
RATE_LIMIT_PER_MINUTE=30
TRUST_PROXY=false
LOG_LEVEL=info
```

Never commit `.env` or `uploads/`.

## API routes exposed by DecisionTrace

| Route | Purpose |
|---|---|
| `GET /api/config` | UI-safe runtime configuration |
| `GET /api/health` | liveness check |
| `GET /api/health/deep` | optional WhipScribe reachability check |
| `GET /api/dashboard` | memory + metrics |
| `GET /api/workflows` | recent workflow state |
| `GET /api/workflows/:id` | one workflow state |
| `GET /api/provider/me` | provider account snapshot |
| `GET /api/provider/jobs` | recent WhipScribe jobs |
| `GET /api/meeting/:id` | meeting, decisions, promises and questions |
| `GET /api/meeting/:id/audio-url` | refreshes a short-lived provider playback URL |
| `GET /api/meeting/:id/moments` | clip candidate discovery |
| `POST /api/transcribe` | queue a local file transcription |
| `POST /api/transcribe-url` | queue a remote URL transcription |
| `POST /api/search` | local transcript/evidence search |
| `POST /api/meeting/:id/clip` | render a provider clip |
| `GET /api/clip/:clipId` | poll provider clip status |
| `POST /api/demo/reset` | reset deterministic demo data |

## Production-like design choices

### 1. The request is no longer the job

Long-running transcription belongs to a workflow record, not a browser request. This removes a major source of timeouts.

The current runner is intentionally **in-process**. If the server restarts, queued/processing jobs are marked `WORKFLOW_INTERRUPTED` rather than being falsely presented as successful.

A true multi-instance production deployment should replace the runner with a durable queue such as Redis/BullMQ or a managed queue and make the memory store a real database.

### 2. Temporary files are not loaded into a giant memory buffer

Multer writes the upload to `uploads/`. Node's `fs.openAsBlob()` is used to give the WhipScribe client a Blob backed by that file. The temp file is deleted after the provider submission completes or fails.

### 3. The provider client is resilient

The HTTP client adds:

- bounded request timeouts;
- retry handling for `429`, `500`, `502`, `503`, `504`;
- `Retry-After` support;
- exponential backoff;
- stable error objects with HTTP status + provider code;
- polling timeout protection.

### 4. Evidence is still the invariant

Heuristics can be wrong. That is why every extracted decision or promise retains the meeting ID and timestamp reference. The UI can open the source meeting rather than asking the user to trust a detached summary.

### 5. Provider playback URLs are treated as ephemeral

WhipScribe says the audio URL is short-lived and recommends refetching when playback expires. DecisionTrace therefore refreshes the URL on evidence-open instead of treating it as permanent storage.

## Known limitations

This is production-like application code, not a claim that a single-process prototype is production infrastructure.

Still intentionally missing:

- external authentication / multi-user isolation;
- durable background queue and worker fleet;
- PostgreSQL or another production database;
- object storage for uploaded source files;
- signed webhooks;
- Google Drive OAuth / connector activation;
- external writes to Linear, Jira, Notion or Slack;
- full LLM reasoning layer;
- collaborative editing / audit trails;
- metrics and tracing backend such as OpenTelemetry + Prometheus/Grafana.

## Manual smoke test

### Demo

```bash
npm test
npm run check
npm start
```

Then verify:

```text
GET /api/health
GET /api/dashboard
POST /api/search            {"q":"PostgreSQL"}
GET /api/meeting/demo-meeting-002
GET /api/meeting/demo-meeting-001/moments?kind=question
POST /api/demo/reset
```

### Live

Only claim a live API run after a real request succeeds with a valid WhipScribe key and usable account balance.

Suggested sequence:

```text
1. switch DEMO_MODE=false
2. configure WHIPSCRIBE_API_KEY
3. start the app
4. upload a permitted recording
5. observe the returned workflow ID
6. watch /api/workflows/:id progress
7. open the resulting meeting
8. refresh playback
9. run clip candidate discovery
10. render a 3–180 second clip
```

## Project structure

```text
apps/tuhin-organizational-memory/
├── README.md
├── DEPLOYMENT.md
├── API-INTEGRATION.md
├── OPERATIONS.md
├── CHANGELOG.md
├── .env.example
├── .gitignore
├── package.json
├── server/
│   ├── config.js
│   ├── logger.js
│   ├── rate-limit.js
│   ├── validation.js
│   ├── storage.js
│   ├── whipscribe.js
│   ├── workflow-runner.js
│   ├── extractor.js
│   ├── drift.js
│   ├── promise-ledger.js
│   ├── pipeline.js
│   ├── demo-data.js
│   └── index.js
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── test/
    ├── pipeline.test.js
    ├── extractor.test.js
    ├── drift.test.js
    ├── promise.test.js
    ├── storage.test.js
    └── whipscribe.test.js
```

## Track 4 product direction

The product remains intentionally narrow:

```text
meetings → evidence → decisions → promises → drift → outcomes
```

The next meaningful expansion is not another dashboard. It is connecting these evidence-backed objects to the systems where work actually changes: project trackers, documents and team communication.

## API references

- WhipScribe API docs: https://whipscribe.com/docs
- WhipScribe APIs: https://app.whipscribe.com/apis
- Buildathon repository: https://github.com/neugence/whipscribe-buildathon
