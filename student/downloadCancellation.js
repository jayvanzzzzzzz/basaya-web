// Firestore reads cannot be aborted, but their result must not advance a cancelled
// download. Audio fetches also receive the signal so active transfers are stopped.
export function withDownloadAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) {
    Promise.resolve(promise).catch(() => {});
    return Promise.reject(signal.reason || new DOMException("Download cancelled", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason || new DOMException("Download cancelled", "AbortError")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}
