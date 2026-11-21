import { auth } from './firebase.js';
import { state } from './state.js';
import { usernameRequest } from './username-auth.js';

export function bindUsernameSettings(form) {
  const status = form.querySelector('[role="status"]');
  const submit = form.querySelector('[type="submit"]');
  form.addEventListener('input', () => { if (!submit.disabled) status.textContent = ''; });
  if (!auth.currentUser?.providerData.some(provider => provider.providerId === 'password')) {
    status.textContent = 'Your account needs a password before you can use username sign-in. Use Forgot password from the sign-in page to set one, then sign in again.';
    submit.disabled = true;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const username = form.elements.username.value.trim().toLowerCase();
    const password = form.elements.currentPassword.value;
    status.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Saving…';
    form.setAttribute('aria-busy', 'true');
    try {
      const result = await usernameRequest('save', { username, password }, auth.currentUser);
      state.profile = { ...state.profile, username: result.username };
      form.elements.username.value = result.username;
      status.textContent = `Username saved. You can now sign in as ${result.username}.`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      const input = form.elements.currentPassword;
      input.value = '';
      input.type = 'password';
      const toggle = input.parentElement.querySelector('button');
      toggle?.setAttribute('aria-pressed', 'false');
      toggle?.setAttribute('aria-label', 'Show current password');
      submit.disabled = false;
      submit.textContent = 'Save username';
      form.setAttribute('aria-busy', 'false');
    }
  });
}
