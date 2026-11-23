import { postToApi } from "../../js/api.js";
import { $, openModal } from "../../js/helpers.js";

export function createStudent(onCreated) {
  let busy = false;
  openModal(
    `<h2>Create student account</h2>
     <p>The student can sign in with their LRN or username and password.</p>
     <form id="create-student-form" class="form-card">
       <div class="student-create-grid">
         <label>First name<input name="firstName" required maxlength="100" autocomplete="off" /></label>
         <label>Last name<input name="lastName" required maxlength="100" autocomplete="off" /></label>
       </div>
       <label>Middle name (optional)<input name="middleName" maxlength="100" autocomplete="off" /></label>
       <label>LRN<input name="lrn" type="text" inputmode="numeric" pattern="[0-9]{12}" minlength="12" maxlength="12" required autocomplete="off" aria-describedby="student-lrn-help" /></label>
       <p class="muted" id="student-lrn-help">Exactly 12 digits. Verify against the student's school record.</p>
       <label>Username<input name="username" type="text" readonly autocomplete="off" /></label>
       <label>Password<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" /></label>
       <p class="muted">At least 8 characters. Share the login details privately with the student. No email is needed.</p>
       <p class="form-error" id="create-student-error" role="alert"></p>
       <div class="modal-actions"><button type="button" class="button secondary" data-cancel>Cancel</button><button type="submit" class="button primary">Create account</button></div>
     </form>`,
    (modal, close) => {
      const form = $("#create-student-form", modal);
      const submit = form.querySelector('[type="submit"]');
      const cancel = $("[data-cancel]", modal);
      const usernamePart = value => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const updateUsername = () => {
        const first = usernamePart(form.elements.firstName.value);
        const last = usernamePart(form.elements.lastName.value);
        form.elements.username.value = first && last ? `${last}.${first}` : "";
      };
      form.elements.firstName.addEventListener("input", updateUsername);
      form.elements.lastName.addEventListener("input", updateUsername);
      updateUsername();
      modal.querySelector('[role="dialog"]').setAttribute("aria-label", "Create student account");
      modal.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          modal.querySelector(".modal-close").click();
        }
        if (event.key !== "Tab") return;
        const controls = [...modal.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      cancel.addEventListener("click", () => { if (!busy) close(); });
      form.elements.firstName.focus();
      form.addEventListener("submit", async event => {
        event.preventDefault();
        if (busy) return;
        const details = Object.fromEntries(new FormData(form));
        const error = $("#create-student-error", modal);
        error.textContent = "";
        busy = true;
        submit.disabled = cancel.disabled = true;
        form.setAttribute("aria-busy", "true");
        submit.textContent = "Creating account…";
        let account;
        try {
          account = await postToApi("student-accounts", details);
        } catch (failure) {
          error.textContent = failure.message;
        } finally {
          busy = false;
          submit.disabled = cancel.disabled = false;
          submit.textContent = "Create account";
          form.setAttribute("aria-busy", "false");
        }
        if (account) {
          form.reset();
          close();
          onCreated({ ...account, id: account.uid }, details.password);
        }
      });
    },
    { beforeClose: () => !busy },
  );
}
