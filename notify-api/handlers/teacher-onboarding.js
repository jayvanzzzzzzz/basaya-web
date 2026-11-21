import { adminAuth, db } from "../lib/firebase.js";
import { allowCors, requireToken, requireAdmin, ID_PATTERN } from "../lib/http.js";
import { sendMail } from "../lib/mailer.js";
import { teacherVerificationEmail } from "../lib/teacherVerificationEmail.js";
import { titleForGender, strongPassword } from "../lib/teacherOnboarding.js";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const site = (process.env.SITE_URL || "https://basaya.onrender.com").replace(/\/$/, "");
const fail = (status, message) => Object.assign(new Error(message), { status });

async function sendVerification(uid) {
  const ref = db().doc(`users/${uid}`);
  const user = await adminAuth().getUser(uid);
  if (user.emailVerified) return { email: user.email, alreadyVerified: true };
  // Reserve the cooldown transactionally so concurrent resend requests cannot flood the inbox.
  const profile = await db().runTransaction(async tx => {
    const profile = await tx.get(ref);
    if (Date.now() - (profile.get("verificationSentAt") || 0) < 60000)
      throw fail(429, "Please wait one minute before requesting another verification email.");
    tx.update(ref, { verificationSentAt: Date.now() });
    return profile.data();
  });
  try {
    const firebaseLink = await adminAuth().generateEmailVerificationLink(user.email);
    const code = new URL(firebaseLink).searchParams.get("oobCode");
    if (!code) throw new Error("Firebase did not return a verification action code.");
    const link = `${site}/verify-teacher.html?oobCode=${encodeURIComponent(code)}`;
    await sendMail({ to: user.email, ...teacherVerificationEmail({ name: profile.firstName || profile.displayName || user.displayName || "", email: user.email, link }) });
    return { email: user.email };
  } catch (error) {
    await ref.update({ verificationSentAt: 0 }).catch(() => {});
    throw error;
  }
}

export default async function handler(req, res) {
  allowCors(req, res);
  res.setHeader("X-BASAya-Teacher-Accounts", "deactivation-v2");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = await requireToken(req, res, { allowPendingTeacher: true });
    if (!token) return;
    const { action, userId, ...input } = req.body || {};
    if (["create", "statuses", "deactivate", "reactivate"].includes(action) && !await requireAdmin(token.uid, res)) return;
    if (["deactivate", "reactivate"].includes(action) && !userId) throw fail(400, "Choose a teacher account.");
    if (action === "create") {
      const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
      const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
      const middleName = input.middleName === undefined ? "" : typeof input.middleName === "string" ? input.middleName.trim() : null;
      const displayName = [firstName, middleName, lastName].filter(Boolean).join(" ");
      const email = typeof input.email === "string" ? input.email.trim() : "";
      const title = titleForGender(input.gender);
      if (!firstName || !lastName || middleName === null || [firstName, lastName, middleName].some(part => part.length > 80) || !title || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          typeof input.password !== "string" || input.password.length < 8 || input.password.length > 128)
        throw fail(400, "Enter first and last names (up to 80 characters each), gender, a valid email and a temporary password of 8–128 characters. Middle name is optional.");
      const user = await adminAuth().createUser({ displayName, email, password: input.password, emailVerified: false });
      try {
        const salt = randomBytes(16).toString("hex");
        const batch = db().batch();
        batch.set(db().doc(`teacherInvitations/${user.uid}`), { salt, passwordHash: scryptSync(input.password, salt, 32).toString("hex") });
        batch.set(db().doc(`users/${user.uid}`), { role: "teacher", firstName, lastName, middleName, displayName, gender: input.gender, title,
          email: user.email, emailVerificationRequired: true, mustChangePassword: true, createdAt: new Date() });
        await batch.commit();
      } catch (error) {
        await adminAuth().deleteUser(user.uid);
        throw error;
      }
      // Account creation is successful even if the email service fails.
      let emailSent = false;
      try { await sendVerification(user.uid); emailSent = true; } catch { /* Admin can retry from the directory. */ }
      return res.status(200).json({ ok: true, userId: user.uid, email: user.email, emailSent });
    }
    if (action === "statuses") {
      if (!Array.isArray(input.userIds) || input.userIds.length > 100 || input.userIds.some(id => typeof id !== "string" || !ID_PATTERN.test(id)))
        throw fail(400, "Invalid account list.");
      const result = input.userIds.length ? await adminAuth().getUsers(input.userIds.map(uid => ({ uid }))) : { users: [] };
      return res.status(200).json({ users: result.users.map(u => ({ uid: u.uid, emailVerified: u.emailVerified, disabled: u.disabled === true })) });
    }
    const target = userId || token.uid;
    if (typeof target !== "string" || !ID_PATTERN.test(target)) throw fail(400, "Invalid teacher account.");
    if (target !== token.uid && !await requireAdmin(token.uid, res)) return;
    const ref = db().doc(`users/${target}`);
    const profile = await ref.get();
    if (profile.get("role") !== "teacher") throw fail(404, "Teacher account not found.");
    if (action === "deactivate" || action === "reactivate") {
      const disabled = action === "deactivate";
      const user = await adminAuth().getUser(target);
      await adminAuth().updateUser(target, { disabled });
      try {
        await ref.update({ disabled });
      } catch (error) {
        // Keep Authentication and the profile consistent if the profile write fails.
        await adminAuth().updateUser(target, { disabled: user.disabled === true });
        throw error;
      }
      if (disabled) await adminAuth().revokeRefreshTokens(target);
      return res.status(200).json({ ok: true, userId: target, disabled });
    }
    if (action === "resend") return res.status(200).json({ ok: true, ...await sendVerification(target) });
    if (action === "complete" && target === token.uid) {
      const user = await adminAuth().getUser(target);
      if (!user.emailVerified) throw fail(403, "Verify your email before choosing your password.");
      if (!profile.get("mustChangePassword")) throw fail(400, "Your account setup is already complete.");
      if (Date.now() / 1000 - token.auth_time > 900) throw fail(401, "Sign in again before changing your temporary password.");
      if (!strongPassword(input.password)) throw fail(400, "Use 8–128 characters with a small letter, capital letter and number.");
      const invitation = await db().doc(`teacherInvitations/${target}`).get();
      if (!invitation.exists) throw fail(409, "Account setup information is unavailable. Ask your administrator for help.");
      if (timingSafeEqual(scryptSync(input.password, invitation.get("salt"), 32), Buffer.from(invitation.get("passwordHash"), "hex")))
        throw fail(400, "Choose a password different from your temporary password.");
      await adminAuth().updateUser(target, { password: input.password });
      const batch = db().batch();
      batch.update(ref, { mustChangePassword: false });
      batch.delete(invitation.ref);
      await batch.commit();
      return res.status(200).json({ ok: true });
    }
    throw fail(400, "Unknown teacher account action.");
  } catch (error) {
    const message = { "auth/email-already-exists": "An account with this email already exists.", "auth/invalid-email": "Enter a valid email address." }[error.code];
    return res.status(error.status || (message ? 400 : 500)).json({ error: message || (error.status ? error.message : "Couldn't complete this request. Please try again.") });
  }
}
