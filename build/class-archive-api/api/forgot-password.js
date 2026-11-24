import { adminAuth, db } from "../lib/firebase.js";
import { allowCors } from "../lib/http.js";
import { sendResetEmail } from "../lib/passwordReset.js";
import { withinRateLimit } from "../lib/rateLimit.js";

// POST /api/forgot-password
// Body: { email, website? }
//
// "Forgot password?" on the login page, and "Email me a reset link" in the admin's
// Account settings: emails the BaSaya-branded reset link instead of Firebase's plain one.
// Public, so it guards itself like /api/contact (CORS, honeypot, RATE_LIMIT per hour
// per IP in resetLimits/{hash of IP}). It answers the same whether or not the email
// has an account, so it can't be used to find out who is registered.

const RATE_LIMIT = 5;
const EMAIL_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const body = req.body || {};
    if (body.website) return res.status(200).json({ ok: true });

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: "That email doesn't look right." });

    if (!(await withinRateLimit(req, "resetLimits", RATE_LIMIT))) {
      return res.status(429).json({ error: "Too many tries. Wait a while, then try again." });
    }

    let user;
    try {
      user = await adminAuth().getUserByEmail(email);
    } catch (error) {
      if (error.code === "auth/user-not-found") return res.status(200).json({ ok: true });
      throw error;
    }

    const profile = await db().doc(`users/${user.uid}`).get();
    await sendResetEmail({
      email: user.email,
      name: profile.get("displayName") || user.displayName || "",
      role: profile.get("role") || null,
      requestedBy: "self",
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("forgot-password failed:", error);
    return res.status(500).json({ error: "Couldn't send the reset email. Try again later." });
  }
}
