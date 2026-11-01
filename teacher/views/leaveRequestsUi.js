const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const stamp = (value) => value?.toMillis?.() ?? (value ? new Date(value).getTime() || 0 : 0);
export const pendingLeaves = (students) => students.filter((student) => student.leaveRequest).sort((a, b) => stamp(a.leaveRequest.requestedAt) - stamp(b.leaveRequest.requestedAt));
export const leaveRequestKey = (student) => `${student.id}:${stamp(student.leaveRequest?.requestedAt)}:${student.leaveRequest?.requestedAt?.nanoseconds || 0}`;
export function leaveRequestsPanel() {
  return `<section class="join-review leave-review" aria-labelledby="leave-review-title">
    <header class="join-review__heading"><div class="join-review__heading-copy"><span class="join-review__eyebrow">CLASS MEMBERSHIP</span><h2 id="leave-review-title">Leave requests <span id="leave-request-count" class="join-review__count">0</span></h2><p>Review requests from students who would like to leave this class.</p></div><span class="join-review__seal" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 4H5v16h8m-3-8h12m-4-4 4 4-4 4"/></svg></span></header>
    <div class="join-review__toolbar"><label class="join-review__select"><input id="leave-select-all" type="checkbox" disabled /><span>Select all shown</span></label><label class="join-review__search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><span class="sr-only">Search leave requests</span><input id="leave-request-search" type="search" placeholder="Find a student…" autocomplete="off" /></label><button id="leave-approve-selected" class="join-review__bulk" type="button" disabled>Approve selected <span>0</span></button></div>
    <p id="leave-review-error" class="join-review__error" role="alert" hidden></p><div id="leave-review-list" class="join-review__list" aria-busy="false"></div>
    <footer class="join-review__footer"><span id="leave-selection-status" role="status" aria-live="polite">No requests selected</span><span>Approval archives progress and removes active membership.</span></footer>
  </section>`;
}
export function leaveRequestRows(students, selected = new Map(), searching = false) {
  if (!students.length) return `<div class="join-review__empty"><strong>${searching ? "No requests match this search" : "No pending leave requests"}</strong><span>${searching ? "Try another student name." : "Students who ask to leave will appear here automatically."}</span></div>`;
  return students.map((student) => {
    const name = student.fullName || "Student";
    const selectedRow = selected.get(student.id) === leaveRequestKey(student);
    const date = stamp(student.leaveRequest.requestedAt);
    const label = date ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : "Just requested";
    const reason = typeof student.leaveRequest.reason === "string" ? student.leaveRequest.reason.trim() : "";
    const initials = name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    return `<article class="join-request leave-request${selectedRow ? " is-selected" : ""}"><label class="join-request__check"><input type="checkbox" data-leave-check="${esc(student.id)}" ${selectedRow ? "checked" : ""} /><span class="sr-only">Select ${esc(name)}</span></label><span class="join-request__avatar" aria-hidden="true">${esc(initials)}</span><div class="join-request__identity"><h3>${esc(name)}</h3><span>Asked to leave · ${esc(label)}</span>${reason ? `<blockquote class="leave-request__reason">${esc(reason)}</blockquote>` : '<span class="leave-request__reason-empty">No reason given.</span>'}</div><span class="join-request__status"><i></i>Awaiting decision</span><div class="join-request__actions"><button class="join-request__decline" type="button" data-decline-leave="${esc(student.id)}" aria-label="Decline ${esc(name)}’s leave request">Decline</button><button class="join-request__approve" type="button" data-approve-leave="${esc(student.id)}" aria-label="Approve ${esc(name)}’s leave request">Approve leave</button></div></article>`;
  }).join("");
}
