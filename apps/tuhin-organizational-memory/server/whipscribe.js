export class WhipScribeApiError extends Error {
  constructor(message, { status = 500, code = "WHIPSCRIBE_ERROR", body = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = "WhipScribeApiError";
    this.status = status;
    this.code = code;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class WhipScribeClient {
  constructor({
    baseUrl = "https://whipscribe.com/api/v1",
    apiKey = "",
    userEmail = "",
    pollIntervalMs = 3000,
    pollTimeoutMs = 15 * 60 * 1000,
    timeoutMs = 30000,
    maxRetries = 3,
    fetchImpl = fetch,
    sleepImpl = sleep
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.userEmail = userEmail;
    this.pollIntervalMs = Number(pollIntervalMs) || 3000;
    this.pollTimeoutMs = Number(pollTimeoutMs) || 15 * 60 * 1000;
    this.timeoutMs = Number(timeoutMs) || 30000;
    this.maxRetries = Number(maxRetries) || 0;
    this.fetchImpl = fetchImpl;
    this.sleepImpl = sleepImpl;
  }

  headers(extra = {}) {
    if (!this.apiKey) {
      throw new WhipScribeApiError("WHIPSCRIBE_API_KEY is not configured.", { status: 503, code: "NO_API_KEY" });
    }
    return {
      "X-API-Key": this.apiKey,
      ...(this.userEmail ? { "X-User-Email": this.userEmail } : {}),
      ...extra
    };
  }

  async submitFileBlob(blob, fileName, options = {}) {
    const form = new FormData();
    form.append("file", blob, fileName);
    appendTranscriptionFields(form, options, "api");
    return this.request("/transcribe", { method: "POST", headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}, body: form });
  }

  async submitFilePath(filePath, fileName, mimeType, options = {}) {
    if (typeof Bun === "undefined" && typeof process !== "undefined") {
      const { openAsBlob } = await import("node:fs");
      const blob = await openAsBlob(filePath, { type: mimeType || "application/octet-stream" });
      return this.submitFileBlob(blob, fileName, options);
    }
    throw new Error("File-path uploads require Node.js runtime support.");
  }

  async transcribeUrl(url, options = {}) {
    return this.request("/transcribe/url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
      },
      body: JSON.stringify({
        url,
        ...(options.language ? { language: options.language } : {}),
        diarize: options.diarize !== false,
        word_timestamps: options.word_timestamps !== false,
        source: options.source || "url"
      })
    });
  }

  async listJobs(limit = 25) {
    const capped = Math.min(100, Math.max(1, Number(limit) || 25));
    return this.request(`/jobs?limit=${capped}`);
  }

  async getStatus(jobId, extraHeaders = {}) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}`, { headers: extraHeaders });
  }

  async waitForJob(jobId, onStatus = () => {}, options = {}) {
    const timeoutMs = Number(options.timeoutMs || this.pollTimeoutMs);
    const started = Date.now();
    let lastStatus = null;

    while (Date.now() - started < timeoutMs) {
      lastStatus = await this.getStatus(jobId);
      await onStatus(lastStatus);

      if (["done", "failed"].includes(lastStatus.status)) return lastStatus;
      await this.sleepImpl(this.pollIntervalMs);
    }

    throw new WhipScribeApiError("WhipScribe job polling timed out.", {
      status: 504,
      code: "POLL_TIMEOUT",
      body: lastStatus
    });
  }

  async getTranscript(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/result?format=json`);
  }

  async getInsights(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/insights`);
  }

  async getAudioUrl(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/audio/url`);
  }

  async me() {
    return this.request("/me");
  }

  async preprocessClips(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/clips/preprocess`, { method: "POST" });
  }

  async getClipSummary(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/clips/summary`);
  }

  async getClipCandidates(jobId, kind = "hook", limit = 10) {
    const allowed = new Set(["hook", "question", "number", "speaker_change", "high_energy"]);
    const safeKind = allowed.has(kind) ? kind : "hook";
    const safeLimit = Math.min(30, Math.max(1, Number(limit) || 10));
    return this.request(`/jobs/${encodeURIComponent(jobId)}/clips/candidates?kind=${encodeURIComponent(safeKind)}&limit=${safeLimit}`);
  }

  async searchClipMoments(jobId, query) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/clips/search?q=${encodeURIComponent(query)}`);
  }

  async makeClip(jobId, startS, endS, title = "DecisionTrace evidence", captionStyle = "rounded-white") {
    const start = Number(startS);
    const end = Number(endS);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start < 3 || end - start > 180) {
      throw new WhipScribeApiError("Clip range must be between 3 and 180 seconds.", { status: 400, code: "INVALID_CLIP_RANGE" });
    }
    const allowed = new Set(["bold-yellow", "rounded-white", "bold-bg", "karaoke"]);
    const style = allowed.has(captionStyle) ? captionStyle : "rounded-white";

    return this.request(`/jobs/${encodeURIComponent(jobId)}/clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_s: start, end_s: end, title: String(title).slice(0, 120), caption_style: style })
    });
  }

  async getClip(clipId) {
    return this.request(`/clips/${encodeURIComponent(clipId)}`);
  }

  async deleteJob(jobId) {
    return this.request(`/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE", allowEmpty: true });
  }

  async request(pathname, { method = "GET", headers = {}, body, allowEmpty = false } = {}) {
    const url = `${this.baseUrl}${pathname}`;
    let attempt = 0;

    while (true) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response;
        try {
          response = await this.fetchImpl(url, {
            method,
            headers: this.headers(headers),
            body,
            signal: controller.signal
          });
        } finally {
          clearTimeout(timer);
        }

        const parsed = await readBody(response);
        if (response.ok) return allowEmpty && response.status === 204 ? { ok: true } : parsed.body;

        const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        const error = new WhipScribeApiError(
          parsed.body?.error || parsed.body?.message || parsed.body?.detail || `WhipScribe HTTP ${response.status}`,
          {
            status: response.status,
            code: parsed.body?.code || parsed.body?.error_code || mapStatusToCode(response.status),
            body: parsed.body,
            retryAfterMs
          }
        );

        if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
          await this.sleepImpl(retryAfterMs ?? backoff(attempt));
          attempt += 1;
          continue;
        }
        throw error;
      } catch (error) {
        if (error instanceof WhipScribeApiError && (!RETRYABLE_STATUSES.has(error.status) || attempt >= this.maxRetries)) throw error;
        if (error.name === "AbortError") {
          if (attempt >= this.maxRetries) {
            throw new WhipScribeApiError("WhipScribe request timed out.", { status: 504, code: "UPSTREAM_TIMEOUT" });
          }
        } else if (error instanceof WhipScribeApiError) {
          throw error;
        } else if (attempt >= this.maxRetries) {
          throw new WhipScribeApiError(error.message || "WhipScribe network error.", { status: 502, code: "BACKEND_UNREACHABLE" });
        }

        await this.sleepImpl(backoff(attempt));
        attempt += 1;
      }
    }
  }
}

function appendTranscriptionFields(form, options, defaultSource) {
  if (options.language) form.append("language", options.language);
  form.append("diarize", String(options.diarize !== false));
  form.append("word_timestamps", String(options.word_timestamps !== false));
  form.append("source", options.source || defaultSource);
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return { body: {} };
  try { return { body: JSON.parse(text) }; } catch { return { body: { raw: text } }; }
}

function mapStatusToCode(status) {
  return ({
    400: "BAD_REQUEST", 401: "AUTHENTICATION_REQUIRED", 402: "NO_CREDITS", 403: "FORBIDDEN",
    404: "NOT_FOUND", 409: "CONFLICT", 410: "AUDIO_EXPIRED", 413: "FILE_TOO_LARGE", 415: "BAD_MIME",
    422: "UNPROCESSABLE_ENTITY", 429: "RATE_LIMITED", 500: "SERVER_ERROR", 502: "BACKEND_ERROR",
    503: "SERVICE_UNAVAILABLE", 504: "GATEWAY_TIMEOUT"
  })[status] || "WHIPSCRIBE_ERROR";
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(60000, Math.max(0, seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(60000, Math.max(0, date - Date.now())) : null;
}

function backoff(attempt) {
  return Math.min(8000, 500 * (2 ** attempt));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
