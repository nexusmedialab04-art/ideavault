'use strict';

// ====== CONFIG: replace with your own values ======
const CONFIG = {
  FREE_LIMIT: 50,
  STORE_ID: 512524,      // Lemon Squeezy store ID (0 = skip check, set it before publishing)
  PRODUCT_ID: 1503410,    // Lemon Squeezy product ID (0 = skip check, set it before publishing)
  BUY_URL: 'https://nexusmedialab04.lemonsqueezy.com/checkout/buy/62e42b40-19e5-44fe-a85a-856e240b79c1',
  DONATE_URL: 'https://ko-fi.com/nexusmedialab04',
  API_BASE: 'https://api.lemonsqueezy.com/v1/licenses',
  REVALIDATE_MS: 24 * 60 * 60 * 1000,
  TIMEOUT_MS: 10000,
  EXPORT_PRO_ONLY: false, // set to false to let Free users export too
};

const DEFAULT_CATEGORIES = ['General', 'Ideas'];
const MAX_NOTE_LENGTH = 5000;
const MAX_CATEGORY_LENGTH = 30;
const MAX_CUSTOM_CATEGORIES = 100;

const $ = (id) => document.getElementById(id);
const state = { notes: [], customCategories: [], license: null, query: '', filter: '' };

class UserError extends Error {}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  $('donateBtn').href = CONFIG.DONATE_URL;    
  $('buyBtn').href = CONFIG.BUY_URL;
  $('privacyBtn').addEventListener('click', () => $('privacyDialog').showModal());
  $('activateBtn').addEventListener('click', activateLicense);
  $('deactivateBtn').addEventListener('click', deactivateLicense);
  $('licenseInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') activateLicense();
  });

  $('searchInput').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderList();
  });
  $('filterSelect').addEventListener('change', (e) => {
    state.filter = e.target.value;
    renderList();
  });

  $('newNoteBtn').addEventListener('click', toggleNoteForm);
  $('newNoteCancel').addEventListener('click', closeNoteForm);
  $('newNoteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveManualNote();
  });

  $('newCatBtn').addEventListener('click', toggleCategoryForm);
  $('newCatCancel').addEventListener('click', closeCategoryForm);
  $('newCatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addCategory();
  });

  $('exportBtn').addEventListener('click', exportNotes);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.notes || changes.license || changes.categories)) load();
  });

  await load();
  revalidate();
});

async function load() {
  const { notes = [], license = null, categories = [] } = await chrome.storage.local.get([
    'notes',
    'license',
    'categories',
  ]);
  state.notes = Array.isArray(notes) ? notes : [];
  state.customCategories = Array.isArray(categories)
    ? categories.filter((c) => typeof c === 'string' && c.trim())
    : [];
  state.license = license;
  render();
}

const isPro = () => !!state.license && state.license.activated === true;

// Notes saved by the context menu (background.js) have no category.
const noteCategory = (n) =>
  typeof n.category === 'string' && n.category ? n.category : 'General';

const allCategories = () =>
  isPro() ? [...DEFAULT_CATEGORIES, ...state.customCategories] : [...DEFAULT_CATEGORIES];

// ---------- Rendering (textContent only, never innerHTML) ----------
function render() {
  const pro = isPro();
  const count = state.notes.length;

  const plan = $('plan');
  plan.textContent = pro ? 'Pro' : 'Free';
  plan.classList.toggle('pro', pro);

  const fill = $('barFill');
  if (pro) {
    $('counter').textContent = `${count} notes · unlimited`;
    fill.style.width = '100%';
    fill.classList.remove('full');
  } else {
    $('counter').textContent = `${count} / ${CONFIG.FREE_LIMIT} notes`;
    fill.style.width = `${Math.min(100, (count / CONFIG.FREE_LIMIT) * 100)}%`;
    fill.classList.toggle('full', count >= CONFIG.FREE_LIMIT);
  }

  $('proBox').hidden = pro;
  $('proActive').hidden = !pro;

  renderToolbar(pro);
  renderList();
}

