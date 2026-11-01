import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const allowed = (name) => /^(css\/|img\/)/.test(name) || ["audit/admissions-preview.html", "audit/admissions-preview-stubs.js", "teacher/views/joinRequests.js", "teacher/views/joinRequestsUi.js", "teacher/views/requestRibbons.js", "teacher/views/leaveRequests.js", "teacher/views/leaveRequestsUi.js", "teacher/views/studentRequestsBadge.js"].includes(name);
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "audit/admissions-preview.html";
    const target = path.resolve(root, name);
    if (!allowed(name) || !target.startsWith(path.resolve(root) + path.sep) || name.split(/[\\/]/).some((part) => part.startsWith("."))) { res.writeHead(404); res.end(); return; }
    const content = await readFile(target);
    res.writeHead(200, { "Content-Type": `${types[path.extname(name)] || "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-store" });
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(8786, "127.0.0.1", () => console.log("Approval design preview: http://127.0.0.1:8786/audit/admissions-preview.html"));
