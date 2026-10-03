import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import multer from "multer";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createRateLimiter } from "./rate-limit.js";
import { MemoryStore } from "./storage.js";
import { WhipScribeClient } from "./whipscribe.js";
import { WorkflowRunner } from "./workflow-runner.js";
import { buildStats } from "./pipeline.js";
import { demoSeed } from "./demo-data.js";
import { assertHttpUrl, isSupportedUpload } from "./validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const publicDir = path.join(appRoot, "public");
const config = loadConfig(appRoot);
const logger = createLogger(config.logLevel);

fs.mkdirSync(config.uploadDir, { recursive: true });
const store = new MemoryStore(config.dataDir, logger);
if (config.demoMode && store.getAll().meetings.length === 0) store.replace(demoSeed());

const client = new WhipScribeClient(config.whipscribe);
const runner = new WorkflowRunner({ store, client, uploadDir: config.uploadDir, logger, demoMode: config.demoMode });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${cryptoSafeName(file.originalname)}`)
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 }
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);
app.use(requestId);
app.use(securityHeaders);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.static(publicDir, { extensions: ["html"] }));

const generalLimit = createRateLimiter({ max: config.rateLimitPerMinute });
const mutationLimit = createRateLimiter({ max: Math.max(5, Math.floor(config.rateLimitPerMinute / 2)) });
app.use("/api", generalLimit);

app.get("/api/config", (_req, res) => {
  res.json({
    productName: "DecisionTrace",
    tagline: "Organizational memory from conversations",
    demoMode: config.demoMode,
    liveConfigured: Boolean(config.whipscribe.apiKey),
    features: { urlIngest: true, jobMonitor: true, audioEvidence: true, clipDiscovery: true }
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: mode(), uptimeSeconds: Math.round(process.uptime()), workflowsInFlight: runner.active.size });
});

app.get("/api/health/deep", async (_req, res) => {
  if (!config.whipscribe.apiKey) {
    return res.status(200).json({ ok: true, provider: { configured: false } });
  }
  try {
    const me = await client.me();
    res.json({ ok: true, provider: { configured: true, reachable: true, me: sanitizeProviderAccount(me) } });
  } catch (error) {
    res.status(502).json({ ok: false, provider: { configured: true, reachable: false, error: providerError(error) } });
  }
});

app.get("/api/dashboard", (_req, res) => {
  const data = store.getAll();
  res.json({ mode: mode(), data, stats: buildStats(data) });
});

app.get("/api/workflows", (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json({ items: runner.list().slice(0, limit) });
});

app.get("/api/workflows/:id", (req, res) => {
  const item = runner.get(req.params.id);
  if (!item) return res.status(404).json({ error: "NOT_FOUND", message: "Workflow not found." });
  res.json({ item });
});

app.get("/api/provider/me", async (_req, res) => {
  if (config.demoMode || !config.whipscribe.apiKey) {
    return res.json({ configured: false, message: "Live WhipScribe API is not configured." });
  }
  try {
    const me = await client.me();
    res.json({ configured: true, me: sanitizeProviderAccount(me) });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.code || "PROVIDER_ERROR", message: error.message });
  }
});

app.get("/api/provider/jobs", async (req, res) => {
  if (config.demoMode || !config.whipscribe.apiKey) return res.json({ configured: false, items: [] });
  try {
    const items = await client.listJobs(Number(req.query.limit) || 10);
    res.json({ configured: true, items: Array.isArray(items) ? items : [] });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.code || "PROVIDER_ERROR", message: error.message });
  }
});

app.get("/api/meeting/:id", (req, res) => {
  const data = store.getAll();
  const meeting = data.meetings.find((item) => item.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "NOT_FOUND", message: "Meeting not found." });
  res.json({
    meeting,
    decisions: data.decisions.filter((item) => item.meetingId === meeting.id),
    promises: data.promises.filter((item) => item.meetingId === meeting.id),
    questions: data.openQuestions.filter((item) => item.meetingId === meeting.id)
  });
});

app.get("/api/meeting/:id/audio-url", async (req, res) => {
  const data = store.getAll();
  const meeting = data.meetings.find((item) => item.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "NOT_FOUND", message: "Meeting not found." });
  if (meeting.source === "demo") return res.status(404).json({ error: "NO_AUDIO", message: "Demo meetings do not have source audio." });
  if (!config.whipscribe.apiKey) return res.status(503).json({ error: "NO_API_KEY", message: "Live WhipScribe API is not configured." });

  try {
    const audio = await client.getAudioUrl(meeting.providerJobId || meeting.id);
    res.json({ url: audio.url || null, expiresIn: audio.expires_in || null, storage: audio.storage || null });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.code || "AUDIO_ERROR", message: error.message, details: error.body || null });
  }
});

app.get("/api/meeting/:id/moments", async (req, res) => {
  const data = store.getAll();
  const meeting = data.meetings.find((item) => item.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "NOT_FOUND", message: "Meeting not found." });

  const kind = String(req.query.kind || "hook");
  const limit = Number(req.query.limit) || 8;
  if (meeting.source === "demo") return res.json({ demo: true, summary: demoMomentSummary(meeting), sentences: demoCandidates(meeting, kind, limit) });
  if (!config.whipscribe.apiKey) return res.status(503).json({ error: "NO_API_KEY", message: "Live WhipScribe API is not configured." });

  try {
    const result = await client.getClipCandidates(meeting.providerJobId || meeting.id, kind, limit);
    res.json({ demo: false, ...result });
  } catch (error) {
    if (error.code === "FEATURES_NOT_READY") {
      try { await client.preprocessClips(meeting.providerJobId || meeting.id); } catch (preprocessError) {
        if (preprocessError.code !== "FEATURES_NOT_READY") logger.warn("clip preprocess failed", { code: preprocessError.code });
      }
    }
    res.status(error.status || 502).json({ error: error.code || "MOMENTS_ERROR", message: error.message, retryable: error.code === "FEATURES_NOT_READY" });
  }
});

app.post("/api/transcribe", mutationLimit, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE", message: "Choose an audio or video file." });
  if (!isSupportedUpload(req.file)) return cleanupAndRespond(req.file.path, res, 415, { error: "BAD_MIME", message: "Unsupported audio/video type. Use mp3, m4a, wav, mp4, mov, ogg, webm, or flac." });
  if (config.demoMode || !config.whipscribe.apiKey) {
    return cleanupAndRespond(req.file.path, res, 503, { error: "LIVE_API_NOT_CONFIGURED", message: "Demo Mode is active or no WhipScribe API key is configured. Use the seeded demo data or configure live mode." });
  }

  const workflow = runner.enqueueFile({
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    filePath: req.file.path,
    options: {
      language: req.body.language || undefined,
      diarize: req.body.diarize !== "false",
      word_timestamps: req.body.word_timestamps !== "false",
      idempotencyKey: safeIdempotency(req.get("Idempotency-Key"))
    }
  });
  return res.status(202).json({ workflow: workflow.id, status: workflow.status });
});

app.post("/api/transcribe-url", mutationLimit, (req, res) => {
  if (config.demoMode || !config.whipscribe.apiKey) return res.status(503).json({ error: "LIVE_API_NOT_CONFIGURED", message: "URL transcription requires live WhipScribe configuration." });
  let url;
  try { url = assertHttpUrl(req.body?.url); } catch (error) { return res.status(error.status || 400).json({ error: error.code || "BAD_URL", message: error.message }); }

  const workflow = runner.enqueueUrl({
    url,
    options: {
      language: req.body.language || undefined,
      diarize: req.body.diarize !== false,
      word_timestamps: req.body.word_timestamps !== false,
      idempotencyKey: safeIdempotency(req.get("Idempotency-Key"))
    }
  });
  return res.status(202).json({ workflow: workflow.id, status: workflow.status });
});

app.post("/api/search", async (req, res) => {
  const q = String(req.body?.q || "").trim();
  if (!q) return res.status(400).json({ error: "SEARCH_REQUIRED", message: "Search query is required." });
  const data = store.getAll();
  const local = [];
  const lower = q.toLowerCase();
  for (const meeting of data.meetings) {
    for (const seg of meeting.transcript || []) {
      if (seg.text.toLowerCase().includes(lower)) {
        local.push({ meetingId: meeting.id, meetingTitle: meeting.title, speaker: seg.speaker, start: seg.start, end: seg.end, text: seg.text, evidence: `${meeting.id}#${seg.start}-${seg.end}` });
      }
    }
  }
  local.sort((a, b) => a.start - b.start);
  res.json({ query: q, local: local.slice(0, 100) });
});

