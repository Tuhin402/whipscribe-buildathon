const DECISION_PATTERNS = [
  /\b(?:we\s+)?(?:decided|agree|agreed|let'?s\s+(?:go with|use|make|choose)|the decision is|we should|we will use|we're going to use)\b/i,
  /\b(?:for the first launch|the final choice|we're choosing)\b/i
];

const STRONG_PROMISE_PATTERNS = [
  /\b(?:i['’]?ll|i\s+will|i['’]?m\s+going\s+to|i\s+am\s+going\s+to|we['’]?ll|we\s+will)\b/i
];

const ASSUMPTION_PATTERNS = [
  /\b(?:assume|assumption|expected|expect|provided that|on the assumption|we're counting on)\b/i
];

const DISAGREEMENT_PATTERNS = [
  /\b(?:disagree|disagreement|i still prefer|i don't agree|concern|risk|i'm not convinced)\b/i
];

export function extractSignals(transcript = [], meetingId = "unknown") {
  const decisions = [];
  const promises = [];
  const assumptions = [];
  const disagreements = [];
  const openQuestions = [];

  for (const seg of transcript) {
    const text = clean(seg.text);
    if (!text) continue;
    const evidence = [`${meetingId}#${seg.start}-${seg.end}`];

    if (DECISION_PATTERNS.some((p) => p.test(text))) {
      decisions.push({
        meetingId,
        title: deriveTitle(text),
        decision: text,
        status: "new",
        confidence: scoreDecision(text),
        timestampStart: seg.start,
        timestampEnd: seg.end,
        speakers: [seg.speaker],
        rationale: [],
        assumptions: [],
        disagreements: [],
        evidence
      });
    }

    if (STRONG_PROMISE_PATTERNS.some((p) => p.test(text)) && !/\?$/.test(text)) {
      promises.push({
        meetingId,
        owner: seg.speaker,
        recipient: "Unknown / team",
        commitment: text,
        dueDate: detectDueDate(text),
        timestampStart: seg.start,
        timestampEnd: seg.end,
        confidence: scorePromise(text),
        status: "open",
        evidence
      });
    }

    if (ASSUMPTION_PATTERNS.some((p) => p.test(text))) {
      assumptions.push({ meetingId, text, timestampStart: seg.start, timestampEnd: seg.end, speaker: seg.speaker, evidence });
    }

    if (DISAGREEMENT_PATTERNS.some((p) => p.test(text))) {
      disagreements.push({ meetingId, text, timestampStart: seg.start, timestampEnd: seg.end, speaker: seg.speaker, evidence });
    }

    if (/[?？]$/.test(text.trim())) {
      openQuestions.push({
        meetingId,
        question: text,
        timestampStart: seg.start,
        timestampEnd: seg.end,
        status: "open",
        evidence
      });
    }
  }

  for (const decision of decisions) {
    const nearby = transcript.filter((s) =>
      Number(s.start) >= decision.timestampStart - 120 && Number(s.end) <= decision.timestampEnd + 120
    );
    const keys = new Set(nearby.map((s) => `${meetingId}#${s.start}-${s.end}`));

    decision.assumptions = assumptions.filter((item) => keys.has(item.evidence[0])).map((item) => item.text);
    decision.disagreements = disagreements.filter((item) => keys.has(item.evidence[0])).map((item) => item.text);
  }

  return {
    decisions: dedupe(decisions, (item) => `${item.title}|${item.decision}`),
    promises: dedupe(promises, (item) => `${item.owner}|${item.commitment}`),
    assumptions,
    disagreements,
    openQuestions: dedupe(openQuestions, (item) => item.question)
  };
}

function deriveTitle(text) {
  const lower = text.toLowerCase();
  if (lower.includes("mongodb") || lower.includes("postgresql") || lower.includes("database")) {
    return "Database architecture decision";
  }
  if (lower.includes("launch")) return "Launch decision";
  if (lower.includes("api")) return "API decision";
  return text.split(" ").slice(0, 7).join(" ");
}

function detectDueDate(text) {
  const match = text.match(/\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function scoreDecision(text) {
  let score = 0.55;
  if (/\b(decided|agreed|the decision is|let'?s make the decision explicit)\b/i.test(text)) score += 0.25;
  if (/\b(should|will|choose|use)\b/i.test(text)) score += 0.10;
  return Math.min(0.95, score);
}

function scorePromise(text) {
  let score = 0.50;
  if (/\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)\b/i.test(text)) score += 0.25;
  if (/\b(i['’]?ll|i\s+will|we['’]?ll|we\s+will)\b/i.test(text)) score += 0.15;
  return Math.min(0.95, score);
}

function dedupe(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
