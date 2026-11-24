import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { ProgressError } from './classProgress.js';

const fail = (status, message) => { throw new ProgressError(status, message); };
const closePeriods = (periods, now) => periods.map(period => period.end == null ? {...period, end:now} : period);

/** Retain accepted work and the roster; only server-owned participation changes. */
export async function changeEnrollment(db, teacherId, classId, studentId, action) {
  return db.runTransaction(async tx => {
    const classRef=db.doc(`classes/${classId}`), userRef=db.doc(`users/${studentId}`), rosterRef=classRef.collection('students').doc(studentId);
    const [teacher, classroom, user, roster]=await tx.getAll(db.doc(`users/${teacherId}`),classRef,userRef,rosterRef);
    if(teacher.get('role')!=='teacher'||teacher.get('disabled')===true||classroom.get('teacherId')!==teacherId||classroom.get('membershipClosed')===true) fail(403,'You do not teach this active class.');
    if(!roster.exists||user.get('role')!=='student'||user.get('classId')!==classId) fail(409,'The student’s class membership changed. Refresh the roster.');
    const dropped=roster.get('membershipStatus')==='dropped', dropping=action==='drop';
    if(dropped===dropping) return {status:dropping?'dropped':'enrolled',unchanged:true};
    if(!dropping&&user.get('disabled')===true) fail(409,'An admin must reactivate this account before re-enrollment.');
    const now=Date.now(), periods=roster.get('droppedPeriods')||[];
    const version=randomUUID();
    tx.update(rosterRef,{membershipStatus:dropping?'dropped':'enrolled',droppedPeriods:dropping?[...periods,{start:now,end:null}]:closePeriods(periods,now),membershipChangedAt:FieldValue.serverTimestamp(),membershipChangedBy:teacherId,leaveRequest:FieldValue.delete()});
    tx.update(userRef,{enrollmentStatus:dropping?'dropped':'enrolled',enrollmentVersion:version});
    return {status:dropping?'dropped':'enrolled'};
  });
}

/** Archive/restore the class without deleting any roster, links or progress. */
export async function changeClassArchive(db, uid, classId, action) {
  return db.runTransaction(async tx => {
    const ref=db.doc(`classes/${classId}`),[actor,classroom]=await tx.getAll(db.doc(`users/${uid}`),ref);
    if(!classroom.exists) fail(404,'Class not found.');
    if(actor.get('disabled')===true||!(actor.get('role')==='admin'||actor.get('role')==='teacher'&&classroom.get('teacherId')===uid)) fail(403,'You cannot archive or restore this class.');
    const archiving=action==='archive';
    if((classroom.get('archived')===true)===archiving) return {archived:archiving,unchanged:true};
    if(!archiving&&classroom.get('membershipClosed')===true&&classroom.get('archived')!==true) fail(409,'This class is being deleted and cannot be restored.');
    const now=Date.now(),periods=classroom.get('archivePeriods')||[];
    tx.update(ref,{archived:archiving,membershipClosed:archiving,archivePeriods:archiving?[...periods,{start:now,end:null}]:closePeriods(periods,now),classVersion:randomUUID(),archivedAt:archiving?FieldValue.serverTimestamp():FieldValue.delete(),archivedBy:archiving?uid:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp(),deletionRequest:FieldValue.delete(),deletionDeclined:FieldValue.delete()});
    return {archived:archiving};
  });
}
