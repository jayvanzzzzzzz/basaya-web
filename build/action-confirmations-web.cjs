const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function edit(file,fn){const p=path.join(root,file),s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,fn(s));}
function replace(s,a,b){if(!s.includes(a))throw Error('Missing anchor: '+a);return s.replace(a,b);}
for(const file of ['index.html','register.html','complete-profile.html','reset-password.html','admin/index.html','teacher/index.html','student/index.html']){
 const prefix=file.includes('/')?'../':'';
 edit(file,s=>replace(s,'</head>',`    <link rel="stylesheet" href="${prefix}css/components/action-confirmation.css" />\n    <script type="module" src="${prefix}js/action-confirmation.js"></script>\n  </head>`));
}
const sources=['admin/views/lessons.js','admin/views/teachers.js','admin/views/students.js','teacher/views/dictionary.js','teacher/views/joinRequests.js','teacher/views/classPage.js','teacher/views/messages.js','student/views/home.js'];
for(const file of sources)edit(file,s=>`import { confirmAction } from "../../js/action-confirmation.js";\n`+s);
edit('admin/views/lessons.js',s=>replace(s,"      form.dataset.saving = 'true';",`      if (!await confirmAction({ title: existing ? 'Save lesson changes?' : 'Publish this lesson?', message: existing ? 'Apply your changes to the lesson and its learning activities.' : 'Add this lesson to the library so teachers can assign it to classes.', confirm: existing ? 'Save changes' : 'Publish lesson' })) return;\n      if (!form.isConnected) return;\n      form.dataset.saving = 'true';`));
edit('teacher/views/dictionary.js',s=>{
 s=replace(s,'!confirm(', '!await confirmAction({ title: "Change word spelling?", confirm: "Change spelling", message:');
 s=replace(s,"won't show its meaning.`,\n            )", "won't show its meaning.`,\n            })");
 return replace(s,'          // The automatic split',`          if (!renaming && !await confirmAction({ title: editing ? 'Save word changes?' : 'Add this word?', message: 'Update the dictionary entry that students can look up.', confirm: editing ? 'Save changes' : 'Add word' })) return;\n          if (!form.isConnected) return;\n          // The automatic split`);
});
edit('teacher/views/joinRequests.js',s=>replace(s,'    if (busy || !items.length) return;',`    if (busy || !items.length) return;\n    if (!await confirmAction({ title: action === 'approve' ? 'Approve join requests?' : 'Decline join requests?', message: action === 'approve' ? items.length + ' selected student(s) will gain access to this class.' : items.length + ' selected request(s) will be declined. Students can request to join again.', confirm: action === 'approve' ? 'Approve requests' : 'Decline requests' })) return;\n    if (!active || busy) return;`));
edit('teacher/views/classPage.js',s=>replace(s,'      if (!found) return;\n      b.disabled = true;',`      if (!found) return;\n      if (!await confirmAction({ title: 'Notify students?', message: 'Send a notification about this lesson to the students in this class.', confirm: 'Notify students' })) return;\n      if (!b.isConnected) return;\n      b.disabled = true;`));
edit('teacher/views/messages.js',s=>{
 s=replace(s,'confirmLabel: "Confirm delete for everyone", ', '');
 return replace(s,'      await removeMessage(classId, message, summary);',`      if (!await confirmAction({ title: 'Delete this message?', message: 'This message will be removed for everyone in the class conversation.', confirm: 'Delete message', danger: true })) return;\n      await removeMessage(classId, message, summary);`);
});
for(const [file,anchor,title,message] of [
 ['admin/views/teachers.js','  const sending = notify({','Send password reset link?','Email this teacher a link to choose a new password.'],
 ['admin/views/students.js','  const sending = notify({','Send password reset link?','Email this student a link to choose a new password.'],
])edit(file,s=>replace(s,anchor,`  if (!await confirmAction({ title: '${title}', message: '${message}', confirm: 'Send reset link' })) return;\n`+anchor));
edit('student/views/home.js',s=>replace(s,'        removingDownloads.add(id);',`        if (!await confirmAction({ title: 'Alisin ang na-download na aralin?', message: 'Kailangan mo ng internet para i-download muli ang araling ito. Mananatili ang iyong mga resulta.', confirm: 'Alisin', danger: true, student: true })) return;\n        if (!active) return;\n        removingDownloads.add(id);`));
console.log('Website confirmation integration applied.');
