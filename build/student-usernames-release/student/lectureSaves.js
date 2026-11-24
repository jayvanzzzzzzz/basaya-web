// Page turns are immediate; acknowledgements remain ordered because the server
// accepts only the next unread page. A failed page stays queued for the next retry.
export function lectureSaves({ done = 0, total, key, save, onError = () => {} }) {
  let accepted = done;
  let target = done;
  let running = null;
  try {
    const pending = JSON.parse(localStorage.getItem(key) || "null");
    if (pending?.total === total && Number.isInteger(pending.done))
      target = Math.min(total, Math.max(done, pending.done));
  } catch { /* Storage may be disabled. The open lesson still keeps its queue. */ }

  const remember = () => {
    try {
      if (target > accepted) localStorage.setItem(key, JSON.stringify({ done: target, total }));
      else localStorage.removeItem(key);
    } catch { /* Reading remains available if storage is full. */ }
  };
  const flush = () => {
    if (running) return running;
    running = (async () => {
      // Start after this turn so an advance immediately following an empty
      // retry joins the same drain instead of waiting until the next page.
      await Promise.resolve();
      while (accepted < target) {
        await save(accepted + 1);
        accepted += 1;
        remember();
      }
    })().finally(() => { running = null; });
    return running;
  };
  const retry = () => flush().catch(onError);
  return {
    advance(next) {
      target = Math.min(total, Math.max(target, next));
      remember();
      retry();
    },
    retry,
    flush,
  };
}
