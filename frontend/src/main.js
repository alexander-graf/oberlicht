import './style.css';
import './app.css';
import {
  ListPasswords, GetPassword, CopyPassword,
  CreateEntry, UpdateEntry, DeleteEntry,
  GeneratePasswordAdvanced, GenerateSSHKeyPair,
  GetFolders, ExportMarkdown, ExportCSV,
  OpenURL, ShowSaveDialog, SaveTextFile,
  AppendToAuthorizedKeys, GetHomeDir
} from '../wailsjs/go/main/App';

// ── State ──────────────────────────────────────────────────────────────────
let allEntries    = [];
let activeEntry   = null;
let activeDetails = null;
let currentView   = 'entries';
let homeDir       = '';

const defaultGenOpts = () => ({ length: 20, upper: true, lower: true, numbers: true, symbols: true, noAmbiguous: false });
let genOpts = defaultGenOpts();

// ── Layout ─────────────────────────────────────────────────────────────────
document.querySelector('#app').innerHTML = `
  <div class="sidebar">
    <div class="sidebar-header">
      <span class="app-icon">🪟</span>
      <h1>Oberlicht</h1>
      <button class="btn-new" id="btn-new" title="Neuer Eintrag">+</button>
    </div>
    <div class="sidebar-nav">
      <button class="nav-tab active" data-view="entries">📋 Einträge</button>
      <button class="nav-tab" data-view="generator">🎲 Generator</button>
      <button class="nav-tab" data-view="ablage">📁 Ablage</button>
      <button class="nav-tab" data-view="export">📤 Export</button>
    </div>
    <div class="search-wrap" id="search-wrap">
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

// ── Nav tabs ───────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    currentView = tab.dataset.view;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const searchWrap = document.getElementById('search-wrap');
    const entryList  = document.getElementById('entry-list');
    const btnNew     = document.getElementById('btn-new');
    const isEntries  = currentView === 'entries';

    searchWrap.style.display = isEntries ? '' : 'none';
    entryList.style.display  = isEntries ? '' : 'none';
    btnNew.style.display     = isEntries ? '' : 'none';

    if (isEntries) { showEmptyState(); return; }
    if (currentView === 'generator') renderGeneratorPanel();
    if (currentView === 'ablage')    renderAblagePanel();
    if (currentView === 'export')    renderExportPanel();
  });
});

// ── Tree ───────────────────────────────────────────────────────────────────
function buildTree(entries) {
  const root = { children: {}, entries: [] };
  for (const entry of entries) {
    const parts = entry.fullPath.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!node.children[p]) node.children[p] = { name: p, children: {}, entries: [] };
      node = node.children[p];
    }
    node.entries.push(entry);
  }
  return root;
}

function renderTree(node) {
  const frag = document.createDocumentFragment();
  for (const child of Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name))) {
    const wrap = document.createElement('div');
    const row  = document.createElement('div');
    row.className = 'folder-row';
    row.innerHTML = `<span class="folder-toggle">▶</span><span>📁 ${escHtml(child.name)}</span>`;
    const kids = document.createElement('div');
    kids.className = 'folder-children';
    kids.style.display = 'none';
    kids.appendChild(renderTree(child));
    row.addEventListener('click', () => {
      const open = row.classList.toggle('folder-open');
      kids.style.display = open ? 'block' : 'none';
    });
    wrap.appendChild(row);
    wrap.appendChild(kids);
    frag.appendChild(wrap);
  }
  for (const entry of [...node.entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const row = document.createElement('div');
    row.className = 'entry-row';
    row.dataset.path = entry.fullPath;
    row.innerHTML = `<span class="entry-icon">🔑</span><span class="entry-name">${escHtml(entry.name)}</span>`;
    row.addEventListener('click', () => selectEntry(entry, row));
    frag.appendChild(row);
  }
  return frag;
}

function renderList(entries) {
  const list = document.getElementById('entry-list');
  list.innerHTML = '';
  if (!entries.length) {
    list.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:13px;">Keine Einträge gefunden.</div>';
    return;
  }
  list.appendChild(renderTree(buildTree(entries)));
}

function showEmptyState() {
  if (!activeEntry) {
    document.getElementById('main').innerHTML = `
      <div class="detail-empty"><div class="empty-icon">🔐</div><p>Eintrag auswählen</p></div>`;
  }
}

// ── Search ─────────────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  renderList(q ? allEntries.filter(en => en.fullPath.toLowerCase().includes(q)) : allEntries);
});

// ── Select entry ───────────────────────────────────────────────────────────
function selectEntry(entry, rowEl) {
  document.querySelectorAll('.entry-row.active').forEach(r => r.classList.remove('active'));
  rowEl.classList.add('active');
  activeEntry   = entry;
  activeDetails = null;
  showLoading(entry);
  GetPassword(entry.fullPath)
    .then(details => { activeDetails = details; showDetail(entry, details); })
    .catch(err => showError(err));
}

// ── Detail view ────────────────────────────────────────────────────────────
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

  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  actions.innerHTML = `
    <button class="btn-action" id="btn-edit">✏️ Bearbeiten</button>
    <button class="btn-action" id="btn-copy-all">📄 Alles kopieren</button>
    <button class="btn-action danger" id="btn-delete-entry">🗑 Löschen</button>`;
  panel.appendChild(actions);

  const pwSec = document.createElement('div');
  pwSec.className = 'section';
  pwSec.innerHTML = `
    <div class="section-label">Passwort</div>
    <div class="pw-field">
      <span class="pw-value hidden" id="pw-val">${mask(details.password)}</span>
      <button class="icon-btn" id="btn-toggle" title="Anzeigen/Verbergen">👁</button>
      <button class="icon-btn" id="btn-copy-inline" title="Passwort kopieren">📋</button>
    </div>
    <button class="btn-copy" id="btn-copy-pass">📋 In Zwischenablage kopieren (45 Sek.)</button>`;
  panel.appendChild(pwSec);

  if (details.fields && details.fields.length) {
    const sec = document.createElement('div');
    sec.className = 'section';
    sec.innerHTML = '<div class="section-label">Felder</div>';
    const table = document.createElement('table');
    table.className = 'fields-table';
    for (const f of details.fields) {
      const tr = document.createElement('tr');
      const isUrl = f.key === 'url' || f.value.startsWith('http');
      const valHtml = isUrl
        ? `<span class="field-url" data-url="${escHtml(f.value)}">${escHtml(f.value)}</span>`
        : `<span>${escHtml(f.value)}</span>`;
      tr.innerHTML = `
        <td>${escHtml(f.key)}</td>
        <td>${valHtml}</td>
        <td class="field-copy-cell">
          <button class="field-copy-btn" data-val="${escHtml(f.value)}" title="Kopieren">📋</button>
        </td>`;
      table.appendChild(tr);
    }
    sec.appendChild(table);
    panel.appendChild(sec);
  }

  if (details.notes) {
    const sec = document.createElement('div');
    sec.className = 'section';
    sec.innerHTML = `
      <div class="section-label">Notizen / Zweck</div>
      <div class="notes-box">${escHtml(details.notes)}</div>`;
    panel.appendChild(sec);
  }

  main.appendChild(panel);

  let visible = false;
  panel.querySelector('#btn-toggle').addEventListener('click', () => {
    visible = !visible;
    const el = panel.querySelector('#pw-val');
    el.textContent = visible ? details.password : mask(details.password);
    el.classList.toggle('hidden', !visible);
  });
  panel.querySelector('#btn-copy-inline').addEventListener('click', () =>
    copyText(details.password, panel.querySelector('#btn-copy-inline'))
  );
  panel.querySelector('#btn-copy-pass').addEventListener('click', () => {
    CopyPassword(entry.fullPath)
      .then(() => flashBtn(panel.querySelector('#btn-copy-pass'), '✓ Kopiert (45 Sek.)', 3000))
      .catch(console.error);
  });
  panel.querySelector('#btn-copy-all').addEventListener('click', () =>
    copyText(buildPlainText(entry, details), panel.querySelector('#btn-copy-all'))
  );
  panel.querySelectorAll('.field-copy-btn').forEach(btn =>
    btn.addEventListener('click', () => copyText(btn.dataset.val, btn))
  );
  panel.querySelectorAll('.field-url').forEach(el =>
    el.addEventListener('click', () => OpenURL(el.dataset.url))
  );
  panel.querySelector('#btn-edit').addEventListener('click', () => openModal(entry, details));
  panel.querySelector('#btn-delete-entry').addEventListener('click', () => confirmDelete(entry));
}

function buildPlainText(entry, details) {
  let out = `=== ${entry.fullPath} ===\nPasswort: ${details.password}\n`;
  for (const f of (details.fields || [])) out += `${f.key}: ${f.value}\n`;
  if (details.notes) out += `\nNotizen:\n${details.notes}\n`;
  return out;
}

// ── Generator panel ────────────────────────────────────────────────────────
function renderGeneratorPanel() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'gen-panel';
  panel.innerHTML = `
    <h2>🎲 Passwort-Generator</h2>

    <div class="section">
      <div class="section-label" style="margin-bottom:10px">Zeichensatz</div>
      <div class="gen-options">
        <button class="toggle-btn ${genOpts.upper       ? 'on':''}" data-opt="upper">A–Z Großbuchstaben</button>
        <button class="toggle-btn ${genOpts.lower       ? 'on':''}" data-opt="lower">a–z Kleinbuchstaben</button>
        <button class="toggle-btn ${genOpts.numbers     ? 'on':''}" data-opt="numbers">0–9 Zahlen</button>
        <button class="toggle-btn ${genOpts.symbols     ? 'on':''}" data-opt="symbols">!@# Sonderzeichen</button>
        <button class="toggle-btn ${genOpts.noAmbiguous ? 'on':''}" data-opt="noAmbiguous" style="grid-column:span 2">
          Keine ähnlichen Zeichen (0, O, l, 1, I)
        </button>
      </div>
    </div>

    <div class="section">
      <div class="section-label" style="margin-bottom:8px">Länge</div>
      <div class="len-row">
        <input type="range" id="gen-length" min="4" max="64" value="${genOpts.length}"/>
        <span class="len-display" id="len-display">${genOpts.length}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-label" style="margin-bottom:8px">Ergebnis</div>
      <div class="gen-result" id="gen-result">—</div>
      <div class="gen-actions" style="margin-top:10px">
        <button class="btn-regen" id="btn-regen">🔄 Neu generieren</button>
        <button class="btn-copy" id="btn-copy-gen" style="margin-top:0">📋 Kopieren</button>
      </div>
    </div>

    <div class="section">
      <h3 style="margin-bottom:12px">🔐 SSH-Schlüsselpaar</h3>
      <div class="ssh-section">
        <div class="ssh-row">
          <select id="ssh-type">
            <option value="ed25519">Ed25519 (empfohlen)</option>
            <option value="rsa">RSA 4096</option>
          </select>
          <input class="form-input" id="ssh-comment" placeholder="Kommentar (z.B. user@host)" style="flex:1"/>
          <button class="btn-gen" id="btn-gen-ssh">Generieren</button>
        </div>
        <div id="ssh-result" style="display:none">
          <div class="section-label" style="margin-bottom:4px">Privater Schlüssel</div>
          <div class="key-block" id="ssh-priv"></div>
          <div style="display:flex;gap:8px;margin:6px 0 14px">
            <button class="field-copy-btn" id="btn-copy-priv" style="opacity:1">📋 Kopieren</button>
            <button class="field-copy-btn" id="btn-save-priv" style="opacity:1">💾 Als Datei speichern</button>
          </div>
          <div class="section-label" style="margin-bottom:4px">Öffentlicher Schlüssel</div>
          <div class="key-block" id="ssh-pub"></div>
          <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
            <button class="field-copy-btn" id="btn-copy-pub" style="opacity:1">📋 Kopieren</button>
            <button class="field-copy-btn" id="btn-save-pub" style="opacity:1">💾 Als Datei speichern</button>
            <button class="field-copy-btn" id="btn-auth-keys" style="opacity:1">🔑 → authorized_keys</button>
          </div>
        </div>
      </div>
    </div>`;
  main.appendChild(panel);

  panel.querySelectorAll('.toggle-btn[data-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      genOpts[btn.dataset.opt] = !genOpts[btn.dataset.opt];
      btn.classList.toggle('on', genOpts[btn.dataset.opt]);
      doGenerate();
    });
  });

  const slider  = panel.querySelector('#gen-length');
  const lenDisp = panel.querySelector('#len-display');
  slider.addEventListener('input', () => {
    genOpts.length = parseInt(slider.value);
    lenDisp.textContent = genOpts.length;
    doGenerate();
  });

  const doGenerate = () => {
    GeneratePasswordAdvanced(genOpts)
      .then(pw => { panel.querySelector('#gen-result').textContent = pw; })
      .catch(err => { panel.querySelector('#gen-result').textContent = `Fehler: ${err}`; });
  };

  panel.querySelector('#btn-regen').addEventListener('click', doGenerate);
  panel.querySelector('#btn-copy-gen').addEventListener('click', () => {
    const val = panel.querySelector('#gen-result').textContent;
    if (val && val !== '—') copyText(val, panel.querySelector('#btn-copy-gen'));
  });

  // SSH keygen
  panel.querySelector('#btn-gen-ssh').addEventListener('click', () => {
    const btn     = panel.querySelector('#btn-gen-ssh');
    const keyType = panel.querySelector('#ssh-type').value;
    const comment = panel.querySelector('#ssh-comment').value || 'oberlicht';
    btn.textContent = '…'; btn.disabled = true;
    GenerateSSHKeyPair(keyType, comment).then(pair => {
      panel.querySelector('#ssh-priv').textContent = pair.privateKey;
      panel.querySelector('#ssh-pub').textContent  = pair.publicKey;
      panel.querySelector('#ssh-result').style.display = 'block';
      btn.textContent = 'Neu generieren'; btn.disabled = false;

      panel.querySelector('#btn-copy-priv').onclick = () =>
        copyText(pair.privateKey, panel.querySelector('#btn-copy-priv'));
      panel.querySelector('#btn-copy-pub').onclick = () =>
        copyText(pair.publicKey, panel.querySelector('#btn-copy-pub'));

      panel.querySelector('#btn-save-priv').onclick = () =>
        saveViaDialog(`id_${keyType}`, pair.privateKey, panel.querySelector('#btn-save-priv'));
      panel.querySelector('#btn-save-pub').onclick = () =>
        saveViaDialog(`id_${keyType}.pub`, pair.publicKey, panel.querySelector('#btn-save-pub'));

      panel.querySelector('#btn-auth-keys').onclick = () => {
        const b = panel.querySelector('#btn-auth-keys');
        AppendToAuthorizedKeys(pair.publicKey)
          .then(() => flashBtn(b, '✓ Eingetragen', 2000))
          .catch(err => alert(`Fehler: ${err}`));
      };
    }).catch(err => { alert(`SSH-Fehler: ${err}`); btn.textContent = 'Generieren'; btn.disabled = false; });
  });

  doGenerate();
}

// ── Ablage panel ───────────────────────────────────────────────────────────
const recentSaves = JSON.parse(localStorage.getItem('ablage-recent') || '[]');

function saveViaDialog(defaultName, content, btn) {
  ShowSaveDialog(defaultName).then(path => {
    if (!path) return;
    return SaveTextFile(path, content).then(() => {
      if (btn) flashBtn(btn, '✓ Gespeichert', 2000);
      pushRecent(path);
    });
  }).catch(err => alert(`Speichern fehlgeschlagen: ${err}`));
}

function pushRecent(path) {
  const name = path.split('/').pop();
  const item = { name, path, time: Date.now() };
  const idx  = recentSaves.findIndex(r => r.path === path);
  if (idx !== -1) recentSaves.splice(idx, 1);
  recentSaves.unshift(item);
  if (recentSaves.length > 20) recentSaves.pop();
  localStorage.setItem('ablage-recent', JSON.stringify(recentSaves));
}

function renderAblagePanel() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'ablage-panel';

  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  panel.innerHTML = `
    <h2>📁 Schnell-Ablage</h2>
    <p style="color:var(--muted);font-size:13px">Text sofort als Datei speichern — ohne Editor, ohne Ordner-Suche.</p>

    <div class="ablage-toolbar">
      <button class="btn-action" id="btn-paste-clip">📋 Aus Zwischenablage einfügen</button>
      <button class="btn-action" id="btn-clear-ablage">🗑 Leeren</button>
    </div>

    <div class="ablage-name-row">
      <label>Dateiname:</label>
      <input class="form-input" id="ablage-name" value="notiz-${stamp()}.txt" style="flex:1"/>
    </div>

    <textarea class="ablage-textarea" id="ablage-text" placeholder="Text hier eingeben oder einfügen…"></textarea>

    <div class="ablage-save-row">
      <button class="btn-save" id="btn-ablage-save">💾 Als Datei speichern…</button>
    </div>

    ${recentSaves.length ? `
    <div>
      <div class="section-label" style="margin-bottom:8px">Zuletzt gespeichert</div>
      <div class="recent-list" id="recent-list">
        ${recentSaves.slice(0,8).map(r => `
          <div class="recent-item">
            <span class="recent-name">${escHtml(r.name)}</span>
            <span class="recent-path">${escHtml(r.path)}</span>
            <span class="recent-time">${timeAgo(r.time)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}`;

  main.appendChild(panel);

  panel.querySelector('#btn-paste-clip').addEventListener('click', () => {
    navigator.clipboard.readText()
      .then(text => { panel.querySelector('#ablage-text').value = text; })
      .catch(() => alert('Kein Zugriff auf Zwischenablage'));
  });

  panel.querySelector('#btn-clear-ablage').addEventListener('click', () => {
    panel.querySelector('#ablage-text').value = '';
  });

  panel.querySelector('#btn-ablage-save').addEventListener('click', () => {
    const content = panel.querySelector('#ablage-text').value;
    const name    = panel.querySelector('#ablage-name').value.trim() || `notiz-${stamp()}.txt`;
    if (!content) { alert('Nichts zu speichern.'); return; }
    saveViaDialog(name, content, panel.querySelector('#btn-ablage-save'));
  });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `${Math.floor(s/60)} Min. ago`;
  if (s < 86400) return `${Math.floor(s/3600)} Std. ago`;
  return `${Math.floor(s/86400)} Tage ago`;
}

// ── Export panel ───────────────────────────────────────────────────────────
function renderExportPanel() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="export-panel">
      <h2>📤 Export</h2>
      <p style="color:var(--muted);font-size:13px">Nur Struktur und Namen — keine Passwörter.</p>

      <div class="export-card">
        <div class="export-card-icon">📝</div>
        <div class="export-card-body">
          <h3>Markdown</h3>
          <p>Übersicht aller Einträge als strukturiertes Markdown-Dokument.</p>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button class="btn-export" id="btn-export-md-copy">In Zwischenablage</button>
            <button class="btn-export" id="btn-export-md-save">Als Datei speichern…</button>
          </div>
        </div>
      </div>

      <div class="export-card">
        <div class="export-card-icon">📊</div>
        <div class="export-card-body">
          <h3>CSV</h3>
          <p>Flache Liste mit Name, Pfad und Ordner.</p>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button class="btn-export" id="btn-export-csv-copy">In Zwischenablage</button>
            <button class="btn-export" id="btn-export-csv-save">Als Datei speichern…</button>
          </div>
        </div>
      </div>
    </div>`;

  main.querySelector('#btn-export-md-copy').addEventListener('click', () => {
    const btn = main.querySelector('#btn-export-md-copy');
    ExportMarkdown().then(md => { navigator.clipboard.writeText(md); flashBtn(btn, '✓ Kopiert!', 2000); });
  });
  main.querySelector('#btn-export-md-save').addEventListener('click', () => {
    const btn = main.querySelector('#btn-export-md-save');
    ExportMarkdown().then(md => saveViaDialog('oberlicht-export.md', md, btn));
  });
  main.querySelector('#btn-export-csv-copy').addEventListener('click', () => {
    const btn = main.querySelector('#btn-export-csv-copy');
    ExportCSV().then(csv => { navigator.clipboard.writeText(csv); flashBtn(btn, '✓ Kopiert!', 2000); });
  });
  main.querySelector('#btn-export-csv-save').addEventListener('click', () => {
    const btn = main.querySelector('#btn-export-csv-save');
    ExportCSV().then(csv => saveViaDialog('oberlicht-export.csv', csv, btn));
  });
}

