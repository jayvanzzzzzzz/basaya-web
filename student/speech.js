import { auth } from "../js/firebase.js";

// Pronunciation checking for the student website, ported from the Android app:
// - record(): the app's VoiceRecorder.kt — 16 kHz mono WAV, records while held and finishes on release.
// - transcribe(): the app's WhisperSttClient.kt — basaya-stt (Whisper, Tagalog). The website
//   sends the student's Firebase sign-in token instead of the app's secret key.
// - listenWithBrowser(): the fallback when basaya-stt is busy, like the app's switch to
//   Android speech recognition.
// - score(): the app's PronunciationScorer.kt.

const STT_URL = "https://basaya-stt.jayvanzsingca5.workers.dev";
const TIMEOUT_MS = 15_000;

// Recording (VoiceRecorder.kt)

const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 320; // 20 ms
const CALIBRATION_FRAMES = 10; // 200 ms
const MIN_SPEECH_RMS = 0.015;
const MIN_SPEECH_FRAMES = 4; // 80 ms, ignores clicks and bumps
const MAX_FRAMES = 350; // 7 s hard limit

/** Prepare one microphone for the screen; open() also resumes audio from a hold on browsers requiring a user gesture. */
export class Microphone {
  constructor() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.context = AudioContextClass ? new AudioContextClass() : null;
    this.stream = null;
    this.opening = null;
    this.closed = false;
    this.processAudio = null;
    this.recordingId = 0;
  }

  static supported() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode && (window.AudioContext || window.webkitAudioContext));
  }

  /** Resolves "ok", "denied" or "unavailable". */
  async open() {
    if (!this.context || this.closed) return "unavailable";
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    if (this.closed) return "unavailable";
    if (this.stream?.active) return "ok";
    if (this.opening) return this.opening;
    this.opening = this.prepare();
    try { return await this.opening; }
    finally { this.opening = null; }
  }

  async prepare() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (this.closed) {
        stream.getTracks().forEach(track => track.stop());
        return "unavailable";
      }
      this.stream = stream;
      await this.context.audioWorklet.addModule(new URL("./microphone-worklet.js", import.meta.url));
      if (this.closed) return "unavailable";
      this.source = this.context.createMediaStreamSource(stream);
      this.processor = new AudioWorkletNode(this.context, "pronunciation-microphone");
      this.processor.port.onmessage = ({ data }) => {
        if (data.id !== this.recordingId) return;
        if (data.type === "audio") this.processAudio?.(data.samples);
        if (data.type === "stopped") this.finishRecording?.();
      };
      this.source.connect(this.processor);
      this.processor.connect(this.context.destination);
      return "ok";
    } catch (error) {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = null;
      return error?.name === "NotAllowedError" || error?.name === "SecurityError" ? "denied" : "unavailable";
    }
  }

  /**
   * Records until releaseSignal fires; silence never submits. `onLevel(0..1)` drives the mic ring.
   * Resolves { wav: Blob } or { noSpeech: true }. `signal` (AbortSignal) stops early.
   */
  record(onLevel = () => {}, signal, releaseSignal) {
    return new Promise((resolve) => {
      const id = ++this.recordingId;
      const ratio = this.context.sampleRate / SAMPLE_RATE;
      const pcm = []; // Int16 frames at 16 kHz
      let pending = new Float32Array(0);
      let position = 0; // read position in the input stream, in input samples
      let speechFrames = 0;
      let noiseFloor = 0;
      let calibrationFrames = 0;
      let frameIndex = 0;
      let smoothedLevel = 0;
      let done = false;

      const stop = (result) => {
        if (done) return;
        done = true;
        signal?.removeEventListener("abort", cancel);
        releaseSignal?.removeEventListener("abort", release);
        this.processAudio = null;
        this.cancelRecording = null;
        this.finishRecording = null;
        this.processor?.port.postMessage({ type: "stop", id });
        onLevel(0);
        resolve(result);
      };
      const cancel = () => stop({ cancelled: true });
      this.cancelRecording = cancel;
      this.finishRecording = () => stop(speechFrames >= MIN_SPEECH_FRAMES ? { wav: wavBlob(pcm) } : { noSpeech: true });
      const release = () => this.processor.port.postMessage({ type: "stop", id });
      signal?.addEventListener("abort", cancel, { once: true });
      releaseSignal?.addEventListener("abort", release, { once: true });
      if (signal?.aborted) { cancel(); return; }
      if (releaseSignal?.aborted) { stop({ noSpeech: true }); return; }

      this.processAudio = (input) => {
        if (done || frameIndex >= MAX_FRAMES) return;
        // Append the new input, then cut it into 20 ms frames at 16 kHz (linear resampling).
        const joined = new Float32Array(pending.length + input.length);
        joined.set(pending);
        joined.set(input, pending.length);

        while (position + FRAME_SAMPLES * ratio + 1 < joined.length) {
          const frame = new Int16Array(FRAME_SAMPLES);
          let sumSquares = 0;
          for (let i = 0; i < FRAME_SAMPLES; i += 1) {
            const at = position + i * ratio;
            const low = Math.floor(at);
            const value = joined[low] + (joined[low + 1] - joined[low]) * (at - low);
            const sample = Math.max(-1, Math.min(1, value));
            frame[i] = sample * 0x7fff;
            sumSquares += sample * sample;
          }
          position += FRAME_SAMPLES * ratio;
          pcm.push(frame);
          const rms = Math.sqrt(sumSquares / FRAME_SAMPLES);

          // Learn the room's background noise from the first moments.
          if (calibrationFrames < CALIBRATION_FRAMES) {
            noiseFloor = Math.min((noiseFloor * calibrationFrames + rms) / (calibrationFrames + 1), MIN_SPEECH_RMS / 4);
            calibrationFrames += 1;
          }
          if (rms > MIN_SPEECH_RMS / 2) speechFrames += 1;
          const threshold = Math.max(noiseFloor * 3, MIN_SPEECH_RMS);

          const level = Math.max(0, Math.min(1, (rms - noiseFloor) / (threshold * 4)));
          smoothedLevel += (level - smoothedLevel) * (level > smoothedLevel ? 0.6 : 0.2);
          onLevel(smoothedLevel);

          frameIndex += 1;
          if (frameIndex >= MAX_FRAMES) break; // Wait for release without growing the clip.
        }
        const keepFrom = Math.floor(position);
        pending = joined.slice(keepFrom);
        position -= keepFrom;
      };
      this.processor.port.postMessage({ type: "start", id });
    });
  }

  close() {
    this.closed = true;
    this.cancelRecording?.();
    this.processor?.disconnect();
    this.processor?.port.close();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.context?.close().catch(() => {});
  }
}

