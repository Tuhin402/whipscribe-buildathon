export function reconcilePromises(promises = [], transcriptEntries = []) {
  return promises.map((promise) => {
    const candidates = transcriptEntries.filter((entry) =>
      entry.meetingId !== promise.meetingId && Number(entry.start) > Number(promise.timestampEnd || 0)
    );

    const later = candidates
      .map((entry) => ({ entry, score: completionScore(promise.commitment, entry.text) }))
      .filter((item) => item.score >= 0.55)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (later.length) {
      return {
        ...promise,
        status: "completed",
        completionEvidence: later.map(({ entry }) => `${entry.meetingId}#${entry.start}-${entry.end}`),
        completionConfidence: Number(later[0].score.toFixed(2))
      };
    }

    return { ...promise, status: promise.status === "completed" ? "completed" : "open" };
  });
}

function completionScore(commitment, text) {
  const a = meaningfulWords(commitment);
  const b = meaningfulWords(text);
  if (!a.size || !b.size) return 0;

  let overlap = 0;
  for (const word of a) {
    if (b.has(word)) overlap += 1;
  }

  const lexical = overlap / a.size;
  const completionSignal = /\b(sent|send|shared|posted|added|completed|finished|done|delivered|uploaded|reported|results|report)\b/i.test(text) ? 0.2 : 0;
  return Math.min(1, lexical + completionSignal);
}

function meaningfulWords(value) {
  return new Set(String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((word) => word.length >= 4));
}
