import './style.css';
import './app.css';
import { themes, themeNames, defaultTheme, applyTheme } from './themes.js';
import {
  ListPasswords, GetPassword, CopyPassword,
  CreateEntry, UpdateEntry, DeleteEntry, MoveEntry,
  GeneratePasswordAdvanced, GenerateSSHKeyPair,
  GetFolders, ExportMarkdown, ExportCSV,
  OpenURL, ShowSaveDialog, ShowOpenDialog, SaveTextFile,
  AppendToAuthorizedKeys, GetHomeDir, GetClipboard,
  BackupStore, RestoreStore,
  AutoFill, AutoFillSSH, AutoFillCmd, ExecuteMacro,
  GetSSHFingerprint, CheckDependencies,
  GetTOTP, OpenSSHTerminal, ClearClipboard, SetPrimaryClipboard
} from '../wailsjs/go/main/App';

// ── State ──────────────────────────────────────────────────────────────────
let allEntries    = [];
let activeEntry   = null;
let activeDetails = null;
let currentView   = 'entries';
let dragSource    = null; // fullPath of dragged entry

// Filter state — persists across searches
let filterState = { type: 'all', folder: '' };
// Type cache — populated as entries are opened, survives page reloads
let entryTypeCache = JSON.parse(localStorage.getItem('obl-type-cache') || '{}');

function cacheEntryType(fullPath, type) {
  entryTypeCache[fullPath] = type;
  localStorage.setItem('obl-type-cache', JSON.stringify(entryTypeCache));
}

const defaultGenOpts = () => ({ length: 20, upper: true, lower: true, numbers: true, symbols: true, noAmbiguous: false });
let genOpts = defaultGenOpts();

// ── Theme init ─────────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('oberlicht-theme') || defaultTheme;
applyTheme(savedTheme);

// ── Layout ─────────────────────────────────────────────────────────────────
document.querySelector('#app').innerHTML = `
  <div class="sidebar">
    <div class="sidebar-header">
      <span class="app-icon">🪟</span>
      <h1>Oberlicht</h1>
      <div style="position:relative;margin-left:auto;display:flex;gap:6px">
        <button class="btn-theme" id="btn-theme" title="Theme wechseln">🎨</button>
        <button class="btn-new"   id="btn-new"   title="Neuer Eintrag">+</button>
        <div class="theme-dropdown" id="theme-dropdown" style="display:none"></div>
      </div>
    </div>
    <div class="sidebar-nav">
      <button class="nav-tab active" data-view="entries">📋 Einträge</button>
      <button class="nav-tab" data-view="generator">🎲 Generator</button>
      <button class="nav-tab" data-view="ablage">📁 Ablage</button>
      <button class="nav-tab" data-view="export">📤 Export</button>
      <button class="nav-tab" data-view="system">⚙️ System</button>
    </div>
    <div class="search-wrap" id="search-wrap">
      <input id="search" type="text" placeholder="Suchen…" autocomplete="off" spellcheck="false"/>
      <button class="btn-filter" id="btn-filter" title="Filter">▾</button>
      <div class="entry-counter" id="entry-counter"></div>
    </div>
    <div class="filter-bar" id="filter-bar" style="display:none">
      <div class="filter-row" id="filter-type-row">
        <span class="filter-label">Typ</span>
        <div class="filter-chips" id="filter-type-chips"></div>
      </div>
      <div class="filter-row" id="filter-folder-row" style="display:none">
        <span class="filter-label">Ordner</span>
        <div class="filter-chips" id="filter-folder-chips"></div>
      </div>
    </div>
    <div id="entry-list" class="entry-list"></div>
  </div>
  <div class="main" id="main">
    <div class="detail-empty"><div class="empty-icon">🔐</div><p>Eintrag auswählen</p></div>
  </div>
`;

// ── Theme dropdown ─────────────────────────────────────────────────────────
function buildThemeDropdown() {
  const dd = document.getElementById('theme-dropdown');
  dd.innerHTML = '';
  let lastDark = null;
  for (const key of themeNames) {
    const t = themes[key];
    if (lastDark !== null && lastDark !== t.dark) {
      const sep = document.createElement('div');
      sep.className = 'theme-sep';
      dd.appendChild(sep);
    }
    lastDark = t.dark;
    const item = document.createElement('div');
    item.className = 'theme-item' + (key === (localStorage.getItem('oberlicht-theme') || defaultTheme) ? ' active' : '');
    item.innerHTML = `
      <span class="theme-dot" style="background:${t.accent};border-color:${t.border}"></span>
      <span>${t.label}</span>`;
    item.addEventListener('click', () => {
      applyTheme(key);
      dd.querySelectorAll('.theme-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      dd.style.display = 'none';
    });
    dd.appendChild(item);
  }
}

document.getElementById('btn-theme').addEventListener('click', e => {
  e.stopPropagation();
  const dd = document.getElementById('theme-dropdown');
  if (dd.style.display === 'none') { buildThemeDropdown(); dd.style.display = 'flex'; }
  else dd.style.display = 'none';
});
document.addEventListener('click', () => {
  const dd = document.getElementById('theme-dropdown');
  if (dd) dd.style.display = 'none';
});

// ── Nav tabs ───────────────────────────────────────────────────────────────
let filterBarWasOpen = false; // remember filter bar state across tab switches

function switchTab(view) {
  if (view === currentView) return;
  currentView = view;

  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === view));

  const isEntries = view === 'entries';

  // Sidebar elements — only visible on Einträge
  document.getElementById('search-wrap').style.display = isEntries ? '' : 'none';
  document.getElementById('entry-list').style.display  = isEntries ? '' : 'none';
  document.getElementById('btn-new').style.display     = isEntries ? '' : 'none';

  // Filter bar — save/restore open state, only show on Einträge
  const filterBar = document.getElementById('filter-bar');
  const filterBtn = document.getElementById('btn-filter');
  if (isEntries) {
    if (filterBarWasOpen) {
      filterBar.style.display = '';
      filterBtn.classList.add('active');
      renderFilterBar();
    }
  } else {
    filterBarWasOpen = filterBar.style.display !== 'none';
    filterBar.style.display = 'none';
    filterBtn.classList.remove('active');
  }

  // Right panel
  if (isEntries) {
    // Restore whatever was open — detail, loading, or empty state
    if (activeEntry && activeDetails) {
      showDetail(activeEntry, activeDetails);
    } else if (activeEntry) {
      showLoading(activeEntry);
      GetPassword(activeEntry.fullPath)
        .then(d => { activeDetails = d; showDetail(activeEntry, d); })
        .catch(showError);
    } else {
      showEmptyState();
    }
    return;
  }

  if (view === 'generator') renderGeneratorPanel();
  if (view === 'ablage')    renderAblagePanel();
  if (view === 'export')    renderExportPanel();
  if (view === 'system')    renderSystemPanel();
}

document.querySelectorAll('.nav-tab').forEach(tab =>
  tab.addEventListener('click', () => switchTab(tab.dataset.view)));

// ── Tree + Drag & Drop ─────────────────────────────────────────────────────
function buildTree(entries) {
  const root = { children: {}, entries: [], path: '' };
  for (const entry of entries) {
    const parts = entry.fullPath.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!node.children[p]) {
        const folderPath = node.path ? `${node.path}/${p}` : p;
        node.children[p] = { name: p, path: folderPath, children: {}, entries: [] };
      }
      node = node.children[p];
    }
    node.entries.push(entry);
  }
  return root;
}

function makeDropTarget(el, targetPath) {
  el.addEventListener('dragover', e => {
    if (!dragSource) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (!dragSource) return;
    const name   = dragSource.split('/').pop();
    const toPath = targetPath ? `${targetPath}/${name}` : name;
    if (dragSource === toPath) return;
    MoveEntry(dragSource, toPath)
      .then(() => reloadList())
      .catch(err => alert(`Verschieben fehlgeschlagen: ${err}`));
    dragSource = null;
  });
}

function renderTree(node, autoOpen = false) {
  const frag = document.createDocumentFragment();

  for (const child of Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name))) {
    const wrap = document.createElement('div');
    const row  = document.createElement('div');
    row.className = 'folder-row' + (autoOpen ? ' folder-open' : '');
    row.innerHTML = `<span class="folder-toggle">▶</span><span>📁 ${escHtml(child.name)}</span>`;
    const kids = document.createElement('div');
    kids.className = 'folder-children';
    kids.style.display = autoOpen ? 'block' : 'none';
    kids.appendChild(renderTree(child, autoOpen));
    row.addEventListener('click', () => {
      const open = row.classList.toggle('folder-open');
      kids.style.display = open ? 'block' : 'none';
    });
    makeDropTarget(row, child.path);
    wrap.appendChild(row);
    wrap.appendChild(kids);
    frag.appendChild(wrap);
  }

  for (const entry of [...node.entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const row = document.createElement('div');
    row.className = 'entry-row';
    row.dataset.path = entry.fullPath;
    row.draggable = true;
    const cachedType = entryTypeCache[entry.fullPath];
    row.innerHTML = `<span class="entry-icon">🔑</span><span class="entry-name">${escHtml(entry.name)}</span>`;
    if (cachedType && cachedType !== 'web') row.appendChild(makeTypeBadge(cachedType));
    row.addEventListener('click', () => selectEntry(entry, row));
    row.addEventListener('dragstart', e => {
      dragSource = entry.fullPath;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', entry.fullPath);
      setTimeout(() => row.classList.add('dragging'), 0);
    });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragSource = null; });
    frag.appendChild(row);
  }

  return frag;
}

