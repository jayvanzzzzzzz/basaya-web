import { randomUUID } from "node:crypto";
import { studentUsernameBase, availableStudentUsername } from "./studentUsernames.js";

const problem = (message, status = 400) => Object.assign(new Error(message), { status });

/** Reserve an additional sign-in identifier without changing existing credentials. */
export async function assignStudentLrn(firestore, adminUid, studentId, value) {
  const lrn = typeof value === "string" ? value.trim() : "";
  if (!/^\d{12}$/.test(lrn)) throw problem("LRN must contain exactly 12 digits.");
  return firestore.runTransaction(async tx => {
    const profileRef = firestore.doc(`users/${studentId}`);
    const lrnRef = firestore.doc(`learnerNumbers/${lrn}`);
    const profile = await tx.get(profileRef);
    if (!profile.exists || profile.get("role") !== "student") throw problem("Student account not found.", 404);
    const current = String(profile.get("lrn") || "").trim();
    if (current && current !== lrn) throw problem("This student already has an LRN. Refresh the student list.", 409);
    const reserved = await tx.get(lrnRef);
    const legacyAlias = await tx.get(firestore.doc(`usernames/${lrn}`));
    const existingProfiles = await tx.get(firestore.collection("users").where("lrn", "==", lrn));
    if ((reserved.exists && reserved.get("uid") !== studentId) ||
        (legacyAlias.exists && legacyAlias.get("uid") !== studentId) ||
        existingProfiles.docs.some(doc => doc.id !== studentId)) {
      throw problem("That LRN is already in use.", 409);
    }
    tx.set(lrnRef, { uid: studentId });
    tx.update(profileRef, { lrn, lrnAssignedBy: adminUid, lrnAssignedAt: Date.now() });
    return { studentId, lrn };
  });
}

export function studentDetails(body = {}) {
  const details = {};
  for (const field of ["firstName", "middleName", "lastName"]) {
    details[field] = typeof body[field] === "string" ? body[field].trim() : "";
    if (details[field].length > 100) throw problem("Names must be at most 100 characters.");
  }
  if (!details.firstName || !details.lastName) throw problem("Enter the student's first and last name.");
  details.lrn = typeof body.lrn === "string" ? body.lrn.trim() : "";
  if (!/^\d{12}$/.test(details.lrn)) throw problem("LRN must contain exactly 12 digits.");
  details.username = studentUsernameBase(details);
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) throw problem("The password must be 8–128 characters.");
  return details;
}

// Firebase verifies passwords using an internal address, never a student's inbox.
export async function createStudentAccount(firestore, authentication, adminUid, body) {
  const details = studentDetails(body);
  const uid = randomUUID();
  await authentication.createUser({ uid, email: `${uid}@students.basaya.invalid`, password: body.password,
    displayName: [details.firstName, details.middleName, details.lastName].filter(Boolean).join(" ") });
  try {
    details.username = await firestore.runTransaction(async tx => {
      const { username, ref: usernameRef } = await availableStudentUsername(firestore, tx, details.username, uid);
      const lrnRef = firestore.doc(`learnerNumbers/${details.lrn}`);
      const lrn = await tx.get(lrnRef);
      const legacyAlias = await tx.get(firestore.doc(`usernames/${details.lrn}`));
      if (lrn.exists || legacyAlias.exists) throw problem("That LRN is already in use.", 409);
      tx.set(firestore.doc(`users/${uid}`), { uid, ...details, username, role: "student", email: "",
        dob: "", gender: "", createdBy: adminUid, createdAt: Date.now(), loginMethod: "lrn-username" });
      tx.set(usernameRef, { uid });
      tx.set(lrnRef, { uid });
      return username;
    });
  } catch (error) {
    await authentication.deleteUser(uid);
    throw error;
  }
  return { uid, ...details };
}
