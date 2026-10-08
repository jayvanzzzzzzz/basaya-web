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

export async function generateSpeech(text, voiceId) {
  const response = await workerFetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      ...(voiceId ? { voiceId } : {}),
    }),
  });

  return response.blob();
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