const DECISION_PATTERNS = [
  /\b(?:we\s+)?(?:decided|agree|agreed|let'?s\s+(?:go with|use|make|choose)|the decision is|we should)\b/i,
  /\b(?:for the first launch|we will use|we're going to use)\b/i
];

const PROMISE_PATTERNS = [
  /\b(?:i['’]?ll|i\s+will|i\s+can|i\s+am\s+going\s+to|we['’]?ll|we\s+will)\b/i,
  /\b(?:by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week))\b/i
];

const ASSUMPTION_PATTERNS = [
  /\b(?:assume|assumption|expected|expect|provided that|on the assumption)\b/i
];

const DISAGREEMENT_PATTERNS = [
  /\b(?:disagree|disagreement|i still prefer|i don't agree|concern|risk)\b/i
];

const QUESTION_PATTERNS = [
  /\?$/
];

export function extractSignals(transcript = [], meetingId = "unknown") {
  const decisions = [];
  const promises = [];
  const assumptions = [];
  const disagreements = [];
  const openQuestions = [];

  for (const seg of transcript) {
    if (DECISION_PATTERNS.some((p) => p.test(seg.text))) {
      decisions.push({
        meetingId,
        title: deriveTitle(seg.text),
        decision: clean(seg.text),
        status: "new",
        timestampStart: seg.start,
        timestampEnd: seg.end,
        speakers: [seg.speaker],
        rationale: [],
        assumptions: [],
        disagreements: [],
        evidence: [`${meetingId}#${seg.start}-${seg.end}`]
      });
    }

    if (PROMISE_PATTERNS.some((p) => p.test(seg.text)) && !/^.*\?$/.test(seg.text)) {
      promises.push({
        meetingId,
        owner: seg.speaker,
        recipient: "Unknown / team",
        commitment: clean(seg.text),
        dueDate: detectDueDate(seg.text),
        timestampStart: seg.start,
        timestampEnd: seg.end,
        status: "open",
        evidence: [`${meetingId}#${seg.start}-${seg.end}`]
      });
    }

    if (ASSUMPTION_PATTERNS.some((p) => p.test(seg.text))) {
      assumptions.push({
        meetingId,
        text: clean(seg.text),
        timestampStart: seg.start,
        timestampEnd: seg.end,
        speaker: seg.speaker,
        evidence: [`${meetingId}#${seg.start}-${seg.end}`]
      });
    }

    if (DISAGREEMENT_PATTERNS.some((p) => p.test(seg.text))) {
      disagreements.push({
        meetingId,
        text: clean(seg.text),
        timestampStart: seg.start,
        timestampEnd: seg.end,
        speaker: seg.speaker,
        evidence: [`${meetingId}#${seg.start}-${seg.end}`]
      });
    }

    if (QUESTION_PATTERNS.some((p) => p.test(seg.text.trim()))) {
      openQuestions.push({
        meetingId,
        question: clean(seg.text),
        timestampStart: seg.start,
        timestampEnd: seg.end,
        status: "open",
        evidence: [`${meetingId}#${seg.start}-${seg.end}`]
      });
    }
  }

  // Attach nearby assumptions/disagreements to the closest decision.
  for (const decision of decisions) {
    const nearby = transcript.filter((s) =>
      s.start >= decision.timestampStart - 120 &&
      s.end <= decision.timestampEnd + 120
    );

    decision.assumptions = assumptions
      .filter((a) => nearby.some((s) => a.evidence[0] === `${meetingId}#${s.start}-${s.end}`))
      .map((a) => a.text);

    decision.disagreements = disagreements
      .filter((d) => nearby.some((s) => d.evidence[0] === `${meetingId}#${s.start}-${s.end}`))
      .map((d) => d.text);
  }

  return { decisions, promises, assumptions, disagreements, openQuestions };
}

function deriveTitle(text) {
  const lower = text.toLowerCase();
  if (lower.includes("mongodb") || lower.includes("postgresql") || lower.includes("database")) {
    return "Database architecture decision";
  }
  return text.split(" ").slice(0, 7).join(" ");
}

function detectDueDate(text) {
  const match = text.match(/by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)/i);
  return match ? match[1].toLowerCase() : null;
}

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}