function makeOption(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

function fillCategorySelect(select, selected, keepUnknown) {
  const cats = allCategories();
  const list = keepUnknown && selected && !cats.includes(selected) ? [...cats, selected] : cats;
  select.replaceChildren(...list.map((c) => makeOption(c, c)));
  select.value = list.includes(selected) ? selected : 'General';
}

function renderToolbar(pro) {
  const catBtn = $('newCatBtn');
  catBtn.disabled = !pro;
  catBtn.textContent = pro ? '+ Category' : '🔒 Category';
  catBtn.title = pro ? 'Create a custom category' : 'Custom categories are a Pro feature';
  if (!pro) closeCategoryForm();

  const exportLocked = CONFIG.EXPORT_PRO_ONLY && !pro;
  const exportBtn = $('exportBtn');
  exportBtn.disabled = exportLocked || state.notes.length === 0;
  exportBtn.textContent = exportLocked ? '🔒 Export' : '⬇ Export';
  exportBtn.title = exportLocked ? 'Export is a Pro feature' : 'Download all notes as JSON';

  const filter = $('filterSelect');
  filter.hidden = !pro;
  if (pro) {
    const cats = allCategories();
    if (state.filter && !cats.includes(state.filter)) state.filter = '';
    filter.replaceChildren(makeOption('', 'All categories'), ...cats.map((c) => makeOption(c, c)));
    filter.value = state.filter;
  } else {
    state.filter = '';
  }

  fillCategorySelect($('newNoteCategory'), $('newNoteCategory').value || 'General', false);
}

function renderList() {
  const pro = isPro();
  const q = state.query.trim().toLowerCase();

  const visible = state.notes.filter((n) => {
    if (pro && state.filter && noteCategory(n) !== state.filter) return false;
    if (!q) return true;
    return (
      String(n.text ?? '').toLowerCase().includes(q) ||
      String(n.url ?? '').toLowerCase().includes(q)
    );
  });

  $('notes').replaceChildren(...visible.map(buildNote));
  $('empty').hidden = state.notes.length > 0;
  $('noResults').hidden = !(state.notes.length > 0 && visible.length === 0);
}

function buildNote(note) {
  const li = document.createElement('li');
  li.className = 'note';

  const p = document.createElement('p');
  p.className = 'note-text';
  p.textContent = String(note.text ?? '');

  const meta = document.createElement('div');
  meta.className = 'note-meta';

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Note category');
  fillCategorySelect(select, noteCategory(note), true);
  select.addEventListener('change', () => setNoteCategory(note.id, select.value));

  const date = document.createElement('span');
  date.textContent = new Date(Number(note.createdAt) || Date.now()).toLocaleDateString();

  const del = document.createElement('button');
  del.className = 'del';
  del.type = 'button';
  del.textContent = '✕';
  del.title = 'Delete note';
  del.setAttribute('aria-label', 'Delete note');
  del.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'DELETE_NOTE', id: note.id });
  });

  meta.append(select, date, del);

  const sourceRow = document.createElement('div');
  sourceRow.className = 'note-source';
  const safe = safeUrl(note.url);
  if (safe) {
    const a = document.createElement('a');
    a.href = safe.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = safe.hostname;
    a.title = safe.href;
    sourceRow.append(a);
  } else {
    const s = document.createElement('span');
    s.textContent = note.url ? 'Unknown source' : 'Manual note';
    sourceRow.append(s);
  }

  li.append(p, meta, sourceRow);
  return li;
}

function safeUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

let msgTimer = null;
function showMessage(text, type = '', persist = false) {
  const el = $('msg');
  el.textContent = text;
  el.className = type;
  clearTimeout(msgTimer);
  if (!persist && text) msgTimer = setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

// ---------- Manual notes ----------
function toggleNoteForm() {
  const form = $('newNoteForm');
  if (!form.hidden) return closeNoteForm();

  if (!isPro() && state.notes.length >= CONFIG.FREE_LIMIT) {
    showMessage(`Free plan limit reached (${CONFIG.FREE_LIMIT} notes). Delete some or unlock Pro.`, 'error');
    return;
  }
  closeCategoryForm();
  form.hidden = false;
  $('newNoteText').focus();
}

function closeNoteForm() {
  $('newNoteForm').hidden = true;
  $('newNoteText').value = '';
}

async function saveManualNote() {
  const text = $('newNoteText').value.trim().slice(0, MAX_NOTE_LENGTH);
  if (!text) {
    showMessage('Write something first.', 'error');
    return;
  }

  // Read fresh from storage so we never act on stale state.
  const { notes = [], license = null, categories = [] } = await chrome.storage.local.get([
    'notes',
    'license',
    'categories',
  ]);
  const pro = !!license && license.activated === true;

  if (!pro && notes.length >= CONFIG.FREE_LIMIT) {
    showMessage(`Free plan limit reached (${CONFIG.FREE_LIMIT} notes). Unlock Pro for unlimited notes.`, 'error');
    return;
  }

  const allowed = pro ? [...DEFAULT_CATEGORIES, ...categories] : DEFAULT_CATEGORIES;
  const chosen = $('newNoteCategory').value;
  const category = allowed.includes(chosen) ? chosen : 'General';

  notes.unshift({
    id: crypto.randomUUID(),
    text,
    url: '',
    title: '',
    category,
    createdAt: Date.now(),
  });

  await chrome.storage.local.set({ notes });
  closeNoteForm();
  showMessage('Note saved.', 'ok');
}

// ---------- Categories ----------
async function setNoteCategory(id, category) {
  const { notes = [], license = null, categories = [] } = await chrome.storage.local.get([
    'notes',
    'license',
    'categories',
  ]);
  const pro = !!license && license.activated === true;
  const note = notes.find((n) => n.id === id);
  if (!note) return;

  const allowed = pro ? [...DEFAULT_CATEGORIES, ...categories] : DEFAULT_CATEGORIES;
  if (!allowed.includes(category) && category !== note.category) return;

  note.category = category;
  await chrome.storage.local.set({ notes });
}

function toggleCategoryForm() {
  const form = $('newCatForm');
  if (!form.hidden) return closeCategoryForm();
  if (!isPro()) return;
  closeNoteForm();
  form.hidden = false;
  $('newCatInput').focus();
}

function closeCategoryForm() {
  $('newCatForm').hidden = true;
  $('newCatInput').value = '';
}

async function addCategory() {
  const name = $('newCatInput').value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > MAX_CATEGORY_LENGTH) {
    showMessage(`Category name must be 1–${MAX_CATEGORY_LENGTH} characters.`, 'error');
    return;
  }

  const { license = null, categories = [] } = await chrome.storage.local.get(['license', 'categories']);
  if (!(license && license.activated === true)) {
    showMessage('Custom categories are a Pro feature.', 'error');
    return;
  }

  const existing = [...DEFAULT_CATEGORIES, ...categories].map((c) => c.toLowerCase());
  if (existing.includes(name.toLowerCase())) {
    showMessage('That category already exists.', 'error');
    return;
  }
  if (categories.length >= MAX_CUSTOM_CATEGORIES) {
    showMessage('Category limit reached.', 'error');
    return;
  }

  await chrome.storage.local.set({ categories: [...categories, name] });
  closeCategoryForm();
  showMessage(`Category "${name}" created.`, 'ok');
}

