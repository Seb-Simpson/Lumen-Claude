// Sign in, sign up and profile editing.

import { h, mount } from '../utils.js';
import { auth, AVATAR_COLORS, MIN_PASSWORD } from '../auth.js';
import { toast, avatar, pageTitle, emptyState } from '../components/ui.js';
import { navigate } from '../router.js';

function field({ id, label, type = 'text', autocomplete, hint, ...rest }) {
  const err = h('p', { class: 'field-error', id: `${id}-err` });
  const input = h('input', { id, name: id, type, autocomplete, aria: { describedby: `${id}-err${hint ? ` ${id}-hint` : ''}` }, ...rest });
  return {
    el: h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('p', { class: 'muted small', id: `${id}-hint` }, hint) : null, err),
    input,
    setError(msg) { err.textContent = msg || ''; input.setAttribute('aria-invalid', msg ? 'true' : 'false'); },
  };
}

/** Only allow internal redirects like "/upload". */
const safeNext = (next) => (next && /^\/[a-z0-9/_-]*$/i.test(next) ? next : '/');

const demoNotice = () => h('p', { class: 'notice' }, 'Demo only: accounts are stored in this browser. Passwords are salted and hashed, but please don\'t reuse a real password.');

export function renderLogin(ctx) {
  ctx.setMeta('Sign in', 'Sign in to Lumen.');
  if (auth.currentUser()) { navigate(safeNext(ctx.query.get('next')), { replace: true }); return; }
  const user = field({ id: 'login-user', label: 'Username', autocomplete: 'username', required: true, autocapitalize: 'none', spellcheck: false });
  const pass = field({ id: 'login-pass', label: 'Password', type: 'password', autocomplete: 'current-password', required: true });
  const formErr = h('p', { class: 'field-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'auth-form', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    formErr.textContent = '';
    submit.disabled = true;
    try {
      const u = await auth.logIn(user.input.value, pass.input.value);
      toast(`Welcome back, ${u.displayName}!`, { type: 'success' });
      navigate(safeNext(ctx.query.get('next')));
    } catch (err) {
      formErr.textContent = err.message;
      pass.input.value = '';
      pass.input.focus();
    } finally { submit.disabled = false; }
  } }, user.el, pass.el, formErr, submit);
  const next = ctx.query.get('next');
  mount(ctx.outlet, h('div', { class: 'page auth-page' }, h('div', { class: 'auth-card' },
    pageTitle('Sign in'), h('p', { class: 'muted' }, 'to continue to Lumen'), form,
    h('p', {}, 'New to Lumen? ', h('a', { href: `#/signup${next ? `?next=${encodeURIComponent(next)}` : ''}` }, 'Create an account')),
    demoNotice())));
}

export function renderSignup(ctx) {
  ctx.setMeta('Create account', 'Create a Lumen account.');
  if (auth.currentUser()) { navigate('/', { replace: true }); return; }
  const display = field({ id: 'su-name', label: 'Display name', autocomplete: 'nickname', maxlength: 40, required: true });
  const user = field({ id: 'su-user', label: 'Username', autocomplete: 'username', hint: '3–20 lowercase letters, numbers or underscores.', required: true, autocapitalize: 'none', spellcheck: false });
  const pass = field({ id: 'su-pass', label: 'Password', type: 'password', autocomplete: 'new-password', hint: `At least ${MIN_PASSWORD} characters.`, required: true });
  const confirm = field({ id: 'su-confirm', label: 'Confirm password', type: 'password', autocomplete: 'new-password', required: true });
  const formErr = h('p', { class: 'field-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Create account');
  const map = { displayName: display, username: user, password: pass, confirm };
  const form = h('form', { class: 'auth-form', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    Object.values(map).forEach((f) => f.setError(''));
    formErr.textContent = '';
    submit.disabled = true;
    try {
      const u = await auth.signUp({ displayName: display.input.value, username: user.input.value, password: pass.input.value, confirm: confirm.input.value });
      toast(`Welcome to Lumen, ${u.displayName}!`, { type: 'success' });
      navigate(safeNext(ctx.query.get('next')));
    } catch (err) {
      formErr.textContent = err.message;
      if (err.fields) {
        Object.entries(err.fields).forEach(([k, msg]) => map[k]?.setError(msg));
        map[Object.keys(err.fields)[0]]?.input.focus();
      }
    } finally { submit.disabled = false; }
  } }, display.el, user.el, pass.el, confirm.el, formErr, submit);
  mount(ctx.outlet, h('div', { class: 'page auth-page' }, h('div', { class: 'auth-card' },
    pageTitle('Create your account'), form,
    h('p', {}, 'Already have an account? ', h('a', { href: '#/login' }, 'Sign in')),
    demoNotice())));
}

export function renderProfile(ctx) {
  ctx.setMeta('Edit profile', 'Edit your Lumen profile.');
  const me = auth.currentUser();
  if (!me) {
    mount(ctx.outlet, h('div', { class: 'page' }, emptyState({ iconName: 'user', title: 'Sign in to edit your profile', level: 1, action: h('a', { class: 'btn btn-primary', href: '#/login?next=/profile' }, 'Sign in') })));
    return;
  }
  let color = me.color;
  const preview = h('div', { class: 'avatar-preview' });
  const name = field({ id: 'pf-name', label: 'Display name', value: me.displayName, maxlength: 40, required: true });
  const initial = field({ id: 'pf-initial', label: 'Avatar initial', value: me.initial, maxlength: 2, hint: 'One letter, number or emoji.' });
  const bio = h('textarea', { id: 'pf-bio', rows: 4, maxlength: 500, value: me.bio });
  const paint = () => mount(preview, avatar({ initial: Array.from(initial.input.value.trim() || '?')[0].toUpperCase(), color, size: 96, label: 'Avatar preview' }));
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', aria: { label: 'Avatar color' } },
    AVATAR_COLORS.map((c) => {
      const b = h('button', { type: 'button', class: 'swatch', role: 'radio', aria: { checked: String(c === color), label: `Color ${c}` } });
      b.style.background = c;
      b.addEventListener('click', () => {
        color = c;
        swatches.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', String(s === b)));
        paint();
      });
      return b;
    }));
  initial.input.addEventListener('input', paint);
  paint();

  const form = h('form', { class: 'stack profile-form', novalidate: true, onSubmit: (e) => {
    e.preventDefault();
    try {
      auth.updateProfile({ displayName: name.input.value, initial: initial.input.value, bio: bio.value, color });
      toast('Profile saved', { type: 'success' });
    } catch (err) { toast(err.message, { type: 'error' }); }
  } },
  h('div', { class: 'profile-top' }, preview, h('div', { class: 'field' }, h('span', { class: 'label' }, 'Avatar color'), swatches)),
  name.el, initial.el,
  h('div', { class: 'field' }, h('label', { for: 'pf-bio' }, 'Bio'), bio),
  h('div', { class: 'form-actions' },
    h('a', { class: 'btn btn-ghost', href: `#/channel/${encodeURIComponent(me.id)}` }, 'View channel'),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save')));
  mount(ctx.outlet, h('div', { class: 'page narrow' }, pageTitle('Edit profile'), h('p', { class: 'muted' }, `Signed in as @${me.username}`), form));
}
