// Pantig: splits a Filipino word into syllables for display, "arkipelago" → "ar·ki·pe·la·go".
// Shared by the Diksiyonaryo, Bigkas and the admin lesson editor (no Firebase or DOM here).
// The Android app has the same rules in Syllables.kt, so keep the two in sync.
//
// Rules (KWF Ortograpiyang Pambansa), between two vowels:
//   - none:  a·raw → the vowels split            (ka·in)
//   - one:   it starts the next syllable         (ba·hay)
//   - two:   one on each side                    (ak·lat, bun·dok)
//   - three: two stay, one moves, unless the last two are a cluster like "tr" (sen·tro, es·kwe·la)
//   - four+: two and two                          (eks·tra)
// "ng" is one letter, consonants before the first vowel stay together (tra·ba·ho), and
// hyphens and spaces always end a syllable (pag-i·big). The result is only a guess: a
// teacher's `syllables` on the dictionary word wins (see syllablesFor in dictionary.js).

export const SYLLABLE_DOT = "·";

const VOWELS = "aeiou";
// Second letters that make a cluster with the consonant before them: tr, pl, kw, sy… and "ts".
const CLUSTER_ENDS = "lrwy";
const isCluster = (first, second) =>
  first.letter !== "ng" && (CLUSTER_ENDS.includes(second.letter) || first.letter + second.letter === "ts");

const base = (ch) => ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const isLetter = (ch) => /\p{L}/u.test(ch);

/** One run of letters (no hyphen or space) → its syllables. */
function splitRun(run) {
  // Letters with "ng" kept as one unit; each unit remembers its original text.
  const units = [];
  const chars = [...run];
  for (let i = 0; i < chars.length; i++) {
    if (base(chars[i]) === "n" && base(chars[i + 1] || "") === "g") {
      units.push({ text: chars[i] + chars[i + 1], vowel: false, letter: "ng" });
      i++;
    } else {
      const letter = base(chars[i]);
      units.push({ text: chars[i], vowel: VOWELS.includes(letter), letter });
    }
  }
  const vowels = units.map((u, i) => (u.vowel ? i : -1)).filter((i) => i >= 0);
  if (vowels.length < 2) return [run];

  // Where each new syllable starts (unit index).
  const starts = [];
  for (let v = 1; v < vowels.length; v++) {
    const from = vowels[v - 1] + 1;
    const between = vowels[v] - from;
    let cut;
    if (between <= 1) cut = from;
    else if (between === 2) cut = from + 1;
    else if (between === 3) {
      const [, second, third] = units.slice(from, from + 3);
      cut = isCluster(second, third) ? from + 1 : from + 2;
    } else cut = from + 2;
    starts.push(cut);
  }

  const syllables = [];
  let at = 0;
  for (const cut of [...starts, units.length]) {
    syllables.push(units.slice(at, cut).map((u) => u.text).join(""));
    at = cut;
  }
  return syllables;
}

/** "bahay" → "ba·hay", "pag-ibig" → "pag-i·big". Keeps the word's own case and accent marks. */
export function syllabify(word = "") {
  return String(word)
    .normalize("NFC")
    .trim()
    .split(/([^\p{L}]+)/u) // letters, then whatever is between them (hyphen, space, ')
    .map((part) => (part && isLetter([...part][0]) ? splitRun(part).join(SYLLABLE_DOT) : part))
    .join("");
}

/** A teacher's typed syllables, any dot style ("ba.hay", "ba•hay") → "ba·hay". */
export const cleanSyllables = (value = "") =>
  String(value)
    .normalize("NFC")
    .trim()
    .replace(/\s*[·.•‧∙]\s*/g, SYLLABLE_DOT);

/** The word the syllables spell, without the dots (for checking it matches the word). */
export const withoutDots = (value = "") => cleanSyllables(value).split(SYLLABLE_DOT).join("");
