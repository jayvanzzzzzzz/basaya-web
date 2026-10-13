import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, escapeHtml, notify, openModal, safeHttpUrl } from "../../js/helpers.js";
import { SECTIONS, difficulty, icon } from "./lessonViewer.js";

// "Delete lesson": shows the lesson and everything that goes with it, then asks the
// admin to press and hold to delete. The deleted documents are kept in memory so the
// notice that follows can put them back (Undo). Styles: css/pages/lesson-delete.css.

const HOLD_MS = 1200;
const ICON_TRASH = '<path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" />';
const ICON_INFO = '<circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" />';

/** Tile labels say what the number counts. */
const TILE_LABELS = { activity: "Activity", lectures: "Lectures", pronunciation: "Words", quiz: "Questions", game: "Levels" };

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Every document under the lesson, as snapshots: { activity: [...], ..., game: [...] }. */
async function readSections(lessonId) {
  const entries = await Promise.all(
    SECTIONS.map(async ({ id }) => [id, (await getDocs(collection(db, "lessons", lessonId, id))).docs]),
  );
  return Object.fromEntries(entries);
}

function countsOf(snapshots) {
  const first = (id) => snapshots[id][0]?.data() || {};
  const lectures = first("lectures").pages || [];
  const pronunciation = first("pronunciation");
  const levels = snapshots.game.filter((item) => item.id !== "status");
  const skipped = snapshots.game.find((item) => item.id === "status")?.data().completion === "skipped";
  const clips = [
    ...lectures.flatMap((page) => page.cloudAudio || []),
    ...(pronunciation.cloudAudio || []),
  ].filter((clip) => safeHttpUrl(clip?.audioUrl)).length;
  return {
    activity: { value: first("activity").pages?.length || 0, unit: "page" },
    lectures: { value: lectures.length, unit: "page" },
    pronunciation: { value: pronunciation.words?.length || 0, unit: "word" },
    quiz: { value: first("quiz").questions?.length || 0, unit: "question" },
    game: { value: skipped ? 0 : levels.length, unit: "level" },
    clips,
  };
}

function dialogHtml(lesson) {
  const meta = difficulty(lesson.difficulty);
  return `<div class="lesson-delete">
    <header class="ld-head">
      <span class="ld-head__icon">${icon(ICON_TRASH)}</span>
      <div>
        <h2 id="lesson-delete-title">Delete this lesson?</h2>
        <p>It leaves the lesson library for good, and every class that uses it stops showing it.</p>
      </div>
    </header>

    <article class="ld-ticket" aria-label="Lesson to delete">
      <span class="ld-ticket__order"><small>Lesson</small>${escapeHtml(String(lesson.order ?? "—").padStart(2, "0"))}</span>
      <div class="ld-ticket__text">
        <strong>${escapeHtml(lesson.title || "Untitled lesson")}</strong>
        <span class="admin-lesson-difficulty ${meta.className}"><span aria-hidden="true"></span>${meta.label}</span>
      </div>
    </article>

    <section class="ld-impact" aria-labelledby="ld-impact-title">
      <div class="ld-impact__head">
        <span id="ld-impact-title">Deleted with it</span>
        <span class="ld-impact__total" data-total></span>
      </div>
      <ul class="ld-impact__grid">
        ${SECTIONS.map(
          (section) => `<li class="ld-tile" data-tile="${section.id}">
            ${icon(section.icon)}
            <strong class="ld-skeleton"></strong>
            <span>${TILE_LABELS[section.id]}</span>
          </li>`,
        ).join("")}
      </ul>
    </section>

    <p class="ld-note">${icon(ICON_INFO)}<span>Students keep the scores they already earned. Right after deleting, you can still undo.</span></p>
    <p class="form-error" id="lesson-delete-error" role="alert"></p>

    <div class="modal-actions ld-actions">
      <button type="button" class="button secondary" data-keep>Keep lesson</button>
      <button type="button" class="button danger ld-hold" data-hold aria-describedby="ld-hold-hint">
        <span class="ld-hold__fill" aria-hidden="true"></span>
        <span class="ld-hold__label">${icon(ICON_TRASH)}<span data-hold-text>Hold to delete</span></span>
      </button>
    </div>
    <p class="ld-hint" id="ld-hold-hint">Press and hold the button (or Space) to delete.</p>
  </div>`;
}

async function restore(lessonData, lessonId, removed) {
  const batch = writeBatch(db);
  batch.set(doc(db, "lessons", lessonId), lessonData);
  removed.forEach((item) => batch.set(item.ref, item.data()));
  await batch.commit();
}

/**
 * @param {object} lesson
 * @param {() => Promise<void>|void} onChange  re-renders the lesson list
 */
