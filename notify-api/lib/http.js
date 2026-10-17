import { adminAuth, db } from "./firebase.js";

// Shared by the API endpoints: CORS for the teacher site, and who is calling.

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Lets the teacher site (ALLOWED_ORIGINS) call the API from the browser. */
export function allowCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

/** The caller's decoded Firebase ID token (uid, auth_time…), or null (401 sent). */
export async function requireToken(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  try {
    return await adminAuth().verifyIdToken(token);
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
