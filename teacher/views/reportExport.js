import { $, escapeHtml, toast } from "../../js/helpers.js";
import { state } from "../../js/state.js";
import { LEVELS, remarkFor } from "../../js/scoring.js";
import { titledFullName } from "../../js/chat.js?v=removed-preview";

// Print (and "Save as PDF") and Excel export for the Class Report and student progress
// pages. Print styles: css/layout/print.css.

// Always print in the light theme: dark pages waste ink and print poorly.
let themeBeforePrint = null;
window.addEventListener("beforeprint", () => {
  themeBeforePrint = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = "light";
});
window.addEventListener("afterprint", () => {
  if (themeBeforePrint) document.documentElement.dataset.theme = themeBeforePrint;
  themeBeforePrint = null;
});

const ICON_PRINT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></svg>';
const ICON_SHEET =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9h17M3.5 14.5h17M9.5 9v11.5" /></svg>';

// "Ma'am Ana Reyes" when the teacher picked a title (Account settings).
export const teacherName = () =>
  titledFullName(state.profile?.displayName || "", state.profile?.title) || state.user?.email || "";

export const today = () =>
  new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

/** Adds "Print / PDF" and "Export Excel" to the page header's actions. */
export function addExportActions({ excel }) {
  const actions = $("#page-header .header-actions");
  if (!actions) return;
  actions.insertAdjacentHTML(
    "afterbegin",
    `<button class="button secondary report-action" id="print-report" type="button" title="Print, or choose “Save as PDF” as the printer">${ICON_PRINT}<span>Print / PDF</span></button>
     <button class="button secondary report-action" id="export-excel" type="button" title="Download an Excel file (.xlsx)">${ICON_SHEET}<span>Export Excel</span></button>`,
  );
  $("#print-report").addEventListener("click", () => window.print());
  $("#export-excel").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const label = button.querySelector("span");
    button.disabled = true;
    label.textContent = "Preparing…";
    try {
      await excel();
    } catch (error) {
      console.error("Excel export failed:", error);
      toast("We couldn't create the Excel file. Check your connection and try again.");
    } finally {
      button.disabled = false;
      label.textContent = "Export Excel";
    }
  });
}

/** Print-only heading: what this is, for which class, by whom, and when. */
export const printMeta = (title, lines = []) => `<header class="print-meta" aria-hidden="true">
    <div class="print-meta__brand"><img src="../img/logo.png" alt="" /><span>BaSaya</span></div>
    <div class="print-meta__text">
      <strong>${escapeHtml(title)}</strong>
      ${lines.filter(Boolean).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
    </div>
  </header>`;

/** Print-only sign-off line at the end of the report. */
export const printSignature = () => `<footer class="print-signature" aria-hidden="true">
    <div><span class="print-signature__line">${escapeHtml(teacherName())}</span><small>Prepared by (Teacher)</small></div>
    <div><span class="print-signature__line">${escapeHtml(today())}</span><small>Date</small></div>
  </footer>`;

// ---------- Excel ----------

/** A name that's safe in a file name: "Grade 3 / Sampaguita" → "Grade 3 Sampaguita". */
export const fileName = (text = "") =>
  text.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Report";

/** File-name date stamp, e.g. 2026-10-17. */
export const dateStamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// ExcelJS is ~1 MB, so it only loads the first time someone exports.
const EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
let excelJs = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  excelJs ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = EXCELJS_URL;
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => {
      excelJs = null;
      script.remove();
      reject(new Error("ExcelJS could not load"));
    };
    document.head.append(script);
  });
  return excelJs;
}

/** Shown in empty cells, so a blank never looks like a missing value. */
const NONE = "—";

// The site's remark colours (css/pages/progress.css), as Excel ARGB.
const TINTS = {
  "very-good": { fill: "FFE2F4E7", font: "FF1C7A3C" },
  good: { fill: "FFE3EBFB", font: "FF2C5BBF" },
  fair: { fill: "FFFCEFD9", font: "FF9C5605" },
  poor: { fill: "FFFBE2DF", font: "FFBF3A2B" },
  "no-data": { fill: "FFF0F2FA", font: "FF6B6F80" },
};
const TINT_BY_LABEL = Object.fromEntries(
  Object.values(LEVELS).map((level) => [level.label, TINTS[level.key]]),
);

const BRAND = "FF5A4FCF";
const MUTED = "FF6B6F80";
const BORDER = { style: "thin", color: { argb: "FFD9DCE8" } };
const BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** Remark bands, shown on every workbook's "Guide" sheet. */
const GUIDE_SHEET = {
  name: "Guide",
  title: "How to read this report",
  tables: [
    {
      columns: [
        { header: "Remark", type: "remark", width: 20 },
        { header: "Score", type: "center", width: 14 },
        { header: "Meaning", width: 60, wrap: true },
      ],
      rows: [
        ["Very good", "85–100%", "Strong in this skill."],
        ["Good", "70–84%", "Getting there."],
        ["Fair", "50–69%", "Needs more practice."],
        ["Poor", "below 50%", "Needs extra support."],
        ["Not enough data", "—", "Fewer than 2 lessons and 10 items so far, so no remark yet."],
      ],
    },
    {
      heading: "Terms",
      columns: [
        { header: "Term", width: 20, bold: true },
        { header: "", width: 14 },
        { header: "What it means", width: 60, wrap: true },
      ],
      rows: [
        ["Score", "", "First-try accuracy: correct answers ÷ attempts. Recent lessons count more."],
        ["Needs help", "", "The last two lessons in a skill were both below 60%."],
        ["Skipped", "", "The lesson has no game or activity, so that part counts as done."],
        ["—", "", "No result yet."],
      ],
    },
  ],
};

