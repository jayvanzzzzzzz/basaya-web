// Usernames are aliases; Firebase remains the password authority.
export const normalizeUsername = value => typeof value === "string" ? value.trim().toLowerCase() : "";
export const validUsername = value => /^[a-z0-9_]{3,30}$/.test(value);
export const invalidCredentials = () => Object.assign(new Error("Incorrect LRN, username, or password."), { status: 401 });

export async function verifyPassword(authentication, user, password, fetcher = fetch) {
  if (!user?.email || user.disabled || typeof password !== "string" || !password || password.length > 4096) throw invalidCredentials();
  // Public web API key, matching firebase-config.js. Override for another deployment.
  const key = process.env.FIREBASE_WEB_API_KEY || "AIzaSyBFE8RWovNDLZ1wIFaoNDzx-f3W6Gynl1I";
  const response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password, returnSecureToken: true }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (response.status === 403 || response.status >= 500) throw Object.assign(new Error("Password verification is temporarily unavailable. Please try again later."), { status: 503 });
  if (result.error?.message === "TOO_MANY_ATTEMPTS_TRY_LATER") throw Object.assign(new Error("Too many attempts. Please try again later."), { status: 429 });
  // Never bypass MFA, accept another uid, or expose Firebase's account lookup errors.
  if (!response.ok || result.localId !== user.uid || !result.idToken || result.mfaPendingCredential) throw invalidCredentials();
  const verified = await authentication.verifyIdToken(result.idToken, true);
  if (verified.uid !== user.uid) throw invalidCredentials();
}

export async function reserveUsername(firestore, uid, username) {
  if (/^\d{12}$/.test(username)) throw Object.assign(new Error("A username cannot be a 12-digit LRN."), { status: 400 });
  return firestore.runTransaction(async tx => {
    const profileRef = firestore.doc(`users/${uid}`);
    const nextRef = firestore.doc(`usernames/${username}`);
    const profile = await tx.get(profileRef);
    const next = await tx.get(nextRef);
    if (!["teacher", "admin"].includes(profile.get("role"))) throw Object.assign(new Error("Only teachers and admins can set a username."), { status: 403 });
    if (next.exists && next.get("uid") !== uid) throw Object.assign(new Error("That username is already taken."), { status: 409 });
    const old = normalizeUsername(profile.get("username"));
    const oldRef = old && old !== username && validUsername(old) ? firestore.doc(`usernames/${old}`) : null;
    const previous = oldRef ? await tx.get(oldRef) : null;
    if (previous?.get("uid") === uid) tx.delete(oldRef);
    tx.set(nextRef, { uid });
    tx.update(profileRef, { username });
    return username;
  });
}
