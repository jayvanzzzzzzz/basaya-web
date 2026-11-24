import { escapeHtml, openModal } from "../js/helpers.js";
import { icon } from "./ui.js";

/** Explicit, keyboard-accessible confirmation; dismissal always keeps the quiz. */
export function confirmQuizExit() {
  const previousFocus = document.activeElement;
  return new Promise(resolve => {
    let settled = false;
    openModal(`
      <div class="st-quiz-exit">
        <span class="st-quiz-exit__icon" aria-hidden="true">${icon("door")}</span>
        <p class="st-quiz-exit__eyebrow">Pagsusulit</p>
        <h2 id="quiz-exit-title">Umalis sa pagsusulit?</h2>
        <p id="quiz-exit-description">Hindi mase-save ang iyong kasalukuyang mga sagot. Kapag bumalik ka, magsisimula muli ang pagsusulit.</p>
        <div class="st-quiz-exit__note">${icon("refresh")}<span>Babalik ka sa unang tanong.</span></div>
        <div class="st-quiz-exit__actions">
          <button class="button primary" type="button" data-quiz-stay>${escapeHtml("Ipagpatuloy ang pagsusulit")}</button>
          <button class="button secondary" type="button" data-quiz-leave>Umalis</button>
        </div>
      </div>`, (backdrop, close) => {
      const modal = backdrop.querySelector(".modal");
      modal.classList.add("st-quiz-exit-modal");
      modal.setAttribute("role", "alertdialog");
      modal.setAttribute("aria-labelledby", "quiz-exit-title");
      modal.setAttribute("aria-describedby", "quiz-exit-description");
      const finish = leave => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKey, true);
        close();
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(leave);
      };
      function onKey(event) {
        if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); finish(false); }
        if (event.key === "Tab") {
          const buttons = [...modal.querySelectorAll("button:not([disabled])")];
          const first = buttons[0], last = buttons.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      backdrop.querySelector("[data-quiz-stay]").addEventListener("click", () => finish(false));
      backdrop.querySelector("[data-quiz-leave]").addEventListener("click", () => finish(true));
      // Replace the generic close handler with a button that also resolves our promise.
      const oldClose = backdrop.querySelector(".modal-close");
      const closeButton = oldClose.cloneNode(true);
      oldClose.replaceWith(closeButton);
      closeButton.addEventListener("click", () => finish(false));
      document.addEventListener("keydown", onKey, true);
      backdrop.querySelector("[data-quiz-stay]").focus();
    }, { closeOnBackdrop: false });
  });
}
