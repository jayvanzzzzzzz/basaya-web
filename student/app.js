import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth, db, offlineReady } from "../js/firebase.js";
import { collection, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { watchSync } from "./sync.js";
import { $, setLoading, navigate, toast } from "../js/helpers.js";
import { student, loadProfile, syncClock, invalidateStudentData } from "./data.js";
import { refreshTopbar } from "./session.js";
import { renderRoute } from "./router.js";
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
const membershipKey = (profile) => JSON.stringify([profile.classId || "", profile.className || "", profile.progressSession || "", profile.joinRequest?.requestId || "", profile.joinRequest?.status || ""]);
onAuthStateChanged(auth, async (user) => {
  stopProfile?.();
  setLoading(true);
  if (!user) {
    window.location.replace("../index.html");
    return;
  }

  try {
    await offlineReady;
    if (student.uid !== user.uid) { student.lessons = []; invalidateStudentData(); }
    student.uid = user.uid;
    student.email = user.email || "";
    const profile = await loadProfile();
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
    watchSync(user.uid, collection(db, "users", user.uid, "assignedLessons"), invalidateStudentData);
    $("#app-view").hidden = false;
    await renderRoute();
    let previous = membershipKey(student.profile);
    stopProfile = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      if (!snapshot.exists() || auth.currentUser?.uid !== user.uid) return;
      const profile = snapshot.data();
      const next = membershipKey(profile);
      if (next === previous) return;
      const classChanged = (student.profile.classId || "") !== (profile.classId || "") || (student.profile.progressSession || "") !== (profile.progressSession || "");
      previous = next;
      student.profile = profile;
      gameSaves.resume();
      refreshTopbar();
      if (classChanged) {
        invalidateStudentData();
        student.lessons = [];
        if (profile.classId) toast("Inaprubahan ka na! Maaari mo nang buksan ang iyong klase.");
        if (location.hash === "#/home") renderRoute();
        else navigate("/home");
      } else if (["#/home", "#/join", "#/account", ""].includes(location.hash)) renderRoute();
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
