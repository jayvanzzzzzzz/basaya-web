import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, escapeHtml, navigate } from "../../js/helpers.js";
import { fieldError } from "../../js/field-errors.js";
import { student, classId, fullName, loadClassLessons, loadProfile } from "../data.js";
import { buddy, confetti, content, icon, setBuddyMood, shake } from "../ui.js";

// "Sumali sa Klase" (the app's JoinClassActivity): the roster entry and the student's
// class link are written together, so it's both or nothing.

export async function renderJoin() {
  if (classId()) {
    navigate("/home");
    return;
  }

  const name = fullName() || "Estudyante";
  content().innerHTML = `
    <section class="st-join">
      <header class="st-join__header">
        <a class="st-icon-button st-icon-button--light" href="#/home" aria-label="Isara">${icon("close")}</a>
        ${buddy("happy", "st-join__buddy")}
        <h1>Sumali sa Klase</h1>
        <p>Hingin sa iyong guro ang class code at ilagay ito rito.</p>
      </header>
      <div class="st-card st-join__account">
        <span class="st-avatar st-avatar--lg" aria-hidden="true">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(student.email)}</small></span>
      </div>
      <form id="join-form" class="st-card st-join__form" novalidate>
        <label>
          Class code mula sa guro
          <input id="join-code" class="st-code-input" type="text" inputmode="text" autocapitalize="characters"
            autocomplete="off" spellcheck="false" maxlength="12" placeholder="Halimbawa: ABC123" required />
        </label>
        <p id="join-error" class="form-error" role="alert"></p>
        <button class="button primary st-wide" type="submit" id="join-submit">Sumali</button>
      </form>
    </section>`;

  const form = $("#join-form");
  const input = $("#join-code");
  const error = $("#join-error");
  const submit = $("#join-submit");
  const mascot = $(".st-join__buddy");

  // A problem with the code goes under the box; a connection problem below the form.
  const fail = (message, aboutCode = true) => {
    if (aboutCode) fieldError(input, message);
    else error.textContent = message;
    setBuddyMood(mascot, "cheer");
    shake(input);
    input.focus();
  };

  input.addEventListener("input", () => {
    error.textContent = "";
    input.value = input.value.toUpperCase();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!code) {
      fail("Ilagay ang class code na ibinigay ng iyong guro.");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Sumasali…";
    setBuddyMood(mascot, "thinking");
    try {
      const profile = await loadProfile();
      const snap = await getDocs(query(collection(db, "classes"), where("classCode", "==", code), limit(1)));
      if (snap.empty) {
        fail("Walang klaseng natagpuan sa code na ito. Tingnan muli ang code mula sa iyong guro.");
        return;
      }
      const classDoc = snap.docs[0];
      const className = classDoc.get("className") || "";

      const batch = writeBatch(db);
      batch.set(doc(db, "classes", classDoc.id, "students", student.uid), {
        fullName: `${profile.lastName || ""}, ${profile.firstName || ""}`,
        joinedAt: serverTimestamp(),
      });
      batch.update(doc(db, "users", student.uid), { classId: classDoc.id, className });
      await batch.commit();

      student.profile.classId = classDoc.id;
      student.profile.className = className;
      await loadClassLessons().catch(() => {});

      submit.textContent = `Yehey! Kasali ka na sa ${className}`;
      setBuddyMood(mascot, "happy");
      confetti({ count: 120 });
      setTimeout(() => navigate("/home"), 1600);
      return;
    } catch (err) {
      console.error("Join class failed", err);
      fail(
        err?.code === "permission-denied" ? "Hindi na-save. Subukan muli." : "May problema sa koneksyon. Subukan muli.",
        false,
      );
    } finally {
      if (!classId()) {
        submit.disabled = false;
        submit.textContent = "Sumali";
      }
    }
  });

  input.focus({ preventScroll: true });
}
