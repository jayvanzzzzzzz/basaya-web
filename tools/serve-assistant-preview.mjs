// Local UI fixture only: uses synthetic answers, never Firebase or Groq.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
let html = await readFile(new URL("../student/index.html", import.meta.url), "utf8");
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  .replace('id="app-view" class="st-shell" hidden', 'id="app-view" class="st-shell"')
  .replace('id="loading-screen"', 'hidden id="loading-screen"')
  .replace("</body>", `<script type="module">import {renderAssistant} from '/student/views/assistant.js'; window.fixture={remaining:5,calls:0}; renderAssistant();</script></body>`);
export function previewServer() {
  return http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "");
      let source, type = "text/javascript";
      if (!name || name === "student/") { source = html; type = "text/html"; }
      else if (name === "student/data.js") source = "export const student={uid:'preview-student'}";
      else if (name === "js/state.js") source = "export const state={}";
      else if (name === "student/router.js") source = "export const onLeave=fn=>{window.fixture.cleanup=fn}";
      else if (name === "js/api.js") source = `export async function postToApi(_path,body){
        if(body.action==='status') return {available:true,unlimited:!!window.fixture.unlimited,remaining:window.fixture.remaining,resetAt:Date.now()+86400000,nextAllowedAt:0};
        window.fixture.calls++; window.fixture.lastQuestion=body.question;
        if(window.fixture.hold) await new Promise(r=>window.fixture.release=r);
        if(window.fixture.fail) throw Object.assign(new Error('Pansamantalang abala ang AI. Gamitin muna ang mga gabay.'),{code:'provider_limit',retryAt:Date.now()+60000});
        window.fixture.remaining--;return{answer:window.fixture.answer||'Buksan ang Sumali sa Klase, ilagay ang class code mula sa guro, at hintayin ang pag-apruba.',remaining:window.fixture.remaining,nextAllowedAt:Date.now()+10000,resetAt:Date.now()+86400000};}`;
      else {
        const allowed = /^(css\/|img\/)/.test(name) || ["js/helpers.js", "js/assistantHelp.js", "student/ui.js", "student/views/assistant.js", "manifest.webmanifest"].includes(name);
        const target = path.resolve(root, name);
        if (!allowed || !target.startsWith(root) || name.split(/[\\/]/).some(p => p.startsWith("."))) { res.writeHead(404); res.end(); return; }
        source = await readFile(target);
        type = ({ ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" })[path.extname(name)] || "text/javascript";
      }
      res.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" }); res.end(source);
    } catch { res.writeHead(404); res.end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) previewServer().listen(8794, "127.0.0.1", () => console.log("Synthetic assistant preview: http://127.0.0.1:8794/student/"));
