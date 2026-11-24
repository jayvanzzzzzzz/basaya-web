import assert from "node:assert/strict";
const url = "https://basaya-notify-api.vercel.app/api/assessment";
const [options, anonymous, unsupported] = await Promise.all([
  fetch(url, { method: "OPTIONS", headers: { Origin: "http://localhost", "Access-Control-Request-Method": "POST" }, signal: AbortSignal.timeout(20000) }),
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "prepare-activity", part: "activity" }), signal: AbortSignal.timeout(20000) }),
  fetch(url, { signal: AbortSignal.timeout(20000) }),
]);
assert.equal(options.status, 204);
assert.equal(options.headers.get("access-control-allow-origin"), "http://localhost");
assert.equal(anonymous.status, 401);
assert.equal(anonymous.headers.get("cache-control"), "no-store");
assert.equal((await anonymous.json()).error, "Not signed in");
assert.equal(unsupported.status, 405);
console.log("PASS: deployed assessment route supports preflight, requires sign-in, disables caching and rejects GET.");
