import { Timestamp } from 'firebase-admin/firestore';
import { AssessmentError } from './assessments.js';

const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const fail = (status, message) => { throw new AssessmentError(status, message); };
let seedPromise;
async function seedWords() {
  return seedPromise ||= fetch('https://raw.githubusercontent.com/jayvanzzzzzzz/basaya-web/main/data/dictionary/tl-seed.json', { signal: AbortSignal.timeout(10000) })
    .then(response => { if (!response.ok) throw new Error('Dictionary unavailable'); return response.json(); })
    .then(rows => new Map(rows.map(row => [row.k, row.a || row.w])))
    .catch(error => { seedPromise = null; throw new AssessmentError(503, 'Hindi makuha ang dictionary ngayon. Subukan muli.'); });
}
async function spokenText(db, key, loadSeed) {
  const snap = await db.doc(`dictionary/${key}`).get();
  if (snap.exists) return snap.get('hidden') ? '' : snap.get('accent') || snap.get('word') || '';
  return (await loadSeed()).get(key) || '';
}
function safeAudio(lessonId, entry) {
  const prefix = `lessons/${lessonId}/pronunciation/page-0/`;
  if (!entry?.storageKey?.startsWith(prefix) || entry.storageKey.includes('..') || !entry.storageKey.endsWith('.mp3')) return false;
  const expected = `https://basaya-tts.jayvanzsingca5.workers.dev/audio/${entry.storageKey.split('/').map(encodeURIComponent).join('/')}`;
  return entry.audioUrl === expected;
}

// The audio reference comes from the saved lesson, never from a caller-provided URL.
export async function dictionaryAudioOperation(db, uid, body, loadSeed = seedWords) {
  const profile = await db.doc(`users/${uid}`).get();
  if (!['admin', 'teacher', 'student'].includes(profile.get('role'))) fail(403, 'Sign in to use dictionary audio.');
  if (body.operation === 'dictionary-audio-resolve') {
    const key = normalize(body.key);
    if (!key || key.length > 60 || /\/|\.\./.test(key)) fail(400, 'Invalid dictionary word.');
    const audio = (await db.doc(`dictionaryAudio/${key}`).get()).data();
    if (!audio) return { audioUrl: null };
    const currentText = await spokenText(db, key, loadSeed);
    return { audioUrl: currentText && currentText === audio.spokenText && safeAudio(audio.lessonId, audio) ? audio.audioUrl : null };
  }
  if (body.operation !== 'dictionary-audio-sync') fail(400, 'Invalid dictionary audio operation.');
  if (profile.get('role') !== 'admin') fail(403, 'Only an admin can publish lesson audio to the dictionary.');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(body.lessonId || '')) fail(400, 'Invalid lesson.');
  const content = (await db.doc(`lessons/${body.lessonId}/pronunciation/content`).get()).data();
  if (!content) fail(404, 'Save the pronunciation content first.');
  if (!Array.isArray(content.words) || content.words.length > 500) fail(400, 'Too many Get Ready words.');
  const checked = await Promise.all(content.words.map(async (word, index) => {
    const audio = content.cloudAudio?.[index];
    if (!safeAudio(body.lessonId, audio)) return null;
    const key = normalize(word);
    if (!key || key.length > 60 || /\/|\.\./.test(key) || normalize(audio.text) !== key) return null;
    const text = await spokenText(db, key, loadSeed);
    if (!text) return { missing: word };
    return { key, word, spokenText: text, audioUrl: audio.audioUrl, storageKey: audio.storageKey, lessonId: body.lessonId };
  }));
  const rows = checked.filter(row => row?.key);
  const missing = checked.filter(row => row?.missing).map(row => row.missing);
  // One batch: a failed sync never replaces only part of the dictionary audio.
  const batch = db.batch();
  rows.forEach(row => batch.set(db.doc(`dictionaryAudio/${row.key}`), { ...row, updatedBy: uid, updatedAt: Timestamp.now() }));
  if (rows.length) await batch.commit();
  return { synced: rows.length, missing };
}
