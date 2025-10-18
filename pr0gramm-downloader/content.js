// content.js
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// ----- Chrome-API Verfügbarkeit sicherstellen -----
function chromeReady() {
  return !!(typeof chrome !== 'undefined'
    && chrome.runtime && chrome.runtime.id
    && chrome.storage && chrome.storage.local);
}
function waitChromeReady(timeoutMs = 5000) {
  const start = Date.now();
  return new Promise(resolve => {
    (function tick() {
      if (chromeReady()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    })();
  });
}

// ----- Media / Seite -----
function getMediaUrl() {
  const v = qs('video');
  const vSrc = v ? (v.currentSrc || qs('source', v)?.src || v.src) : null;
  const img = vSrc ? null : qs('img');
  let url = vSrc || img?.src || null;
  if (!url) return null;
  if (url.startsWith('//')) url = 'https:' + url;
  return url;
}
function getPageId() {
  const parts = location.pathname.split('/').filter(Boolean);
  return parts.pop() || 'item';
}
function getExtension(url) {
  const m = url.match(/(\.[a-z0-9]+)(?:\?|$)/i);
  return m ? m[1] : '';
}

async function copyMarkdownLink(url) {
  const md = `[source](${url})`;
  try { await navigator.clipboard.writeText(md); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = md; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
  }
}

// ----- Alte horizontale Button-Animation -----
function animateButtonFlash(btn, color = '#f39c12') {
  const bar = document.createElement('div');
  bar.style.position = 'absolute';
  bar.style.top = 0;
  bar.style.left = '-100%';
  bar.style.width = '100%';
  bar.style.height = '100%';
  bar.style.background = color;
  bar.style.opacity = '0.25';
  bar.style.transition = 'left 0.35s ease-out';
  bar.style.pointerEvents = 'none';
  bar.style.zIndex = '1';
  if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
  btn.appendChild(bar);
  requestAnimationFrame(() => { bar.style.left = '100%'; });
  setTimeout(() => bar.remove(), 450);
}

// ----- Normalisierung / Tags -----
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function getPostTagsRaw() {
  const anchors = qsa('.item-tags .tags .tag .tag-link');
  if (anchors.length) return anchors.map(a => a.textContent.trim()).filter(Boolean);
  const fallback = qsa('.tags a.tag, .tags .tag a');
  return fallback.map(a => a.textContent.trim()).filter(Boolean);
}

// ----- Storage-Helper im Content-Script -----
async function storageGet(area, key) {
  if (!chromeReady()) return {};
  const api = chrome.storage[area];
  try {
    const p = api.get(key);
    if (p && typeof p.then === 'function') return await p;
  } catch {}
  return new Promise(resolve => api.get(key, resolve));
}

async function getWarnKeywords() {
  if (!await waitChromeReady()) return [];
  // sync bevorzugt
  try {
    const syncData = await storageGet('sync', 'warn_keywords_v1');
    if (syncData && Array.isArray(syncData.warn_keywords_v1)) return syncData.warn_keywords_v1;
  } catch {}
  const localData = await storageGet('local', 'warn_keywords_v1');
  return (localData && Array.isArray(localData.warn_keywords_v1)) ? localData.warn_keywords_v1 : [];
}

// ----- Warnbalken -----
let __topBarTimer = null;
function showTopAlert(matches) {
  if (!matches || !matches.length) return;
  const id = 'pr0-warn-topbar';
  let bar = qs('#' + id);
  const text = matches.join(', ');

  if (!bar) {
    bar = document.createElement('div');
    bar.id = id;
    bar.style.position = 'fixed';
    bar.style.left = '0';
    bar.style.top = '20vh';
    bar.style.width = '100vw';
    bar.style.height = '2cm';
    bar.style.background = '#c0392b';
    bar.style.color = '#fff';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.justifyContent = 'center';
    bar.style.padding = '0 16px';
    bar.style.fontSize = '14px';
    bar.style.fontWeight = '700';
    bar.style.letterSpacing = '0.2px';
    bar.style.textAlign = 'center';
    bar.style.zIndex = '99999';
    bar.style.boxShadow = '0 8px 28px rgba(0,0,0,0.45)';
    bar.style.opacity = '0';
    bar.style.transition = 'opacity 140ms ease-in';
    bar.style.pointerEvents = 'none';
    document.body.appendChild(bar);
    requestAnimationFrame(() => { bar.style.opacity = '1'; });
  }
  bar.textContent = text;

  if (__topBarTimer) clearTimeout(__topBarTimer);
  __topBarTimer = setTimeout(() => {
    const el = qs('#' + id);
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 180);
    __topBarTimer = null;
  }, 5000);
}

