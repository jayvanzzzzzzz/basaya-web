import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';

const fail = (status, message) => Object.assign(new Error(message), { status });
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const sameTitleText = (a, b) => String(a || '').normalize('NFC').trim() === String(b || '').normalize('NFC').trim();
const key = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
export function versionBaseTitle(item = {}) {
  if (item.versionBaseTitle) return item.versionBaseTitle;
  const title = String(item.title || '').trim();
  return item.sourceLessonId || item.sourceModuleId ? title.replace(/\s+(?:-\s*)?1\.\d+$/, '') : title;
}
const owner = (data, kind) => kind === 'module' ? data.ownerId || data.createdBy : data.teacherId || data.createdBy || data.ownerId;
function readable(profile, uid, data, kind) {
  const role = profile.get('role');
  return ['teacher', 'admin'].includes(role) && profile.get('disabled') !== true &&
    (owner(data, kind) === uid || (data.visibility || 'shared') === 'shared');
}
function canChangeVisibility(profile, uid, data, kind) {
  return readable(profile, uid, data, kind) && (owner(data, kind) === uid || profile.get('role') === 'admin');
}
function validateTitle(title) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) throw fail(400, 'Enter a title of up to 120 characters.');
  return title.trim();
}
function validateVisibility(visibility) {
  if (!['private', 'shared'].includes(visibility)) throw fail(400, 'Choose Private or Shared.');
  return visibility;
}
function assertSource(profile, uid, source, kind) {
  if (!source.exists || !readable(profile, uid, source.data(), kind)) throw fail(403, 'This source is unavailable to your account.');
  if (source.get('archived') === true || source.get('deletionPending') === true || source.get('publicationState') === 'draft')
    throw fail(409, 'Restore and finish the source before editing it.');
}
function counterFor(database, kind, rootId, base) {
  const hash = createHash('sha256').update(JSON.stringify([kind, rootId, base.normalize('NFC').trim()])).digest('hex');
  return database.doc(`contentVersionCounters/${hash}`);
}
function highestNumber(base, docs) {
  const prefixes = [`${base} - 1.`, `${base} 1.`].map(value => value.normalize('NFC'));
  return docs.reduce((max, doc) => {
    const title = String(doc.get('title') || '').normalize('NFC').trim();
    const prefix = prefixes.find(value => title.startsWith(value));
    const suffix = prefix ? title.slice(prefix.length) : '';
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, 0);
}
async function visibleTitles(tx, database, uid, kind) {
  const collection = database.collection(kind === 'lesson' ? 'lessons' : 'modules');
  const [authored, shared] = await Promise.all([
    tx.get(collection.where(kind === 'lesson' ? 'teacherId' : 'ownerId', '==', uid)),
    tx.get(collection.where('visibility', '==', 'shared')),
  ]);
  return [...new Map([...authored.docs, ...shared.docs].map(doc => [doc.id, doc])).values()];
}
function metadata(source, kind, title, sequence) {
  const rootId = source.get(kind === 'lesson' ? 'sourceLessonId' : 'sourceModuleId') || source.id;
  return {
    [kind === 'lesson' ? 'sourceLessonId' : 'sourceModuleId']: rootId,
    [kind === 'lesson' ? 'copiedFromLessonId' : 'copiedFromModuleId']: source.id,
    versionBaseTitle: title, versionNumber: sequence,
  };
}

// Reserving by a stable request key makes response loss and retries idempotent.
export async function reserveLessonVersion(database, uid, body) {
  const title = validateTitle(body.title), visibility = validateVisibility(body.visibility);
  if (!validId(body.sourceId) || !validId(body.requestKey)) throw fail(400, 'A source lesson and save request are required.');
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > 300 || typeof body.difficulty !== 'string') throw fail(400, 'Check the lesson details.');
  const ref = database.collection('lessons').doc();
  const requestRef = database.doc(`contentVersionRequests/${uid}_${body.requestKey}`);
  return database.runTransaction(async tx => {
    const [profile, source, request] = await Promise.all([
      tx.get(database.doc(`users/${uid}`)), tx.get(database.doc(`lessons/${body.sourceId}`)), tx.get(requestRef),
    ]);
    assertSource(profile, uid, source, 'lesson');
    if (request.exists) {
      if (request.get('sourceId') !== body.sourceId || !sameTitleText(request.get('requestedTitle'), title)) throw fail(409, 'This save request has a different title. Reopen the editor before saving again.');
      const reserved = await tx.get(database.doc(`lessons/${request.get('id')}`));
      if (!reserved.exists || reserved.get('teacherId') !== uid) throw fail(409, 'The reserved lesson is unavailable. Reopen the editor.');
      return { id: reserved.id, title: reserved.get('title'), changeKind: 'version' };
    }
    const stamp = source.get('updatedAt');
    if (body.expectedUpdatedAt && `${stamp?.seconds}:${stamp?.nanoseconds}` !== body.expectedUpdatedAt)
      throw fail(409, 'This lesson changed in another session. Reopen it before saving.');
    const unchangedName = sameTitleText(title, versionBaseTitle(source.data())) || sameTitleText(title, source.get('title'));
    const baseTitle = unchangedName ? versionBaseTitle(source.data()) : title;
    const rootId = source.get('sourceLessonId') || source.id;
    const counterRef = counterFor(database, 'lesson', rootId, baseTitle);
    const [counter, titles, legacyCounter] = await Promise.all([
      unchangedName ? tx.get(counterRef) : null,
      visibleTitles(tx, database, uid, 'lesson'),
      unchangedName && !source.get('versionBaseTitle') ? tx.get(database.doc(`lessonCopyCounters/${rootId}`)) : null,
    ]);
    if (!unchangedName && titles.some(doc => doc.id !== source.id && key(doc.get('title')) === key(title)))
      throw fail(409, 'That new lesson title already exists. Choose another title.');
    const sequence = unchangedName ? Math.max(counter?.get('sequence') || 0, legacyCounter?.get('sequence') || 0, highestNumber(baseTitle, titles)) + 1 : 0;
    const savedTitle = sequence ? `${baseTitle} - 1.${sequence}` : title;
    tx.set(ref, { title: savedTitle, description, difficulty: body.difficulty, visibility, teacherId: uid,
      ...metadata(source, 'lesson', baseTitle, sequence), publicationState: 'draft', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (sequence) tx.set(counterRef, { sequence });
    tx.set(requestRef, { id: ref.id, sourceId: source.id, requestedTitle: title, createdAt: FieldValue.serverTimestamp() });
    return { id: ref.id, title: savedTitle, changeKind: 'version' };
  });
}

export async function setLessonVisibility(database, uid, { id, visibility }) {
  if (!validId(id)) throw fail(400, 'Choose a lesson.');
  validateVisibility(visibility);
  return database.runTransaction(async tx => {
    const ref = database.doc(`lessons/${id}`);
    const [profile, source] = await Promise.all([tx.get(database.doc(`users/${uid}`)), tx.get(ref)]);
    assertSource(profile, uid, source, 'lesson');
    if (!canChangeVisibility(profile, uid, source.data(), 'lesson')) throw fail(403, 'Only the owner or an admin can change visibility. Content edits create your own version.');
    if ((source.get('visibility') || 'shared') === visibility) return { id, changeKind: 'none' };
    if (visibility === 'private') {
      const modules = await tx.get(database.collection('modules').where('visibility', '==', 'shared'));
      if (modules.docs.some(doc => (doc.get('lessonIds') || []).includes(id))) throw fail(409, 'A Shared module uses this lesson. Make that module Private or replace this lesson first.');
    }
    const changes = { visibility, updatedAt: FieldValue.serverTimestamp() };
    if (visibility === 'private' && !source.get('teacherId')) changes.teacherId = owner(source.data(), 'lesson') || uid;
    if (visibility === 'private' && source.get('adminManaged')) changes.adminManaged = false;
    tx.update(ref, changes);
    return { id, changeKind: 'visibility' };
  });
}

export async function saveModuleVersion(database, uid, body) {
  let title = validateTitle(body.title);
  const visibility = validateVisibility(body.visibility);
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const ids = body.lessonIds;
  if (description.length > 1000 || !Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length)
    throw fail(400, 'Choose 1–100 unique lessons and a description of up to 1,000 characters.');
  if (body.sourceId && !validId(body.sourceId)) throw fail(400, 'Choose a source module.');
  if (!validId(body.requestKey)) throw fail(400, 'A save request is required.');
  const requestRef = database.doc(`contentVersionRequests/${uid}_module_${body.requestKey}`);
  const created = database.collection('modules').doc();
  return database.runTransaction(async tx => {
    const [profile, source, request] = await Promise.all([
      tx.get(database.doc(`users/${uid}`)), body.sourceId ? tx.get(database.doc(`modules/${body.sourceId}`)) : null, tx.get(requestRef),
    ]);
    if (source) assertSource(profile, uid, source, 'module');
    else if (!['teacher', 'admin'].includes(profile.get('role')) || profile.get('disabled') === true) throw fail(403, 'Staff access is required.');
    if (source && sameTitleText(title, source.get('title'))) title = versionBaseTitle(source.data());
    const fingerprint = JSON.stringify([body.sourceId || '', title, description, ids, visibility]);
    if (request.exists) {
      if (request.get('fingerprint') !== fingerprint) throw fail(409, 'This save request has different changes. Reopen the module.');
      const saved = await tx.get(database.doc(`modules/${request.get('id')}`));
      if (!saved.exists) throw fail(409, 'The saved module no longer exists.');
      return { id: saved.id, module: saved.data(), changeKind: request.get('changeKind') };
    }
    if (source && source.get('revision') !== body.revision) throw fail(409, 'This module changed in another session. Reopen it before saving.');
    const contentChanged = source && (!sameTitleText(title, versionBaseTitle(source.data())) || description !== (source.get('description') || '') || JSON.stringify(ids) !== JSON.stringify(source.get('lessonIds')));
    if (source && !contentChanged && (source.get('visibility') || 'shared') === visibility)
      return { id: source.id, module: source.data(), changeKind: 'none' };
    if (source && !contentChanged && !canChangeVisibility(profile, uid, source.data(), 'module'))
      throw fail(403, 'Only the owner or an admin can change visibility. Edit content to create your own version.');
    const lessons = await Promise.all(ids.map(id => tx.get(database.doc(`lessons/${id}`))));
    if (source && !contentChanged && visibility === 'private') {
      const paths = await tx.get(database.collection('learningPaths').where('visibility', '==', 'shared'));
      if (paths.docs.some(path => (path.get('moduleIds') || []).includes(source.id))) throw fail(409, 'A Shared learning path uses this module. Make that path Private or replace the module first.');
    }
    if (lessons.some(doc => !doc.exists || !readable(profile, uid, doc.data(), 'lesson') || doc.get('archived') === true || doc.get('publicationState') === 'draft'))
      throw fail(409, 'A selected lesson was removed, archived, unfinished or is unavailable to your account.');
    if (visibility === 'shared' && lessons.some(doc => doc.get('visibility') === 'private')) throw fail(409, 'Share each private lesson before sharing this module.');
    const changeKind = source && !contentChanged ? 'visibility' : source ? 'version' : 'create';
    const unchangedName = source && sameTitleText(title, versionBaseTitle(source.data()));
    const rootId = source && (source.get('sourceModuleId') || source.id);
    const counterRef = source ? counterFor(database, 'module', rootId, title) : null;
    const [counter, titles] = await Promise.all([
      changeKind === 'version' && unchangedName ? tx.get(counterRef) : null,
      changeKind === 'version' ? visibleTitles(tx, database, uid, 'module') : [],
    ]);
    if (changeKind === 'version' && !unchangedName && titles.some(doc => doc.id !== source.id && key(doc.get('title')) === key(title)))
      throw fail(409, 'That new module title already exists. Choose another title.');
    const sequence = changeKind === 'version' && unchangedName ? Math.max(counter?.get('sequence') || 0, highestNumber(title, titles)) + 1 : 0;
    const ref = changeKind === 'visibility' ? source.ref : created;
    const saved = changeKind === 'visibility' ? { ...source.data(), visibility, revision: source.get('revision') + 1, updatedAt: FieldValue.serverTimestamp() }
      : { title: sequence ? `${title} - 1.${sequence}` : title, description, lessonIds: ids, ownerId: uid, visibility,
        ...(source ? metadata(source, 'module', title, sequence) : {}), revision: 1, progression: 'sequential', lockingEnabled: false,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    tx.set(ref, saved);
    if (sequence) tx.set(counterRef, { sequence });
    tx.set(requestRef, { id: ref.id, fingerprint, changeKind, createdAt: FieldValue.serverTimestamp() });
    return { id: ref.id, module: saved, changeKind };
  });
}
