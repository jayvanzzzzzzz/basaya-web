// The rule for every password a person picks for themselves (register, change, reset):
// at least 8 characters with a small letter, a capital letter and a number.
// The Android app checks the same (data/auth/PasswordRule.kt).
// The admin's temporary teacher password only needs MIN_LENGTH characters.

export const MIN_LENGTH = 8;

/** Which parts of the rule `value` meets. */
export function passwordChecks(value) {
  return {
    length: value.length >= MIN_LENGTH,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /\d/.test(value),
  };
}

export const isStrongPassword = (value) => Object.values(passwordChecks(value)).every(Boolean);

const MESSAGES = {
  en: {
    length: `Use at least ${MIN_LENGTH} characters.`,
    lower: "Add a small letter (a–z).",
    upper: "Add a capital letter (A–Z).",
    number: "Add a number (0–9).",
  },
  fil: {
    length: `Dapat hindi bababa sa ${MIN_LENGTH} karakter.`,
    lower: "Lagyan ng maliit na titik (a–z).",
    upper: "Lagyan ng malaking titik (A–Z).",
    number: "Lagyan ng numero (0–9).",
  },
};

/** The first part of the rule `value` misses, as a message; "" when it passes. */
export function passwordProblem(value, lang = "en") {
  const checks = passwordChecks(value);
  const missing = Object.keys(checks).find((rule) => !checks[rule]);
  return missing ? MESSAGES[lang][missing] : "";
}

const RULE_LABELS = {
  en: {
    length: `At least ${MIN_LENGTH} characters`,
    lower: "A small letter (a–z)",
    upper: "A capital letter (A–Z)",
    number: "A number (0–9)",
  },
  fil: {
    length: `Hindi bababa sa ${MIN_LENGTH} karakter`,
    lower: "May maliit na titik (a–z)",
    upper: "May malaking titik (A–Z)",
    number: "May numero (0–9)",
  },
};

/** Checklist to put under a new-password field (styles: css/components/password-rules.css). */
export function passwordRulesMarkup(lang = "en") {
  const items = Object.entries(RULE_LABELS[lang])
    .map(([rule, label]) => `<li data-rule="${rule}">${label}</li>`)
    .join("");
  return `<ul class="password-rules" aria-live="polite">${items}</ul>`;
}

/** Ticks each rule in `list` as soon as what's typed in `input` meets it. */
export function watchPasswordRules(input, list) {
  const update = () =>
    Object.entries(passwordChecks(input.value)).forEach(([rule, ok]) =>
      list.querySelector(`[data-rule="${rule}"]`)?.classList.toggle("is-met", ok),
    );
  input.addEventListener("input", update);
  // form.reset() fires no input event; the fields are cleared right after "reset".
  input.form?.addEventListener("reset", () => setTimeout(update));
  update();
}
