let installPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("st-install-app");
  if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) {
    button.hidden = true;
    return;
  }
  button.addEventListener("click", async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
    } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      alert("Sa Safari, pindutin ang Share at piliin ang Add to Home Screen para i-install ang BaSaya.");
    } else {
      alert("Buksan ang menu ng iyong browser at piliin ang Install app o Add to Home screen. Kung wala ang opsyon, maaaring hindi ito suportado ng browser.");
    }
  });
});

// Registration is independent of Firebase, so the offline page can work on later visits.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const root = new URL("../", location.href);
    navigator.serviceWorker.register(new URL("service-worker.js", root))
      .then(async () => {
        // Remove the old student-only worker after upgrading existing installations.
        const old = await navigator.serviceWorker.getRegistration(new URL("student/", root));
        if (old && old.scope === new URL("student/", root).href) await old.unregister();
      })
      .catch((error) => console.warn("BaSaya offline page unavailable:", error));
  });
}
