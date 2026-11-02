import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { previewServer } from "./serve-assistant-preview.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const server = previewServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser, tests = 0;
const test = async (name, run) => { await run(); tests++; console.log(`PASS: ${name}`); };
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/student/`;
  await page.goto(url); await page.locator("#assistant-quota").filter({ hasText: "5 questions left" }).waitFor();
  await mkdir(new URL("../audit/assistant/", import.meta.url), { recursive: true });
  await test("desktop help screen renders with no horizontal overflow", async () => {
    assert.equal(await page.locator("[data-article]").count(), 8);
    assert.equal(await page.locator("#assistant-help").isHidden(), true);
    assert.equal(await page.locator("#assistant-status").isHidden(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: "audit/assistant/desktop.png", fullPage: true });
  });
  await test("suggestions fill input and concurrent submits send once", async () => {
    await page.locator('[data-question="join"]').click();
    assert.equal(await page.locator("#assistant-question").inputValue(), "Paano sumali sa klase?");
    await page.evaluate(() => { window.fixture.hold = true; });
    await page.locator("#assistant-send").click();
    await page.waitForFunction(() => window.fixture.calls === 1);
    assert.equal(await page.locator("#assistant-question").inputValue(), "");
    assert.equal(await page.locator("#assistant-question").isDisabled(), true);
    assert.equal(await page.locator(".st-assistant__typing span").count(), 3);
    assert.equal(await page.locator(".st-assistant__typing").isVisible(), true);
    await page.evaluate(() => document.querySelector("#assistant-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(await page.evaluate(() => window.fixture.calls), 1);
    await page.evaluate(() => window.fixture.release());
    await page.locator("#assistant-question:enabled").waitFor();
    assert.equal(await page.locator(".st-assistant__typing").count(), 0);
    assert.equal(await page.locator(".st-assistant__message--user").count(), 1);
    assert.equal(await page.locator(".st-assistant__suggestions").isHidden(), true);
    assert.equal(await page.locator("#assistant-send").isDisabled(), true);
    assert.ok((await page.locator("#assistant-messages").innerText()).includes("pag-apruba"));
  });
  await test("search and offline help remain available", async () => {
    await page.locator("#assistant-help-toggle").click();
    await page.locator("#assistant-search").fill("password");
    assert.equal(await page.locator("[data-article]:visible").count(), 1);
    await page.context().setOffline(true);
    await page.locator("#assistant-status").filter({ hasText: "Walang internet" }).waitFor();
    await page.locator('[data-article="account"] summary').click();
    assert.ok((await page.locator('[data-article="account"]').innerText()).includes("Forgot password"));
    assert.equal(await page.locator("#assistant-send").isDisabled(), true);
    await page.context().setOffline(false);
  });
  await test("AI output is rendered as text, never executable HTML", async () => {
    await page.goto(url);
    await page.waitForFunction(() => window.fixture && window.fixture.cleanup);
    await page.evaluate(() => { window.fixture.answer = '<img src=x onerror="window.injected=true">'; });
    await page.locator("#assistant-question").fill("How to join?"); await page.locator("#assistant-send").click();
    await page.locator("#assistant-messages").filter({ hasText: "<img src=x" }).waitFor();
    assert.equal(await page.locator("#assistant-messages .chat-msg__bubble img").count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
  });
  await test("provider failure preserves draft and displays useful help", async () => {
    await page.goto(url); await page.waitForFunction(() => window.fixture && window.fixture.cleanup);
    await page.evaluate(() => { window.fixture.fail = true; });
    await page.locator("#assistant-question").fill("Help me join"); await page.locator("#assistant-send").click();
    await page.locator(".st-assistant__message--error").waitFor();
    assert.equal(await page.locator("#assistant-question").inputValue(), "Help me join");
    assert.equal(await page.locator("#assistant-send").isDisabled(), true);
  });
  await test("mobile light and dark layouts fit a 360px screen", async () => {
    await page.goto(url); await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => document.querySelector('.st-topbar__brand').getBoundingClientRect().right < document.querySelector('.st-topbar__actions').getBoundingClientRect().left), true);
    await page.screenshot({ path: "audit/assistant/mobile.png", fullPage: true });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    await page.screenshot({ path: "audit/assistant/mobile-dark.png", fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
  await test("route cleanup ignores a late answer", async () => {
    await page.goto(url); await page.waitForFunction(() => window.fixture && window.fixture.cleanup);
    await page.evaluate(() => { window.fixture.hold = true; });
    await page.locator("#assistant-question").fill("help"); await page.locator("#assistant-send").click();
    await page.waitForFunction(() => window.fixture.release);
    await page.evaluate(() => { window.fixture.cleanup(); document.querySelector("#page-content").textContent = "Other screen"; window.fixture.release(); });
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#page-content").innerText(), "Other screen");
    assert.deepEqual(errors, []);
  });
  await test("daily reset appears only when exhausted; debugging account has no daily cap", async () => {
    await page.goto(url); await page.waitForFunction(() => window.fixture?.cleanup);
    await page.evaluate(async () => { window.fixture.cleanup(); window.fixture.remaining = 0; const {renderAssistant} = await import('/student/views/assistant.js'); renderAssistant(); });
    await page.locator("#assistant-status").filter({ hasText: "Naubos" }).waitFor();
    assert.equal(await page.locator("#assistant-quota").innerText(), "0 questions left");
    await page.evaluate(async () => { window.fixture.cleanup(); window.fixture.unlimited = true; const {renderAssistant} = await import('/student/views/assistant.js'); renderAssistant(); });
    await page.locator("#assistant-quota").filter({ hasText: "No daily limit" }).waitFor();
    assert.equal(await page.locator("#assistant-status").isHidden(), true);
    await page.locator("#assistant-question").fill("Debug question");
    assert.equal(await page.locator("#assistant-send").isEnabled(), true);
  });
  await test("new answers reveal by sentence; reopening shows the full answer immediately", async () => {
    await page.goto(url); await page.waitForFunction(() => window.fixture?.cleanup);
    const answer = "Unang pangungusap. Ikalawang pangungusap. Huling pangungusap.";
    await page.evaluate(answer => { window.fixture.answer = answer; }, answer);
    await page.locator("#assistant-question").fill("How to join?"); await page.locator("#assistant-send").click();
    await page.locator(".st-assistant__sentence").first().waitFor();
    assert.equal(await page.locator(".st-assistant__sentence").count(), 1);
    assert.equal(await page.locator("#assistant-question").isDisabled(), true);
    await page.evaluate(async () => { window.fixture.cleanup(); const {renderAssistant} = await import('/student/views/assistant.js'); renderAssistant(); });
    assert.ok((await page.locator("#assistant-messages").innerText()).includes(answer));
    assert.equal(await page.locator(".st-assistant__sentence").count(), 0);
    assert.equal(await page.locator(".st-assistant__typing").count(), 0);
    assert.equal(await page.locator(".st-assistant__avatar img").count() > 1, true);
    assert.equal(await page.locator(".inbox-class__avatar img").count(), 0);
  });
  await test("reduced motion shows complete answers without sentence animation", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url); await page.waitForFunction(() => window.fixture?.cleanup);
    await page.evaluate(() => { window.fixture.answer = "Una. Pangalawa. Pangatlo."; });
    await page.locator("#assistant-question").fill("help"); await page.locator("#assistant-send").click();
    await page.locator("#assistant-question:enabled").waitFor();
    assert.ok((await page.locator("#assistant-messages").innerText()).includes("Una. Pangalawa. Pangatlo."));
    assert.equal(await page.locator(".st-assistant__sentence").count(), 0);
    assert.deepEqual(errors, []);
  });
  console.log(`Assistant browser: ${tests} scenarios passed.`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
