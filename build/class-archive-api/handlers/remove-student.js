import { db } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireUser } from "../lib/http.js";
import { archiveClassMember, ProgressError } from "../lib/classProgress.js";
import { changeEnrollment } from "../lib/enrollmentLifecycle.js";

// Teacher-only removal archives accepted results before removing active membership.
export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const { classId, studentId, action, requestKey } = req.body || {};
    if (!ID_PATTERN.test(classId || "") || !ID_PATTERN.test(studentId || "")) {
      return res.status(400).json({ error: "Invalid classId or studentId" });
    }
    if(action === "leave" && (typeof requestKey !== "string" || requestKey.length>200))return res.status(400).json({error:"A current leave request is required."});
    return res.status(200).json(await (action === "leave" ? archiveClassMember(db(), uid, classId, studentId, requestKey) : changeEnrollment(db(), uid, classId, studentId, "drop")));
  } catch (error) {
    if (error instanceof ProgressError) return res.status(error.status).json({ error: error.message });
    console.error("remove-student failed", error);
    return res.status(500).json({ error: "Could not confirm the removal. Refresh the roster before retrying; saved progress remains preserved." });
  }
}
