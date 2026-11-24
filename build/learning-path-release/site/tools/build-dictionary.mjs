// Builds data/dictionary/tl-seed.json from a Tagalog Wiktionary dump.
//
//   1. Download tlwiktionary-latest-pages-articles.xml.bz2 from
//      https://dumps.wikimedia.org/tlwiktionary/latest/
//   2. Extract it (7-Zip, or `bzip2 -dk` in Git Bash).
//   3. node tools/build-dictionary.mjs path/to/tlwiktionary-latest-pages-articles.xml
//
// Only the Tagalog section of each page is kept, and only its numbered
// definitions (# ...), examples (#: ...) and synonyms. The content is
// CC BY-SA 4.0 (Wiktionary contributors), see data/dictionary/LICENSE.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWord } from "../js/dictionaryWords.js";

const source = process.argv[2];
if (!source) {
  console.error("Usage: node tools/build-dictionary.mjs <tlwiktionary-pages-articles.xml>");
  process.exit(1);
}
const outFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data/dictionary/tl-seed.json");

// Section headings that start a part of speech (shown to students as is).
const POS = {
  pangngalan: "pangngalan",
  "pangngalang pantangi": "pangngalang pantangi",
  pangngalang: "pangngalan",
  pandiwa: "pandiwa",
  berbo: "pandiwa",
  "pang-uri": "pang-uri",
  "pang-abay": "pang-abay",
  panghalip: "panghalip",
  "pang-ukol": "pang-ukol",
  pangatnig: "pangatnig",
  pandamdam: "pandamdam",
  bilang: "pamilang",
  pamilang: "pamilang",
  pantukoy: "pantukoy",
  "pang-angkop": "pang-angkop",
  parirala: "parirala",
  idyoma: "idyoma",
  panlapi: "panlapi",
  unlapi: "panlapi",
  hulapi: "panlapi",
  gitlapi: "panlapi",
};
const SYNONYMS = /^(magkasingkahulugan|singkahulugan|kasingkahulugan)$/;

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&");

/** Wiki markup to plain text. */
function clean(text) {
  let s = text
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "");
  // Templates, innermost first.
  for (let i = 0; i < 5 && s.includes("{{"); i++) {
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, body) => {
      const [name, ...args] = body.split("|").map((a) => a.trim());
      const plain = args.filter((a) => !a.includes("="));
      switch (name.toLowerCase()) {
        case "lb":
        case "lbl":
        case "label":
          return plain.length > 1 ? `(${plain.slice(1).join(", ")})` : "";
        case "ux":
        case "uxi":
        case "l":
        case "m":
        case "link":
          return plain[1] || "";
        case "gloss":
        case "gl":
          return plain[0] ? `(${plain[0]})` : "";
        default:
          return "";
      }
    });
  }
  return s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\S+\s([^\]]*)\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s:;,.-]+/, "")
    .trim();
}

const TAGALOG = (name) => /tagalog|\{\{=tl=\}\}/i.test(name) && !/wiktionary|question|administrador/i.test(name);
const headingOf = (line) => line.match(/^(={2,})\s*(.*?)\s*={2,}\s*$/);

/**
 * The Tagalog part of a page, or null. Most pages head it "==Tagalog==", some
 * "===Tagalog===" with the parts of speech at the same level, and some have no
 * language heading at all but sit in a Tagalog category.
 */
function tagalogSection(text, languages) {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const h = headingOf(lines[i]);
    if (!h) continue;
    const name = h[2].replace(/\[\[[^\]]*\]\]/g, "").trim();
    if (start >= 0) {
      if (h[1].length === 2 || languages.has(name)) return lines.slice(start, i);
    } else if (TAGALOG(name)) start = i + 1;
  }
  if (start >= 0) return lines.slice(start);
  const hasLanguage = lines.some((l) => {
    const h = headingOf(l);
    return h && (h[1].length === 2 || languages.has(h[2]));
  });
  return !hasLanguage && /\[\[(?:category|kategorya):[^\]]*tagalog/i.test(text) ? lines : null;
}

