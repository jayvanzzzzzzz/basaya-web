import { collection, limit, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";

let stop;
export function leaveStudentRequestsBadge() { stop?.(); stop = null; }
export function watchStudentRequestsBadge(classId, initialLeaveCount = 0) {
  leaveStudentRequestsBadge();
  const button = document.getElementById("view-students");
  const dot = button?.querySelector("[data-student-requests-dot]");
  if (!dot) return;
  let active = true;
  let joins = false;
  let leaves = initialLeaveCount > 0;
  const paint = () => {
    if (!active) return;
    const pending = joins || leaves;
    dot.hidden = !pending;
    button.setAttribute("aria-label", pending ? "Students — pending join or leave requests" : "Students");
    button.title = pending ? "Pending join or leave requests" : "View students";
  };
  paint();
  const onError = () => { if (active) button.title = "Request updates are unavailable. Refresh to check."; };
  const unsubscribeJoin = onSnapshot(query(collection(db, "classes", classId, "joinRequests"), where("status", "==", "pending"), limit(1)), (snapshot) => { joins = !snapshot.empty; paint(); }, onError);
  const unsubscribeLeave = onSnapshot(collection(db, "classes", classId, "students"), (snapshot) => { leaves = snapshot.docs.some((doc) => Boolean(doc.get("leaveRequest"))); paint(); }, onError);
  stop = () => { active = false; unsubscribeJoin(); unsubscribeLeave(); };
}
