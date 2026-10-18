import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "../../js/firebase.js";
import { $, escapeHtml, openModal, toast } from "../../js/helpers.js";
import { fieldError, focusFirstError } from "../../js/field-errors.js";
import { passwordProblem, passwordRulesMarkup, watchPasswordRules } from "../../js/password-rules.js";
import { student, classId, fullName, loadProfile } from "../data.js";
import { logout, refreshTopbar } from "../session.js";
import { buddy, content, icon, showDialog } from "../ui.js";

// "Account" (the app's ProfileFragment): name, gender and birthday (email is read-only),
// the class with the leave-request flow, password change and logout.

const MONTHS = [
  "Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo",
  "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre",
];
const GENDERS = ["Lalaki", "Babae", "Ayokong sabihin"];

/** "2016-10-12" → "Oktubre 12, 2016". */
function formatBirthday(dob = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return "";
  return `${MONTHS[Number(match[2]) - 1] || ""} ${Number(match[3])}, ${match[1]}`;
}

const value = (text) =>
  text ? `<span>${escapeHtml(text)}</span>` : `<span class="is-empty">Hindi pa nailalagay</span>`;

const rosterRef = () => doc(db, "classes", classId(), "students", student.uid);

/** "no-class", "in-class", "pending" (waiting for the teacher) or "declined". */
async function leaveState() {
  if (!classId()) return { state: "no-class" };
  try {
    const snap = await getDoc(rosterRef());
    const declined = snap.get("leaveDeclined");
    if (snap.get("leaveRequest") != null) return { state: "pending" };
    if (declined != null) return { state: "declined", note: declined.note || "" };
  } catch (error) {
    console.warn("Could not read class membership", error);
  }
  return { state: "in-class" };
}

function classSection({ state, note }) {
  const name = student.profile.className || classId();
  if (state === "no-class") {
    return `
      <div class="st-row">
        <span class="st-row__icon">${icon("home")}</span>
        <span class="st-row__text"><strong>Wala ka pang klase</strong><small>Sumali gamit ang class code sa Home.</small></span>
        <a class="button secondary" href="#/join">Sumali</a>
      </div>`;
  }
  const status =
    state === "pending"
      ? `<div class="st-status st-status--pending">
          <strong>Hinihintay ang iyong guro</strong>
          <p>Humiling kang umalis sa klase. Puwede ka pa ring mag-aral habang naghihintay.</p>
          <button class="button secondary" type="button" data-leave="cancel">Kanselahin ang paghiling</button>
        </div>`
      : state === "declined"
        ? `<div class="st-status st-status--declined">
            <strong>Hindi pumayag ang iyong guro</strong>
            <p>${escapeHtml(note ? `Sabi ng guro: “${note}”` : "Mananatili ka sa klase.")}</p>
            <button class="button secondary" type="button" data-leave="dismiss">Sige</button>
          </div>`
        : "";
  return `
    <div class="st-row">
      <span class="st-row__icon">${icon("home")}</span>
      <span class="st-row__text"><small>Kasalukuyang klase</small><strong>${escapeHtml(name)}</strong></span>
    </div>
    ${status}
    ${
      state !== "pending"
        ? `<button class="st-row st-row--button st-row--danger" type="button" data-leave="ask">
            <span class="st-row__icon">${icon("door")}</span>
            <span class="st-row__text"><strong>Umalis sa klase</strong><small>Kailangan ng pahintulot ng iyong guro</small></span>
            ${icon("chevron", "st-row__chevron")}
          </button>`
        : ""
    }`;
}

