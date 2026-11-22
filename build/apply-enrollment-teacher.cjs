const fs=require('fs');const edit=(p,f)=>{let s=fs.readFileSync(p,'utf8'),n=f(s);if(s===n)throw Error(p);fs.writeFileSync(p,n)};const rep=(s,a,b)=>{if(!s.includes(a))throw Error('Missing '+a.slice(0,100));return s.replace(a,b)};
edit('teacher/views/students.js',s=>{
s=rep(s,'import { removeStudent }','import { classLifecycle }');
s=rep(s,'const name = student.fullName || "Student";','const name = student.fullName || "Student";\n      const dropped=student.membershipStatus===\'dropped\';');
s=rep(s,'${student.leaveRequest ? \' roster-membership--pending\' : \'\'}','${dropped ? \' roster-membership--dropped\' : student.leaveRequest ? \' roster-membership--pending\' : \'\'}');
s=rep(s,"${student.leaveRequest ? 'Wants to leave' : 'Enrolled'}","${dropped ? 'Dropped' : student.leaveRequest ? 'Wants to leave' : 'Enrolled'}");
s=rep(s,"${studentAction('drop', 'Drop student', 'data-remove-student', student.id)}","${classroom.archived ? '' : studentAction(dropped ? 'student' : 'drop', dropped ? 'Re-enroll student' : 'Drop student', 'data-remove-student', student.id)}");
s=s.replaceAll('enrollmentSummary(classroom, students.length)','enrollmentSummary(classroom, students.filter(student=>student.membershipStatus!=="dropped").length)');
s=rep(s,'const name = student.fullName || "this student";','const name = student.fullName || "this student";\n  const reenroll=student.membershipStatus===\'dropped\', actionLabel=reenroll?\'Re-enroll student\':\'Drop student\';');
const start=s.indexOf('    `<div class="roster-removal">'),end=s.indexOf('     <p class="form-error" id="remove-student-error"',start);
s=s.slice(0,start)+`    \`<div class="roster-removal"><p class="eyebrow">Class membership</p><h2 id="roster-remove-title">\${reenroll ? 'Re-enroll' : 'Drop'} \${escapeHtml(name)}?</h2>
     <p>\${reenroll ? 'Restore participation in' : 'Pause participation in'} <strong>\${escapeHtml(classroom.className)}</strong>.</p>
     <ul class="remove-student__list"><li>Saved progress and scores stay preserved</li><li>\${reenroll ? 'The student resumes their saved work; deadlines passed while dropped stay exempt' : 'The student stays on this roster as Dropped and cannot access current or new lessons'}</li></ul>
     <p class="muted">\${reenroll ? 'Use an individual deadline extension when catch-up work is needed. Deactivated accounts must be reactivated by an admin first.' : 'Their account stays active. Monitoring and new deadline penalties pause until you re-enroll them.'}</p>
`+s.slice(end);
s=rep(s,'data-cancel>Keep student</button>','data-cancel>${reenroll ? "Cancel" : "Keep enrolled"}</button>');
s=rep(s,'data-confirm-remove>Drop student</button>','data-confirm-remove>${actionLabel}</button>');
s=rep(s,'confirmButton.textContent = "Dropping\u2026";','confirmButton.textContent = reenroll ? "Re-enrolling\u2026" : "Dropping\u2026";');
s=rep(s,'await removeStudent(classroom.id, student.id);','await classLifecycle(reenroll ? "reenroll" : "drop", classroom.id, student.id);');
s=rep(s,'toast(`${name} was dropped from the class. Their progress was archived.`);','toast(`${name} was ${reenroll ? "re-enrolled" : "marked as dropped"}. Saved progress is preserved.`);');
s=rep(s,"`Couldn't drop the student: ${error.message}.`","`Couldn't ${reenroll ? 're-enroll' : 'drop'} the student: ${error.message}.`");
s=rep(s,'confirmButton.textContent = "Drop student";','confirmButton.textContent = actionLabel;');return s});
edit('css/pages/students-editorial.css',s=>rep(s,".roster-membership::before { content:''; width:5px; height:5px; border-radius:50%; background:currentColor; flex-shrink:0; }",`.roster-membership::before { content:''; width:8px; height:8px; border-radius:50%; background:currentColor; flex-shrink:0; animation:roster-membership-pulse 1.8s ease-out infinite; }
.roster-membership--dropped { color:#b45309; }
[data-theme="dark"] .roster-membership--dropped { color:#ffb45f; }
@keyframes roster-membership-pulse { 0% { box-shadow:0 0 0 0 currentColor; } 70%,100% { box-shadow:0 0 0 6px transparent; } }
@media (prefers-reduced-motion:reduce) { .roster-membership::before { animation:none; } }`));
edit('teacher/views/progressData.js',s=>{
s=rep(s,'accountProfile:await getDoc','classroom:classSnap.data(),accountProfile:await getDoc');
s=rep(s,'lessonDeadline(lesson,roster,profile)','lessonDeadline(lesson,roster,profile,roster.classroom || {})');
s=rep(s,'monitoringTime(profile,now)','monitoringTime(profile,now,roster,roster.classroom || {})');
s=rep(s,': profile.disabled === true',': roster.membershipStatus === "dropped" || roster.classroom?.archived === true\n        ? "dropped"\n        : profile.disabled === true');
s=rep(s,'inactive:profile.disabled === true','inactive:profile.disabled === true || roster.membershipStatus === "dropped" || roster.classroom?.archived === true, dropped:roster.membershipStatus === "dropped", archived:roster.classroom?.archived === true');
s=rep(s,'"exempt","deactivated"','"exempt","deactivated","dropped"');
s=rep(s,'text:"This account is deactivated. Saved results are preserved as history and excluded from current class monitoring."','text:progress.dropped?"This student is dropped. Saved results are preserved; re-enroll them to resume participation.":progress.archived?"This class is archived. Saved results are preserved; restore the class to resume monitoring.":"This account is deactivated. Saved results are preserved as history and excluded from current class monitoring."');return s});
edit('teacher/views/studentProgress.js',s=>rep(rep(s,'  deactivated: [','  dropped: ["before", "Participation paused"],\n  deactivated: ['),'Exempt \u2014 account deactivated','Exempt \u2014 participation paused'));
edit('teacher/views/classReport.js',s=>rep(rep(rep(s,'progress.inactive ? "Deactivated \u2014 excluded from monitoring"','progress.inactive ? (progress.dropped ? "Dropped \u2014 excluded from monitoring" : progress.archived ? "Archived class \u2014 excluded from monitoring" : "Deactivated \u2014 excluded from monitoring")'),'progress.inactive ? "Deactivated"','progress.inactive ? (progress.dropped ? "Dropped" : progress.archived ? "Archived" : "Deactivated")'),' deactivated, excluded',' paused, excluded'));
edit('teacher/views/classPage.js',s=>{
s=rep(s,'student.accountProfile.disabled!==true','student.accountProfile.disabled!==true&&student.membershipStatus!=="dropped"');
s=rep(s,'${students.length}</b><span>Students enrolled','${students.filter(student=>student.membershipStatus!=="dropped").length}</b><span>Students enrolled');
s=s.replaceAll('${classroom.deletionRequest ? "Cancel deletion request" : "Request deletion"}','${classroom.archived ? "Restore class" : "Archive class"}');
// Archive confirmation replaces the former deletion request in classDeletion.js.
return s});
