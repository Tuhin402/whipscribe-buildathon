const STOP_WORDS = new Set([
  "the", "a", "an", "for", "to", "of", "and", "or", "on", "in", "with", "our", "we", "should", "will", "first", "current", "revised", "decision", "architecture"
]);

export function detectDecisionDrift(decisions = []) {
  const drift = [];
  const sorted = decisions
    .slice()
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || Number(a.timestampStart || 0) - Number(b.timestampStart || 0));

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const previous = sorted[i];
      const next = sorted[j];
      if (!sameTopic(previous, next)) continue;
      if (normalizeDecision(previous.decision) === normalizeDecision(next.decision)) continue;

      const pairId = `drift-${previous.id}-${next.id}`;
      if (drift.some((item) => item.id === pairId)) continue;

      drift.push({
        id: pairId,
        previousDecisionId: previous.id,
        newDecisionId: next.id,
        type: conflictType(previous.decision, next.decision),
        detectedAt: next.createdAt || new Date().toISOString(),
        explanation: `The earlier decision "${previous.decision}" was followed by "${next.decision}". Review the linked evidence to understand what changed.`,
        evidence: [...new Set([...(previous.evidence || []), ...(next.evidence || [])])]
      });
    }
  }

  return drift;
}

export function markDecisionStatuses(decisions, drift) {
  const superseded = new Set(drift.map((item) => item.previousDecisionId));
  return decisions.map((decision) => ({
    ...decision,
    status: superseded.has(decision.id) ? "superseded" : (decision.status === "new" ? "current" : decision.status || "current")
  }));
}

function sameTopic(a, b) {
  const aTokens = meaningfulTokens(`${a.title || ""} ${a.decision || ""}`);
  const bTokens = meaningfulTokens(`${b.title || ""} ${b.decision || ""}`);
  if (!aTokens.size || !bTokens.size) return false;

  const intersection = [...aTokens].filter((word) => bTokens.has(word)).length;
  const overlap = intersection / Math.max(1, Math.min(aTokens.size, bTokens.size));

  const databasePair = /(mongodb|postgresql|database|storage)/.test(`${[...aTokens].join(" ")} ${[...bTokens].join(" ")}`)
    && /(mongodb|postgresql|database|storage)/.test(`${[...bTokens].join(" ")}`);

  return overlap >= 0.25 || databasePair;
}

function meaningfulTokens(value) {
  return new Set(
    String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

function normalizeDecision(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function conflictType(previous, next) {
  if (/postgresql/i.test(previous) && /mongodb/i.test(next)) return "changed";
  if (/mongodb/i.test(previous) && /postgresql/i.test(next)) return "evolved";
  return "revisited";
}
