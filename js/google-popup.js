/** Watch only the Firebase auth popup. Closing it releases the UI, not Firebase's
 * credential exchange: a successful result may still arrive after window.close(). */
export function watchGooglePopup(authDomain, onClosed) {
  const originalOpen = window.open;
  let popup, interval, expired, stopped = false;
  const restore = () => { if (window.open === capture) window.open = originalOpen; };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    restore(); clearInterval(interval); clearTimeout(expired);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
  const check = () => {
    if (!popup || stopped) return;
    try {
      if (!popup.closed) return;
    } catch { return; } // A restricted WindowProxy is not evidence of cancellation.
    stop(); onClosed();
  };
  function capture(...args) {
    const opened = Reflect.apply(originalOpen, this, args);
    try {
      const url = new URL(String(args[0]), location.href);
      if (url.hostname === authDomain && url.pathname === '/__/auth/handler') {
        popup = opened;
        restore();
        if (popup) {
          interval = setInterval(check, 250);
          window.addEventListener('focus', check);
          document.addEventListener('visibilitychange', check);
        }
      }
    } catch { /* Leave unrelated windows alone. */ }
    return opened;
  }
  window.open = capture;
  // Do not leave the interception installed if SDK initialization never opens a popup.
  expired = setTimeout(restore, 30000);
  return stop;
}
