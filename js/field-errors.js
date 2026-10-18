// Messages under a field in place of the browser's "Please fill out this field" bubble.
// Importing this file is enough for forms that use required / type="email" / minlength:
// the browser's own check still blocks the submit, but its bubble gives way to a message
// under the first-failing field. A field says what it needs with data-missing="…"
// (otherwise the message names its label). Checks done in JS (passwords that must match,
// a class code that doesn't exist) use fieldError(field, message) the same way.
// The message follows the page's lang: Filipino on the student side, English elsewhere.
// Styles: css/components/forms.css (.field-error).

const ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>';

const TEXT = {
  en: {
    missing: (label) => (label ? `Fill in “${label}” to continue.` : "Fill this in to continue."),
    choose: (label) => (label ? `Choose an option for “${label}”.` : "Choose an option to continue."),
    email: "That doesn't look like an email address. Check it has an @ and a domain, like name@gmail.com.",
    short: (min, count) => `Use at least ${min} characters. You have ${count} so far.`,
  },
  fil: {
    missing: (label) => (label ? `Punan ang “${label}” para magpatuloy.` : "Punan ito para magpatuloy."),
    choose: (label) => (label ? `Pumili para sa “${label}”.` : "Pumili muna ng isa."),
    email: "Mukhang mali ang email. Tingnan kung may @ at domain, hal. pangalan@gmail.com.",
    short: (min, count) => `Kailangan ng hindi bababa sa ${min} karakter. ${count} pa lang ang nailagay.`,
  },
};

const notes = new WeakMap(); // field → { note, kind }
let count = 0;

const text = (field) => TEXT[(field.closest("[lang]")?.lang || "").startsWith("fil") ? "fil" : "en"];

/** The label's own words, without the input, hints or optional tags inside it. */
function labelText(field) {
  const label = field.labels?.[0];
  if (!label) return field.placeholder || "";
  return [...label.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which browser check fails: "missing", "email", "short", "other" or "" (passes). */
function problemOf(field) {
  const v = field.validity;
  if (!v || v.valid) return "";
  if (v.valueMissing || (v.customError && field.dataset.blank)) return "missing";
  if (v.typeMismatch) return "email";
  if (v.tooShort) return "short";
  return v.customError ? "" : "other";
}

function messageFor(field, kind) {
  const words = text(field);
  if (kind === "missing")
    return field.dataset.missing || (field.tagName === "SELECT" ? words.choose : words.missing)(labelText(field));
  if (kind === "email") return field.dataset.invalid || words.email;
  if (kind === "short") return words.short(field.minLength, field.value.length);
  return field.validationMessage;
}

/** Right under the input (inside its label), or below the row when the label is a flex row. */
function place(field, note) {
  const label = field.closest("label");
  if (label && !getComputedStyle(label).display.includes("flex")) {
    const holder = [...label.children].find((child) => child.contains(field));
    holder.after(note);
    // The label's name stays the field's name; the message is its description.
    note.setAttribute("aria-hidden", "true");
    return;
  }
  const row = label || field.parentElement;
  (row.matches("form, fieldset") ? field : row).after(note);
}

function show(field, message, kind) {
  let entry = notes.get(field);
  if (!entry?.note.isConnected) {
    const note = document.createElement("span");
    note.className = "field-error";
    note.id = `field-error-${++count}`;
    note.innerHTML = `${ICON}<span></span>`;
    place(field, note);
    entry = { note };
    notes.set(field, entry);
    const described = (field.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
    field.setAttribute("aria-describedby", [...described, note.id].join(" "));
  }
  entry.kind = kind;
  entry.note.lastElementChild.textContent = message;
  field.setAttribute("aria-invalid", "true");
}

/** Shows `message` under `field`, or clears it when `message` is empty. True when shown. */
export function fieldError(field, message) {
  if (!field) return false;
  if (message) show(field, message, "custom");
  else clearFieldError(field);
  return Boolean(message);
}

export function clearFieldError(field) {
  const entry = notes.get(field);
  if (!entry) return;
  notes.delete(field);
  entry.note.remove();
  field.removeAttribute("aria-invalid");
  const described = (field.getAttribute("aria-describedby") || "").split(" ").filter((id) => id && id !== entry.note.id);
  if (described.length) field.setAttribute("aria-describedby", described.join(" "));
  else field.removeAttribute("aria-describedby");
}

export function clearFieldErrors(root) {
  root.querySelectorAll('[aria-invalid="true"]').forEach(clearFieldError);
}

/** Moves to the first field in `root` with a message. True when there was one. */
export function focusFirstError(root) {
  const field = root.querySelector('[aria-invalid="true"]');
  if (!field) return false;
  field.focus({ preventScroll: true });
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  field.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  return true;
}

// A required text field holding only spaces counts as empty, like the JS-checked forms.
function markBlank(field) {
  if (!field.required || !("setCustomValidity" in field) || field.type === "password") return;
  if (field.tagName === "SELECT" || ["checkbox", "radio", "file"].includes(field.type)) return;
  const blank = field.value !== "" && field.value.trim() === "";
  if (blank) field.dataset.blank = "1";
  else delete field.dataset.blank;
  field.setCustomValidity(blank ? " " : "");
}

const focusing = new WeakSet();

document.addEventListener(
  "invalid",
  (event) => {
    const field = event.target;
    event.preventDefault();
    markBlank(field);
    const kind = problemOf(field) || "other";
    show(field, messageFor(field, kind), kind);
    const form = field.form || field.closest("form") || document.body;
    if (focusing.has(form)) return;
    focusing.add(form);
    // Every failing field gets its message first; then the first one gets focus.
    setTimeout(() => {
      focusing.delete(form);
      focusFirstError(form);
    });
  },
  true,
);

function recheck(event) {
  const field = event.target;
  if (!(field instanceof Element) || !field.matches("input, select, textarea")) return;
  markBlank(field);
  const entry = notes.get(field);
  if (!entry) return;
  // A JS message clears once they change the field; a browser one once it's fixed.
  if (entry.kind === "custom") return clearFieldError(field);
  const kind = problemOf(field);
  if (kind !== entry.kind) return clearFieldError(field);
  if (kind === "short") entry.note.lastElementChild.textContent = messageFor(field, kind);
}

document.addEventListener("input", recheck, true);
document.addEventListener("change", recheck, true);
document.addEventListener("reset", (event) => clearFieldErrors(event.target), true);
