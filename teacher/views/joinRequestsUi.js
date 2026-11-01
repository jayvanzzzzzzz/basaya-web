// Pure markup, shared with the local design preview. All stored strings are escaped.
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export function enrollmentSummary(classroom, enrolled) {
  return `<div class="enrollment-summary" aria-label="Class membership overview">
    <div><span class="enrollment-summary__label">Enrolled students</span><strong>${enrolled}<small> in your classroom</small></strong></div>
    <div><span class="enrollment-summary__label">Join requests awaiting review</span><strong id="join-summary-count">—</strong></div>
    <div class="enrollment-summary__code"><span class="enrollment-summary__label">Class invitation code</span><code>${esc(classroom.classCode || "—")}</code><small>Share with your students</small></div>
  </div>`;
}
export function joinRequestsPanel(classroom, enrolled, { summary = true } = {}) {
  return `${summary ? enrollmentSummary(classroom, enrolled) : ""}<section class="join-review" aria-labelledby="join-review-title">
    <header class="join-review__heading">
      <div class="join-review__heading-copy"><span class="join-review__eyebrow">CLASS ADMISSIONS</span><h2 id="join-review-title">Join requests <span id="join-request-count" class="join-review__count">—</span></h2><p>Review the students who would like to join ${esc(classroom.className || "this class")}.</p></div>
      <span class="join-review__seal" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg></span>
    </header>
    <div class="join-review__toolbar">
      <label class="join-review__select"><input id="join-select-all" type="checkbox" disabled /><span>Select all shown</span></label>
      <label class="join-review__search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><span class="sr-only">Search join requests</span><input id="join-request-search" type="search" placeholder="Find a student…" autocomplete="off" /></label>
      <button id="join-approve-selected" class="join-review__bulk" type="button" disabled>Approve selected <span>0</span></button>
    </div>
    <p id="join-review-error" class="join-review__error" role="alert" hidden></p>
    <div id="join-review-list" class="join-review__list" aria-busy="true"><p class="join-review__empty">Loading join requests…</p></div>
    <footer class="join-review__footer"><span id="join-selection-status" role="status" aria-live="polite">No requests selected</span><span>Lessons and class chat open after approval.</span></footer>
  </section>`;
}
export function joinRequestRows(requests, selected = new Set(), progressModes = new Map()) {
  if (!requests.length) return `<div class="join-review__empty"><strong>No pending requests to show</strong><span>New requests appear here automatically. Share your class code to invite students.</span></div>`;
  return requests.map((request) => {
    const date = request.requestedAt?.toDate?.() || (request.requestedAt ? new Date(request.requestedAt) : null);
    const validDate = date && Number.isFinite(date.getTime());
    const label = validDate ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : "Just requested";
    const initials = (request.fullName || "Student").split(/[\s,]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    return `<article class="join-request${selected.has(request.requestId) ? " is-selected" : ""}">
      <label class="join-request__check"><input type="checkbox" data-join-check="${esc(request.requestId)}" ${selected.has(request.requestId) ? "checked" : ""} /><span class="sr-only">Select ${esc(request.fullName)}</span></label>
      <span class="join-request__avatar" aria-hidden="true">${esc(initials)}</span>
      <div class="join-request__identity"><h3>${esc(request.fullName || "Student")}</h3><span>Requested <time${validDate ? ` datetime="${date.toISOString()}"` : ""}>${esc(label)}</time></span>${request.hasPreviousProgress === true ? `<div class="join-request__returning"><strong>Returning student</strong><label><span>On approval</span><select data-join-progress="${esc(request.requestId)}" aria-label="Progress on approval for ${esc(request.fullName || "Student")}"><option value="restore"${progressModes.get(request.requestId) !== "fresh" ? " selected" : ""}>Restore previous progress (recommended)</option><option value="fresh"${progressModes.get(request.requestId) === "fresh" ? " selected" : ""}>Start fresh</option></select></label><small>${progressModes.get(request.requestId) === "fresh" ? "A new record will start. Previous results stay archived." : "Resume saved pages, answers and words, even in unfinished lessons. Completed assessments stay completed."}</small></div>` : ""}</div>
      <span class="join-request__status"><i></i>Pending review</span>
      <div class="join-request__actions"><button class="join-request__decline" type="button" data-join-decline="${esc(request.requestId)}" aria-label="Decline ${esc(request.fullName)}">Decline</button><button class="join-request__approve" type="button" data-join-approve="${esc(request.requestId)}" aria-label="Approve ${esc(request.fullName)}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>Approve</button></div>
    </article>`;
  }).join("");
}
