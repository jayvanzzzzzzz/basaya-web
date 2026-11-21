import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth, db } from "../js/firebase.js";
import { state } from "../js/state.js";
import { rememberAccount } from "../js/recent-accounts.js";
import { $, setLoading, shell, toast } from "../js/helpers.js";
import { renderRoute } from "./router.js";
import { confirmTeacherLogout } from "../js/teacher-logout.js";
// Every form's required fields show their own message instead of the browser bubble.
import "../js/field-errors.js";

// Class-code copy-to-clipboard (unrelated to auth, kept as-is)
document.addEventListener("click", async (event) => {
  const stub = event.target.closest(".code-stub");
  if (!stub) return;
  event.preventDefault();
  event.stopPropagation();
  const codeEl = stub.querySelector("code");
  const hintEl = stub.querySelector(".code-stub__hint");
  const codeText = codeEl?.textContent.trim();
  if (!codeText) return;
  try {
    await navigator.clipboard.writeText(codeText);
    toast("Class code copied.");
    stub.classList.add("is-copied");
    if (hintEl) hintEl.textContent = "Copied!";
    setTimeout(() => {
      stub.classList.remove("is-copied");
      if (hintEl) hintEl.textContent = "Copy";
    }, 1400);
  } catch {
    toast(`Class code: ${codeText}`);
  }
});

$("#logout-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (!await confirmTeacherLogout()) return;
    rememberAccount(auth.currentUser, state.profile || {});
    sessionStorage.setItem("basayaSignedOut", "true");
    try {
      await signOut(auth);
      window.location.replace("../index.html");
    } catch (error) {
      sessionStorage.removeItem("basayaSignedOut");
      console.error("Teacher sign-out failed:", error);
      toast("Could not sign out. Please try again.");
    }
  } finally {
    button.disabled = false;
    button.focus({ preventScroll: true });
  }
});
window.addEventListener("hashchange", () => { if (state.profile) renderRoute(); });
window.addEventListener("pageshow", () => {
  if (sessionStorage.getItem("basayaSignedOut") === "true") {
    window.location.replace("../index.html");
  }
});

let stopAccessWatch = null;
onAuthStateChanged(auth, async (user) => {
  stopAccessWatch?.();
  stopAccessWatch = null;
  console.log("teacher/app.js — user:", user);
  setLoading(true);
  state.user = user;
  state.profile = null;

  if (!user) {
    console.log("No user — bouncing to login");
    window.location.replace("../index.html");
    return;
  }

  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    console.log("Profile exists:", profile.exists(), "Role:", profile.data()?.role);
    if (!profile.exists() || profile.data().role !== "teacher" || profile.data().disabled === true) {
      console.log("Role check failed — bouncing to login");
      await signOut(auth);
      window.location.replace("../index.html");
      return;
    }
    if (profile.data().emailVerificationRequired === true &&
        (!user.emailVerified || profile.data().mustChangePassword === true)) {
      window.location.replace("../verify-teacher.html");
      return;
    }
    state.profile = profile.data();
    stopAccessWatch = onSnapshot(doc(db, "users", user.uid), async snapshot => {
      if (!snapshot.exists() || snapshot.data().role !== "teacher" || snapshot.data().disabled === true) {
        state.profile = null;
        await signOut(auth);
        window.location.replace("../index.html");
      }
    });
    shell();
    await renderRoute();
  } catch (error) {
    console.error("Error during role check:", error);
    await signOut(auth);
    window.location.replace("../index.html");
  } finally {
    setLoading(false);
  }
});
