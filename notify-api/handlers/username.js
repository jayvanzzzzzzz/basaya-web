import { adminAuth, db } from "../lib/firebase.js";
import { allowCors, requireToken } from "../lib/http.js";
import { withinRateLimit } from "../lib/rateLimit.js";
import { normalizeUsername, validUsername, invalidCredentials, verifyPassword, reserveUsername } from "../lib/usernames.js";

export default async function handler(req, res) {
  allowCors(req, res);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const saving = req.query?.operation === "username-save";
  try {
    const token = saving ? await requireToken(req, res) : null;
    if (saving && !token) return;
    if (!await withinRateLimit(req, saving ? "usernameSaveLimits" : "usernameLoginLimits", saving ? 20 : 100)) {
      return res.status(429).json({ error: "Too many attempts. Please try again later." });
    }
    const { password } = req.body || {};
    const username = normalizeUsername(req.body?.username);
    if (!validUsername(username)) {
      if (!saving) throw invalidCredentials();
      return res.status(400).json({ error: "Use 3–30 letters, numbers, or underscores." });
    }
    const firestore = db(), authentication = adminAuth();
    const alias = saving ? null : await firestore.doc(`usernames/${username}`).get();
    const uid = saving ? token.uid : alias.get("uid");
    if (typeof uid !== "string" || !uid || uid.includes("/")) throw invalidCredentials();
    const profile = await firestore.doc(`users/${uid}`).get();
    if (profile.get("role") !== "teacher" || (!saving && profile.get("username") !== username)) throw invalidCredentials();
    const user = await authentication.getUser(uid);
    await verifyPassword(authentication, user, password);
    if (saving) return res.status(200).json({ username: await reserveUsername(firestore, uid, username) });
    // Keep the same uid, roles, and existing account. No email is returned.
    return res.status(200).json({ token: await authentication.createCustomToken(uid) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (["auth/user-not-found", "auth/user-disabled", "auth/id-token-revoked"].includes(error.code)) return res.status(401).json({ error: "Incorrect username or password." });
    // Do not log credentials, identity responses, or tokens.
    return res.status(503).json({ error: "Could not complete this request. Please try again." });
  }
}
