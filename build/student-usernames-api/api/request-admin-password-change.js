import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, db } from "../lib/firebase.js";
import { allowCors, requireAdmin, requireToken } from "../lib/http.js";
import { COLLECTION, EXPIRES_MINUTES, encrypt, isStrongPassword, newToken, tokenId } from "../lib/adminPassword.js";
import { adminPasswordChangeEmail } from "../lib/emails.js";
import { sendMail } from "../lib/mailer.js";

// POST /api/request-admin-password-change
// Headers: Authorization: Bearer <admin's Firebase ID token, right after re-entering the current password>
// Body:    { password }
//
// An admin's new password doesn't apply right away: it waits (encrypted, 30 minutes)
// until the admin clicks Approve in the email sent to their sign-in address.
// The link opens confirm-password-change.html, which calls confirm-admin-password-change.
// A new request replaces any older one that is still waiting.

const SITE_URL = (process.env.SITE_URL || "https://basaya.onrender.com").replace(/\/$/, "");
const RECENT_SIGN_IN_MS = 5 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const caller = await requireToken(req, res);
    if (!caller || !(await requireAdmin(caller.uid, res))) return;

    // The website re-checks the current password just before calling this.
    if (Date.now() - caller.auth_time * 1000 > RECENT_SIGN_IN_MS) {
      return res.status(401).json({ error: "Enter your current password again." });
    }

    const { password } = req.body || {};
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: "Use 8–128 characters with a small letter, a capital letter and a number." });
    }

    const { email, displayName } = await adminAuth().getUser(caller.uid);
    if (!email) return res.status(400).json({ error: "Your account has no email on file." });

    const changes = db().collection(COLLECTION);
    const waiting = await changes.where("uid", "==", caller.uid).get();
    const now = Date.now();
    if (waiting.docs.some((doc) => now - doc.get("createdAt").toMillis() < RESEND_AFTER_MS)) {
      return res.status(429).json({ error: "An approval email was just sent. Wait a minute before trying again." });
    }

    const token = newToken();
    const ref = changes.doc(tokenId(token));
    const batch = db().batch();
    waiting.docs.forEach((doc) => batch.delete(doc.ref));
    batch.set(ref, {
      uid: caller.uid,
      password: encrypt(password),
      createdAt: Timestamp.fromMillis(now),
      // Also lets a Firestore TTL policy clean up requests nobody answered.
      expiresAt: Timestamp.fromMillis(now + EXPIRES_MINUTES * 60 * 1000),
    });
    await batch.commit();

    const link = (action) =>
      `${SITE_URL}/confirm-password-change.html?token=${encodeURIComponent(token)}&action=${action}`;
    try {
      await sendMail({
        to: email,
        ...adminPasswordChangeEmail({
          name: displayName || "",
          email,
          approveLink: link("approve"),
          cancelLink: link("cancel"),
          requestedAt: new Date(now),
          minutes: EXPIRES_MINUTES,
        }),
      });
    } catch (error) {
      await ref.delete();
      throw error;
    }

    return res.status(200).json({ ok: true, email, minutes: EXPIRES_MINUTES });
  } catch (error) {
    console.error("request-admin-password-change failed:", error);
    return res.status(500).json({ error: "Couldn't send the approval email. Try again later." });
  }
}