app.post("/api/meeting/:id/clip", mutationLimit, async (req, res) => {
  const data = store.getAll();
  const meeting = data.meetings.find((item) => item.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: "NOT_FOUND", message: "Meeting not found." });
  if (meeting.source === "demo") return res.status(409).json({ error: "DEMO_CLIP_ONLY", message: "Demo meetings show clip candidates, but video rendering requires a real WhipScribe job." });
  if (!config.whipscribe.apiKey) return res.status(503).json({ error: "NO_API_KEY", message: "Live WhipScribe API is not configured." });
  try {
    const clip = await client.makeClip(meeting.providerJobId || meeting.id, req.body.startS, req.body.endS, req.body.title, req.body.captionStyle);
    res.status(202).json(clip);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.code || "CLIP_ERROR", message: error.message, details: error.body || null });
  }
});

app.get("/api/clip/:clipId", async (req, res) => {
  if (!config.whipscribe.apiKey) return res.status(503).json({ error: "NO_API_KEY", message: "Live WhipScribe API is not configured." });
  try {
    const clip = await client.getClip(req.params.clipId);
    res.json(clip);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.code || "CLIP_ERROR", message: error.message });
  }
});

app.post("/api/demo/reset", mutationLimit, (_req, res) => {
  if (!config.demoMode) return res.status(403).json({ error: "DEMO_ONLY", message: "Demo reset is disabled in live mode." });
  const data = demoSeed();
  store.replace(data);
  res.json({ ok: true, stats: buildStats(data) });
});

