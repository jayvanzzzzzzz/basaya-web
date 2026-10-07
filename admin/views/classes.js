import { state, getAllTeachers, getAllClasses } from "../../js/state.js";
import { $, escapeHtml, page, empty, time } from "../../js/helpers.js";

export async function renderClasses() {
  await Promise.all([getAllTeachers(), getAllClasses()]);

  const teacherNameById = new Map(
    state.teachers.map((t) => [t.id, t.displayName || t.email || "Unnamed teacher"]),
  );

  page("All classes", "Every class across the platform, with its teacher.");

  $("#page-content").innerHTML = state.allClasses.length
    ? `<div class="card">
        <table class="table">
          <thead>
            <tr><th>Class</th><th>Teacher</th><th>Created</th></tr>
          </thead>
          <tbody>
            ${state.allClasses
              .map(
                (c) => `<tr>
                  <td>${escapeHtml(c.className || "Untitled class")}</td>
                  <td>${escapeHtml(teacherNameById.get(c.teacherId) || "Unassigned")}</td>
                  <td>${time(c.createdAt)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`
    : empty(
        "No classes yet",
        "Classes will appear here once teachers create them.",
        "Refresh",
        "refresh-classes",
      );

  $("#refresh-classes")?.addEventListener("click", renderClasses);
}