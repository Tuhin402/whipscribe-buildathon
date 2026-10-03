# Deployment

## Recommended topology

```text
Browser
  ↓ HTTPS
DecisionTrace Node server
  ├── local temporary upload disk
  └── WhipScribe API
```

Do not put `WHIPSCRIBE_API_KEY` in browser JavaScript.

## Local production-like run

```bash
cp .env.example .env
npm ci
npm test
npm run check
npm start
```

Use `HOST=0.0.0.0` when the process must listen on a container/platform interface.

## Render / Railway / Fly / any Node host

Set the start command to:

```text
npm start
```

Set environment variables in the platform secret/config UI:

```env
HOST=0.0.0.0
PORT=<platform-provided-port>
DEMO_MODE=true
WHIPSCRIBE_BASE_URL=https://whipscribe.com/api/v1
```

For live mode:

```env
DEMO_MODE=false
WHIPSCRIBE_API_KEY=<secret>
WHIPSCRIBE_USER_EMAIL=<optional>
```

Use persistent storage for `DATA_DIR` only if you intentionally want local JSON persistence. For multi-instance production, replace the local MemoryStore with a managed database.

## Health checks

Liveness:

```text
GET /api/health
```

Deep provider check:

```text
GET /api/health/deep
```

The deep check calls `GET /api/v1/me` and should be used sparingly because it makes a real provider request. The current WhipScribe API docs document `/api/v1/me` as the authoritative account/retention view.

## Required production upgrades before multi-user deployment

This repository remains a prototype with production-minded failure handling. Before opening it to untrusted multi-user traffic, replace or add:

- external authentication and tenant isolation;
- a durable job queue and worker process;
- PostgreSQL or another managed database;
- object storage for user uploads;
- centralized rate limiting such as Redis;
- structured logs shipped to a log platform;
- metrics/tracing;
- secret rotation;
- automated backups;
- CSRF strategy appropriate to the authentication model;
- automated vulnerability scanning and dependency update policy.

## Upload handling

Uploaded files are written into `UPLOAD_DIR` and deleted after the WhipScribe submission path finishes. The app also enforces a configurable maximum upload size.

This is intentionally safer than the original memory-buffer implementation. For true production scale, move uploads to object storage and submit using a streaming or presigned upload path where appropriate. The current WhipScribe docs mention a presigned `/v1/uploads/init` flow for large files, but its detailed request schema is not part of the current public reference page used by this prototype, so it is not guessed or implemented here.

## Deployment checklist

```text
[ ] DEMO_MODE=false for live operation
[ ] WHIPSCRIBE_API_KEY stored as a server secret
[ ] HOST/PORT configured by platform
[ ] DATA_DIR uses persistent storage or is replaced by a DB
[ ] UPLOAD_DIR uses ephemeral storage or object storage
[ ] /api/health responds 200
[ ] /api/health/deep succeeds with the intended provider account
[ ] npm test passes
[ ] npm run check passes
[ ] real live transcription has been observed before claiming live API support
```
