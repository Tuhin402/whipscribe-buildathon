export class WhipScribeClient {
  constructor({
    baseUrl = "https://whipscribe.com/api/v1",
    apiKey = "",
    userEmail = "",
    pollIntervalMs = 3000
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.userEmail = userEmail;
    this.pollIntervalMs = Number(pollIntervalMs) || 3000;
  }

  assertKey() {
    if (!this.apiKey) {
      const error = new Error("WHIPSCRIBE_API_KEY is not configured.");
      error.code = "NO_API_KEY";
      throw error;
    }
  }

  headers(extra = {}) {
    this.assertKey();
    return {
      "X-API-Key": this.apiKey,
      ...(this.userEmail ? { "X-User-Email": this.userEmail } : {}),
      ...extra
    };
  }

  async submitFile(file, {
    language,
    diarize = true,
    word_timestamps = true,
    source = "api",
    idempotencyKey
  } = {}) {
    const form = new FormData();
    const bytes = await file.arrayBuffer();
    form.append("file", new Blob([bytes], { type: file.type || "application/octet-stream" }), file.name);
    if (language) form.append("language", language);
    form.append("diarize", String(diarize));
    form.append("word_timestamps", String(word_timestamps));
    form.append("source", source);

    const headers = this.headers(
      idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}
    );

    const response = await fetch(`${this.baseUrl}/transcribe`, {
      method: "POST",
      headers,
      body: form
    });

    return this.readJson(response);
  }

  async getStatus(jobId) {
    const response = await fetch(
      `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}`,
      { headers: this.headers() }
    );
    return this.readJson(response);
  }

  async waitForJob(jobId, onStatus = () => {}) {
    while (true) {
      const status = await this.getStatus(jobId);
      onStatus(status);

      if (["done", "failed"].includes(status.status)) {
        return status;
      }

      await sleep(this.pollIntervalMs);
    }
  }

  async getTranscript(jobId) {
    const response = await fetch(
      `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/result?format=json`,
      { headers: this.headers() }
    );
    return this.readJson(response);
  }

  async getInsights(jobId) {
    const response = await fetch(
      `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/insights`,
      { headers: this.headers() }
    );
    return this.readJson(response);
  }

  async getAudioUrl(jobId) {
    const response = await fetch(
      `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/audio/url`,
      { headers: this.headers() }
    );
    return this.readJson(response);
  }

  async usage() {
    const response = await fetch(
      `${this.baseUrl}/usage`,
      { headers: this.headers() }
    );
    return this.readJson(response);
  }

  async me() {
    const response = await fetch(
      `${this.baseUrl}/me`,
      { headers: this.headers() }
    );
    return this.readJson(response);
  }

  async searchLibrary(query) {
    const response = await fetch(
      `${this.baseUrl}/library/search`,
      {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ q: query })
      }
    );
    return this.readJson(response);
  }

  async makeClip(jobId, startS, endS, title = "DecisionTrace evidence") {
    const response = await fetch(
      `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/clips`,
      {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          start_s: startS,
          end_s: endS,
          title,
          caption_style: "rounded-white"
        })
      }
    );
    return this.readJson(response);
  }

  async getClip(clipId) {
    const response = await fetch(
      `${this.baseUrl}/clips/${encodeURIComponent(clipId)}`,
      { headers: this.headers() }
    );
    return this.readJson(response);
  }

  async deleteJob(jobId) {
    const response = await fetch(
      `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE", headers: this.headers() }
    );
    if (!response.ok && response.status !== 204) {
      return this.readJson(response);
    }
    return { ok: true };
  }

  async transcribeUrl(url, {
    language,
    diarize = true,
    word_timestamps = true,
    source = "url",
    idempotencyKey
  } = {}) {
    const response = await fetch(`${this.baseUrl}/transcribe/url`, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      }),
      body: JSON.stringify({
        url,
        ...(language ? { language } : {}),
        diarize,
        word_timestamps,
        source
      })
    });

    return this.readJson(response);
  }

  async readJson(response) {
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      const message = body?.detail || body?.error || body?.message || `WhipScribe HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return body;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
