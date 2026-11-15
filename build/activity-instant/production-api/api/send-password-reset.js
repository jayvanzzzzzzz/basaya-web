import { adminAuth, db } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireAdmin, requireUser } from "../lib/http.js";
import { sendResetEmail } from "../lib/passwordReset.js";

// POST /api/send-password-reset
// Headers: Authorization: Bearer <admin's Firebase ID token>
// Body:    { userId }   (a teacher or student; the older { teacherId } still works)
//
// Replaces Firebase's plain reset email with a BaSaya-branded one
// (lib/passwordReset.js). For someone resetting their own, see forgot-password.

const RESETTABLE_ROLES = ["teacher", "student"];

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const uid = await requireUser(req, res);
    if (!uid || !(await requireAdmin(uid, res))) return;

    const { userId = req.body?.teacherId } = req.body || {};
    if (!ID_PATTERN.test(userId || "")) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const profile = await db().doc(`users/${userId}`).get();
    const role = profile.get("role");
    if (!profile.exists || !RESETTABLE_ROLES.includes(role)) {
      return res.status(404).json({ error: "Account not found" });
    }
    // The sign-in email is the one that counts (the profile copy could be stale).
    const { email } = await adminAuth().getUser(userId);
    if (!email) return res.status(400).json({ error: "This account has no email on file." });

    await sendResetEmail({ email, name: profile.get("displayName") || "", role, requestedBy: "admin" });
    return res.status(200).json({ ok: true, email });
  } catch (error) {
    console.error("send-password-reset failed:", error);
    return res.status(500).json({ error: "Couldn't send the reset email. Try again later." });
  }
}
