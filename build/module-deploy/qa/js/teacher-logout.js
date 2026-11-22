/** Ask before ending a teacher session. Native dialog manages focus and background interaction. */
export function confirmTeacherLogout({ eyebrow, description } = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "teacher-logout-dialog";
  dialog.setAttribute("aria-labelledby", "teacher-logout-title");
  dialog.setAttribute("aria-describedby", "teacher-logout-description");
  dialog.innerHTML = `
    <form method="dialog">
      <div class="teacher-logout-dialog__intro">
        <span class="teacher-logout-dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h13" /></svg>
        </span>
        <span class="teacher-logout-dialog__eyebrow">Your teaching space</span>
      </div>
      <h2 id="teacher-logout-title">Ready to log out?</h2>
      <p id="teacher-logout-description">You’ll return to the sign-in page. Sign in again whenever you’re ready to continue teaching.</p>
      <div class="teacher-logout-dialog__actions">
        <button type="submit" value="cancel" autofocus>Stay signed in</button>
        <button type="submit" value="confirm" class="teacher-logout-dialog__confirm">Log out <span aria-hidden="true">&rarr;</span></button>
      </div>
    </form>`;
  if (eyebrow) dialog.querySelector('.teacher-logout-dialog__eyebrow').textContent = eyebrow;
  if (description) dialog.querySelector('#teacher-logout-description').textContent = description;
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      const confirmed = dialog.returnValue === "confirm";
      dialog.remove();
      resolve(confirmed);
    }, { once: true });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close("cancel");
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const first = dialog.querySelector('[value="cancel"]');
      const last = dialog.querySelector('[value="confirm"]');
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.showModal();
  });
}
