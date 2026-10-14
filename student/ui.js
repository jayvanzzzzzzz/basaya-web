import { $, escapeHtml, openModal } from "../js/helpers.js";

// Small UI pieces shared by the student screens: the lesson dialog, confetti, icons.

export const ICONS = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" />',
  cross: '<path d="M6 6l12 12M18 6 6 18" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />',
  back: '<path d="M15 18l-6-6 6-6" />',
  close: '<path d="M6 6l12 12M18 6 6 18" />',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />',
  search: '<circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  speaker: '<path d="M4 10v4h4l5 4V6L8 10H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />',
  mute: '<path d="M4 10v4h4l5 4V6L8 10H4Z" /><path d="m17 10 4 4m0-4-4 4" />',
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5v-15Z" /><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19v3H7.5" />',
  puzzle: '<path d="M9 4h6v3a2 2 0 1 0 4 0V4h1v6h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V4h5Z" />',
  pencil: '<path d="m15 5 4 4L8 20H4v-4L15 5Z" /><path d="m13 7 4 4" />',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 13l2 2 4-4" />',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z" />',
  chart: '<path d="M5 20V10m7 10V4m7 16v-7" />',
  user: '<circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" />',
  door: '<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4" />',
  key: '<circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-4 0 1.5 1.5" />',
  chevron: '<path d="m9 18 6-6-6-6" />',
  clock: '<circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.5M5 4 2.5 6.5M19 4l2.5 2.5" />',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" />',
  chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />',
};

export const icon = (name, className = "") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

/** The BaSaya buddy (the app's PronunciationBookView): the logo with a mood animation. */
export const buddy = (mood = "idle", className = "") =>
  `<img class="st-buddy st-buddy--${mood} ${className}" src="../img/logo.png" alt="" />`;

export function setBuddyMood(element, mood) {
  if (!element) return;
  element.className = element.className.replace(/st-buddy--\w+/, `st-buddy--${mood}`);
}

/**
 * The app's lesson status dialog: icon, title, message and one or two buttons.
 * Resolves with "primary", "secondary" or null when closed another way.
 */
export function showDialog({ iconName = "check", tone = "info", title, message, primary = "OK", secondary }) {
  return new Promise((resolve) => {
    let answer = null;
    openModal(
      `<div class="st-dialog">
        <span class="st-dialog__icon st-dialog__icon--${tone}">${icon(iconName)}</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="st-dialog__actions">
          <button class="button primary" type="button" data-answer="primary">${escapeHtml(primary)}</button>
          ${secondary ? `<button class="button secondary" type="button" data-answer="secondary">${escapeHtml(secondary)}</button>` : ""}
        </div>
      </div>`,
      (backdrop, close) => {
        backdrop.querySelector(".modal").classList.add("st-modal");
        backdrop.querySelectorAll("[data-answer]").forEach((button) =>
          button.addEventListener("click", () => {
            answer = button.dataset.answer;
            close();
          }),
        );
        new MutationObserver((_, observer) => {
          if (!backdrop.isConnected) {
            observer.disconnect();
            resolve(answer);
          }
        }).observe(document.body, { childList: true });
        backdrop.querySelector("[data-answer]")?.focus();
      },
    );
  });
}

// ---------- Confetti (the app's ConfettiView) ----------

const CONFETTI_COLORS = ["#ffc93c", "#4f8bff", "#8a6cf0", "#f25c54", "#24994a", "#ff8fb1"];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Pieces fall from the top (rain) or burst from a point (x, y in viewport pixels). */
export function confetti({ count = 120, x, y } = {}) {
  if (reducedMotion.matches) return;
  const canvas = document.createElement("canvas");
  canvas.className = "st-confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);

  const burst = x != null && y != null;
  const pieces = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    return {
      x: burst ? x : Math.random() * innerWidth,
      y: burst ? y : -20 - Math.random() * innerHeight * 0.5,
      vx: burst ? Math.cos(angle) * speed : (Math.random() - 0.5) * 2,
      vy: burst ? Math.sin(angle) * speed - 3 : 2 + Math.random() * 3,
      size: 6 + Math.random() * 6,
      spin: Math.random() * Math.PI,
      spinSpeed: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    };
  });

  const started = performance.now();
  const frame = (time) => {
    context.clearRect(0, 0, innerWidth, innerHeight);
    pieces.forEach((piece) => {
      piece.vy += 0.12;
      piece.vx *= 0.99;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.spin += piece.spinSpeed;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.spin);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      context.restore();
    });
    if (time - started < 3200) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Confetti from the middle of an element. */
export function confettiFrom(element, count = 34) {
  const box = element.getBoundingClientRect();
  confetti({ count, x: box.left + box.width / 2, y: box.top + box.height / 2 });
}

export function shake(element) {
  element.classList.remove("st-shake");
  void element.offsetWidth; // restart the animation
  element.classList.add("st-shake");
}

/** Stars row: `earned` of 3 turn gold and pop in one by one. */
export const stars = (earned, label) =>
  `<div class="st-stars" role="img" aria-label="${escapeHtml(label ?? `${earned} sa 3 bituin`)}">
    ${[0, 1, 2]
      .map((i) => `<span class="st-star${i < earned ? " is-earned" : ""}" style="--i:${i}">${icon("star")}</span>`)
      .join("")}
  </div>`;

/** Page content area of the student shell. */
export const content = () => $("#page-content");
