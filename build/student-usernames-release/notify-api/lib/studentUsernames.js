const problem = message => Object.assign(new Error(message), { status: 400 });
export const studentNamePart = value => String(value || "").normalize("NFKD")
  .replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function studentUsernameBase(profile) {
  const first = studentNamePart(profile.firstName);
  const last = studentNamePart(profile.lastName);
  if (!first || !last) throw problem("The student needs a first and last name before a username can be assigned.");
  return `${last}.${first}`;
}

// Call before any transaction writes. Conflicting reservations receive a numeric suffix.
export async function availableStudentUsername(firestore, tx, base, uid) {
  for (let suffix = 1; suffix <= 10000; suffix++) {
    const username = `${base}${suffix === 1 ? "" : suffix}`;
    const ref = firestore.doc(`usernames/${username}`);
    const alias = await tx.get(ref);
    if (!alias.exists || alias.get("uid") === uid) return { username, ref };
  }
  throw problem("Could not assign a unique username. Please contact support.");
}

export async function assignStudentUsername(firestore, studentId) {
  return firestore.runTransaction(async tx => {
    const ref = firestore.doc(`users/${studentId}`);
    const profile = await tx.get(ref);
    if (!profile.exists || profile.get("role") !== "student") throw problem("Student account not found.");
    const base = studentUsernameBase(profile.data());
    const old = profile.get("username");
    // Keep an existing valid suffix on reruns so duplicate names never swap usernames.
    const suffix = typeof old === "string" && old.startsWith(base) ? old.slice(base.length) : "";
    const keep = old === base || (/^[2-9]\d*$|^1\d+$/.test(suffix) && Number(suffix) <= 10000);
    const next = await availableStudentUsername(firestore, tx, keep ? old : base, studentId);
    const oldRef = typeof old === "string" && old !== next.username && /^[a-z0-9_.]{3,210}$/.test(old)
      ? firestore.doc(`usernames/${old}`) : null;
    const previous = oldRef ? await tx.get(oldRef) : null;
    if (previous?.get("uid") === studentId) tx.delete(oldRef);
    tx.set(next.ref, { uid: studentId });
    tx.update(ref, { username: next.username });
    return { studentId, username: next.username, previousUsername: old || null };
  });
}