function renderList(entries, autoOpen = false) {
  const list    = document.getElementById('entry-list');
  const counter = document.getElementById('entry-counter');
  list.innerHTML = '';

  if (counter) {
    const total = allEntries.length;
    const shown = entries.length;
    if (total === 0) {
      counter.textContent = '';
    } else if (shown === total) {
      counter.textContent = `${total} Eintr${total === 1 ? 'ag' : 'äge'}`;
      counter.classList.remove('counter-filtered');
    } else {
      counter.textContent = `${shown} von ${total} gefunden`;
      counter.classList.add('counter-filtered');
    }
  }

  if (!entries.length) {
    list.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:13px;">Keine Einträge gefunden.</div>';
    return;
  }
  list.appendChild(renderTree(buildTree(entries), autoOpen));
}

// Root-level drop target (move to store root)
const entryList = document.getElementById('entry-list');
makeDropTarget(entryList, '');

function showEmptyState() {
  if (!activeEntry) {
    document.getElementById('main').innerHTML =
      '<div class="detail-empty"><div class="empty-icon">🔐</div><p>Eintrag auswählen</p></div>';
  }
}

async function reloadList() {
  const entries = await ListPasswords();
  allEntries = entries || [];
  renderList(getFilteredEntries());
  if (document.getElementById('filter-bar').style.display !== 'none') renderFilterBar();
}

// ── Filter ─────────────────────────────────────────────────────────────────
const TYPE_LABELS = { all: 'Alle', web: 'Web', ssh: 'SSH', macro: 'Makro' };
const TYPE_ORDER  = ['all', 'web', 'ssh', 'macro'];

function getFilteredEntries() {
  const q = document.getElementById('search')?.value?.toLowerCase().trim() || '';
  let result = allEntries;
  if (q) result = result.filter(en => en.fullPath.toLowerCase().includes(q));
  if (filterState.folder) {
    result = result.filter(en => {
      const parts = en.fullPath.split('/');
      return parts.length > 1 && parts[0] === filterState.folder;
    });
  }
  if (filterState.type !== 'all') {
    result = result.filter(en => {
      const cached = entryTypeCache[en.fullPath];
      if (filterState.type === 'web') return !cached || cached === 'web';
      return cached === filterState.type;
    });
  }
  return result;
}

function renderFilterBar() {
  // Type chips
  const typeWrap = document.getElementById('filter-type-chips');
  if (typeWrap) {
    typeWrap.innerHTML = '';
    for (const t of TYPE_ORDER) {
      // Count how many entries match this type (from cache)
      let count;
      if (t === 'all') {
        count = allEntries.length;
      } else if (t === 'web') {
        count = allEntries.filter(en => !entryTypeCache[en.fullPath] || entryTypeCache[en.fullPath] === 'web').length;
      } else {
        count = allEntries.filter(en => entryTypeCache[en.fullPath] === t).length;
      }
      if (t !== 'all' && count === 0) continue; // hide empty types
      const chip = document.createElement('button');
      chip.className = 'filter-chip' + (filterState.type === t ? ' active' : '');
      chip.dataset.type = t;
      chip.innerHTML = `${TYPE_LABELS[t]}<span class="filter-chip-count">${count}</span>`;
      chip.addEventListener('click', () => {
        filterState.type = t;
        renderFilterBar();
        renderList(getFilteredEntries(), !!document.getElementById('search')?.value?.trim());
      });
      typeWrap.appendChild(chip);
    }
  }

  // Folder chips — unique top-level folders
  const folders = [...new Set(
    allEntries.filter(en => en.fullPath.includes('/')).map(en => en.fullPath.split('/')[0])
  )].sort();
  const folderRow  = document.getElementById('filter-folder-row');
  const folderWrap = document.getElementById('filter-folder-chips');
  if (folderRow && folderWrap) {
    if (folders.length === 0) { folderRow.style.display = 'none'; return; }
    folderRow.style.display = '';
    folderWrap.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.className = 'filter-chip' + (!filterState.folder ? ' active' : '');
    allChip.textContent = 'Alle';
    allChip.addEventListener('click', () => {
      filterState.folder = '';
      renderFilterBar();
      renderList(getFilteredEntries(), !!document.getElementById('search')?.value?.trim());
    });
    folderWrap.appendChild(allChip);
    for (const f of folders) {
      const count = allEntries.filter(en => en.fullPath.startsWith(f + '/')).length;
      const chip = document.createElement('button');
      chip.className = 'filter-chip' + (filterState.folder === f ? ' active' : '');
      chip.innerHTML = `${escHtml(f)}<span class="filter-chip-count">${count}</span>`;
      chip.addEventListener('click', () => {
        filterState.folder = filterState.folder === f ? '' : f;
        renderFilterBar();
        renderList(getFilteredEntries(), !!document.getElementById('search')?.value?.trim());
      });
      folderWrap.appendChild(chip);
    }
  }
}

// Filter toggle
document.getElementById('btn-filter').addEventListener('click', () => {
  const bar  = document.getElementById('filter-bar');
  const btn  = document.getElementById('btn-filter');
  const open = bar.style.display === 'none';
  bar.style.display = open ? '' : 'none';
  btn.classList.toggle('active', open);
  if (open) renderFilterBar();
});

// ── Search ─────────────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', () => {
  renderList(getFilteredEntries(), !!document.getElementById('search').value.trim());
});

// ── Select entry ───────────────────────────────────────────────────────────
function selectEntry(entry, rowEl) {
  document.querySelectorAll('.entry-row.active, .entry-row.selected').forEach(r => r.classList.remove('active', 'selected'));
  rowEl.classList.add('active', 'selected');
  activeEntry = entry; activeDetails = null;
  showLoading(entry);
  GetPassword(entry.fullPath)
    .then(details => {
      activeDetails = details;
      // Cache type for filter badges — don't need to re-decrypt later
      const t = detectEntryType(details);
      if (entryTypeCache[entry.fullPath] !== t) {
        cacheEntryType(entry.fullPath, t);
        // Update badge on the row without re-rendering the whole list
        const badge = rowEl.querySelector('.type-badge');
        const newBadge = makeTypeBadge(t);
        if (badge) badge.replaceWith(newBadge);
        else rowEl.appendChild(newBadge);
        // Refresh filter chip counts if bar is open
        if (document.getElementById('filter-bar').style.display !== 'none') renderFilterBar();
      }
      showDetail(entry, details);
    })
    .catch(err => showError(err));
}

function makeTypeBadge(type) {
  const span = document.createElement('span');
  span.className = `type-badge type-badge-${type}`;
  span.textContent = type === 'ssh' ? 'SSH' : type === 'macro' ? 'MK' : '';
  return span;
}

// ── Detail ─────────────────────────────────────────────────────────────────
function showLoading(entry) {
  document.getElementById('main').innerHTML = `
    <div class="loading"><div class="spinner"></div>
    <span>Entschlüssele <strong>${escHtml(entry.name)}</strong>…</span></div>`;
}
function showError(err) {
  document.getElementById('main').innerHTML = `<div class="error-msg">⚠️ ${err}</div>`;
}