/** Accented spelling from {{tl-pr|aklát}} / {{tl-noun|aklát}} / "* bá·hay". */
function accented(lines) {
  for (const line of lines) {
    const t = line.match(/\{\{tl-(?:pr|noun|verb|adj|adv)\|([^|}=]+)/);
    if (t && /[À-ɏ]/.test(t[1])) return t[1].trim();
  }
  return "";
}

function parseEntry(title, lines) {
  const senses = [];
  const syn = new Set();
  let mode = null; // "pos" | "syn" | null
  let sense = null;
  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^={3,}\s*(.*?)\s*={3,}$/);
    if (heading) {
      const name = clean(heading[1]).toLowerCase().replace(/\s*\d+$/, "");
      if (POS[name]) {
        sense = { p: POS[name], d: [], e: [] };
        senses.push(sense);
        mode = "pos";
      } else mode = SYNONYMS.test(name) ? "syn" : null;
      continue;
    }
    if (mode === "syn" && line.startsWith("*")) {
      for (const m of line.matchAll(/\[\[([^\]|#]+)/g)) syn.add(m[1].trim());
      continue;
    }
    if (mode !== "pos") continue;
    if (/^#:/.test(line)) {
      // Synonym templates sit on example lines too.
      const s = line.match(/\{\{syn\|tl\|([^}]*)\}\}/);
      if (s) s[1].split("|").filter((w) => w && !w.includes("=")).forEach((w) => syn.add(w.trim()));
      else {
        const ex = clean(line.slice(2));
        if (ex.length > 3 && sense.e.length < 3) sense.e.push(ex);
      }
    } else if (/^#[^*:#]/.test(line)) {
      const def = clean(line.slice(1));
      // Some pages "define" a word as itself (kapiraso: "kapiraso").
      const self = normalizeWord(def.replace(/[.]+$/, "")) === normalizeWord(title);
      if (def.length > 2 && !self && sense.d.length < 8) sense.d.push(def);
    }
  }
  const kept = senses.filter((s) => s.d.length);
  if (!kept.length) return null;
  const entry = { w: title, k: normalizeWord(title), s: kept.map(({ p, d, e }) => (e.length ? { p, d, e } : { p, d })) };
  const a = accented(lines);
  if (a && normalizeWord(a) === entry.k) entry.a = a;
  syn.delete(title);
  if (syn.size) entry.syn = [...syn].slice(0, 8);
  return entry;
}

const xml = fs.readFileSync(source, "utf8");
const pages = [];
for (const page of xml.matchAll(/<page>([\s\S]*?)<\/page>/g)) {
  const body = page[1];
  if (body.match(/<ns>(\d+)<\/ns>/)?.[1] !== "0") continue;
  if (/<redirect /.test(body)) continue;
  pages.push({
    title: decodeXml(body.match(/<title>([^<]*)<\/title>/)[1]),
    text: decodeXml(body.match(/<text[^>]*>([\s\S]*?)<\/text>/)?.[1] || ""),
  });
}

// Language names = level-2 headings used on several pages ("Ingles", "Espanyol", …).
const h2Count = new Map();
for (const { text } of pages) {
  for (const m of text.matchAll(/^==([^=].*?)==\s*$/gm)) {
    const name = m[1].trim();
    h2Count.set(name, (h2Count.get(name) || 0) + 1);
  }
}
// A few pages put word sections at level 2 too ("== Pang-abay ==", "==Mga salin=="); those aren't languages.
const NOT_LANGUAGE =
  /^(mga )?(singkahulugan|magkasingkahulugan|salin|etimolohiya|pagbaybay|pagbigkas|kahulugan|salitang ingles|haliwbawang pangungusap|halimbawang gamit)$/i;
const languages = new Set(
  [...h2Count]
    .filter(([name, n]) => n >= 3 && !TAGALOG(name) && !POS[name.toLowerCase()] && !NOT_LANGUAGE.test(name))
    .map(([name]) => name.replace(/\[\[[^\]]*\]\]/g, "").trim()),
);

// "baybay" and "Baybay" are separate pages but one search key: merge them.
const byKey = new Map();
for (const { title, text } of pages) {
  const section = tagalogSection(text, languages);
  const entry = section && parseEntry(title, section);
  if (!entry) continue;
  const same = byKey.get(entry.k);
  if (!same) {
    byKey.set(entry.k, entry);
    continue;
  }
  const known = new Set(same.s.flatMap((s) => s.d));
  for (const s of entry.s) {
    const d = s.d.filter((def) => !known.has(def));
    if (d.length) same.s.push({ ...s, d });
  }
  if (entry.syn) same.syn = [...new Set([...(same.syn || []), ...entry.syn])].slice(0, 8);
  if (!same.a && entry.a) same.a = entry.a;
}
const entries = [...byKey.values()];
entries.sort((a, b) => a.k.localeCompare(b.k) || a.w.localeCompare(b.w));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(entries));
console.log(`${entries.length} words → ${outFile} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
