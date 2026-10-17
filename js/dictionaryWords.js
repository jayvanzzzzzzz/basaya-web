// Word helpers for the Diksiyonaryo, shared by the pages and tools/build-dictionary.mjs
// (no Firebase or DOM here, so Node can import it too).

/** Search key: "Báhay " → "bahay". Accent marks and case don't matter when looking up. */
export const normalizeWord = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Longest first, so "nakaka" is tried before "naka" and "na".
const PREFIXES = [
  "nakakapag", "nakaka", "pinakama", "pinaka", "magpa", "nagpa", "pagpa", "ipinag", "ipag", "ipina", "ipa",
  "pagka", "naka", "maka", "mapa", "napa", "mag", "nag", "pag", "mang", "nang", "pang", "mam", "nam", "pam",
  "man", "nan", "pan", "ma", "na", "ka", "pa", "um", "in", "i",
];
const SUFFIXES = ["han", "hin", "nan", "nin", "an", "in"];
const VOWEL = /[aeiou]/;

/** Drops one affix, infix or repeated syllable at a time: kumakain → kakain → kain. */
function strippings(word) {
  const out = [];
  for (const p of PREFIXES) if (word.startsWith(p)) out.push(word.slice(p.length));
  for (const s of SUFFIXES) if (word.endsWith(s)) out.push(word.slice(0, -s.length));
  // -um- / -in- after the first consonant: sumulat, sinulat → sulat.
  const infix = word.match(/^([^aeiou])(um|in)(.+)$/);
  if (infix) out.push(infix[1] + infix[3]);
  // Repeated first syllable: kakain → kain, susulat → sulat.
  const redup = word.match(/^([^aeiou]?[aeiou])\1(.+)$/);
  if (redup) out.push(redup[1] + redup[2]);
  // Words joined by an affix sometimes keep a hyphen: mag-aral → aral.
  if (word.includes("-")) out.push(word.slice(word.indexOf("-") + 1));
  return out.map((w) => w.replace(/^-/, "")).filter((w) => w.length >= 3 && VOWEL.test(w));
}

/**
 * Possible root words of an inflected word, closest first. Only a guess:
 * the caller keeps the ones the dictionary actually has.
 */
export function guessRoots(value, depth = 3) {
  const start = normalizeWord(value);
  const seen = new Set([start]);
  const found = [];
  let level = [start];
  for (let i = 0; i < depth && level.length; i++) {
    const next = [];
    for (const word of level) {
      for (const root of strippings(word)) {
        if (seen.has(root)) continue;
        seen.add(root);
        found.push(root);
        next.push(root);
      }
    }
    level = next;
  }
  return found;
}