/**
 * Builds and downloads a formatted .xlsx.
 *
 * sheet:  { name, title, meta?: [[label, value]], tables: [table] }
 * table:  { heading?, columns: [column], rows: [[value]], filter?, freeze? }
 * column: { header, width, type?, wrap?, bold? }
 *   type "score"   — 0–100 or null; shown as a %, tinted by remark band
 *        "percent" — 0–100 or null; shown as a %
 *        "remark"  — a remark label ("Very good"…), tinted
 *        "number" / "center" — centred; default is left-aligned text
 */
export async function downloadWorkbook(filename, sheets, { guide = true } = {}) {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BaSaya";
  workbook.created = new Date();

  for (const sheet of guide ? [...sheets, GUIDE_SHEET] : sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31), {
      pageSetup: {
        paperSize: 9, // A4
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
      headerFooter: { oddFooter: `&L${sheet.title}&RPage &P of &N` },
    });

    // Title and details overflow to the right, so they don't fight the column widths.
    ws.addRow([sheet.title]).getCell(1).font = { bold: true, size: 16, color: { argb: BRAND } };
    ws.addRow([`BaSaya · ${today()}`]).getCell(1).font = { size: 10, color: { argb: MUTED } };
    if (sheet.meta?.length) {
      ws.addRow([]);
      sheet.meta.forEach(([label, value]) => {
        ws.addRow([{
          richText: [
            { font: { bold: true }, text: `${label}:  ` },
            { text: value == null || value === "" ? NONE : String(value) },
          ],
        }]);
      });
    }

    const widths = [];
    sheet.tables.forEach((table) => {
      ws.addRow([]);
      if (table.heading) {
        const heading = ws.addRow([table.heading.toUpperCase()]);
        heading.getCell(1).font = { bold: true, size: 12, color: { argb: BRAND } };
      }

      const header = ws.addRow(table.columns.map((column) => column.header));
      header.height = 22;
      table.columns.forEach((column, index) => {
        const cell = header.getCell(index + 1);
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = fill(BRAND);
        cell.border = BORDERS;
        cell.alignment = {
          vertical: "middle",
          horizontal: column.type && column.type !== "remark" ? "center" : "left",
          wrapText: true,
        };
        widths[index] = Math.max(widths[index] || 0, column.width || 12);
      });

      if (!table.rows.length) {
        ws.addRow(["Nothing to show yet."]).getCell(1).font = { italic: true, color: { argb: MUTED } };
        return;
      }

      const firstRow = header.number + 1;
      table.rows.forEach((values) => {
        const row = ws.addRow([]);
        table.columns.forEach((column, index) => writeCell(row.getCell(index + 1), values[index], column));
      });

      if (table.freeze) ws.views = [{ state: "frozen", ySplit: header.number, xSplit: table.freeze }];
      if (table.filter) {
        ws.autoFilter = {
          from: { row: header.number, column: 1 },
          to: { row: firstRow + table.rows.length - 1, column: table.columns.length },
        };
      }
    });
    widths.forEach((width, index) => {
      ws.getColumn(index + 1).width = width;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function writeCell(cell, value, column) {
  const { type } = column;
  cell.border = BORDERS;
  cell.alignment = {
    vertical: "middle",
    horizontal: type && type !== "remark" ? "center" : "left",
    wrapText: Boolean(column.wrap),
  };
  if (column.bold) cell.font = { bold: true };

  if (value === "") return;
  if (value == null) {
    cell.value = NONE;
    cell.font = { color: { argb: MUTED } };
    cell.alignment = { ...cell.alignment, horizontal: "center" };
    return;
  }

  if ((type === "score" || type === "percent") && typeof value === "number") {
    cell.value = value / 100;
    cell.numFmt = "0%";
    if (type === "score") {
      const tint = TINTS[remarkFor(value).key];
      cell.fill = fill(tint.fill);
      cell.font = { bold: true, color: { argb: tint.font } };
    }
    return;
  }

  cell.value = value;
  if (type === "score") {
    // Text in a score column, e.g. "Skipped".
    cell.font = { italic: true, color: { argb: MUTED } };
  } else if (type === "remark" && TINT_BY_LABEL[value]) {
    cell.fill = fill(TINT_BY_LABEL[value].fill);
    cell.font = { bold: true, color: { argb: TINT_BY_LABEL[value].font } };
  }
}
