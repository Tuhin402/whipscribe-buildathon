import assert from "node:assert/strict";
import test from "node:test";
import { detectDecisionDrift, markDecisionStatuses } from "../server/drift.js";

test("detects database decision drift and marks the earlier decision superseded", () => {
  const decisions = [
    { id: "a", title: "Database architecture decision", decision: "MongoDB for launch", createdAt: "2026-09-27" },
    { id: "b", title: "Database architecture decision", decision: "PostgreSQL for launch", createdAt: "2026-09-29" }
  ];
  const drift = detectDecisionDrift(decisions);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].previousDecisionId, "a");
  assert.equal(drift[0].newDecisionId, "b");
  assert.equal(markDecisionStatuses(decisions, drift)[0].status, "superseded");
});
