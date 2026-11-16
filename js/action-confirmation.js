/** Explicitly registered mutations only: navigation, autosave and game answers are unaffected. */
const policies = {
  'register-form': ['Gumawa ng account?', 'Gagawin ang student account gamit ang impormasyong inilagay mo.', 'Gumawa ng account'],
  'profile-form': ['I-save ang iyong impormasyon?', 'Tatapusin nito ang pag-set up ng iyong account.', 'I-save'],
  'reset-form': ['Save new password?', 'Use this new password the next time you sign in.', 'Save password'],
  'join-form': ['Ipadala ang kahilingan?', 'Susuriin ng guro ang iyong kahilingang sumali sa klase.', 'Ipadala'],
  'add-teacher-form': ['Create teacher account?', 'The teacher will be able to sign in with the account details you entered.', 'Create account'],
  'edit-teacher-form': ['Save teacher details?', 'Update this teacher’s name and title.', 'Save changes'],
  'temp-password-form': ['Set temporary password?', 'The student will use the new password the next time they sign in.', 'Set password'],
  'edit-class-form': ['Save class changes?', 'Update the details of this classroom.', 'Save changes'],
  'assign-teacher-form': ['Assign this teacher?', 'Update who manages the selected class.', 'Assign teacher'],
  'class-form': ['Save this class?', 'Create the classroom or apply your edits to its details.', 'Save class'],
  'lesson-form': ['Save this lesson?', 'Save the lesson details and learning content.', 'Save lesson'],
  'schedule-form': ['Save lesson schedule?', 'Students will access this lesson according to the new opening and due dates.', 'Save schedule'],
  'extend-form': ['Extend this deadline?', 'Apply the new deadline to the selected lesson.', 'Extend deadline'],
  'account-profile-form': ['Save profile changes?', 'Update the information shown on your teacher account.', 'Save profile'],
  'account-password-form': ['Update password?', 'Use the new password the next time you sign in.', 'Update password'],
  'admin-password-form': ['Request a password change?', 'An approval link will be sent to your email. Your current password works until you approve.', 'Send approval email'],
  'reading-grade': ['Save this reading grade?', 'Apply your rubric scores to this student’s submitted reading.', 'Save grade'],
  'edit-form': ['I-save ang mga pagbabago?', 'Maa-update ang impormasyon sa iyong account.', 'I-save'],
  'password-form': ['Palitan ang password?', 'Gamitin ang bagong password sa susunod mong pag-sign in.', 'Palitan'],
};
let active = false;
let sequence = 0;
const approved = new WeakSet();
const snapshot = form => JSON.stringify([...new FormData(form)].map(([key, value]) => [key, typeof value === 'string' ? value : [value.name, value.size, value.lastModified]]));

export function confirmAction({ title, message, confirm = 'Save changes', danger = false, student = false }) {
  if (active) return Promise.resolve(false);
  active = true;
  return new Promise(resolve => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    const id = `action-confirm-${++sequence}`;
    dialog.className = `action-confirmation${danger ? ' action-confirmation--danger' : ''}`;
    dialog.setAttribute('aria-labelledby', id);
    dialog.setAttribute('aria-describedby', `${id}-description`);
    const content = document.createElement('div');
    content.className = 'action-confirmation__body';
    const icon = document.createElement('span');
    icon.className = 'action-confirmation__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = danger ? '!' : '✓';
    const heading = document.createElement('h2'); heading.id = id; heading.textContent = title;
    const description = document.createElement('p'); description.id = `${id}-description`; description.textContent = message;
    const actions = document.createElement('div'); actions.className = 'action-confirmation__actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button secondary'; cancel.textContent = student ? 'Bumalik' : 'Cancel';
    const accept = document.createElement('button'); accept.type = 'button'; accept.className = `button ${danger ? 'danger' : 'primary'}`; accept.textContent = confirm;
    let settled = false;
    const finish = choice => {
      if (settled) return;
      settled = true; active = false;
      dialog.close(); dialog.remove();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      resolve(choice);
    };
    cancel.onclick = () => finish(false); accept.onclick = () => finish(true);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.addEventListener('close', () => finish(false));
    actions.append(cancel, accept); content.append(icon, heading, description, actions); dialog.append(content);
    document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}

// Re-dispatch the real submit event so existing validation and business handlers keep
// their synchronous currentTarget/submitter semantics. Never call form.submit().
document.addEventListener('submit', async event => {
  const form = event.target;
  const policy = policies[form.id];
  if (!policy || form.hasAttribute('data-confirm-manually') || approved.has(form)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (active || !form.reportValidity()) return;
  const button = event.submitter;
  if (button?.disabled) return;
  const before = snapshot(form);
  const [title, message, confirm] = policy;
  if (!await confirmAction({ title, message, confirm, student: location.pathname.includes('/student/') })) return;
  if (!form.isConnected || snapshot(form) !== before || button?.disabled) return;
  approved.add(form);
  try { form.requestSubmit(button || undefined); }
  finally { approved.delete(form); }
}, true);
