const fs = require('node:fs');
function edit(path, fn) { const s = fs.readFileSync(path, 'utf8'); fs.writeFileSync(path, fn(s)); }
edit('admin/views/dashboard.js', s => s.replace('const classes = ok(1) ? state.allClasses : [];', 'const classes = ok(1) ? state.allClasses.filter(c => c.archived !== true) : [];').replace('const names = new Map(teachers.map', 'const names = new Map(teachers.filter(t => t.disabled !== true).map').split('\n').filter(line => !line.includes('const requests = classes.filter') && !line.includes('...requests.map')).join('\n').replace("'classes', 'Classes'", "'classes', 'Active classes'").replace('No class deletion requests or classes awaiting a teacher.', 'No active classes awaiting a teacher.').replace("'Newest classrooms'", "'Newest active classrooms'"));
edit('student/router.js', s => s.replace('<a class="button primary" href="#/chat">Makipag-ugnayan sa guro</a></section>', '<a class="button primary" href="#/chat">Makipag-ugnayan sa guro</a>${student.classroom.archived ? \'<a class="button secondary" href="#/account">Humiling na umalis sa klase</a>\' : ""}</section>'));
fs.writeFileSync('notify-api/api/delete-class.js', `import { allowCors, requireUser, requireAdmin } from "../lib/http.js";

// Retired: classes now use the authenticated archive/restore lifecycle.
export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const uid = await requireUser(req, res);
  if (!uid || !await requireAdmin(uid, res)) return;
  return res.status(410).json({ error: "Class deletion is no longer available. Archive the class instead." });
}
`);
edit('js/api.js', s => s.replace(/export const deleteClass = .*\r?\n/, ''));
fs.writeFileSync('admin/views/classDeletion.js', '// Class deletion is retired. Admin Classes uses classLifecycle archive/restore.\n');
fs.appendFileSync('css/pages/admin-editorial.css', `
/* Class lifecycle ribbon uses the existing light and dark theme tokens. */
body[data-portal="admin"] .admin-class-status { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .35rem; max-width: 520px; margin: 0 0 1.5rem; padding: .35rem; border: 1px solid var(--border-strong); border-radius: 11px; background: var(--admin-tint); }
body[data-portal="admin"] .admin-class-status button { display: flex; justify-content: center; align-items: center; gap: .6rem; min-height: 48px; padding: .55rem .7rem; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--ink-2); font: 600 .8rem/1.3 var(--font-body); cursor: pointer; transition: background-color 180ms, color 180ms; }
body[data-portal="admin"] .admin-class-status button:hover { background: var(--primary-soft); color: var(--primary); }
body[data-portal="admin"] .admin-class-status button[aria-pressed="true"] { background: var(--admin-action); color: var(--admin-action-ink); border-color: var(--admin-action); }
body[data-portal="admin"] .admin-class-status button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
body[data-portal="admin"] .admin-class-status__count { min-width: 24px; padding: .15rem .3rem; border-radius: 5px; background: color-mix(in srgb,currentColor 10%,transparent); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { body[data-portal="admin"] .admin-class-status button { transition: none; } }
`);
