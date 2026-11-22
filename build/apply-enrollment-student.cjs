const fs=require('fs');const edit=(p,f)=>{let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'),n=f(s);if(s===n)throw Error(p);fs.writeFileSync(p,n)};const rep=(s,a,b)=>{if(!s.includes(a))throw Error('Missing '+a.slice(0,100));return s.replace(a,b)};
edit('student/data.js',s=>{
s=rep(s,'  profile: {},','  profile: {},\n  classroom: {},');
s=rep(s,'student.profile.progressSession || "", navigator.onLine','student.profile.progressSession || "", student.profile.enrollmentVersion || "", student.classroom.classVersion || "", navigator.onLine');
s=rep(s,'export const classId =',`export const enrollmentBlocked = () => student.profile.enrollmentStatus==='dropped' || student.classroom.membershipClosed===true;\nexport const participationStamp = () => ({enrollmentVersion:student.profile.enrollmentVersion || '',classVersion:student.classroom.classVersion || ''});\nexport const classId =`);
s=rep(s,'student.uid, body.classId, body.progressSession, body.lessonId, version,','student.uid, body.classId, body.progressSession, body.enrollmentVersion, body.classVersion, body.lessonId, version,');
s=rep(s,'const body = { operation: "metadata-list",','const body = { ...participationStamp(), operation: "metadata-list",');
s=rep(s,'  if (!navigator.onLine) throw new Error("Kumonekta sa internet para maipasa at masuri ang sagot.");','  if(enrollmentBlocked())throw new Error("Nakahinto ang iyong paglahok sa klase. Makipag-ugnayan sa guro.");\n  if (!navigator.onLine) throw new Error("Kumonekta sa internet para maipasa at masuri ang sagot.");');
s=rep(s,'    operation, classId: classId(),','    ...participationStamp(), operation, classId: classId(),');
s=rep(s,'  if (!id) {','  if (!id || enrollmentBlocked()) {');
s=rep(s,'rosterSnap?.data?.() || {},student.profile)','rosterSnap?.data?.() || {},student.profile,student.classroom)');return s});
edit('student/app.js',s=>{
s=rep(s,'collection, doc, onSnapshot','collection, doc, getDoc, onSnapshot');
s=rep(s,'import { renderRoute }','import { renderRoute, refreshEnrollment }');
s=rep(s,'let stopDeadlines;','let stopDeadlines;\nlet stopClass;\nasync function watchClassChanges(classId) {\n  stopClass?.();student.classroom={};\n  if(!classId)return;\n  const ref=doc(db,"classes",classId);\n  student.classroom=(await getDoc(ref)).data() || {};\n  let signature=JSON.stringify([student.classroom.classVersion,student.classroom.membershipClosed]);\n  stopClass=onSnapshot(ref,snapshot=>{\n    if(student.profile.classId!==classId)return;\n    const classroom=snapshot.data()||{},next=JSON.stringify([classroom.classVersion,classroom.membershipClosed]);\n    student.classroom=classroom;\n    if(next!==signature){signature=next;invalidateStudentData();student.lessons=[];void refreshEnrollment();}\n  },()=>{});\n}');
s=s.replaceAll('stopProfile?.();\n  stopDeadlines?.();','stopProfile?.();\n  stopDeadlines?.();\n  stopClass?.();');
s=rep(s,'profile.progressSession || "", profile.joinRequest','profile.progressSession || "", profile.enrollmentStatus || "", profile.enrollmentVersion || "", profile.joinRequest');
s=rep(s,'    watchDeadlineChanges(profile.classId);','    await watchClassChanges(profile.classId);\n    watchDeadlineChanges(profile.classId);');
s=rep(s,'const classChanged =','const accessChanged=student.profile.enrollmentVersion!==profile.enrollmentVersion||student.profile.enrollmentStatus!==profile.enrollmentStatus;\n      const classChanged =');
s=rep(s,'        watchDeadlineChanges(profile.classId);','        void watchClassChanges(profile.classId).then(()=>refreshEnrollment());\n        watchDeadlineChanges(profile.classId);');
s=rep(s,'      } else if (["#/home",','      } else if(accessChanged) {invalidateStudentData();student.lessons=[];void refreshEnrollment();}\n      else if (["#/home",');return s});
edit('student/router.js',s=>{
s=rep(s,'import { student }','import { student, enrollmentBlocked }');
s=rep(s,'export function renderRoute() {',`export function refreshEnrollment() {\n  leaveGuard=null;deciding=false;\n  if(enrollmentBlocked())history.replaceState(history.state,'','#/home');\n  return renderRoute();\n}\n\nexport function renderRoute() {`);
s=rep(s,'    if (section === "lesson" && lessonId && !part)',`    if(enrollmentBlocked() && ['home','lesson','join','progress','notifications'].includes(section)) {\n      const dropped=student.profile.enrollmentStatus==='dropped';\n      $('#app-view').classList.remove('is-focus');\n      $('#page-content').innerHTML=\`<section class="st-empty" role="status"><h2>\${dropped?'Dropped ang iyong enrollment':'Naka-archive ang klase'}</h2><p><strong>\${escapeHtml(student.profile.className || 'Iyong klase')}</strong></p><p>\${dropped?'Nakahinto ang iyong paglahok sa klase. Napanatili ang iyong na-save na progreso. Makipag-ugnayan sa iyong guro upang humiling na ma-enroll muli.':'Napanatili ang iyong progreso. Magpapatuloy ang mga aralin kapag ibinalik ng guro ang klase.'}</p><a class="button primary" href="#/chat">Makipag-ugnayan sa guro</a></section>\`;\n    }\n    else if (section === "lesson" && lessonId && !part)`);return s});
edit('student/gameSync.js',s=>{
s=rep(s,'student, invalidateStudentData','student, invalidateStudentData, participationStamp, enrollmentBlocked');
s=rep(s,'auth.currentUser?.uid === student.uid ? {','auth.currentUser?.uid === student.uid && !enrollmentBlocked() ? { ...participationStamp(),');
s=rep(s,'scope.progressSession !== job.progressSession)','scope.progressSession !== job.progressSession || (scope.enrollmentVersion||"") !== (job.enrollmentVersion||"") || (scope.classVersion||"") !== (job.classVersion||""))');
s=rep(s,'operation: job.kind,','enrollmentVersion:job.enrollmentVersion||"",classVersion:job.classVersion||"",operation: job.kind,');return s});
edit('student/gameSaves.js',s=>rep(s,'a.progressSession === b.progressSession;','a.progressSession === b.progressSession && (a.enrollmentVersion||"") === (b.enrollmentVersion||"") && (a.classVersion||"") === (b.classVersion||"");'));
edit('student/fluencySession.js',s=>{
s=rep(s,'student, classId','student, classId, participationStamp, enrollmentBlocked');
s=rep(s,'const scope = { classId:','const scope = { ...participationStamp(), classId:');
s=rep(s,'const owns = () => student.uid','const owns = () => !enrollmentBlocked() && (student.profile.enrollmentVersion||\'\')===scope.enrollmentVersion && (student.classroom.classVersion||\'\')===scope.classVersion && student.uid');return s});
