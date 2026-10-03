import assert from "node:assert/strict";
import test from "node:test";
import { WhipScribeClient, WhipScribeApiError } from "../server/whipscribe.js";

test("retries a transient provider error and returns the second response", async () => {
  let calls = 0;
  const client = new WhipScribeClient({
    apiKey: "test-key",
    maxRetries: 1,
    timeoutMs: 5000,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ code: "RATE_LIMITED", error: "slow down" }), { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  const result = await client.me();
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});

test("maps non-success responses into a stable API error", async () => {
  const client = new WhipScribeClient({
    apiKey: "test-key",
    maxRetries: 0,
    fetchImpl: async () => new Response(JSON.stringify({ code: "NO_CREDITS", error: "Insufficient credit" }), { status: 402 })
  });
  await assert.rejects(() => client.me(), (error) => error instanceof WhipScribeApiError && error.status === 402 && error.code === "NO_CREDITS");
});
