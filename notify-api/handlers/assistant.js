import { adminAuth, db } from "../lib/firebase.js";
import { allowCors, requireToken } from "../lib/http.js";
import { AssistantError, createAssistant } from "../lib/assistant.js";

export default async function handler(req, res) {
  allowCors(req, res);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const token = await requireToken(req, res);
    if (!token) return;
    const uid = token.uid;
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
        Object.keys(req.body).some(key => !["action", "question"].includes(key)) ||
        (req.body.action !== undefined && !["status", "ask"].includes(req.body.action)))
      return res.status(400).json({ error: "Invalid assistant request" });
    // Trust Firebase Authentication, never the client-editable profile email.
    const debugEmail = "jayvanz1@gmail.com";
    let debugUid;
    if (token.email?.toLowerCase() === debugEmail) {
      const account = await adminAuth().getUser(uid);
      if (!account.disabled && account.email?.toLowerCase() === debugEmail) debugUid = uid;
    }
    const assistant = createAssistant({ firestore: db(), apiKey: process.env.GROQ_API_KEY, debugUid,
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b" });
    return res.status(200).json(await assistant(uid, req.body));
  } catch (error) {
    if (error instanceof AssistantError) {
      if (error.retryAt) res.setHeader("Retry-After", String(Math.max(1, Math.ceil((error.retryAt - Date.now()) / 1000))));
      return res.status(error.status).json({ error: error.message, code: error.code, retryAt: error.retryAt });
    }
    // Never log provider response bodies, questions, tokens or credentials.
    console.error("assistant failed", error?.name || "Error");
    return res.status(503).json({ error: "Hindi makasagot ang assistant ngayon. Gamitin muna ang mga gabay.", code: "unavailable" });
  }
}
