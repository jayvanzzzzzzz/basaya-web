import { collection,doc,getDoc,getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { escapeHtml } from "../../js/helpers.js";
import { lessonDeadline } from "../../js/deadline-policy.js";
export const deadlineAudienceMarkup = () => `<fieldset class="deadline-audience"><legend>Extend for</legend><label><input type="radio" name="audience" value="class" checked />Entire class</label><label><input type="radio" name="audience" value="students" />Selected students</label></fieldset><section class="deadline-picker" data-deadline-picker hidden><p class="muted">Only active students can receive an extension. Everyone else keeps their existing deadline.</p><label>Find students<input type="search" data-deadline-search placeholder="Search name, LRN or username" autocomplete="off" /></label><label class="deadline-picker__all"><input type="checkbox" data-deadline-all />Select all shown</label><p data-deadline-count aria-live="polite">0 selected</p><div class="deadline-picker__list" data-deadline-list role="group" aria-label="Students eligible for extension"></div><p data-deadline-status role="status"></p></section>`;
export function wireDeadlineAudience(backdrop,classId,link,onSelectionChange=()=>{}) {
  const picker=backdrop.querySelector('[data-deadline-picker]'),list=backdrop.querySelector('[data-deadline-list]'),search=backdrop.querySelector('[data-deadline-search]'),all=backdrop.querySelector('[data-deadline-all]');
  const selected=new Set(); let students=[],loaded=false,loading=false,error=false;
  const hint=backdrop.querySelector('.lesson-schedule__hint'),defaultHint=hint?.textContent;
  const chosen=()=>backdrop.querySelector('[name=audience]:checked').value==='students';
  function refresh() {
    const query=search.value.trim().toLowerCase();
    list.querySelectorAll('[data-deadline-student]').forEach(row=>{row.hidden=!row.dataset.search.includes(query);row.querySelector('input').checked=selected.has(row.dataset.deadlineStudent);});
    const shown=[...list.querySelectorAll('[data-deadline-student]')].filter(row=>!row.hidden),checked=shown.filter(row=>selected.has(row.dataset.deadlineStudent)).length;
    all.checked=shown.length>0&&checked===shown.length; all.indeterminate=checked>0&&checked<shown.length; all.disabled=!shown.length;
    backdrop.querySelector('[data-deadline-count]').textContent=`${selected.size} selected`;
    onSelectionChange(Math.max(0,...students.filter(student=>selected.has(student.id)).map(student=>student.dueAt || 0)));
  }
  async function load() {
    if(loaded||loading) return; loading=true; error=false;
    backdrop.querySelector('[data-deadline-status]').textContent='Loading active students…';
    try {
      const roster=await getDocs(collection(db,'classes',classId,'students'));
      students=(await Promise.all(roster.docs.map(async member=>{
        const profile=(await getDoc(doc(db,'users',member.id))).data() || {};
        return {id:member.id,...member.data(),profile,dueAt:lessonDeadline(link,member.data(),profile).dueAt};
      }))).filter(student=>student.profile.role==='student'&&student.profile.disabled!==true&&student.membershipStatus!=='dropped'&&student.profile.classId===classId).sort((a,b)=>(a.fullName||'').localeCompare(b.fullName||''));
      list.innerHTML=students.map(student=>`<label data-deadline-student="${escapeHtml(student.id)}" data-search="${escapeHtml([student.fullName,student.profile.firstName,student.profile.lastName,student.profile.lrn,student.profile.username].filter(Boolean).join(' ').toLowerCase())}"><input type="checkbox" value="${escapeHtml(student.id)}" /><span><strong>${escapeHtml(student.fullName||[student.profile.firstName,student.profile.lastName].filter(Boolean).join(' ')||'Student')}</strong><small>${escapeHtml(student.profile.lrn||student.profile.username||'')}${student.dueAt?` · Due ${escapeHtml(new Date(student.dueAt).toLocaleString(undefined,{dateStyle:"short",timeStyle:"short"}))}`:''}</small></span></label>`).join('');
      list.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{if(input.checked)selected.add(input.value);else selected.delete(input.value);refresh();}));
      loaded=true;backdrop.querySelector('[data-deadline-status]').textContent=students.length?'':'No active students are eligible.';refresh();
    } catch {error=true;backdrop.querySelector('[data-deadline-status]').textContent='Could not load students. Switch to Entire class and back to retry.';}
    finally {loading=false;}
  }
  backdrop.querySelectorAll('[name=audience]').forEach(radio=>radio.addEventListener('change',()=>{
    picker.hidden=!chosen();
    const notify=backdrop.querySelector('.extend-deadline__notify');notify.hidden=chosen();
    if(hint)hint.textContent=chosen()?'Only selected active students receive extra time. Completed work stays saved.':defaultHint;
    if(chosen())void load();else onSelectionChange(0);
  }));
  search.addEventListener('input',refresh);
  all.addEventListener('change',()=>{list.querySelectorAll('[data-deadline-student]').forEach(row=>{if(!row.hidden){if(all.checked)selected.add(row.dataset.deadlineStudent);else selected.delete(row.dataset.deadlineStudent);}});refresh();});
  return { selection() {if(!chosen())return null;if(loading||!loaded||error)throw Error('Wait for the active student list to load.');if(!selected.size)throw Error('Select at least one active student.');if(selected.size>200)throw Error('Select at most 200 students at a time.');return [...selected];} };
}
