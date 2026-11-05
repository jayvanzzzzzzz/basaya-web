import { $, escapeHtml, page } from '../../js/helpers.js';
import { postToApi } from '../../js/api.js';

export async function renderFluencyReview(classId) {
  page('Reading recordings', 'Listen, give feedback, and help each reader grow.', `<a class="button secondary" href="#/classes/${encodeURIComponent(classId)}">Back to class</a>`);
  const root = $('#page-content');
  root.insertAdjacentHTML('beforeend', '<section id="reading-review"><p>Loading submissions…</p></section>');
  const target = $('#reading-review');
  let rows = [], current = 0, recordingPlayers = [];
  const request = (operation, fields = {}) => postToApi('assessment', { operation: `fluency-${operation}`, classId, ...fields });
  function stop() { recordingPlayers.forEach(audio => { audio.pause(); audio.onended = null; }); recordingPlayers = []; }
  async function open(index) {
    stop(); current = index;
    const entry = rows[index];
    if (!entry) { target.innerHTML = '<div class="card"><h2>All caught up</h2><p>New student readings will appear here after submission.</p></div>'; return; }
    target.innerHTML = '<p>Loading recordings…</p>';
    try {
      const result = await request('play', { submissionId: entry.id });
      if (!target.isConnected) return;
      target.innerHTML = `<div class="card"><div class="section-title"><div><p class="muted">${index + 1} of ${rows.length} submissions</p><h2>${escapeHtml(entry.name)}</h2><p>${escapeHtml(entry.title)}</p></div><button class="button secondary" type="button" data-review-play-all>Play all</button></div>${result.pages.map((item, i) => `<article class="card"><span class="muted">Reading ${i + 1}</span><p>${escapeHtml(item.sentence)}</p><audio style="width:100%" controls preload="none" src="${escapeHtml(item.recordingUrl)}"></audio></article>`).join('')}<form id="reading-grade"><h3>Reading rubric</h3><p class="muted">1 — Needs guidance · 2 — Developing · 3 — Mostly fluent · 4 — Fluent</p><div class="form-grid">${[['accuracy', 'Accuracy'], ['smoothness', 'Smoothness and appropriate pace'], ['expression', 'Expression and phrasing']].map(([key, label]) => `<label>${label}<select required name="${key}"><option value="">Choose score</option>${[1,2,3,4].map(n => `<option value="${n}" ${result.grade?.[key] === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`).join('')}</div><label>Feedback<textarea name="feedback" maxlength="1000" rows="3">${escapeHtml(result.feedback || '')}</textarea></label><div class="audio-actions">${['Practice pauses at punctuation.', 'Read the words smoothly together.', 'Your reading is clear and expressive.'].map(text => `<button type="button" class="button secondary small" data-quick-feedback="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div><p id="reading-review-error" role="status"></p><div class="modal-actions"><button type="button" class="button secondary" data-review-next>Next student</button><button class="button primary">Save grade and next</button></div></form></div>`;
      recordingPlayers = [...target.querySelectorAll('audio')];
      recordingPlayers.forEach(audio => audio.addEventListener('play', () => recordingPlayers.forEach(other => { if (other !== audio) other.pause(); })));
      target.querySelector('[data-review-play-all]').onclick = () => {
        recordingPlayers.forEach((audio, i) => { audio.currentTime = 0; audio.onended = () => recordingPlayers[i + 1]?.play().catch(() => {}); });
        recordingPlayers[0]?.play().catch(() => {});
      };
      target.querySelectorAll('[data-quick-feedback]').forEach(button => button.onclick = () => {
        const field = target.querySelector('[name="feedback"]'); field.value = [field.value, button.dataset.quickFeedback].filter(Boolean).join(' ').slice(0,1000);
      });
      target.querySelector('[data-review-next]').onclick = () => open(current + 1);
      $('#reading-grade').onsubmit = async event => {
        event.preventDefault();
        const submit = event.submitter; submit.disabled = true;
        const values = Object.fromEntries(new FormData(event.currentTarget));
        try {
          await request('grade', { submissionId: entry.id, grade: { accuracy: Number(values.accuracy), smoothness: Number(values.smoothness), expression: Number(values.expression) }, feedback: values.feedback });
          await open(current + 1);
        } catch (error) { $('#reading-review-error').textContent = error.message; submit.disabled = false; }
      };
    } catch (error) { target.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p><button class="button secondary" id="review-retry">Try again</button>`; $('#review-retry').onclick = () => open(index); }
  }
  new MutationObserver((_, observer) => { if (!target.isConnected) { stop(); observer.disconnect(); } }).observe(document.body, { subtree: true, childList: true });
  try { rows = (await request('list')).submissions; await open(0); }
  catch (error) { target.textContent = error.message; }
}
