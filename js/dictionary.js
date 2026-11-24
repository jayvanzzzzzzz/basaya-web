import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { guessRoots, normalizeWord } from "./dictionaryWords.js";
import { cleanSyllables, syllabify } from "./syllables.js";
import { canManageDictionaryWord, dictionaryLastName } from "./dictionaryAttribution.js";

export { normalizeWord } from "./dictionaryWords.js";

// The Diksiyonaryo has two sources:
//   - data/dictionary/tl-seed.json: Tagalog Wiktionary words (CC BY-SA), served with the
//     site, so looking them up costs no Firestore reads. Rebuilt by tools/build-dictionary.mjs.
//   - dictionary/{key}: words teachers add or fix. The doc id is the search key
//     (normalizeWord), so a teacher's word replaces the seed word with the same key,
//     and `hidden: true` marks a seed word deleted (admins only).
// Every entry is shaped { word, key, accent, syllables, senses: [{ pos, definitions, examples }],
// synonyms, source: "wiktionary" | "teacher", hidden, ... }. `syllables` ("ba·hay") is a
// teacher's fix for the automatic split (js/syllables.js); empty means "split it automatically".

export const PARTS_OF_SPEECH = [
  "pangngalan",
  "pangngalang pantangi",
  "pandiwa",
  "pang-uri",
  "pang-abay",
  "panghalip",
  "pang-ukol",
  "pangatnig",
  "pandamdam",
  "pamilang",
  "pantukoy",
  "pang-angkop",
  "parirala",
  "idyoma",
  "panlapi",
];
export const MAX_WORD = 60;
export const MAX_SENSES = 5;

const SEED_URL = new URL("../data/dictionary/tl-seed.json", import.meta.url);
const words = collection(db, "dictionary");
let seed = null;
let seedKeys = new Set();

function fromSeed(e) {
  return {
    word: e.w,
    key: e.k,
    accent: e.a || "",
    syllables: "",
    senses: e.s.map((s) => ({ pos: s.p, definitions: s.d, examples: s.e || [] })),
    synonyms: e.syn || [],
    source: "wiktionary",
    hidden: false,
  };
}

function fromDoc(snap) {
  const d = snap.data();
  return {
    ...d,
    key: snap.id,
    accent: d.accent || "",
    syllables: d.syllables || "",
    senses: d.senses || [],
    synonyms: d.synonyms || [],
    source: seedKeys.has(snap.id) ? "wiktionary" : "teacher",
    hidden: !!d.hidden,
  };
}

