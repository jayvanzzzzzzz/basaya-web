// Display hints only. Firebase still verifies every sign-in; never persist credentials here.
const KEY = "basaya.recentAccounts.v1";
const text = (value, limit = 160) => typeof value === "string" ? value.trim().slice(0, limit) : "";

function accountHint(value) {
  if (!value || typeof value !== "object") return null;
  const uid = text(value.uid);
  const email = text(value.email, 254);
  if (!uid || !email) return null;
  const photoURL = text(value.photoURL, 2048);
  return { uid, email, name: text(value.name) || email.split("@")[0],
    photoURL: /^https:\/\//i.test(photoURL) ? photoURL : "",
    provider: value.provider === "google.com" ? "google.com" : "password" };
}

export function recentAccounts() {
  try {
    const values = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    return values.map(accountHint).filter((value) => {
      if (!value || seen.has(value.uid)) return false;
      seen.add(value.uid);
      return true;
    }).slice(0, 5);
  } catch { return []; }
}

function write(accounts) {
  try { localStorage.setItem(KEY, JSON.stringify(accounts)); return true; }
  catch { return false; }
}

export function rememberAccount(user, profile = {}) {
  if (!user) return false;
  const providers = user.providerData || [];
  const account = accountHint({ uid: user.uid, email: user.email,
    name: text(profile.displayName) || [profile.firstName, profile.middleName, profile.lastName].map((part) => text(part)).filter(Boolean).join(" ") || user.displayName,
    photoURL: user.photoURL,
    provider: providers.some(({ providerId }) => providerId === "password") ? "password"
      : providers.some(({ providerId }) => providerId === "google.com") ? "google.com" : "password" });
  if (!account) return false;
  return write([account, ...recentAccounts().filter(({ uid }) => uid !== account.uid)].slice(0, 5));
}

export function removeAccount(uid) {
  return write(recentAccounts().filter((account) => account.uid !== uid));
}
