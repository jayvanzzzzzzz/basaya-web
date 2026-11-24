import { adminAuth, db } from "../lib/firebase.js";
import { allowCors } from "../lib/http.js";
import { COLLECTION, decrypt, tokenId } from "../lib/adminPassword.js";

// POST /api/confirm-admin-password-change
// Body: { token, action: "check" | "approve" | "cancel" }
//
// Called by confirm-password-change.html, the page the approval email links to.
// No sign-in: the one-time token from the email is the proof.
//   check    the request is still waiting → { email }
//   approve  sets the new password and signs the admin out on every device
//   cancel   throws the request away; the current password keeps working
// Approve and cancel use the token up, so a link works only once.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACTIONS = ["check", "approve", "cancel"];

class Gone extends Error {}

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { token, action } = req.body || {};
    if (!TOKEN_PATTERN.test(token || "") || !ACTIONS.includes(action)) {
      return res.status(400).json({ error: "This link is incomplete. Open it straight from the email." });
    }
    const ref = db().collection(COLLECTION).doc(tokenId(token));

    // Read and use up the request in one step, so a double click can't apply it twice.
    let request;
    try {
      request = await db().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new Gone();
        if (snapshot.get("expiresAt").toMillis() < Date.now()) {
          transaction.delete(ref);
          throw new Gone();
        }
        if (action !== "check") transaction.delete(ref);
        return snapshot.data();
      });
    } catch (error) {
      if (error instanceof Gone) {
        return res.status(410).json({ error: "This link has expired or was already used." });
      }
      throw error;
    }

    const { email } = await adminAuth().getUser(request.uid);
    if (action !== "approve") return res.status(200).json({ ok: true, email });

    const profile = await db().doc(`users/${request.uid}`).get();
    if (profile.get("role") !== "admin") {
      return res.status(403).json({ error: "This account is no longer an admin." });
    }
    await adminAuth().updateUser(request.uid, { password: decrypt(request.password) });
    await adminAuth().revokeRefreshTokens(request.uid);
    return res.status(200).json({ ok: true, email });
  } catch (error) {
    console.error("confirm-admin-password-change failed:", error);
    return res.status(500).json({ error: "Something went wrong. Ask for a new approval email from Account settings." });
  }
}
