import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth, db } from "../js/firebase.js";
import { state } from "../js/state.js";
import { $, setLoading, shell } from "../js/helpers.js";
import { renderRoute } from "./router.js";

$("#logout-button").addEventListener("click", () => signOut(auth));
window.addEventListener("hashchange", renderRoute);

onAuthStateChanged(auth, async (user) => {
  setLoading(true);
  state.user = user;
  state.profile = null;

  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (!profile.exists() || profile.data().role !== "admin") {
      await signOut(auth);
      window.location.href = "../index.html";
      return;
    }
    state.profile = profile.data();
    shell("admin-summary", "Admin");
    await renderRoute();
  } catch (error) {
    console.error(error);
    await signOut(auth);
    window.location.href = "../index.html";
  } finally {
    setLoading(false);
  }
});