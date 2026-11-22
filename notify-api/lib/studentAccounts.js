import { randomUUID } from "node:crypto";
import { normalizeUsername, validUsername } from "./usernames.js";

const problem = (message, status = 400) => Object.assign(new Error(message), { status });
export function studentDetails(body = {}) {
  const details = {};
  for (const field of ["firstName", "middleName", "lastName"]) {
    details[field] = typeof body[field] === "string" ? body[field].trim() : "";
    if (details[field].length > 100) throw problem("Names must be at most 100 characters.");
  }
  if (!details.firstName || !details.lastName) throw problem("Enter the student's first and last name.");
  details.lrn = typeof body.lrn === "string" ? body.lrn.trim() : "";
  if (!/^\d{12}$/.test(details.lrn)) throw problem("LRN must contain exactly 12 digits.");
  details.username = normalizeUsername(body.username);
  if (!validUsername(details.username) || /^\d{12}$/.test(details.username)) throw problem("Use 3–30 letters, numbers, or underscores for the username; it cannot be a 12-digit number.");
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
    await firestore.runTransaction(async tx => {
      const usernameRef = firestore.doc(`usernames/${details.username}`);
      const lrnRef = firestore.doc(`learnerNumbers/${details.lrn}`);
      const username = await tx.get(usernameRef);
      const lrn = await tx.get(lrnRef);
      const legacyAlias = await tx.get(firestore.doc(`usernames/${details.lrn}`));
      if (username.exists) throw problem("That username is already taken.", 409);
      if (lrn.exists || legacyAlias.exists) throw problem("That LRN is already in use.", 409);
      tx.set(firestore.doc(`users/${uid}`), { uid, ...details, role: "student", email: "",
        dob: "", gender: "", createdBy: adminUid, createdAt: Date.now(), loginMethod: "lrn-username" });
      tx.set(usernameRef, { uid });
      tx.set(lrnRef, { uid });
    });
  } catch (error) {
    await authentication.deleteUser(uid);
    throw error;
  }
  return { uid, ...details };
}
