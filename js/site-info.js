// About / Privacy Policy / Contact pop-up, opened from the footer links
// (any button marked [data-site-info="about|privacy|contact"]).
// One dialog with three tabs, built here so every page shares the same text.
// The Contact tab's form lives in js/contact-form.js.

import { contactPanel, wireContactForm } from "./contact-form.js";

const SCHOOL = "Eastwoods Professional College of Science and Technology";
const PROGRAM = "Bachelor of Science in Information Technology";
const TEAM = ["Jay Vanz Singca", "Scean Dulatre", "Ronniel Olegario"];
const CLOSE_MS = 200;

const TABS = [
  { id: "about", label: "About" },
  { id: "privacy", label: "Privacy" },
  { id: "contact", label: "Contact" },
];

const initials = (name) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("");

const PANELS = {
  about: `
    <h2>About BaSaya</h2>
    <p>
      BaSaya is a Tagalog learning platform for Filipino classrooms. Teachers create
      classes, assign lessons and game levels, and follow each student's progress here on
      the web. Students learn, practice, and play in the BaSaya Android app or on this
      website, with the same account.
    </p>
    <div class="site-info__school">
      <p class="site-info__meta">A Capstone Project · ${PROGRAM}</p>
      <strong>${SCHOOL}</strong>
    </div>
    <h3>Developed by</h3>
    <ul class="site-info__team">
      ${TEAM.map((name) => `<li><span class="site-info__avatar" aria-hidden="true">${initials(name)}</span>${name}</li>`).join("")}
    </ul>
  `,
  privacy: `
    <h2>Privacy Policy</h2>
    <p>
      BaSaya only collects what it needs to run classes and track learning. We do not sell
      or share your information, and we do not show ads.
    </p>
    <h3>What we store</h3>
    <ul>
      <li>Account details: name, email or username, and role (student, teacher, or admin).</li>
      <li>Class information: the classes a student has joined and their teacher.</li>
      <li>Learning activity: lesson progress, game scores, and completed activities.</li>
      <li>Notifications about new lessons sent to the student's app.</li>
      <li>Contact form messages: emailed to the BaSaya team, not saved in the app.</li>
    </ul>
    <h3>How it is used</h3>
    <p>
      Data is used only to deliver lessons and to show teachers how their students are
      doing. It is stored securely in Google Firebase, and only the student's teacher and
      the school admin can see a student's progress.
    </p>
    <h3>Your choices</h3>
    <p>
      Students can ask to leave a class, and teachers can request that a class be deleted.
      To correct or remove your data, contact your school admin or message us in the Contact tab.
    </p>
    <p class="site-info__meta">Last updated: October 2026</p>
  `,
  contact: contactPanel,
};

const logoUrl = new URL("../img/logo.png", import.meta.url).href;

function build() {
  const dialog = document.createElement("dialog");
  dialog.className = "site-info";
  dialog.setAttribute("aria-label", "About BaSaya");
  dialog.innerHTML = `
    <div class="site-info__card">
      <div class="site-info__head">
        <p class="site-info__brand"><img src="${logoUrl}" alt="" /> BaSaya</p>
        <button class="site-info__close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <div class="site-info__tabs" role="tablist">
          ${TABS.map(
            (tab) =>
              `<button type="button" role="tab" id="site-info-tab-${tab.id}" data-tab="${tab.id}" aria-controls="site-info-${tab.id}" aria-selected="false" tabindex="-1">${tab.label}</button>`,
          ).join("")}
        </div>
      </div>
      <div class="site-info__body">
        ${TABS.map(
          (tab) =>
            `<section class="site-info__panel" role="tabpanel" id="site-info-${tab.id}" aria-labelledby="site-info-tab-${tab.id}" hidden>${PANELS[tab.id]}</section>`,
        ).join("")}
      </div>
    </div>
  `;
  document.body.append(dialog);
  return dialog;
}

let dialog = null;
let opener = null;

function select(id, focusTab = false) {
  dialog.querySelectorAll("[data-tab]").forEach((tab) => {
    const active = tab.dataset.tab === id;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focusTab) tab.focus();
  });
  dialog.querySelectorAll(".site-info__panel").forEach((panel) => {
    panel.hidden = panel.id !== `site-info-${id}`;
  });
  dialog.querySelector(".site-info__body").scrollTop = 0;
}

function open(id, button) {
  dialog ??= setUp();
  opener = button;
  select(id);
  dialog.classList.remove("is-closing");
  dialog.showModal();
  dialog.querySelector(`[data-tab="${id}"]`).focus();
}

/** Plays the exit animation, then closes. */
function close() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  setTimeout(() => {
    dialog.classList.remove("is-closing");
    dialog.close();
    opener?.focus();
  }, CLOSE_MS);
}

function setUp() {
  const element = build();
  element.querySelector(".site-info__close").addEventListener("click", close);
  wireContactForm(element.querySelector("#site-info-contact"));

  const tabs = [...element.querySelectorAll("[data-tab]")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab.dataset.tab));
    // Arrow keys move between tabs.
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      select(tabs[(index + step + tabs.length) % tabs.length].dataset.tab, true);
    });
  });

  element.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  // Click on the dimmed backdrop closes.
  element.addEventListener("click", (event) => {
    if (event.target === element) close();
  });
  return element;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-site-info]");
  if (button) open(button.dataset.siteInfo, button);
});
