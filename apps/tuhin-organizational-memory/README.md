# DecisionTrace — Organizational Memory & Decision Intelligence

DecisionTrace is my Track 4 workflow for the WhipScribe Buildathon.

It starts from one specific user:

> A product or engineering team lead who runs recurring meetings and loses
> important decision context once the meeting ends.

The problem is not transcription alone.

After a meeting, the durable facts people need are:

- what was decided;
- why it was decided;
- what assumptions supported it;
- who disagreed;
- what someone promised to do;
- whether that promise was later completed;
- whether a later conversation changed the decision;
- what evidence caused the change.

DecisionTrace turns the recording into that evidence-backed organizational memory.

## The workflow

```text
Meeting recording
      ↓
WhipScribe transcription
      ↓
Speaker + timestamp evidence
      ↓
Decision / commitment extraction
      ↓
Persistent memory
      ↓
Decision drift
      ↓
Promise Ledger
```

The user's work is intentionally short:

1. upload a meeting;
2. let WhipScribe transcribe it;
3. review the resulting decisions and promises;
4. inspect later changes;
5. jump back to the source evidence.

## Why recordings are the way in

Meeting recordings are the original source of the decision context. Documents and
task trackers often contain the final answer but not the discussion that made the
answer trustworthy.

The recording preserves the sequence:

```text
proposal → disagreement → assumption → decision → commitment
```

That sequence is what DecisionTrace keeps.

## Core product concepts

### Decision Memory

A decision stores:

- the decision itself;
- meeting/job ID;
- speaker;
- timestamp range;
- reasoning;
- assumptions;
- disagreements;
- source evidence.

### Decision Drift

The same decision topic is compared across meetings.

Example:

```text
Sep 27
MongoDB for first launch
        ↓
Sep 29
PostgreSQL for first launch
```

DecisionTrace records that the later decision superseded the earlier one and
keeps the later evidence that caused the change.

### Promise Ledger

A commitment stores:

- owner;
- recipient;
- action;
- due date when stated;
- source timestamp;
- later completion evidence;
- current status.

The system distinguishes an open promise from a promise for which later
evidence was found.

## WhipScribe API integration

The implementation uses the documented API surface:

- `POST /api/v1/transcribe`
- `GET /api/v1/jobs/{job_id}`
- `GET /api/v1/jobs/{job_id}/result?format=json`
- `GET /api/v1/jobs/{job_id}/insights`
- `GET /api/v1/jobs/{job_id}/audio/url`
- `POST /api/v1/library/search`
- `POST /api/v1/jobs/{job_id}/clips` (optional extension)

The transcription path is asynchronous:

```text
POST /transcribe
    ↓
job_id
    ↓
poll GET /jobs/{job_id}
    ↓
done
    ↓
GET /result?format=json
```

The client uses a three-second polling interval by default and sends an
`Idempotency-Key` for safe retries.

The JSON transcript is used as the evidence layer because it carries segment
timestamps, speaker labels and word timestamps.

## API constraints I designed around

The public WhipScribe API documentation is marked Preview and currently says
API keys are self-serve and require account credit. The docs state there is no
free API tier and that a key requires positive balance.

I am therefore **not** committing an API key or pretending to have run a live
transcription without access to paid API credits.

Instead, this project has two honest modes:

### Demo Mode

`DEMO_MODE=true`

The deployed/reviewable app uses a bundled, deterministic meeting dataset. The UI
shows that it is Demo Mode.

This allows the complete product workflow to be reviewed without charging a
WhipScribe account.

### Live Mode

`DEMO_MODE=false`

and:

```env
WHIPSCRIBE_API_KEY=...
```

The same UI sends recordings through the live WhipScribe API.

No production code path relies on an invented API response.

## Why I am not building the whole platform first

Track 4 asks for a workflow, not a new project-management suite.

The first version intentionally removes everything that does not help a user get
from a meeting recording to organizational memory.

There is no settings-heavy onboarding flow, team-admin dashboard, or external
task-system sync in the first pass.

## States

The application explicitly handles:

### No memory

No meetings or evidence exist yet.

### Uploading / processing

The UI shows that the recording is being sent for transcription.

### No speech

WhipScribe can return a completed job with `speech_detected: false`. The client
should branch on that field rather than treating the job as an API failure.

### Failed transcription

A failed WhipScribe job is shown as a failed workflow rather than a successful
memory.

### Transcript locked / credits unavailable

