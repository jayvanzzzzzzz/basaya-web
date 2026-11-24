// Run only in the linked production build environment; credentials stay in Vercel.
import { db } from './lib/firebase.js';
import { studentUsernameBase, assignStudentUsername } from './lib/studentUsernames.js';
const database=db(),apply=process.argv.includes('--apply');
try {
  const snapshot=await database.collection('users').where('role','==','student').get();
  const students=[...snapshot.docs].sort((a,b)=>a.id.localeCompare(b.id));
  const missing=[];
  for(const student of students){try{studentUsernameBase(student.data());}catch{missing.push({id:student.id,firstName:student.get('firstName')||'',lastName:student.get('lastName')||'',fullName:student.get('fullName')||student.get('displayName')||''});}}
  console.log('STUDENT_USERNAME_PREFLIGHT '+JSON.stringify({students:students.length,missing}));
  if(missing.length)throw Error('Incomplete student names; no usernames changed.');
  if(apply){
    // Private, server-only rollback records. Never overwrite the original username.
    for(const student of students)await database.runTransaction(async tx=>{
      const ref=database.doc(`adminMaintenance/student-usernames-v1/students/${student.id}`);
      if(!(await tx.get(ref)).exists)tx.set(ref,{username:student.get('username')||null,firstName:student.get('firstName'),lastName:student.get('lastName'),savedAt:Date.now()});
    });
    let changed=0;
    for(const student of students){
      const result=await assignStudentUsername(database,student.id);
      const profile=await database.doc(`users/${student.id}`).get();
      const alias=await database.doc(`usernames/${result.username}`).get();
      if(profile.get('username')!==result.username||alias.get('uid')!==student.id)throw Error('Username verification failed');
      if(result.previousUsername!==result.username)changed++;
    }
    console.log('STUDENT_USERNAME_APPLIED '+JSON.stringify({students:students.length,changed,verified:students.length}));
  }
} finally { await database.terminate(); }
