// Browser-test adapter only. The emulator suite tests the real server service.
export function versioningRequest(state, docs, body, allocate) {
  window.versioningCalls = [...(window.versioningCalls || []), structuredClone(body)];
  const kind = body.action === 'save-module' ? 'module' : 'lesson';
  const collection = kind === 'module' ? 'modules' : 'lessons';
  const source = body.sourceId ? docs.get(`${collection}/${body.sourceId}`) : null;
  const base = item => item.versionBaseTitle || ((item.sourceLessonId || item.sourceModuleId) ? item.title.replace(/\s+(?:-\s*)?1\.\d+$/, '') : item.title);
  const rootId = source && (source.sourceLessonId || source.sourceModuleId || body.sourceId);
  const requestPath = `testRequests/${kind}-${state.user.uid}-${body.requestKey}`;
  const before = docs.get(requestPath);
  if (before) return structuredClone(before);
  if (window.failSave) throw Error('Synthetic save failure');
  if (body.action === 'lesson-visibility') {
    const item = docs.get(`lessons/${body.id}`);
    if (body.visibility === 'private' && [...docs].some(([path, data]) => path.startsWith('modules/') && data.visibility === 'shared' && data.lessonIds.includes(body.id))) throw Error('A Shared module uses this lesson.');
    const changes = { ...item, visibility: body.visibility };
    if (body.visibility === 'private' && !item.teacherId) changes.teacherId = item.createdBy || item.ownerId || state.user.uid;
    if (body.visibility === 'private' && item.adminManaged) changes.adminManaged = false;
    docs.set(`lessons/${body.id}`, changes);
    return { id:body.id, changeKind:'visibility' };
  }
  if (source?.archived) throw Error('Restore the source first.');
  let changeKind = source ? 'version' : 'create';
  if (kind === 'module' && source && body.title === base(source) && body.description === source.description && JSON.stringify(body.lessonIds) === JSON.stringify(source.lessonIds)) {
    if (body.visibility === source.visibility) return {id:body.sourceId,module:structuredClone(source),changeKind:'none'};
    const saved = {...source,visibility:body.visibility,revision:source.revision+1};
    docs.set(`modules/${body.sourceId}`,saved);
    const result={id:body.sourceId,module:structuredClone(saved),changeKind:'visibility'};
    docs.set(requestPath,result); return result;
  }
  let sequence = 0;
  if (source && body.title === base(source)) {
    const counterPath=`testCounters/${kind}-${rootId}-${body.title}`;
    sequence=Math.max(docs.get(counterPath)?.sequence||0,...[...docs].filter(([path])=>path.startsWith(collection+'/')&&path.split('/').length===2).map(([,item])=>{
      const suffix=item.title.startsWith(body.title+' - 1.')?item.title.slice((body.title+' - 1.').length):'';
      return /^\d+$/.test(suffix)?Number(suffix):0;
    }))+1;
    docs.set(counterPath,{sequence});
  }
  const ref=allocate(kind), title=sequence?`${body.title} - 1.${sequence}`:body.title;
  const metadata=source?{[kind==='lesson'?'sourceLessonId':'sourceModuleId']:rootId,[kind==='lesson'?'copiedFromLessonId':'copiedFromModuleId']:body.sourceId,versionBaseTitle:body.title,versionNumber:sequence}:{};
  const saved=kind==='module'?{title,description:body.description,lessonIds:[...body.lessonIds],visibility:body.visibility,ownerId:state.user.uid,revision:1,progression:'sequential',lockingEnabled:false,...metadata}
    :{title,description:body.description,difficulty:body.difficulty,visibility:body.visibility,teacherId:state.user.uid,publicationState:'draft',...metadata};
  docs.set(ref.path,saved);
  const result=kind==='module'?{id:ref.id,module:structuredClone(saved),changeKind}:{id:ref.id,title,changeKind};
  docs.set(requestPath,result);
  if (kind==='lesson'&&window.loseReservation) {window.loseReservation=false;throw Error('Synthetic lost reservation response');}
  return structuredClone(result);
}
