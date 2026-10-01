export function reconcilePromises(promises, transcriptEntries) {
  return promises.map((promise) => {
    const later = transcriptEntries.filter((entry) =>
      entry.start > promise.timestampEnd &&
      new RegExp(completionHint(promise.commitment), "i").test(entry.text)
    );

    if (later.length > 0) {
      return {
        ...promise,
        status: "completed",
        completionEvidence: later.slice(0, 3).map((e) => `${e.meetingId}#${e.start}-${e.end}`)
      };
    }

    return promise;
  });
}

function completionHint(commitment) {
  const words = commitment
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 3);

  return words.length ? words.join("|") : "done|sent|completed|finished";
}
