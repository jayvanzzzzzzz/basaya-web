import { escapeHtml } from "../../js/helpers.js";
import { LEVELS, remarkFor } from "../../js/scoring.js";

// Small pieces shared by the student progress page and the Class Report.
// Styles: css/pages/progress.css.

const SKILL_ICONS = {
  pagUnawa: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z" /><path d="M5 4.5v17M9 7h7m-7 4h5" />',
  talasalitaan: '<rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 17.5h7M17.5 14v7" />',
  pagkilala: '<path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" />',
  pagbigkas: '<rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3.5 0h7" />',
  pagsusulit: '<rect x="5" y="3.5" width="14" height="18" rx="2" /><path d="M9 3.5V2.8A.8.8 0 0 1 9.8 2h4.4a.8.8 0 0 1 .8.8v.7M9 12l2 2 4-4" />',
};

export const skillIcon = (key) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${SKILL_ICONS[key] || ""}</svg>`;

/** Circular score meter that sweeps in. `score` 0–100 or null. */
export function scoreRing(score, { color = "var(--primary)", size = 92, stroke = 9, label, sub } = {}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - value / 100);
  const text = label ?? (score == null ? "—" : `${score}%`);
  return `<div class="score-ring" style="--ring-size:${size}px; --ring-color:${color}">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="score-ring__track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}" />
      <circle class="score-ring__value" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"
        style="--circ:${circumference.toFixed(2)}; --offset:${offset.toFixed(2)}" stroke-dasharray="${circumference.toFixed(2)}" />
    </svg>
    <span class="score-ring__label"><strong>${escapeHtml(text)}</strong>${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</span>
  </div>`;
}

/** Tiny line chart of per-lesson scores (oldest → newest). */
export function sparkline(scores, color = "var(--primary)") {
  if (scores.length < 2) {
    return `<div class="sparkline sparkline--empty">${scores.length ? "1 lesson so far" : "No lessons yet"}</div>`;
  }
  const width = 140;
  const height = 40;
  const pad = 4;
  const step = (width - pad * 2) / (scores.length - 1);
  const points = scores.map((score, index) => [
    pad + index * step,
    height - pad - (Math.max(0, Math.min(100, score)) / 100) * (height - pad * 2),
  ]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${(pad + (scores.length - 1) * step).toFixed(1)},${height - pad}`;
  const [lastX, lastY] = points[points.length - 1];
  const help = height - pad - 0.6 * (height - pad * 2);
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" style="--spark-color:${color}" role="img" aria-label="Lesson scores: ${scores.join("%, ")}%">
    <line class="sparkline__help" x1="${pad}" x2="${width - pad}" y1="${help.toFixed(1)}" y2="${help.toFixed(1)}" />
    <polygon class="sparkline__area" points="${area}" />
    <polyline class="sparkline__line" points="${line}" pathLength="1" />
    <circle class="sparkline__dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5" />
  </svg>`;
}

/** "Very good" / "Good" / "Fair" / "Poor" / "Not enough data" chip. */
export function remarkChip(levelOrRemark) {
  const remark = typeof levelOrRemark === "string" ? LEVELS[levelOrRemark] : levelOrRemark;
  return `<span class="remark remark--${remark.key}" title="${escapeHtml(remark.app)}">${escapeHtml(remark.label)}</span>`;
}

export function trendBadge(trend) {
  if (!trend) return "";
  const map = {
    UP: ["up", "↑", "Improving"],
    DOWN: ["down", "↓", "Slipping"],
    STEADY: ["steady", "→", "Steady"],
  };
  const [key, arrow, label] = map[trend];
  return `<span class="trend trend--${key}"><b aria-hidden="true">${arrow}</b>${label}</span>`;
}

/** A score in a table cell, tinted by its remark band. */
export function scoreCell(score, { skipped = false } = {}) {
  if (skipped) return '<td class="score-cell score-cell--skip">Skipped</td>';
  if (score == null) return '<td class="score-cell score-cell--empty">—</td>';
  return `<td class="score-cell score-cell--${remarkFor(score).key}">${score}%</td>`;
}

const NOTE_ICONS = {
  alert: '<path d="M12 8v5m0 3.5v.01M10.3 3.6 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />',
  warn: '<circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" />',
  info: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.01" />',
  good: '<circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16 9.5" />',
};

export function remarksList(notes) {
  return `<ul class="remarks-list">${notes
    .map(
      (note) => `<li class="remarks-list__item remarks-list__item--${note.tone}">
        <span class="remarks-list__icon"><svg viewBox="0 0 24 24" aria-hidden="true">${NOTE_ICONS[note.tone]}</svg></span>
        <div><strong>${escapeHtml(note.title)}</strong><p>${escapeHtml(note.text)}</p></div>
      </li>`,
    )
    .join("")}</ul>`;
}

/** The legend explaining the remark bands. */
export const remarkLegend = () => `<div class="remark-legend" aria-label="How remarks are given">
  ${remarkChip("MAHUSAY")}<span>85–100%</span>
  ${remarkChip("UMUUNLAD")}<span>70–84%</span>
  ${remarkChip("NAGSISIMULA")}<span>50–69%</span>
  ${remarkChip("KAILANGAN_NG_TULONG")}<span>below 50%</span>
</div>`;

export function relativeTime(millis) {
  if (!millis) return "No activity yet";
  const minutes = Math.round((Date.now() - millis) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(millis).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const initials = (name = "") =>
  name
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "S";
