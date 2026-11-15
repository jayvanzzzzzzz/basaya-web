import { db } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireUser } from "../lib/http.js";
import { MembershipError, reviewClassJoins } from "../lib/classMembership.js";
import { ProgressError } from "../lib/classProgress.js";

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const { classId, requests, action } = req.body || {};
    if (!ID_PATTERN.test(classId || "") || !["approve", "decline"].includes(action) || !Array.isArray(requests) || !requests.length || requests.length > 50 ||
      requests.some((item) => !item || !ID_PATTERN.test(item.studentId || "") || !ID_PATTERN.test(item.requestId || "") || (item.progressMode !== undefined && !["restore", "fresh"].includes(item.progressMode))) ||
      new Set(requests.map((item) => item.studentId)).size !== requests.length) {
      return res.status(400).json({ error: "Choose up to 50 valid requests and an approval action." });
    }
    return res.status(200).json(await reviewClassJoins(db(), uid, classId, requests, action));
  } catch (error) {
    if (error instanceof MembershipError || error instanceof ProgressError) return res.status(error.status).json({ error: error.message });
    console.error("review-join-requests failed:", error);
    return res.status(500).json({ error: "Some requests may already have been processed. Refresh the list before trying again." });
  }
}
