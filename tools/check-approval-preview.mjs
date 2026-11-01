import assert from "node:assert/strict";
for (const [path, expected] of [
  ["/audit/admissions-preview.html", 200],
  ["/teacher/views/joinRequests.js", 200],
  ["/teacher/views/joinRequestsUi.js", 200],
  ["/teacher/views/requestRibbons.js", 200],
  ["/teacher/views/leaveRequests.js", 200],
  ["/teacher/views/leaveRequestsUi.js", 200],
  ["/teacher/views/studentRequestsBadge.js", 200],
  ["/audit/admissions-preview-stubs.js", 200],
  ["/css/pages/class-admissions.css", 200],
  ["/.git/HEAD", 404],
  ["/notify-api/lib/firebase.js", 404],
]) {
  const response = await fetch(`http://127.0.0.1:8786${path}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, expected, path);
  console.log(`PASS: ${path} returns ${expected}`);
}
