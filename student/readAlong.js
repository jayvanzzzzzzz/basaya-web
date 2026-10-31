// Read-along for the lecture: while a sentence's audio plays, a soft pill glides behind each
// word as it is spoken and a faint trail grows under the words already read. The letters
// themselves never move or change color, so the sentence stays easy to read (the app's
// ReadAlongTextView does the same). Words are the sentence split on spaces, the split
// js/tts.js uses for the wordStarts saved with each sentence's audio. Audio generated before
// read-along has no wordStarts, so the times are estimated from the length of each word.

/** Fills the sentence line with one span per word, plus the bubble that moves between them. */
export function fillSentence(line, text) {
  const bubble = document.createElement("span");
  bubble.className = "st-word-bubble";
  bubble.setAttribute("aria-hidden", "true");
  line.replaceChildren(bubble);
  for (const part of text.trim().split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      line.append(" ");
      continue;
    }
    const word = document.createElement("span");
    word.className = "st-word";
    word.textContent = part;
    line.append(word);
  }
}

/** Estimated start of each word (seconds): the sound is shared out by word length, with a little silence first and last, and a pause after commas and full stops. */
function estimateStarts(words, duration) {
  const lead = Math.min(0.12, duration * 0.04);
  const tail = Math.min(0.35, duration * 0.08);
  const weights = words.map((word, i) => {
    const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
    if (i === words.length - 1) return 2 + letters;
    const pause = /[.!?…]["'”’)\]]*$/.test(word) ? 6 : /[,;:—–]["'”’)\]]*$/.test(word) ? 3 : 0;
    return 2 + letters + pause;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const speaking = Math.max(0, duration - lead - tail);
  let before = 0;
  return weights.map((weight) => {
    const start = lead + (speaking * before) / total;
    before += weight;
    return start;
  });
}

/**
 * Follows `player` through the sentence in `line` (filled by fillSentence) until the returned
 * function is called. `wordStarts` are the saved timings, or null to estimate them.
 */
export function followAlong(line, player, wordStarts) {
  const words = [...line.querySelectorAll(".st-word")];
  const bubble = line.querySelector(".st-word-bubble");
  if (!words.length || !bubble) return () => {};

  let starts = wordStarts?.length === words.length ? wordStarts : null;
  let current = -1;
  let frame = 0;

  const show = (index) => {
    words.forEach((word, i) => word.classList.toggle("is-read", i < index));
    const word = words[index];
    // The first word: the pill fades in where it is; after that it glides.
    if (current === -1) bubble.style.transition = "opacity var(--dur-fast) var(--ease-out)";
    bubble.style.width = `${word.offsetWidth + 12}px`;
    bubble.style.height = `${word.offsetHeight + 4}px`;
    bubble.style.transform = `translate(${word.offsetLeft - 6}px, ${word.offsetTop - 2}px)`;
    if (current === -1) {
      void bubble.offsetWidth;
      bubble.style.transition = "";
    }
    bubble.classList.add("is-on");
    current = index;
  };

  const tick = () => {
    const duration = player.duration;
    if (!starts && Number.isFinite(duration) && duration > 0) {
      starts = estimateStarts(
        words.map((word) => word.textContent),
        duration,
      );
    }
    const time = player.currentTime;
    if (starts && time > 0) {
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1] <= time) index += 1;
      if (index !== current) show(index);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    bubble.classList.remove("is-on");
    words.forEach((word) => word.classList.remove("is-read"));
  };
}
