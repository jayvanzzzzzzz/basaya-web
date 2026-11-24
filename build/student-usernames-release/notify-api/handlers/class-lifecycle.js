import { db } from '../lib/firebase.js';
import { ID_PATTERN, allowCors, requireUser } from '../lib/http.js';
import { changeEnrollment, changeClassArchive } from '../lib/enrollmentLifecycle.js';
import { ProgressError } from '../lib/classProgress.js';
export default async function handler(req,res) {
  allowCors(req,res);
  res.setHeader('X-BASAya-Class-Lifecycle','roster-v1');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Use POST'});
  try {
    const uid=await requireUser(req,res);if(!uid)return;
    const {action,classId,studentId}=req.body||{};
    if(!ID_PATTERN.test(classId||'')||!['drop','reenroll','archive','restore'].includes(action)||(['drop','reenroll'].includes(action)&&!ID_PATTERN.test(studentId||'')))return res.status(400).json({error:'Invalid class action'});
    const result=['drop','reenroll'].includes(action)?await changeEnrollment(db(),uid,classId,studentId,action):await changeClassArchive(db(),uid,classId,action);
    return res.status(200).json(result);
  } catch(error) {
    if(error instanceof ProgressError)return res.status(error.status).json({error:error.message});
    console.error('class-lifecycle failed',error);
    return res.status(500).json({error:'Could not confirm this change. Refresh the class before retrying.'});
  }
}
