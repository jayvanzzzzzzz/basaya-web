import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./firebase.js";

// For the public endpoints (contact, forgot-password): at most `limit` calls per hour from one IP, counted in `collection`/{hash of IP}.

const HOUR_MS = 60 * 60 * 1000;

/** Records this call; false when the IP is already over the limit. */
export async function withinRateLimit(req, collection, limit) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  const ref = db().doc(`${collection}/${createHash("sha256").update(ip).digest("hex")}`);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const recent = (snap.get("sentAt") || [])
      .map((t) => t.toMillis())
      .filter((ms) => now - ms < HOUR_MS);
    if (recent.length >= limit) return false;
    tx.set(ref, {
      sentAt: [...recent, now].map((ms) => Timestamp.fromMillis(ms)),
      // Lets a Firestore TTL policy clean these up (optional).
      expiresAt: Timestamp.fromMillis(now + HOUR_MS),
    });
    return true;
  });
}
