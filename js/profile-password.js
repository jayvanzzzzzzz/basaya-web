import { EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Confirm the account password on every profile save. Never store it in a profile.
export async function verifyProfilePassword(user, field) {
  const password = field.value;
  try {
    if (!user?.email) throw new Error("Your account has no sign-in email.");
    if (!password) throw Object.assign(new Error("Enter your current password."), { code: "auth/missing-password" });
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    await user.getIdToken(true);
  } finally {
    field.value = "";
    field.type = "password";
    const toggle = field.parentElement.querySelector('button');
    toggle?.setAttribute('aria-pressed', 'false');
    toggle?.setAttribute('aria-label', 'Show current password');
  }
}

export function profilePasswordError(error) {
  if (["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials"].includes(error.code)) return "That isn't your current password. Check it and try again.";
  if (error.code === "auth/missing-password") return "Enter your current password to save your profile.";
  if (error.code === "auth/too-many-requests") return "Too many tries. Wait a few minutes and try again.";
  return "";
}
