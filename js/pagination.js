// Pagination for lists that are already rendered on the page.
//
// It doesn't touch the data: rows the page's search box hides ([hidden]) are left out
// of the count, and rows on other pages get [data-paged-out] (hidden by CSS). The page
// controls are inserted right after `after`. Styles: css/components/pagination.css.

const ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>';

// The words on the controls; the student side passes its own in Filipino.
const ENGLISH = {
  summary: (from, to, total, noun) => `Showing <strong>${from}–${to}</strong> of <strong>${total}</strong> ${noun}`,
  pages: (plural) => `${plural} pages`,
  page: (number) => `Page ${number}`,
  prev: "Prev",
  prevLabel: "Previous page",
  next: "Next",
  nextLabel: "Next page",
  rows: "Rows",
  rowsLabel: "Rows per page",
};

/** Page numbers to show, with "gap" where pages are skipped: 1 … 4 5 6 … 12 */
function pageList(current, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const list = [1];
  const from = Math.max(2, Math.min(current - 1, pages - 4));
  const to = Math.min(pages - 1, Math.max(current + 1, 5));
  if (from > 2) list.push("gap");
  for (let page = from; page <= to; page += 1) list.push(page);
  if (to < pages - 1) list.push("gap");
  list.push(pages);
  return list;
}

/**
 * @param {object} options
 * @param {() => Element[]} options.rows   The list's rows (re-read on every update).
 * @param {Element} options.after          The page controls go right after this element.
 * @param {HTMLInputElement} [options.search]  Back to page 1 whenever it changes.
 * @param {[string, string]} [options.label]   Singular and plural, e.g. ["lesson", "lessons"].
 * @param {number[]} [options.pageSizes]   Choices for "Rows per page"; the first is the default.
 * @param {number} [options.page]          Starting page.
 * @param {number} [options.pageSize]      Starting page size.
 * @param {(state: {page: number, pageSize: number}) => void} [options.onChange]
 *        Lets a view remember the page when it re-renders the whole list.
 * @param {Partial<typeof ENGLISH>} [options.text]  Other words for the controls.
 * @returns {{ refresh: () => void, reset: () => void }}
 */
export function paginate({
  rows,
  after,
  search,
  label = ["item", "items"],
  pageSizes = [10, 20, 50],
  page = 1,
  pageSize = pageSizes[0],
  onChange,
  text,
}) {
  if (!after) return { refresh() {}, reset() {} };

  const t = { ...ENGLISH, ...text };
  let current = page;
  let size = pageSizes.includes(pageSize) ? pageSize : pageSizes[0];

  after.parentElement
    .querySelectorAll(":scope > .pagination[data-for]")
    .forEach((old) => old.remove());
  const nav = document.createElement("nav");
  nav.className = "pagination";
  nav.dataset.for = "list";
  nav.setAttribute("aria-label", t.pages(label[1]));
  after.after(nav);

  const notify = () => onChange?.({ page: current, pageSize: size });

  function render({ animate = false, focus = null } = {}) {
    const all = rows();
    const visible = all.filter((row) => !row.hidden);
    const total = visible.length;
    const pages = Math.max(1, Math.ceil(total / size));
    current = Math.min(Math.max(1, current), pages);
    const start = (current - 1) * size;
    const end = Math.min(start + size, total);

    all.forEach((row) => row.removeAttribute("data-paged-out"));
    visible.forEach((row, index) => {
      const onPage = index >= start && index < end;
      row.toggleAttribute("data-paged-out", !onPage);
      if (onPage && animate) {
        // Restart the entrance animation for the rows of the new page.
        row.removeAttribute("data-page-enter");
        row.style.setProperty("--enter-index", String(index - start));
        void row.offsetWidth;
        row.setAttribute("data-page-enter", "");
      }
    });

    // Always shown, even for a single page; an empty list has its own empty-state row instead.
    nav.hidden = total === 0;
    if (nav.hidden) return;

    const noun = total === 1 ? label[0] : label[1];
    const pageButtons = pageList(current, pages)
      .map((item) =>
        item === "gap"
          ? '<li><span class="pagination__gap" aria-hidden="true">…</span></li>'
          : `<li><button type="button" class="pagination__button" data-page="${item}" aria-label="${t.page(item)}"${item === current ? ' aria-current="page"' : ""}>${item}</button></li>`,
      )
      .join("");

    nav.innerHTML = `
      <p class="pagination__summary" aria-live="polite">
        ${t.summary(start + 1, end, total.toLocaleString(), noun)}
      </p>
      <ul class="pagination__pages">
        <li><button type="button" class="pagination__button pagination__button--nav" data-page="prev" aria-label="${t.prevLabel}" ${current === 1 ? "disabled" : ""}>${ICON_PREV}<span>${t.prev}</span></button></li>
        ${pageButtons}
        <li><button type="button" class="pagination__button pagination__button--nav" data-page="next" aria-label="${t.nextLabel}" ${current === pages ? "disabled" : ""}><span>${t.next}</span>${ICON_NEXT}</button></li>
      </ul>
      <label class="pagination__size">
        ${t.rows}
        <select aria-label="${t.rowsLabel}">
          ${pageSizes.map((value) => `<option value="${value}"${value === size ? " selected" : ""}>${value}</option>`).join("")}
        </select>
      </label>`;

    if (focus) {
      const target =
        nav.querySelector(`[data-page="${focus}"]:not(:disabled)`) ||
        nav.querySelector('[aria-current="page"]');
      target?.focus({ preventScroll: true });
    }
  }

  // Bring the top of the list into view after switching pages.
  function scrollToList() {
    const first = rows().find((row) => !row.hidden && !row.hasAttribute("data-paged-out"));
    const top = (first || after).getBoundingClientRect().top;
    if (top < 80) window.scrollBy({ top: top - 110, behavior: "smooth" });
  }

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button || button.disabled) return;
    const target = button.dataset.page;
    current =
      target === "prev" ? current - 1 : target === "next" ? current + 1 : Number(target);
    render({ animate: true, focus: target });
    notify();
    scrollToList();
  });

  nav.addEventListener("change", (event) => {
    if (!event.target.matches("select")) return;
    size = Number(event.target.value);
    current = 1;
    render({ animate: true });
    nav.querySelector("select")?.focus({ preventScroll: true });
    notify();
  });

  // Runs after the page's own search handler (registered earlier), so the rows it hid are already hidden when we count.
  search?.addEventListener("input", () => {
    current = 1;
    render();
    notify();
  });

  render();
  return {
    refresh: () => render(),
    /** Back to page 1, e.g. after a filter changes which rows are hidden. */
    reset: () => {
      current = 1;
      render();
      notify();
    },
  };
}
