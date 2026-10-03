import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSegments } from "../server/pipeline.js";

test("normalizes transcript segments and preserves word timestamps", () => {
  const [segment] = normalizeSegments([{ start: "1", end: "2", speaker: "Maya", text: "Hello", words: [{ start: "1", end: "1.2", text: "Hello" }] }], "m1");
  assert.equal(segment.start, 1);
  assert.equal(segment.end, 2);
  assert.equal(segment.speaker, "Maya");
  assert.equal(segment.words[0].start, 1);
});
