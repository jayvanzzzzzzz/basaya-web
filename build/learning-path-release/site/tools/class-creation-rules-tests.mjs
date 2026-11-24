import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Uses only the local emulator, synthetic users, and a demo project. No Firebase login.
// node tools/class-creation-rules-tests.mjs <java executable> <Firestore emulator jar>
const [java = "java", jar] = process.argv.slice(2);
assert.ok(jar, "Supply the cached Firestore emulator jar as the second argument.");
const rulesFile = new URL("../firestore.rules", import.meta.url);
const rules = await readFile(rulesFile, "utf8");
const { fileURLToPath } = await import("node:url");
const socket = net.createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const project = `demo-basaya-rules-${process.pid}`;
const base = `http://127.0.0.1:${port}`;
const documents = `${base}/v1/projects/${project}/databases/(default)/documents`;
let logs = "";
const emulator = spawn(java, ["-jar", jar, "--host", "127.0.0.1", "--port", String(port),
  "--project_id", project, "--rules", fileURLToPath(rulesFile)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
const exited = once(emulator, "exit");
for (const stream of [emulator.stdout, emulator.stderr]) stream.on("data", (chunk) => { logs = (logs + chunk).slice(-12000); });
emulator.on("error", (error) => { logs += String(error); });

function token(uid) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aud: project, iss: `https://securetoken.google.com/${project}`, sub: uid, user_id: uid,
    iat: now, exp: now + 3600, auth_time: now,
    firebase: { identities: {}, sign_in_provider: "custom" },
  })}.`;
}
async function write(path, values, authorization) {
  return fetch(`${documents}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { stringValue: value }])) }),
    signal: AbortSignal.timeout(10000),
  });
}
let checks = 0;
async function expect(label, response, status) {
  const body = await response.text();
  assert.equal(response.status, status, `${label}: ${body}`);
  checks++;
  console.log(`PASS: ${label}`);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (emulator.exitCode !== null) throw new Error(`Emulator exited. ${logs}`);
    try {
      const response = await fetch(`${base}/emulator/v1/projects/${project}:securityRules`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }),
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 200, `Rules failed to compile: ${await response.text()}`);
      ready = true;
      break;
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      await delay(250);
    }
  }
  assert.ok(ready, `Emulator did not become ready. ${logs}`);
  for (const [uid, role] of [["teacher-a", "teacher"], ["teacher-b", "teacher"], ["student", "student"], ["admin", "admin"], ["unknown", "unexpected"]]) {
    await expect(`seed ${role} profile`, await write(`users/${uid}`, { role }, "owner"), 200);
  }
  const cases = [
    ["anonymous cannot create", null, "anonymous", 403],
    ["student cannot create own class", "student", "student", 403],
    ["student cannot create for a teacher", "student", "teacher-a", 403],
    ["teacher can create own class", "teacher-a", "teacher-a", 200],
    ["teacher cannot create for another teacher", "teacher-a", "teacher-b", 403],
    ["admin cannot create own class", "admin", "admin", 403],
    ["admin cannot create for a teacher", "admin", "teacher-a", 403],
    ["missing profile cannot create", "missing", "missing", 403],
    ["unknown role cannot create", "unknown", "unknown", 403],
  ];
  for (const [index, [label, uid, teacherId, status]] of cases.entries()) {
    await expect(label, await write(`classes/case-${index}`, { teacherId, className: "Test class" }, uid ? token(uid) : null), status);
  }
  await expect("teacher cannot create without teacherId", await write("classes/no-owner", { className: "Test" }, token("teacher-a")), 403);
  await expect("teacher can still edit own class", await write("classes/case-3", { teacherId: "teacher-a", className: "Updated" }, token("teacher-a")), 200);
  await expect("student cannot edit teacher class", await write("classes/case-3", { teacherId: "teacher-a", className: "Blocked" }, token("student")), 403);
  await expect("admin can still reassign class", await write("classes/case-3", { teacherId: "teacher-b", className: "Reassigned" }, token("admin")), 200);
  console.log(`Class creation rules: ${checks - 5} authorization checks passed; 5 fixture writes passed.`);
} finally {
  emulator.kill();
  await exited;
}
