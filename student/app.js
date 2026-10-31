import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth, db, offlineReady } from "../js/firebase.js";
import { collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { watchSync } from "./sync.js";
import { $, setLoading } from "../js/helpers.js";
import { student, loadProfile, syncClock, refreshSummary } from "./data.js";
import { refreshTopbar } from "./session.js";
import { renderRoute } from "./router.js";
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

onAuthStateChanged(auth, async (user) => {
  setLoading(true);
  if (!user) {
    window.location.replace("../index.html");
    return;
  }

  try {
    await offlineReady;
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
    syncClock(); // no need to wait: the rules check lesson dates with server time anyway
    refreshTopbar();
    watchSync(user.uid, collection(db, "users", user.uid, "assignedLessons"), refreshSummary);
    $("#app-view").hidden = false;
    await renderRoute();
  } catch (error) {
    console.error("Student portal startup failed:", error);
    // Preserve the saved sign-in through temporary network/cache failures.
    $("#app-view").hidden = false;
    $("#page-content").textContent = "Hindi mabuksan ang naka-save na account. Kumonekta sa internet at i-refresh ang pahina.";
  } finally {
    setLoading(false);
  }
});
