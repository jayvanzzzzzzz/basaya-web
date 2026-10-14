// Lecture audio, downloaded before the lecture opens so each sentence plays the moment it
// appears. views/lessonPath.js waits for the page the lecture opens on (with a spinner on the
// card), and views/lecture.js fetches the next page while the student reads. The audio
// worker (basaya-tts) allows any origin, so the files can be fetched as blobs.

/** 10 ms of silence, played on the card tap to unlock the player. */
const SILENCE =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const downloads = new Map(); // url -> Promise<object URL>
const ready = new Map(); // url -> object URL, once downloaded
let player = null;

/** The one audio element every lecture plays through. */
export function lecturePlayer() {
  if (!player) {
    player = new Audio();
    player.preload = "auto";
  }
  return player;
}

/**
 * Plays silence on the player. Call it inside the tap that opens the lecture: browsers (iPhone
 * Safari most of all) only let sound start right after a tap, and the lecture opens only once
 * its audio is downloaded. A player that played during a tap may keep playing later.
 */
export function unlockLecturePlayer() {
  const audio = lecturePlayer();
  if (audio.dataset.unlocked) return;
  audio.src = SILENCE;
  audio
    .play()
    .then(() => {
      audio.dataset.unlocked = "true";
      if (audio.src === SILENCE) audio.pause(); // never stop a sentence that already started
    })
    .catch(() => {});
}

/** Downloads one sentence's audio. A failed download is forgotten, so a retry downloads again. */
function download(url) {
  if (!downloads.has(url)) {
    const job = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Audio ${response.status}: ${url}`);
        return response.blob();
      })
      .then((blob) => {
        const local = URL.createObjectURL(blob);
        ready.set(url, local);
        return local;
      });
    job.catch(() => downloads.delete(url));
    downloads.set(url, job);
  }
  return downloads.get(url);
}

/** Resolves once every sentence of the page is downloaded; rejects if any download fails. */
export const downloadPageAudio = (page) =>
  Promise.all((page?.audioUrls || []).filter(Boolean).map(download));

/** The downloaded copy of a sentence's audio, or its URL (streamed) when not downloaded yet. */
export const audioSource = (url) => ready.get(url) || url;