app.use((error, _req, res, _next) => {
  logger.error("unhandled request error", { message: error.message, code: error.code });
  if (error instanceof multer.MulterError) {
    const code = error.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : error.code;
    return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: code, message: error.message });
  }
  return res.status(error.status || 500).json({ error: error.code || "INTERNAL_ERROR", message: error.message || "Unexpected server error." });
});

app.use((_req, res) => res.sendFile(path.join(publicDir, "index.html")));

const server = app.listen(config.port, config.host, () => {
  logger.info("DecisionTrace server started", { url: `http://${config.host}:${config.port}`, mode: mode() });
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    logger.info("shutdown requested", { signal });
    server.close(() => process.exit(0));
  });
}

function mode() { return config.demoMode || !config.whipscribe.apiKey ? "demo" : "live"; }
function requestId(req, res, next) { const id = req.get("X-Request-Id") || cryptoSafeId(); res.setHeader("X-Request-Id", id); req.requestId = id; next(); }
function securityHeaders(_req, res, next) {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' https: blob:; connect-src 'self' https:; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
}
function cryptoSafeId() { return crypto.randomUUID(); }
function cryptoSafeName(name) { return String(name || "upload").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120); }
function safeIdempotency(value) { return /^[A-Za-z0-9_.:/-]{1,255}$/.test(String(value || "")) ? value : null; }
function cleanupAndRespond(filePath, res, status, body) { fs.promises.unlink(filePath).catch(() => {}); return res.status(status).json(body); }
function sanitizeProviderAccount(value) { return { email: value?.email || null, tier: value?.tier || null, retentionDays: value?.retention_days ?? null, signedIn: Boolean(value?.signed_in) }; }
function providerError(error) { return { code: error.code || "PROVIDER_ERROR", status: error.status || 502, message: error.message }; }
function demoMomentSummary(meeting) { return { duration_seconds: meeting.duration_seconds, speaker_turns: (meeting.transcript || []).length, silence_breaks: 0 }; }
function demoCandidates(meeting, kind, limit) {
  const signals = kind === "question" ? (meeting.transcript || []).filter((s) => /[?？]$/.test(s.text)) : (meeting.transcript || []).slice(0, Math.max(1, limit));
  return signals.slice(0, Math.min(30, limit)).map((s) => ({ start_s: s.start, end_s: s.end, text: s.text, speaker: s.speaker }));
}