// ---------- Export ----------
function exportNotes() {
  if (CONFIG.EXPORT_PRO_ONLY && !isPro()) return;
  if (state.notes.length === 0) return;

  const payload = {
    app: 'IdeaVault',
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: [...DEFAULT_CATEGORIES, ...state.customCategories],
    notes: state.notes.map((n) => ({ ...n, category: noteCategory(n) })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ideavault-backup.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage('Backup downloaded.', 'ok');
}

// ---------- Lemon Squeezy License API (direct HTTPS, no backend) ----------
async function lsPost(endpoint, params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_MS);
  try {
    const res = await fetch(`${CONFIG.API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
      credentials: 'omit',
      signal: ctrl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Rejects valid keys that belong to a different product or store.
function belongsToThisProduct(meta) {
  if (CONFIG.STORE_ID && Number(meta && meta.store_id) !== CONFIG.STORE_ID) return false;
  if (CONFIG.PRODUCT_ID && Number(meta && meta.product_id) !== CONFIG.PRODUCT_ID) return false;
  return true;
}

async function activateLicense() {
  const key = $('licenseInput').value.trim();
  if (key.length < 8 || key.length > 100) {
    showMessage('Please enter a valid license key.', 'error');
    return;
  }

  const btn = $('activateBtn');
  btn.disabled = true;
  showMessage('Checking license…', '', true);

  try {
    const data = await lsPost('activate', {
      license_key: key,
      instance_name: `IdeaVault-${crypto.randomUUID().slice(0, 8)}`,
    });

    if (!data.activated || !data.instance) {
      throw new UserError(data.error || 'This license key is not valid.');
    }

    if (!belongsToThisProduct(data.meta)) {
      // Release the activation slot we just consumed.
      lsPost('deactivate', { license_key: key, instance_id: data.instance.id }).catch(() => {});
      throw new UserError('This key does not belong to IdeaVault.');
    }

    await chrome.storage.local.set({
      license: {
        key,
        instanceId: data.instance.id,
        activated: true,
        lastChecked: Date.now(),
      },
    });
    $('licenseInput').value = '';
    showMessage('Pro unlocked. Thank you! 🎉', 'ok');
  } catch (err) {
    showMessage(
      err instanceof UserError
        ? err.message
        : 'Could not reach the license server. Check your connection.',
      'error'
    );
  } finally {
    btn.disabled = false;
  }
}

async function deactivateLicense() {
  const lic = state.license;
  if (!lic) return;
  if (!confirm('Deactivate Pro on this device? You can reuse the key elsewhere.')) return;

  try {
    await lsPost('deactivate', { license_key: lic.key, instance_id: lic.instanceId });
    await chrome.storage.local.remove('license');
    showMessage('License deactivated on this device.', 'ok');
  } catch {
    showMessage('Could not reach the license server. Try again later.', 'error');
  }
}

// Re-checks the license at most once per day. Offline errors keep Pro active.
async function revalidate() {
  const lic = state.license;
  if (!lic || !lic.activated) return;
  if (Date.now() - (lic.lastChecked || 0) < CONFIG.REVALIDATE_MS) return;

  try {
    const data = await lsPost('validate', {
      license_key: lic.key,
      instance_id: lic.instanceId,
    });

    if (data.valid === false || (data.valid === true && !belongsToThisProduct(data.meta))) {
      await chrome.storage.local.remove('license');
      showMessage('Your Pro license is no longer valid.', 'error');
    } else if (data.valid === true) {
      await chrome.storage.local.set({ license: { ...lic, lastChecked: Date.now() } });
    }
  } catch {
    // Offline or timeout: keep the current state.
  }
}