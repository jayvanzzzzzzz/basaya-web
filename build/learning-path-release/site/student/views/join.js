import { requestClassJoin } from "../../js/api.js";
import { $, escapeHtml, navigate } from "../../js/helpers.js";
import { fieldError } from "../../js/field-errors.js";
import { student, classId, fullName, loadProfile } from "../data.js";
import { buddy, content, icon, setBuddyMood, shake } from "../ui.js";
import { onLeave } from "../router.js";

// A code submits a request. Only the teacher's server-side approval enrolls the student.

// Where the close button and a finished join go: Home, or Account when opened from there.
let returnTo = "/home";

/** Opens the join page; `from` is where to come back to. */
export function openJoin(from = "/home") {
  returnTo = from;
  navigate("/join");
}

export async function renderJoin() {
  const back = returnTo;
  returnTo = "/home";
  if (classId()) {
    navigate(back);
    return;
  }

  const name = fullName() || "Estudyante";
  const request = student.profile.joinRequest;
  if (request?.status === "pending") {
    let active = true;
    onLeave(() => { active = false; });
    content().innerHTML = `
      <section class="st-join st-join--pending" aria-labelledby="join-pending-title">
        <header class="st-join-pending__header">
          <span class="st-join-pending__mark" aria-hidden="true">${icon("clock")}</span>
          <a class="st-icon-button st-join-pending__close" href="#${back}" aria-label="Isara">${icon("close")}</a>
          <p class="st-join-pending__eyebrow">KAHILINGAN SA KLASE</p>
          <h1 id="join-pending-title">Naghihintay ng pag-apruba</h1>
          <p>Naipadala na ang iyong kahilingan.</p>
        </header>
        <div class="st-join-pending__card">
          <div class="st-join-pending__card-heading"><span>Hiniling na klase</span><span class="st-join-pending__badge"><i aria-hidden="true"></i>Nakabinbin</span></div>
          <h2>${escapeHtml(request.className || "Iyong klase")}</h2>
          <p>Makakagamit ka ng mga aralin at class chat kapag inaprubahan ng guro.</p>
          <div class="st-join-pending__note">${icon("info")}<span>Awtomatikong maa-update ang katayuan kapag may koneksyon.</span></div>
          <div class="st-join-pending__actions">
            <a class="button primary st-join-pending__home" href="#/home">${icon("home")}<span>Bumalik sa home screen</span></a>
            <button class="st-icon-button st-join-pending__refresh" id="join-refresh" type="button" aria-label="I-refresh ang katayuan" title="I-refresh ang katayuan">${icon("refresh")}</button>
          </div>
          <p id="join-pending-status" class="st-join-pending__status" role="status" aria-live="polite"></p>
        </div>
      </section>`;
    $("#join-refresh").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      try {
        await loadProfile();
        if (!active || !button.isConnected) return;
        await renderJoin();
        const status = $("#join-pending-status");
        if (status && !classId() && student.profile.joinRequest?.status === "pending") {
          status.textContent = "Nakabinbin pa ang iyong kahilingan.";
          $("#join-refresh")?.focus();
        }
      } catch {
        if (active && button.isConnected) $("#join-pending-status").textContent = "Hindi ma-refresh ang katayuan. Suriin ang koneksyon at subukan muli.";
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      }
    });
    return;
  }
  content().innerHTML = `
    <section class="st-join">
      <header class="st-join__header">
        <a class="st-icon-button st-icon-button--light" href="#${back}" aria-label="Isara">${icon("close")}</a>
        ${buddy("happy", "st-join__buddy")}
        <h1>Sumali sa Klase</h1>
        <p>Ilagay ang class code. Kailangan munang aprubahan ng guro ang iyong kahilingan.</p>
      </header>
      <div class="st-card st-join__account">
        <span class="st-avatar st-avatar--lg" aria-hidden="true">${escapeHtml(name.charAt(0).toUpperCase())}</span>
        <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(student.email)}</small></span>
      </div>
      <form id="join-form" class="st-card st-join__form" novalidate>
        ${request?.status === "declined" ? `<p class="form-error" role="status">Hindi inaprubahan ang iyong kahilingan sa ${escapeHtml(request.className)}. Kausapin ang guro o magpadala ng bagong kahilingan gamit ang tamang class code.</p>` : ""}
        <label>
          Class code mula sa guro
          <input id="join-code" class="st-code-input" type="text" inputmode="text" autocapitalize="characters"
            autocomplete="off" spellcheck="false" maxlength="12" placeholder="Halimbawa: ABC123" required />
        </label>
        <p id="join-error" class="form-error" role="alert"></p>
        <button class="button primary st-wide" type="submit" id="join-submit">Ipadala ang kahilingan</button>
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
    submit.textContent = "Ipinapadala…";
    setBuddyMood(mascot, "thinking");
    try {
      const result = await requestClassJoin(code);
      student.profile.joinRequest = result;
      await loadProfile().catch(() => {});
      await renderJoin();
      return;
    } catch (err) {
      console.error("Join class failed", err);
      fail(
        err.message || "May problema sa koneksyon. Subukan muli.",
        false,
      );
    } finally {
      if (submit.isConnected && !classId()) {
        submit.disabled = false;
        submit.textContent = "Ipadala ang kahilingan";
      }
    }
  });

  input.focus({ preventScroll: true });
}
