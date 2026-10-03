const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/flac",
  "video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "application/octet-stream"
]);

const ALLOWED_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".mp4", ".mov", ".ogg", ".webm", ".flac"]);

export function isSupportedUpload(file) {
  if (!file) return false;
  const mimeOkay = !file.mimetype || ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase());
  const extension = getExtension(file.originalname);
  return mimeOkay && ALLOWED_EXTENSIONS.has(extension);
}

export function assertHttpUrl(value) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    const error = new Error("Enter a valid http(s) media URL.");
    error.code = "BAD_URL";
    error.status = 400;
    throw error;
  }
}

function getExtension(name) {
  const value = String(name || "").toLowerCase();
  const dot = value.lastIndexOf(".");
  return dot >= 0 ? value.slice(dot) : "";
}