function showDetail(entry, details) {
  const parts  = entry.fullPath.split('/');
  const folder = parts.length > 1 ? parts.slice(0, -1).join(' › ') : '';
  const main   = document.getElementById('main');
  main.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'detail-panel';

  if (folder) panel.innerHTML += `<div class="detail-path">${escHtml(folder)}</div>`;
  panel.innerHTML += `<div class="detail-title">${escHtml(entry.name)}</div>`;

  // Actions
  const entryType  = detectEntryType(details);
  const sshCmd     = composeSSHCmd(details);
  const actions = el('div', 'detail-actions');
  actions.innerHTML = `
    <button class="btn-action" id="btn-edit">✏️ Bearbeiten</button>
    <button class="btn-action" id="btn-copy-all">📄 Alles kopieren</button>
    <button class="btn-action" id="btn-export-entry">📤 Exportieren</button>
    ${entryType === 'ssh' && sshCmd ? `<button class="btn-action btn-ssh-term" id="btn-ssh-term">💻 Terminal</button>` : ''}
    <button class="btn-action danger" id="btn-delete-entry">🗑 Löschen</button>`;
  panel.appendChild(actions);
  panel.appendChild(buildAutofillBar(entry, details));

  // Password
  const pwSec = el('div', 'section');
  pwSec.innerHTML = `
    <div class="section-label">Passwort</div>
    <div class="pw-field">
      <span class="pw-value hidden" id="pw-val">${mask(details.password)}</span>
      <button class="icon-btn" id="btn-toggle">👁</button>
      <button class="icon-btn" id="btn-copy-inline" title="Kopieren">📋</button>
    </div>
    <button class="btn-copy" id="btn-copy-pass">📋 In Zwischenablage kopieren (45 Sek.)</button>`;
  panel.appendChild(pwSec);

  // Fields
  if (details.fields?.length) {
    const sec = el('div', 'section');
    sec.innerHTML = '<div class="section-label">Felder</div>';
    const table = el('table', 'fields-table');
    for (const f of details.fields.filter(f => !AF_META_KEYS.includes(f.key))) {
      const tr = document.createElement('tr');
      const isSensitive = SENSITIVE_FIELD_KEYS.includes(f.key.toLowerCase());
      const isUrl = !isSensitive && (f.key === 'url' || f.value.startsWith('http'));
      let valCell;
      if (isSensitive) {
        valCell = document.createElement('td');
        const span = document.createElement('span');
        span.className = 'field-secret-val';
        span.textContent = mask(f.value);
        span.dataset.revealed = '0';
        span.dataset.val = f.value;
        const toggle = document.createElement('button');
        toggle.className = 'icon-btn field-secret-toggle';
        toggle.title = 'Anzeigen';
        toggle.textContent = '👁';
        toggle.addEventListener('click', () => {
          const shown = span.dataset.revealed === '1';
          span.textContent = shown ? mask(f.value) : f.value;
          span.dataset.revealed = shown ? '0' : '1';
          toggle.title = shown ? 'Anzeigen' : 'Verbergen';
        });
        valCell.appendChild(span);
        valCell.appendChild(toggle);
      } else {
        valCell = document.createElement('td');
        valCell.innerHTML = isUrl
          ? `<span class="field-url" data-url="${escHtml(f.value)}">${escHtml(f.value)}</span>`
          : `<span>${escHtml(f.value)}</span>`;
      }
      tr.innerHTML = `<td>${escHtml(f.key)}</td>`;
      tr.appendChild(valCell);
      const copyTd = document.createElement('td');
      copyTd.className = 'field-copy-cell';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'field-copy-btn';
      copyBtn.dataset.val = f.value;
      copyBtn.textContent = '📋';
      copyTd.appendChild(copyBtn);
      tr.appendChild(copyTd);
      table.appendChild(tr);
    }
    sec.appendChild(table);
    panel.appendChild(sec);
  }

  // TOTP (live code + countdown ring when totp: or otp: field present)
  const totpField = details.fields?.find(f => ['totp','otp','secret','2fa'].includes(f.key.toLowerCase()));
  if (totpField) {
    const totpSec = el('div', 'section');
    totpSec.innerHTML = `
      <div class="section-label">2FA / TOTP</div>
      <div class="totp-box" id="totp-box">
        <svg class="totp-ring" viewBox="0 0 36 36">
          <circle class="totp-ring-bg" cx="18" cy="18" r="15.9"/>
          <circle class="totp-ring-arc" id="totp-arc" cx="18" cy="18" r="15.9"
            stroke-dasharray="100 100" stroke-dashoffset="0"/>
        </svg>
        <span class="totp-code" id="totp-code">——</span>
        <button class="field-copy-btn" id="totp-copy" title="Kopieren">📋</button>
      </div>`;
    panel.appendChild(totpSec);

    let totpTimer;
    const refreshTOTP = () => {
      GetTOTP(totpField.value)
        .then(r => {
          const codeEl = panel.querySelector('#totp-code');
          const arcEl  = panel.querySelector('#totp-arc');
          if (!codeEl) { clearInterval(totpTimer); return; }
          codeEl.textContent = r.code.slice(0,3) + ' ' + r.code.slice(3);
          const pct = (r.remaining / r.period) * 100;
          arcEl.setAttribute('stroke-dasharray', `${pct} 100`);
          arcEl.style.stroke = r.remaining <= 5 ? 'var(--danger)' : r.remaining <= 10 ? 'var(--accent)' : 'var(--success)';
        })
        .catch(() => { const el = panel.querySelector('#totp-code'); if (el) el.textContent = 'Fehler'; });
    };
    refreshTOTP();
    totpTimer = setInterval(refreshTOTP, 1000);

    const getRawCode = () => panel.querySelector('#totp-code')?.textContent?.replace(/\s/g,'') || '';

    // 📋 button → normal clipboard
    panel.querySelector('#totp-copy')?.addEventListener('click', () => {
      copyText(getRawCode(), panel.querySelector('#totp-copy'));
    });

    // Click on ring or code → primary selection (middle-click paste)
    const flashPrimary = el => {
      el.classList.add('totp-flash');
      setTimeout(() => el.classList.remove('totp-flash'), 400);
    };
    panel.querySelector('.totp-ring')?.addEventListener('click', () => {
      const code = getRawCode();
      if (code) SetPrimaryClipboard(code).then(() => flashPrimary(panel.querySelector('.totp-ring')));
    });
    panel.querySelector('#totp-code')?.addEventListener('click', () => {
      const code = getRawCode();
      if (code) SetPrimaryClipboard(code).then(() => flashPrimary(panel.querySelector('#totp-code')));
    });

    // Clean up timer when detail panel is replaced
    const obs = new MutationObserver(() => { if (!document.contains(totpSec)) { clearInterval(totpTimer); obs.disconnect(); } });
    obs.observe(document.getElementById('main'), { childList: true });
  }

  // SSH fingerprint (lazy-load when public-key field is present)
  const pubKeyField = details.fields?.find(f => f.key === 'public-key');
  if (pubKeyField) {
    const fpSec = el('div', 'section');
    fpSec.innerHTML = `
      <div class="section-label">SSH Fingerprint</div>
      <div class="ssh-fingerprint-box" id="ssh-fp-box">
        <span class="ssh-fp-loading">Berechne…</span>
      </div>`;
    panel.appendChild(fpSec);
    GetSSHFingerprint(pubKeyField.value)
      .then(fp => {
        const box = panel.querySelector('#ssh-fp-box');
        if (box) box.innerHTML = `<code class="ssh-fp-text">${escHtml(fp)}</code>
          <button class="field-copy-btn" title="Kopieren" data-val="${escHtml(fp)}">📋</button>`;
        box?.querySelector('.field-copy-btn')?.addEventListener('click', e =>
          copyText(e.currentTarget.dataset.val, e.currentTarget));
      })
      .catch(err => {
        const box = panel.querySelector('#ssh-fp-box');
        if (box) box.innerHTML = `<span style="color:var(--muted);font-size:12px">${escHtml(String(err))}</span>`;
      });
  }

  // Notes
  if (details.notes) {
    const sec = el('div', 'section');
    sec.innerHTML = `
      <div class="section-label">Notizen / Zweck</div>
      <div class="notes-box">${escHtml(details.notes)}</div>`;
    panel.appendChild(sec);
  }

  main.appendChild(panel);

  // Wire events
  let visible = false;
  panel.querySelector('#btn-toggle').onclick = () => {
    visible = !visible;
    const v = panel.querySelector('#pw-val');
    v.textContent = visible ? details.password : mask(details.password);
    v.classList.toggle('hidden', !visible);
  };
  panel.querySelector('#btn-copy-inline').onclick = () =>
    copyText(details.password, panel.querySelector('#btn-copy-inline'));
  panel.querySelector('#btn-copy-pass').onclick = () => {
    CopyPassword(entry.fullPath)
      .then(() => flashBtn(panel.querySelector('#btn-copy-pass'), '✓ Kopiert (45 Sek.)', 3000))
      .catch(console.error);
  };
  panel.querySelector('#btn-copy-all').onclick = () =>
    copyText(buildPlainText(entry, details), panel.querySelector('#btn-copy-all'));
  panel.querySelector('#btn-export-entry').onclick = () =>
    exportEntry(entry, details);
  panel.querySelectorAll('.field-copy-btn').forEach(b =>
    b.addEventListener('click', () => copyText(b.dataset.val, b))
  );
  panel.querySelectorAll('.field-url').forEach(e2 =>
    e2.addEventListener('click', () => OpenURL(e2.dataset.url))
  );
  panel.querySelector('#btn-edit').onclick = () => openModal(entry, details);
  panel.querySelector('#btn-delete-entry').onclick = () => confirmDelete(entry);
  panel.querySelector('#btn-ssh-term')?.addEventListener('click', () => {
    const cmd = composeSSHCmd(details);
    if (!cmd) return;
    OpenSSHTerminal(cmd).catch(err =>
      alert(`Terminal konnte nicht geöffnet werden:\n${err}`));
  });
}

