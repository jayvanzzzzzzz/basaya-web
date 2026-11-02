import { postToApi } from "../../js/api.js";
import { assistantHelp } from "../../js/assistantHelp.js";
import { escapeHtml } from "../../js/helpers.js";
import { student } from "../data.js";
import { content, icon } from "../ui.js";
import { onLeave } from "../router.js";

// In-memory only, scoped to the signed-in user; no transcript in browser storage.
let session = { uid: null, messages: [] };
const guideIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".8" style="fill:currentColor;stroke:none"/></svg>`;
export function renderAssistant() {
  if (session.uid !== student.uid) session = { uid: student.uid, messages: [] };
  const messages = session.messages;
  const root = content();
  root.innerHTML = `
    <section class="st-chat st-assistant" aria-labelledby="assistant-title">
      <div class="chat">
        <header class="chat-head">
          <span class="inbox-class__avatar" style="--h:250" aria-hidden="true">${icon("chat")}</span>
          <div class="chat-head__text"><h2 id="assistant-title">BaSaya Assistant <span class="st-assistant__badge">AI</span></h2><span>Gabay sa paggamit ng BaSaya</span></div>
          <button type="button" id="assistant-help-toggle" class="st-assistant__icon-button st-assistant__icon-button--guide" aria-label="Mga gabay" title="Mga gabay" aria-expanded="false" aria-controls="assistant-help">${guideIcon}</button>
        </header>
        <div class="chat-scroll" id="assistant-scroll">
          <ol class="chat-messages" id="assistant-messages" role="log" aria-live="polite" aria-label="Pag-uusap">
            <li class="chat-msg st-assistant__message"><span class="chat-msg__avatar st-assistant__avatar" aria-hidden="true"><img src="../img/logo.png" alt="" /></span><div class="chat-msg__body"><span class="chat-msg__name">BaSaya Assistant</span><div class="chat-msg__bubble"><p>Kumusta! Paano kita matutulungan sa paggamit ng BaSaya?</p></div></div></li>
          </ol>
          <div class="st-assistant__suggestions" aria-label="Mga mungkahing tanong">
            ${assistantHelp.slice(0, 4).map(a => `<button type="button" data-question="${a.id}">${escapeHtml(a.question)}</button>`).join("")}
          </div>
        </div>
        <p id="assistant-status" class="st-assistant__status" role="status">Sinusuri ang availability…</p>
        <button id="assistant-reconnect" type="button" class="st-assistant__text-button" hidden>Suriin muli ang koneksyon</button>
        <form class="chat-composer" id="assistant-form">
          <textarea id="assistant-question" rows="1" maxlength="500" placeholder="Sumulat ng tanong…" aria-label="Tanong sa BaSaya Assistant" aria-describedby="assistant-privacy assistant-status" required></textarea>
          <span id="assistant-count" class="chat-composer__count" hidden></span>
          <button class="chat-composer__send" type="submit" id="assistant-send" aria-label="Ipadala">${icon("chat")}</button>
        </form>
        <footer class="st-assistant__meta"><span id="assistant-privacy">AI · Huwag magbahagi ng personal na detalye.</span><span id="assistant-quota" role="status"></span></footer>
        <aside id="assistant-help" class="st-assistant__help" aria-labelledby="assistant-help-title" hidden>
          <h2 id="assistant-help-title">Mga mabilisang gabay</h2><p>Magagamit kahit walang AI o internet.</p>
          <label for="assistant-search">Maghanap ng gabay</label><input type="search" id="assistant-search" placeholder="Klase, password…" />
          <div id="assistant-articles">${assistantHelp.map(a => `<details data-article="${a.id}"><summary>${escapeHtml(a.title)}</summary><p>${escapeHtml(a.text)}</p><a href="#${a.route}">${escapeHtml(a.link)} →</a></details>`).join("")}</div>
          <p id="assistant-no-help" hidden>Walang katugmang gabay.</p>
          <p>Ang bawat tanong ay hiwalay. Ipinapadala sa AI ang tanong at maaaring magkamali ang sagot. Para sa aralin at resulta, kausapin ang guro sa <a href="#/chat">Class Chat</a>.</p>
        </aside>
      </div>
    </section>`;
  const $ = selector => root.querySelector(selector);
  const input = $("#assistant-question"), send = $("#assistant-send"), log = $("#assistant-messages");
  let active = true, busy = false, ready = false, available = false, remaining = null, unlimited = false, nextAllowedAt = 0, blockUntil = 0, resetAt = 0;
  let notice = "", controller, failed = false, typing, revealTimer, finishPause;
  function append(role, text, remember = true, animate = false) {
    const article = document.createElement("li");
    article.className = `chat-msg st-assistant__message${role === "user" ? " is-mine st-assistant__message--user" : role === "error" ? " st-assistant__message--error" : ""}`;
    const body = document.createElement("div"), bubble = document.createElement("div");
    body.className = "chat-msg__body"; bubble.className = "chat-msg__bubble";
    const name = document.createElement("span"), paragraph = document.createElement("p");
    name.className = "chat-msg__name";
    name.textContent = role === "user" ? "Ikaw" : role === "error" ? "Hindi naipadala" : "BaSaya Assistant";
    paragraph.textContent = animate ? "" : text;
    if (role === "typing") {
      paragraph.className = "st-assistant__typing";
      paragraph.setAttribute("aria-label", "Sumasagot ang BaSaya Assistant");
      paragraph.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
    }
    bubble.append(paragraph); body.append(name, bubble);
    if (role !== "user") {
      const avatar = document.createElement("span"), logo = document.createElement("img");
      avatar.className = "chat-msg__avatar st-assistant__avatar"; avatar.setAttribute("aria-hidden", "true");
      logo.src = "../img/logo.png"; logo.alt = ""; avatar.append(logo); article.append(avatar);
    }
    article.append(body); log.append(article);
    if (remember) { messages.push({ role, text }); if (messages.length > 20) messages.splice(0, messages.length - 20); }
    while (log.children.length > 21) log.children[1].remove();
    $("#assistant-scroll").scrollTop = $("#assistant-scroll").scrollHeight;
    return { article, paragraph };
  }
  async function revealAnswer(text) {
    // Save the complete answer before animating so reopening never replays it.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { paragraph } = append("assistant", text, true, !reduced);
    if (reduced) return;
    const segments = typeof Intl.Segmenter === "function"
      ? [...new Intl.Segmenter("fil", { granularity: "sentence" }).segment(text)].map(item => item.segment)
      : text.split(/(?<=[.!?])(?=\s)/);
    paragraph.setAttribute("aria-busy", "true");
    for (let index = 0; index < segments.length && active; index++) {
      const scroller = $("#assistant-scroll");
      const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
      const sentence = document.createElement("span");
      sentence.className = "st-assistant__sentence";
      sentence.textContent = segments[index]; paragraph.append(sentence);
      if (atBottom) scroller.scrollTop = scroller.scrollHeight;
      if (index < segments.length - 1) await new Promise(resolve => {
        finishPause = resolve;
        revealTimer = setTimeout(() => { finishPause = null; resolve(); }, 500);
      });
    }
    paragraph.removeAttribute("aria-busy");
  }
  messages.forEach(m => append(m.role, m.text, false));
  function update() {
    if (!active) return;
    const wait = Math.max(0, Math.ceil((Math.max(nextAllowedAt, blockUntil) - Date.now()) / 1000));
    const exhausted = !unlimited && remaining === 0 && Date.now() < resetAt;
    send.disabled = busy || !ready || !available || !navigator.onLine || exhausted || wait > 0 || !input.value.trim();
    input.disabled = busy;
    root.querySelectorAll("[data-question]").forEach(button => { button.disabled = busy; });
    $("#assistant-count").textContent = `${input.value.length} / 500`;
    $("#assistant-count").hidden = input.value.length < 400;
    $(".st-assistant__suggestions").hidden = messages.some(message => message.role === "user");
    $("#assistant-quota").textContent = !ready ? "" : unlimited ? "Debug · No daily limit" : remaining === null ? "" : `${remaining} question${remaining === 1 ? "" : "s"} left`;
    send.setAttribute("aria-busy", String(busy));
    $("#assistant-reconnect").hidden = !ready || available || !navigator.onLine || busy;
    send.innerHTML = busy ? '<span aria-hidden="true">…</span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12 20 4.5 13.5 20l-2.2-6.3L4.5 12Z" /><path d="m11.3 13.7 4-4" /></svg>';
    send.setAttribute("aria-label", busy ? "Sumasagot" : "Ipadala");
    $("#assistant-status").textContent = !navigator.onLine ? "Walang internet. Magagamit pa rin ang mga gabay."
      : busy ? "" : !ready ? "Sinusuri ang availability…"
      : notice || (!available ? "Hindi available ang AI ngayon. Gamitin muna ang mga gabay."
        : exhausted ? `Naubos na ang tanong mo. Magre-reset sa ${new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
        : wait ? `Maaari muling magtanong sa loob ng ${wait} segundo.`
        : "");
    $("#assistant-status").hidden = !$("#assistant-status").textContent;
  }
  function applyUsage(result) {
    remaining = result.remaining;
    unlimited = result.unlimited === true;
    nextAllowedAt = result.nextAllowedAt || 0;
    resetAt = result.resetAt || 0;
  }
  async function status() {
    if (!active || busy || !navigator.onLine) { update(); return; }
    try {
      const result = await postToApi("assistant", { action: "status" });
      if (!active || busy) return;
      applyUsage(result); available = result.available; notice = "";
    } catch { if (active) { available = false; notice = "Hindi makakonekta sa assistant. Gamitin muna ang mga gabay."; } }
    finally { if (active) { ready = true; update(); } }
  }
  input.addEventListener("input", update);
  $("#assistant-help-toggle").addEventListener("click", () => {
    const panel = $("#assistant-help"), toggle = $("#assistant-help-toggle");
    panel.hidden = !panel.hidden; toggle.setAttribute("aria-expanded", String(!panel.hidden));
    toggle.setAttribute("aria-label", panel.hidden ? "Mga gabay" : "Isara ang mga gabay");
    toggle.title = panel.hidden ? "Mga gabay" : "Isara ang mga gabay";
    if (!panel.hidden) $("#assistant-search").focus();
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); $("#assistant-form").requestSubmit(); }
  });
  $("#assistant-reconnect").addEventListener("click", () => { ready = false; notice = ""; update(); status(); });
  root.querySelectorAll("[data-question]").forEach(button => button.addEventListener("click", () => {
    input.value = assistantHelp.find(a => a.id === button.dataset.question).question;
    input.focus(); update();
  }));
  $("#assistant-search").addEventListener("input", event => {
    const query = event.target.value.toLocaleLowerCase().trim();
    let found = 0;
    assistantHelp.forEach(a => {
      const match = `${a.title} ${a.text}`.toLocaleLowerCase().includes(query);
      $(`[data-article="${a.id}"]`).hidden = !match; found += Number(match);
    });
    $("#assistant-no-help").hidden = found > 0;
  });
  $("#assistant-form").addEventListener("submit", async event => {
    event.preventDefault(); update();
    if (send.disabled) return;
    const question = input.value.trim();
    busy = true; failed = false; notice = ""; input.value = ""; append("user", question); update();
    typing = append("typing", "", false).article;
    controller = new AbortController();
    try {
      const result = await postToApi("assistant", { question }, { signal: controller.signal });
      if (!active) return;
      typing.remove(); typing = null;
      applyUsage(result);
      await revealAnswer(result.answer);
    } catch (error) {
      if (!active) return;
      typing?.remove(); typing = null;
      failed = true;
      input.value = question;
      append("error", error.message || "Subukan muli mamaya.");
      blockUntil = error.retryAt || Date.now() + 10_000;
      if (error.code === "student_limit") { remaining = 0; resetAt = error.retryAt; }
      notice = error.code === "not_configured" ? error.message : "";
    } finally {
      if (active) { busy = false; update(); input.focus(); if (failed) status(); }
    }
  });
  const online = () => { notice = ""; status(); }, offline = () => update();
  window.addEventListener("online", online); window.addEventListener("offline", offline);
  const timer = setInterval(() => {
    update();
    if (remaining === 0 && resetAt && Date.now() >= resetAt && !busy) { remaining = null; status(); }
  }, 1000);
  onLeave(() => { active = false; controller?.abort(); clearTimeout(revealTimer); finishPause?.(); typing?.remove(); clearInterval(timer); window.removeEventListener("online", online); window.removeEventListener("offline", offline); });
  update(); status();
}
