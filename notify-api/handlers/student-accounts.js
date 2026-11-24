import { adminAuth, db } from "../lib/firebase.js";
import { allowCors, requireUser, requireAdmin, ID_PATTERN } from "../lib/http.js";
import { withinRateLimit } from "../lib/rateLimit.js";
import { createStudentAccount, assignStudentLrn } from "../lib/studentAccounts.js";
import { changeStudentAccess } from "../lib/studentAccess.js";

export default async function handler(req, res) {
  allowCors(req, res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-BASAya-Student-Accounts", "access-v1");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const uid = await requireUser(req, res);
    if (!uid || !await requireAdmin(uid, res)) return;
    const action = req.body?.action || "create";
    if (action === "assign-lrn") {
      const studentId = req.body?.studentId;
      if (typeof studentId !== "string" || !ID_PATTERN.test(studentId)) return res.status(400).json({ error: "Choose a valid student account." });
      if (!await withinRateLimit(req, "studentLrnLimits", 100)) return res.status(429).json({ error: "Too many requests. Please try again later." });
      return res.status(200).json(await assignStudentLrn(db(), uid, studentId, req.body?.lrn));
    }
    if (["deactivate", "reactivate"].includes(action)) {
      const ids = req.body?.studentIds;
      if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== "string" || !ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) {
        return res.status(400).json({ error: "Choose 1–50 unique student accounts." });
      }
      if (!await withinRateLimit(req, "studentAccessLimits", 200)) return res.status(429).json({ error: "Too many requests. Please try again later." });
      const results = new Array(ids.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, ids.length) }, async () => {
        while (next < ids.length) {
          const index = next++;
          try {
            results[index] = await changeStudentAccess(db(), adminAuth(), ids[index], action === "deactivate");
          } catch (error) {
            results[index] = { studentId: ids[index], ok: false, error: error.status ? error.message : "Could not update this account. Please retry." };
          }
        }
      }));
      return res.status(200).json({ results });
    }
    if (action !== "create") return res.status(400).json({ error: "Unknown student account action." });
    if (!await withinRateLimit(req, "studentCreationLimits", 40)) return res.status(429).json({ error: "Too many requests. Please try again later." });
    return res.status(201).json(await createStudentAccount(db(), adminAuth(), uid, req.body));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(503).json({ error: "Could not update the student account. Please try again." });
  }
}
