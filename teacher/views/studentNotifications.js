import { collection, limit, onSnapshot, query, Timestamp, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { state } from '../../js/state.js';
import { postToApi } from '../../js/api.js';
import { lastRead } from '../../js/chat.js?v=removed-preview';
import { latestReadingSubmissions } from '../../js/readingSubmissions.js';

let cleanup;
export const leaveStudentNotifications = () => { cleanup?.(); cleanup = null; };
const millis = value => value?.toMillis?.() || Number(value) || 0;

export function readingGradingSummary(readings, lessonLinks, now = Date.now()) {
  const pending = latestReadingSubmissions(readings).filter(reading => reading.status === 'submitted');
  const dueSoon = pending.filter(reading => lessonLinks.some(link => {
    const dueAt = millis(link.dueAt);
    return link.mode !== 'practice' && (link.lessonId || link.id) === reading.lessonId && dueAt > now && dueAt <= now + 24 * 60 * 60 * 1000;
  })).length;
  return { total: pending.length, dueSoon };
}

export function studentNotificationState(students, messages, readings, readAt) {
  const byStudent = new Map(students.map(student => [student.id, { messages: false, readings: false, leave: Boolean(student.leaveRequest) }]));
  for (const message of messages) {
    if (message.role === 'student' && !message.deleted && message.kind !== 'join' && millis(message.sentAt) > readAt && byStudent.has(message.senderId)) byStudent.get(message.senderId).messages = true;
  }
  for (const reading of latestReadingSubmissions(readings)) if (reading.status === 'submitted' && byStudent.has(reading.uid)) byStudent.get(reading.uid).readings = true;
  for (const item of byStudent.values()) item.labels = [item.messages && 'Unread class messages', item.readings && 'Recordings awaiting grading', item.leave && 'Pending leave request'].filter(Boolean);
  return byStudent;
}

// Messages and membership update live. The authenticated reading queue is polled
// only while this class screen is visible; its private index stays server-only.
export function watchStudentNotifications(classId, onChange, initialStudents = [], lessonLinks = []) {
  leaveStudentNotifications();
  const uid = state.user.uid;
  let active = true, students = initialStudents, messages = [], readings = [], joins = false, readingError = false, messageError = false, membershipError = false, inFlight = false;
  let readAt = lastRead(uid, classId), stopMessages;
  const owns = () => active && state.user?.uid === uid;
  const emit = () => {
    if (!owns()) return;
    const byStudent = studentNotificationState(students, messages, readings, readAt);
    onChange({ byStudent, joins, grading: readingGradingSummary(readings, lessonLinks), hasMessages: [...byStudent.values()].some(item => item.messages), hasReadings: [...byStudent.values()].some(item => item.readings), hasPending: joins || [...byStudent.values()].some(item => item.labels.length), readingError, messageError, membershipError });
  };
  function watchMessages() {
    stopMessages?.();
    readAt = lastRead(uid, classId);
    stopMessages = onSnapshot(query(collection(db, 'classes', classId, 'messages'), where('sentAt', '>', Timestamp.fromMillis(readAt))), snapshot => {
      messages = snapshot.docs.map(doc => doc.data()); messageError = false; emit();
    }, () => { messageError = true; emit(); });
  }
  async function refreshReadings() {
    if (!owns() || inFlight || document.visibilityState === 'hidden') return;
    inFlight = true;
    try {
      const result = await postToApi('assessment', { operation: 'fluency-list', classId }, { signal: AbortSignal.timeout(20000) });
      if (owns()) { readings = result.submissions || []; readingError = false; emit(); }
    } catch { if (owns()) { readingError = true; emit(); } }
    finally { inFlight = false; }
  }
  const onMembershipError = () => { membershipError = true; emit(); };
  const stopStudents = onSnapshot(collection(db, 'classes', classId, 'students'), snapshot => { students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); emit(); }, onMembershipError);
  const stopJoins = onSnapshot(query(collection(db, 'classes', classId, 'joinRequests'), where('status', '==', 'pending'), limit(1)), snapshot => { joins = !snapshot.empty; emit(); }, onMembershipError);
  watchMessages(); emit(); void refreshReadings();
  const timer = setInterval(refreshReadings, 60000);
  const refresh = () => { if (owns() && document.visibilityState !== 'hidden') { if (lastRead(uid, classId) !== readAt) watchMessages(); void refreshReadings(); } };
  const storage = event => { if (event.key === `basaya.chatRead.${uid}.${classId}`) refresh(); };
  window.addEventListener('focus', refresh); window.addEventListener('storage', storage); document.addEventListener('visibilitychange', refresh);
  const stop = () => { active = false; stopStudents(); stopJoins(); stopMessages?.(); clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', refresh); };
  cleanup = stop;
  return () => { stop(); if (cleanup === stop) cleanup = null; };
}