// ── Auto-Fill ──────────────────────────────────────────────────────────────
const AF_META_KEYS       = ['autofill', 'autofill-type', 'autofill-delay', 'autofill-pw-delay', 'autofill-cmd'];
const SENSITIVE_FIELD_KEYS = ['totp','otp','secret','2fa'];
const USER_FIELD_KEYS = ['login','user','username','email','e-mail','mail','benutzername','account','name','benutzer'];
const SSH_HOST_KEYS   = ['host','server','hostname','ip','adresse'];
const SSH_PORT_KEYS   = ['port'];
const MACRO_CMD_KEY   = 'befehl';

function getField(details, key) {
  return details.fields?.find(f => f.key === key)?.value ?? null;
}

function getAllFields(details, key) {
  return (details.fields || []).filter(f => f.key === key).map(f => f.value);
}

function detectUsername(details) {
  if (!details.fields) return '';
  for (const f of details.fields) {
    if (USER_FIELD_KEYS.includes(f.key.toLowerCase())) return f.value;
  }
  return '';
}

function detectEntryType(details) {
  const stored = getField(details, 'autofill-type');
  if (stored) return stored;
  if (details.fields?.some(f => f.key === MACRO_CMD_KEY)) return 'macro';
  const hasHost = details.fields?.some(f => SSH_HOST_KEYS.includes(f.key.toLowerCase()));
  return hasHost ? 'ssh' : 'web';
}

function composeSSHCmd(details) {
  const host = details.fields?.find(f => SSH_HOST_KEYS.includes(f.key.toLowerCase()))?.value;
  if (!host) return null;
  const user = detectUsername(details);
  const port = details.fields?.find(f => SSH_PORT_KEYS.includes(f.key.toLowerCase()))?.value;
  const portPart = (port && port !== '22') ? `-p ${port} ` : '';
  const userPart = user ? `${user}@` : '';
  return `ssh ${portPart}${userPart}${host}`;
}

function resolveTemplate(tpl, details) {
  let s = tpl;
  s = s.replace(/\{password\}/g, details.password);
  for (const f of (details.fields || [])) {
    s = s.replace(new RegExp(`\\{${f.key}\\}`, 'g'), f.value);
  }
  return s;
}

function saveEntryField(entry, details, key, value) {
  const newFields = (details.fields || []).filter(f => f.key !== key);
  if (value !== null) newFields.push({ key, value });
  details.fields = newFields;
  return UpdateEntry(entry.fullPath, {
    fullPath: entry.fullPath,
    password: details.password,
    fields:   newFields,
    notes:    details.notes || ''
  }).catch(err => console.error('AutoFill-Feld speichern:', err));
}

function buildAutofillBar(entry, details) {
  const isEnabled   = getField(details, 'autofill') === 'true';
  const entryType   = detectEntryType(details);
  const entryDelay  = parseInt(getField(details, 'autofill-delay')    || '0', 10);
  const entryPwDly  = parseInt(getField(details, 'autofill-pw-delay') || '0', 10);
  const globalDelay = parseInt(localStorage.getItem('autofill-delay-s') || '2', 10);
  const delay       = entryDelay  || globalDelay;
  const pwDelay     = entryPwDly  || (globalDelay * 2); // SSH needs more time for connection
  const username    = detectUsername(details);
  const sshCmd      = composeSSHCmd(details);
  const customCmd   = getField(details, 'autofill-cmd');

  const macroCmds   = getAllFields(details, MACRO_CMD_KEY);
  const typeLabel   = entryType === 'ssh' ? 'SSH' : entryType === 'cmd' ? 'Befehl'
    : entryType === 'macro' ? 'Makro' : 'Formular';
  const previewText = entryType === 'ssh' && sshCmd
    ? `<code class="af-cmd-preview">${escHtml(sshCmd)}</code>`
    : entryType === 'cmd' && customCmd
    ? `<code class="af-cmd-preview">${escHtml(customCmd)}</code>`
    : entryType === 'macro' && macroCmds.length
    ? `<span class="af-macro-steps">${macroCmds.length} Schritt${macroCmds.length !== 1 ? 'e' : ''}: ${macroCmds.map(c => `<code>${escHtml(c)}</code>`).join(' → ')}</span>`
    : username
    ? `<span class="af-user-chip">${escHtml(username)}</span>`
    : '<span class="af-user-chip af-user-none">kein Benutzerfeld</span>';

  const isTerminal  = entryType === 'ssh' || entryType === 'cmd' || entryType === 'macro';

  const bar = el('div', 'af-bar' + (isEnabled ? ' af-bar-on' : ''));
  bar.innerHTML = `
    <div class="af-bar-left">
      <label class="af-toggle-label">
        <span class="toggle-sw">
          <input type="checkbox" id="af-cb" ${isEnabled ? 'checked' : ''}/>
          <span class="toggle-track"></span>
          <span class="toggle-knob"></span>
        </span>
        <span class="af-bar-title">⌨️ Auto-Ausfüllen</span>
      </label>
      <span class="af-type-badge">${typeLabel}</span>
      ${previewText}
    </div>
    <div class="af-bar-right" id="af-right" style="display:${isEnabled ? 'flex' : 'none'}">
      ${isTerminal ? `
        <span class="af-bar-muted">Verbindung</span>
        <input type="number" class="form-input af-delay-inp" id="af-delay"
          min="1" max="30" value="${delay}" title="Pause vor Befehl (Sek.)"/>
        <span class="af-bar-muted">Sek. | PW</span>
        <input type="number" class="form-input af-delay-inp" id="af-pw-delay"
          min="1" max="30" value="${pwDelay}" title="Warten auf Passwort-Prompt (Sek.)"/>
        <span class="af-bar-muted">Sek.</span>
      ` : `
        <span class="af-bar-muted">Pause</span>
        <input type="number" class="form-input af-delay-inp" id="af-delay"
          min="1" max="15" value="${delay}" title="Sekunden Verzögerung"/>
        <span class="af-bar-muted">Sek.</span>
      `}
      <button class="btn-af-go" id="af-go">▶ ${isTerminal ? 'Verbinden' : 'Ausfüllen'}</button>
      <div class="af-bar-count" id="af-count" style="display:none"></div>
    </div>`;

  const cb      = bar.querySelector('#af-cb');
  const right   = bar.querySelector('#af-right');
  const delayIn = bar.querySelector('#af-delay');
  const pwDlyIn = bar.querySelector('#af-pw-delay');
  const goBtn   = bar.querySelector('#af-go');
  const countEl = bar.querySelector('#af-count');

  cb.addEventListener('change', () => {
    const on = cb.checked;
    right.style.display = on ? 'flex' : 'none';
    bar.classList.toggle('af-bar-on', on);
    saveEntryField(entry, details, 'autofill', on ? 'true' : null);
    if (!on) {
      saveEntryField(entry, details, 'autofill-delay', null);
      saveEntryField(entry, details, 'autofill-pw-delay', null);
    }
  });

  let saveTimer;
  const saveDelays = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const v = Math.min(30, Math.max(1, parseInt(delayIn.value) || 2));
      delayIn.value = v;
      saveEntryField(entry, details, 'autofill-delay', String(v));
      if (pwDlyIn) {
        const pv = Math.min(30, Math.max(1, parseInt(pwDlyIn.value) || 4));
        pwDlyIn.value = pv;
        saveEntryField(entry, details, 'autofill-pw-delay', String(pv));
      }
    }, 600);
  };
  delayIn?.addEventListener('input', saveDelays);
  pwDlyIn?.addEventListener('input', saveDelays);

  goBtn.addEventListener('click', () => {
    const d   = parseInt(delayIn?.value  || '2', 10);
    const pwd = parseInt(pwDlyIn?.value  || '4', 10);
    const execFn = () => {
      if (entryType === 'macro' && macroCmds.length) {
        return ExecuteMacro(macroCmds, details.password, pwd * 1000);
      } else if (entryType === 'ssh' && sshCmd) {
        return AutoFillSSH(sshCmd, details.password, pwd * 1000);
      } else if (entryType === 'cmd' && customCmd) {
        const resolved = resolveTemplate(customCmd, details);
        return AutoFillCmd(resolved, details.password, pwd * 1000);
      } else {
        return AutoFill(username, details.password);
      }
    };
    const hint = isTerminal ? 'Terminal fokussieren…' : 'Browser fokussieren…';
    runAutofillCountdown(goBtn, countEl, d, hint, execFn);
  });

  return bar;
}

function runAutofillCountdown(goBtn, countEl, delay, hint, execFn) {
  goBtn.style.display   = 'none';
  countEl.style.display = 'flex';
  let remaining = delay;
  const render = () => {
    countEl.innerHTML = remaining > 0
      ? `<span class="af-count-num">${remaining}</span><span class="af-count-hint">${escHtml(hint)}</span>`
      : '<span style="color:var(--accent);font-size:13px">⌨️ Tippe…</span>';
  };
  render();
  const tick = setInterval(() => {
    remaining--;
    render();
    if (remaining <= 0) {
      clearInterval(tick);
      execFn()
        .then(() => { countEl.innerHTML = '<span style="color:var(--success);font-size:13px">✓ Fertig</span>'; })
        .catch(err => { countEl.innerHTML = `<span style="color:var(--danger);font-size:12px">✗ ${escHtml(String(err))}</span>`; })
        .finally(() => setTimeout(() => { goBtn.style.display = ''; countEl.style.display = 'none'; }, 3000));
    }
  }, 1000);
}

