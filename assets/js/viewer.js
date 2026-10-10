/**
 * MeowMD Markdown Viewer & Workspace Engine (viewer.js)
 */

class MeowViewer {
  constructor() {
    this.files = [];
    this.activeFileId = null;
    this.autoSave = localStorage.getItem('meowmd_autosave') === 'true';
    this.md = null;
    this.fuse = null;
    // Read the share-link parameter before any render can rewrite the address bar
    try { this.pendingUrl = new URLSearchParams(window.location.search).get('url') || ''; } catch (e) { this.pendingUrl = ''; }
    this.pendingHash = window.location.hash || '';

    this.initMarkdownParser();
    this.bindDOM();
    this.loadPersistedFiles();
    this.setupDragAndDrop();
    this.handleUrlParam();
    if (this.initExtras) this.initExtras();
  }

  initMarkdownParser() {
    if (window.markdownit) {
      this.md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
        highlight: (str, lang) => {
          if (lang && window.hljs && window.hljs.getLanguage(lang)) {
            try {
              return `<pre><button class="code-copy-btn" onclick="copyCodeFromPre(this)">Copy</button><code class="hljs language-${lang}">${window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
            } catch (__) {}
          }
          const cls = lang ? ` class="language-${this.escapeHTML(lang)}"` : '';
          return `<pre><button class="code-copy-btn" onclick="copyCodeFromPre(this)">Copy</button><code${cls}>${this.escapeHTML(str)}</code></pre>`;
        }
      });

      if (window.markdownitFootnote) {
        this.md.use(window.markdownitFootnote);
      }
    }
  }

  bindDOM() {
    // Elements
    this.sidebar = document.getElementById('sidebar');
    this.fileListEl = document.getElementById('fileList');
    this.contentEl = document.getElementById('markdownContent');
    this.docTitleEl = document.getElementById('docTitle');
    this.docMetaEl = document.getElementById('docMeta');
    this.searchInput = document.getElementById('searchInput');
    this.fileInput = document.getElementById('fileInput');
    this.folderInput = document.getElementById('folderInput');
    this.clearAllBtn = document.getElementById('clearAllBtn');
    this.storageToggle = document.getElementById('storageToggle');
    this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    this.sidebarToggleTopbarBtn = document.getElementById('sidebarToggleTopbarBtn');

    // Start collapsed on narrow screens so the document is visible first
    this.isNarrow = () => window.matchMedia('(max-width: 768px)').matches;
    if (this.sidebar && this.isNarrow()) {
      this.sidebar.classList.add('collapsed');
    }

    // Sidebar Toggles
    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.onclick = () => this.toggleSidebar();
    }
    if (this.sidebarToggleTopbarBtn) {
      this.sidebarToggleTopbarBtn.onclick = () => this.toggleSidebar();
    }

    // Storage Toggle
    if (this.storageToggle) {
      this.storageToggle.checked = this.autoSave;
      this.storageToggle.onchange = (e) => {
        this.autoSave = e.target.checked;
        localStorage.setItem('meowmd_autosave', this.autoSave);
        if (this.autoSave) {
          this.persistFiles();
          showToast('Auto-Save enabled', 'success');
        } else {
          localStorage.removeItem('meowmd_workspace_files');
          showToast('Auto-Save disabled. Files kept in memory only.', 'info');
        }
      };
    }

    // File / Folder Inputs
    if (this.fileInput) {
      this.fileInput.onchange = (e) => this.handleFiles(e.target.files);
    }
    if (this.folderInput) {
      this.folderInput.onchange = (e) => this.handleFiles(e.target.files);
    }

    // Clear Workspace
    if (this.clearAllBtn) {
      this.clearAllBtn.onclick = () => {
        if (this.files.length === 0) return;
        if (confirm('Clear all files from your workspace?')) {
          this.files = [];
          this.activeFileId = null;
          if (this.autoSave) localStorage.removeItem('meowmd_workspace_files');
          this.renderFileList();
          this.renderActiveFile();
          showToast('Workspace cleared', 'info');
        }
      };
    }

    // Search Box
    if (this.searchInput) {
      this.searchInput.oninput = (e) => { this.setSidebarTab('files'); this.handleSearch(e.target.value); };
    }

    // Sidebar tabs (files / outline)
    this.outlineEl = document.getElementById('outlineList');
    document.querySelectorAll('.sidebar-tab').forEach((btn) => {
      btn.onclick = () => this.setSidebarTab(btn.dataset.tab);
    });

    // Open from URL
    const openUrlBtn = document.getElementById('openUrlBtn');
    if (openUrlBtn) {
      openUrlBtn.onclick = () => {
        this.openModal('urlModal');
        const input = document.getElementById('urlInput');
        if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
      };
    }
    const urlForm = document.getElementById('urlModalForm');
    if (urlForm) {
      urlForm.onsubmit = (e) => {
        e.preventDefault();
        const value = document.getElementById('urlInput').value;
        this.closeModal('urlModal');
        this.openFromUrl(value);
      };
    }
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
    });
    document.querySelectorAll('.modal-close-btn').forEach((btn) => {
      btn.addEventListener('click', () => { const m = btn.closest('.modal-overlay'); if (m) m.classList.remove('active'); });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach((m) => m.classList.remove('active'));
        this.closeMenus();
      }
    });

    // Dropdown menus
    this.setupMenus();

    // Copy actions
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind('copyRawMdBtn', () => {
      const active = this.getActiveFile();
      if (active) copyToClipboard(active.content, 'Markdown source copied');
    });
    bind('copyHtmlBtn', () => {
      if (this.contentEl) copyToClipboard(this.contentEl.innerHTML, 'HTML copied');
    });
    bind('copyRichBtn', () => this.copyRichText());
    bind('copyLinkBtn', () => {
      const active = this.getActiveFile();
      if (active && active.sourceUrl) copyToClipboard(this.shareLinkFor(active), 'Share link copied');
    });

    // Export actions
    bind('exportPdfBtn', () => this.exportPDF());
    bind('exportHtmlBtn', () => this.exportHTML());
    bind('printDocBtn', () => window.print());

    bind('fullScreenBtn', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Outline tracking while reading
    const scroller = document.getElementById('contentScroll');
    if (scroller) {
      let ticking = false;
      scroller.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { this.updateActiveHeading(); ticking = false; });
      });
    }
  }

  /* ---------- Sidebar tabs & outline ---------- */

  setSidebarTab(tab) {
    document.querySelectorAll('.sidebar-tab').forEach((btn) => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (this.fileListEl) this.fileListEl.hidden = tab !== 'files';
    if (this.outlineEl) this.outlineEl.hidden = tab !== 'outline';
  }

  buildOutline() {
    if (!this.outlineEl || !this.contentEl) return;
    const used = Object.create(null);
    const headings = Array.from(this.contentEl.querySelectorAll('h1, h2, h3, h4'));
    this.outline = headings.map((h) => {
      let slug = h.textContent.trim().toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
      if (used[slug]) { used[slug] += 1; slug = slug + '-' + used[slug]; } else { used[slug] = 1; }
      h.id = slug;
      return { el: h, level: Number(h.tagName[1]), text: h.textContent.trim(), id: slug };
    });

    if (this.outline.length === 0) {
      this.outlineEl.innerHTML = '<li class="outline-empty">No headings in this document</li>';
      return;
    }
    this.outlineEl.innerHTML = this.outline.map((item) =>
      `<li class="outline-item level-${item.level}"><a href="#${item.id}" title="${this.escapeHTML(item.text)}">${this.escapeHTML(item.text)}</a></li>`
    ).join('');
    this.outlineEl.querySelectorAll('a').forEach((a, i) => {
      a.onclick = (e) => {
        e.preventDefault();
        const target = this.outline[i].el;
        const scroller = document.getElementById('contentScroll');
        if (scroller && target) {
          scroller.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
        }
        if (this.isNarrow && this.isNarrow() && this.sidebar) this.sidebar.classList.add('collapsed');
      };
    });
    this.updateActiveHeading();
  }

  updateActiveHeading() {
    if (!this.outline || !this.outline.length || !this.outlineEl) return;
    const scroller = document.getElementById('contentScroll');
    if (!scroller) return;
    const top = scroller.getBoundingClientRect().top;
    let activeIdx = 0;
    for (let i = 0; i < this.outline.length; i++) {
      if (this.outline[i].el.getBoundingClientRect().top - top <= 96) activeIdx = i; else break;
    }
    const items = this.outlineEl.querySelectorAll('.outline-item');
    items.forEach((li, i) => li.classList.toggle('active', i === activeIdx));
    const active = items[activeIdx];
    if (active && this.outlineEl.hidden === false) {
      const r = active.getBoundingClientRect();
      const box = this.outlineEl.getBoundingClientRect();
      if (r.top < box.top || r.bottom > box.bottom) active.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ---------- Menus ---------- */

  setupMenus() {
    document.querySelectorAll('.menu').forEach((menu) => {
      const trigger = menu.querySelector('.menu-trigger');
      if (!trigger) return;
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.classList.contains('open');
        this.closeMenus();
        if (!open) { menu.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); }
      });
      menu.querySelectorAll('.menu-item').forEach((item) => {
        item.addEventListener('click', () => this.closeMenus());
      });
    });
    document.addEventListener('click', () => this.closeMenus());
  }

  closeMenus() {
    document.querySelectorAll('.menu.open').forEach((m) => {
      m.classList.remove('open');
      const t = m.querySelector('.menu-trigger');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }

  openModal(id) { const m = document.getElementById(id); if (m) m.classList.add('active'); }
  closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('active'); }

  /* ---------- Open from URL & share links ---------- */

  normalizeSourceUrl(raw) {
    let url = (raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const blob = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
    if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3].split('?')[0]}`;
    const gist = url.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)\/?$/i);
    if (gist) return `https://gist.githubusercontent.com/${gist[1]}/${gist[2]}/raw`;
    return url;
  }

  async openFromUrl(raw) {
    const repo = this.parseRepoUrl ? this.parseRepoUrl(raw) : null;
    if (repo) {
      try { await this.openRepo(repo); } catch (err) { console.error(err); showToast(err.message || 'Could not open that repository', 'danger', 5000); }
      return;
    }
    const url = this.normalizeSourceUrl(raw);
    if (!url) return;
    showToast('Fetching document', 'info', 1500);
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let text = await res.text();
      let name = decodeURIComponent((url.split('#')[0].split('?')[0].split('/').pop() || '').trim()) || 'document.md';
      let kind;
      if (/\.ipynb$/i.test(name) && this.notebookToMarkdown) {
        text = this.notebookToMarkdown(JSON.parse(text));
        kind = 'notebook';
      } else if (!/\.(md|markdown|txt)$/i.test(name)) {
        name += '.md';
      }

      const existing = this.files.find((f) => f.sourceUrl === url);
      if (existing) {
        existing.content = text;
        existing.lastModified = Date.now();
        this.activeFileId = existing.id;
      } else {
        const file = {
          id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name, path: url, sourceUrl: url, content: text, kind, size: text.length, lastModified: Date.now()
        };
        this.files = [file, ...this.files];
        this.activeFileId = file.id;
      }
      if (this.autoSave) this.persistFiles();
      this.renderFileList();
      this.renderActiveFile();
      showToast('Opened ' + name, 'success');
    } catch (err) {
      console.error('Open from URL failed:', err);
      showToast('Could not load that URL. It must be a public raw Markdown file that allows cross-origin requests.', 'danger', 5000);
    }
  }

  async handleUrlParam() {
    const u = this.pendingUrl;
    if (!u) return;
    await this.openFromUrl(u);
    this.pendingUrl = '';
    this.syncAddressBar(this.getActiveFile());
  }

  shareLinkFor(file) {
    return window.location.origin + window.location.pathname + '?url=' + encodeURIComponent(file.sourceUrl);
  }

  syncAddressBar(file) {
    if (this.pendingUrl) return; // keep ?url= until it has been opened
    try {
      const base = window.location.pathname;
      const next = file && file.sourceUrl ? base + '?url=' + encodeURIComponent(file.sourceUrl) : base;
      if (window.location.pathname + window.location.search !== next) history.replaceState(null, '', next);
    } catch (e) {}
  }

  /* ---------- Copy & export ---------- */

  async copyRichText() {
    if (!this.contentEl) return;
    const html = this.contentEl.innerHTML;
    const text = this.contentEl.innerText;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })]);
        showToast('Copied as rich text. Paste into Docs, Gmail, Notion or Word.', 'success');
        return;
      }
    } catch (e) {
      console.warn('Clipboard API write failed, falling back', e);
    }
    const range = document.createRange();
    range.selectNodeContents(this.contentEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    sel.removeAllRanges();
    showToast(ok ? 'Copied as rich text' : 'Copy failed', ok ? 'success' : 'danger');
  }

  exportHTML() {
    const file = this.getActiveFile();
    if (!file || !this.contentEl) return;
    const title = file.name.replace(/\.(md|markdown|txt)$/i, '');
    const css = `
      :root{color-scheme:light dark}
      body{max-width:760px;margin:3rem auto;padding:0 1.25rem;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#27272a;background:#fff}
      h1,h2,h3,h4{line-height:1.25;letter-spacing:-.02em;color:#111113;margin:2em 0 .6em}h1{font-size:2rem;margin-top:0}h2{font-size:1.4rem;border-bottom:1px solid #eee;padding-bottom:.3rem}
      a{color:#111113}pre{background:#f6f6f7;border:1px solid #e4e4e7;border-radius:8px;padding:1rem;overflow:auto;font-size:.85rem}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
      :not(pre)>code{background:#f4f4f5;border:1px solid #eee;border-radius:4px;padding:.1em .35em}blockquote{border-left:2px solid #d4d4d8;margin:1.5rem 0;padding-left:1.25rem;color:#71717a}
      table{border-collapse:collapse;width:100%;margin:1.5rem 0}th,td{padding:.6rem .85rem;border-bottom:1px solid #eee;text-align:left}th{font-size:.8rem;color:#71717a}img{max-width:100%;border-radius:8px}
      .code-copy-btn{display:none}.mermaid-wrapper{display:flex;justify-content:center;margin:1.5rem 0}
      @media(prefers-color-scheme:dark){body{background:#0c0c0d;color:#c9c9ce}h1,h2,h3,h4,a{color:#f4f4f5}pre{background:#151517;border-color:#26262a}:not(pre)>code{background:#161618;border-color:#26262a}th,td{border-color:#1e1e22}blockquote{border-color:#333338;color:#8a8a93}}`;
    const doc = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${this.escapeHTML(title)}</title><style>${css}</style></head><body>${this.contentEl.innerHTML}</body></html>`;
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    showToast('Exported ' + title + '.html', 'success');
  }

  toggleSidebar() {
    if (this.sidebar) {
      this.sidebar.classList.toggle('collapsed');
    }
  }

  async handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const newFiles = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const lower = file.name.toLowerCase();
      if (/\.(md|markdown|txt|ipynb|csv|tsv)$/.test(lower)) {
        try {
          let content = await file.text();
          let kind;
          if (lower.endsWith('.ipynb') && this.notebookToMarkdown) {
            content = this.notebookToMarkdown(JSON.parse(content));
            kind = 'notebook';
          } else if (/\.(csv|tsv)$/.test(lower) && this.csvToMarkdownTable) {
            content = '# ' + file.name + '\n\n' + this.csvToMarkdownTable(content);
            kind = 'csv';
          }
          newFiles.push({
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: file.name,
            path: file.webkitRelativePath || file.name,
            content: content,
            kind: kind,
            size: file.size,
            lastModified: file.lastModified || Date.now()
          });
        } catch (e) {
          console.error('Error reading file:', file.name, e);
        }
      }
    }

    if (newFiles.length > 0) {
      this.files = [...newFiles, ...this.files];
      this.activeFileId = newFiles[0].id;
      if (this.autoSave) this.persistFiles();
      this.renderFileList();
      this.renderActiveFile();
      showToast(`Imported ${newFiles.length} document${newFiles.length > 1 ? 's' : ''}`, 'success');
    }
  }

  persistFiles() {
    if (!this.autoSave) return;
    try {
      localStorage.setItem('meowmd_workspace_files', JSON.stringify(this.files));
    } catch (e) {
      console.warn('LocalStorage limit reached for files', e);
      showToast('Warning: Workspace exceeds local storage quota', 'danger');
    }
  }

  loadPersistedFiles() {
    if (this.autoSave) {
      try {
        const stored = localStorage.getItem('meowmd_workspace_files');
        if (stored) {
          this.files = JSON.parse(stored);
          if (this.files.length > 0) {
            this.activeFileId = this.files[0].id;
          }
        }
      } catch (e) {
        console.error('Failed to load persisted files', e);
      }
    }

    if (this.files.length === 0) {
      this.loadDemoFile();
    } else {
      this.renderFileList();
      this.renderActiveFile();
    }
  }

  loadDemoFile() {
    const demo = {
      id: 'demo_welcome',
      name: 'Welcome_to_MeowMD.md',
      path: 'Welcome_to_MeowMD.md',
      content: `# Welcome to MeowMD

MeowMD is a private, offline Markdown viewer. Drop any \`.md\` file or folder onto this window to start reading.

## Diagrams

Fenced \`mermaid\` blocks render as diagrams.

\`\`\`mermaid
graph LR
    A[Markdown] --> B(Parser)
    B --> C{Extensions}
    C -->|Math| D[KaTeX]
    C -->|Diagrams| E[Mermaid]
    C -->|Molecules| F[3Dmol]
    D --> G[Rendered page]
    E --> G
    F --> G
\`\`\`

## Math

Inline math like $f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}$ and display equations:

$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$

## Tables and tasks

| Feature | Details | Status |
| :--- | :--- | :---: |
| Offline | Service worker caches the app | Yes |
| Speed | Heavy libraries load on demand | Yes |
| Privacy | Everything stays in your browser | Yes |

- [x] Render Markdown with diagrams and math
- [x] Export to PDF
- [ ] Import your own files

## Code

\`\`\`js
function render(markdown) {
  return md.render(markdown); // fast, local, private
}
\`\`\`

> Tip: turn on auto-save in the sidebar to keep your workspace between visits.
`,
      size: 1024,
      lastModified: Date.now()
    };

    this.files = [demo];
    this.activeFileId = demo.id;
    this.renderFileList();
    this.renderActiveFile();
  }

  getActiveFile() {
    return this.files.find(f => f.id === this.activeFileId);
  }

  renderFileList(filtered = null) {
    if (!this.fileListEl) return;
    const list = filtered || this.files;
    this.fileListEl.innerHTML = '';

    if (list.length === 0) {
      this.fileListEl.innerHTML = '<li style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No documents found</li>';
      return;
    }

    list.forEach(file => {
      const li = document.createElement('li');
      li.className = `file-item ${file.id === this.activeFileId ? 'active' : ''}`;
      li.onclick = () => {
        this.activeFileId = file.id;
        this.renderFileList();
        this.renderActiveFile();
        if (this.isNarrow && this.isNarrow() && this.sidebar) {
          this.sidebar.classList.add('collapsed');
        }
      };

      li.innerHTML = `
        <div class="file-item-name" title="${file.path}">
          <i class="${file.kind === 'notebook' ? 'fa-solid fa-book' : file.kind === 'chat' ? 'fa-regular fa-comments' : file.kind === 'csv' ? 'fa-solid fa-table' : file.sourceUrl ? 'fa-solid fa-link' : 'fa-regular fa-file-lines'}"></i>
          <span>${file.name}</span>
        </div>
        <button class="file-item-delete" title="Delete file" onclick="event.stopPropagation(); window.viewerApp.deleteFile('${file.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
      this.fileListEl.appendChild(li);
    });
  }

  deleteFile(id) {
    this.files = this.files.filter(f => f.id !== id);
    if (this.activeFileId === id) {
      this.activeFileId = this.files.length > 0 ? this.files[0].id : null;
    }
    if (this.autoSave) this.persistFiles();
    this.renderFileList();
    this.renderActiveFile();
    showToast('File removed', 'info');
  }

  async renderActiveFile() {
    if (!this.md && window.markdownit) {
      this.initMarkdownParser();
    }

    const file = this.getActiveFile();
    if (!file) {
      this.docTitleEl.innerText = 'No Document Selected';
      this.docTitleEl.removeAttribute('title');
      this.docMetaEl.innerHTML = '';
      this.outline = [];
      if (this.outlineEl) this.outlineEl.innerHTML = '<li class="outline-empty">No document open</li>';
      const linkBtnEmpty = document.getElementById('copyLinkBtn');
      if (linkBtnEmpty) linkBtnEmpty.hidden = true;
      this.syncAddressBar(null);
      this.contentEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fa-solid fa-file-circle-plus"></i></div>
          <h3>No Document Selected</h3>
          <p>Import a file or folder from the sidebar, drop files anywhere, paste Markdown with Ctrl+V, or open a GitHub URL.</p>
          <label for="fileInput" class="btn btn-primary"><i class="fa-solid fa-file-import"></i> Import Document</label>
        </div>
      `;
      return;
    }

    this.docTitleEl.innerText = file.name;
    this.docTitleEl.title = file.name;
    const words = file.content.trim().split(/\s+/).filter(Boolean).length;
    const readTime = Math.ceil(words / 200);
    this.docMetaEl.innerHTML = `
      <span><i class="fa-solid fa-font"></i> ${words} words</span>
      <span>•</span>
      <span><i class="fa-regular fa-clock"></i> ~${readTime} min read</span>
    `;

    // Render Markdown
    const source = this.sourceForRender ? this.sourceForRender(file) : file.content;
    let html = '';
    if (this.md) {
      html = this.md.render(source);
    } else {
      html = `<pre>${this.escapeHTML(source)}</pre>`;
    }

    // Sanitize with DOMPurify if present
    if (window.DOMPurify) {
      html = window.DOMPurify.sanitize(html, {
        ADD_TAGS: ['div', 'span'],
        ADD_ATTR: ['target', 'class', 'style', 'id']
      });
    }

    this.contentEl.innerHTML = html;
    const scroller = document.getElementById('contentScroll');
    if (scroller) scroller.scrollTop = 0;

    // Outline, share link, address bar
    this.buildOutline();
    const linkBtn = document.getElementById('copyLinkBtn');
    if (linkBtn) linkBtn.hidden = !file.sourceUrl;
    this.syncAddressBar(file);

    // Process Smart Extensions On-Demand (Lazy Loading)
    await this.processSmartExtensions(source);
    this.updateActiveHeading();
  }

  async processSmartExtensions(raw, root) {
    root = root || this.contentEl;
    if (!window.LazyEngines || !root) return;

    // 0. Tables from CSV fences, charts from chart fences
    if (this.renderDataBlocks && (raw.includes('```csv') || raw.includes('```tsv') || raw.includes('```chart'))) {
      try { await this.renderDataBlocks(root); } catch (err) { console.error('Data block render error:', err); }
    }

    // 1. Check for Mermaid Diagrams
    if (raw.includes('```mermaid')) {
      try {
        const mermaid = await window.LazyEngines.ensureMermaid();
        const codeNodes = root.querySelectorAll('pre code.language-mermaid');
        codeNodes.forEach(node => {
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-wrapper';
          wrapper.innerHTML = `<div class="mermaid">${node.textContent}</div>`;
          node.closest('pre').replaceWith(wrapper);
        });
        mermaid.run({ nodes: root.querySelectorAll('.mermaid') });
      } catch (err) {
        console.error('Mermaid render error:', err);
      }
    }

    // 2. Check for LaTeX Math
    if (raw.includes('$')) {
      try {
        await window.LazyEngines.ensureKaTeX();
        if (window.renderMathInElement) {
          window.renderMathInElement(root, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false }
            ],
            throwOnError: false
          });
        }
      } catch (err) {
        console.error('KaTeX render error:', err);
      }
    }

    // 3. Check for 3D Molecule PDB
    if (raw.includes('```pdb') || raw.includes('```mol')) {
      try {
        const $3Dmol = await window.LazyEngines.ensure3Dmol();
        const pdbNodes = root.querySelectorAll('pre code.language-pdb, pre code.language-mol');
        pdbNodes.forEach((node, idx) => {
          const container = document.createElement('div');
          container.id = 'viewer_mol_' + idx;
          container.className = 'mol-container';
          node.closest('pre').replaceWith(container);

          const viewer = $3Dmol.createViewer(container, { backgroundColor: 'black' });
          viewer.addModel(node.textContent, 'pdb');
          viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
          viewer.zoomTo();
          viewer.render();
        });
      } catch (err) {
        console.error('3Dmol render error:', err);
      }
    }
  }

  async handleSearch(query) {
    if (!query.trim()) {
      this.renderFileList();
      return;
    }

    if (window.LazyEngines) {
      await window.LazyEngines.ensureFuse();
    }

    if (window.Fuse) {
      const fuse = new window.Fuse(this.files, {
        keys: ['name', 'content', 'path'],
        threshold: 0.35
      });
      const results = fuse.search(query).map(r => r.item);
      this.renderFileList(results);
    } else {
      const lower = query.toLowerCase();
      const results = this.files.filter(f => f.name.toLowerCase().includes(lower) || f.content.toLowerCase().includes(lower));
      this.renderFileList(results);
    }
  }

  async exportPDF() {
    const file = this.getActiveFile();
    if (!file) return;

    showToast('Preparing PDF export...', 'info');
    try {
      await window.LazyEngines.ensurePDF();
      const opt = {
        margin: 15,
        filename: file.name.replace(/\.(md|markdown|txt)$/i, '') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await window.html2pdf().set(opt).from(this.contentEl).save();
      showToast('PDF Export complete', 'success');
    } catch (err) {
      console.error('PDF export failed:', err);
      showToast('Failed to export PDF', 'danger');
    }
  }

  setupDragAndDrop() {
    const overlay = document.getElementById('dragOverlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (overlay) overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && overlay) {
        overlay.classList.remove('active');
        dragCounter = 0;
      }
    });

    window.addEventListener('dragover', (e) => e.preventDefault());

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (overlay) overlay.classList.remove('active');
      if (e.dataTransfer && e.dataTransfer.files) {
        this.handleFiles(e.dataTransfer.files);
      }
    });
  }

  escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

// Global Pre Code Copier
window.copyCodeFromPre = function(btn) {
  const code = btn.nextElementSibling.innerText;
  copyToClipboard(code, 'Code copied');
};

document.addEventListener('DOMContentLoaded', () => {
  window.viewerApp = new MeowViewer();
});
