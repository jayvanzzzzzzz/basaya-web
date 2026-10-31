import { adminAuth } from "./firebase.js";
import { passwordResetEmail } from "./emails.js";
import { sendMail } from "./mailer.js";

// Firebase makes the secure one-time code (valid 1 hour); the link opens our own page, reset-password.html on the website, which finishes the reset with it.

const SITE_URL = (process.env.SITE_URL || "https://basaya.onrender.com").replace(/\/$/, "");

/**
 * Emails the BaSaya-branded reset link.
 * @param {{ email: string, name?: string, role?: string, requestedBy?: "admin" | "self" }} input
 */
export async function sendResetEmail({ email, name = "", role, requestedBy }) {
  const firebaseLink = await adminAuth().generatePasswordResetLink(email);
  const oobCode = new URL(firebaseLink).searchParams.get("oobCode");
  const link = `${SITE_URL}/reset-password.html?oobCode=${encodeURIComponent(oobCode)}`;
  await sendMail({ to: email, ...passwordResetEmail({ name, email, link, role, requestedBy }) });
}
