import './style.css';
import './app.css';
import { ListPasswords, GetPassword, CopyPassword } from '../wailsjs/go/main/App';

// ── State ──────────────────────────────────────────────────────────────────
let allEntries = [];
let activeEntry = null;

// ── Bootstrap ──────────────────────────────────────────────────────────────
document.querySelector('#app').innerHTML = `
  <div class="sidebar">
    <div class="sidebar-header">
      <span class="app-icon">🪟</span>
      <h1>Oberlicht</h1>
    </div>
    <div class="search-wrap">
      <input id="search" type="text" placeholder="Suchen…" autocomplete="off" spellcheck="false"/>
    </div>
    <div id="entry-list" class="entry-list"></div>
  </div>
  <div class="main" id="main">
    <div class="detail-empty">
      <div class="empty-icon">🔐</div>
      <p>Eintrag auswählen</p>
    </div>
  </div>
`;

// ── Tree building ──────────────────────────────────────────────────────────
function buildTree(entries) {
  const root = { children: {}, entries: [] };
  for (const entry of entries) {
    const parts = entry.fullPath.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.children[part]) {
        node.children[part] = { name: part, children: {}, entries: [] };
      }
      node = node.children[part];
    }
    node.entries.push(entry);
  }
  return root;
}

function renderTree(node, depth = 0) {
  const el = document.createDocumentFragment();

  // folders first, sorted
  for (const child of Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name))) {
    const folderWrap = document.createElement('div');

    const folderRow = document.createElement('div');
    folderRow.className = 'folder-row';
    folderRow.innerHTML = `<span class="folder-toggle">▶</span><span>📁 ${child.name}</span>`;
    folderRow.addEventListener('click', () => {
      folderRow.classList.toggle('folder-open');
      childrenEl.style.display = folderRow.classList.contains('folder-open') ? 'block' : 'none';
    });

    const childrenEl = document.createElement('div');
    childrenEl.className = 'folder-children';
    childrenEl.style.display = 'none';
    childrenEl.appendChild(renderTree(child, depth + 1));

    folderWrap.appendChild(folderRow);
    folderWrap.appendChild(childrenEl);
    el.appendChild(folderWrap);
  }

  // entries sorted
  for (const entry of [...node.entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const row = document.createElement('div');
    row.className = 'entry-row';
    row.dataset.path = entry.fullPath;
    row.innerHTML = `<span class="entry-icon">🔑</span><span class="entry-name">${entry.name}</span>`;
    row.addEventListener('click', () => selectEntry(entry, row));
    el.appendChild(row);
  }

  return el;
}

// ── Render sidebar ─────────────────────────────────────────────────────────
function renderList(entries) {
  const list = document.getElementById('entry-list');
  list.innerHTML = '';

  if (entries.length === 0) {
    list.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:13px;">Keine Einträge gefunden.</div>';
    return;
  }

  const tree = buildTree(entries);
  list.appendChild(renderTree(tree));
}

// ── Search ─────────────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    renderList(allEntries);
    return;
  }
  const filtered = allEntries.filter(en =>
    en.fullPath.toLowerCase().includes(q)
  );
  renderList(filtered);
});

// ── Select entry ───────────────────────────────────────────────────────────
function selectEntry(entry, rowEl) {
  // deactivate previous
  document.querySelectorAll('.entry-row.active').forEach(r => r.classList.remove('active'));
  rowEl.classList.add('active');
  activeEntry = entry;

  showLoading(entry);

  GetPassword(entry.fullPath)
    .then(details => showDetail(entry, details))
    .catch(err => showError(err));
}

// ── Detail rendering ───────────────────────────────────────────────────────
function showLoading(entry) {
  document.getElementById('main').innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Entschlüssele <strong>${entry.name}</strong>…</span>
    </div>`;
}

function showError(err) {
  document.getElementById('main').innerHTML = `
    <div class="error-msg">⚠️ Fehler: ${err}</div>`;
}

function showDetail(entry, details) {
  const pathParts = entry.fullPath.split('/');
  const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join(' › ') : '';

  let html = `
    <div class="detail-panel">
      ${folder ? `<div class="detail-path">${folder}</div>` : ''}
      <div class="detail-title">${entry.name}</div>

      <div class="section">
        <div class="section-label">Passwort</div>
        <div class="pw-field">
          <span class="pw-value hidden" id="pw-val">${maskPassword(details.password)}</span>
          <button class="icon-btn" id="btn-toggle" title="Anzeigen/Verbergen">👁</button>
        </div>
        <button class="btn-copy" id="btn-copy">
          📋 In Zwischenablage kopieren
        </button>
      </div>`;

  // Key-value fields
  const fields = details.fields || {};
  if (Object.keys(fields).length > 0) {
    html += `<div class="section">
      <div class="section-label">Felder</div>
      <table class="fields-table">`;
    for (const [key, val] of Object.entries(fields)) {
      const isUrl = key === 'url' || val.startsWith('http');
      html += `<tr>
        <td>${key}</td>
        <td>${isUrl ? `<span class="field-url" data-url="${val}">${val}</span>` : val}</td>
      </tr>`;
    }
    html += `</table></div>`;
  }

  // Notes
  if (details.notes) {
    html += `<div class="section">
      <div class="section-label">Notizen</div>
      <div class="notes-box">${escapeHtml(details.notes)}</div>
    </div>`;
  }

  html += `</div>`;

  document.getElementById('main').innerHTML = html;

  // Toggle password visibility
  let visible = false;
  document.getElementById('btn-toggle').addEventListener('click', () => {
    visible = !visible;
    const el = document.getElementById('pw-val');
    if (visible) {
      el.textContent = details.password;
      el.classList.remove('hidden');
    } else {
      el.textContent = maskPassword(details.password);
      el.classList.add('hidden');
    }
  });

  // Copy button
  const btnCopy = document.getElementById('btn-copy');
  btnCopy.addEventListener('click', () => {
    CopyPassword(entry.fullPath)
      .then(() => {
        btnCopy.textContent = '✓ Kopiert (45 Sek.)';
        btnCopy.classList.add('copied');
        setTimeout(() => {
          btnCopy.innerHTML = '📋 In Zwischenablage kopieren';
          btnCopy.classList.remove('copied');
        }, 3000);
      })
      .catch(err => console.error('Kopieren fehlgeschlagen:', err));
  });

  // URL click opens in browser (Wails öffnet externen Browser)
  document.querySelectorAll('.field-url').forEach(el => {
    el.addEventListener('click', () => {
      window.open(el.dataset.url, '_blank');
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function maskPassword(pw) {
  return '●'.repeat(Math.min(pw ? pw.length : 12, 20));
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ───────────────────────────────────────────────────────────────────
ListPasswords()
  .then(entries => {
    allEntries = entries || [];
    renderList(allEntries);
  })
  .catch(err => {
    document.getElementById('entry-list').innerHTML =
      `<div style="padding:16px;color:var(--danger);font-size:13px;">Fehler: ${err}</div>`;
  });
