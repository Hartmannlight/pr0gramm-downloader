// background.js (MV3 service worker)

function storage(area) {
  const api = chrome.storage[area];
  return {
    async get(keys) {
      try {
        const p = api.get(keys);
        if (p && typeof p.then === 'function') return await p;
      } catch {}
      return new Promise(resolve => api.get(keys, resolve));
    },
    async set(items) {
      try {
        const p = api.set(items);
        if (p && typeof p.then === 'function') return await p;
      } catch {}
      return new Promise(resolve => api.set(items, resolve));
    }
  };
}

const S_LOCAL = storage('local');
const S_SYNC = storage('sync');

const DEFAULT_KEYWORDS = [
  'achtung laut',
  'ki-generiert',
  'ki-degeneriert',
  'für weniger ai',
  'fake news',
  'kausalität',
  'glaubt alles',
  'incel',
  'stumpfer rassismus'
];

const SETTINGS_KEY = 'settings_v1';
const KW_KEY = 'warn_keywords_v1';
const SHARED_KEY = 'shared_v1';

// ----- defaults / migration -----
async function defaultsByOS() {
  return new Promise(res => {
    chrome.runtime.getPlatformInfo(info => {
      const os = info?.os || 'linux';
      const subdir = os === 'win' ? 'Pr0gramm' : 'pr0gramm';
      res({ subdir, saveAs: false, filenameTemplate: '{id}{ext}' });
    });
  });
}

async function migrate() {
  const meta = (await S_LOCAL.get('meta_v1')).meta_v1 || {};
  let changed = false;

  if (!meta.initialized) {
    const cur = (await S_LOCAL.get(SETTINGS_KEY))[SETTINGS_KEY];
    if (!cur) {
      const def = await defaultsByOS();
      await S_LOCAL.set({ [SETTINGS_KEY]: def });
      changed = true;
    }
    const syncK = (await S_SYNC.get(KW_KEY))[KW_KEY];
    const localK = (await S_LOCAL.get(KW_KEY))[KW_KEY];
    if (!(Array.isArray(syncK) && syncK.length) && !(Array.isArray(localK) && localK.length)) {
      try { await S_SYNC.set({ [KW_KEY]: DEFAULT_KEYWORDS.slice() }); }
      catch { await S_LOCAL.set({ [KW_KEY]: DEFAULT_KEYWORDS.slice() }); }
      changed = true;
    }
    meta.initialized = true;
  }

  if (changed || !meta.version) {
    meta.version = 1;
    await S_LOCAL.set({ meta_v1: meta });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try { await migrate(); } catch {}
});

// ----- optional tab event -----
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const url = tab.url || '';
  if (!/^[a-z]+:\/\/([^/]*\.)?pr0gramm\.com\//i.test(url)) return;
  try {
    chrome.tabs.sendMessage(tabId, { action: 'pageReady' }, () => {
      void chrome.runtime.lastError; // suppress "Receiving end does not exist"
    });
  } catch {}
});

// ----- share history -----
async function loadShared() {
  const got = (await S_LOCAL.get(SHARED_KEY))[SHARED_KEY];
  return got || { byUrl: {}, order: [] };
}
async function saveShared(data) {
  if (data.order.length > 50000) data.order = data.order.slice(-40000);
  await S_LOCAL.set({ [SHARED_KEY]: data });
}
async function logShare(url) {
  const now = Date.now();
  const data = await loadShared();
  const entry = data.byUrl[url];
  if (entry) { entry.last = now; entry.count += 1; }
  else { data.byUrl[url] = { first: now, last: now, count: 1 }; }
  data.order.push(now);
  await saveShared(data);
}

// ----- keywords -----
async function setKeywords(list) {
  if (!Array.isArray(list)) throw new Error('invalid_keywords');
  try { await S_SYNC.set({ [KW_KEY]: list }); return { where: 'sync' }; }
  catch { await S_LOCAL.set({ [KW_KEY]: list }); return { where: 'local' }; }
}
async function getKeywords() {
  try {
    const sync = (await S_SYNC.get(KW_KEY))[KW_KEY];
    if (Array.isArray(sync)) return { list: sync, where: 'sync' };
  } catch {}
  const local = (await S_LOCAL.get(KW_KEY))[KW_KEY];
  return { list: Array.isArray(local) ? local : [], where: 'local' };
}

