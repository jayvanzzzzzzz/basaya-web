// Synthetic local UI fixture. No sign-in, production Firebase or speech requests.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const html = `<!doctype html><html lang="fil" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Quiz exit preview</title>
${["base/tokens", "base/reset", "base/typography", "base/animations", "components/buttons", "components/modal", "components/toast", "layout/student-shell", "pages/student-lesson"].map(css => `<link rel="stylesheet" href="/css/${css}.css">`).join("")}
</head><body data-portal="student"><div id="app-view" class="st-shell"><main id="page-content" class="st-content" style="width:min(100%,760px);margin:auto;padding:24px"></main></div><template id="modal-template"><div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><button class="modal-close" aria-label="Isara">×</button><div class="modal-content"></div></section></div></template><div id="toast" class="toast" role="status"></div>
<script type="module">import { renderRoute } from '/student/router.js'; window.addEventListener('hashchange',renderRoute); history.replaceState(null,'','#/lesson/preview'); renderRoute();</script></body></html>`;
const data = `export const student = { uid:'preview', profile:{classId:'preview',progressSession:'preview'} };
let answers={}, finished=false, attempt=0; window.quizFixture={resets:0};
export const availability=()=> 'open';
export const findLesson=async()=>({id:'preview',title:'Ang Ating Pamayanan',practice:false,quizFinished:finished});
export const loadLessonProgress=async()=>({lectureFinished:true,quizFinished:finished});
export const loadQuiz=async()=>({title:'Ang Ating Pamayanan',questions:[{question:'Sino ang tumutulong sa atin kapag tayo ay may sakit?',choices:['Guro','Doktor','Magsasaka'],correct:new Set(),multiple:false},{question:'Saan tayo bumibili ng mga sariwang gulay?',choices:['Palengke','Paaralan','Ospital'],correct:new Set(),multiple:false}]});
export const refreshSummary=()=>{}; export const resumeOf=()=>null; export const clearResume=()=>({}); export const saveResume=()=>{};
const resume=()=>({done:Object.keys(answers).length,total:2,answered:Object.keys(answers).map(Number),score:Object.entries(answers).filter(([q,a])=>a[0]===(+q===0?1:0)).length,missed:[]});
export const assessmentRequest=async(_id,op)=>{if(op==='begin')return{attemptId:String(attempt),resume:resume()};if(op==='abandon'){answers={};attempt++;window.quizFixture.resets++;return{abandoned:true}}};
export const submitAnswer=async(_id,_part,fields)=>{answers[fields.index]=fields.selected;return resume()};
export const saveProgress=async()=>{finished=true;return{score:resume().score,total:2,finished:true}};`;
const viewNames = { home: "renderHome", join: "renderJoin", lessonPath: "renderLessonPath", lecture: "renderLecture", game: "renderGame", activity: "renderActivity", pronunciation: "renderPronunciation", progress: "renderProgress", chat: "renderChat", notifications: "renderNotifications", account: "renderAccount", dictionary: "renderDictionary" };
const allowed = new Set(["js/helpers.js", "student/router.js", "student/ui.js", "student/quizExitDialog.js", "student/views/quiz.js"]);
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "");
    let content, type = "text/javascript";
    if (!name) { content = html; type = "text/html"; }
    else if (name === "student/data.js") content = data;
    else if (name === "js/state.js") content = "export const state={profile:{}}";
    else if (name === "fixture-firestore.js") content = "export const serverTimestamp=()=>null";
    else if (name === "student/views/results.js") content = "export function renderResults({score,total}){document.querySelector('#page-content').innerHTML='<h1>Natapos ang pagsusulit</h1><p>'+score+'/'+total+'</p><a href=\"#/lesson/preview\">Bumalik</a>'}";
    else if (name.startsWith("student/views/") && viewNames[path.basename(name, ".js")]) {
      const view = path.basename(name, ".js");
      content = `export async function ${viewNames[view]}(){document.querySelector('#page-content').innerHTML='<h1>Ang Ating Pamayanan</h1><p>Local preview • synthetic lesson</p><button class="button primary" id="open-quiz">Simulan ang pagsusulit</button>';document.querySelector('#open-quiz').onclick=()=>location.hash='/lesson/preview/quiz'};export const watchChatBadge=async()=>{};export const refreshBell=async()=>{};`;
    } else {
      const target = path.resolve(root, name);
      if (!target.startsWith(root) || name.split(/[\\/]/).some(p => p.startsWith(".")) || !(allowed.has(name) || name.startsWith("css/") || name.startsWith("img/"))) { res.writeHead(404); res.end(); return; }
      content = await readFile(target);
      type = name.endsWith(".css") ? "text/css" : name.endsWith(".png") ? "image/png" : "text/javascript";
      if (name === "student/views/quiz.js") content = content.toString().replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^\"]+/g, "/fixture-firestore.js");
    }
    res.writeHead(200, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store" }); res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(8791, "127.0.0.1", () => console.log("Synthetic quiz preview: http://127.0.0.1:8791"));
