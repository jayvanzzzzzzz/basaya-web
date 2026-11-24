import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';

export const CONTACT_COOLDOWN_MS = 60 * 60 * 1000;
const limitRef = (db, uid) => db.doc(`contactAccountLimits/${uid}`);
export async function contactRetryAt(db, uid) {
  return (await limitRef(db, uid).get()).get('retryAt') || 0;
}
// Reserve atomically before sending so concurrent tabs/devices cannot send twice.
export async function reserveContact(db, uid, now = Date.now()) {
  return db.runTransaction(async tx => {
    const ref=limitRef(db,uid),snapshot=await tx.get(ref);
    const retryAt=snapshot.get('retryAt') || 0;
    if(retryAt>now)return {allowed:false,retryAt};
    const claimId=randomUUID(),next=now+CONTACT_COOLDOWN_MS;
    tx.set(ref,{claimId,retryAt:next,expiresAt:Timestamp.fromMillis(next)});
    return {allowed:true,claimId,retryAt:next};
  });
}
// A failed delivery must not consume the account's hour or release a newer claim.
export async function releaseContact(db,uid,claimId) {
  return db.runTransaction(async tx => {
    const ref=limitRef(db,uid),snapshot=await tx.get(ref);
    if(snapshot.get('claimId')===claimId)tx.delete(ref);
  });
}