// ── CRUD Modal ─────────────────────────────────────────────────────────────
async function openModal(entry, details) {
  const isNew   = !entry;
  const oldPath = isNew ? '' : entry.fullPath;
  const folders = await GetFolders().catch(() => []);

  let initFolder = '', initName = '';
  if (!isNew) {
    const parts = entry.fullPath.split('/');
    initName   = parts[parts.length - 1];
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
          <input class="form-input" id="f-folder" list="folder-datalist"
            placeholder="Ordner (optional)" value="${escHtml(initFolder)}"/>
          <span class="path-sep">/</span>
          <input class="form-input" id="f-name" placeholder="Name" value="${escHtml(initName)}"/>
        </div>
        <datalist id="folder-datalist">
          ${folders.map(f => `<option value="${escHtml(f)}">`).join('')}
        </datalist>
      </div>

      <div id="type-fields"></div>

      <div class="form-group">
        <label class="form-label">Felder</label>
        <div class="dyn-fields" id="dyn-fields"></div>
        <button class="btn-add-field" id="btn-add-field">+ Feld hinzufügen</button>
      </div>

      <div class="form-group">
        <label class="form-label">Zweck / Notizen</label>
        <textarea class="form-textarea" id="f-notes"
          placeholder="Wofür ist dieser Eintrag? Kontext, Hinweise…">${escHtml(isNew ? '' : (details.notes || ''))}</textarea>
      </div>

      <div id="form-error"></div>

      <div class="modal-footer">
        <button class="btn-cancel" id="btn-cancel-modal">Abbrechen</button>
        <button class="btn-save"   id="btn-save-modal">💾 Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const dynFields = overlay.querySelector('#dyn-fields');
  const addFieldRow = (key = '', value = '') => {
    const row = document.createElement('div');
    row.className = 'dyn-field-row';
    row.innerHTML = `
      <input class="form-input field-key" placeholder="Schlüssel" value="${escHtml(key)}"/>
      <input class="form-input field-val" placeholder="Wert" value="${escHtml(value)}"/>
      <button class="btn-remove-field">✕</button>`;
    row.querySelector('.btn-remove-field').addEventListener('click', () => row.remove());
    dynFields.appendChild(row);
  };
  (details?.fields || []).forEach(f => addFieldRow(f.key, f.value));
  overlay.querySelector('#btn-add-field').addEventListener('click', () => addFieldRow());

  let entryType = 'password';
  const typeFields = overlay.querySelector('#type-fields');

  const renderTypeFields = () => {
    const pwVal = isNew ? '' : (details?.password || '');
    if (entryType === 'password') {
      typeFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Passwort</label>
          <div class="pw-gen-row">
            <input class="form-input mono" id="f-pw" type="text"
              value="${escHtml(pwVal)}" placeholder="Passwort eingeben…"/>
            <button class="btn-gen" id="btn-gen-pw">🎲 Generieren</button>
          </div>
          <label class="checkbox-row" style="margin-top:4px">
            <input type="checkbox" id="f-symbols" checked/> Sonderzeichen
          </label>
        </div>`;
      overlay.querySelector('#btn-gen-pw').addEventListener('click', () => {
        const sym = overlay.querySelector('#f-symbols').checked;
        GeneratePasswordAdvanced({ ...genOpts, symbols: sym })
          .then(pw => { overlay.querySelector('#f-pw').value = pw; });
      });
    } else {
      typeFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">SSH-Schlüsseltyp</label>
          <div class="ssh-row">
            <select id="f-ssh-type" class="form-input" style="width:auto">
              <option value="ed25519">Ed25519 (empfohlen)</option>
              <option value="rsa">RSA 4096</option>
            </select>
            <input class="form-input" id="f-ssh-comment" placeholder="Kommentar (user@host)" style="flex:1"/>
            <button class="btn-gen" id="btn-gen-ssh-modal">Generieren</button>
          </div>
          <div id="ssh-modal-result" style="display:none;margin-top:10px">
            <div class="section-label" style="margin-bottom:4px">Privater Schlüssel (wird gespeichert)</div>
            <div class="key-block" id="ssh-modal-priv" style="max-height:80px"></div>
          </div>
        </div>`;
      overlay.querySelector('#btn-gen-ssh-modal').addEventListener('click', () => {
        const btn  = overlay.querySelector('#btn-gen-ssh-modal');
        const type = overlay.querySelector('#f-ssh-type').value;
        const com  = overlay.querySelector('#f-ssh-comment').value || 'oberlicht';
        btn.textContent = '…'; btn.disabled = true;
        GenerateSSHKeyPair(type, com).then(pair => {
          overlay.querySelector('#ssh-modal-priv').textContent = pair.privateKey;
          overlay.querySelector('#ssh-modal-result').style.display = 'block';
          addFieldRow('public-key', pair.publicKey);
          btn.textContent = 'Neu generieren'; btn.disabled = false;
        }).catch(err => { alert(`SSH-Fehler: ${err}`); btn.textContent = 'Generieren'; btn.disabled = false; });
      });
    }
  };
  renderTypeFields();

  if (isNew) {
    overlay.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        entryType = btn.dataset.type;
        renderTypeFields();
      });
    });
  }

  overlay.querySelector('#btn-cancel-modal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#btn-save-modal').addEventListener('click', () => {
    const errEl = overlay.querySelector('#form-error');
    errEl.innerHTML = '';
    const folder  = overlay.querySelector('#f-folder').value.trim();
    const name    = overlay.querySelector('#f-name').value.trim();
    if (!name) { errEl.innerHTML = '<div class="form-error">Name darf nicht leer sein.</div>'; return; }

    const newPath = folder ? `${folder}/${name}` : name;
    let pw = '';
    if (entryType === 'password') {
      pw = overlay.querySelector('#f-pw')?.value || '';
      if (!pw) { errEl.innerHTML = '<div class="form-error">Passwort darf nicht leer sein.</div>'; return; }
    } else {
      pw = overlay.querySelector('#ssh-modal-priv')?.textContent || '';
      if (!pw) { errEl.innerHTML = '<div class="form-error">Bitte zuerst ein SSH-Schlüsselpaar generieren.</div>'; return; }
    }

    const fields = [];
    overlay.querySelectorAll('.dyn-field-row').forEach(row => {
      const k = row.querySelector('.field-key').value.trim();
      const v = row.querySelector('.field-val').value.trim();
      if (k) fields.push({ key: k, value: v });
    });

    const data = { fullPath: newPath, password: pw, fields, notes: overlay.querySelector('#f-notes').value };
    const saveBtn = overlay.querySelector('#btn-save-modal');
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
  });

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
        <button class="btn-cancel" id="btn-no">Abbrechen</button>
        <button class="btn-delete" id="btn-yes">Löschen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btn-no').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-yes').addEventListener('click', () => {
    DeleteEntry(entry.fullPath).then(() => {
      overlay.remove();
      activeEntry = null; activeDetails = null;
      showEmptyState();
      return ListPasswords();
    }).then(entries => {
      allEntries = entries || [];
      renderList(allEntries);
    }).catch(err => alert(`Fehler: ${err}`));
  });
}

// ── New entry ──────────────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', () => openModal(null, null));

// ── Helpers ────────────────────────────────────────────────────────────────
function mask(pw) { return '●'.repeat(Math.min(pw?.length ?? 12, 24)); }

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓'; btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  });
}

function flashBtn(btn, label, ms) {
  const orig = btn.innerHTML;
  btn.innerHTML = label; btn.classList.add('copied');
  setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, ms);
}

// ── Init — wait for Wails runtime before calling Go ────────────────────────
async function init() {
  // In browser/dev mode the Wails WebSocket bridge connects asynchronously.
  // Poll until window.go is ready, then proceed.
  for (let i = 0; i < 50; i++) {
    if (window.go?.main?.App) break;
    await new Promise(r => setTimeout(r, 100));
  }

  homeDir = await GetHomeDir().catch(() => '');

  try {
    const entries = await ListPasswords();
    allEntries = entries || [];
    renderList(allEntries);
  } catch (err) {
    document.getElementById('entry-list').innerHTML =
      `<div style="padding:16px;color:var(--danger);font-size:13px;">Fehler: ${err}</div>`;
  }
}

init();