function buildPlainText(entry, details) {
  let out = `=== ${entry.fullPath} ===\nPasswort: ${details.password}\n`;
  for (const f of (details.fields || []).filter(f => !AF_META_KEYS.includes(f.key)))
    out += `${f.key}: ${f.value}\n`;
  if (details.notes) out += `\nNotizen:\n${details.notes}\n`;
  return out;
}

function exportEntry(entry, details) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="confirm-box" style="width:360px">
      <h3>📤 Eintrag exportieren</h3>
      <p>Exportiert <strong>${escHtml(entry.name)}</strong> inkl. Passwort.</p>
      <div class="confirm-footer" style="flex-wrap:wrap;gap:8px">
        <button class="btn-cancel" id="e-cancel">Abbrechen</button>
        <button class="btn-export" id="e-copy">📄 Text kopieren</button>
        <button class="btn-export" id="e-save">💾 Als Datei…</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const text = buildPlainText(entry, details);
  overlay.querySelector('#e-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#e-copy').onclick   = () => {
    navigator.clipboard.writeText(text);
    overlay.remove();
  };
  overlay.querySelector('#e-save').onclick   = () => {
    overlay.remove();
    saveViaDialog(`${entry.name}.txt`, text, null);
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── Generator panel ────────────────────────────────────────────────────────
function renderGeneratorPanel() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const panel = el('div', 'gen-panel');

  const mkToggle = (id, label, checked) => `
    <label class="opt-row${checked ? ' active' : ''}">
      <span class="toggle-sw">
        <input type="checkbox" id="${id}"${checked ? ' checked' : ''}/>
        <span class="toggle-track"></span>
        <span class="toggle-knob"></span>
      </span>
      <span class="opt-label">${label}</span>
    </label>`;

  panel.innerHTML = `
    <h2>🎲 Passwort-Generator</h2>

    <div class="section">
      <div class="section-label" style="margin-bottom:8px">Zeichensatz</div>
      <div class="opt-group">
        ${mkToggle('opt-upper',       'A–Z Großbuchstaben',                       genOpts.upper)}
        ${mkToggle('opt-lower',       'a–z Kleinbuchstaben',                      genOpts.lower)}
        ${mkToggle('opt-numbers',     '0–9 Zahlen',                               genOpts.numbers)}
        ${mkToggle('opt-symbols',     '!@# Sonderzeichen',                        genOpts.symbols)}
        ${mkToggle('opt-noambiguous', 'Keine ähnlichen Zeichen (0 O l 1 I)',      genOpts.noAmbiguous)}
      </div>
    </div>

    <div class="section">
      <div class="section-label" style="margin-bottom:8px">Länge</div>
      <div class="len-row">
        <input type="range" id="gen-len" min="4" max="64" value="${genOpts.length}"/>
        <span class="len-display" id="len-disp">${genOpts.length}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-label" style="margin-bottom:8px">Ergebnis</div>
      <div class="gen-result" id="gen-result">—</div>
      <div class="gen-actions">
        <button class="btn-regen" id="btn-regen">🔄 Neu</button>
        <button class="btn-copy" id="btn-copy-gen" style="margin-top:0">📋 Kopieren</button>
      </div>
    </div>

    <div class="section">
      <h3>🔐 SSH-Schlüsselpaar</h3>
      <div class="ssh-section">
        <div class="ssh-row">
          <select id="ssh-type">
            <option value="ed25519">Ed25519 (empfohlen)</option>
            <option value="rsa">RSA 4096</option>
          </select>
          <input class="form-input" id="ssh-comment" placeholder="Kommentar (user@host)" style="flex:1"/>
          <button class="btn-gen" id="btn-gen-ssh">Generieren</button>
        </div>
        <div id="ssh-result" style="display:none">
          <div class="section-label" style="margin-bottom:4px">Privater Schlüssel</div>
          <div class="key-block" id="ssh-priv"></div>
          <div class="key-actions">
            <button class="field-copy-btn visible" id="btn-cp-priv">📋 Kopieren</button>
            <button class="field-copy-btn visible" id="btn-sv-priv">💾 Als Datei</button>
          </div>
          <div class="section-label" style="margin-bottom:4px;margin-top:10px">Öffentlicher Schlüssel</div>
          <div class="key-block" id="ssh-pub"></div>
          <div class="key-actions">
            <button class="field-copy-btn visible" id="btn-cp-pub">📋 Kopieren</button>
            <button class="field-copy-btn visible" id="btn-sv-pub">💾 Als Datei</button>
            <button class="field-copy-btn visible" id="btn-auth">🔑 → authorized_keys</button>
          </div>
        </div>
      </div>
    </div>`;

  main.appendChild(panel);

  // Toggle switches
  const mapOpt = { 'opt-upper': 'upper', 'opt-lower': 'lower', 'opt-numbers': 'numbers', 'opt-symbols': 'symbols', 'opt-noambiguous': 'noAmbiguous' };
  panel.querySelectorAll('.opt-row input').forEach(cb => {
    cb.addEventListener('change', () => {
      genOpts[mapOpt[cb.id]] = cb.checked;
      cb.closest('.opt-row').classList.toggle('active', cb.checked);
      doGenerate();
    });
  });

  // Length slider
  const slider = panel.querySelector('#gen-len');
  const disp   = panel.querySelector('#len-disp');
  slider.addEventListener('input', () => { genOpts.length = +slider.value; disp.textContent = genOpts.length; doGenerate(); });

  const doGenerate = () =>
    GeneratePasswordAdvanced(genOpts)
      .then(pw => { panel.querySelector('#gen-result').textContent = pw; })
      .catch(e => { panel.querySelector('#gen-result').textContent = `Fehler: ${e}`; });

  panel.querySelector('#btn-regen').onclick = doGenerate;
  panel.querySelector('#btn-copy-gen').onclick = () => {
    const v = panel.querySelector('#gen-result').textContent;
    if (v && v !== '—') copyText(v, panel.querySelector('#btn-copy-gen'));
  };

  // SSH
  panel.querySelector('#btn-gen-ssh').onclick = () => {
    const btn  = panel.querySelector('#btn-gen-ssh');
    const type = panel.querySelector('#ssh-type').value;
    const com  = panel.querySelector('#ssh-comment').value || 'oberlicht';
    btn.textContent = '…'; btn.disabled = true;
    GenerateSSHKeyPair(type, com).then(pair => {
      panel.querySelector('#ssh-priv').textContent = pair.privateKey;
      panel.querySelector('#ssh-pub').textContent  = pair.publicKey;
      panel.querySelector('#ssh-result').style.display = 'block';
      btn.textContent = 'Neu generieren'; btn.disabled = false;
      panel.querySelector('#btn-cp-priv').onclick = () => copyText(pair.privateKey, panel.querySelector('#btn-cp-priv'));
      panel.querySelector('#btn-cp-pub').onclick  = () => copyText(pair.publicKey,  panel.querySelector('#btn-cp-pub'));
      panel.querySelector('#btn-sv-priv').onclick = () => saveViaDialog(`id_${type}`, pair.privateKey, panel.querySelector('#btn-sv-priv'));
      panel.querySelector('#btn-sv-pub').onclick  = () => saveViaDialog(`id_${type}.pub`, pair.publicKey, panel.querySelector('#btn-sv-pub'));
      panel.querySelector('#btn-auth').onclick    = () => {
        const b = panel.querySelector('#btn-auth');
        AppendToAuthorizedKeys(pair.publicKey)
          .then(() => flashBtn(b, '✓ Eingetragen', 2000))
          .catch(err => alert(`Fehler: ${err}`));
      };
    }).catch(err => { alert(`SSH-Fehler: ${err}`); btn.textContent = 'Generieren'; btn.disabled = false; });
  };

  doGenerate();
}

// ── Ablage panel ───────────────────────────────────────────────────────────
const recentSaves = JSON.parse(localStorage.getItem('ablage-recent') || '[]');

function pushRecent(path) {
  const name = path.split('/').pop();
  const idx  = recentSaves.findIndex(r => r.path === path);
  if (idx !== -1) recentSaves.splice(idx, 1);
  recentSaves.unshift({ name, path, time: Date.now() });
  if (recentSaves.length > 20) recentSaves.pop();
  localStorage.setItem('ablage-recent', JSON.stringify(recentSaves));
}

function saveViaDialog(defaultName, content, btn) {
  return ShowSaveDialog(defaultName).then(path => {
    if (!path) return;
    return SaveTextFile(path, content).then(() => {
      if (btn) flashBtn(btn, '✓ Gespeichert', 2000);
      pushRecent(path);
      if (currentView === 'ablage') renderAblagePanel();
    });
  }).catch(err => alert(`Speichern fehlgeschlagen: ${err}`));
}

