import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MemoryStore } from "../server/storage.js";

test("migrates legacy data to schema v2 without losing meetings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decisiontrace-"));
  const file = path.join(dir, "memory.json");
  fs.writeFileSync(file, JSON.stringify({ meetings: [{ id: "m1" }], decisions: [] }));
  const store = new MemoryStore(dir);
  const data = store.getAll();
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.meetings.length, 1);
  assert.ok(Array.isArray(data.workflows));
});
