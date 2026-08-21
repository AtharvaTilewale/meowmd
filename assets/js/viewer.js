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

    this.initMarkdownParser();
    this.bindDOM();
    this.loadPersistedFiles();
    this.setupDragAndDrop();
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
          return `<pre><button class="code-copy-btn" onclick="copyCodeFromPre(this)">Copy</button><code>${this.escapeHTML(str)}</code></pre>`;
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
    this.floatingToggleBtn = document.getElementById('floatingToggleBtn');

    // Sidebar Toggles
    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.onclick = () => this.toggleSidebar();
    }
    if (this.floatingToggleBtn) {
      this.floatingToggleBtn.onclick = () => this.toggleSidebar();
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
          showToast('Auto-Save disabled. Files kept in memory.', 'info');
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
        if (confirm('Are you sure you want to clear all files from your workspace?')) {
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
      this.searchInput.oninput = (e) => this.handleSearch(e.target.value);
    }

    // Top Bar Action Buttons
    const copyMdBtn = document.getElementById('copyRawMdBtn');
    if (copyMdBtn) {
      copyMdBtn.onclick = () => {
        const active = this.getActiveFile();
        if (active) copyToClipboard(active.content, 'Raw Markdown copied!');
      };
    }

    const copyHtmlBtn = document.getElementById('copyHtmlBtn');
    if (copyHtmlBtn) {
      copyHtmlBtn.onclick = () => {
        if (this.contentEl) copyToClipboard(this.contentEl.innerHTML, 'Rendered HTML copied!');
      };
    }

    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
      exportPdfBtn.onclick = () => this.exportPDF();
    }

    const printBtn = document.getElementById('printDocBtn');
    if (printBtn) {
      printBtn.onclick = () => window.print();
    }

    const fullScreenBtn = document.getElementById('fullScreenBtn');
    if (fullScreenBtn) {
      fullScreenBtn.onclick = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      };
    }
  }

  toggleSidebar() {
    this.sidebar.classList.toggle('collapsed');
  }

  async handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const newFiles = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt')) {
        try {
          const content = await file.text();
          newFiles.push({
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: file.name,
            path: file.webkitRelativePath || file.name,
            content: content,
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
      content: `# Welcome to MeowMD Workspace 🐱

MeowMD is a high-speed, offline-first technical Markdown viewer and documentation workstation.

---

### 🌟 Interactive Features Built-in:

1. **Diagrams & Flowcharts** (Powered by Mermaid):
\`\`\`mermaid
graph LR
    A[Raw Markdown] --> B(Parser Engine)
    B --> C{Smart Loader}
    C -->|Math| D[KaTeX]
    C -->|Flowcharts| E[Mermaid]
    C -->|Structures| F[3Dmol.js]
    D --> G[Instant Beautiful Preview]
    E --> G
    F --> G
\`\`\`

2. **LaTeX Math Support**:
Inline equation: $f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}$

Display equation:
$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$

3. **Tables & Checklist**:
| Column 1 | Column 2 | Status |
| :--- | :--- | :---: |
| Offline Ready | Full PWA Support | ✅ |
| Speed | Zero-blocking Lazy Load | ⚡ |
| Privacy | 100% Client-Side | 🔒 |

- [x] High performance rendering
- [x] PDF & HTML export
- [x] Multi-file workspace search

---
*Tip: Drag & drop any \`.md\` file or folder anywhere onto this page to start reading!*
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
      };

      li.innerHTML = `
        <div class="file-item-name" title="${file.path}">
          <i class="fa-regular fa-file-lines" style="color: var(--primary);"></i>
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
    const file = this.getActiveFile();
    if (!file) {
      this.docTitleEl.innerText = 'No Document Selected';
      this.docMetaEl.innerHTML = '';
      this.contentEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fa-solid fa-file-circle-plus"></i></div>
          <h3>No Document Selected</h3>
          <p>Import a Markdown file or folder from the sidebar, or drop a file anywhere on screen.</p>
          <label for="fileInput" class="btn btn-primary"><i class="fa-solid fa-file-import"></i> Import Document</label>
        </div>
      `;
      return;
    }

    this.docTitleEl.innerText = file.name;
    const words = file.content.trim().split(/\s+/).filter(Boolean).length;
    const readTime = Math.ceil(words / 200);
    this.docMetaEl.innerHTML = `
      <span><i class="fa-solid fa-font"></i> ${words} words</span>
      <span>•</span>
      <span><i class="fa-regular fa-clock"></i> ~${readTime} min read</span>
    `;

    // Render Markdown
    let html = '';
    if (this.md) {
      html = this.md.render(file.content);
    } else {
      html = `<pre>${this.escapeHTML(file.content)}</pre>`;
    }

    // Sanitize with DOMPurify if present
    if (window.DOMPurify) {
      html = window.DOMPurify.sanitize(html, {
        ADD_TAGS: ['div', 'span'],
        ADD_ATTR: ['target', 'class', 'style', 'id']
      });
    }

    this.contentEl.innerHTML = html;

    // Process Smart Extensions On-Demand (Lazy Loading)
    await this.processSmartExtensions(file.content);
  }

  async processSmartExtensions(raw) {
    if (!window.LazyEngines) return;

    // 1. Check for Mermaid Diagrams
    if (raw.includes('```mermaid')) {
      try {
        const mermaid = await window.LazyEngines.ensureMermaid();
        const codeNodes = this.contentEl.querySelectorAll('pre code.language-mermaid');
        codeNodes.forEach(node => {
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-wrapper';
          wrapper.innerHTML = `<div class="mermaid">${node.textContent}</div>`;
          node.closest('pre').replaceWith(wrapper);
        });
        mermaid.run();
      } catch (err) {
        console.error('Mermaid render error:', err);
      }
    }

    // 2. Check for LaTeX Math
    if (raw.includes('$')) {
      try {
        await window.LazyEngines.ensureKaTeX();
        // Fallback DOM math scanning if texmath plugin wasn't hooked at parser start
        if (window.renderMathInElement) {
          window.renderMathInElement(this.contentEl, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false }
            ]
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
        const pdbNodes = this.contentEl.querySelectorAll('pre code.language-pdb, pre code.language-mol');
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

    showToast('Preparing PDF...', 'info');
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
      showToast('PDF Export complete!', 'success');
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
  copyToClipboard(code, 'Code copied to clipboard!');
};

document.addEventListener('DOMContentLoaded', () => {
  window.viewerApp = new MeowViewer();
});
