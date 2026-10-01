import "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { WhipScribeClient } from "./whipscribe.js";
import { MemoryStore } from "./storage.js";
import { buildDemoModel, buildStats, processLiveTranscript } from "./pipeline.js";
import { demoSeed } from "./demo-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const publicDir = path.join(appRoot, "public");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(appRoot, process.env.DATA_DIR || "./data");
const DEMO_MODE = String(process.env.DEMO_MODE || "true").toLowerCase() === "true";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }
});

const app = express();

const store = new MemoryStore(DATA_DIR);
if (DEMO_MODE && store.getAll().meetings.length === 0) {
  store.replace(demoSeed());
}

const client = new WhipScribeClient({
  baseUrl: process.env.WHIPSCRIBE_BASE_URL,
  apiKey: process.env.WHIPSCRIBE_API_KEY,
  userEmail: process.env.WHIPSCRIBE_USER_EMAIL,
  pollIntervalMs: process.env.POLL_INTERVAL_MS
});

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

app.get("/api/config", (_req, res) => {
  res.json({
    demoMode: DEMO_MODE,
    liveConfigured: Boolean(process.env.WHIPSCRIBE_API_KEY),
    productName: "DecisionTrace",
    tagline: "Organizational memory from conversations"
  });
});

app.get("/api/dashboard", (_req, res) => {
  const data = store.getAll();
  res.json({
    mode: DEMO_MODE || !process.env.WHIPSCRIBE_API_KEY ? "demo" : "live",
    data,
    stats: buildStats(data)
  });
});

app.get("/api/meeting/:id", (req, res) => {
  const data = store.getAll();
  const meeting = data.meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });

  res.json({
    meeting,
    decisions: data.decisions.filter((d) => d.meetingId === meeting.id),
    promises: data.promises.filter((p) => p.meetingId === meeting.id),
    questions: data.openQuestions.filter((q) => q.meetingId === meeting.id)
  });
});

app.get("/api/drift", (_req, res) => {
  const data = store.getAll();
  res.json({
    items: data.drift.map((item) => ({
      ...item,
      previous: data.decisions.find((d) => d.id === item.previousDecisionId) || null,
      next: data.decisions.find((d) => d.id === item.newDecisionId) || null
    }))
  });
});

app.get("/api/promises", (_req, res) => {
  const data = store.getAll();
  res.json({ items: data.promises });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    demoMode: DEMO_MODE,
    whipscribeConfigured: Boolean(process.env.WHIPSCRIBE_API_KEY)
  });
});

app.post("/api/demo/reset", (_req, res) => {
  if (!DEMO_MODE) return res.status(403).json({ error: "Demo reset is disabled in live mode." });
  const data = demoSeed();
  store.replace(data);
  res.json({ ok: true, stats: buildStats(data) });
});

app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Choose an audio or video file." });
  }

  if (DEMO_MODE || !process.env.WHIPSCRIBE_API_KEY) {
    return res.status(503).json({
      error: "LIVE_API_NOT_CONFIGURED",
      message: "Demo Mode is active. Add WHIPSCRIBE_API_KEY locally to run a real transcription.",
      docs: "https://whipscribe.com/docs"
    });
  }

  const idempotencyKey =
    req.get("Idempotency-Key") ||
    `decisiontrace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    const file = new File([blob], req.file.originalname, { type: req.file.mimetype });

    const submitted = await client.submitFile(file, {
      language: req.body.language || undefined,
      diarize: req.body.diarize !== "false",
      word_timestamps: req.body.word_timestamps !== "false",
      source: "api",
      idempotencyKey
    });

    const status = await client.waitForJob(submitted.job_id);

    if (status.status === "failed") {
      return res.status(502).json({
        error: "TRANSCRIPTION_FAILED",
        job: submitted,
        status
      });
    }

    if (status.locked) {
      return res.status(402).json({
        error: "TRANSCRIPT_LOCKED",
        job: submitted,
        status,
        unlock_url: status.unlock_url
      });
    }

    const transcript = await client.getTranscript(submitted.job_id);

    if (transcript.speech_detected === false) {
      return res.status(422).json({
        error: "NO_SPEECH",
        job: submitted,
        status,
        transcript
      });
    }

    let insights = null;
    try {
      insights = await client.getInsights(submitted.job_id);
    } catch {
      // Insights are optional for the core evidence workflow.
    }

    let audioUrl = null;
    try {
      const audio = await client.getAudioUrl(submitted.job_id);
      audioUrl = audio.url || null;
    } catch {
      // Transcript remains usable even when playback URL is unavailable.
    }

    const result = await processLiveTranscript({
      job: { ...submitted, ...status },
      transcript,
      insights,
      audioUrl,
      store
    });

    res.status(201).json({
      mode: "live",
      ...result
    });
  } catch (error) {
    const status = error.status || 500;

    res.status(status).json({
      error: error.code || "WHIPSCRIBE_ERROR",
      message: error.message,
      details: error.body || null
    });
  }
});

app.post("/api/search", async (req, res) => {
  const q = String(req.body.q || "").trim();
  if (!q) return res.status(400).json({ error: "Search query is required." });

  const data = store.getAll();

  // Local evidence search is always available.
  const local = [];
  for (const meeting of data.meetings) {
    for (const seg of meeting.transcript || []) {
      if (seg.text.toLowerCase().includes(q.toLowerCase())) {
        local.push({
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          speaker: seg.speaker,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          evidence: `${meeting.id}#${seg.start}-${seg.end}`
        });
      }
    }
  }

  let whipscribe = null;
  if (!DEMO_MODE && process.env.WHIPSCRIBE_API_KEY) {
    try {
      whipscribe = await client.searchLibrary(q);
    } catch {
      whipscribe = null;
    }
  }

  res.json({ query: q, local, whipscribe });
});

app.post("/api/clip", async (req, res) => {
  const { jobId, startS, endS, title } = req.body;
  if (DEMO_MODE || !process.env.WHIPSCRIBE_API_KEY) {
    return res.status(503).json({
      error: "LIVE_API_NOT_CONFIGURED",
      message: "Clip rendering needs a live WhipScribe API key."
    });
  }

  try {
    const clip = await client.makeClip(jobId, Number(startS), Number(endS), title);
    res.status(202).json(clip);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.code || "CLIP_ERROR",
      message: error.message,
      details: error.body || null
    });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`DecisionTrace running on http://localhost:${PORT}`);
  console.log(`Mode: ${DEMO_MODE || !process.env.WHIPSCRIBE_API_KEY ? "DEMO" : "LIVE"}`);
});
