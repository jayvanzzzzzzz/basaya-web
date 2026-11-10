import { $, escapeHtml, navigate } from '../../js/helpers.js';
import { content, icon, talkingBuddy, setTalking } from '../ui.js';
import { onLeave } from '../router.js';
import { Microphone } from '../speech.js';
import { openReading } from '../fluencySession.js';
import { invalidateStudentData } from '../data.js';
import { fillSentence, followAlong } from '../readAlong.js';

export async function renderFluency(lesson) {
  let active = true;
  onLeave(() => { active = false; });
  const path = `/lesson/${encodeURIComponent(lesson.id)}`;
  content().innerHTML = '<div class="st-focus-loading"><div class="st-loading" role="status" aria-label="Inihahanda ang iyong pagbasa…"><span></span><span></span><span></span></div></div>';
  let session;
  try { session = await openReading(lesson); }
  catch (error) { content().innerHTML = `<section class="st-reading"><a href="#${path}">← Bumalik</a><h1>Ipagpatuloy natin ang pagbasa</h1><p>${escapeHtml(error.message)}</p><button class="button primary" id="reading-reopen">Subukan muli</button></section>`; $('#reading-reopen').onclick = () => renderFluency(lesson); return; }
  if (!active) return;
  let busy = false, held = false, processing = false, listening = false, cancel, release, player, objectUrl, microphone, holdTimeout;
  let notice = '', syncError = '', retakingPage = null;
  let noticeKind = 'info';
  let speechDiagnostic = null;
  let stopHighlight = () => {};
  const root = content();
  const stopAudio = () => { stopHighlight(); stopHighlight = () => {}; player?.pause(); $('#reading-preview')?.pause(); window.speechSynthesis?.cancel(); listening = false; setTalking($('.st-reading__buddy'), false); };
  const persistSync = () => session.sync().then(() => { syncError = ''; if (active && !held && !processing && !busy && !listening) draw(); }).catch(error => { syncError = error.message; if (active && !held && !processing && !busy && !listening) draw(); });
  const act = async (operation, clip) => { await session.act(operation, clip); if (operation === 'upload' || operation === 'next') retakingPage = null; notice = ''; draw(); void persistSync(); };
  const page = () => session.state.pages[session.state.page];
  const word = () => page().words[session.state.word];
  function setChecking(checking) {
    if (!active) return;
    const hint = $('#reading-mic-hint');
    $('.st-reading__record')?.classList.toggle('is-checking', checking);
    $('.st-reading__record')?.setAttribute('aria-busy', String(checking));
    if (hint) hint.innerHTML = checking ? '<span class="st-reading__checking" role="status"><span class="st-reading__checking-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span>Sinusuri ang sagot…</span></span>' : '';
  }
  function paintNotice() {
    const remark = $('.st-reading__notice');
    if (!remark) return;
    const paths = {
      correct: '<path d="m5 12 4 4L19 6"/>',
      retry: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
      silence: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
      connection: '<path d="m3 3 18 18M2 8a16 16 0 0 1 4-2M10 4a16 16 0 0 1 12 4M5 12a11 11 0 0 1 5-2M15 11a11 11 0 0 1 4 1M8 16a6 6 0 0 1 8 0M12 20h.01"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    };
    remark.dataset.kind = noticeKind;
    const debug = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname) && speechDiagnostic && ['retry', 'silence'].includes(noticeKind)
      ? `<small class="st-reading__diagnostic"><span>Inaasahan: ${escapeHtml(speechDiagnostic.expectedWord)}</span><span>Narinig: ${speechDiagnostic.recognizedText.trim() ? escapeHtml(speechDiagnostic.recognizedText) : 'Walang malinaw na salita'}</span></small>` : '';
    remark.innerHTML = notice ? `<span class="st-reading__remark-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[noticeKind] || paths.info}</svg></span><span class="st-reading__remark-copy"><strong>${escapeHtml(notice)}</strong>${debug}</span>` : '';
  }
  async function showWordFeedback(correct) {
    const card = $('.st-reading__card');
    card?.classList.add(correct ? 'is-word-correct' : 'is-word-retry');
    paintNotice();
    // Keep the word just spoken visible while celebrating its accepted result.
    if (correct) await new Promise(resolve => setTimeout(resolve, 1100));
  }
  function wordError(error) {
    if (['WORD_VERIFICATION_UNAVAILABLE', 'READING_PROGRESS_CHANGED'].includes(error.code)) return error.message;
    if (error.status === 409) return error.message;
    if (error.status === 401 || error.status === 403) return 'Mag-log in muli upang maipagpatuloy ang pagsasanay.';
    if (error.status === 429) return 'Magpahinga muna sandali, pagkatapos ay subukan muli.';
    return 'Hindi makakonekta. Tingnan ang iyong internet at subukan muli.';
  }
  function draw() {
    if (!active) return;
    stopHighlight();
    $('#reading-preview')?.pause();
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    const state = session.state, item = page(), warm = state.stage === 'words';
    if (state.status !== 'draft') {
      const grade = state.grade;
      root.innerHTML = `<section class="st-reading st-reading--finished"><div class="st-reading__seal">${icon('check')}</div><p class="st-reading__eyebrow">BIGKAS • ${state.pages.length} PAHINA</p><h1>${grade ? 'May mensahe ang guro mo!' : 'Naipasa mo na. Ang galing!'}</h1><p>${grade ? escapeHtml(state.feedback || 'Magpatuloy sa pagsasanay!') : lesson.practice ? 'Natapos mo ang pagsasanay sa pagbasa.' : 'Pakikinggan ng iyong guro ang mga recording mo.'}</p>${grade ? `<div class="st-reading__grade"><span>Katumpakan <b>${grade.accuracy}/4</b></span><span>Tuloy-tuloy na pagbasa <b>${grade.smoothness}/4</b></span><span>Pagpapahayag <b>${grade.expression}/4</b></span></div>` : '<span class="st-reading__saved">✓ Naka-save ang lahat ng pahina</span>'}<a class="button primary" href="#${path}">Bumalik sa aralin</a></section>`;
      return;
    }
    const retaking = state.stage === 'preview' && retakingPage === state.page;
    const preview = state.stage === 'preview' && !retaking, canRecord = warm || ['record', 'preview'].includes(state.stage);
    const selectedWord = word();
    root.innerHTML = `<section class="st-reading">
      <header class="st-reading__top"><a class="st-icon-button" href="#${path}" aria-label="Bumalik">${icon('close')}</a><div class="st-reading__pages" aria-label="Mga pahina">${state.pages.map((_, i) => `<span class="${i === state.page ? 'is-current' : i < state.page ? 'is-done' : ''}">${i < state.page ? '✓' : i + 1}</span>`).join('')}</div><strong>${state.page + 1}/${state.pages.length}</strong></header>
      <div class="st-reading__heading"><h1>${warm ? 'Handa, bigkas!' : preview ? 'Pakinggan ang iyong pagbasa' : 'Ikaw naman ang bumasa'}</h1><p>${warm ? 'Sanayin muna natin ang mga salita.' : preview ? 'Masaya ka na ba sa iyong recording?' : 'Pakinggan, pagkatapos ay basahin nang malakas.'}</p></div>
      <div class="st-reading__steps"><span class="${warm ? 'is-active' : 'is-done'}">1 <b>Get Ready</b></span><i></i><span class="${!warm && !preview ? 'is-active' : preview ? 'is-done' : ''}">2 <b>Basahin</b></span><i></i><span class="${preview ? 'is-active' : ''}">3 <b>Pakinggan</b></span></div>
      <div class="st-reading__stage">${talkingBuddy('st-buddy st-buddy--idle st-reading__buddy')}<article class="st-reading__card ${warm ? 'st-reading__card--word' : ''}"><span class="st-reading__card-label">${warm ? `SALITA ${state.word + 1} / ${item.words.length}` : `PAGBASA ${state.page + 1}`}</span><${warm ? 'h2' : 'p'} class="st-reading__text">${escapeHtml(warm ? selectedWord?.word || '' : item.sentence)}</${warm ? 'h2' : 'p'}><button class="st-reading__listen" type="button" data-reading-listen ${busy ? 'disabled' : ''}>${icon('speaker')}<span>${warm ? 'Pakinggan ang salita' : 'Pakinggan ang halimbawa'}</span></button></article></div>
      ${preview ? `<div class="st-reading__preview"><div class="st-reading__preview-heading"><span class="st-reading__recording-icon">${icon('mic')}</span><div><strong>Ang aking recording</strong></div></div><div class="st-reading__transport"><button type="button" class="st-reading__play" data-reading-play aria-label="Pakinggan ang recording">${icon('play')}</button><div class="st-reading__track"><div class="st-reading__wave" aria-hidden="true">${[9,18,12,27,19,33,14,24,36,18,29,13,32,22,15,28,11,21,9].map(height => `<i style="--bar:${height}px"></i>`).join('')}</div><input type="range" min="0" max="1000" value="0" step="1" disabled data-reading-seek aria-label="Posisyon ng recording"><div class="st-reading__time"><span id="reading-current-time">0:00</span><span id="reading-duration">0:00</span></div></div></div><audio preload="metadata" id="reading-preview" hidden></audio>${session.pending ? '<p class="st-reading__saved">Hinihintay ang upload</p>' : ''}</div>` : ''}
      <div class="st-reading__feedback-slot ${warm ? 'is-word-feedback' : ''}"><div class="st-reading__notice st-reading__remark" role="status" aria-live="polite" aria-atomic="true"></div></div>
      ${!preview ? `<div class="st-reading__record"><div class="st-reading__mic-stage"><span class="st-reading__voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><button type="button" class="st-reading__mic" data-reading-mic aria-label="Hawakan ang mikropono habang bumabasa" aria-pressed="false" ${!canRecord || busy ? 'disabled' : ''}>${icon('mic')}</button><span class="st-reading__voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div><p id="reading-mic-hint">${canRecord ? warm ? 'Hawakan ang mic at bigkasin ang salita' : 'Hawakan ang mic habang bumabasa' : 'Pakinggan muna ang halimbawa'}</p><small>Bitawan ang mic kapag tapos na</small></div>` : ''}
      ${syncError ? `<div class="st-reading__sync" role="status"><span>${escapeHtml(syncError)}<br>Naka-save sa device ang iyong progreso.</span><div><button type="button" class="button secondary small" data-reading-sync>Subukan muli</button><button type="button" class="button secondary small" data-reading-refresh>Gamitin ang pinakabagong progreso</button></div></div>` : ''}
      ${preview ? `<footer class="st-reading__actions"><button class="button secondary" type="button" data-reading-retake ${busy ? 'disabled' : ''}>Bumasa muli</button><button class="button primary" type="button" data-reading-next ${busy ? 'disabled' : ''}>${busy ? 'Ipinapasa…' : state.page === state.pages.length - 1 ? 'Tapusin at ipasa' : 'Susunod na pahina'} ${icon('chevron')}</button></footer>` : ''}
      ${retaking ? '<button class="st-reading__return" type="button" data-reading-keep>Bumalik sa dating recording</button>' : ''}
    </section>`;
    const line = $('.st-reading__text');
    line.classList.add('st-sentence');
    fillSentence(line, warm ? selectedWord?.word || '' : item.sentence);
    paintNotice();
    if (warm && noticeKind === 'retry' && notice) $('.st-reading__card')?.classList.add('is-word-retry');
    if (preview) {
      const audio = $('#reading-preview');
      const toggle = $('[data-reading-play]'), seek = $('[data-reading-seek]');
      const time = value => { const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
      const update = () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        seek.disabled = duration <= 0;
        seek.value = duration > 0 ? Math.round(audio.currentTime / duration * 1000) : 0;
        seek.style.setProperty('--progress', `${Number(seek.value) / 10}%`);
        $('#reading-current-time').textContent = time(audio.currentTime);
        $('#reading-duration').textContent = time(duration);
      };
      const playbackState = () => {
        const playing = !audio.paused && !audio.ended;
        toggle.innerHTML = icon(playing ? 'pause' : 'play');
        toggle.setAttribute('aria-label', playing ? 'I-pause ang recording' : 'Pakinggan ang recording');
        $('.st-reading__preview')?.classList.toggle('is-playing', playing);
      };
      ['loadedmetadata', 'timeupdate', 'durationchange'].forEach(name => audio.addEventListener(name, update));
      ['play', 'pause', 'ended'].forEach(name => audio.addEventListener(name, playbackState));
      audio.addEventListener('error', () => { if (active && audio.isConnected) { noticeKind = 'connection'; notice = 'Hindi mapatugtog ang recording. Subukan muli.'; paintNotice(); } });
      seek.addEventListener('input', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) { audio.currentTime = Number(seek.value) / 1000 * audio.duration; update(); } });
      const clip = session.clip(state.page);
      if (clip?.blob && clip.eventId === state.clips[state.page]?.eventId) { objectUrl = URL.createObjectURL(clip.blob); audio.src = objectUrl; }
      else session.playback(state.page).then(url => { if (active && audio.isConnected) audio.src = url; }).catch(error => { if (active) { notice = error.message; noticeKind = 'info'; paintNotice(); } });
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
      stopHighlight();
      listening = false;
      setTalking($('.st-reading__buddy'), false);
      if (session.state.stage === 'sentence') {
        try { await act('listen'); } catch (error) { notice = error.message; draw(); }
      }
    };
    const failed = () => { stopAudio(); if (active) { notice = 'Hindi mapatugtog ang halimbawa. Subukan muli.'; draw(); } };
    if (current.audioUrl) {
      player = new Audio(current.audioUrl); player.onended = finish; player.onerror = failed;
      stopHighlight = followAlong($('.st-reading__text'), player, current.wordStarts);
      player.play().catch(failed);
    } else if (state.stage === 'words' && window.speechSynthesis) {
      const speech = new SpeechSynthesisUtterance(text); speech.lang = 'fil-PH'; speech.onend = finish; speech.onerror = failed; window.speechSynthesis.speak(speech);
      const wordSpan = $('.st-reading__text .st-word');
      wordSpan?.classList.add('is-speaking');
      stopHighlight = () => wordSpan?.classList.remove('is-speaking');
    } else failed();
  }
  async function beginHold(target) {
    if (busy || held || processing || target.disabled || !['words', 'record', 'preview'].includes(session.state.stage)) return;
    stopAudio(); $('#reading-preview')?.pause();
    notice = ''; noticeKind = 'info'; speechDiagnostic = null; paintNotice();
    $('.st-reading__card')?.classList.remove('is-word-retry', 'is-word-correct');
    held = true; processing = true; release = new AbortController(); cancel = new AbortController();
    const recordingStage = session.state.stage;
    let limitReached = false;
    target.setAttribute('aria-pressed', 'true'); target.classList.add('is-holding');
    $('.st-reading__record')?.classList.add('is-listening');
    $('#reading-mic-hint').textContent = 'Nakikinig ako… bitawan kapag tapos na';
    try {
      microphone ||= new Microphone({ maxSeconds: 45 });
      microphone.maxFrames = recordingStage === 'words' ? 350 : 2250;
      const opened = await microphone.open();
      if (!active || !held) return;
      if (opened !== 'ok') throw new Error(opened === 'denied' ? 'Payagan ang mikropono, pagkatapos ay hawakan muli.' : 'Hindi magamit ang mikropono ngayon.');
      holdTimeout = setTimeout(() => { limitReached = true; endHold(); }, recordingStage === 'words' ? 7000 : 45000);
      const result = await microphone.record(level => { if (target.isConnected) { target.style.setProperty('--voice', level); $('.st-reading__record')?.style.setProperty('--voice', level); } }, cancel.signal, release.signal);
      clearTimeout(holdTimeout);
      if (!active || result.cancelled) return;
      if (!result.wav) { noticeKind = 'silence'; notice = 'Wala akong narinig, subukan muli.'; return; }
      if (recordingStage === 'words') {
        target.disabled = true;
        setChecking(true);
        let checked;
        try { checked = await session.checkWord({ blob: result.wav, eventId: crypto.randomUUID() }); }
        catch (error) { noticeKind = error.code ? 'info' : 'connection'; notice = wordError(error); return; }
        finally { setChecking(false); }
        if (!active) return;
        speechDiagnostic = typeof checked.speechDiagnostic?.expectedWord === 'string' && typeof checked.speechDiagnostic?.recognizedText === 'string' ? checked.speechDiagnostic : null;
        notice = checked.wordAccepted ? 'Tama! Ang galing mo!' : checked.noSpeech ? 'Wala akong narinig, subukan muli.' : 'Subukan ulit. Kaya mo ’yan!';
        noticeKind = checked.wordAccepted ? 'correct' : checked.noSpeech ? 'silence' : 'retry';
        if (!checked.noSpeech) await showWordFeedback(checked.wordAccepted);
        if (checked.wordAccepted) notice = '';
      } else {
        await act('upload', { blob: result.wav, eventId: crypto.randomUUID(), createdAt: Date.now() });
        if (limitReached) notice = 'Umabot sa 45 segundo ang recording. Pakinggan ito o bumasa muli.';
      }
    } catch (error) { noticeKind = 'info'; notice = error.message; }
    finally { clearTimeout(holdTimeout); held = false; processing = false; if (active) draw(); }
  }
  function endHold(cancelled = false) {
    if (!held) return;
    held = false;
    $('[data-reading-mic]')?.setAttribute('aria-pressed', 'false');
    if (cancelled) cancel?.abort(); else release?.abort();
    $('[data-reading-mic]')?.classList.remove('is-holding');
    $('.st-reading__record')?.classList.remove('is-listening');
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
    if (button.matches('[data-reading-play]')) {
      const audio = $('#reading-preview');
      if (!audio?.src) return;
      if (!audio.paused) audio.pause();
      else { stopAudio(); try { await audio.play(); } catch { noticeKind = 'connection'; notice = 'Hindi mapatugtog ang recording. Subukan muli.'; paintNotice(); } }
      return;
    }
    if (button.matches('[data-reading-sync]')) { await persistSync(); return; }
    if (button.matches('[data-reading-refresh]')) { try { await session.refresh(); syncError = ''; draw(); } catch (error) { notice = error.message; draw(); } return; }
    if (button.matches('[data-reading-retake]')) { stopAudio(); retakingPage = session.state.page; notice = ''; draw(); $('[data-reading-mic]')?.focus({ preventScroll: true }); $('.st-reading__stage')?.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
    if (button.matches('[data-reading-keep]')) { stopAudio(); retakingPage = null; notice = ''; draw(); return; }
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
