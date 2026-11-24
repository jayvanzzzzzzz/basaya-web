import { notifyApiUrl } from "../firebase-config.js";

export async function usernameRequest(action, body, user = null) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const response = await fetch(`${notifyApiUrl}/api/username-${action}`, {
    method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok && !result.username && !result.token) throw new Error("Username sign-in is temporarily unavailable. Please try again.");
  if (!response.ok) throw Object.assign(new Error(result.error || "Could not complete this request."), { status: response.status });
  return result;
}