export async function renderAccount() {
  const profile = await loadProfile();
  const name = fullName(profile) || "Estudyante";

  content().innerHTML = `
    <section class="st-account">
      <header class="st-account__hero">
        <span class="st-avatar st-avatar--xl" aria-hidden="true">${escapeHtml((profile.firstName || "B").charAt(0).toUpperCase())}</span>
        <h1>${escapeHtml(name)}</h1>
        <p>${escapeHtml(student.email)}</p>
      </header>

      <section class="st-card st-account__section">
        <div class="st-account__section-head">
          <h2>Impormasyon ko</h2>
          <button class="button secondary" type="button" id="account-edit" aria-label="I-edit ang impormasyon ng account">${icon("pencil")}I-edit</button>
        </div>
        <dl class="st-info">
          <div><dt>Pangalan</dt><dd>${value(fullName(profile))}</dd></div>
          <div><dt>Kasarian</dt><dd>${value(profile.gender)}</dd></div>
          <div><dt>Kaarawan</dt><dd>${value(formatBirthday(profile.dob))}</dd></div>
        </dl>
      </section>

      <section class="st-card st-account__section">
        <h2>Aking Klase</h2>
        <div id="account-class"><div class="st-loading"><span></span><span></span><span></span></div></div>
      </section>

      <section class="st-card st-account__section">
        <h2>Seguridad</h2>
        <button class="st-row st-row--button" type="button" id="account-password">
          <span class="st-row__icon">${icon("key")}</span>
          <span class="st-row__text"><strong>Palitan ang password</strong><small>Kailangan ang kasalukuyang password</small></span>
          ${icon("chevron", "st-row__chevron")}
        </button>
      </section>

      <button class="button secondary st-wide st-logout" type="button" id="account-logout">${icon("door")}Mag-logout</button>

      <footer class="site-footer site-footer--app st-footer">
        <p>© 2026 <strong>BaSaya</strong> · A BSIT Capstone Project</p>
        <nav class="site-footer__links" aria-label="Site information">
          <button type="button" data-site-info="about" aria-haspopup="dialog">About</button>
          <button type="button" data-site-info="privacy" aria-haspopup="dialog">Privacy Policy</button>
          <button type="button" data-site-info="contact" aria-haspopup="dialog">Contact</button>
        </nav>
      </footer>
    </section>`;

  const classBox = $("#account-class");
  const drawClass = async () => {
    classBox.innerHTML = classSection(await leaveState());
  };
  classBox.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-leave]")?.dataset.leave;
    if (action === "ask") showLeaveDialog(false, drawClass);
    else if (action === "cancel") showLeaveDialog(true, drawClass);
    else if (action === "dismiss") {
      // "Sige": hide the teacher's answer.
      classBox.innerHTML = classSection({ state: "in-class" });
      updateDoc(rosterRef(), { leaveDeclined: deleteField() }).catch((error) =>
        console.warn("Could not dismiss", error),
      );
    }
  });

  $("#account-edit").addEventListener("click", () => showEditDialog());
  $("#account-password").addEventListener("click", showPasswordDialog);
  $("#account-logout").addEventListener("click", async () => {
    const answer = await showDialog({
      iconName: "door",
      title: "Mag-logout",
      message: "Sigurado ka bang gusto mong mag-logout?",
      primary: "Oo",
      secondary: "Hindi",
    });
    if (answer === "primary") logout();
  });

  await drawClass();
}

/** Ask to leave (with an optional reason), or cancel a request that's waiting. */
function showLeaveDialog(cancelling, onDone) {
  const className = student.profile.className || "Aking Klase";
  openModal(
    `<form class="st-dialog" id="leave-form">
      ${buddy(cancelling ? "happy" : "thinking", "st-dialog__buddy")}
      <h2>${cancelling ? "Kanselahin ang paghiling?" : "Aalis ka ba sa klase?"}</h2>
      <p>${escapeHtml(
        cancelling
          ? `Mananatili ka sa ${className}.`
          : `Kapag pumayag ang iyong guro, aalis ka sa ${className} at mabubura ang iyong progreso sa klaseng ito.`,
      )}</p>
      ${
        cancelling
          ? ""
          : `<label>Dahilan (hindi kailangan)<textarea id="leave-reason" rows="3" maxlength="300"></textarea></label>`
      }
      <div class="st-dialog__actions">
        <button class="button ${cancelling ? "primary" : "danger"}" type="submit">${cancelling ? "Oo, kanselahin" : "Humiling na umalis"}</button>
        <button class="button secondary" type="button" data-close>${cancelling ? "Huwag muna" : "Manatili sa klase"}</button>
      </div>
    </form>`,
    (backdrop, close) => {
      backdrop.querySelector(".modal").classList.add("st-modal");
      backdrop.querySelector("[data-close]").addEventListener("click", close);
      const form = backdrop.querySelector("#leave-form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!navigator.onLine) {
          toast("Kailangan ng internet para dito.");
          return;
        }
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          await updateDoc(
            rosterRef(),
            cancelling
              ? { leaveRequest: deleteField() }
              : {
                  leaveRequest: {
                    reason: form.querySelector("#leave-reason").value.trim(),
                    requestedAt: serverTimestamp(),
                  },
                  leaveDeclined: deleteField(),
                },
          );
          close();
          toast(cancelling ? "Kinansela na ang paghiling." : "Naipadala na sa iyong guro!");
          onDone();
        } catch (error) {
          console.error("Leave request failed", error);
          submit.disabled = false;
          toast("Hindi naipadala. Subukan muli.");
        }
      });
    },
  );
}

