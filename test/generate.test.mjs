// Tests for netlify/functions/generate.mts.
// Run with: npm test  (node --experimental-strip-types --test test/*.test.mjs)
// The Netlify runtime globals (Netlify.env) and fetch are stubbed so the
// function's gating logic runs with no network and no real keys.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const env = new Map();
globalThis.Netlify = { env: { get: (k) => env.get(k) } };

let calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({ ok: true, echo: init.body ? JSON.parse(init.body) : null }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};

const { default: handler } = await import("../netlify/functions/generate.mts");

const post = (body, pass = "right") =>
  handler(new Request("https://relay.test/generate", {
    method: "POST",
    headers: pass === null ? {} : { "x-relay-pass": pass },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), {});

beforeEach(() => {
  env.clear();
  env.set("RELAY_PASS", "right");
  env.set("FAL_KEY", "fal-test-key");
  calls = [];
});

test("rejects non-POST", async () => {
  const r = await handler(new Request("https://relay.test/generate", { method: "GET" }), {});
  assert.equal(r.status, 405);
});

test("401 on missing or wrong passphrase; fal never called", async () => {
  assert.equal((await post({ action: "submit" }, null)).status, 401);
  assert.equal((await post({ action: "submit" }, "wrong")).status, 401);
  assert.equal(calls.length, 0);
});

test("500 when FAL_KEY is not configured", async () => {
  env.delete("FAL_KEY");
  assert.equal((await post({ action: "submit" })).status, 500);
});

test("400 on malformed JSON", async () => {
  assert.equal((await post("{not json")).status, 400);
});

test("400 on unknown action", async () => {
  assert.equal((await post({ action: "dance" })).status, 400);
});

test("submit forwards to queue.fal.run with the fal key and strips control keys", async () => {
  const r = await post({ action: "submit", model: "fal-ai/flux/dev", prompt: "a fox", url: "junk", extra: 1 });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://queue.fal.run/fal-ai/flux/dev");
  assert.equal(calls[0].init.headers.Authorization, "Key fal-test-key");
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.action, undefined);
  assert.equal(sent.url, undefined);
  assert.equal(sent.model, undefined);
  assert.equal(sent.extra, 1);
});

test("submit injects text-to-image defaults only for from-scratch generation", async () => {
  await post({ action: "submit", prompt: "a fox" });
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.image_size, { width: 1024, height: 1024 });
  assert.equal(sent.num_inference_steps, 30);
  assert.equal(sent.guidance_scale, 3.5);
});

test("submit leaves image-operation payloads untouched", async () => {
  await post({ action: "submit", model: "fal-ai/esrgan", image_url: "https://x/y.png", scale: 2 });
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.image_size, undefined);
  assert.equal(sent.num_inference_steps, undefined);
  assert.equal(sent.prompt, undefined);
  assert.equal(sent.scale, 2);
});

test("versioned model ids with dots are accepted, not swapped for the default", async () => {
  await post({ action: "submit", model: "xai/grok-imagine-image/v2.0/text-to-image", prompt: "x" });
  assert.equal(calls[0].url, "https://queue.fal.run/xai/grok-imagine-image/v2.0/text-to-image");
});

test("invalid model ids fall back to fal-ai/flux/dev", async () => {
  await post({ action: "submit", model: "Bad Model!/../etc", prompt: "x" });
  assert.equal(calls[0].url, "https://queue.fal.run/fal-ai/flux/dev");
  calls = [];
  await post({ action: "submit", model: 42, prompt: "x" });
  assert.equal(calls[0].url, "https://queue.fal.run/fal-ai/flux/dev");
});

test("ALLOWED_MODELS gates submit with 403 and never reaches fal", async () => {
  env.set("ALLOWED_MODELS", "fal-ai/flux-2-pro, fal-ai/esrgan");
  assert.equal((await post({ action: "submit", model: "fal-ai/flux/dev", prompt: "x" })).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await post({ action: "submit", model: "fal-ai/esrgan", image_url: "https://x/y.png" })).status, 200);
});

test("poll proxies only queue.fal.run URLs (SSRF guard)", async () => {
  assert.equal((await post({ action: "poll", url: "https://evil.example/steal" })).status, 400);
  assert.equal((await post({ action: "poll", url: "http://queue.fal.run/x" })).status, 400);
  assert.equal(calls.length, 0);
  const r = await post({ action: "poll", url: "https://queue.fal.run/fal-ai/flux/dev/requests/abc/status" });
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, "https://queue.fal.run/fal-ai/flux/dev/requests/abc/status");
  assert.equal(calls[0].init.headers.Authorization, "Key fal-test-key");
});
