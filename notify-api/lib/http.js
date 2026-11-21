import { teacherAccessReady } from "./teacherOnboarding.js";
import { adminAuth, db } from "./firebase.js";

// Shared by the API endpoints: CORS for the web portals, and who is calling.

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Allows the local XAMPP site plus deployed sites listed in ALLOWED_ORIGINS. */
export function allowCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && ["http://localhost", "http://127.0.0.1", ...allowed].includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

/** The caller's decoded Firebase ID token (uid, auth_time…), or null (401 sent). */
export async function requireToken(req, res, { allowPendingTeacher = false } = {}) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    if (!allowPendingTeacher) {
      const profile = await db().doc(`users/${decoded.uid}`).get();
      if (profile.get("role") === "teacher" && profile.get("emailVerificationRequired") === true &&
          !teacherAccessReady(profile.data(), await adminAuth().getUser(decoded.uid))) {
        res.status(403).json({ error: "Verify your email and finish setting your password before using teacher features." });
        return null;
      }
    }
    return decoded;
  } catch {
    res.status(401).json({ error: "Sign-in expired. Reload the page." });
    return null;
  }
}

/** The caller's uid from "Authorization: Bearer <Firebase ID token>", or null (401 sent). */
export async function requireUser(req, res) {
  return (await requireToken(req, res))?.uid ?? null;
}

/** True when users/{uid}.role is "admin"; otherwise sends 403. */
export async function requireAdmin(uid, res) {
  const profile = await db().doc(`users/${uid}`).get();
  if (profile.exists && profile.get("role") === "admin") return true;
  res.status(403).json({ error: "Only an admin can do this" });
  return false;
}
