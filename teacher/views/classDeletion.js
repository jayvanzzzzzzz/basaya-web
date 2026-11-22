import { classLifecycle } from '../../js/api.js';
import { $, escapeHtml, openModal, toast } from '../../js/helpers.js';

// Existing exports keep callers compatible; teachers now archive directly.
export const deletionChip = classroom => classroom.archived ? '<span class="deletion-chip deletion-chip--pending">Archived</span>' : '';
export const deletionBanner = () => '';
export const wireDeletionBanner = () => {};
export const confirmCancelRequest = (classroom,onChange) => openRequestDeletionModal(classroom,onChange);
export function openRequestDeletionModal(classroom,onChange) {
  const restoring=classroom.archived===true, label=restoring?'Restore class':'Archive class';
  openModal(`<div class="deletion-modal"><h2>${label}?</h2><p><strong>${escapeHtml(classroom.className)}</strong></p><div class="deletion-modal__impact"><strong>All students, lessons, schedules and saved progress are preserved.</strong><p>${restoring?'The class returns to Active. Students who are still enrolled can resume participation. Dropped students remain dropped. Deadlines passed while archived stay exempt.':'The class moves to Archived. Lessons and submissions pause, and the class code stops accepting requests. You can restore this class from the Archived tab.'}</p></div><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button secondary" data-cancel>Cancel</button><button type="button" class="button primary" data-confirm>${label}</button></div></div>`,(modal,close)=>{
    $('[data-cancel]',modal).onclick=close;
    $('[data-confirm]',modal).onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;button.textContent=restoring?'Restoring...':'Archiving...';
      try {await classLifecycle(restoring?'restore':'archive',classroom.id);close();toast(restoring?'Class restored.':'Class archived. All records are preserved.');await onChange();}
      catch(error){$('.form-error',modal).textContent=error.message;button.disabled=false;button.textContent=label;}
    };
  });
}