export function openDeleteLesson(lesson, onChange) {
  const title = lesson.title || "Untitled lesson";

  openModal(dialogHtml(lesson), (backdrop, close) => {
    const modal = backdrop.querySelector(".modal");
    modal.classList.add("lesson-delete-modal");
    modal.setAttribute("aria-labelledby", "lesson-delete-title");
    const hold = $("[data-hold]", modal);
    const holdText = $("[data-hold-text]", modal);
    const error = $("#lesson-delete-error", modal);
    let busy = false;
    let timer = null;
    let total = 0;

    // ── What goes with it ──
    readSections(lesson.id)
      .then((snapshots) => {
        const counts = countsOf(snapshots);
        SECTIONS.forEach(({ id }) => {
          const { value, unit } = counts[id];
          const tile = $(`[data-tile="${id}"]`, modal);
          const number = $("strong", tile);
          number.classList.remove("ld-skeleton");
          number.textContent = value || "—";
          tile.classList.toggle("is-empty", !value);
          tile.title = value ? plural(value, unit) : "Nothing here";
          total += value;
        });
        $("[data-total]", modal).textContent = [
          plural(total, "item"),
          counts.clips ? plural(counts.clips, "audio clip") : "",
        ]
          .filter(Boolean)
          .join(" · ");
      })
      .catch((err) => {
        console.warn("Could not count the lesson's content", err);
        $(".ld-impact", modal).classList.add("is-unknown");
        $("[data-total]", modal).textContent = "Couldn't count the content";
        modal.querySelectorAll(".ld-skeleton").forEach((el) => {
          el.classList.remove("ld-skeleton");
          el.textContent = "?";
        });
      });

    // ── Delete ──
    const remove = async () => {
      busy = true;
      hold.classList.remove("is-holding");
      hold.classList.add("is-busy");
      hold.setAttribute("aria-busy", "true");
      holdText.textContent = "Deleting…";
      modal.classList.add("is-busy");
      error.textContent = "";
      try {
        const [lessonSnap, snapshots] = await Promise.all([
          getDoc(doc(db, "lessons", lesson.id)),
          readSections(lesson.id),
        ]);
        const removed = Object.values(snapshots).flat();
        const batch = writeBatch(db);
        removed.forEach((item) => batch.delete(item.ref));
        batch.delete(lessonSnap.ref);
        await batch.commit();

        close();
        await onChange();
        const backup = lessonSnap.exists() ? lessonSnap.data() : null;
        notify({
          tone: "danger",
          title: "Lesson deleted",
          message: `“${title}”${removed.length ? ` and its ${plural(total || removed.length, "item")}` : ""} ${removed.length ? "were" : "was"} removed from the library.`,
          duration: 9000,
          action: backup && {
            label: "Undo",
            busyLabel: "Restoring…",
            run: async () => {
              try {
                await restore(backup, lesson.id, removed);
                await onChange();
                notify({ tone: "success", title: "Lesson restored", message: `“${title}” is back, with all of its content.` });
              } catch (err) {
                console.error(err);
                notify({ tone: "danger", title: "Couldn't restore the lesson", message: err.message });
              }
            },
          },
        });
      } catch (err) {
        console.error(err);
        busy = false;
        modal.classList.remove("is-busy");
        hold.classList.remove("is-busy");
        hold.removeAttribute("aria-busy");
        holdText.textContent = "Hold to delete";
        error.textContent = `Couldn't delete the lesson: ${err.message || "please try again"}.`;
      }
    };

    // ── Press and hold: a timer deletes; frames paint the fill (--hold, 0 to 1) ──
    let frame = null;
    const start = () => {
      if (busy || timer) return;
      const began = performance.now();
      hold.classList.add("is-holding");
      holdText.textContent = "Keep holding…";
      const paint = (now) => {
        hold.style.setProperty("--hold", Math.min(1, (now - began) / HOLD_MS));
        frame = requestAnimationFrame(paint);
      };
      frame = requestAnimationFrame(paint);
      timer = setTimeout(() => {
        cancelAnimationFrame(frame);
        timer = null;
        hold.style.setProperty("--hold", 1);
        remove();
      }, HOLD_MS);
    };
    const cancel = () => {
      if (!timer) return;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      timer = null;
      hold.classList.remove("is-holding");
      hold.style.setProperty("--hold", 0);
      holdText.textContent = "Hold to delete";
    };

    hold.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      hold.setPointerCapture(event.pointerId);
      start();
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => hold.addEventListener(type, cancel));
    hold.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (!event.repeat) start();
    });
    hold.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") cancel();
    });
    hold.addEventListener("blur", cancel);
    hold.addEventListener("contextmenu", (event) => event.preventDefault());

    $("[data-keep]", modal).addEventListener("click", () => {
      if (!busy) close();
    });
    setTimeout(() => $("[data-keep]", modal).focus(), 50);
  });
}
