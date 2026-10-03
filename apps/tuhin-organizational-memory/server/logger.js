const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

export function createLogger(level = "info") {
  const threshold = LEVELS[level] ?? LEVELS.info;

  return {
    error(message, fields = {}) { write("error", threshold, message, fields); },
    warn(message, fields = {}) { write("warn", threshold, message, fields); },
    info(message, fields = {}) { write("info", threshold, message, fields); },
    debug(message, fields = {}) { write("debug", threshold, message, fields); }
  };
}

function write(level, threshold, message, fields) {
  if (LEVELS[level] > threshold) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields
  };
  console.log(JSON.stringify(payload));
}
