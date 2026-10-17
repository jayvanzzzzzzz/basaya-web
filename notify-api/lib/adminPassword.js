import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Admin password changes wait for approval by email
// (api/request-admin-password-change → api/confirm-admin-password-change).
// While a change waits, the new password is kept in Firestore encrypted with
// PASSWORD_CHANGE_SECRET (a Vercel environment variable), never as plain text.
// The collection has no Firestore rule, so only this server can read it.

export const COLLECTION = "adminPasswordChanges";
export const EXPIRES_MINUTES = 30;

function key() {
  const secret = process.env.PASSWORD_CHANGE_SECRET || "";
  if (secret.length < 32) throw new Error("PASSWORD_CHANGE_SECRET is not set (32+ characters)");
  return createHash("sha256").update(secret).digest();
}

/** A new one-time token for the email link (only its hash is stored). */
export const newToken = () => randomBytes(32).toString("base64url");

/** The Firestore doc id for a token. */
export const tokenId = (token) => createHash("sha256").update(token).digest("hex");

/** Password → { iv, tag, data } (AES-256-GCM, base64). */
export function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function decrypt({ iv, tag, data }) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Same rule as the website (js/password-rules.js): 8+ characters, a–z, A–Z, 0–9. */
export const isStrongPassword = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 128 &&
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /\d/.test(value);
