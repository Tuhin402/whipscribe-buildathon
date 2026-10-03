import crypto from "node:crypto";
import { extractSignals } from "./extractor.js";
import { detectDecisionDrift, markDecisionStatuses } from "./drift.js";
import { reconcilePromises } from "./promise-ledger.js";
import { demoSeed } from "./demo-data.js";

export function buildDemoModel() {
  const data = demoSeed();
  return { ...data, stats: buildStats(data) };
}

export async function processLiveTranscript({ job, transcript, insights, store }) {
  const meetingId = job.job_id;
  const title = job.filename || `WhipScribe job ${meetingId}`;
  const segments = normalizeSegments(transcript.segments || [], meetingId);
  const signals = extractSignals(segments, meetingId);
  const current = store.getAll();
  const meetingDate = new Date().toISOString();

  const meeting = {
    id: meetingId,
    providerJobId: meetingId,
    title,
    source: job.source || "api",
    date: meetingDate,
    duration_seconds: Number(job.audio_duration_seconds || 0),
    status: job.status || "done",
    language: transcript.language || job.language || null,
    speechDetected: transcript.speech_detected !== false,
    speechRatio: Number(transcript.speech_ratio || job.speech_ratio || 0),
    summary: extractSummary(insights),
    speakers: [...new Set(segments.map((s) => s.speaker).filter(Boolean))],
    transcript: segments
  };

  const decisions = signals.decisions.map((decision) => ({
    id: crypto.randomUUID(),
    ...decision,
    createdAt: meetingDate.slice(0, 10)
  }));

  const promises = signals.promises.map((promise) => ({ id: crypto.randomUUID(), ...promise }));
  const allMeetings = [...current.meetings, meeting];
  const allDecisions = [...current.decisions, ...decisions];
  const preliminaryDrift = detectDecisionDrift(allDecisions);
  const allDecisionsWithStatus = markDecisionStatuses(allDecisions, preliminaryDrift);
  const allPromises = [...current.promises, ...promises];
  const allTranscript = allMeetings.flatMap((item) => (item.transcript || []).map((segment) => ({ ...segment, meetingId: item.id })));
  const reconciledPromises = reconcilePromises(allPromises, allTranscript);

  const data = {
    ...current,
    meetings: allMeetings,
    decisions: allDecisionsWithStatus,
    promises: reconciledPromises,
    drift: preliminaryDrift,
    openQuestions: [...current.openQuestions, ...signals.openQuestions.map((q) => ({ id: crypto.randomUUID(), ...q }))]
  };

  store.replace(data);

  return {
    meeting,
    decisions: allDecisionsWithStatus.filter((decision) => decision.meetingId === meetingId),
    promises: reconciledPromises.filter((promise) => promise.meetingId === meetingId),
    drift: preliminaryDrift,
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
    openQuestions: (data.openQuestions || []).filter((q) => q.status === "open").length,
    workflows: (data.workflows || []).filter((job) => ["queued", "processing"].includes(job.status)).length
  };
}

export function normalizeSegments(segments, meetingId) {
  return segments
    .map((s) => ({
      meetingId,
      start: Number(s.start ?? 0),
      end: Number(s.end ?? 0),
      speaker: s.speaker || "Speaker",
      text: String(s.text || "").trim(),
      words: Array.isArray(s.words) ? s.words.map((w) => ({
        start: Number(w.start ?? 0),
        end: Number(w.end ?? 0),
        text: String(w.text || "")
      })) : []
    }))
    .filter((segment) => segment.text && segment.end >= segment.start);
}

function extractSummary(insights) {
  if (!insights || typeof insights !== "object") return "";
  return String(insights.summary || insights.overview || insights.text || "").trim();
}

export function emptyJobResult() {
  return { status: "done", speech_detected: false, speech_ratio: 0, segments: [], text: "" };
}
