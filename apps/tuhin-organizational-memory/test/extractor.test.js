import assert from "node:assert/strict";
import test from "node:test";
import { extractSignals } from "../server/extractor.js";

test("extracts strong decision and promise signals without treating questions as promises", () => {
  const transcript = [
    { start: 10, end: 20, speaker: "Maya", text: "Let's use PostgreSQL for launch." },
    { start: 21, end: 31, speaker: "Sarah", text: "I'll send the benchmark by Friday." },
    { start: 32, end: 40, speaker: "Tuhin", text: "Will we keep the fallback?" }
  ];
  const signals = extractSignals(transcript, "meeting-1");
  assert.equal(signals.decisions.length, 1);
  assert.equal(signals.promises.length, 1);
  assert.equal(signals.openQuestions.length, 1);
  assert.ok(signals.promises[0].confidence >= 0.75);
});

test("attaches nearby assumptions and disagreements to decisions", () => {
  const transcript = [
    { start: 10, end: 20, speaker: "Maya", text: "We should use MongoDB for launch." },
    { start: 21, end: 30, speaker: "Sarah", text: "I disagree because of operational risk." },
    { start: 31, end: 40, speaker: "Maya", text: "We assume write volume will spike." }
  ];
  const [decision] = extractSignals(transcript, "meeting-2").decisions;
  assert.equal(decision.disagreements.length, 1);
  assert.equal(decision.assumptions.length, 1);
});
