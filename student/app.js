import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth } from "../js/firebase.js";
import { $, setLoading } from "../js/helpers.js";
import { student, loadProfile, syncClock } from "./data.js";
import { refreshTopbar } from "./session.js";
import { renderRoute } from "./router.js";

// The student side of BaSaya: the same lessons, progress and class as the Android app,
// for students who can't install it (e.g. on an iPhone).

window.addEventListener("hashchange", renderRoute);
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
    student.uid = user.uid;
    student.email = user.email || "";
    const profile = await loadProfile();
    if (profile.role !== "student") {
      // Teachers and admins have their own portals; the login page sends them there.
      window.location.replace("../index.html");
      return;
    }
    sessionStorage.removeItem("basayaSignedOut");
    syncClock(); // no need to wait: the rules check lesson dates with server time anyway
    refreshTopbar();
    $("#app-view").hidden = false;
    await renderRoute();
  } catch (error) {
    console.error("Student portal startup failed:", error);
    await signOut(auth);
    window.location.replace("../index.html");
  } finally {
    setLoading(false);
  }
});
