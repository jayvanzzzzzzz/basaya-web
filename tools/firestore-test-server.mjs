import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

export async function startFirestoreTestServer(java, jar) {
  assert.ok(jar, "Supply a Java executable and the cached Firestore emulator jar.");
  const server = net.createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const project = `demo-basaya-join-${process.pid}`;
  const base = `http://127.0.0.1:${port}`;
  const rulesFile = new URL("../firestore.rules", import.meta.url);
  let logs = "";
  const child = spawn(java, ["-jar", jar, "--host", "127.0.0.1", "--port", String(port), "--project_id", project, "--rules", fileURLToPath(rulesFile)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(child, "exit");
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs = (logs + chunk).slice(-10000); });
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) throw new Error(logs);
      try {
        const response = await fetch(`${base}/emulator/v1/projects/${project}:securityRules`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: await readFile(rulesFile, "utf8") }] } }), signal: AbortSignal.timeout(2000),
        });
        assert.equal(response.status, 200, await response.text());
        const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
        return {
          project, host: `127.0.0.1:${port}`, documents: `${base}/v1/projects/${project}/databases/(default)/documents`,
          token: (uid) => { const now = Math.floor(Date.now() / 1000); return `${encode({ alg: "none", typ: "JWT" })}.${encode({ aud: project, iss: `https://securetoken.google.com/${project}`, sub: uid, user_id: uid, iat: now, exp: now + 3600, auth_time: now, firebase: { identities: {}, sign_in_provider: "custom" } })}.`; },
          stop: async () => { child.kill(); await exited; },
        };
      } catch (error) { if (error.code === "ERR_ASSERTION") throw error; await delay(250); }
    }
    throw new Error(`Emulator startup timed out. ${logs}`);
  } catch (error) { child.kill(); await exited; throw error; }
}
