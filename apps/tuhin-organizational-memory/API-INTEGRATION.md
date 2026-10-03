# API Integration Notes

This file is the implementation contract between DecisionTrace and WhipScribe.

## Current upstream surface

DecisionTrace targets `https://whipscribe.com/api/v1`.

The current WhipScribe documentation describes `/api/v1/*` as the public versioned integration surface, with `X-API-Key` on every request in the documented key-based flow. It also documents optional user identity headers, asynchronous jobs, transcript JSON, playback URLs, idempotency keys, and stable error codes.

## Submission

### Local file

`POST /api/v1/transcribe`

DecisionTrace sends:

- `file`
- optional `language`
- `diarize=true`
- `word_timestamps=true`
- `source=api`
- `Idempotency-Key`

WhipScribe documents 202 responses with `job_id` and asynchronous processing.

### URL

`POST /api/v1/transcribe/url`

DecisionTrace sends:

- `url`
- optional `language`
- `diarize=true`
- `word_timestamps=true`
- `source=url`
- `Idempotency-Key`

The current docs say only Creative Commons-licensed YouTube URLs are currently accepted for this endpoint, so the UI describes this as a public URL flow rather than claiming arbitrary URL support.

## Job lifecycle

DecisionTrace polls:

```text
GET /api/v1/jobs/{job_id}
```

The docs recommend a three-second cadence while a job is queued or processing. The client adds a hard polling timeout so an upstream job cannot leave an in-process workflow hanging forever.

The client branches on:

- `status=failed`
- `locked=true`
- `speech_detected=false`
- `status=done`

WhipScribe documents `speech_detected=false` as a successful VAD outcome, not an API failure.

## Transcript

```text
GET /api/v1/jobs/{job_id}/result?format=json
```

DecisionTrace normalizes the rich JSON payload into stable local segments while preserving:

- start / end timestamps;
- speaker labels;
- transcript text;
- word timestamps when present.

The transcript becomes the evidence layer for all subsequent extraction.

## Account state

```text
GET /api/v1/me
```

DecisionTrace surfaces the documented `tier`, `retention_days`, `email`, and `signed_in` values. The application does not hardcode the retention window.

## Provider jobs

```text
GET /api/v1/jobs?limit=...
```

This is used as an operator-facing visibility feature, not as the application's source of truth. DecisionTrace's local workflow record tracks the application-side lifecycle. WhipScribe remains the source of truth for provider-side job state.

## Playback

```text
GET /api/v1/jobs/{job_id}/audio/url
```

The returned URL is short-lived. DecisionTrace deliberately does not persist it as durable data. The app obtains a fresh URL when the user opens a meeting's evidence panel. WhipScribe explicitly says to refetch the URL when the audio element errors or the URL expires.

## Clip discovery

The live clip workflow is:

```text
POST /api/v1/jobs/{job_id}/clips/preprocess
       ↓
GET /api/v1/jobs/{job_id}/clips/candidates?kind=hook&limit=...
       ↓
POST /api/v1/jobs/{job_id}/clips
       ↓
GET /api/v1/clips/{clip_id}
```

The current docs say preprocess can take roughly 10–60 seconds and candidate endpoints can return `409 FEATURES_NOT_READY` until the index is ready. DecisionTrace therefore treats 409 as a retryable UI state instead of reporting it as a broken integration.

The docs also constrain clip rendering to uploaded/recorded jobs and 3–180 second windows.

## Idempotency

DecisionTrace generates a workflow-scoped idempotency key when the browser does not provide one.

The provider docs say the key is accepted by submit endpoints, scoped per API key, and makes a retry replay the original submission instead of creating a duplicate job.

The application also validates browser-supplied keys against the provider's documented character constraints before forwarding them.

## Retries

The HTTP client retries:

- 429
- 500
- 502
- 503
- 504

It honors `Retry-After` when provided and otherwise uses bounded exponential backoff.

It does not automatically retry semantic failures such as:

- 400
- 401
- 402
- 403
- 404
- 410
- 413
- 415
- 422

This is deliberate: replaying an auth, billing, validation or ownership error will not make it succeed.

## Error handling

The upstream API documents stable error `code` strings alongside HTTP statuses. DecisionTrace keeps the provider code in server-side workflow state and converts it into user-readable messages without exposing API keys or authentication headers.

## Future surface: Google Drive

The current WhipScribe docs describe Drive connectors as early access and account-scoped, including OAuth start, connector listing, batch transcribe, and batch status. DecisionTrace does not implement a fake OAuth flow. The appropriate next production step is a real account-bound OAuth integration once connector access is available to the intended user/account.
