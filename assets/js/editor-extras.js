/**
 * MeowMD Editor extras (editor-extras.js)
 * Templates gallery, slash commands and table-of-contents insertion.
 * Extends MeowEditor.prototype; loaded after editor.js.
 */
(function () {
  if (typeof MeowEditor === 'undefined') return;
  const P = MeowEditor.prototype;

  const COMMANDS = [
    { key: 'h1', label: 'Heading 1', hint: 'Section title', icon: 'fa-heading', run: (a) => a.execCmd('formatBlock', '<h1>') },
    { key: 'h2', label: 'Heading 2', hint: 'Sub-section', icon: 'fa-heading', run: (a) => a.execCmd('formatBlock', '<h2>') },
    { key: 'h3', label: 'Heading 3', hint: 'Minor heading', icon: 'fa-heading', run: (a) => a.execCmd('formatBlock', '<h3>') },
    { key: 'text', label: 'Normal text', hint: 'Plain paragraph', icon: 'fa-paragraph', run: (a) => a.execCmd('formatBlock', '<p>') },
    { key: 'bullet', label: 'Bulleted list', hint: '- item', icon: 'fa-list-ul', run: (a) => a.execCmd('insertUnorderedList') },
    { key: 'number', label: 'Numbered list', hint: '1. item', icon: 'fa-list-ol', run: (a) => a.execCmd('insertOrderedList') },
    { key: 'task', label: 'Task list', hint: '- [ ] item', icon: 'fa-list-check', run: (a) => a.insertChecklist() },
    { key: 'table', label: 'Table', hint: 'Rows and columns', icon: 'fa-table-cells', run: (a) => a.openTableModal() },
    { key: 'code', label: 'Code block', hint: 'Fenced, highlighted', icon: 'fa-file-code', run: (a) => a.openCodeBlockModal() },
    { key: 'mermaid', label: 'Mermaid diagram', hint: 'Flowchart from text', icon: 'fa-diagram-project',
      run: (a) => a.insertBlockHtml('<pre><code class="language-mermaid">graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Do it]\n  B -->|No| D[Skip]</code></pre><p><br></p>') },
    { key: 'chart', label: 'Chart', hint: 'Bar, line, pie from JSON', icon: 'fa-chart-simple',
      run: (a) => a.insertBlockHtml('<pre><code class="language-chart">{"type":"bar","title":"Monthly users","labels":["Jan","Feb","Mar"],"series":{"Users":[120,180,240]}}</code></pre><p><br></p>') },
    { key: 'csv', label: 'CSV table', hint: 'Paste CSV, get a table', icon: 'fa-table-list',
      run: (a) => a.insertBlockHtml('<pre><code class="language-csv">name,role,team\nAda,Engineer,Core\nGrace,Architect,Platform</code></pre><p><br></p>') },
    { key: 'math', label: 'Math block', hint: 'LaTeX with $$', icon: 'fa-square-root-variable',
      run: (a) => a.insertBlockHtml('<p>$$\n\\int_a^b f(x)\\,dx = F(b) - F(a)\n$$</p><p><br></p>') },
    { key: 'callout', label: 'Callout', hint: 'Note, tip, warning', icon: 'fa-bell', run: (a) => a.openAlertModal() },
    { key: 'quote', label: 'Quote', hint: '> blockquote', icon: 'fa-quote-left', run: (a) => a.formatBlockquote() },
    { key: 'toc', label: 'Table of contents', hint: 'Links to every heading', icon: 'fa-list', run: (a) => a.insertToc() },
    { key: 'link', label: 'Link', hint: '[text](url)', icon: 'fa-link', run: (a) => a.openLinkModal() },
    { key: 'image', label: 'Image', hint: '![alt](url)', icon: 'fa-image', run: (a) => a.openImageModal() },
    { key: 'details', label: 'Collapsible section', hint: '<details>', icon: 'fa-square-caret-down', run: (a) => a.insertDetails() },
    { key: 'hr', label: 'Divider', hint: '---', icon: 'fa-minus', run: (a) => a.insertHorizontalRule() },
    { key: 'footnote', label: 'Footnote', hint: '[^1]', icon: 'fa-asterisk', run: (a) => a.insertFootnote() },
    { key: 'date', label: "Today's date", hint: new Date().toISOString().slice(0, 10), icon: 'fa-calendar', run: (a) => a.insertHtmlAtCursor(new Date().toISOString().slice(0, 10) + ' ') }
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  P.initExtras = function () {
    this.slash = null;
    this.demoMarkdown = this.restoredDraft ? null : (this.markdownOutput ? this.markdownOutput.value : null);
    this.buildSlashMenu();
    this.initTemplates();
  };

  /* ------------------------------------------------------- slash commands */

  P.buildSlashMenu = function () {
    const el = document.createElement('div');
    el.className = 'slash-menu';
    el.hidden = true;
    el.setAttribute('role', 'listbox');
    document.body.appendChild(el);
    this.slashMenuEl = el;
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.slash-item');
      if (b) this.runSlash(b.dataset.key);
    });
    document.addEventListener('mousedown', (e) => {
      if (this.slash && !el.contains(e.target)) this.closeSlash();
    });
    document.addEventListener('selectionchange', () => {
      if (this.slash && !this.slash.pending) this.updateSlashMenu();
    });
  };

  /* Returns true when the key was consumed by the slash menu. */
  P.handleSlashKeydown = function (e) {
    if (this.slash && !this.slash.pending) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = this.slash.items.length;
        this.slash.index = (this.slash.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        this.renderSlash();
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = this.slash.items[this.slash.index];
        if (item) this.runSlash(item.key); else this.closeSlash();
        return true;
      }
      if (e.key === 'Escape') { e.preventDefault(); this.closeSlash(); return true; }
      return false;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed || !this.visualEditor) return false;
      const r = sel.getRangeAt(0);
      if (!this.visualEditor.contains(r.startContainer) || this.closestInEditor('pre')) return false;
      let before = '';
      if (r.startContainer.nodeType === 3) before = r.startContainer.data.slice(0, r.startOffset);
      if (before.trim() !== '' && !/\s$/.test(before)) return false;
      this.slash = { pending: true, index: 0, items: [], query: '' };
    }
    return false;
  };

  P.updateSlashMenu = function () {
    if (!this.slash) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return this.closeSlash();
    const r = sel.getRangeAt(0);
    const node = r.startContainer;
    if (node.nodeType !== 3 || !this.visualEditor.contains(node)) return this.closeSlash();
    if (this.slash.pending) {
      const off = r.startOffset;
      const slashAt = node.data.lastIndexOf('/', Math.max(0, off - 1));
      if (slashAt < 0 || off - slashAt > 25 || /\s/.test(node.data.slice(slashAt + 1, off))) return this.closeSlash();
      this.slash.pending = false;
      this.slash.node = node;
      this.slash.start = slashAt;
    }
    if (node !== this.slash.node || node.data[this.slash.start] !== '/' || r.startOffset <= this.slash.start) return this.closeSlash();
    const q = node.data.slice(this.slash.start + 1, r.startOffset);
    if (/\s/.test(q) || q.length > 24) return this.closeSlash();
    this.slash.query = q;
    const ql = q.toLowerCase();
    this.slash.items = COMMANDS.filter((c) => !ql || c.key.startsWith(ql) || c.label.toLowerCase().includes(ql));
    if (!this.slash.items.length) return this.closeSlash();
    this.slash.index = Math.min(this.slash.index, this.slash.items.length - 1);
    this.renderSlash(r);
  };

  P.renderSlash = function (range) {
    const el = this.slashMenuEl;
    if (!el || !this.slash) return;
    el.innerHTML = this.slash.items.map((c, i) =>
      '<button type="button" class="slash-item' + (i === this.slash.index ? ' active' : '') + '" data-key="' + c.key + '" role="option">' +
      '<i class="fa-solid ' + c.icon + '"></i><span>' + esc(c.label) + '</span><small>' + esc(c.hint) + '</small></button>'
    ).join('');
    el.hidden = false;
    if (range) {
      const rect = range.getBoundingClientRect();
      const w = 300;
      const h = Math.min(el.scrollHeight || 320, 340);
      let left = rect.left || 80;
      let top = (rect.bottom || 120) + 6;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }
    const active = el.querySelector('.slash-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  };

  P.closeSlash = function () {
    this.slash = null;
    if (this.slashMenuEl) { this.slashMenuEl.hidden = true; this.slashMenuEl.innerHTML = ''; }
  };

  P.runSlash = function (key) {
    const cmd = COMMANDS.find((c) => c.key === key);
    const st = this.slash;
    this.closeSlash();
    if (!cmd || !st || st.pending || !st.node) return;
    try {
      const end = Math.min(st.node.length, st.start + 1 + (st.query || '').length);
      const r = document.createRange();
      r.setStart(st.node, st.start);
      r.setEnd(st.node, end);
      r.deleteContents();
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      this.savedRange = r.cloneRange();
    } catch (e) { /* keep going with the current selection */ }
    if (this.visualEditor) this.visualEditor.focus();
    cmd.run(this);
    this.normalizeEditorDom();
    this.syncVisualToMarkdown();
    this.updateStats();
    this.updateToolbarState();
  };

  /* ------------------------------------------------------ table of contents */

  P.insertToc = function () {
    if (!this.visualEditor) return;
    const headings = Array.from(this.visualEditor.querySelectorAll('h1, h2, h3, h4')).filter((h) => !h.closest('.toc-block') && h.textContent.trim());
    if (!headings.length) { showToast('Add some headings first, then insert the table of contents', 'info'); return; }
    const used = Object.create(null);
    const slug = (t) => {
      let s = t.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
      if (used[s]) { used[s] += 1; s = s + '-' + (used[s] - 1); } else used[s] = 1;
      return s;
    };
    const min = Math.min.apply(null, headings.map((h) => Number(h.tagName[1])));
    let out = '<ul>';
    let depth = 0;
    let open = false;
    headings.forEach((h) => {
      const lvl = Math.max(0, Number(h.tagName[1]) - min);
      if (lvl > depth) {
        while (depth < lvl) { out += '<ul>'; depth++; }
      } else {
        if (open) { out += '</li>'; open = false; }
        while (depth > lvl) { out += '</ul></li>'; depth--; }
      }
      const text = h.textContent.trim();
      out += '<li><a href="#' + slug(text) + '">' + esc(text) + '</a>';
      open = true;
    });
    if (open) out += '</li>';
    while (depth > 0) { out += '</ul></li>'; depth--; }
    out += '</ul>';
    this.insertBlockHtml('<div class="toc-block"><p><strong>Contents</strong></p>' + out + '</div><p><br></p>');
    showToast('Table of contents inserted. Links follow GitHub heading anchors.', 'success');
  };

  /* --------------------------------------------------------------- templates */

  P.initTemplates = function () {
    const T = window.MEOW_TEMPLATES || {};
    const btn = document.getElementById('templatesBtn');
    if (btn) btn.onclick = () => this.openModal('templatesModal');
    const grid = document.getElementById('templateGrid');
    if (grid) {
      grid.innerHTML = Object.keys(T).map((k) => {
        const t = T[k];
        return '<button type="button" class="template-card" data-key="' + k + '">' +
          '<i class="fa-solid ' + t.icon + '"></i><strong>' + esc(t.title) + '</strong><span>' + esc(t.description) + '</span></button>';
      }).join('');
      grid.onclick = (e) => {
        const card = e.target.closest('.template-card');
        if (card) this.useTemplate(card.dataset.key);
      };
    }
    let param = '';
    try { param = new URLSearchParams(window.location.search).get('template') || ''; } catch (e) {}
    if (param && T[param]) setTimeout(() => this.useTemplate(param, true), 60);
  };

  P.useTemplate = function (key, fromLink) {
    const T = window.MEOW_TEMPLATES || {};
    const t = T[key];
    if (!t) return;
    const current = this.markdownOutput ? this.markdownOutput.value : '';
    const untouched = !current.trim() || current === this.demoMarkdown;
    if (!untouched && this.isDirty() && !confirm('Replace the current document with the "' + t.title + '" template? Your draft will be discarded.')) return;
    this.closeModal('templatesModal');
    if (this.markdownOutput) this.markdownOutput.value = t.markdown.trim() + '\n';
    this.fileHandle = null;
    this.fileName = '';
    this.lastSavedContent = null;
    this.syncMarkdownToVisual(true);
    this.updateStats();
    this.saveDraft();
    this.updateSaveState();
    if (fromLink) { try { history.replaceState(null, '', window.location.pathname); } catch (e) {} }
    showToast('Loaded the ' + t.title + ' template', 'success');
    if (this.visualEditor) this.visualEditor.focus();
  };
})();
