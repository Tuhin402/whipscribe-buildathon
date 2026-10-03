import path from "node:path";

const boolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const integer = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const rootFrom = (baseDir) => path.resolve(baseDir);

export function loadConfig(appRoot) {
  const root = rootFrom(appRoot);
  const dataDir = path.resolve(root, process.env.DATA_DIR || "./data");
  const uploadDir = path.resolve(root, process.env.UPLOAD_DIR || "./uploads");
  const config = {
    host: process.env.HOST || "127.0.0.1",
    port: integer(process.env.PORT, 3000, 1, 65535),
    demoMode: boolean(process.env.DEMO_MODE, true),
    dataDir,
    uploadDir,
    maxUploadBytes: integer(process.env.MAX_UPLOAD_BYTES, 512 * 1024 * 1024, 1, 10 * 1024 * 1024 * 1024),
    rateLimitPerMinute: integer(process.env.RATE_LIMIT_PER_MINUTE, 30, 1, 600),
    trustProxy: boolean(process.env.TRUST_PROXY, false),
    logLevel: process.env.LOG_LEVEL || "info",
    whipscribe: {
      baseUrl: (process.env.WHIPSCRIBE_BASE_URL || "https://whipscribe.com/api/v1").replace(/\/$/, ""),
      apiKey: process.env.WHIPSCRIBE_API_KEY || "",
      userEmail: process.env.WHIPSCRIBE_USER_EMAIL || "",
      pollIntervalMs: integer(process.env.POLL_INTERVAL_MS, 3000, 500, 30000),
      pollTimeoutMs: integer(process.env.POLL_TIMEOUT_MS, 15 * 60 * 1000, 5000, 60 * 60 * 1000),
      timeoutMs: integer(process.env.WHIPSCRIBE_TIMEOUT_MS, 30000, 3000, 120000),
      maxRetries: integer(process.env.WHIPSCRIBE_MAX_RETRIES, 3, 0, 6)
    }
  };

  return Object.freeze(config);
}

export function assertLiveConfig(config) {
  if (!config.whipscribe.apiKey) {
    const error = new Error("WHIPSCRIBE_API_KEY is not configured.");
    error.code = "NO_API_KEY";
    error.status = 503;
    throw error;
  }
}
