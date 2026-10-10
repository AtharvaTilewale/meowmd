/**
 * MeowMD Viewer extras (viewer-extras.js)
 * Paste-to-open and chat transcripts, self-contained share links, GitHub repository
 * import, slides, Jupyter notebooks, charts and CSV, DOCX export, side-by-side diff,
 * and PWA file handling. Extends MeowViewer.prototype; loaded after viewer.js.
 */
(function () {
  if (typeof MeowViewer === 'undefined') return;
  const P = MeowViewer.prototype;

  const ROLE_RE = /^\s*(?:[*_]{0,2})(You|User|Human|Me|Assistant|AI|ChatGPT|GPT|Claude|Gemini|Copilot|Llama|Bot|Model|System)(?: said)?(?:[*_]{0,2})\s*:\s*(.*)$/i;
  const USER_ROLES = ['you', 'user', 'human', 'me'];
  const PURIFY_OPTS = { ADD_TAGS: ['div', 'span'], ADD_ATTR: ['target', 'class', 'style', 'id'] };

  function uid() { return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

  function bytesToB64u(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uToBytes(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function deflate(text) {
    const bytes = new TextEncoder().encode(text);
    if (typeof CompressionStream === 'undefined') return { data: bytes, raw: true };
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(bytes);
    w.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return { data: new Uint8Array(buf), raw: false };
  }

  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(bytes);
    w.close();
    return new Response(ds.readable).text();
  }

  function parseCSV(text) {
    const first = text.split('\n', 1)[0] || '';
    const counts = { ',': (first.match(/,/g) || []).length, '\t': (first.match(/\t/g) || []).length, ';': (first.match(/;/g) || []).length };
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some((v) => v !== '')) rows.push(row);
    return rows;
  }

  /* ---------------------------------------------------------------- setup */

  P.initExtras = function () {
    this.bindPaste();
    this.bindLaunchQueue();
    this.bindExtraButtons();
    this.bindGistModal();
    this.handleHashLink();
  };

  P.bindExtraButtons = function () {
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind('presentBtn', () => this.presentSlides());
    bind('diffBtn', () => this.openDiffModal());
    bind('copyHashLinkBtn', () => this.copyHashLink());
    bind('exportDocxBtn', () => this.exportDocx());
    const form = document.getElementById('diffModalForm');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        this.closeModal('diffModal');
        this.showDiff(document.getElementById('diffA').value, document.getElementById('diffB').value);
      };
    }
  };

  P.addDocuments = function (docs, opts) {
    opts = opts || {};
    const files = docs.map((d) => Object.assign({ id: uid(), path: d.name, size: (d.content || '').length, lastModified: Date.now() }, d));
    if (!files.length) return [];
    this.files = [...files, ...this.files];
    this.activeFileId = files[0].id;
    if (this.autoSave) this.persistFiles();
    this.renderFileList();
    this.renderActiveFile();
    if (!opts.silent) showToast('Opened ' + files[0].name, 'success');
    return files;
  };

  P.addDocument = function (doc, opts) { return this.addDocuments([doc], opts)[0]; };

  P.titleFromMarkdown = function (text) {
    const m = (text || '').match(/^\s*#\s+(.+?)\s*$/m);
    return m ? m[1].replace(/[\\/:*?"<>|#`*_]+/g, '').trim().slice(0, 60) : '';
  };

  /* Content that is rendered may differ from what is stored (chat transcripts). */
  P.sourceForRender = function (file) {
    if (!file) return '';
    if (file.kind === 'chat') return this.chatToMarkdown(file.content);
    return file.content;
  };

  /* ------------------------------------------------------- paste to open */

  P.bindPaste = function () {
    document.addEventListener('paste', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.modal-overlay.active')) return;
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!text || text.trim().length < 2) return;
      e.preventDefault();
      this.openPastedText(text);
    });
  };

  P.openPastedText = function (text) {
    const isChat = this.looksLikeChat(text);
    const n = this.files.filter((f) => f.kind === 'paste' || f.kind === 'chat').length + 1;
    const title = this.titleFromMarkdown(text);
    const name = (title || (isChat ? 'Chat transcript ' + n : 'Pasted note ' + n)) + '.md';
    this.addDocument({ name, content: text, kind: isChat ? 'chat' : 'paste' }, { silent: true });
    showToast(isChat ? 'Pasted as a chat transcript' : 'Pasted as a new document', 'success');
  };

  P.looksLikeChat = function (text) {
    let hits = 0;
    const roles = new Set();
    for (const line of text.split('\n')) {
      const m = line.match(ROLE_RE);
      if (m) { hits++; roles.add(USER_ROLES.includes(m[1].toLowerCase()) ? 'user' : m[1].toLowerCase()); }
      if (hits >= 2 && roles.size >= 2) return true;
    }
    return false;
  };

  P.chatToMarkdown = function (text) {
    const out = [];
    let open = false;
    const close = () => { if (open) { out.push('', '</div>', ''); open = false; } };
    for (const line of text.split('\n')) {
      const m = line.match(ROLE_RE);
      if (m) {
        close();
        const key = m[1].toLowerCase();
        const cls = USER_ROLES.includes(key) ? 'user' : key === 'system' ? 'system' : 'assistant';
        const label = USER_ROLES.includes(key) ? 'You' : m[1].charAt(0).toUpperCase() + m[1].slice(1);
        out.push('<div class="chat-turn chat-' + cls + '">', '<div class="chat-role">' + label + '</div>', '');
        open = true;
        if (m[2] && m[2].trim()) out.push(m[2]);
      } else {
        out.push(line);
      }
    }
    close();
    return out.join('\n');
  };

  /* ------------------------------------------- self-contained share links */

  P.copyHashLink = async function () {
    const file = this.getActiveFile();
    if (!file) return;
    try {
      const { data, raw } = await deflate(file.content);
      const link = location.origin + location.pathname + '#' + (raw ? 'mdraw=' : 'md=') + bytesToB64u(data);
      if (link.length > 32000) {
        showToast('This link is ' + Math.round(link.length / 1024) + ' KB. Very long links may not work in every app.', 'info', 4500);
      }
      await copyToClipboard(link, 'Self-contained link copied. Anyone can open it, nothing is hosted.');
    } catch (err) {
      console.error('Share link failed:', err);
      showToast('Could not build the share link', 'danger');
    }
  };

  P.handleHashLink = async function () {
    const h = this.pendingHash || '';
    const m = h.match(/^#(md|mdraw)=(.+)$/);
    if (!m) return;
    try {
      const bytes = b64uToBytes(m[2]);
      const text = m[1] === 'md' ? await inflate(bytes) : new TextDecoder().decode(bytes);
      const name = (this.titleFromMarkdown(text) || 'Shared note') + '.md';
      this.pendingHash = '';
      this.addDocument({ name, content: text, kind: this.looksLikeChat(text) ? 'chat' : 'shared' }, { silent: true });
      showToast('Opened a shared note', 'success');
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    } catch (err) {
      console.error('Shared link decode failed:', err);
      this.pendingHash = '';
      showToast('This shared link could not be decoded in this browser.', 'danger', 5000);
    }
  };

  /* --------------------------------------------------- GitHub repositories */

  P.parseRepoUrl = function (url) {
    const m = (url || '').trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/#?]+)(?:\/(.*?))?)?\/?(?:[#?].*)?$/i);
    if (!m) return null;
    return { owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: m[3] || '', dir: (m[4] || '').replace(/\/+$/, '') };
  };

  P.openRepo = async function (info) {
    const api = 'https://api.github.com/repos/' + info.owner + '/' + info.repo;
    const headers = { Accept: 'application/vnd.github+json' };
    const limitMsg = 'GitHub API rate limit reached. Try again in a few minutes, or open individual files by URL.';
    showToast('Loading ' + info.owner + '/' + info.repo, 'info', 2500);

    let ref = info.ref;
    if (!ref) {
      const r = await fetch(api, { headers });
      if (!r.ok) throw new Error(r.status === 403 ? limitMsg : 'Repository not found, or it is private.');
      ref = (await r.json()).default_branch || 'main';
    }
    const t = await fetch(api + '/git/trees/' + encodeURIComponent(ref) + '?recursive=1', { headers });
    if (!t.ok) throw new Error(t.status === 403 ? limitMsg : 'Could not list the repository files.');
    const tree = (await t.json()).tree || [];
    const prefix = info.dir ? info.dir + '/' : '';
    const isReadme = (p) => /(^|\/)readme\.(md|markdown)$/i.test(p);
    let docs = tree.filter((n) => n.type === 'blob' && n.path.startsWith(prefix) && /\.(md|markdown|ipynb)$/i.test(n.path));
    docs.sort((a, b) => (isReadme(a.path) ? 0 : 1) - (isReadme(b.path) ? 0 : 1) || a.path.localeCompare(b.path));
    const LIMIT = 120;
    const truncated = docs.length > LIMIT;
    docs = docs.slice(0, LIMIT);
    if (!docs.length) throw new Error('No Markdown or notebook files found there.');

    const results = new Array(docs.length);
    let next = 0;
    const worker = async () => {
      while (next < docs.length) {
        const i = next++;
        const n = docs[i];
        const raw = 'https://raw.githubusercontent.com/' + info.owner + '/' + info.repo + '/' + ref + '/' + n.path;
        try {
          const res = await fetch(raw);
          if (!res.ok) continue;
          let content = await res.text();
          let kind;
          if (/\.ipynb$/i.test(n.path)) { content = this.notebookToMarkdown(JSON.parse(content)); kind = 'notebook'; }
          results[i] = { name: n.path.split('/').pop(), path: info.owner + '/' + info.repo + '/' + n.path, sourceUrl: raw, content, kind };
        } catch (e) {
          console.warn('Skipped', n.path, e);
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    const loaded = results.filter(Boolean);
    if (!loaded.length) throw new Error('Could not download any files from that repository.');
    this.addDocuments(loaded, { silent: true });
    showToast('Opened ' + loaded.length + ' files from ' + info.owner + '/' + info.repo + (truncated ? ' (first ' + LIMIT + ')' : ''), 'success', 4000);
  };

  /* ------------------------------------------------- GitHub Gist short links */

  P.gistToken = function () {
    try { return localStorage.getItem('meowmd_github_token') || sessionStorage.getItem('meowmd_github_token') || ''; } catch (e) { return ''; }
  };

  P.openGistById = async function (id) {
    showToast('Fetching Gist', 'info', 1500);
    try {
      const r = await fetch('https://api.github.com/gists/' + id, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error(r.status === 404 ? 'That Gist was not found. It may have been deleted or made private.' : 'GitHub returned ' + r.status);
      const g = await r.json();
      const files = Object.values(g.files || {});
      const pick = files.find((f) => /\.(md|markdown)$/i.test(f.filename)) || files.find((f) => /\.(ipynb|csv|txt)$/i.test(f.filename)) || files[0];
      if (!pick) throw new Error('That Gist has no files.');
      let content = pick.truncated || !pick.content ? await (await fetch(pick.raw_url)).text() : pick.content;
      let kind;
      if (/\.ipynb$/i.test(pick.filename)) { content = this.notebookToMarkdown(JSON.parse(content)); kind = 'notebook'; }
      else if (/\.(csv|tsv)$/i.test(pick.filename)) { content = '# ' + pick.filename + '\n\n' + this.csvToMarkdownTable(content); kind = 'csv'; }
      const existing = this.files.find((f) => f.gistId === g.id);
      if (existing) { existing.content = content; existing.lastModified = Date.now(); this.activeFileId = existing.id; if (this.autoSave) this.persistFiles(); this.renderFileList(); this.renderActiveFile(); }
      else this.addDocument({ name: pick.filename, path: 'gist/' + g.id + '/' + pick.filename, sourceUrl: pick.raw_url, gistId: g.id, gistFile: pick.filename, content, kind }, { silent: true });
      showToast('Opened ' + pick.filename + ' from Gist', 'success');
    } catch (err) {
      console.error('Gist open failed:', err);
      const msg = /Failed to fetch|NetworkError/i.test(err.message || '') ? 'Could not reach GitHub for that Gist. Check your connection, or the Gist may be too large for the API.' : (err.message || 'Could not open that Gist');
      showToast(msg, 'danger', 5000);
    }
  };

  /* Publishes (or updates) the active document as a secret Gist and copies the short link. */
  P.publishGist = async function () {
    const file = this.getActiveFile();
    if (!file) return;
    const token = this.gistToken();
    if (!token) { this.openGistModal(); return; }
    showToast(file.gistId ? 'Updating Gist' : 'Publishing to a secret Gist', 'info', 2000);
    const name = /\.(md|markdown|txt|ipynb|csv)$/i.test(file.name) ? file.name : file.name + '.md';
    const payload = { description: 'Shared from MeowMD', public: false, files: {} };
    payload.files[file.gistFile || name] = { content: file.content || ' ' };
    try {
      const url = 'https://api.github.com/gists' + (file.gistId ? '/' + file.gistId : '');
      const r = await fetch(url, {
        method: file.gistId ? 'PATCH' : 'POST',
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.status === 401) {
        try { localStorage.removeItem('meowmd_github_token'); sessionStorage.removeItem('meowmd_github_token'); } catch (e) {}
        showToast('GitHub rejected the token. Paste a new one.', 'danger', 4000);
        this.openGistModal();
        return;
      }
      if (r.status === 404 && file.gistId) { file.gistId = null; file.gistFile = null; return this.publishGist(); }
      if (!r.ok) throw new Error('GitHub returned ' + r.status + (r.status === 403 ? ' (rate limit or missing gist scope)' : ''));
      const g = await r.json();
      file.gistId = g.id;
      file.gistFile = file.gistFile || name;
      const f = g.files && g.files[file.gistFile];
      if (f && f.raw_url) file.sourceUrl = f.raw_url;
      if (this.autoSave) this.persistFiles();
      this.renderFileList();
      const linkBtn = document.getElementById('copyLinkBtn');
      if (linkBtn) linkBtn.hidden = false;
      const gistBtn = document.getElementById('publishGistBtn');
      if (gistBtn) gistBtn.querySelector('span').textContent = 'Update Gist link';
      this.syncAddressBar(file);
      await copyToClipboard(this.shareLinkFor(file), 'Short link copied. The note lives in a secret Gist on your GitHub.');
    } catch (err) {
      console.error('Gist publish failed:', err);
      const msg = /Failed to fetch|NetworkError/i.test(err.message || '') ? 'Could not reach GitHub. Check your connection and try again.' : (err.message || 'Could not publish to GitHub');
      showToast(msg, 'danger', 5000);
    }
  };

  P.openGistModal = function () {
    const input = document.getElementById('gistTokenInput');
    if (input) input.value = '';
    this.openModal('gistModal');
    setTimeout(() => input && input.focus(), 50);
  };

  P.bindGistModal = function () {
    const form = document.getElementById('gistModalForm');
    if (!form) return;
    form.onsubmit = (e) => {
      e.preventDefault();
      const token = (document.getElementById('gistTokenInput').value || '').trim();
      if (!token) return;
      const remember = document.getElementById('gistRemember').checked;
      try {
        if (remember) localStorage.setItem('meowmd_github_token', token); else sessionStorage.setItem('meowmd_github_token', token);
      } catch (err) {}
      this.closeModal('gistModal');
      this.publishGist();
    };
    const forget = document.getElementById('gistForgetBtn');
    if (forget) forget.onclick = () => {
      try { localStorage.removeItem('meowmd_github_token'); sessionStorage.removeItem('meowmd_github_token'); } catch (e) {}
      showToast('GitHub token removed from this device', 'info');
      this.closeModal('gistModal');
    };
  };

  /* ------------------------------------------------------ Jupyter & CSV */

  P.notebookToMarkdown = function (nb) {
    const cells = nb.cells || (nb.worksheets && nb.worksheets[0] && nb.worksheets[0].cells) || [];
    const meta = nb.metadata || {};
    const lang = (meta.language_info && meta.language_info.name) || (meta.kernelspec && meta.kernelspec.language) || 'python';
    const text = (s) => (Array.isArray(s) ? s.join('') : (s || '')).replace(/\u001b\[[0-9;]*m/g, '');
    const fence = (body, l) => ['```' + (l || 'text'), body.replace(/\n$/, ''), '```', ''];
    const out = [];
    cells.forEach((c) => {
      if (c.cell_type === 'markdown') {
        out.push(text(c.source).trim(), '');
      } else if (c.cell_type === 'code') {
        const n = c.execution_count != null ? c.execution_count : ' ';
        out.push('<div class="nb-cell">', '<div class="nb-label">In [' + n + ']</div>', '');
        out.push(...fence(text(c.source), lang));
        (c.outputs || []).forEach((o) => {
          if (o.output_type === 'stream') {
            out.push('<div class="nb-label nb-out">Out</div>', '', ...fence(text(o.text)));
          } else if (o.output_type === 'error') {
            out.push('<div class="nb-label nb-err">' + (o.ename || 'Error') + '</div>', '', ...fence(text((o.traceback || []).join('\n'))));
          } else if (o.data) {
            const d = o.data;
            if (d['image/png']) out.push('![output](data:image/png;base64,' + text(d['image/png']).replace(/\s/g, '') + ')', '');
            else if (d['image/jpeg']) out.push('![output](data:image/jpeg;base64,' + text(d['image/jpeg']).replace(/\s/g, '') + ')', '');
            else if (d['image/svg+xml']) out.push(text(d['image/svg+xml']).replace(/\n\s*\n/g, '\n'), '');
            else if (d['text/markdown']) out.push(text(d['text/markdown']), '');
            else if (d['text/html']) out.push(text(d['text/html']).replace(/\n\s*\n/g, '\n'), '');
            else if (d['text/plain']) out.push('<div class="nb-label nb-out">Out</div>', '', ...fence(text(d['text/plain'])));
          }
        });
        out.push('</div>', '');
      } else if (c.cell_type === 'raw') {
        out.push(...fence(text(c.source)));
      }
    });
    return out.join('\n');
  };

  P.csvToMarkdownTable = function (text) {
    const rows = parseCSV((text || '').replace(/^﻿/, '')).slice(0, 5000);
    if (!rows.length) return '';
    const width = Math.max.apply(null, rows.map((r) => r.length));
    const esc = (c) => { const v = String(c == null ? '' : c).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim(); return v || ' '; };
    const line = (r) => '| ' + Array.from({ length: width }, (_, i) => esc(r[i])).join(' | ') + ' |';
    return [line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |'].concat(rows.slice(1).map(line)).join('\n');
  };

  /* ------------------------------------------------- charts & csv blocks */

  P.renderDataBlocks = async function (root) {
    // CSV fences become tables
    root.querySelectorAll('pre code.language-csv, pre code.language-tsv').forEach((node) => {
      const md = this.csvToMarkdownTable(node.textContent);
      if (!md || !this.md) return;
      const wrap = document.createElement('div');
      wrap.className = 'csv-table';
      let html = this.md.render(md);
      if (window.DOMPurify) html = window.DOMPurify.sanitize(html, PURIFY_OPTS);
      wrap.innerHTML = html;
      node.closest('pre').replaceWith(wrap);
    });

    // Chart fences become Chart.js canvases
    const charts = root.querySelectorAll('pre code.language-chart');
    if (!charts.length || !window.LazyEngines) return;
    let Chart;
    try { Chart = await window.LazyEngines.ensureChartJS(); } catch (e) { console.error('Chart.js failed to load', e); return; }
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = dark ? '#8a8a93' : '#71717a';
    const gridColor = dark ? '#26262a' : '#e4e4e7';
    const palette = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
    charts.forEach((node) => {
      const wrap = document.createElement('div');
      wrap.className = 'chart-wrapper';
      const canvas = document.createElement('canvas');
      wrap.appendChild(canvas);
      node.closest('pre').replaceWith(wrap);
      try {
        let cfg = JSON.parse(node.textContent);
        if (!cfg.data && (cfg.labels || cfg.series)) {
          const series = cfg.series || {};
          const datasets = Object.keys(series).map((k, i) => ({ label: k, data: series[k] }));
          cfg = { type: cfg.type || 'bar', data: { labels: cfg.labels || [], datasets }, options: cfg.options || {} };
        }
        cfg.type = cfg.type || 'bar';
        const circular = ['pie', 'doughnut', 'polarArea', 'radar'].includes(cfg.type);
        (cfg.data.datasets || []).forEach((d, i) => {
          const color = palette[i % palette.length];
          if (!d.backgroundColor) d.backgroundColor = circular ? palette.slice(0, (d.data || []).length).map((c) => c + 'cc') : (cfg.type === 'line' ? color + '33' : color + 'cc');
          if (!d.borderColor) d.borderColor = circular ? '#ffffff00' : color;
          if (d.borderWidth == null) d.borderWidth = 2;
          if (cfg.type === 'line' && d.tension == null) d.tension = 0.3;
        });
        cfg.options = Object.assign({ responsive: true, maintainAspectRatio: true, aspectRatio: 2 }, cfg.options || {});
        cfg.options.plugins = Object.assign({ legend: { labels: { color: textColor } } }, cfg.options.plugins || {});
        if (cfg.title && !cfg.options.plugins.title) cfg.options.plugins.title = { display: true, text: cfg.title, color: textColor };
        if (!circular && !cfg.options.scales) {
          cfg.options.scales = { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } };
        }
        new Chart(canvas, cfg);
      } catch (e) {
        wrap.innerHTML = '<pre class="chart-error">Chart error: ' + this.escapeHTML(e.message) + '</pre>';
      }
    });
  };

  /* ---------------------------------------------------------------- slides */

  P.splitSlides = function (raw) {
    let text = (raw || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    let parts = text.split(/\r?\n(?:---|\*\*\*|___)[ \t]*(?:\r?\n|$)/);
    if (parts.filter((p) => p.trim()).length < 2) parts = text.split(/\r?\n(?=#{1,2}\s)/);
    return parts.map((p) => p.trim()).filter(Boolean);
  };

  P.presentSlides = async function () {
    const file = this.getActiveFile();
    if (!file || !this.md) { showToast('Open a document first', 'info'); return; }
    const source = this.sourceForRender(file);
    const slides = this.splitSlides(source);
    if (!slides.length) return;

    const overlay = document.createElement('div');
    overlay.className = 'slides-overlay';
    overlay.innerHTML =
      '<div class="slides-stage"></div>' +
      '<div class="slides-bar">' +
      '<button class="slides-btn" data-act="prev" aria-label="Previous slide"><i class="fa-solid fa-chevron-left"></i></button>' +
      '<span class="slides-counter"></span>' +
      '<button class="slides-btn" data-act="next" aria-label="Next slide"><i class="fa-solid fa-chevron-right"></i></button>' +
      '<span class="slides-hint">Arrow keys or click to navigate</span>' +
      '<button class="slides-btn slides-exit" data-act="exit">Exit</button>' +
      '</div>';
    const stage = overlay.querySelector('.slides-stage');
    slides.forEach((md) => {
      const sec = document.createElement('section');
      sec.className = 'slide markdown-body';
      let html = this.md.render(md);
      if (window.DOMPurify) html = window.DOMPurify.sanitize(html, PURIFY_OPTS);
      sec.innerHTML = '<div class="slide-inner">' + html + '</div>';
      stage.appendChild(sec);
    });
    document.body.appendChild(overlay);

    let idx = 0;
    const total = slides.length;
    const counter = overlay.querySelector('.slides-counter');
    const show = (i) => {
      idx = Math.max(0, Math.min(total - 1, i));
      stage.querySelectorAll('.slide').forEach((s, k) => s.classList.toggle('active', k === idx));
      counter.textContent = (idx + 1) + ' / ' + total;
    };
    let exited = false;
    const exit = () => {
      if (exited) return;
      exited = true;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', onFs);
      overlay.remove();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    const onFs = () => { if (!document.fullscreenElement) exit(); };
    const onKey = (e) => {
      if (['ArrowRight', ' ', 'PageDown', 'Enter', 'ArrowDown'].includes(e.key)) { e.preventDefault(); show(idx + 1); }
      else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(e.key)) { e.preventDefault(); show(idx - 1); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(total - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); exit(); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelectorAll('.slides-btn').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); const a = b.dataset.act; if (a === 'prev') show(idx - 1); else if (a === 'next') show(idx + 1); else exit(); };
    });
    stage.onclick = (e) => {
      if (e.target.closest('a, button, input, summary')) return;
      const r = stage.getBoundingClientRect();
      show(e.clientX - r.left > r.width / 2 ? idx + 1 : idx - 1);
    };
    let touchX = null;
    overlay.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener('touchend', (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 40) show(dx < 0 ? idx + 1 : idx - 1);
      touchX = null;
    });
    show(0);
    this.activeSlides = { exit, show, get index() { return idx; }, total };

    try {
      await overlay.requestFullscreen();
      document.addEventListener('fullscreenchange', onFs);
    } catch (e) { /* fullscreen is optional */ }
    await this.processSmartExtensions(source, overlay);
  };

  /* ------------------------------------------------------------- DOCX */

  P.exportDocx = async function () {
    const file = this.getActiveFile();
    if (!file || !this.contentEl) return;
    showToast('Preparing Word document', 'info', 2000);
    try {
      const docx = await window.LazyEngines.ensureDocx();
      const blob = await this.buildDocx(docx, this.contentEl, file);
      const name = file.name.replace(/\.(md|markdown|txt|ipynb|csv)$/i, '') + '.docx';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      showToast('Exported ' + name, 'success');
    } catch (err) {
      console.error('DOCX export failed:', err);
      showToast('Could not export to Word', 'danger');
    }
  };

  P.buildDocx = async function (docx, root, file) {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, BorderStyle, ShadingType } = docx;

    const imageRun = (img) => {
      try {
        let src = img.getAttribute('src') || '';
        if (img.tagName === 'CANVAS') src = img.toDataURL('image/png');
        const m = src.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/);
        if (!m) return null;
        const bytes = b64uToBytes(m[2].replace(/-/g, '+').replace(/_/g, '/'));
        const natW = img.naturalWidth || img.width || 600;
        const natH = img.naturalHeight || img.height || 400;
        const w = Math.min(natW, 560);
        const h = Math.round(natH * (w / natW));
        return new ImageRun({ data: bytes, transformation: { width: w, height: h } });
      } catch (e) { return null; }
    };

    const runs = (node, st) => {
      st = st || {};
      const out = [];
      node.childNodes.forEach((ch) => {
        if (ch.nodeType === 3) {
          const t = ch.nodeValue.replace(/\s+/g, ' ');
          if (!t) return;
          out.push(new TextRun({
            text: t, bold: st.bold, italics: st.italic, strike: st.strike,
            underline: st.underline ? {} : undefined, superScript: st.sup, subScript: st.sub,
            color: st.link ? '2563EB' : undefined,
            font: st.code ? 'Consolas' : undefined, size: st.code ? 19 : undefined,
            shading: st.code ? { type: ShadingType.CLEAR, fill: 'F4F4F5' } : undefined
          }));
          return;
        }
        if (ch.nodeType !== 1) return;
        const tag = ch.tagName.toLowerCase();
        if (ch.classList.contains('code-copy-btn')) return;
        if (tag === 'br') { out.push(new TextRun({ break: 1 })); return; }
        if (tag === 'a' && ch.getAttribute('href')) {
          out.push(new ExternalHyperlink({ link: ch.getAttribute('href'), children: runs(ch, Object.assign({}, st, { underline: true, link: true })) }));
          return;
        }
        if (tag === 'img' || tag === 'canvas') { const r = imageRun(ch); out.push(r || new TextRun({ text: '[' + (ch.alt || 'image') + ']' })); return; }
        if (tag === 'input') { out.push(new TextRun({ text: ch.checked ? '☑ ' : '☐ ' })); return; }
        if (tag === 'svg') { out.push(new TextRun({ text: '[diagram]', italics: true })); return; }
        if (ch.classList.contains('katex') || ch.classList.contains('katex-display')) {
          const ann = ch.querySelector('annotation');
          out.push(new TextRun({ text: ann ? ann.textContent : ch.textContent, italics: true }));
          return;
        }
        const ns = Object.assign({}, st);
        if (tag === 'strong' || tag === 'b') ns.bold = true;
        if (tag === 'em' || tag === 'i') ns.italic = true;
        if (tag === 's' || tag === 'del' || tag === 'strike') ns.strike = true;
        if (tag === 'u' || tag === 'ins') ns.underline = true;
        if (tag === 'code' || tag === 'kbd') ns.code = true;
        if (tag === 'sup') ns.sup = true;
        if (tag === 'sub') ns.sub = true;
        out.push(...runs(ch, ns));
      });
      return out;
    };

    const blocks = (node, ctx) => {
      ctx = ctx || { level: 0, quote: false };
      const out = [];
      node.childNodes.forEach((el) => {
        if (el.nodeType === 3) {
          if (el.nodeValue.trim()) out.push(new Paragraph({ children: [new TextRun(el.nodeValue.trim())] }));
          return;
        }
        if (el.nodeType !== 1) return;
        const tag = el.tagName.toLowerCase();
        const hm = tag.match(/^h([1-6])$/);
        if (hm) { out.push(new Paragraph({ heading: HeadingLevel['HEADING_' + hm[1]], children: runs(el) })); return; }
        if (tag === 'p') {
          const img = el.children.length === 1 && (el.children[0].tagName === 'IMG') ? el.children[0] : null;
          if (img) { const r = imageRun(img); out.push(new Paragraph({ children: [r || new TextRun({ text: '[' + (img.alt || 'image') + ']' })] })); return; }
          out.push(new Paragraph({ children: runs(el), spacing: { after: 160 }, indent: ctx.quote ? { left: 720 } : undefined }));
          return;
        }
        if (tag === 'ul' || tag === 'ol') {
          Array.from(el.children).forEach((li) => {
            if (li.tagName !== 'LI') return;
            const shallow = li.cloneNode(true);
            shallow.querySelectorAll('ul, ol, pre').forEach((n) => n.remove());
            const listOpt = tag === 'ul' ? { bullet: { level: Math.min(ctx.level, 2) } } : { numbering: { reference: 'numbers', level: Math.min(ctx.level, 2) } };
            out.push(new Paragraph(Object.assign({ children: runs(shallow), spacing: { after: 60 } }, listOpt)));
            Array.from(li.children).forEach((c) => {
              if (c.tagName === 'UL' || c.tagName === 'OL' || c.tagName === 'PRE') {
                const w = document.createElement('div'); w.appendChild(c.cloneNode(true));
                out.push(...blocks(w, { level: ctx.level + 1, quote: ctx.quote }));
              }
            });
          });
          return;
        }
        if (tag === 'pre') {
          const lines = el.textContent.replace(/\n$/, '').split('\n');
          lines.forEach((ln) => out.push(new Paragraph({
            children: [new TextRun({ text: ln || ' ', font: 'Consolas', size: 18 })],
            shading: { type: ShadingType.CLEAR, fill: 'F4F4F5' }, spacing: { after: 0 }, indent: { left: 200 }
          })));
          out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
          return;
        }
        if (tag === 'blockquote') { out.push(...blocks(el, { level: ctx.level, quote: true })); return; }
        if (tag === 'hr') { out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D4D4D8', space: 1 } }, spacing: { after: 200 } })); return; }
        if (tag === 'table') {
          const rows = Array.from(el.querySelectorAll('tr')).map((tr) => new TableRow({
            children: Array.from(tr.children).map((cell) => new TableCell({
              children: [new Paragraph({ children: runs(cell, { bold: cell.tagName === 'TH' }) })],
              shading: cell.tagName === 'TH' ? { type: ShadingType.CLEAR, fill: 'F4F4F5' } : undefined
            }))
          }));
          if (rows.length) out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
          out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
          return;
        }
        if (tag === 'img' || tag === 'canvas') { const r = imageRun(el); out.push(new Paragraph({ children: [r || new TextRun({ text: '[image]' })] })); return; }
        if (tag === 'details') {
          const sum = el.querySelector('summary');
          if (sum) out.push(new Paragraph({ children: runs(sum, { bold: true }) }));
          const w = el.cloneNode(true); const s2 = w.querySelector('summary'); if (s2) s2.remove();
          out.push(...blocks(w, ctx));
          return;
        }
        if (el.classList.contains('mermaid-wrapper')) { out.push(new Paragraph({ children: [new TextRun({ text: '[diagram: see the original document]', italics: true })] })); return; }
        if (el.classList.contains('chart-wrapper')) {
          const c = el.querySelector('canvas'); const r = c ? imageRun(c) : null;
          out.push(new Paragraph({ children: [r || new TextRun({ text: '[chart]', italics: true })] }));
          return;
        }
        if (el.classList.contains('katex-display')) { const ann = el.querySelector('annotation'); out.push(new Paragraph({ children: [new TextRun({ text: ann ? ann.textContent : el.textContent, italics: true })], alignment: AlignmentType.CENTER })); return; }
        if (el.classList.contains('markdown-alert')) {
          const title = el.querySelector('.markdown-alert-title');
          if (title) out.push(new Paragraph({ children: [new TextRun({ text: title.textContent.trim(), bold: true })], indent: { left: 720 } }));
          const body = el.querySelector('.markdown-alert-content') || el;
          out.push(...blocks(body, { level: ctx.level, quote: true }));
          return;
        }
        if (el.classList.contains('chat-role') || el.classList.contains('nb-label')) { out.push(new Paragraph({ children: [new TextRun({ text: el.textContent.trim(), bold: true, size: 18, color: '71717A' })] })); return; }
        if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'span') { out.push(...blocks(el, ctx)); return; }
      });
      return out;
    };

    const children = blocks(root);
    const doc = new Document({
      creator: 'MeowMD',
      title: file.name,
      numbering: {
        config: [{
          reference: 'numbers',
          levels: [0, 1, 2].map((l) => ({ level: l, format: 'decimal', text: '%' + (l + 1) + '.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } }))
        }]
      },
      styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
      sections: [{ children: children.length ? children : [new Paragraph('')] }]
    });
    return Packer.toBlob(doc);
  };

  /* ---------------------------------------------------------------- diff */

  function diffLines(a, b) {
    const n = a.length, m = b.length;
    let s = 0;
    while (s < n && s < m && a[s] === b[s]) s++;
    let e = 0;
    while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
    const A = a.slice(s, n - e), B = b.slice(s, m - e);
    const N = A.length, M = B.length;
    const mid = [];
    if (N * M > 6e6) {
      for (let i = 0; i < N; i++) mid.push({ t: '-', a: s + i });
      for (let j = 0; j < M; j++) mid.push({ t: '+', b: s + j });
    } else {
      const W = M + 1;
      const dp = new Uint32Array((N + 1) * W);
      for (let i = N - 1; i >= 0; i--) {
        for (let j = M - 1; j >= 0; j--) {
          dp[i * W + j] = A[i] === B[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < N && j < M) {
        if (A[i] === B[j]) { mid.push({ t: '=', a: s + i, b: s + j }); i++; j++; }
        else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { mid.push({ t: '-', a: s + i }); i++; }
        else { mid.push({ t: '+', b: s + j }); j++; }
      }
      while (i < N) mid.push({ t: '-', a: s + i++ });
      while (j < M) mid.push({ t: '+', b: s + j++ });
    }
    const ops = [];
    for (let i = 0; i < s; i++) ops.push({ t: '=', a: i, b: i });
    ops.push(...mid);
    for (let k = e; k > 0; k--) ops.push({ t: '=', a: n - k, b: m - k });
    return ops;
  }

  P.openDiffModal = function () {
    if (this.files.length < 2) { showToast('Open at least two documents to compare them', 'info'); return; }
    const fill = (sel, selectedId) => {
      sel.innerHTML = this.files.map((f) => '<option value="' + f.id + '"' + (f.id === selectedId ? ' selected' : '') + '>' + this.escapeHTML(f.name) + '</option>').join('');
    };
    const a = document.getElementById('diffA'), b = document.getElementById('diffB');
    const other = this.files.find((f) => f.id !== this.activeFileId);
    fill(a, this.activeFileId);
    fill(b, other ? other.id : this.activeFileId);
    this.openModal('diffModal');
  };

  P.showDiff = function (aId, bId) {
    const fa = this.files.find((f) => f.id === aId), fb = this.files.find((f) => f.id === bId);
    if (!fa || !fb) return;
    const CAP = 4000;
    const la = fa.content.split('\n').slice(0, CAP), lb = fb.content.split('\n').slice(0, CAP);
    const ops = diffLines(la, lb);
    let adds = 0, dels = 0;
    const esc = (s) => this.escapeHTML(s === '' ? ' ' : s);
    const rows = [];
    const flush = (dq, iq) => {
      const len = Math.max(dq.length, iq.length);
      for (let k = 0; k < len; k++) {
        const d = dq[k], i = iq[k];
        rows.push(
          (d ? '<div class="dc ln del">' + (d.a + 1) + '</div><div class="dc tx del">' + esc(la[d.a]) + '</div>' : '<div class="dc ln pad"></div><div class="dc tx pad"></div>') +
          (i ? '<div class="dc ln ins">' + (i.b + 1) + '</div><div class="dc tx ins">' + esc(lb[i.b]) + '</div>' : '<div class="dc ln pad"></div><div class="dc tx pad"></div>')
        );
      }
      dq.length = 0; iq.length = 0;
    };
    const dq = [], iq = [];
    ops.forEach((op) => {
      if (op.t === '=') {
        flush(dq, iq);
        rows.push('<div class="dc ln">' + (op.a + 1) + '</div><div class="dc tx">' + esc(la[op.a]) + '</div><div class="dc ln">' + (op.b + 1) + '</div><div class="dc tx">' + esc(lb[op.b]) + '</div>');
      } else if (op.t === '-') { dels++; dq.push(op); }
      else { adds++; iq.push(op); }
    });
    flush(dq, iq);

    const overlay = document.createElement('div');
    overlay.className = 'diff-overlay';
    overlay.innerHTML =
      '<div class="diff-head">' +
      '<div class="diff-names"><span><i class="fa-regular fa-file-lines"></i> ' + this.escapeHTML(fa.name) + '</span><span><i class="fa-regular fa-file-lines"></i> ' + this.escapeHTML(fb.name) + '</span></div>' +
      '<span class="diff-stats"><span class="diff-stat-add">+' + adds + '</span> <span class="diff-stat-del">−' + dels + '</span>' +
      (la.length === CAP || lb.length === CAP ? ' <span class="diff-note">(first ' + CAP + ' lines)</span>' : '') + '</span>' +
      '<button class="btn btn-outline diff-close">Close</button>' +
      '</div>' +
      '<div class="diff-body"><div class="diff-table">' + rows.join('') + '</div></div>';
    document.body.appendChild(overlay);
    const close = () => { document.removeEventListener('keydown', onKey, true); overlay.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.diff-close').onclick = close;
    if (adds === 0 && dels === 0) showToast('The two documents are identical', 'info');
  };

  /* ------------------------------------------------------ PWA file handling */

  P.bindLaunchQueue = function () {
    if (!('launchQueue' in window) || !window.launchQueue.setConsumer) return;
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files || !params.files.length) return;
      const files = [];
      for (const h of params.files) { try { files.push(await h.getFile()); } catch (e) {} }
      if (files.length) this.handleFiles(files);
    });
  };
})();
