import { escapeHtml } from '../../js/helpers.js';

const icon = (path, name) => `<svg class="lesson-media__${name}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const playIcon = icon('<path d="m9 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>', 'play');
const pauseIcon = icon('<path d="M9 5v14M16 5v14" stroke-width="3"/>', 'pause');
const clock = value => Number.isFinite(value) && value >= 0 ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';

/** The same player for saved cloud clips and unsaved, generated previews. */
export function audioPreviewHtml(url = '', { word = false, generated = false, limit = false } = {}) {
  const title = word ? 'Word audio' : 'Sentence audio';
  const status = url ? (generated ? 'Preview ready' : 'Saved audio') : 'No audio yet';
  return `<div class="lesson-media" data-lesson-media data-ready-label="${status}" role="group" aria-label="${title} preview">
    <div class="lesson-media__heading">
      <span class="lesson-media__title">${icon('<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>', 'mark')}${title}</span>
      <span class="lesson-media__status" data-media-status role="status">${status}</span>
    </div>
    ${url ? `<audio controls preload="metadata" src="${escapeHtml(url)}" aria-label="${title}"></audio>` : ''}
    <div class="lesson-media__controls">
      <button type="button" class="lesson-media__toggle" data-media-toggle data-floating-tooltip aria-label="Play ${title.toLowerCase()}" ${url ? '' : 'disabled'}>${playIcon}${pauseIcon}</button>
      <div class="lesson-media__timeline">
        <input class="lesson-media__seek" data-media-seek type="range" min="0" max="100" step="0.1" value="0" disabled aria-label="Seek ${title.toLowerCase()}" aria-valuetext="0:00 of 0:00" />
        <div class="lesson-media__times"><span data-media-elapsed>0:00</span><span data-media-duration>0:00</span></div>
      </div>
      <label class="lesson-media__speed"><span class="lesson-media__sr-only sr-only">${title} playback speed</span><select data-media-speed aria-label="${title} playback speed" ${url ? '' : 'disabled'}><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
    </div>
    ${!url || limit ? `<p class="lesson-media__hint">${limit ? 'Generation limit reached. Your audio is ready to use.' : 'Generate audio to listen and review.'}</p>` : ''}
  </div>`;
}

/** Enhance native audio progressively; delegated wiring also covers newly added rows. */
export function mountLessonMediaPlayers(root) {
  const listeners = new Map();
  function enhance(player) {
    if (player.classList.contains('is-enhanced')) return;
    player.classList.add('is-enhanced');
    const audio = player.querySelector('audio');
    if (!audio) return;
    audio.controls = false;
    const toggle = player.querySelector('[data-media-toggle]');
    const seek = player.querySelector('[data-media-seek]');
    const status = player.querySelector('[data-media-status]');
    const title = player.querySelector('.lesson-media__title').textContent.toLowerCase();
    const update = () => {
      const playing = !audio.paused && !audio.ended;
      player.classList.toggle('is-playing', playing);
      toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${title}`);
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const progress = duration ? audio.currentTime / duration * 100 : 0;
      seek.disabled = !duration || Boolean(audio.error);
      seek.value = String(progress);
      seek.style.setProperty('--media-progress', `${progress}%`);
      seek.setAttribute('aria-valuetext', `${clock(audio.currentTime)} of ${clock(duration)}`);
      player.querySelector('[data-media-elapsed]').textContent = clock(audio.currentTime);
      player.querySelector('[data-media-duration]').textContent = clock(duration);
      const message = audio.error ? 'Audio unavailable. Generate it again.' : playing ? (audio.readyState < 3 ? 'Loading audio…' : 'Playing') : player.dataset.readyLabel;
      if (status.textContent !== message) status.textContent = message;
    };
    const events = ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'error', 'waiting', 'canplay'];
    events.forEach(event => audio.addEventListener(event, update));
    listeners.set(audio, () => events.forEach(event => audio.removeEventListener(event, update)));
    update();
  }
  const scan = node => {
    if (node.nodeType !== 1) return;
    if (node.matches('[data-lesson-media]')) enhance(node);
    node.querySelectorAll('[data-lesson-media]').forEach(enhance);
  };
  scan(root);
  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(scan));
    for (const [audio, dispose] of listeners) {
      if (root.contains(audio)) continue;
      audio.pause();
      dispose();
      listeners.delete(audio);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  const click = async event => {
    const button = event.target.closest('[data-media-toggle]');
    if (!button || button.disabled) return;
    const player = button.closest('[data-lesson-media]');
    const audio = player.querySelector('audio');
    if (!audio.paused && !audio.ended) { audio.pause(); return; }
    root.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); });
    if (audio.ended) audio.currentTime = 0;
    try { await audio.play(); }
    catch (error) {
      if (error.name !== 'AbortError') player.querySelector('[data-media-status]').textContent = 'Could not play. Try again or regenerate audio.';
    }
  };
  const input = event => {
    if (!event.target.matches('[data-media-seek]')) return;
    const audio = event.target.closest('[data-lesson-media]').querySelector('audio');
    if (audio && Number.isFinite(audio.duration)) {
      audio.currentTime = Number(event.target.value) / 100 * audio.duration;
      audio.dispatchEvent(new Event('timeupdate'));
    }
  };
  const change = event => {
    if (event.target.matches('[data-media-speed]')) {
      event.target.closest('[data-lesson-media]').querySelector('audio').playbackRate = Number(event.target.value);
    }
  };
  root.addEventListener('click', click);
  root.addEventListener('input', input);
  root.addEventListener('change', change);
  return () => {
    observer.disconnect();
    root.removeEventListener('click', click);
    root.removeEventListener('input', input);
    root.removeEventListener('change', change);
    for (const [audio, dispose] of listeners) { audio.pause(); dispose(); }
    listeners.clear();
  };
}
