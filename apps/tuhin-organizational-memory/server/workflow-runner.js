import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { processLiveTranscript } from "./pipeline.js";
import { WhipScribeApiError } from "./whipscribe.js";

const TERMINAL = new Set(["done", "failed", "no_speech", "locked"]);

export class WorkflowRunner {
  constructor({ store, client, uploadDir, logger, demoMode }) {
    this.store = store;
    this.client = client;
    this.uploadDir = uploadDir;
    this.logger = logger;
    this.demoMode = demoMode;
    this.active = new Map();
    fs.mkdirSync(uploadDir, { recursive: true });
    this.recoverInterruptedWorkflows();
  }

  list() {
    return this.store.getAll().workflows || [];
  }

  get(id) {
    return this.list().find((item) => item.id === id) || null;
  }

  createBase(kind, extra = {}) {
    const now = new Date().toISOString();
    const workflow = {
      id: crypto.randomUUID(),
      kind,
      status: "queued",
      progress: 0,
      message: "Queued",
      createdAt: now,
      updatedAt: now,
      ...extra
    };
    this.store.appendWorkflow(workflow);
    return workflow;
  }

  enqueueFile({ originalName, mimeType, filePath, options }) {
    const workflow = this.createBase("file", { filename: originalName, mimeType });
    void this.run(workflow.id, async () => {
      try {
        return await this.processFile(workflow.id, originalName, mimeType, filePath, options);
      } finally {
        await safeUnlink(filePath);
      }
    });
    return workflow;
  }

  enqueueUrl({ url, options }) {
    const workflow = this.createBase("url", { sourceUrl: url });
    void this.run(workflow.id, () => this.processUrl(workflow.id, url, options));
    return workflow;
  }

  async run(workflowId, task) {
    this.active.set(workflowId, task);
    try {
      const result = await task();
      return result;
    } catch (error) {
      this.logger.error("workflow failed", { workflowId, code: error.code, message: error.message });
      const status = error instanceof WhipScribeApiError && error.code === "transcript_locked" ? "locked" : "failed";
      this.update(workflowId, {
        status,
        progress: 1,
        message: error.message,
        error: {
          code: error.code || "WORKFLOW_ERROR",
          status: error.status || 500,
          details: safeErrorDetails(error.body)
        }
      });
      return null;
    } finally {
      this.active.delete(workflowId);
    }
  }

  async processFile(workflowId, originalName, mimeType, filePath, options) {
    this.update(workflowId, { status: "processing", progress: 0.05, message: "Submitting recording to WhipScribe…" });
    const idempotencyKey = options?.idempotencyKey || `decisiontrace-${workflowId}`;
    const submitted = await this.client.submitFilePath(filePath, originalName, mimeType, { ...options, idempotencyKey, source: "api" });
    this.update(workflowId, { providerJobId: submitted.job_id, progress: 0.1, message: `WhipScribe job ${submitted.job_id} queued.` });
    return this.finishProviderJob(workflowId, submitted, originalName);
  }

  async processUrl(workflowId, url, options) {
    this.update(workflowId, { status: "processing", progress: 0.05, message: "Submitting media URL to WhipScribe…" });
    const submitted = await this.client.transcribeUrl(url, { ...options, source: "url", idempotencyKey: options?.idempotencyKey || `decisiontrace-${workflowId}` });
    this.update(workflowId, { providerJobId: submitted.job_id, progress: 0.1, message: `WhipScribe job ${submitted.job_id} queued.` });
    return this.finishProviderJob(workflowId, submitted, url);
  }

  async finishProviderJob(workflowId, submitted, fallbackTitle) {
    const status = await this.client.waitForJob(submitted.job_id, async (snapshot) => {
      const progress = Number(snapshot.progress);
      this.update(workflowId, {
        status: snapshot.status === "failed" ? "failed" : "processing",
        progress: Number.isFinite(progress) ? Math.min(0.9, Math.max(0.1, 0.1 + progress * 0.8)) : undefined,
        message: snapshot.status === "processing" ? "WhipScribe is transcribing…" : `WhipScribe status: ${snapshot.status}`,
        providerStatus: snapshot.status,
        locked: Boolean(snapshot.locked)
      });
    });

    if (status.status === "failed") {
      throw new WhipScribeApiError(status.error || "WhipScribe transcription failed.", { status: 502, code: "TRANSCRIPTION_FAILED", body: status });
    }

    if (status.locked) {
      const error = new WhipScribeApiError("This transcript is locked for the configured account.", { status: 402, code: "transcript_locked", body: status });
      error.unlockUrl = status.unlock_url;
      throw error;
    }

    const transcript = await this.client.getTranscript(submitted.job_id);
    if (transcript.speech_detected === false) {
      this.update(workflowId, { status: "no_speech", progress: 1, message: "WhipScribe finished, but no transcribable speech was detected." });
      return this.get(workflowId);
    }

    let insights = null;
    try {
      insights = await this.client.getInsights(submitted.job_id);
    } catch (error) {
      this.logger.warn("WhipScribe insights unavailable; continuing", { workflowId, code: error.code });
    }

    const result = await processLiveTranscript({
      job: { ...submitted, ...status, filename: fallbackTitle },
      transcript,
      insights,
      store: this.store
    });

    this.update(workflowId, {
      status: "done",
      progress: 1,
      message: "Decision memory created.",
      meetingId: result.meeting.id,
      resultSummary: {
        decisions: result.decisions.length,
        promises: result.promises.length,
        drift: result.drift.length
      }
    });

    return result;
  }

  update(id, patch) {
    const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    return this.store.updateWorkflow(id, cleanPatch);
  }

  recoverInterruptedWorkflows() {
    for (const workflow of this.list()) {
      if (TERMINAL.has(workflow.status)) continue;
      this.update(workflow.id, {
        status: "failed",
        progress: 1,
        message: "Workflow interrupted by a server restart.",
        error: { code: "WORKFLOW_INTERRUPTED", status: 503 }
      });
    }
  }
}

async function safeUnlink(filePath) {
  try { await fs.promises.unlink(filePath); } catch { /* already removed */ }
}

function safeErrorDetails(value) {
  if (!value || typeof value !== "object") return null;
  const clone = structuredClone(value);
  for (const key of ["apiKey", "authorization", "token", "claim_token", "X-API-Key"]) {
    if (key in clone) clone[key] = "[redacted]";
  }
  return clone;
}