// ----- settings -----
async function getSettings() {
  const cur = (await S_LOCAL.get(SETTINGS_KEY))[SETTINGS_KEY];
  if (cur) return cur;
  const def = await defaultsByOS();
  await S_LOCAL.set({ [SETTINGS_KEY]: def });
  return def;
}
async function setSettings(next) {
  const cur = await getSettings();
  const merged = Object.assign({}, cur, next || {});
  await S_LOCAL.set({ [SETTINGS_KEY]: merged });
  return merged;
}

// ----- download -----
function buildFilename({ subdir, id, ext, template }) {
  const name = (template || '{id}{ext}').replace('{id}', id).replace('{ext}', ext || '');
  return subdir ? `${subdir}/${name}` : name;
}
async function handleDownload(url, id, ext) {
  const s = await getSettings();
  const filename = buildFilename({ subdir: s.subdir, id, ext, template: s.filenameTemplate });
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, saveAs: !!s.saveAs, conflictAction: 'uniquify' },
      async downloadId => {
        const err = chrome.runtime.lastError;
        if (err) { reject(err); return; }
        try { await logShare(url); } catch {}
        resolve(downloadId);
      }
    );
  });
}

// ----- backup & restore -----
function isPlainObject(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

async function exportData() {
  const localAll = await S_LOCAL.get(null);
  let syncAll = {};
  try { syncAll = await S_SYNC.get(null); } catch { syncAll = {}; }
  return { local: localAll, sync: syncAll };
}
async function importData(payload) {
  if (!isPlainObject(payload)) throw new Error('invalid_payload');
  const { local = {}, sync = {} } = payload;

  if (isPlainObject(local[SHARED_KEY])) await S_LOCAL.set({ [SHARED_KEY]: local[SHARED_KEY] });
  if (isPlainObject(local[SETTINGS_KEY])) await S_LOCAL.set({ [SETTINGS_KEY]: local[SETTINGS_KEY] });

  if (Array.isArray(sync[KW_KEY])) {
    try { await S_SYNC.set({ [KW_KEY]: sync[KW_KEY] }); }
    catch { await S_LOCAL.set({ [KW_KEY]: sync[KW_KEY] }); }
  }
}

// ----- router -----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.action) { sendResponse({ ok: false, error: 'no_action' }); return; }

      if (msg.action === 'downloadMedia' && msg.url && msg.id && msg.ext !== undefined) {
        const did = await handleDownload(msg.url, msg.id, msg.ext);
        sendResponse({ ok: true, id: did });
        return;
      }

      if (msg.action === 'logShare' && msg.url) { await logShare(msg.url); sendResponse({ ok: true }); return; }

      if (msg.action === 'getSharedPage') {
        const size = Math.max(1, Math.min(500, msg.size || 100));
        const page = Math.max(0, msg.page || 0);
        const data = await loadShared();
        const items = Object.entries(data.byUrl)
          .map(([url, v]) => ({ url, first: v.first, last: v.last, count: v.count }))
          .sort((a, b) => b.last - a.last)
          .slice(page * size, (page + 1) * size);
        sendResponse({ ok: true, items, total: Object.keys(data.byUrl).length });
        return;
      }

      if (msg.action === 'getKeywords') { const r = await getKeywords(); sendResponse({ ok: true, list: r.list, where: r.where }); return; }
      if (msg.action === 'setKeywords' && Array.isArray(msg.keywords)) { const r = await setKeywords(msg.keywords); sendResponse({ ok: true, where: r.where }); return; }

      if (msg.action === 'getSettings') { const s = await getSettings(); sendResponse({ ok: true, settings: s }); return; }
      if (msg.action === 'setSettings' && msg.settings) { const s2 = await setSettings(msg.settings); sendResponse({ ok: true, settings: s2 }); return; }

      if (msg.action === 'exportData') { const data = await exportData(); sendResponse({ ok: true, data }); return; }
      if (msg.action === 'importData' && msg.payload) { await importData(msg.payload); sendResponse({ ok: true }); return; }

      sendResponse({ ok: false, error: 'unknown_action' });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});