// ----- Keyword-Prüfung -----
async function checkAndAlertForTags() {
  const rawTags = getPostTagsRaw();
  if (!rawTags.length) return;
  const normTags = rawTags.map(norm);
  const kwList = await getWarnKeywords();
  if (!kwList.length) return;

  const hits = [];
  kwList.forEach(k => {
    const nk = norm(k);
    if (!nk) return;
    for (let i = 0; i < normTags.length; i++) {
      if (normTags[i].includes(nk)) { hits.push(k); break; }
    }
  });
  if (hits.length) showTopAlert(Array.from(new Set(hits)));
}

// ----- Native Elemente entfernen -----
function removeNativeShareAndDownload() {
  const root = qs('.item-details');
  if (!root) return;
  qsa('.item-details .action.copy-link', root).forEach(node => {
    const wrap = node.closest('span') || node; if (wrap && wrap.parentElement) wrap.parentElement.removeChild(wrap);
  });
  qsa('.item-details a.action[download]', root).forEach(a => {
    const wrap = a.closest('span') || a; if (wrap && wrap.parentElement) wrap.parentElement.removeChild(wrap);
  });
}

// ----- Sicheres Messaging -----
function safeSendMessage(msg, cb) {
  if (!chromeReady()) {
    console.warn('Extension runtime not ready');
    cb && cb({ ok: false, error: 'no_runtime' });
    return;
  }
  try {
    chrome.runtime.sendMessage(msg, cb);
  } catch (e) {
    console.warn('sendMessage failed', e);
    cb && cb({ ok: false, error: String(e) });
  }
}

// ----- Buttons -----
function ensureButtons() {
  const container = qs('.item-details');
  if (!container) return;
  removeNativeShareAndDownload();

  if (!qs('#pr0-download-btn')) {
    const dlBtn = document.createElement('button');
    dlBtn.id = 'pr0-download-btn';
    dlBtn.textContent = 'Download';
    dlBtn.style.cssText = 'padding:4px 8px;font-size:9px;cursor:pointer;margin-left:10px;border:2px solid #d23c22;background:transparent;color:white;border-radius:0;overflow:hidden;';
    dlBtn.addEventListener('click', async () => {
      const mediaUrl = getMediaUrl();
      if (!mediaUrl) { animateButtonFlash(dlBtn, '#c0392b'); return; }
      const id = getPageId();
      const ext = getExtension(mediaUrl);
      await waitChromeReady();
      safeSendMessage({ action: 'downloadMedia', url: mediaUrl, id, ext }, async (res) => {
        animateButtonFlash(dlBtn, (res && res.ok) ? '#f39c12' : '#c0392b');
        await checkAndAlertForTags();
      });
    });
    container.appendChild(dlBtn);
  }

  if (!qs('#pr0-hyperlink-btn')) {
    const linkBtn = document.createElement('button');
    linkBtn.id = 'pr0-hyperlink-btn';
    linkBtn.textContent = 'Hyperlink';
    linkBtn.style.cssText = 'padding:4px 8px;font-size:9px;cursor:pointer;margin-left:6px;border:2px solid #d23c22;background:transparent;color:white;border-radius:0;overflow:hidden;';
    linkBtn.addEventListener('click', async () => {
      const mediaUrl = getMediaUrl();
      if (!mediaUrl) { animateButtonFlash(linkBtn, '#c0392b'); return; }
      await copyMarkdownLink(mediaUrl);
      await waitChromeReady();
      safeSendMessage({ action: 'logShare', url: mediaUrl }, () => {});
      animateButtonFlash(linkBtn, '#f39c12');
      await checkAndAlertForTags();
    });
    container.appendChild(linkBtn);
  }
}

// ----- Bootstrap -----
(async function init() {
  // Erst versuchen, bis Chrome-APIs bereit sind. UI kann vorher schon gerendert sein.
  await waitChromeReady();
  const mo = new MutationObserver(() => { ensureButtons(); });
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  ensureButtons();
})();
