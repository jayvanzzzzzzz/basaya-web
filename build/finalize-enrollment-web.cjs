const fs=require('fs');const edit=(p,f)=>{let s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,f(s))};
edit('notify-api/lib/classProgress.js',s=>s.replace('skillSummary: user.get("skillSummary") || null,','skillSummary: user.get("skillSummary") || null,\n      droppedPeriods:roster.get("droppedPeriods") || [],deadlineOverrides:roster.get("deadlineOverrides") || {},'));
edit('notify-api/lib/classMembership.js',s=>s.replace('fullName, joinedAt: progress.restore', '...(progress.restore ? {droppedPeriods:progress.archive.get("droppedPeriods") || [],deadlineOverrides:progress.archive.get("deadlineOverrides") || {}} : {}),\n          fullName, joinedAt: progress.restore'));
edit('notify-api/handlers/remove-student.js',s=>s.replace('return res.status(200).json(await (action', 'if(action === "leave" && (typeof requestKey !== "string" || requestKey.length>200))return res.status(400).json({error:"A current leave request is required."});\n    return res.status(200).json(await (action'));
edit('notify-api/api/remove-class-lesson.js',s=>s.replace('classSnap.get("teacherId") !== uid)', 'classSnap.get("teacherId") !== uid || classSnap.get("membershipClosed") === true)'));
edit('firestore.rules',s=>s.replace('function activeClassTeacher(teacherId)',`function teachesActiveClass(classId) {
      return teachesClass(classId) && get(/databases/$(database)/documents/classes/$(classId)).data.get('membershipClosed', false) != true;
    }

    function activeClassTeacher(teacherId)`).replace('allow create: if teachesClass(classId) && (request.resource.data.get(\'mode\'', 'allow create: if teachesActiveClass(classId) && (request.resource.data.get(\'mode\'').replace('allow update: if teachesClass(classId) && (\n          (resource.data.get(\'mode\'', 'allow update: if teachesActiveClass(classId) && (\n          (resource.data.get(\'mode\'').replace('allow delete: if teachesClass(classId);','allow delete: if teachesActiveClass(classId);'));
edit('tools/student-access-session-tests.mjs',s=>s.replace('collection:()=>({}),doc:()=>({}),onSnapshot:', 'collection:()=>({}),doc:()=>({}),getDoc:async()=>({data:()=>({})}),onSnapshot:').replace('{renderRoute:async()=>{renders++;}}','{renderRoute:async()=>{renders++;},refreshEnrollment:async()=>{renders++;}}'));
edit('tools/restored-assessments-tests.mjs',s=>s.replace('const body = { operation, classId: "a",','const body = { enrollmentVersion:(await read("users/student")).enrollmentVersion || "", operation, classId: "a",'));
edit('tools/enrollment-lifecycle-tests.mjs',s=>s.replace("import { context }", "import { archiveClassMember } from '../notify-api/lib/classProgress.js';\nimport { context }").replace("  const droppedVersion=", "  await db.runTransaction(tx=>context(tx,db,uid,request,{open:false,historicalTeacher:'teacher'}));\n  await assert.rejects(db.runTransaction(tx=>context(tx,db,uid,request,{open:false,historicalTeacher:'other'})),error=>error.status===403);\n  const droppedVersion=").replace("  console.log('PASS:",`  await changeClassArchive(db,'teacher',classId,'restore');
  await rosterRef.update({leaveRequest:{requestedAt:Timestamp.fromMillis(now)}});
  await assert.rejects(archiveClassMember(db,'teacher',classId,uid,'stale-request'),error=>error.status===409);
  assert.ok((await rosterRef.get()).exists);
  await archiveClassMember(db,'teacher',classId,uid,uid+':'+now+':0');
  assert.equal((await rosterRef.get()).exists,false,'Approved leave remains distinct from drop');
  assert.equal((await userRef.get()).get('classId'),undefined);
  assert.equal((await userRef.get()).get('enrollmentStatus'),undefined);
  const history=(await userRef.collection('classProgress').doc(classId).get()).data();
  const archive=(await userRef.collection('classProgress').doc(classId).collection('archives').doc(history.latestArchiveId).get()).data();
  assert.ok(archive.droppedPeriods.length>0,'Dropped intervals survive an actual leave archive');
  console.log('PASS:`));
