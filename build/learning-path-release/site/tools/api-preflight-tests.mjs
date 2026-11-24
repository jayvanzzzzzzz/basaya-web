import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { allowCors } from "../notify-api/lib/http.js";
import handler from "../notify-api/api/class-membership.js";

const original = process.env.ALLOWED_ORIGINS;
const response = () => ({
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.code = code; return this; },
  end() { this.ended = true; },
});
try {
  delete process.env.ALLOWED_ORIGINS;
  for (const origin of ["http://localhost", "http://127.0.0.1"]) {
    const res = response();
    await handler({ method: "OPTIONS", query: { operation: "assessment" }, headers: { origin } }, res);
    assert.equal(res.code, 204);
    assert.equal(res.headers["Access-Control-Allow-Origin"], origin);
    assert.equal(res.headers["Access-Control-Allow-Headers"], "Authorization, Content-Type");
    assert.equal(res.headers.Vary, "Origin");
  }
  process.env.ALLOWED_ORIGINS = "https://basaya.onrender.com, http://localhost:8080";
  for (const origin of ["https://basaya.onrender.com", "http://localhost:8080", "https://untrusted.example", "http://localhost.evil.example"]) {
    const res = response();
    allowCors({ headers: { origin } }, res);
    assert.equal(res.headers["Access-Control-Allow-Origin"], origin.includes("example") ? undefined : origin);
  }
  const config = JSON.parse(await readFile(new URL("../notify-api/vercel.json", import.meta.url)));
  assert.ok(config.rewrites.some(rule => rule.source === "/api/assessment" && rule.destination === "/api/class-membership?operation=assessment"));
  console.log("Passed assessment route, localhost/configured CORS and untrusted-origin checks.");
} finally {
  if (original === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = original;
}
