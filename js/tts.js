import { auth } from "./firebase.js";

const WORKER_URL = "https://basaya-tts.jayvanzsingca5.workers.dev";

async function workerFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");

  const token = await user.getIdToken();
  const response = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let message = "Audio service request failed.";
    try {
      message = (await response.json()).error || message;
    } catch {
      // Fallback message remains when the Worker does not return JSON.
    }
    throw new Error(message);
  }

  return response;
}

/**
 * Generates the audio for `text`: { blob, wordStarts }. wordStarts is when each word starts,
 * in seconds (words = the text split on spaces, as the student's Lecture splits it), or null
 * when the Worker doesn't send timings (an older Worker answers with the bare MP3).
 */
export async function generateSpeech(text, voiceId) {
  const response = await workerFetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      timings: true,
      ...(voiceId ? { voiceId } : {}),
    }),
  });

  if (!(response.headers.get("Content-Type") || "").includes("application/json")) {
    return { blob: await response.blob(), wordStarts: null };
  }
  const { audioBase64, alignment } = await response.json();
  const bytes = Uint8Array.from(atob(audioBase64 || ""), (char) => char.charCodeAt(0));
  return { blob: new Blob([bytes], { type: "audio/mpeg" }), wordStarts: wordStartsFrom(alignment, text) };
}

/** The start time of each word from ElevenLabs' per-letter timings, or null if they don't fit. */
function wordStartsFrom(alignment, text) {
  const chars = alignment?.characters;
  const times = alignment?.character_start_times_seconds;
  if (!Array.isArray(chars) || !Array.isArray(times) || chars.length !== times.length) return null;
  const starts = [];
  let afterSpace = true;
  chars.forEach((char, i) => {
    const space = /\s/.test(char);
    if (!space && afterSpace) starts.push(Math.round(Number(times[i]) * 1000) / 1000);
    afterSpace = space;
  });
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return starts.length === wordCount && starts.every(Number.isFinite) ? starts : null;
}

export async function saveSpeech({
  audio,
  lessonId,
  section,
  pageNumber = 0,
  sentenceIndex = 0,
}) {
  const form = new FormData();
  form.append("audio", audio, "lesson-audio.mp3");
  form.append("lessonId", lessonId);
  form.append("section", section);
  form.append("pageNumber", String(pageNumber));
  form.append("sentenceIndex", String(sentenceIndex));

  const response = await workerFetch("/save-audio", {
    method: "POST",
    body: form,
  });

  return response.json();
}