import assert from "node:assert/strict";
import test from "node:test";
import { extractSignals } from "../server/extractor.js";
import { detectDecisionDrift } from "../server/drift.js";

test("extracts a decision and commitment with evidence", () => {
  const transcript = [
    { start: 10, end: 20, speaker: "Maya", text: "Let's use PostgreSQL for launch." },
    { start: 21, end: 31, speaker: "Sarah", text: "I'll send the benchmark by Friday." }
  ];
  const signals = extractSignals(transcript, "meeting-1");

  assert.equal(signals.decisions.length, 1);
  assert.equal(signals.promises.length, 1);
  assert.equal(signals.decisions[0].evidence[0], "meeting-1#10-20");
  assert.equal(signals.promises[0].evidence[0], "meeting-1#21-31");
});

test("detects a decision topic changing over time", () => {
  const decisions = [
    { id: "a", title: "Database architecture decision", decision: "MongoDB for launch" },
    { id: "b", title: "Database architecture decision", decision: "PostgreSQL for launch" }
  ];
  const drift = detectDecisionDrift(decisions);

  assert.equal(drift.length, 1);
  assert.equal(drift[0].previousDecisionId, "a");
  assert.equal(drift[0].newDecisionId, "b");
});
