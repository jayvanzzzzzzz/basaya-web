import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth, db, offlineReady } from "../js/firebase.js";
import { collection, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { watchSync } from "./sync.js";
import { $, setLoading, navigate, toast } from "../js/helpers.js";
import { student, loadProfile, syncClock, invalidateStudentData } from "./data.js";
import { refreshTopbar } from "./session.js";
import { renderRoute, refreshEnrollment } from "./router.js";
import { gameSaves } from "./gameSync.js";
// Every form's required fields show their own message instead of the browser bubble.
import "../js/field-errors.js";

// The student side of BaSaya: the same lessons, progress and class as the Android app, for students who can't install it (e.g. on an iPhone).

window.addEventListener("hashchange", renderRoute);
window.addEventListener("online", () => {
  if (!student.uid) return;
  syncClock();
  // Preserve an activity in progress when the connection changes.
  if (["", "#/home", "#/progress"].includes(location.hash)) renderRoute();
});
window.addEventListener("pageshow", () => {
  if (sessionStorage.getItem("basayaSignedOut") === "true") {
    window.location.replace("../index.html");
  }
});

let stopProfile;
let stopDeadlines;
let stopClass;
let classWatchRevision=0;
async function watchClassChanges(classId) {
  const revision=++classWatchRevision;
  stopClass?.();student.classroom={};
  if(!classId)return;
  const ref=doc(db,"classes",classId);
  const snapshot=await getDoc(ref);
  if(revision!==classWatchRevision||student.profile.classId!==classId)return;
  student.classroom=snapshot.data() || {};
  let signature=JSON.stringify([student.classroom.classVersion,student.classroom.membershipClosed]);
  stopClass=onSnapshot(ref,snapshot=>{
    if(student.profile.classId!==classId)return;
    const classroom=snapshot.data()||{},next=JSON.stringify([classroom.classVersion,classroom.membershipClosed]);
    student.classroom=classroom;
    if(next!==signature){signature=next;invalidateStudentData();student.lessons=[];void refreshEnrollment();}
  },()=>{});
}
function watchDeadlineChanges(classId) {
  stopDeadlines?.();
  if(!classId)return;
  let previous=null;
  stopDeadlines=onSnapshot(doc(db,"classes",classId,"students",student.uid),snapshot=>{
    const next=JSON.stringify(snapshot.data()?.deadlineOverrides || {});
    if(previous!==null&&next!==previous){invalidateStudentData();student.lessons=[];if(["#/home","#/progress", ""].includes(location.hash))void renderRoute();}
    previous=next;
  },()=>{});
}
async function deactivateSession() {
  sessionStorage.setItem("basayaAccountDeactivated", "true");
  $("#app-view").hidden = true;
  stopProfile?.();
  stopDeadlines?.();
  stopClass?.();
  await signOut(auth);
  window.location.replace("../index.html");
}
const membershipKey = (profile) => JSON.stringify([profile.classId || "", profile.className || "", profile.progressSession || "", profile.enrollmentStatus || "", profile.enrollmentVersion || "", profile.joinRequest?.requestId || "", profile.joinRequest?.status || ""]);
onAuthStateChanged(auth, async (user) => {
  stopProfile?.();
  stopDeadlines?.();
  stopClass?.();
  setLoading(true);
  if (!user) {
    window.location.replace("../index.html");
    return;
  }

  try {
    await offlineReady;
    if (student.uid !== user.uid) { student.lessons = []; invalidateStudentData(); }
    student.uid = user.uid;
    student.email = "";
    const profile = await loadProfile();
    if (profile.disabled === true) { await deactivateSession(); return; }
    student.email = profile.username || profile.lrn || "Mag-aaral";
    if (!profile.role) {
      window.location.replace("../complete-profile.html");
      return;
    }
    if (profile.role !== "student") {
      // Teachers and admins have their own portals; the login page sends them there.
      window.location.replace("../index.html");
      return;
    }
    sessionStorage.removeItem("basayaSignedOut");
    gameSaves.resume();
    syncClock(); // no need to wait: the rules check lesson dates with server time anyway
    refreshTopbar();
    await watchClassChanges(profile.classId);
    watchDeadlineChanges(profile.classId);
    watchSync(user.uid, collection(db, "users", user.uid, "assignedLessons"), invalidateStudentData);
    $("#app-view").hidden = false;
    await renderRoute();
    let previous = membershipKey(student.profile);
    stopProfile = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      if (!snapshot.exists() || auth.currentUser?.uid !== user.uid) return;
      const profile = snapshot.data();
      if (profile.disabled === true) { void deactivateSession().catch(() => window.location.replace("../index.html")); return; }
      const next = membershipKey(profile);
      if (next === previous) return;
      const accessChanged=student.profile.enrollmentVersion!==profile.enrollmentVersion||student.profile.enrollmentStatus!==profile.enrollmentStatus;
      const classChanged = (student.profile.classId || "") !== (profile.classId || "") || (student.profile.progressSession || "") !== (profile.progressSession || "");
      previous = next;
      student.profile = profile;
      gameSaves.resume();
      refreshTopbar();
      if (classChanged) {
        void watchClassChanges(profile.classId).then(()=>refreshEnrollment());
        watchDeadlineChanges(profile.classId);
        invalidateStudentData();
        student.lessons = [];
        if (profile.classId) toast("Inaprubahan ka na! Maaari mo nang buksan ang iyong klase.");
        if (location.hash === "#/home") renderRoute();
        else navigate("/home");
      } else if(accessChanged) {invalidateStudentData();student.lessons=[];void refreshEnrollment();}
      else if (["#/home", "#/join", "#/account", ""].includes(location.hash)) renderRoute();
    }, (error) => console.warn("Membership updates unavailable", error));
  } catch (error) {
    console.error("Student portal startup failed:", error);
    // Preserve the saved sign-in through temporary network/cache failures.
    $("#app-view").hidden = false;
    $("#page-content").textContent = "Hindi mabuksan ang naka-save na account. Kumonekta sa internet at i-refresh ang pahina.";
  } finally {
    setLoading(false);
  }
});