/** The Wiktionary words, fetched once per page load. */
export function loadSeed() {
  seed ??= fetch(SEED_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Dictionary file: ${response.status}`);
      return response.json();
    })
    .then((list) => {
      const entries = list.map(fromSeed);
      seedKeys = new Set(entries.map(entry => entry.key));
      return entries;
    })
    .catch((error) => {
      seed = null; // try again next time
      throw error;
    });
  return seed;
}

// Teacher words are extra: if Firestore can't be reached (offline, rules not yet deployed), the Wiktionary words still work.
const orNothing = (promise, fallback) =>
  promise.catch((error) => {
    console.warn("Dictionary: teacher words unavailable", error);
    return fallback;
  });

async function teacherWordsStartingWith(prefix, max) {
  const snap = await getDocs(
    query(words, where("key", ">=", prefix), where("key", "<=", `${prefix}`), orderBy("key"), limit(max)),
  );
  await loadSeed();
  return snap.docs.map(fromDoc);
}

/** Words starting with `text`, the exact match first. Teacher words replace seed words with the same key. `includeHidden` is for the teacher page. */
export async function searchWords(text, { max = 30, includeHidden = false } = {}) {
  const prefix = normalizeWord(text);
  if (!prefix) return [];
  const [all, teacher] = await Promise.all([loadSeed(), orNothing(teacherWordsStartingWith(prefix, max), [])]);
  const found = new Map();
  for (const entry of all) if (entry.key.startsWith(prefix)) found.set(entry.key, entry);
  for (const entry of teacher) {
    if (entry.hidden && !includeHidden) found.delete(entry.key);
    else found.set(entry.key, { ...entry, replaces: found.get(entry.key) || null });
  }
  return [...found.values()]
    .sort((a, b) => (b.key === prefix) - (a.key === prefix) || a.key.localeCompare(b.key, "fil"))
    .slice(0, max);
}

/** One word by its spelling, or null (also null when a teacher hid it). */
export async function lookupWord(text) {
  const key = normalizeWord(text);
  if (!key || key.includes("/")) return null;
  const [all, snap] = await Promise.all([loadSeed(), orNothing(getDoc(doc(words, key)), null)]);
  if (snap?.exists()) return snap.data().hidden ? null : fromDoc(snap);
  return all.find((entry) => entry.key === key) || null;
}

/** Root words the dictionary has for an inflected word: "kumakain" → [kain]. Costs at most one Firestore query. */
export async function suggestRoots(text) {
  const roots = guessRoots(text).filter((root) => !root.includes("/"));
  if (!roots.length) return [];
  const [all, snap] = await Promise.all([
    loadSeed(),
    orNothing(getDocs(query(words, where("key", "in", roots.slice(0, 10)))), { docs: [] }),
  ]);
  const teacher = new Map(snap.docs.map((d) => [d.id, fromDoc(d)]));
  const seedByKey = new Map(all.map((entry) => [entry.key, entry]));
  return roots
    .map((root) => (teacher.has(root) ? teacher.get(root) : seedByKey.get(root)))
    .filter((entry) => entry && !entry.hidden)
    .slice(0, 3);
}

/** "ba·hay": the teacher's syllables if any, else the automatic split of the shown spelling. */
export const syllablesOf = (entry) => entry.syllables || syllabify(entry.accent || entry.word);

/**
 * Syllables for a word outside the dictionary page (Bigkas): a teacher's fix from
 * dictionary/{key} when there is one, else the automatic split. One small read, and
 * never fails: offline or a missing word just splits automatically.
 */
export async function syllablesFor(text) {
  const key = normalizeWord(text);
  if (key && !key.includes("/")) {
    const snap = await orNothing(getDoc(doc(words, key)), null);
    const fixed = snap?.exists() && !snap.data().hidden ? snap.data().syllables : "";
    if (fixed) return fixed;
  }
  return syllabify(text);
}

// teacher side

/**
 * Every word, A to Z, for the teacher/admin Dictionary page and the student "Lahat" list:
 * the seed with all teacher words laid over it. Deleted words (hidden markers) are left
 * out. Reads every teacher doc once.
 */
export async function allWords() {
  const [all, snap] = await Promise.all([loadSeed(), getDocs(words)]);
  const found = new Map(all.map((entry) => [entry.key, entry]));
  for (const d of snap.docs) {
    const entry = fromDoc(d);
    if (entry.hidden) {
      found.delete(entry.key);
      continue;
    }
    found.set(entry.key, { ...entry, replaces: found.get(entry.key)?.source === "wiktionary" ? found.get(entry.key) : null });
  }
  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key, "fil"));
}

// Who first added a word (kept on every save) and who changed it last.
const stamp = (owner, { user, name, profile }) => ({
  createdBy: owner?.createdBy || user.uid,
  createdByName: owner?.createdByName || name,
  createdAt: owner?.createdAt || serverTimestamp(),
  ...(owner?.createdByRole ? { createdByRole: owner.createdByRole } : !owner ? { createdByRole: profile.role } : {}),
  ...(owner?.createdByLastName ? { createdByLastName: owner.createdByLastName } : !owner ? { createdByLastName: profile.role === "teacher" ? profile.lastName || dictionaryLastName(name) : "" } : {}),
  updatedBy: user.uid,
  updatedByName: name,
  updatedAt: serverTimestamp(),
  updatedByRole: profile.role,
  updatedByLastName: profile.role === "teacher" ? profile.lastName || dictionaryLastName(name) : "",
  edited: Boolean(owner),
});

const wordDoc = ({ word, accent = "", syllables = "", senses, synonyms = [] }) => ({
  word: word.trim(),
  key: normalizeWord(word),
  accent: accent.trim(),
  syllables: cleanSyllables(syllables),
  senses,
  synonyms,
  hidden: false,
});

/** Adds or replaces a teacher word under its own spelling, keeping who first added it. */
export async function saveWord(fields, who) {
  if (!["teacher", "admin"].includes(who.profile?.role)) throw new Error("Only teachers and admins can manage dictionary words.");
  const key = normalizeWord(fields.word);
  if ((await loadSeed()).some(entry => entry.key === key)) throw new Error("Imported words cannot be edited.");
  const existing = await getDoc(doc(words, key));
  await setDoc(doc(words, key), { ...wordDoc(fields), ...stamp(existing.exists() ? existing.data() : null, who) });
  return key;
}

/**
 * Admins only: moves a word to a new spelling (the doc id is the spelling). The moved
 * word keeps who first added it. Imported spellings cannot be moved or replaced.
 * One batch, so it's never half moved.
 */
export async function renameWord(entry, fields, who) {
  if (who.profile?.role !== "admin" || !canManageDictionaryWord(entry, who.profile.role)) throw new Error("This word cannot be renamed.");
  const key = normalizeWord(fields.word);
  const imported = await loadSeed();
  if (imported.some(word => word.key === entry.key)) throw new Error("Imported words cannot be renamed.");
  if (imported.some(word => word.key === key) || (await getDoc(doc(words, key))).exists()) throw new Error("The destination word already exists.");
  const old = await getDoc(doc(words, entry.key));
  const owner = old.exists() ? old.data() : null;
  const batch = writeBatch(db);
  batch.set(doc(words, key), { ...wordDoc(fields), ...stamp(owner, who) });
  batch.delete(doc(words, entry.key));
  await batch.commit();
  return key;
}

/** Deletes a staff addition for everyone. Imported words cannot be deleted. */
export async function deleteWord(entry, who) {
  if (!canManageDictionaryWord(entry, who.profile?.role)) throw new Error("Imported words cannot be deleted.");
  if ((await loadSeed()).some(word => word.key === entry.key)) throw new Error("Imported words cannot be deleted.");
  return deleteDoc(doc(words, entry.key));
}
