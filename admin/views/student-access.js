import { postToApi } from "../../js/api.js";
import { confirmAction } from "../../js/action-confirmation.js";
import { notify } from "../../js/helpers.js";

const pending = new Map();
let updating = false;
let currentView = null;
export function studentStatus(student, mobile = false) {
  const loading = pending.get(student.id);
  const inactive = student.disabled === true;
  return `<span class="teacher-account-status teacher-account-status--${loading ? "loading" : inactive ? "deactivated" : "active"}${mobile ? " teacher-account-status--mobile" : ""}" role="status" aria-busy="${!!loading}"><i aria-hidden="true"></i>${loading || (inactive ? "Deactivated" : "Active")}</span>`;
}

export function wireStudentAccess({ students, rows, isCurrent, applyFilters, pager, nameOf, reload }) {
  const view = { isCurrent, reload };
  currentView = view;
  const root = document.querySelector("#page-content");
  const createButton = document.querySelector("#create-student");
  const selected = new Set();
  const byId = new Map(students.map(student => [student.id, student]));
  const header = root.querySelector("#student-select-page");
  const toolbar = root.querySelector("#student-bulk-actions");
  const toggle = root.querySelector("#student-multiselect-toggle");
  let selecting = false;
  let busy = updating;
  const onPage = () => rows.filter(row => !row.hidden && !row.hasAttribute("data-paged-out"));
  function refresh() {
    if (!isCurrent()) return;
    toggle.disabled = busy;
    toggle.setAttribute("aria-pressed", String(selecting));
    toggle.setAttribute("aria-label", selecting ? "Exit multi-select" : "Multi-select students");
    root.querySelectorAll(".student-table .student-select-cell").forEach(cell => { cell.hidden = !selecting; });
    root.querySelector(".student-table .admin-directory-search-empty td").colSpan = selecting ? 6 : 5;
    const visible = onPage();
    const checked = visible.filter(row => selected.has(row.dataset.student)).length;
    header.checked = visible.length > 0 && checked === visible.length;
    header.indeterminate = checked > 0 && checked < visible.length;
    header.disabled = busy || !visible.length;
    rows.forEach(row => {
      const checkbox = row.querySelector("[data-select-student]");
      checkbox.checked = selected.has(row.dataset.student);
      checkbox.disabled = busy;
      row.classList.toggle("student-row--selected", checkbox.checked);
      row.querySelector("[data-student-access]").disabled = busy;
    });
    toolbar.hidden = !selected.size;
    toolbar.querySelector("[data-selected-count]").textContent = `${selected.size} selected across pages`;
    toolbar.querySelector("[data-bulk-deactivate]").disabled = busy || ![...selected].some(id => byId.get(id).disabled !== true);
    toolbar.querySelector("[data-bulk-reactivate]").disabled = busy || ![...selected].some(id => byId.get(id).disabled === true);
    toolbar.querySelector("[data-clear-selection]").disabled = busy;
    toolbar.setAttribute("aria-busy", String(busy));
    root.querySelectorAll("[data-student-status-filter], .student-ribbon, #student-search").forEach(control => { control.disabled = busy; });
    if (createButton) createButton.disabled = busy;
  }
  function updateRow(student) {
    const row = rows.find(row => row.dataset.student === student.id);
    if (!row || !isCurrent()) return;
    row.dataset.accountStatus = student.disabled === true ? "deactivated" : "active";
    row.querySelectorAll(".teacher-account-status").forEach(mark => {
      mark.outerHTML = studentStatus(student, mark.classList.contains("teacher-account-status--mobile"));
    });
    row.querySelector("[data-student-access] span").textContent = student.disabled === true ? "Reactivate student" : "Deactivate student";
  }
  async function changeAccess(ids, disabled) {
    if (busy || updating) return;
    const targets = ids.map(id => byId.get(id)).filter(student => student && (student.disabled === true) !== disabled);
    if (!targets.length) return;
    busy = true;
    updating = true;
    refresh();
    const verb = disabled ? "Deactivate" : "Reactivate";
    try {
      if (!await confirmAction({ title: `${verb} ${targets.length === 1 ? "student?" : `${targets.length} students?`}`,
        message: `${targets.length === 1 ? nameOf(targets[0]) : `These ${targets.length} students`} ${disabled ? "will be signed out and unable to sign in" : "will be able to sign in again"}. Class membership, lessons and all saved progress will be preserved.`,
        confirm: `${verb} ${targets.length === 1 ? "student" : "students"}`, danger: disabled })) return;
      if (!isCurrent()) return;
      targets.forEach(student => { pending.set(student.id, disabled ? "Deactivating…" : "Reactivating…"); updateRow(student); });
      const firstRow = rows.find(row => row.dataset.student === targets[0].id);
      [...(firstRow?.querySelectorAll(".teacher-account-status") || [])].find(mark => mark.getClientRects().length)
        ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      let updated = 0, failed = 0;
      for (let start = 0; start < targets.length; start += 50) {
        const batch = targets.slice(start, start + 50);
        try {
          const response = await postToApi("student-accounts", { action: disabled ? "deactivate" : "reactivate", studentIds: batch.map(student => student.id) });
          for (const student of batch) {
            const result = response.results?.find(result => result.studentId === student.id);
            if (result?.ok === true && result.disabled === disabled) { student.disabled = disabled; selected.delete(student.id); updated++; }
            else { failed++; selected.add(student.id); selecting = true; }
          }
        } catch { failed += batch.length; selecting = true; batch.forEach(student => selected.add(student.id)); }
        finally { batch.forEach(student => { pending.delete(student.id); updateRow(student); }); }
      }
      if (isCurrent()) {
        root.querySelectorAll("[data-student-status-filter]").forEach(button => {
          const value = button.dataset.studentStatusFilter;
          button.querySelector("[data-status-count]").textContent = students.filter(student => value === "all" || (student.disabled === true ? "deactivated" : "active") === value).length;
        });
        applyFilters(); pager.refresh();
        notify({ tone: failed ? "danger" : "success", title: failed ? "Some accounts could not be updated" : `Students ${disabled ? "deactivated" : "reactivated"}`,
          message: `${updated} updated${failed ? `; ${failed} failed and remain selected for retry` : ""}. Class membership and saved progress are preserved.` });
      }
    } finally {
      targets.forEach(student => { pending.delete(student.id); updateRow(student); });
      busy = false; refresh();
      updating = false;
      if (currentView !== view && currentView?.isCurrent()) {
        void currentView.reload().catch(() => notify({ tone: "danger", title: "Refresh student accounts", message: "Reload to see the latest account statuses." }));
      }
    }
  }
  toggle.addEventListener("click", () => {
    if (busy) return;
    selecting = !selecting;
    if (!selecting) selected.clear();
    refresh();
  });
  rows.forEach(row => {
    row.querySelector("[data-select-student]").addEventListener("change", event => {
      if (event.target.checked) selected.add(row.dataset.student); else selected.delete(row.dataset.student);
      refresh();
    });
    row.querySelector("[data-student-access]").addEventListener("click", () => {
      row.querySelector(".teacher-table__menu-popup").hidden = true;
      row.querySelector(".teacher-table__menu-toggle").setAttribute("aria-expanded", "false");
      void changeAccess([row.dataset.student], byId.get(row.dataset.student).disabled !== true);
    });
  });
  header.addEventListener("change", () => {
    onPage().forEach(row => { if (header.checked) selected.add(row.dataset.student); else selected.delete(row.dataset.student); });
    refresh();
  });
  toolbar.querySelector("[data-bulk-deactivate]").addEventListener("click", () => { void changeAccess([...selected], true); });
  toolbar.querySelector("[data-bulk-reactivate]").addEventListener("click", () => { void changeAccess([...selected], false); });
  toolbar.querySelector("[data-clear-selection]").addEventListener("click", () => { selected.clear(); refresh(); });
  refresh();
  return { refresh, clear: () => { selected.clear(); refresh(); } };
}
