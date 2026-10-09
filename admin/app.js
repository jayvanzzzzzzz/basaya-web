import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth, db } from "../js/firebase.js";
import { state } from "../js/state.js";
import { $, setLoading, shell, toast } from "../js/helpers.js";
import { renderRoute } from "./router.js";

$("#logout-button").addEventListener("click", async () => {
  sessionStorage.setItem("basayaSignedOut", "true");
  try {
    await signOut(auth);
    window.location.replace("../index.html");
  } catch (error) {
    sessionStorage.removeItem("basayaSignedOut");
    console.error("Admin sign-out failed:", error);
    toast("Could not sign out. Please try again.");
  }
});
window.addEventListener("hashchange", renderRoute);
window.addEventListener("pageshow", () => {
  if (sessionStorage.getItem("basayaSignedOut") === "true") {
    window.location.replace("../index.html");
  }
});

onAuthStateChanged(auth, async (user) => {
  setLoading(true);
  state.user = user;
  state.profile = null;

  if (!user) {
    window.location.replace("../index.html");
    return;
  }

  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (!profile.exists() || profile.data().role !== "admin") {
      await signOut(auth);
      window.location.replace("../index.html");
      return;
    }
    state.profile = profile.data();
    shell("admin-summary", "Admin");
    await renderRoute();
  } catch (error) {
    console.error(error);
    await signOut(auth);
    window.location.replace("../index.html");
  } finally {
    setLoading(false);
  }
});