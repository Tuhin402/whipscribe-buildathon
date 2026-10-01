import crypto from "node:crypto";
import { extractSignals } from "./extractor.js";
import { detectDecisionDrift } from "./drift.js";
import { reconcilePromises } from "./promise-ledger.js";
import { demoSeed } from "./demo-data.js";

export function buildDemoModel() {
  const data = demoSeed();
  return {
    ...data,
    stats: buildStats(data)
  };
}

export async function processLiveTranscript({
  job,
  transcript,
  insights,
  audioUrl = null,
  store
}) {
  const meetingId = job.job_id;
  const title = job.filename || `WhipScribe job ${meetingId}`;
  const segments = normalizeSegments(transcript.segments || [], meetingId);

  const signals = extractSignals(segments, meetingId);

  const current = store.getAll();
  const previousMeetings = current.meetings || [];
  const meeting = {
    id: meetingId,
    title,
    source: job.source || "api",
    date: new Date().toISOString(),
    duration_seconds: job.audio_duration_seconds || 0,
    status: job.status,
    language: transcript.language || job.language || null,
    summary: insights?.summary || "",
    speakers: [...new Set(segments.map((s) => s.speaker).filter(Boolean))],
    audioUrl,
    transcript: segments
  };

  const meetingDecisionIds = signals.decisions.map(() => crypto.randomUUID());
  const decisions = signals.decisions.map((decision, index) => ({
    id: meetingDecisionIds[index],
    ...decision,
    createdAt: meeting.date.slice(0, 10)
  }));

  const promises = signals.promises.map((promise) => ({
    id: crypto.randomUUID(),
    ...promise,
  }));

  const allMeetings = [...previousMeetings, meeting];
  const allDecisions = [...(current.decisions || []), ...decisions];
  const allPromises = [...(current.promises || []), ...promises];

  const drift = detectDecisionDrift(allDecisions);

  const allTranscript = allMeetings.flatMap((m) =>
    (m.transcript || []).map((s) => ({ ...s, meetingId: m.id }))
  );

  const reconciledPromises = reconcilePromises(allPromises, allTranscript);

  const data = {
    meetings: allMeetings,
    decisions: allDecisions,
    promises: reconciledPromises,
    drift,
    openQuestions: [
      ...(current.openQuestions || []),
      ...signals.openQuestions.map((q) => ({ id: crypto.randomUUID(), ...q }))
    ]
  };

  store.replace(data);

  return {
    meeting,
    decisions,
    promises,
    drift,
    stats: buildStats(data)
  };
}

export function buildStats(data) {
  return {
    meetings: (data.meetings || []).length,
    decisions: (data.decisions || []).length,
    promises: (data.promises || []).length,
    openPromises: (data.promises || []).filter((p) => p.status === "open").length,
    completedPromises: (data.promises || []).filter((p) => p.status === "completed").length,
    drift: (data.drift || []).length,
    openQuestions: (data.openQuestions || []).filter((q) => q.status === "open").length
  };
}

export function normalizeSegments(segments, meetingId) {
  return segments.map((s) => ({
    meetingId,
    start: Number(s.start ?? 0),
    end: Number(s.end ?? 0),
    speaker: s.speaker || "Speaker",
    text: String(s.text || "").trim()
  }));
}

export function emptyJobResult() {
  return {
    status: "done",
    speech_detected: false,
    speech_ratio: 0,
    segments: [],
    text: ""
  };
}
