import { h, mount, formatViews, formatDate, formatDuration } from '../utils.js';
import { auth } from '../auth.js';
import { getMyUploads, updateUpload, removeUpload } from '../videos.js';
import { CATEGORIES } from '../data/seed.js';
import { toast, emptyState, openModal, confirmDialog, pageTitle, skeletonList } from '../components/ui.js';
import { icon } from '../components/icons.js';

function editDialog(video, onSaved) {
  const title = h('input', { id: 'ed-title', type: 'text', maxlength: 100, required: true, value: video.title });
  const desc = h('textarea', { id: 'ed-desc', rows: 4, maxlength: 5000, value: video.description || '' });
  const cat = h('select', { id: 'ed-cat', value: video.category }, CATEGORIES.map((c) => h('option', { value: c }, c)));
  const vis = h('select', { id: 'ed-vis', value: video.visibility }, [['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']].map(([v, l]) => h('option', { value: v }, l)));
  const form = h('form', { id: 'edit-form', class: 'stack', onSubmit: async (e) => {
    e.preventDefault();
    if (!title.value.trim()) { toast('Title is required.', { type: 'error' }); title.focus(); return; }
    try {
      await updateUpload(video.id, { title: title.value.trim(), description: desc.value.trim(), category: cat.value, visibility: vis.value });
      toast('Changes saved', { type: 'success' });
      m.close();
      onSaved();
    } catch (err) { toast(err.message, { type: 'error' }); }
  } },
  h('div', { class: 'field' }, h('label', { for: 'ed-title' }, 'Title'), title),
  h('div', { class: 'field' }, h('label', { for: 'ed-desc' }, 'Description'), desc),
  h('div', { class: 'field-grid' },
    h('div', { class: 'field' }, h('label', { for: 'ed-cat' }, 'Category'), cat),
    h('div', { class: 'field' }, h('label', { for: 'ed-vis' }, 'Visibility'), vis)));
  const m = openModal({
    title: 'Edit video details', body: form,
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => m.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'submit', form: 'edit-form' }, 'Save'),
    ],
  });
  title.focus();
}

export async function render(ctx) {
  ctx.setMeta('Lumen Studio', 'Manage your uploaded videos.');
  const me = auth.currentUser();
  if (!me) {
    mount(ctx.outlet, h('div', { class: 'page' }, emptyState({ iconName: 'studio', title: 'Sign in to use Studio', level: 1, text: 'Studio is where you manage the videos you upload.', action: h('a', { class: 'btn btn-primary', href: '#/login?next=/studio' }, 'Sign in') })));
    return;
  }
  const body = h('div', {}, skeletonList(3));
  mount(ctx.outlet, h('div', { class: 'page' },
    pageTitle('Channel content', h('a', { class: 'btn btn-primary', href: '#/upload' }, icon('upload', { size: 20 }), h('span', {}, 'Upload'))),
    body));

  const load = async () => {
    const vids = await getMyUploads();
    if (!ctx.isActive()) return;
    if (!vids.length) {
      mount(body, emptyState({ iconName: 'video', title: 'No uploads yet', text: 'Videos you upload will appear here. They\'re stored in this browser using IndexedDB.', action: h('a', { class: 'btn btn-primary', href: '#/upload' }, 'Upload video') }));
      return;
    }
    const totalViews = vids.reduce((n, v) => n + v.views, 0);
    mount(body,
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-num' }, String(vids.length)), h('span', { class: 'muted' }, 'Videos')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-num' }, totalViews.toLocaleString()), h('span', { class: 'muted' }, 'Views (this browser)'))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'studio-table' },
        h('caption', { class: 'visually-hidden' }, 'Your videos'),
        h('thead', {}, h('tr', {}, ['Video', 'Visibility', 'Date', 'Views', 'Actions'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, vids.map((v) => h('tr', {},
          h('td', {}, h('div', { class: 'studio-video' },
            h('a', { href: `#/watch/${encodeURIComponent(v.id)}`, tabindex: '-1', aria: { hidden: 'true' }, class: 'studio-thumb' },
              h('img', { src: v.thumb, alt: '', loading: 'lazy', width: 120, height: 68 }),
              v.duration ? h('span', { class: 'badge' }, formatDuration(v.duration)) : null),
            h('div', {}, h('a', { href: `#/watch/${encodeURIComponent(v.id)}`, class: 'strong' }, v.title), h('p', { class: 'muted small clamp-1' }, v.description || 'No description')))),
          h('td', {}, h('span', { class: `pill pill-${v.visibility}` }, v.visibility)),
          h('td', {}, formatDate(v.createdAt)),
          h('td', {}, formatViews(v.views)),
          h('td', {}, h('div', { class: 'row-actions' },
            h('button', { class: 'icon-btn', type: 'button', aria: { label: `Edit ${v.title}` }, title: 'Edit', onClick: () => editDialog(v, load) }, icon('edit')),
            h('button', { class: 'icon-btn danger', type: 'button', aria: { label: `Delete ${v.title}` }, title: 'Delete', onClick: async () => {
              if (!(await confirmDialog({ title: 'Delete video?', message: `“${v.title}” will be permanently deleted from this browser.`, confirmLabel: 'Delete', danger: true }))) return;
              try { await removeUpload(v.id); toast('Video deleted'); load(); } catch (err) { toast(err.message, { type: 'error' }); }
            } }, icon('trash'))))))))));
  };
  await load();
}
