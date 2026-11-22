import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/firebase.js";
import { allowCors, requireUser, ID_PATTERN } from "../lib/http.js";
import { lessonDeadline, deadlineMillis } from "../lib/deadlinePolicy.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
export default async function handler(req, res) {
  allowCors(req,res); res.setHeader("Cache-Control","no-store");
  res.setHeader("X-BASAya-Deadlines","individual-v1");
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST") return res.status(405).json({error:"Use POST"});
  try {
    const uid = await requireUser(req,res); if(!uid) return;
    const {action,classId,entryId,studentIds,dueAt,openAt} = req.body || {};
    if(!ID_PATTERN.test(classId || "") || !ID_PATTERN.test(entryId || "") || !["schedule","extend-students"].includes(action)) throw fail(400,"Invalid lesson schedule request.");
    if(dueAt !== null && (!Number.isFinite(dueAt) || dueAt <= Date.now())) throw fail(400,"Choose a future deadline.");
    if(action === "extend-students" && (!Array.isArray(studentIds) || !studentIds.length || studentIds.length > 200 || new Set(studentIds).size !== studentIds.length || studentIds.some(id=>typeof id !== "string" || !ID_PATTERN.test(id)))) throw fail(400,"Select 1–200 active students.");
    if(action === "schedule" && openAt !== null && !Number.isFinite(openAt)) throw fail(400,"Invalid opening date.");
    const updated = await db().runTransaction(async tx => {
      const classRef=db().doc(`classes/${classId}`), linkRef=db().doc(`classes/${classId}/classLessons/${entryId}`);
      const [classroom,link]=await Promise.all([tx.get(classRef),tx.get(linkRef)]);
      if(classroom.get("teacherId") !== uid || classroom.get("membershipClosed") === true) throw fail(403,"You do not teach this class.");
      if(!link.exists) throw fail(404,"Lesson is no longer assigned.");
      const begins=deadlineMillis(action === "schedule" ? openAt : link.get("openAt"));
      if(dueAt !== null && begins !== null && dueAt <= begins) throw fail(400,"Deadline must follow the opening date.");
      if(action === "schedule") {
        const oldDue=deadlineMillis(link.get("dueAt"));
        const history=[...new Set([...(link.get("deadlineHistory") || []),...(oldDue!==null&&oldDue<Date.now()?[oldDue]:[])])];
        tx.update(linkRef,{openAt:openAt===null?null:Timestamp.fromMillis(openAt),dueAt:dueAt===null?null:Timestamp.fromMillis(dueAt),deadlineHistory:history,scheduleChangedAt:Date.now()});
        return 1;
      }
      if(dueAt === null || !link.get("dueAt")) throw fail(400,"This lesson must have a deadline before it can be extended.");
      const selected=await Promise.all(studentIds.map(async id=>({id,profile:await tx.get(db().doc(`users/${id}`)),roster:await tx.get(db().doc(`classes/${classId}/students/${id}`))})));
      for(const student of selected) {
        if(student.profile.get("role") !== "student" || student.profile.get("disabled") === true || student.roster.get("membershipStatus") === "dropped" || student.profile.get("classId") !== classId || !student.roster.exists) throw fail(409,"A selected student is deactivated or no longer in this class. Refresh the list and try again.");
        if(dueAt <= lessonDeadline({id:entryId,...link.data()},student.roster.data(),student.profile.data()).dueAt) throw fail(400,"The new deadline must be later than every selected student's current deadline.");
      }
      const key=link.get("mode") === "practice" ? entryId : link.get("lessonId") || entryId;
      for(const student of selected) {
        const overrides={...(student.roster.get("deadlineOverrides") || {})}, previous=overrides[key] || {};
        const prior=lessonDeadline({id:entryId,...link.data()},student.roster.data(),student.profile.data()).dueAt;
        overrides[key]={dueAt:Timestamp.fromMillis(dueAt),firstAssignedAt:previous.firstAssignedAt ?? Date.now(),deadlineHistory:[...new Set([...(previous.deadlineHistory || []),...(prior!==null&&prior<Date.now()?[prior]:[])])]};
        tx.update(student.roster.ref,{deadlineOverrides:overrides});
      }
      return selected.length;
    });
    return res.status(200).json({ok:true,updated});
  } catch(error) { return res.status(error.status || 503).json({error:error.status?error.message:"Could not update the deadline. Please try again."}); }
}
