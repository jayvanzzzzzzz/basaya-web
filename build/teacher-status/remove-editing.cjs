const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
function edit(file,change){const p=path.join(root,file),s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');const next=change(s);if(next===s)throw Error('No change '+file);fs.writeFileSync(p,next);}
edit('admin/views/teachers.js',s=>{
 const start=s.indexOf('  document.querySelectorAll("[data-correct-email]")');
 const end=s.indexOf('\n}\n\nfunction closeTeacherMenus',start);
 if(start<0||end<0)throw Error('Email correction block missing');
 s=s.slice(0,start)+s.slice(end);
 const editStart=s.indexOf('function openEditTeacherModal(');
 const editEnd=s.indexOf('/** Sends the BaSaya-branded reset email',editStart);
 if(editStart<0||editEnd<0)throw Error('Edit form missing');
 return s.slice(0,editStart)+s.slice(editEnd);
});
edit('notify-api/handlers/teacher-onboarding.js',s=>{
 const start=s.indexOf('    if (action === "correct-email") {');
 const end=s.indexOf('    if (action === "resend")',start);
 if(start<0||end<0)throw Error('Correction action missing');
 return s.slice(0,start)+s.slice(end);
});
edit('js/handbookHelp.js',s=>{
 s=s.replace('2026-11-19-staff-workflows-v1','2026-11-21-teacher-access-v2');
 s=s.replace('Correct pending email fixes a mistyped unverified address and sends a new link. ', 'Admin cannot edit existing teacher names, gender, title or email. Teachers maintain their own profile in Account settings. ');
 s=s.replace('Removing a teacher also offers moving their classes to a replacement.', 'Deactivating a teacher keeps their class assignments; reassign a class separately only if needed.');
 const entries={
 'edit-teacher':['Teacher profile permissions','Can admin edit a teacher’s details?', 'Admins cannot edit an existing teacher’s name, gender, title or email. There is no Edit details or Correct pending email action in Teacher accounts. Ask the teacher to update their own profile in Account settings. Admin can create teacher accounts, resend verification emails, send password reset links, deactivate access and reactivate accounts. Never share passwords in AI Chat Support.', 'edit teacher|rename teacher|teacher title|teacher email|baguhin guro|pangalan teacher|change teacher details'],
 'remove-teacher':['Deactivate or reactivate a teacher','How do I deactivate a teacher?', 'Open Teacher accounts, find the teacher, open their Actions menu and choose Deactivate teacher. Review the confirmation and confirm Deactivate teacher. This blocks sign-in and signs them out while preserving their account, classes, lessons and student records, including class assignments. It does not delete the teacher or unassign classes. To restore access, open the same menu and choose Reactivate teacher, then confirm. Existing email-verification and password-setup requirements still apply. AI can explain the steps but cannot change account status.', 'deactivate teacher|deactivated teacher|reactivate teacher|activate teacher|disable teacher|enable teacher|remove teacher|delete teacher|revoke teacher|alisin guro|tanggalin teacher|ibalik guro|i-deactivate guro'],
 'teacher-status':['Teacher account status filters','How do I filter Active and Deactivated teachers?', 'Open Teacher accounts. Use the All, Active and Deactivated ribbon filters above the table; each shows a count. Search by teacher name works together with the selected status and pagination. Active has a pulsing green indicator and means sign-in is enabled; pending verification or password setup may still be required. Deactivated has a pulsing orange indicator and means sign-in is blocked. On narrow screens the status appears below the teacher’s name. When reduced motion is enabled, indicators stay steady.', 'teacher status|active teacher|deactivated teacher|filter teachers|all active deactivated|green dot|orange dot|pulsing indicator|status guro']
 };
 for(const [id,[title,question,text,keywords]] of Object.entries(entries)) {
  const line='    entry('+[id,title,'/teachers',question,text,keywords].map(v=>JSON.stringify(v)).join(', ')+'),';
  if(id==='teacher-status')s=s.replace(/^(    entry\("remove-teacher"[^\n]+)$/m,'$1\n'+line);
  else s=s.replace(new RegExp('^    entry\\("'+id+'"[^\\n]+','m'),line);
 }
 return s;
});
