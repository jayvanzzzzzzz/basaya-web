const fs=require('fs');const edit=(p,f)=>{let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');fs.writeFileSync(p,f(s))};
edit('notify-api/handlers/remove-student.js',s=>s.replace('import { ProgressError }','import { archiveClassMember, ProgressError }').replace('const { classId, studentId }','const { classId, studentId, action, requestKey }').replace('await changeEnrollment(db(), uid, classId, studentId, "drop")','await (action === "leave" ? archiveClassMember(db(), uid, classId, studentId, requestKey) : changeEnrollment(db(), uid, classId, studentId, "drop"))'));
edit('notify-api/lib/classProgress.js',s=>s.replace('classId, studentId) {','classId, studentId, requestKey = null) {').replace('    const progress = await tx.get',`    if(requestKey !== null) {
      const stamp=roster.get("leaveRequest.requestedAt");
      const key=studentId+":"+(stamp?.toMillis?.()||0)+":"+(stamp?.nanoseconds||0);
      if(!roster.get("leaveRequest")||key!==requestKey)throw new ProgressError(409,"The leave request changed. Refresh before approving.");
    }
    const progress = await tx.get`).replace('progressSession: FieldValue.delete(), skillSummary: FieldValue.delete(),','progressSession: FieldValue.delete(), skillSummary: FieldValue.delete(), enrollmentStatus:FieldValue.delete(), enrollmentVersion:FieldValue.delete(),'));
edit('js/api.js',s=>s.replace('export const removeStudent = (classId, studentId) =>\n  postToApi("remove-student", { classId, studentId });','export const removeStudent = (classId, studentId, requestKey) =>\n  postToApi("remove-student", { classId, studentId, action:"leave", requestKey });'));
edit('teacher/views/leaveRequests.js',s=>s.replace('removeStudent(classroom.id, student.id)','removeStudent(classroom.id, student.id, leaveRequestKey(student))'));
edit('notify-api/lib/classMembership.js',s=>s.replace('progressSession: progress.progressSession,','progressSession: progress.progressSession, enrollmentStatus:"enrolled", enrollmentVersion:randomUUID(),'));
edit('teacher/views/students.js',s=>s.replace('  wireRequestRibbons(classId);','  if(classroom.archived) $(".roster-admissions").hidden=true;\n  wireRequestRibbons(classId);'));
edit('css/pages/dashboard-editorial.css',s=>s+'\n.class-directory__tabs {display:flex;flex-wrap:wrap;gap:.5rem;padding:0 1.5rem 1rem;}\n.class-directory__tabs [aria-pressed="true"] {background:var(--dash-action);color:var(--dash-action-ink,#fff);border-color:var(--dash-action);}\n');