function wavBlob(frames) {
  const samples = frames.reduce((sum, frame) => sum + frame.length, 0);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  frames.forEach((frame) =>
    frame.forEach((sample) => {
      view.setInt16(offset, sample, true);
      offset += 2;
    }),
  );
  return new Blob([buffer], { type: "audio/wav" });
}

// basaya-stt (WhisperSttClient.kt)

/** { text } | { networkError: true } (offline/timeout) | { unavailable: true } (busy/limit). */
export async function transcribe(wav) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`${STT_URL}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav", Authorization: `Bearer ${token}` },
      body: wav,
      signal: controller.signal,
    });
    if (!response.ok) return { unavailable: true };
    const body = await response.json();
    return { text: String(body.text || "").trim() };
  } catch (error) {
    return navigator.onLine === false || error?.name === "AbortError" ? { networkError: true } : { unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}

// Browser speech recognition (the fallback)

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const browserRecognitionAvailable = () => Boolean(Recognition);

/** { candidates, confidences } | { noSpeech: true } | { unavailable: true }. */
export function listenWithBrowser(signal, releaseSignal) {
  return new Promise((resolve) => {
    if (!Recognition) return resolve({ unavailable: true });
    const recognizer = new Recognition();
    recognizer.lang = "fil-PH";
    recognizer.maxAlternatives = 5;
    recognizer.interimResults = false;
    recognizer.continuous = false;
    let pendingResult = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      releaseSignal?.removeEventListener("abort", release);
      resolve(result);
    };
    const cancel = () => { recognizer.abort(); finish({ cancelled: true }); };
    const release = () => {
      if (pendingResult) finish(pendingResult);
      else { try { recognizer.stop(); } catch { finish({ noSpeech: true }); } }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    releaseSignal?.addEventListener("abort", release, { once: true });
    if (signal?.aborted || releaseSignal?.aborted) { finish({ cancelled: true }); return; }
    recognizer.onresult = (event) => {
      const alternatives = [...(event.results[0] || [])];
      pendingResult = {
        candidates: alternatives.map((item) => item.transcript),
        confidences: alternatives.map((item) => item.confidence || 0.5),
      };
      if (releaseSignal?.aborted) finish(pendingResult);
    };
    recognizer.onerror = (event) =>
      finish(event.error === "not-allowed" || event.error === "service-not-allowed" ? { unavailable: true } : { noSpeech: true });
    recognizer.onend = () => {
      pendingResult ||= { noSpeech: true };
      if (releaseSignal?.aborted) finish(pendingResult);
    };
    try {
      recognizer.start();
    } catch {
      finish({ unavailable: true });
    }
  });
}

// Scoring (PronunciationScorer.kt)

/** Lowercase, accents removed (á → a, ñ → n), letters only, spaces and hyphens dropped. */
const normalize = (text) =>
  text.trim().toLowerCase().normalize("NFD").replace(/\p{Mn}+/gu, "").replace(/[^a-z]/g, "");

/** Tagalog speakers (and recognizers) freely swap o/u and e/i ("puno"/"punu", "babae"/"babai"), so treat those vowels as the same sound when comparing. */
const loose = (text) => text.replace(/o/g, "u").replace(/e/g, "i");

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
