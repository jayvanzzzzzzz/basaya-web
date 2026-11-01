import { Timestamp } from "firebase-admin/firestore";
import { AssessmentError, assessmentOperation } from "./assessments.js";
import { score } from "./pronunciationScoring.js";

// Only this module constructs speech evidence. HTTP clients cannot submit transcripts or scores.
export async function submitSpeech(db, uid, body, authorization, recognize = recognizeAudio) {
  const { audio, ...request } = body;
  if (typeof audio !== "string" || audio.length > 400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) throw new AssessmentError(400, "Submit a short WAV recording.");
  const wav = Buffer.from(audio, "base64");
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new AssessmentError(400, "Invalid WAV recording.");
  if (request.part !== "pronunciation") throw new AssessmentError(400, "Invalid speech request.");
  const checked = await assessmentOperation(db, uid, { ...request, operation: "speech-check" });
  if (checked.replay) return checked.replay;
  await db.runTransaction(async tx => {
    const ref = db.doc(`assessmentSpeechLimits/${uid}`);
    const snap = await tx.get(ref);
    const now = Date.now();
    const attempts = (snap.get("attempts") || []).filter(time => time > now - 3600000);
    if (attempts.length >= 300) throw new AssessmentError(429, "Too many recordings. Please try again later.");
    tx.set(ref, { attempts: [...attempts, now], expiresAt: Timestamp.fromMillis(now + 3600000) });
  });
  const text = await recognize(wav, authorization);
  if (!text.trim()) return { noSpeech: true };
  const verdict = score(checked.word, [text.slice(0, 256)]);
  return assessmentOperation(db, uid, { ...request, operation: "answer" }, { index: request.index, band: verdict.band });
}

async function recognizeAudio(wav, authorization) {
  try {
    const response = await fetch("https://basaya-stt.jayvanzsingca5.workers.dev/transcribe", {
      method: "POST", headers: { "Content-Type": "audio/wav", Authorization: authorization },
      body: wav, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Speech service unavailable");
    const result = await response.json();
    if (typeof result.text !== "string") throw new Error("Invalid speech response");
    return result.text;
  } catch {
    throw new AssessmentError(503, "Hindi available ang pagsuri ng pagbigkas. Subukan muli mamaya.");
  }
}