function renderAblagePanel() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const panel = el('div', 'ablage-panel');
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };

  panel.innerHTML = `
    <h2>📁 Schnell-Ablage</h2>
    <p style="color:var(--muted);font-size:13px">Text sofort als Datei speichern — ohne Editor.</p>

    <div class="ablage-toolbar">
      <button class="btn-action" id="btn-clear">🗑 Leeren</button>
    </div>

    <div class="ablage-name-row">
      <label>Dateiname:</label>
      <input class="form-input" id="ablage-name" value="notiz-${stamp()}.txt"/>
    </div>

    <textarea class="ablage-textarea" id="ablage-text"
      placeholder="Text hier eingeben oder aus Zwischenablage einfügen…"></textarea>

    <div>
      <div class="section-label" style="margin-bottom:8px">Zwischenablage (Linux)</div>
      <div class="clipboard-row">
        <button class="btn-action" id="btn-paste-cb">📋 CLIPBOARD (Ctrl+C)</button>
        <button class="btn-action" id="btn-paste-pri">✂️ PRIMARY (Maus-Selektion)</button>
      </div>
    </div>

    <button class="btn-save" id="btn-ablage-save">💾 Als Datei speichern…</button>

    ${recentSaves.length ? `
    <div>
      <div class="section-label" style="margin-bottom:6px">Zuletzt gespeichert</div>
      <div class="recent-list">
        ${recentSaves.slice(0,8).map(r => `
          <div class="recent-item">
            <span class="recent-name">${escHtml(r.name)}</span>
            <span class="recent-path">${escHtml(r.path)}</span>
            <span class="recent-time">${timeAgo(r.time)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}`;

  main.appendChild(panel);

  const textarea = panel.querySelector('#ablage-text');
  panel.querySelector('#btn-clear').onclick = () => { textarea.value = ''; };

  const pasteFrom = sel => {
    GetClipboard(sel)
      .then(text => { textarea.value += text; })
      .catch(() => {
        // fallback to browser API
        navigator.clipboard.readText()
          .then(t => { textarea.value += t; })
          .catch(() => alert('Kein Zugriff auf Zwischenablage. Bitte xclip oder xsel installieren.'));
      });
  };
  panel.querySelector('#btn-paste-cb').onclick  = () => pasteFrom('clipboard');
  panel.querySelector('#btn-paste-pri').onclick = () => pasteFrom('primary');

  panel.querySelector('#btn-ablage-save').onclick = () => {
    const content = textarea.value;
    const name    = panel.querySelector('#ablage-name').value.trim() || `notiz-${stamp()}.txt`;
    if (!content.trim()) { alert('Nichts zu speichern.'); return; }
    saveViaDialog(name, content, panel.querySelector('#btn-ablage-save'));
  };
}

// ── Export panel ───────────────────────────────────────────────────────────
function renderExportPanel() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="export-panel">
      <h2>📤 Export &amp; Backup</h2>

      <div class="export-section-head">Struktur-Export (keine Passwörter)</div>
      <p style="color:var(--muted);font-size:12px;margin-bottom:8px">Nur Namen und Ordner — sicher zum Teilen oder Dokumentieren.</p>

      <div class="export-card">
        <div class="export-card-icon">📝</div>
        <div class="export-card-body">
          <h3>Markdown</h3>
          <p>Übersicht als Markdown-Dokument.</p>
          <div class="export-btns">
            <button class="btn-export" id="btn-md-copy">In Zwischenablage</button>
            <button class="btn-export" id="btn-md-save">Als Datei…</button>
          </div>
        </div>
      </div>

      <div class="export-card">
        <div class="export-card-icon">📊</div>
        <div class="export-card-body">
          <h3>CSV</h3>
          <p>Name, Pfad, Ordner — kompatibel mit Tabellenkalkulationen.</p>
          <div class="export-btns">
            <button class="btn-export" id="btn-csv-copy">In Zwischenablage</button>
            <button class="btn-export" id="btn-csv-save">Als Datei…</button>
          </div>
        </div>
      </div>

      <div class="export-section-head backup-head">🔒 Verschlüsseltes Vollbackup</div>
      <p style="color:var(--muted);font-size:12px;margin-bottom:8px">
        Erstellt ein <strong>AES-256 verschlüsseltes Archiv</strong> des gesamten Tresors —
        inkl. aller Passwörter. Nur mit dem Backup-Passwort wiederherstellbar.
        Sicher auf USB, NAS oder Cloud ablegen.
      </p>

      <div class="export-card backup-card">
        <div class="export-card-icon">💾</div>
        <div class="export-card-body">
          <h3>Backup erstellen</h3>
          <p>Verschlüsselt den ganzen <code>~/.password-store</code> als <code>.tar.gz.gpg</code>.</p>
          <div class="backup-pw-row">
            <input class="form-input" type="password" id="bp-pw1" placeholder="Backup-Passwort…" autocomplete="new-password"/>
            <input class="form-input" type="password" id="bp-pw2" placeholder="Wiederholen…"     autocomplete="new-password"/>
          </div>
          <div id="bp-err" class="backup-err" style="display:none"></div>
          <div class="export-btns" style="margin-top:8px">
            <button class="btn-backup" id="btn-backup">💾 Backup erstellen…</button>
          </div>
        </div>
      </div>

      <div class="export-card restore-card">
        <div class="export-card-icon">📥</div>
        <div class="export-card-body">
          <h3>Backup wiederherstellen</h3>
          <p>Entschlüsselt ein bestehendes <code>.tar.gz.gpg</code> Backup und stellt den Tresor wieder her.</p>
          <div class="backup-file-row">
            <button class="btn-export" id="btn-pick-file">📂 Datei auswählen…</button>
            <span class="backup-file-name" id="restore-file-name">Keine Datei gewählt</span>
          </div>
          <input class="form-input" type="password" id="rs-pw" placeholder="Backup-Passwort…" style="margin-top:8px" autocomplete="current-password"/>
          <div class="backup-warn">
            ⚠️ Vorhandene Einträge werden überschrieben. Der aktuelle Tresor bleibt erhalten sofern Einträge nicht im Backup enthalten sind.
          </div>
          <div id="rs-err" class="backup-err" style="display:none"></div>
          <div class="export-btns" style="margin-top:8px">
            <button class="btn-restore" id="btn-restore" disabled>📥 Wiederherstellen</button>
          </div>
        </div>
      </div>
    </div>`;

  // Structure exports
  main.querySelector('#btn-md-copy').onclick  = () => ExportMarkdown().then(d => { navigator.clipboard.writeText(d); flashBtn(main.querySelector('#btn-md-copy'), '✓', 2000); });
  main.querySelector('#btn-md-save').onclick  = () => ExportMarkdown().then(d => saveViaDialog('oberlicht-export.md',  d, main.querySelector('#btn-md-save')));
  main.querySelector('#btn-csv-copy').onclick = () => ExportCSV().then(d => { navigator.clipboard.writeText(d); flashBtn(main.querySelector('#btn-csv-copy'), '✓', 2000); });
  main.querySelector('#btn-csv-save').onclick = () => ExportCSV().then(d => saveViaDialog('oberlicht-export.csv', d, main.querySelector('#btn-csv-save')));

  // Backup
  main.querySelector('#btn-backup').onclick = () => {
    const pw1 = main.querySelector('#bp-pw1').value;
    const pw2 = main.querySelector('#bp-pw2').value;
    const errEl = main.querySelector('#bp-err');
    errEl.style.display = 'none';
    if (!pw1) { showBackupErr(errEl, 'Bitte ein Backup-Passwort eingeben.'); return; }
    if (pw1 !== pw2) { showBackupErr(errEl, 'Passwörter stimmen nicht überein.'); return; }
    const ts   = new Date().toISOString().slice(0,10);
    const name = `oberlicht-backup-${ts}.tar.gz.gpg`;
    ShowSaveDialog(name).then(path => {
      if (!path) return;
      const btn = main.querySelector('#btn-backup');
      btn.textContent = '⏳ Wird erstellt…'; btn.disabled = true;
      return BackupStore(path, pw1)
        .then(() => {
          btn.textContent = '✓ Backup erstellt';
          setTimeout(() => { btn.textContent = '💾 Backup erstellen…'; btn.disabled = false; }, 3000);
          main.querySelector('#bp-pw1').value = '';
          main.querySelector('#bp-pw2').value = '';
        })
        .catch(err => {
          btn.textContent = '💾 Backup erstellen…'; btn.disabled = false;
          showBackupErr(errEl, `Fehler: ${err}`);
        });
    });
  };

  // Restore — file picker
  let restoreFilePath = '';
  main.querySelector('#btn-pick-file').onclick = () => {
    ShowOpenDialog('Backup-Datei wählen').then(path => {
      if (!path) return;
      restoreFilePath = path;
      const fname = path.split('/').pop();
      main.querySelector('#restore-file-name').textContent = fname;
      main.querySelector('#btn-restore').disabled = false;
    });
  };

  main.querySelector('#btn-restore').onclick = () => {
    const pw    = main.querySelector('#rs-pw').value;
    const errEl = main.querySelector('#rs-err');
    errEl.style.display = 'none';
    if (!restoreFilePath) { showBackupErr(errEl, 'Bitte zuerst eine Backup-Datei wählen.'); return; }
    if (!pw) { showBackupErr(errEl, 'Bitte das Backup-Passwort eingeben.'); return; }
    const btn = main.querySelector('#btn-restore');
    btn.textContent = '⏳ Wird wiederhergestellt…'; btn.disabled = true;
    RestoreStore(restoreFilePath, pw)
      .then(() => {
        btn.textContent = '✓ Wiederhergestellt';
        main.querySelector('#rs-pw').value = '';
        restoreFilePath = '';
        main.querySelector('#restore-file-name').textContent = 'Keine Datei gewählt';
        setTimeout(() => { btn.textContent = '📥 Wiederherstellen'; btn.disabled = true; }, 3000);
        return reloadList();
      })
      .catch(err => {
        btn.textContent = '📥 Wiederherstellen'; btn.disabled = false;
        showBackupErr(errEl, `Fehler: ${err}`);
      });
  };
}

function showBackupErr(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

// ── CRUD Modal ─────────────────────────────────────────────────────────────
async function openModal(entry, details) {
  const isNew   = !entry;
  const oldPath = isNew ? '' : entry.fullPath;
  const folders = await GetFolders().catch(() => []);
  let initFolder = '', initName = '';
  if (!isNew) {
    const parts = entry.fullPath.split('/');
    initName   = parts.at(-1);
    initFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${isNew ? '🆕 Neuer Eintrag' : '✏️ Bearbeiten'}</h2>
      ${isNew ? `
      <div class="form-group">
        <label class="form-label">Typ</label>
        <div class="type-selector">
          <button class="type-btn active" data-type="password">🔑 Passwort</button>
          <button class="type-btn" data-type="ssh">🔐 SSH-Schlüsselpaar</button>
        </div>
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">Pfad</label>
        <div class="path-split">
          <input class="form-input" id="f-folder" list="fl" placeholder="Ordner (optional)" value="${escHtml(initFolder)}"/>
          <span class="path-sep">/</span>
          <input class="form-input" id="f-name" placeholder="Name" value="${escHtml(initName)}"/>
        </div>
        <datalist id="fl">${folders.map(f => `<option value="${escHtml(f)}">`).join('')}</datalist>
      </div>
      <div id="type-fields"></div>
      <div class="form-group">
        <label class="form-label">Felder</label>
        <div class="dyn-fields" id="dyn-fields"></div>
        <button class="btn-add-field" id="btn-add-field">+ Feld hinzufügen</button>
      </div>
      <div class="form-group">
        <label class="form-label">Zweck / Notizen</label>
        <textarea class="form-textarea" id="f-notes" placeholder="Wofür ist dieser Eintrag?">${escHtml(isNew ? '' : (details.notes || ''))}</textarea>
      </div>
      <div id="form-error"></div>
      <div class="modal-footer">
        <button class="btn-cancel" id="m-cancel">Abbrechen</button>
        <button class="btn-save"   id="m-save">💾 Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const dynFields = overlay.querySelector('#dyn-fields');
  const addField  = (k='', v='') => {
    const row = el('div', 'dyn-field-row');
    row.innerHTML = `
      <input class="form-input field-key" placeholder="Schlüssel" value="${escHtml(k)}"/>
      <input class="form-input field-val" placeholder="Wert"      value="${escHtml(v)}"/>
      <button class="btn-remove-field">✕</button>`;
    row.querySelector('.btn-remove-field').onclick = () => row.remove();
    dynFields.appendChild(row);
  };
  (details?.fields || []).forEach(f => addField(f.key, f.value));
  overlay.querySelector('#btn-add-field').onclick = () => addField();

  let entryType = 'password';
  const typeFields = overlay.querySelector('#type-fields');

  const renderTypeFields = () => {
    const pwVal = isNew ? '' : (details?.password || '');
    if (entryType === 'password') {
      typeFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Passwort</label>
          <div class="pw-gen-row">
            <input class="form-input mono" id="f-pw" type="text" value="${escHtml(pwVal)}" placeholder="Passwort…"/>
            <button class="btn-gen" id="m-gen">🎲</button>
          </div>
          <label class="checkbox-row" style="margin-top:4px">
            <input type="checkbox" id="f-sym" checked/> Sonderzeichen
          </label>
        </div>`;
      overlay.querySelector('#m-gen').onclick = () => {
        const sym = overlay.querySelector('#f-sym').checked;
        GeneratePasswordAdvanced({ ...genOpts, symbols: sym }).then(pw => { overlay.querySelector('#f-pw').value = pw; });
      };
    } else {
      typeFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">SSH-Schlüsseltyp</label>
          <div class="ssh-row">
            <select id="f-ssh-type" class="form-input" style="width:auto">
              <option value="ed25519">Ed25519</option>
              <option value="rsa">RSA 4096</option>
            </select>
            <input class="form-input" id="f-ssh-com" placeholder="user@host" style="flex:1"/>
            <button class="btn-gen" id="m-gen-ssh">Generieren</button>
          </div>
          <div id="m-ssh-res" style="display:none;margin-top:8px">
            <div class="section-label" style="margin-bottom:4px">Privater Schlüssel (wird gespeichert)</div>
            <div class="key-block" id="m-ssh-priv" style="max-height:80px"></div>
          </div>
        </div>`;
      overlay.querySelector('#m-gen-ssh').onclick = () => {
        const b  = overlay.querySelector('#m-gen-ssh');
        const t2 = overlay.querySelector('#f-ssh-type').value;
        const c2 = overlay.querySelector('#f-ssh-com').value || 'oberlicht';
        b.textContent = '…'; b.disabled = true;
        GenerateSSHKeyPair(t2, c2).then(pair => {
          overlay.querySelector('#m-ssh-priv').textContent = pair.privateKey;
          overlay.querySelector('#m-ssh-res').style.display = 'block';
          addField('public-key', pair.publicKey);
          b.textContent = 'Neu'; b.disabled = false;
        }).catch(err => { alert(`SSH: ${err}`); b.textContent = 'Generieren'; b.disabled = false; });
      };
    }
  };
  renderTypeFields();

  if (isNew) {
    overlay.querySelectorAll('.type-btn').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        entryType = btn.dataset.type;
        renderTypeFields();
      };
    });
  }

  overlay.querySelector('#m-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#m-save').onclick = () => {
    const errEl  = overlay.querySelector('#form-error');
    errEl.innerHTML = '';
    const folder = overlay.querySelector('#f-folder').value.trim();
    const name   = overlay.querySelector('#f-name').value.trim();
    if (!name) { errEl.innerHTML = '<div class="form-error">Name darf nicht leer sein.</div>'; return; }
    const newPath = folder ? `${folder}/${name}` : name;
    let pw = '';
    if (entryType === 'password') {
      pw = overlay.querySelector('#f-pw')?.value || '';
      if (!pw) { errEl.innerHTML = '<div class="form-error">Passwort darf nicht leer sein.</div>'; return; }
    } else {
      pw = overlay.querySelector('#m-ssh-priv')?.textContent || '';
      if (!pw) { errEl.innerHTML = '<div class="form-error">Bitte SSH-Schlüsselpaar generieren.</div>'; return; }
    }
    const fields = [];
    overlay.querySelectorAll('.dyn-field-row').forEach(row => {
      const k = row.querySelector('.field-key').value.trim();
      const v = row.querySelector('.field-val').value.trim();
      if (k) fields.push({ key: k, value: v });
    });
    const data = { fullPath: newPath, password: pw, fields, notes: overlay.querySelector('#f-notes').value };
    const saveBtn = overlay.querySelector('#m-save');
    saveBtn.disabled = true; saveBtn.textContent = 'Speichert…';
    (isNew ? CreateEntry(data) : UpdateEntry(oldPath, data))
      .then(() => { overlay.remove(); return ListPasswords(); })
      .then(entries => {
        allEntries = entries || [];
        renderList(allEntries);
        setTimeout(() => {
          const row = document.querySelector(`.entry-row[data-path="${data.fullPath}"]`);
          if (row) row.click();
        }, 100);
      })
      .catch(err => {
        errEl.innerHTML = `<div class="form-error">Fehler: ${err}</div>`;
        saveBtn.disabled = false; saveBtn.textContent = '💾 Speichern';
      });
  };

  overlay.querySelector('#f-name').focus();
}

