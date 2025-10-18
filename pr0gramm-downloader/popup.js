// popup.js
function $(id) { return document.getElementById(id); }

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

function openJsonInNewTab(obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function safeSend(message) {
  try {
    const res = await chrome.runtime.sendMessage(message);
    if (!res || !res.ok) throw new Error(res?.error || 'unknown_error');
    return res;
  } catch (e) {
    throw new Error(e?.message || String(e));
  }
}

// export / import
async function doExport() {
  try {
    const res = await safeSend({ action: 'exportData' });
    openJsonInNewTab(res.data);
    toast('Exported settings');
  } catch (e) {
    toast('Export failed');
    console.error(e);
  }
}
function doImportPick() { $('file-import').click(); }
function doImportFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const payload = JSON.parse(reader.result);
      await safeSend({ action: 'importData', payload });
      await loadKeywords();
      await loadSettings();
      toast('Import successful');
    } catch (e) {
      toast('Import failed');
      console.error(e);
    }
  };
  reader.readAsText(file);
}

// keywords
function renderKeywords(list, where) {
  const wrap = $('kw-list'); wrap.innerHTML = '';
  list.forEach((kw, idx) => {
    const chip = document.createElement('div');
    chip.className = 'kw-chip';
    chip.innerHTML = `<span class="mono">${kw}</span>`;
    const del = document.createElement('button');
    del.textContent = '×'; del.title = 'Remove';
    del.addEventListener('click', async () => {
      try {
        const next = list.filter((_, i) => i !== idx);
        const res = await safeSend({ action: 'setKeywords', keywords: next });
        $('kw-where').textContent = `stored in ${res?.where || where}`;
        await loadKeywords();
        toast('Keyword removed');
      } catch (e) { toast('Failed to remove'); console.error(e); }
    });
    chip.appendChild(del); wrap.appendChild(chip);
  });
  $('kw-where').textContent = `stored in ${where}`;
}
async function loadKeywords() {
  try {
    const res = await safeSend({ action: 'getKeywords' });
    renderKeywords(res.list || [], res.where || 'local');
  } catch (e) { toast('Failed to load keywords'); console.error(e); }
}
async function addKeyword() {
  const input = $('kw-input');
  const raw = input.value.trim();
  if (!raw) return;
  try {
    const cur = await safeSend({ action: 'getKeywords' });
    const set = new Set((cur.list || []).map(s => s.toLowerCase()));
    if (set.has(raw.toLowerCase())) { input.value = ''; toast('Duplicate'); return; }
    const next = [...(cur.list || []), raw];
    const res = await safeSend({ action: 'setKeywords', keywords: next });
    $('kw-where').textContent = `stored in ${res?.where || 'local'}`;
    input.value = '';
    await loadKeywords();
    toast('Keyword added');
  } catch (e) { toast('Failed to add'); console.error(e); }
}

// settings
async function loadSettings() {
  try {
    const res = await safeSend({ action: 'getSettings' });
    const s = res.settings || {};
    $('dl-subdir').value = s.subdir || '';
    $('dl-template').value = s.filenameTemplate || '{id}{ext}';
    $('dl-saveas').checked = !!s.saveAs;
  } catch (e) { toast('Failed to load settings'); console.error(e); }
}
async function saveSettings() {
  try {
    const next = {
      subdir: $('dl-subdir').value.trim(),
      filenameTemplate: $('dl-template').value.trim() || '{id}{ext}',
      saveAs: $('dl-saveas').checked
    };
    await safeSend({ action: 'setSettings', settings: next });
    toast('Settings saved');
  } catch (e) { toast('Save failed'); console.error(e); }
}

// bindings
document.addEventListener('DOMContentLoaded', () => {
  $('btn-export').addEventListener('click', doExport);
  $('btn-import').addEventListener('click', doImportPick);
  $('file-import').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) doImportFile(f);
    e.target.value = '';
  });

  $('kw-add').addEventListener('click', addKeyword);
  $('kw-input').addEventListener('keydown', e => { if (e.key === 'Enter') addKeyword(); });

  $('btn-save-settings').addEventListener('click', saveSettings);

  loadKeywords();
  loadSettings();
});
