'use strict';

const MENU_ID = 'ideavault-save';
const FREE_LIMIT = 50;
const MAX_NOTE_LENGTH = 5000;

// Serializes all writes so rapid clicks never overwrite each other.
let queue = Promise.resolve();
const enqueue = (task) => {
  queue = queue.then(task).catch((err) => console.error('[IdeaVault]', err));
  return queue;
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Save to IdeaVault',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  // Must be called synchronously inside the user gesture.
  if (tab && tab.id !== undefined) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }

  const text = (info.selectionText || '').trim().slice(0, MAX_NOTE_LENGTH);
  if (!text) return;

  enqueue(() => saveNote(text, tab));
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg && msg.type === 'DELETE_NOTE' && typeof msg.id === 'string') {
    enqueue(() => deleteNote(msg.id));
  }
});

async function saveNote(text, tab) {
  const { notes = [], license = null } = await chrome.storage.local.get([
    'notes',
    'license',
  ]);
  const isPro = license && license.activated === true;

  if (!isPro && notes.length >= FREE_LIMIT) {
    flashBadge('MAX', '#d93025');
    return;
  }

  notes.unshift({
    id: crypto.randomUUID(),
    text,
    url: (tab && tab.url) || '',
    title: ((tab && tab.title) || '').slice(0, 200),
    createdAt: Date.now(),
  });

  await chrome.storage.local.set({ notes });
  flashBadge('✓', '#188038');
}

async function deleteNote(id) {
  const { notes = [] } = await chrome.storage.local.get('notes');
  await chrome.storage.local.set({ notes: notes.filter((n) => n.id !== id) });
}

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}