// ── Delete confirm ─────────────────────────────────────────────────────────
function confirmDelete(entry) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <h3>🗑 Eintrag löschen?</h3>
      <p><strong>${escHtml(entry.fullPath)}</strong> wird unwiderruflich gelöscht.</p>
      <div class="confirm-footer">
        <button class="btn-cancel" id="d-no">Abbrechen</button>
        <button class="btn-delete" id="d-yes">Löschen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#d-no').onclick  = () => overlay.remove();
  overlay.querySelector('#d-yes').onclick = () => {
    DeleteEntry(entry.fullPath).then(() => {
      overlay.remove();
      activeEntry = null; activeDetails = null;
      showEmptyState();
      return ListPasswords();
    }).then(entries => { allEntries = entries || []; renderList(allEntries); })
      .catch(err => alert(`Fehler: ${err}`));
  };
}

// ── New entry ──────────────────────────────────────────────────────────────
document.getElementById('btn-new').onclick = () => openModal(null, null);

// ── Helpers ────────────────────────────────────────────────────────────────
function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
function mask(pw) { return '●'.repeat(Math.min(pw?.length ?? 12, 24)); }
function pad(n) { return String(n).padStart(2, '0'); }
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓'; btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
    scheduleClipClear();
  });
}
function flashBtn(btn, label, ms) {
  const orig = btn.innerHTML;
  btn.innerHTML = label; btn.classList.add('copied');
  setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, ms);
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `${Math.floor(s/60)} Min.`;
  if (s < 86400) return `${Math.floor(s/3600)} Std.`;
  return `${Math.floor(s/86400)} Tage`;
}

