import { adminAuth, db } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireAdmin, requireUser } from "../lib/http.js";

// POST /api/set-temporary-password
// Headers: Authorization: Bearer <admin's Firebase ID token>
// Body:    { studentId, password }
//
// For a student who can't get the reset email (a fake or mistyped address): the
// admin picks a temporary password and tells the student, who can change it later
// in Profile → Change password. Signs the student out everywhere else.

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const uid = await requireUser(req, res);
    if (!uid || !(await requireAdmin(uid, res))) return;

    const { studentId, password } = req.body || {};
    if (!ID_PATTERN.test(studentId || "")) {
      return res.status(400).json({ error: "Invalid studentId" });
    }
    if (typeof password !== "string" || password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
      return res.status(400).json({ error: `The password must be ${MIN_LENGTH}–${MAX_LENGTH} characters.` });
    }

    const profile = await db().doc(`users/${studentId}`).get();
    if (!profile.exists || profile.get("role") !== "student") {
      return res.status(404).json({ error: "Student not found" });
    }

    await adminAuth().updateUser(studentId, { password });
    await adminAuth().revokeRefreshTokens(studentId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("set-temporary-password failed:", error);
    return res.status(500).json({ error: "Couldn't set the password. Try again later." });
  }
}