The server returns the upstream error and does not fabricate a transcript.

### Done

A completed transcript is transformed into decisions, commitments, evidence
links and drift.

## Local development

Requirements:

- Node.js 20+
- npm

Run:

```bash
cd apps/tuhin-organizational-memory
npm install
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

Demo mode works without a WhipScribe API key.

## Environment

```env
PORT=3000
WHIPSCRIBE_BASE_URL=https://whipscribe.com/api/v1
WHIPSCRIBE_API_KEY=
WHIPSCRIBE_USER_EMAIL=
DEMO_MODE=true
POLL_INTERVAL_MS=3000
DATA_DIR=./data
```

For live mode:

```env
DEMO_MODE=false
WHIPSCRIBE_API_KEY=your_local_key
```

Never commit `.env`.

## Project structure

```text
apps/tuhin-organizational-memory/
├── README.md
├── .env.example
├── .gitignore
├── package.json
├── server/
│   ├── demo-data.js
│   ├── drift.js
│   ├── extractor.js
│   ├── pipeline.js
│   ├── promise-ledger.js
│   ├── storage.js
│   ├── whipscribe.js
│   └── index.js
└── public/
    ├── index.html
    ├── app.js
    └── styles.css
```

## What I deliberately kept lightweight

The first extraction layer is intentionally explainable. It uses phrase-based
signal detection for decisions, commitments, assumptions, disagreements and
questions.

That is deliberate.

A more advanced language model layer can be added after the evidence model and
workflow have been validated with a real person.

The extracted object is still editable and always retains its source timestamp.

## What works now

- Reviewable organizational-memory UI.
- Demo end-to-end workflow.
- Decision Memory.
- Decision Drift example.
- Promise Ledger.
- Timestamped evidence.
- Local search through transcript evidence.
- Live WhipScribe integration path.
- Idempotent job submission.
- Polling of asynchronous jobs.
- Transcript JSON retrieval.
- Optional insights retrieval.
- Playback URL retrieval path.
- Optional clip-rendering path.
- Clear demo/live boundary.
- Error-state handling in the live API path.

## What does not work yet

- The repository currently cannot claim a real paid WhipScribe API run unless a
  key with usable credit is configured locally.
- The extraction layer is heuristic rather than a full LLM reasoning system.
- Promise completion is evidence-based but does not yet verify an external task
  system such as Linear/Jira.
- No automatic writes to Notion, Linear, Jira or Slack.
- No multi-user authentication layer.
- No persistent cloud database or background worker in the prototype.
- No signed webhook path because the self-serve workflow is built around polling.
- No production-grade object storage for uploaded files.

These are intentionally scoped out rather than hidden.

## What I would validate with one real person

I would give the prototype to one product/engineering lead who runs recurring
technical meetings.

The test is simple:

1. give them a real meeting recording they are allowed to share;
2. ask them to find the current database decision;
3. ask what the previous decision was;
4. ask why it changed;
5. ask who promised the benchmark report;
6. ask whether the promise was completed;
7. ask them to open the source moment.

The success condition is that they stop rereading full meetings to answer those
questions.

## Two-minute demo plan

```text
0:00  Open DecisionTrace
0:10  Show the meeting memory
0:25  Open the database decision
0:45  Show the source timestamp
1:00  Open Decision Drift
1:20  Show MongoDB → PostgreSQL and the evidence
1:35  Open Promise Ledger
1:50  Show completed benchmark promise
2:00  End on the evidence-first workflow
```

The demo should show one user problem being removed, not the internal code.

## Vision

The first version remembers decisions and promises from meetings.

The longer-term product is an organizational memory layer:

```text
meetings
  ↓
decisions
  ↓
projects
  ↓
documents
  ↓
tasks
  ↓
outcomes
```

Future integrations could connect the memory to Linear, Jira, Notion and Slack.

The important invariant would remain:

> Important organizational claims should be traceable to evidence.

A person should be able to ask:

- What did we decide?
- Why?
- What assumption did that depend on?
- Who disagreed?
- Did we later change it?
- Why did we change it?
- Who said they would do something?
- Did it actually happen?

and reach the original moment in the conversation.

That is the direction in which DecisionTrace can grow from a meeting workflow
into a durable organizational memory system.

## API references

- WhipScribe API docs: https://whipscribe.com/docs
- WhipScribe Business APIs: https://whipscribe.com/apis
- WhipScribe MCP: https://whipscribe.com/claude
