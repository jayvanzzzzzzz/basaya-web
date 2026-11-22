import { $, escapeHtml, initials, page } from "./helpers.js";
import { state } from "./state.js";
import { postToApi } from "./api.js";
import { handbookHelp, matchesHandbookSearch } from "./handbookHelp.js";
import { attachFloatingTooltips } from "./floatingTooltip.js";

let cleanup = () => {};
let conversation = { key: "", messages: [] };
export function leaveHandbook() { cleanup(); cleanup = () => {}; }
const mascot = new URL("../img/logo.png", import.meta.url).href;
const aiAvatar = () => `<span class="handbook__avatar handbook__avatar--ai" aria-hidden="true"><img src="${mascot}" alt="" /></span>`;
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${{
  book: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>',
  send: '<path d="m21 3-7 18-4-7-7-4L21 3Zm0 0L10 14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  clear: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
}[name]}</svg>`;

export function renderHandbook(role) {
  leaveHandbook();
  if (!handbookHelp[role] || state.profile?.role !== role || !state.user) return;
  const guides = handbookHelp[role];
  const key = `${state.user.uid}:${role}`;
  if (conversation.key !== key) conversation = { key, messages: [] };
  const messages = conversation.messages;
  page("AI Handbook", "A little guidance, right when you need it.");
  const root = $("#page-content");
  root.innerHTML = `<section class="handbook" aria-label="${role === "admin" ? "Admin" : "Teacher"} AI Handbook">
    <aside class="handbook__reference" aria-labelledby="handbook-guide-title">
      <div class="handbook__reference-head"><span class="handbook__eyebrow">THE BASAya FIELD GUIDE</span><h2 id="handbook-guide-title">Know your workspace.</h2><p>Browse the guide or ask a question in your own words.</p></div>
      <label class="handbook__search">${icon("search")}<span class="sr-only">Search handbook guides</span><input id="handbook-search" type="search" placeholder="Find a guide…" autocomplete="off"></label>
      <div class="handbook__guides">${guides.map((g, i) => `<details data-guide="${g.id}"><summary><span class="handbook__number">${String(i + 1).padStart(2, "0")}</span><span>${escapeHtml(g.title)}</span><span class="handbook__expand" aria-hidden="true">+</span></summary><div class="handbook__guide-body"><p>${escapeHtml(g.text)}</p><a href="#${g.route}">Open ${escapeHtml(g.title)} ${icon("arrow")}</a><button type="button" data-ask="${g.id}">Ask about this ${icon("arrow")}</button></div></details>`).join("")}</div>
      <p id="handbook-no-guides" hidden>No matching guide. Try another word.</p>
      <p class="handbook__reference-note">The guides stay available when the AI is busy or your daily questions run out.</p>
    </aside>
    <section class="handbook__conversation" aria-labelledby="handbook-chat-title">
      <header class="handbook__chat-head"><span class="handbook__support-avatar">${aiAvatar()}</span><div class="handbook__chat-identity"><h2 id="handbook-chat-title">BASAya AI Chat Support</h2><p>${role === "admin" ? "Admin" : "Teacher"} website help <span aria-hidden="true">·</span> English, Filipino &amp; Taglish</p></div><button id="handbook-clear" class="handbook__utility" type="button" aria-label="Clear conversation" data-floating-tooltip="Clear conversation">${icon("clear")}</button></header>
      <div id="handbook-scroll" class="handbook__scroll"><div id="handbook-empty" class="handbook__empty"><span class="handbook__eyebrow">A GOOD PLACE TO START</span><h3>What would you<br>like to do today?</h3><p>From ${role === "admin" ? "teacher accounts to your lesson library" : "your first classroom to reviewing progress"}, find your next step here.</p><div class="handbook__suggestions">${guides.slice(0, 3).map(g => `<button type="button" data-ask="${g.id}">${escapeHtml(g.question)} ${icon("arrow")}</button>`).join("")}</div></div><div id="handbook-messages" role="log" aria-label="Handbook conversation" aria-live="polite" aria-relevant="additions" aria-atomic="false"></div></div>
      <p id="handbook-status" class="handbook__status" role="status" aria-live="polite" hidden></p><button id="handbook-retry" type="button" class="handbook__retry" hidden>Reconnect to AI</button>
      <form id="handbook-form" class="handbook__composer"><label for="handbook-question">Message BASAya</label><div class="handbook__input-row"><textarea id="handbook-question" rows="2" maxlength="500" placeholder="Type your question…" aria-describedby="handbook-count handbook-note"></textarea><button id="handbook-send" type="submit">${icon("send")}<span>Send</span></button></div><div class="handbook__composer-meta"><span id="handbook-count">0 / 500</span><span id="handbook-quota" role="status"></span></div></form>
      <footer id="handbook-note" class="handbook__note">AI can make mistakes. Each question is independent. Keep passwords and personal student details private.</footer>
    </section></section>`;
  const find = selector => root.querySelector(selector);
  const input = find("#handbook-question"), send = find("#handbook-send");
  const log = find("#handbook-messages"), scroller = find("#handbook-scroll");
  let active = true, busy = false, ready = false, available = false, remaining = null;
  let nextAllowedAt = 0, blockUntil = 0, resetAt = 0, notice = "", controller, typing;
  let revealTimer, finishReveal, statusSequence = 0, checking = false;
  const tooltipCleanup = attachFloatingTooltips(root, '.handbook__utility');
  const scroll = () => { scroller.scrollTop = scroller.scrollHeight; };
  function append(role, text, save = true) {
    if (save) { messages.push({ role, text }); if (messages.length > 20) messages.shift(); }
    const article = document.createElement("article");
    article.className = `handbook__message handbook__message--${role}`;
    const avatar = document.createElement("span");
    avatar.className = `handbook__avatar handbook__avatar--${role === "user" ? "user" : "ai"}`;
    avatar.setAttribute("aria-hidden", "true");
    if (role === "user") avatar.textContent = initials(state.profile?.displayName || state.user?.displayName || state.profile?.role || "You");
    else { const image = document.createElement("img"); image.src = mascot; image.alt = ""; avatar.append(image); }
    const body = document.createElement("div"); body.className = "handbook__message-body";
    const author = document.createElement("span"); author.className = "handbook__author";
    author.textContent = role === "user" ? "You" : role === "error" ? "Unable to answer" : "BASAya";
    const bubble = document.createElement("div"); bubble.className = "handbook__bubble";
    const paragraph = document.createElement("p"); paragraph.textContent = text;
    bubble.append(paragraph); body.append(author, bubble); article.append(avatar, body); log.append(article);
    while (log.children.length > 20) log.firstElementChild.remove();
    find("#handbook-empty").hidden = true; scroll();
    return { article, paragraph };
  }
  async function reveal(text) {
    const { article, paragraph } = append("assistant", "", false);
    messages.push({ role: "assistant", text }); if (messages.length > 20) messages.shift();
    article.setAttribute("aria-busy", "true");
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Measure the actual wrapped lines, so each visible line fades in together.
      const words = (text.match(/\S+\s*|\s+/g) || []).map(word => {
        const span = document.createElement("span"); span.textContent = word; paragraph.append(span); return span;
      });
      let top = null, line = -1;
      words.forEach(word => {
        const y = word.getClientRects()[0]?.top ?? top;
        if (top === null || Math.abs(y - top) > 3) { line++; top = y; }
        word.className = "handbook__reveal"; word.style.animationDelay = `${line * 110}ms`;
      });
      scroll();
      await new Promise(resolve => { finishReveal = resolve; revealTimer = setTimeout(resolve, Math.max(0, line) * 110 + 400); });
      finishReveal = null;
    }
    if (!active) return;
    paragraph.textContent = text;
    article.removeAttribute("aria-busy");
  }
  messages.forEach(message => append(message.role, message.text, false));
  function update() {
    if (!active) return;
    const wait = Math.max(0, Math.ceil((Math.max(nextAllowedAt, blockUntil) - Date.now()) / 1000));
    const exhausted = remaining === 0 && Date.now() < resetAt;
    send.disabled = busy || !ready || !available || !navigator.onLine || exhausted || wait > 0 || !input.value.trim();
    input.disabled = busy;
    find("#handbook-clear").disabled = busy || !messages.length;
    root.querySelectorAll("[data-ask]").forEach(button => { button.disabled = busy; });
    find("#handbook-count").textContent = `${input.value.length} / 500`;
    find("#handbook-quota").textContent = remaining === null ? "" : `${remaining} of 10 questions left today`;
    find("#handbook-retry").hidden = !ready || available || !navigator.onLine || busy;
    const status = !navigator.onLine ? "You're offline. You can still read the guides."
      : busy ? "" : !ready ? "Checking AI availability…" : notice || (!available ? "AI is unavailable. Browse the guides or try reconnecting."
      : exhausted ? `Daily limit reached. Resets at ${new Date(resetAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}. The guides are still available.`
      : wait ? `You can ask again in ${wait} second${wait === 1 ? "" : "s"}.` : "");
    const statusNode = find("#handbook-status");
    if (statusNode.textContent !== status) statusNode.textContent = status;
    statusNode.hidden = !status;
    send.setAttribute("aria-busy", String(busy));
  }
  function applyUsage(result) {
    remaining = result.remaining; nextAllowedAt = result.nextAllowedAt || 0; resetAt = result.resetAt || 0;
  }
  async function status() {
    if (!active || busy || checking || !navigator.onLine) { update(); return; }
    const sequence = ++statusSequence; checking = true;
    try {
      const result = await postToApi("assistant", { action: "status" });
      if (!active || busy || sequence !== statusSequence) return;
      applyUsage(result); available = result.available === true; notice = "";
    } catch { if (active && sequence === statusSequence) { available = false; notice = "Couldn't connect to AI. The handbook guides are still available."; } }
    finally { checking = false; if (active && sequence === statusSequence) { ready = true; update(); } }
  }
  input.addEventListener("input", update);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); find("#handbook-form").requestSubmit(); }
  });
  root.querySelectorAll("[data-ask]").forEach(button => button.addEventListener("click", () => {
    input.value = guides.find(g => g.id === button.dataset.ask).question; input.focus(); update();
  }));
  find("#handbook-search").addEventListener("input", event => {
    const query = event.target.value.trim(); let count = 0;
    guides.forEach(guide => {
      const match = matchesHandbookSearch(guide, query);
      find(`[data-guide="${guide.id}"]`).hidden = !match; count += Number(match);
    });
    find("#handbook-no-guides").hidden = count > 0;
  });
  find("#handbook-clear").addEventListener("click", () => {
    if (busy) return;
    messages.length = 0; log.replaceChildren(); find("#handbook-empty").hidden = false; update();
  });
  find("#handbook-retry").addEventListener("click", () => { ready = false; notice = ""; update(); status(); });
  find("#handbook-form").addEventListener("submit", async event => {
    event.preventDefault(); update(); if (send.disabled) return;
    const question = input.value.trim();
    if (question.length > 500) return;
    busy = true; notice = ""; statusSequence++; input.value = ""; append("user", question);
    typing = document.createElement("div"); typing.className = "handbook__thinking"; typing.setAttribute("role", "status");
    typing.innerHTML = `${aiAvatar()}<span class="handbook__thinking-bubble"><span class="handbook__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">BASAya is thinking</span></span>`;
    log.append(typing); scroll(); update(); controller = new AbortController();
    try {
      const result = await postToApi("assistant", { question }, { signal: controller.signal });
      if (!active) return;
      typing.remove(); typing = null; applyUsage(result); await reveal(result.answer);
    } catch (error) {
      if (!active) return;
      typing?.remove(); typing = null; input.value = question;
      append("error", error.message || "Couldn't get an answer. Please try again later.");
      blockUntil = error.retryAt || Date.now() + 10_000;
      if (error.code === "daily_limit") { remaining = 0; resetAt = error.retryAt; }
      if (error.code === "not_configured") available = false;
    } finally {
      if (active) { busy = false; update(); input.focus({ preventScroll: true }); status(); }
    }
  });
  const online = () => status(), offline = () => update();
  window.addEventListener("online", online); window.addEventListener("offline", offline);
  const timer = setInterval(() => { update(); if (remaining === 0 && resetAt && Date.now() >= resetAt && !busy) status(); }, 1000);
  cleanup = () => {
    active = false; controller?.abort(); clearInterval(timer); clearTimeout(revealTimer); finishReveal?.(); typing?.remove(); tooltipCleanup();
    window.removeEventListener("online", online); window.removeEventListener("offline", offline);
  };
  update(); status();
}
