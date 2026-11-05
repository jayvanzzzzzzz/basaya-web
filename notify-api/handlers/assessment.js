import { db } from "../lib/firebase.js";
import { allowCors, requireUser } from "../lib/http.js";
import { AssessmentError, assessmentOperation } from "../lib/assessments.js";
import { submitSpeech } from "../lib/assessmentSpeech.js";
import { fluencyOperation } from "../lib/fluency.js";

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const result = req.body?.operation?.startsWith('fluency-')
      ? await fluencyOperation(db(), uid, req.body)
      : req.body?.operation === "speech"
      ? await submitSpeech(db(), uid, req.body, req.headers.authorization)
      : await assessmentOperation(db(), uid, req.body);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AssessmentError || [400, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
    console.error("assessment failed:", error);
    return res.status(500).json({ error: "Hindi na-save ang sagot. Subukan muli." });
  }
}
