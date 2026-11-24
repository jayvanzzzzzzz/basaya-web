// Saved attribution is shared with the Android dictionary cache.
export function dictionaryLastName(name = "") {
  const clean = String(name).trim().replace(/\s+/g, " ");
  if (clean.includes(",")) return clean.split(",")[0].trim();
  const parts = clean.replace(/^Teacher\s+/i, "").split(" ");
  if (parts.length > 2 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts.at(-1))) parts.pop();
  let start = parts.length - 1;
  while (start > 1 && /^(de|del|dela|delos|la|las|los|san|santa|sta|sto|santo|di|da|dos|van|von)$/i.test(parts[start - 1])) start--;
  return parts.slice(start).join(" ");
}

export const canManageDictionaryWord = (entry, role) =>
  ["teacher", "admin"].includes(role) && entry?.source === "teacher" && !entry.hidden;

export function dictionaryWasEdited(entry) {
  if (typeof entry.edited === "boolean") return entry.edited;
  const millis = (value) => value?.toMillis?.() ?? (value?.seconds != null ? value.seconds * 1000 + (value.nanoseconds || 0) / 1e6 : 0);
  return Boolean(entry.replaces || (entry.updatedBy && entry.createdBy && entry.updatedBy !== entry.createdBy) ||
    millis(entry.updatedAt) > millis(entry.createdAt));
}

export function dictionaryAttribution(entry) {
  if (entry.source !== "teacher") return "";
  const edited = dictionaryWasEdited(entry);
  const prefix = edited ? "updated" : "created";
  const name = entry[`${prefix}ByName`] || entry.createdByName || "";
  const role = entry[`${prefix}ByRole`] || (/^admin(?:\b|$)/i.test(name) ? "admin" : "teacher");
  const lastName = entry[`${prefix}ByLastName`] || dictionaryLastName(name);
  const actor = role === "admin" ? "Admin" : `Teacher${lastName ? ` ${lastName}` : ""}`;
  return `${edited ? "Edited" : "Added"} by ${actor}`;
}
