const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function teacherNameFields(profile = {}) {
  // Preserve older unsplit names until an administrator supplies the separate names.
  if (profile.displayName && typeof profile.firstName !== "string") {
    return `<label>Full name<input name="displayName" required maxlength="240" value="${escape(profile.displayName)}" autocomplete="name"></label>`;
  }
  return `<label>First Name<input name="firstName" required maxlength="80" autocomplete="given-name" data-missing="Enter the teacher's first name." value="${escape(profile.firstName)}" placeholder="Juan"></label>
    <label>Last Name<input name="lastName" required maxlength="80" autocomplete="family-name" data-missing="Enter the teacher's last name." value="${escape(profile.lastName)}" placeholder="Dela Cruz"></label>
    <label>Middle Name (optional)<input name="middleName" maxlength="80" autocomplete="additional-name" value="${escape(profile.middleName)}" placeholder="Santos"></label>`;
}

export function readTeacherName(form) {
  const values = new FormData(form);
  if (!form.elements.firstName) return { displayName: String(values.get("displayName") || "").trim() };
  const firstName = String(values.get("firstName") || "").trim();
  const lastName = String(values.get("lastName") || "").trim();
  const middleName = String(values.get("middleName") || "").trim();
  return { firstName, lastName, middleName, displayName: [firstName, middleName, lastName].filter(Boolean).join(" ") };
}
