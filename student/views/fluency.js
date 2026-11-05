import { $, escapeHtml, navigate } from '../../js/helpers.js';
import { content, icon, talkingBuddy, setTalking } from '../ui.js';
import { onLeave } from '../router.js';
import { Microphone } from '../speech.js';
import { openReading } from '../fluencySession.js';
import { invalidateStudentData } from '../data.js';

export async function renderFluency(lesson) {
  let active = true;
  onLeave(() => { active = false; });
  const path = `/lesson/${encodeURIComponent(lesson.id)}`;
  content().innerHTML = '<div class="st-focus-loading"><p>Inihahanda ang iyong pagbasa…</p></div>';
  let session;
  try { session = await openReading(lesson); }
  catch (error) { content().innerHTML = `<section class="st-reading"><a href="#${path}">← Bumalik</a><h1>Ipagpatuloy natin ang pagbasa</h1><p>${escapeHtml(error.message)}</p><button class="button primary" id="reading-reopen">Subukan muli</button></section>`; $('#reading-reopen').onclick = () => renderFluency(lesson); return; }
  if (!active) return;
  let busy = false, held = false, processing = false, listening = false, cancel, release, player, objectUrl, microphone, holdTimeout;
  let notice = '', syncError = '', pendingRead = false;
  const root = content();
  const stopAudio = () => { player?.pause(); window.speechSynthesis?.cancel(); listening = false; };
  const persistSync = () => session.sync().then(() => { syncError = ''; if (active && !held && !busy && !listening) draw(); }).catch(error => { syncError = error.message; if (active && !held && !busy && !listening) draw(); });
  const act = async (operation, clip) => { await session.act(operation, clip); notice = ''; draw(); void persistSync(); };
  const page = () => session.state.pages[session.state.page];
  const word = () => page().words[session.state.word];
  function draw() {
    if (!active) return;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    const state = session.state, item = page(), warm = state.stage === 'words';
    if (state.status !== 'draft') {
      const grade = state.grade;
      root.innerHTML = `<section class="st-reading st-reading--finished"><div class="st-reading__seal">${icon('check')}</div><p class="st-reading__eyebrow">BIGKAS • ${state.pages.length} PAHINA</p><h1>${grade ? 'May mensahe ang guro mo!' : 'Naipasa mo na. Ang galing!'}</h1><p>${grade ? escapeHtml(state.feedback || 'Magpatuloy sa pagsasanay!') : lesson.practice ? 'Natapos mo ang pagsasanay sa pagbasa.' : 'Pakikinggan ng iyong guro ang mga recording mo.'}</p>${grade ? `<div class="st-reading__grade"><span>Katumpakan <b>${grade.accuracy}/4</b></span><span>Tuloy-tuloy na pagbasa <b>${grade.smoothness}/4</b></span><span>Pagpapahayag <b>${grade.expression}/4</b></span></div>` : '<span class="st-reading__saved">✓ Naka-save ang lahat ng pahina</span>'}<a class="button primary" href="#${path}">Bumalik sa aralin</a></section>`;
      return;
    }
    const preview = state.stage === 'preview', canRecord = warm || ['record', 'preview'].includes(state.stage);
    const selectedWord = word();
    root.innerHTML = `<section class="st-reading">
      <header class="st-reading__top"><a class="st-icon-button" href="#${path}" aria-label="Bumalik">${icon('close')}</a><div class="st-reading__pages" aria-label="Mga pahina">${state.pages.map((_, i) => `<span class="${i === state.page ? 'is-current' : i < state.page ? 'is-done' : ''}">${i < state.page ? '✓' : i + 1}</span>`).join('')}</div><strong>${state.page + 1}/${state.pages.length}</strong></header>
      <div class="st-reading__heading"><p class="st-reading__eyebrow">ANG AKING TINIG</p><h1>${warm ? 'Handa, bigkas!' : preview ? 'Pakinggan ang iyong pagbasa' : 'Ikaw naman ang bumasa'}</h1><p>${warm ? 'Sanayin muna natin ang mga salita.' : preview ? 'Masaya ka na ba sa iyong recording?' : 'Pakinggan, pagkatapos ay basahin nang malakas.'}</p></div>
      <div class="st-reading__steps"><span class="${warm ? 'is-active' : 'is-done'}">1 <b>Get Ready</b></span><i></i><span class="${!warm && !preview ? 'is-active' : preview ? 'is-done' : ''}">2 <b>Basahin</b></span><i></i><span class="${preview ? 'is-active' : ''}">3 <b>Pakinggan</b></span></div>
      <div class="st-reading__stage">${talkingBuddy('st-buddy st-buddy--idle st-reading__buddy')}<article class="st-reading__card ${warm ? 'st-reading__card--word' : ''}"><span class="st-reading__card-label">${warm ? `SALITA ${state.word + 1} / ${item.words.length}` : `PAGBASA ${state.page + 1}`}</span><${warm ? 'h2' : 'p'} class="st-reading__text">${escapeHtml(warm ? selectedWord?.word || '' : item.sentence)}</${warm ? 'h2' : 'p'}><button class="st-reading__listen" type="button" data-reading-listen ${busy ? 'disabled' : ''}>${icon('speaker')}<span>${warm ? 'Pakinggan ang salita' : 'Pakinggan ang halimbawa'}</span></button></article></div>
      ${preview ? `<div class="st-reading__preview"><div><span class="st-reading__recording-icon">${icon('mic')}</span><strong>Ang aking recording</strong></div><audio controls preload="metadata" id="reading-preview"></audio><p class="st-reading__saved">${session.pending ? 'Naka-save sa device • hinihintay ang upload' : '✓ Naka-save ang recording'}</p></div>` : ''}
      <div class="st-reading__record"><button type="button" class="st-reading__mic" data-reading-mic aria-label="Hawakan ang mikropono habang bumabasa" aria-pressed="false" ${!canRecord || busy ? 'disabled' : ''}>${icon('mic')}</button><p id="reading-mic-hint">${canRecord ? warm ? 'Hawakan ang mic at bigkasin ang salita' : 'Hawakan ang mic habang bumabasa' : 'Pakinggan muna ang halimbawa'}</p><small>${preview ? 'Hawakan muli para palitan ang recording' : 'Bitawan ang mic kapag tapos na'}</small></div>
      <p class="st-reading__notice" role="status">${escapeHtml(notice)}</p>
      ${syncError ? `<div class="st-reading__sync" role="status"><span>${escapeHtml(syncError)}<br>Naka-save sa device ang iyong progreso.</span><div><button type="button" class="button secondary small" data-reading-sync>Subukan muli</button><button type="button" class="button secondary small" data-reading-refresh>Gamitin ang pinakabagong progreso</button></div></div>` : ''}
      ${preview ? `<footer class="st-reading__actions"><button class="button secondary" type="button" data-reading-retake ${busy ? 'disabled' : ''}>Bumasa muli</button><button class="button primary" type="button" data-reading-next ${busy ? 'disabled' : ''}>${busy ? 'Ipinapasa…' : state.page === state.pages.length - 1 ? 'Tapusin at ipasa' : 'Susunod na pahina'} ${'?'}</button></footer>` : ''}
      <div class="st-reading__footnote">${session.pending ? '● Naka-save sa device' : '✓ Naka-save ang iyong progreso'}</div>
    </section>`;
    if (preview) {
      const audio = $('#reading-preview');
      const clip = session.clip(state.page);
      if (clip?.blob && clip.eventId === state.clips[state.page]?.eventId) { objectUrl = URL.createObjectURL(clip.blob); audio.src = objectUrl; }
      else session.playback(state.page).then(url => { if (active && audio.isConnected) audio.src = url; }).catch(error => { if (active) { notice = error.message; const el = $('.st-reading__notice'); if (el) el.textContent = notice; } });
    }
  }
  async function listen() {
    if (busy || held || processing) return;
    stopAudio();
    const state = session.state, current = state.stage === 'words' ? word() : page();
    const text = current.word || current.sentence;
    listening = true;
    setTalking($('.st-reading__buddy'), true);
    const finish = async () => {
      if (!active || !listening) return;
      listening = false;
      setTalking($('.st-reading__buddy'), false);
      if (session.state.stage === 'sentence') {
        try { await act('listen'); } catch (error) { notice = error.message; draw(); }
      }
    };
    const failed = () => { listening = false; if (active) { notice = 'Hindi mapatugtog ang halimbawa. Subukan muli.'; draw(); } };
    if (current.audioUrl) {
      player = new Audio(current.audioUrl); player.onended = finish; player.onerror = failed;
      player.play().catch(failed);
    } else if (state.stage === 'words' && window.speechSynthesis) {
      const speech = new SpeechSynthesisUtterance(text); speech.lang = 'fil-PH'; speech.onend = finish; speech.onerror = failed; window.speechSynthesis.speak(speech);
    } else failed();
  }
  async function beginHold(target) {
    if (busy || held || processing || target.disabled || !['words', 'record', 'preview'].includes(session.state.stage)) return;
    stopAudio(); $('#reading-preview')?.pause();
    held = true; processing = true; release = new AbortController(); cancel = new AbortController();
    const recordingStage = session.state.stage;
    let limitReached = false;
    target.setAttribute('aria-pressed', 'true'); target.classList.add('is-holding');
    $('#reading-mic-hint').textContent = 'Nakikinig ako… bitawan kapag tapos na';
    try {
      microphone ||= new Microphone({ maxSeconds: 45 });
      const opened = await microphone.open();
      if (!active || !held) return;
      if (opened !== 'ok') throw new Error(opened === 'denied' ? 'Payagan ang mikropono, pagkatapos ay hawakan muli.' : 'Hindi magamit ang mikropono ngayon.');
      holdTimeout = setTimeout(() => { limitReached = true; endHold(); }, 45000);
      const result = await microphone.record(level => { if (target.isConnected) target.style.setProperty('--voice', level); }, cancel.signal, release.signal);
      if (!active || result.cancelled) return;
      if (!result.wav) throw new Error('Wala akong narinig. Hawakan muli ang mic at magsalita nang malinaw.');
      if (recordingStage === 'words') await act('word');
      else await act('upload', { blob: result.wav, eventId: crypto.randomUUID(), createdAt: Date.now() });
      if (limitReached) notice = 'Umabot sa 45 segundo ang recording. Pakinggan ito o bumasa muli.';
    } catch (error) { notice = error.message; }
    finally { clearTimeout(holdTimeout); held = false; processing = false; if (active) draw(); }
  }
  function endHold(cancelled = false) {
    if (!held) return;
    held = false;
    if (cancelled) cancel?.abort(); else release?.abort();
    $('[data-reading-mic]')?.classList.remove('is-holding');
  }
  const pointerDown = event => {
    const target = event.target.closest('[data-reading-mic]');
    if (!target || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); target.setPointerCapture?.(event.pointerId); void beginHold(target);
  };
  const pointerUp = () => endHold();
  const pointerCancel = () => endHold(true);
  const contextMenu = event => { if (event.target.closest('[data-reading-mic]')) event.preventDefault(); };
  const keyDown = event => { if (event.target.matches('[data-reading-mic]') && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); if (!event.repeat) void beginHold(event.target); } };
  const keyUp = event => { if ([' ', 'Enter'].includes(event.key)) endHold(); };
  const click = async event => {
    const button = event.target.closest('button');
    if (!button || busy || held || processing) return;
    if (button.matches('[data-reading-listen]')) return listen();
    if (button.matches('[data-reading-sync]')) { await persistSync(); return; }
    if (button.matches('[data-reading-refresh]')) { try { await session.refresh(); syncError = ''; draw(); } catch (error) { notice = error.message; draw(); } return; }
    if (button.matches('[data-reading-retake]')) { stopAudio(); $('[data-reading-mic]').focus({ preventScroll: true }); notice = 'Hawakan ang mic para bumasa muli. Papalitan ang recording kapag na-save ang bago.'; $('.st-reading__notice').textContent = notice; return; }
    if (!button.matches('[data-reading-next]')) return;
    stopAudio(); $('#reading-preview')?.pause();
    if (session.state.page < session.state.pages.length - 1) {
      try { await act('next'); } catch (error) { notice = error.message; draw(); }
    } else {
      busy = true; draw();
      try { await session.submit(); invalidateStudentData(); }
      catch (error) { notice = error.message; }
      finally { busy = false; draw(); }
    }
  };
  const hidden = () => { if (document.hidden) { endHold(true); stopAudio(); microphone?.close(); microphone = null; } };
  const blur = () => endHold(true);
  const online = () => { if (active) void persistSync(); };
  root.addEventListener('pointerdown', pointerDown); root.addEventListener('pointerup', pointerUp); root.addEventListener('pointercancel', pointerCancel);
  root.addEventListener('keydown', keyDown); root.addEventListener('keyup', keyUp); root.addEventListener('click', click);
  root.addEventListener('contextmenu', contextMenu);
  document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', blur); window.addEventListener('online', online);
  onLeave(() => {
    active = false; clearTimeout(holdTimeout); cancel?.abort(); microphone?.close(); stopAudio(); if (objectUrl) URL.revokeObjectURL(objectUrl);
    root.removeEventListener('pointerdown', pointerDown); root.removeEventListener('pointerup', pointerUp); root.removeEventListener('pointercancel', pointerCancel);
    root.removeEventListener('keydown', keyDown); root.removeEventListener('keyup', keyUp); root.removeEventListener('click', click);
    root.removeEventListener('contextmenu', contextMenu);
    document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', blur); window.removeEventListener('online', online);
  });
  draw(); if (session.pending) void persistSync();
}