function showEditDialog() {
  const profile = student.profile;
  const today = new Date().toISOString().slice(0, 10);
  openModal(
    `<form class="st-dialog st-dialog--form" id="edit-form" novalidate>
      <h2>I-edit ang account</h2>
      <label>Pangalan (First name)<input name="firstName" value="${escapeHtml(profile.firstName || "")}" autocomplete="given-name" maxlength="60" /></label>
      <label>Gitnang pangalan (opsyonal)<input name="middleName" value="${escapeHtml(profile.middleName || "")}" autocomplete="additional-name" maxlength="60" /></label>
      <label>Apelyido<input name="lastName" value="${escapeHtml(profile.lastName || "")}" autocomplete="family-name" maxlength="60" /></label>
      <fieldset class="st-gender">
        <legend>Kasarian</legend>
        ${GENDERS.map(
          (gender) =>
            `<label class="st-gender__chip"><input type="radio" name="gender" value="${gender}" ${profile.gender === gender ? "checked" : ""} /><span>${gender}</span></label>`,
        ).join("")}
      </fieldset>
      <label>Kaarawan<input name="dob" type="date" max="${today}" value="${/^\d{4}-\d{2}-\d{2}$/.test(profile.dob || "") ? profile.dob : ""}" /></label>
      <div class="st-dialog__actions">
        <button class="button primary" type="submit">I-save</button>
        <button class="button secondary" type="button" data-close>Kanselahin</button>
      </div>
    </form>`,
    (backdrop, close) => {
      backdrop.querySelector(".modal").classList.add("st-modal");
      backdrop.querySelector("[data-close]").addEventListener("click", close);
      const form = backdrop.querySelector("#edit-form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const updated = {
          firstName: (data.firstName || "").trim(),
          middleName: (data.middleName || "").trim(),
          lastName: (data.lastName || "").trim(),
          gender: data.gender || "",
          dob: data.dob || "",
        };
        fieldError(form.elements.firstName, updated.firstName ? "" : "Ilagay ang iyong pangalan.");
        fieldError(form.elements.lastName, updated.lastName ? "" : "Ilagay ang iyong apelyido.");
        if (focusFirstError(form)) return;

        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        submit.textContent = "Sine-save…";
        try {
          await updateDoc(doc(db, "users", student.uid), updated);
          // Keep the name the teacher sees in the class roster in step ("Last, First").
          if (classId()) {
            await updateDoc(rosterRef(), { fullName: `${updated.lastName}, ${updated.firstName}` }).catch((error) =>
              console.warn("Could not update class roster name", error),
            );
          }
          Object.assign(student.profile, updated);
          refreshTopbar();
          close();
          toast("Na-save ang iyong impormasyon.");
          renderAccount();
        } catch (error) {
          console.error("Failed to save profile", error);
          toast("Hindi na-save. Subukan muli.");
          submit.disabled = false;
          submit.textContent = "I-save";
        }
      });
    },
  );
}

function showPasswordDialog() {
  openModal(
    `<form class="st-dialog st-dialog--form" id="password-form" novalidate>
      <h2>Palitan ang password</h2>
      <label>Kasalukuyang password<input name="current" type="password" autocomplete="current-password" /></label>
      <label>Bagong password<input name="next" type="password" autocomplete="new-password" /></label>
      ${passwordRulesMarkup("fil")}
      <label>Ulitin ang bagong password<input name="confirm" type="password" autocomplete="new-password" /></label>
      <div class="st-dialog__actions">
        <button class="button primary" type="submit">Palitan</button>
        <button class="button secondary" type="button" data-close>Kanselahin</button>
      </div>
    </form>`,
    (backdrop, close) => {
      backdrop.querySelector(".modal").classList.add("st-modal");
      backdrop.querySelector("[data-close]").addEventListener("click", close);
      const form = backdrop.querySelector("#password-form");
      watchPasswordRules(form.elements.next, form.querySelector(".password-rules"));
      const setError = (field, message) => fieldError(form.elements[field], message);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const { current, next, confirm } = Object.fromEntries(new FormData(form));
        setError("current", current ? "" : "Ilagay ang kasalukuyang password mo.");
        setError(
          "next",
          !next
            ? "Gumawa ng bagong password."
            : passwordProblem(next, "fil") || (next === current ? "Iba dapat sa kasalukuyang password." : ""),
        );
        setError(
          "confirm",
          !confirm ? "Ulitin ang bagong password para makasigurado." : confirm !== next ? "Hindi ito tugma sa bagong password." : "",
        );
        if (focusFirstError(form)) return;

        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        submit.textContent = "Sine-save…";
        try {
          const user = auth.currentUser;
          // Firebase needs a recent sign-in to change the password.
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
          await updatePassword(user, next);
          close();
          toast("Napalitan na ang iyong password.");
          return;
        } catch (error) {
          if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential")
            setError("current", "Mali ang kasalukuyang password.");
          else if (error.code === "auth/weak-password") setError("next", "Masyadong mahina ang password.");
          else if (error.code === "auth/too-many-requests") toast("Masyadong maraming subok. Maghintay muna bago umulit.");
          else {
            console.error("Failed to change password", error);
            toast("Hindi napalitan ang password. Subukan muli.");
          }
          focusFirstError(form);
        }
        submit.disabled = false;
        submit.textContent = "Palitan";
      });
    },
  );
}