// ── System panel ───────────────────────────────────────────────────────────
let cachedDeps = null;

const CLIP_CLEAR_OPTIONS = [
  { value: '0',    label: 'Nie' },
  { value: '30',   label: '30 Sekunden' },
  { value: '45',   label: '45 Sekunden' },
  { value: '60',   label: '1 Minute' },
  { value: '120',  label: '2 Minuten' },
  { value: '300',  label: '5 Minuten' },
  { value: '600',  label: '10 Minuten' },
];

async function renderSystemPanel() {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="system-panel"><h2>⚙️ System &amp; Einstellungen</h2><div class="sys-loading">Prüfe…</div></div>`;
  const deps = cachedDeps || await CheckDependencies().catch(() => []);
  cachedDeps = deps;

  const autofillDelay = parseInt(localStorage.getItem('autofill-delay-s') || '2', 10);
  const clipClear     = localStorage.getItem('clip-clear-s') || '45';

  const depRows = deps.map(d => `
    <tr>
      <td><span class="dep-status ${d.available ? 'dep-ok' : (d.required ? 'dep-err' : 'dep-warn')}">
        ${d.available ? '✓' : '✗'}
      </span></td>
      <td><code>${escHtml(d.name)}</code></td>
      <td style="color:var(--muted);font-size:12px">${escHtml(d.description)}</td>
      <td style="font-size:11px;color:${d.required ? 'var(--danger)' : 'var(--muted)'}">
        ${d.required ? 'Pflicht' : 'Optional'}
      </td>
    </tr>`).join('');

  const clipOpts = CLIP_CLEAR_OPTIONS.map(o =>
    `<option value="${o.value}" ${clipClear === o.value ? 'selected' : ''}>${escHtml(o.label)}</option>`
  ).join('');

  main.innerHTML = `
    <div class="system-panel">
      <h2>⚙️ System &amp; Einstellungen</h2>

      <div class="sys-section">
        <div class="section-label" style="margin-bottom:8px">Systemvoraussetzungen</div>
        <table class="dep-table">
          <tbody>${depRows}</tbody>
        </table>
        <button class="btn-regen" id="btn-recheck" style="margin-top:8px">🔄 Erneut prüfen</button>
      </div>

      <div class="sys-section">
        <div class="section-label" style="margin-bottom:8px">Auto-Ausfüllen</div>
        <div class="sys-row">
          <label>Standard-Pause vor dem Tippen</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" class="form-input" id="sys-af-delay"
              min="1" max="15" value="${autofillDelay}" style="width:70px"/>
            <span style="color:var(--muted);font-size:13px">Sekunden</span>
          </div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">
          Erkannte Benutzernamen-Felder: <code>${USER_FIELD_KEYS.join(', ')}</code>
        </div>
      </div>

      <div class="sys-section">
        <div class="section-label" style="margin-bottom:8px">Zwischenablage</div>
        <div class="sys-row">
          <label>Automatisch leeren nach</label>
          <select class="form-input" id="sys-clip-clear" style="width:160px">${clipOpts}</select>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.6">
          Gilt für manuelles Kopieren im Ablage-Panel.<br>
          <code>pass</code>-Kopieren (45 Sek.) wird von pass selbst gesteuert.<br>
          Auf Wayland: <code>wl-copy --clear</code> · X11: <code>xclip</code> / <code>xsel</code>
        </div>
      </div>
    </div>`;

  main.querySelector('#btn-recheck').onclick = () => { cachedDeps = null; renderSystemPanel(); };

  main.querySelector('#sys-af-delay').addEventListener('change', e => {
    const v = Math.min(15, Math.max(1, parseInt(e.target.value) || 2));
    e.target.value = v;
    localStorage.setItem('autofill-delay-s', String(v));
  });

  main.querySelector('#sys-clip-clear').addEventListener('change', e => {
    localStorage.setItem('clip-clear-s', e.target.value);
    scheduleClipClear(0); // reset any running timer
  });
}

// ── Clipboard auto-clear timer ─────────────────────────────────────────────
let _clipClearTimer = null;

function scheduleClipClear(overrideSeconds) {
  clearTimeout(_clipClearTimer);
  const secs = overrideSeconds ?? parseInt(localStorage.getItem('clip-clear-s') || '45', 10);
  if (secs <= 0) return;
  _clipClearTimer = setTimeout(() => {
    ClearClipboard().catch(() => {});
  }, secs * 1000);
}

// ── Startup dependency check ────────────────────────────────────────────────
async function checkDepsOnStartup() {
  const deps = await CheckDependencies().catch(() => []);
  cachedDeps = deps;
  const missing = deps.filter(d => d.required && !d.available);
  if (!missing.length) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="confirm-box" style="width:420px">
      <h3>⚠️ Fehlende Systemvoraussetzungen</h3>
      <p style="margin-bottom:10px">Folgende Pflicht-Tools wurden nicht gefunden:</p>
      ${missing.map(d => `
        <div class="dep-missing-row">
          <code>${escHtml(d.name)}</code>
          <span>${escHtml(d.description)}</span>
        </div>`).join('')}
      <p style="margin-top:12px;font-size:12px;color:var(--muted)">
        Bitte installieren (z.B. <code>sudo pacman -S pass gnupg</code>) und die App neu starten.
      </p>
      <div class="confirm-footer">
        <button class="btn-cancel" id="dep-ok">Verstanden</button>
        <button class="btn-export" id="dep-sys">⚙️ System-Tab öffnen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#dep-ok').onclick = () => overlay.remove();
  overlay.querySelector('#dep-sys').onclick = () => {
    overlay.remove();
    document.querySelector('.nav-tab[data-view="system"]').click();
  };
}

// ── Keyboard Navigation ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';

  // Ctrl+F → focus search
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    document.getElementById('search')?.focus();
    return;
  }

  // Ctrl+N → new entry
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    document.getElementById('btn-new')?.click();
    return;
  }

  // Escape → clear search or close modal
  if (e.key === 'Escape') {
    const modal = document.querySelector('.modal-overlay');
    if (modal) { modal.remove(); return; }
    const search = document.getElementById('search');
    if (search && search.value) { search.value = ''; search.dispatchEvent(new Event('input')); return; }
    return;
  }

  // Arrow keys / Enter → navigate entry list (only when not typing in a field)
  if (inInput) return;
  if (!['ArrowUp','ArrowDown','Enter'].includes(e.key)) return;

  const list = document.getElementById('entry-list');
  if (!list) return;
  const rows = Array.from(list.querySelectorAll('.entry-row'));
  if (!rows.length) return;

  const current = list.querySelector('.entry-row.selected');
  let idx = rows.indexOf(current);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = Math.min(idx + 1, rows.length - 1);
    rows[idx].classList.add('selected');
    if (current && current !== rows[idx]) current.classList.remove('selected');
    rows[idx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = idx <= 0 ? 0 : idx - 1;
    rows[idx].classList.add('selected');
    if (current && current !== rows[idx]) current.classList.remove('selected');
    rows[idx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && current) {
    e.preventDefault();
    current.click();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  for (let i = 0; i < 50; i++) {
    if (window.go?.main?.App) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!window.go?.main?.App) {
    document.getElementById('entry-list').innerHTML =
      '<div style="padding:16px;color:var(--danger);font-size:13px;">Wails-Laufzeit nicht geladen. Bitte App neu starten.</div>';
    return;
  }
  checkDepsOnStartup();
  try {
    allEntries = (await ListPasswords()) || [];
    renderList(allEntries);
  } catch (err) {
    document.getElementById('entry-list').innerHTML =
      `<div style="padding:16px;color:var(--danger);font-size:13px;">Fehler: ${err}</div>`;
  }
}

init();
