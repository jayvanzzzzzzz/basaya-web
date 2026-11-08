import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { parseHTML } = require('linkedom');
const source = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const now = 2000;
const pending = { id: 'pending', pronunciationFinished: true, pronunciationReviewStatus: 'pending',
  fluency: { page: 0, total: 1, status: 'submitted' },
  skills: { pagbigkas: { correct: 0, attempts: 12, items: 12, completedAt: 1000 } } };
const graded = { id: 'graded', pronunciationFinished: true, pronunciationReviewStatus: 'graded',
  skills: { pagbigkas: { correct: 9, attempts: 12, items: 12, completedAt: 900 } } };
const lesson = id => ({ id, dueAt: 1500, items: { pagbigkas: 12 } });
for (const file of ['js/scoring.js', 'notify-api/lib/assessmentScoring.js']) {
  const scoring = await import(`data:text/javascript;base64,${Buffer.from(await source(file)).toString('base64')}`);
  const { resultsFrom, withMissed, summarize, lessonParts } = scoring;
  const docs = [pending, graded];
  for (const time of [1400, now]) {
    const result = summarize(withMissed(resultsFrom(docs), docs, docs.map(doc => lesson(doc.id)), time));
    assert.equal(result.skills.pagbigkas.score, 75, 'Pending review must not reduce an existing average');
    assert.equal(result.skills.pagbigkas.lessons, 1);
  }
  const ungraded = summarize(withMissed(resultsFrom([pending]), [pending], [lesson(pending.id)], now));
  assert.equal(ungraded.skills.pagbigkas.score, null, 'Pending-only score stays absent, not zero');
  const cached = { pagbigkas: [{ lessonId: pending.id, correct: 0, attempts: 12, items: 12 }] };
  assert.equal(withMissed(cached, [{ ...pending, pronunciationFinished: false }], [lesson(pending.id)], now).pagbigkas.length, 0);
  assert.equal(cached.pagbigkas.length, 1, 'Input results are preserved');
  const missing = summarize(withMissed(resultsFrom([]), [], [lesson('missing')], now));
  assert.equal(missing.skills.pagbigkas.score, 0, 'Unsubmitted work still follows the missing policy');
  assert.equal(lessonParts({ ...pending, lectureFinished: true, gameFinished: true, activityFinished: true, quizFinished: true }).finished, true);
  assert.equal(summarize(resultsFrom([{ ...pending, pronunciationReviewStatus: 'graded', skills: graded.skills }])).skills.pagbigkas.score, 75);
  console.log(`PASS: ${file}: pending exclusion, deadline, stale score, completion, missing work, teacher grade`);
}

async function renderPath(progress, closed = false) {
  const { document, window } = parseHTML('<html><body><main></main></body></html>');
  const dialogs = [], navigations = [];
  const context = vm.createContext({ document, window, console });
  const stub = exports => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const modules = {
    '../../js/helpers.js': stub({ $: selector => document.querySelector(selector), escapeHtml: value => String(value), navigate: value => navigations.push(value) }),
    '../data.js': stub({ availability: () => closed ? 'closed' : 'open', canOpen: () => true,
      findLesson: async () => ({ id: 'lesson', title: 'Ang aming tahanan' }), formatWhen: String,
      loadContentCounts: async () => ({ lecture: 2, game: 1, activity: 1, pronunciation: 1, quiz: 5 }),
      loadLessonProgress: async () => progress, resumeOf: () => null }),
    '../lectureAudio.js': stub({ unlockLecturePlayer() {} }),
    '../router.js': stub({ onLeave() {} }),
    '../ui.js': stub({ buddy: () => '', content: () => document.querySelector('main'), icon: () => '', showDialog: async value => { dialogs.push(value); } }),
    './lecture.js': stub({ muteNextLecture() {}, prepareLecture: async () => 'ready' }),
  };
  const mod = new vm.SourceTextModule(await source('student/views/lessonPath.js'), { context });
  await mod.link(name => { assert.ok(modules[name], name); return modules[name]; });
  await mod.evaluate(); await mod.namespace.renderLessonPath('lesson');
  return { document, dialogs, navigations };
}
const screen = await renderPath(pending, true);
assert.equal(screen.document.querySelector('[data-part="pronunciation"] em').textContent, 'Awaiting teacher review');
assert.equal(screen.document.querySelectorAll('em').length, 5);
assert.equal(screen.document.querySelector('main').textContent.split('Awaiting teacher review').length - 1, 1);
assert.ok(screen.document.querySelector('.st-step--pagbigkas.is-done'), 'Submission still counts as complete');
const quizLocked = await renderPath(pending);
assert.ok(quizLocked.document.querySelector('.st-step--pagsusulit.is-locked'), 'Pending pronunciation does not unlock the quiz');
const quizOpen = await renderPath({ ...pending, lectureFinished: true });
assert.equal(quizOpen.document.querySelector('.st-step--pagsusulit.is-locked'), null, 'Lecture still unlocks the quiz');
const reviewed = await renderPath({ ...pending, pronunciationReviewStatus: 'graded', pronunciationScore: 9, pronunciationTotal: 12 });
assert.equal(reviewed.document.querySelector('[data-part="pronunciation"] em').textContent, 'Puntos • 9/12');
const draft = await renderPath({ fluency: { page: 0, total: 2, status: 'draft' } });
assert.equal(draft.document.querySelector('[data-part="pronunciation"] em').textContent, 'Pahina 1/2');
console.log('PASS: lesson card only, closed lesson status, completed submission, lecture quiz gate, graded and draft cards');

if (process.argv.includes('--browser')) {
  const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const css = (await Promise.all(['base/tokens', 'base/reset', 'base/typography', 'base/animations', 'layout/student-shell', 'pages/student-lesson'].map(file => source(`css/${file}.css`)))).join('\n');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [390, 768, 1440]) {
      for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 1000 });
        await page.setContent(`<html data-theme="${theme}"><head><style>${css}</style></head><body data-portal="student">${screen.document.body.innerHTML}</body></html>`);
        const label = page.locator('[data-part="pronunciation"] em');
        assert.equal(await label.textContent(), 'Awaiting teacher review');
        assert.equal(await label.evaluate(el => el.scrollWidth > el.clientWidth), false, 'Review label fits the card');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(os.tmpdir(), `basaya-pending-${width}-${theme}.png`), fullPage: true });
      }
    }
    console.log(`PASS: browser layouts at 390, 768, 1440 pixels in light/dark; screenshots in ${os.tmpdir()}`);
  } finally { await browser.close(); }
}
