let installPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener("appinstalled", () => { installPrompt = null; });

document.getElementById("pwa-install-button").addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
  } else {
    document.getElementById("pwa-install-help").showModal();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(new URL("service-worker.js", document.baseURI))
    .catch((error) => console.warn("BaSaya offline page unavailable:", error));
}
