import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { auth, db } from "../js/firebase.js";
import { state } from "../js/state.js";
import { $, setLoading, shell, toast } from "../js/helpers.js";
import { renderRoute } from "./router.js";

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

$("#logout-button").addEventListener("click", () => signOut(auth));
window.addEventListener("hashchange", renderRoute);

onAuthStateChanged(auth, async (user) => {
  console.log("teacher/app.js — user:", user);
  setLoading(true);
  state.user = user;
  state.profile = null;

  if (!user) {
    console.log("No user — bouncing to login");
    window.location.href = "../index.html";
    return;
  }

  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    console.log("Profile exists:", profile.exists(), "Role:", profile.data()?.role);
    if (!profile.exists() || profile.data().role !== "teacher") {
      console.log("Role check failed — bouncing to login");
      await signOut(auth);
      window.location.href = "../index.html";
      return;
    }
    state.profile = profile.data();
    shell();
    await renderRoute();
  } catch (error) {
    console.error("Error during role check:", error);
    await signOut(auth);
    window.location.href = "../index.html";
  } finally {
    setLoading(false);
  }
});