import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePromises } from "../server/promise-ledger.js";

test("marks a promise completed only when later evidence overlaps and contains a completion signal", () => {
  const promises = [{ id: "p1", meetingId: "m1", commitment: "send benchmark results to team", timestampEnd: 10, status: "open" }];
  const transcript = [{ meetingId: "m2", start: 20, end: 30, text: "I sent the benchmark results to the team yesterday." }];
  const [result] = reconcilePromises(promises, transcript);
  assert.equal(result.status, "completed");
  assert.equal(result.completionEvidence.length, 1);
});

test("does not mark unrelated later text as completion evidence", () => {
  const promises = [{ id: "p1", meetingId: "m1", commitment: "send benchmark results", timestampEnd: 10, status: "open" }];
  const transcript = [{ meetingId: "m2", start: 20, end: 30, text: "We discussed the product roadmap and pricing." }];
  const [result] = reconcilePromises(promises, transcript);
  assert.equal(result.status, "open");
});
