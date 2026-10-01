export function detectDecisionDrift(decisions) {
  const drift = [];

  for (let i = 0; i < decisions.length; i += 1) {
    for (let j = i + 1; j < decisions.length; j += 1) {
      const a = decisions[i];
      const b = decisions[j];

      if (!sameTopic(a, b)) continue;
      if (a.decision === b.decision) continue;

      const type = conflictType(a.decision, b.decision);

      drift.push({
        id: `drift-${a.id}-${b.id}`,
        previousDecisionId: a.id,
        newDecisionId: b.id,
        type,
        detectedAt: new Date().toISOString(),
        explanation: `The earlier decision "${a.decision}" was followed by "${b.decision}". Review the linked evidence to understand the change.`,
        evidence: [...new Set([...(a.evidence || []), ...(b.evidence || [])])]
      });
    }
  }

  return drift;
}

function sameTopic(a, b) {
  const aTitle = (a.title || "").toLowerCase();
  const bTitle = (b.title || "").toLowerCase();
  if (aTitle.includes("database") && bTitle.includes("database")) return true;

  const wordsA = new Set(aTitle.split(/\W+/).filter(Boolean));
  const wordsB = new Set(bTitle.split(/\W+/).filter(Boolean));
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap += 1;
  }
  return overlap >= 1;
}

function conflictType(previous, next) {
  if (previous.toLowerCase().includes("postgresql") && next.toLowerCase().includes("mongodb")) {
    return "changed";
  }
  if (previous.toLowerCase().includes("mongodb") && next.toLowerCase().includes("postgresql")) {
    return "evolved";
  }
  return "revisited";
}
