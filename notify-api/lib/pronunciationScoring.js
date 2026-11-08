const normalize = (text) =>
  text.trim().toLowerCase().normalize("NFD").replace(/\p{Mn}+/gu, "").replace(/[^a-z]/g, "");

/** Tagalog speakers (and recognizers) freely swap o/u and e/i ("puno"/"punu", "babae"/"babai"), so treat those vowels as the same sound when comparing. */
const loose = (text) => text.replace(/o/g, "u").replace(/e/g, "i");

/** Get Ready requires the whole word/compound in order. Allow one extra
 * repeated consonant from recognition (budhi -> buddhi), never a missing
 * letter, a substituted consonant, a repeated vowel, or several slips.
 * Complete adjacent token spans handle spaces/hyphens and split words while
 * avoiding partial matches inside a different word. Legacy grading stays below.
 */
export function matchesGetReadyWord(targetWord, transcript) {
  const target = loose(normalize(targetWord));
  if (!target) return false;
  const words = (transcript.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) || []).map(word => loose(normalize(word))).filter(Boolean);
  const matches = heard => {
    if (heard === target) return true;
    if (heard.length !== target.length + 1) return false;
    for (let i = 1; i < heard.length; i++) {
      if (heard[i] === heard[i - 1] && /[bcdfghjklmnpqrstvwxyz]/.test(heard[i]) && heard.slice(0, i) + heard.slice(i + 1) === target) return true;
    }
    return false;
  };
  for (let start = 0; start < words.length; start++) {
    let heard = '';
    for (let end = start; end < words.length; end++) {
      heard += words[end];
      if (heard.length > target.length + 1) break;
      if (matches(heard)) return true;
    }
  }
  return false;
}

/** The recognizer may hear extra words ("ang bahay") or split one ("ba hay"). */
function candidateVariants(candidate) {
  const words = candidate.trim().toLowerCase().split(/[\s-]+/).map(normalize).filter(Boolean);
  if (!words.length) return [];
  const pairs = words.slice(1).map((word, index) => words[index] + word);
  return [...new Set([...words, ...pairs, words.join("")])];
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** "great", "okay" or "try-again". Short words must match exactly (one wrong letter usually makes another word); words over 7 letters allow a single slip, as "okay". */
export function score(targetWord, candidates, confidences = null) {
  const target = normalize(targetWord);
  let bestDistance = Infinity;
  let bestIndex = -1;
  candidates.forEach((candidate, index) => {
    const distance = Math.min(
      ...candidateVariants(candidate).map((variant) => levenshtein(loose(target), loose(variant))),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  const okay = target.length <= 7 ? 0 : 1;
  const band = bestDistance === 0 ? "great" : bestDistance <= okay ? "okay" : "try-again";
  return { band, distance: bestDistance, matched: candidates[bestIndex] ?? null, confidence: confidences?.[bestIndex] ?? 0.5 };
}
