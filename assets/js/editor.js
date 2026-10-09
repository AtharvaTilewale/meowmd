/**
 * MeowMD Markdown Generator & WYSIWYG Editor (editor.js)
 * Standard GFM compliant engine ensuring high fidelity across GitHub,
 * VS Code, Obsidian, Notion, GitLab, and all Markdown renderers.
 */

class MeowEditor {
  constructor() {
    this.visualEditor = document.getElementById('visualEditor');
    this.markdownOutput = document.getElementById('markdownOutput');
    this.fileInput = document.getElementById('editorFileInput');
    this.turndown = null;
    this.mdParser = null;
    this.isSyncing = false;
    this.activeView = 'split';
    this.savedRange = null;

    this.initParsers();
    this.initEditorContent();
    this.bindToolbar();
    this.bindEvents();
    this.setupModals();
    this.syncVisualToMarkdown();
    this.updateStats();
  }

  initParsers() {
    // 1. Initialize Markdown-it for Preview & Sync (Markdown -> HTML)
    try {
      if (window.markdownit) {
        this.mdParser = window.markdownit({
          html: true,
          linkify: false,
          typographer: false,
          breaks: false
        });
      }
    } catch (e) {
      console.warn('Markdown-it init error:', e);
    }

    // 2. Initialize Turndown for Standard GFM Generation (HTML -> Markdown)
    try {
      if (window.TurndownService) {
        this.turndown = new window.TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          hr: '---',
          bulletListMarker: '-',
          emDelimiter: '*',
          strongDelimiter: '**'
        });

        var self = this;

        // 0. List items: single space after the marker, nested lists indented to the marker width
        this.turndown.addRule('tightListItem', {
          filter: 'li',
          replacement: function (content, node, options) {
            content = content
              .replace(/^\n+/, '')
              .replace(/\n+$/, '\n');
            var prefix = options.bulletListMarker + ' ';
            var parent = node.parentNode;
            if (parent && parent.nodeName === 'OL') {
              var start = parent.getAttribute('start');
              var index = Array.prototype.indexOf.call(parent.children, node);
              prefix = (start ? Number(start) + index : index + 1) + '. ';
            }
            var indent = new Array(prefix.length + 1).join(' ');
            content = content.replace(/\n/gm, '\n' + indent);
            return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
          }
        });

        // 1. Strikethrough: ~~text~~ (GFM standard)
        this.turndown.addRule('strikethrough', {
          filter: ['del', 's', 'strike'],
          replacement: function (content) {
            return content.trim() ? '~~' + content.trim() + '~~' : '';
          }
        });

        // 2. Underline: <u>text</u> (Standard GFM supported HTML tag)
        this.turndown.addRule('underline', {
          filter: ['u', 'ins'],
          replacement: function (content) {
            return content.trim() ? '<u>' + content.trim() + '</u>' : '';
          }
        });

        // 3. Subscript: <sub>text</sub>
        this.turndown.addRule('subscript', {
          filter: ['sub'],
          replacement: function (content) {
            return content.trim() ? '<sub>' + content.trim() + '</sub>' : '';
          }
        });

        // 4. Superscript: <sup>text</sup>
        this.turndown.addRule('superscript', {
          filter: ['sup'],
          replacement: function (content) {
            return content.trim() ? '<sup>' + content.trim() + '</sup>' : '';
          }
        });

        // 5. Highlight Marker: <mark>text</mark>
        this.turndown.addRule('highlightMark', {
          filter: ['mark'],
          replacement: function (content) {
            return content.trim() ? '<mark>' + content.trim() + '</mark>' : '';
          }
        });

        // 6. Keyboard Key: <kbd>text</kbd>
        this.turndown.addRule('kbdTag', {
          filter: ['kbd'],
          replacement: function (content) {
            return content.trim() ? '<kbd>' + content.trim() + '</kbd>' : '';
          }
        });

        // 7. Horizontal Divider: --- with blank line padding
        this.turndown.addRule('horizontalRule', {
          filter: ['hr'],
          replacement: function () {
            return '\n\n---\n\n';
          }
        });

        // 8. Task Lists / Checkboxes: - [ ] and - [x] with clean spacing
        this.turndown.addRule('taskListItem', {
          filter: function (node) {
            return (
              node.nodeName === 'LI' &&
              (node.classList.contains('task-list-item') ||
               node.getAttribute('data-list') === 'checked' ||
               node.getAttribute('data-list') === 'unchecked' ||
               Boolean(node.querySelector('input[type="checkbox"]')))
            );
          },
          replacement: function (content, node) {
            var checkbox = node.querySelector('input[type="checkbox"]');
            var isChecked = checkbox ? checkbox.checked : node.getAttribute('data-list') === 'checked';
            var prefix = isChecked ? '- [x] ' : '- [ ] ';
            var clean = content
              .replace(/^-\s*\[[ xX]\]\s*/i, '')
              .replace(/^-\s+/i, '')
              .trim();
            return prefix + clean + '\n';
          }
        });

        // 9. Fenced Code Blocks: ```language\ncode\n```
        this.turndown.addRule('codeBlocks', {
          filter: ['pre'],
          replacement: function (content, node) {
            var codeEl = node.querySelector('code') || node;
            var clone = codeEl.cloneNode(true);
            clone.querySelectorAll('br').forEach(function (br) { br.replaceWith('\n'); });
            var code = (clone.textContent || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trimEnd();
            var lang = '';
            if (codeEl && codeEl.className) {
              var match = codeEl.className.match(/language-(\w+)/);
              if (match) lang = match[1];
            }
            if (!lang && node.getAttribute('data-language')) {
              lang = node.getAttribute('data-language');
            }
            return '\n\n```' + lang + '\n' + code + '\n```\n\n';
          }
        });

        // 10. Inline Code: `code`
        this.turndown.addRule('inlineCode', {
          filter: function (node) {
            var isCode = node.nodeName === 'CODE';
            var isInsidePre = node.closest && node.closest('pre');
            return isCode && !isInsidePre;
          },
          replacement: function (content) {
            return content.trim() ? '`' + content.trim() + '`' : '';
          }
        });

        // 11. GFM Compliant Tables:
        // | Header 1 | Header 2 |
        // | --- | --- |
        // | Val 1 | Val 2 |
        this.turndown.addRule('gfmTables', {
          filter: ['table'],
          replacement: function (content, node) {
            var rows = Array.from(node.querySelectorAll('tr'));
            if (!rows.length) return '';

            var tableData = [];
            var maxCols = 0;
            var alignments = [];

            rows.forEach(function (tr, rIdx) {
              var cells = Array.from(tr.querySelectorAll('th, td')).map(function (cell, cIdx) {
                var align = (cell.getAttribute('align') || cell.style.textAlign || '').toLowerCase();
                if (rIdx === 0 && !alignments[cIdx]) {
                  alignments[cIdx] = align;
                }
                return cell.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
              });
              if (cells.length > maxCols) maxCols = cells.length;
              tableData.push(cells);
            });

            if (!tableData.length || maxCols === 0) return '';

            // Ensure equal columns across all rows
            tableData.forEach(function (row) {
              while (row.length < maxCols) row.push('');
            });

            var mdTable = '\n\n';
            // Header Row
            var headerRow = tableData[0];
            mdTable += '| ' + headerRow.join(' | ') + ' |\n';

            // Alignment Delimiters
            var sepRow = [];
            for (var c = 0; c < maxCols; c++) {
              var a = alignments[c];
              if (a === 'center') sepRow.push(':---:');
              else if (a === 'right') sepRow.push('---:');
              else sepRow.push('---');
            }
            mdTable += '| ' + sepRow.join(' | ') + ' |\n';

            // Body Rows
            for (var i = 1; i < tableData.length; i++) {
              mdTable += '| ' + tableData[i].join(' | ') + ' |\n';
            }
            return mdTable + '\n';
          }
        });

        // 12. GitHub Alerts in standard blockquote format (> [!NOTE])
        this.turndown.addRule('githubAlerts', {
          filter: function (node) {
            return node.nodeName === 'DIV' && node.classList && node.classList.contains('markdown-alert');
          },
          replacement: function (content, node) {
            var typeMatch = node.className.match(/markdown-alert-(\w+)/);
            var type = typeMatch ? typeMatch[1].toUpperCase() : 'NOTE';
            var bodyEl = node.querySelector('.markdown-alert-content') || node;
            var lines = bodyEl.textContent.trim().split('\n');
            var res = '\n\n> [!' + type + ']\n';
            lines.forEach(function (l) {
              if (l.trim()) res += '> ' + l.trim() + '\n';
            });
            return res + '\n';
          }
        });

        // 13. Collapsible Details/Summary with proper CommonMark spacing
        this.turndown.addRule('detailsSummary', {
          filter: ['details'],
          replacement: function (content, node) {
            var summaryEl = node.querySelector('summary');
            var summaryText = summaryEl ? summaryEl.textContent.trim() : 'Details';
            // Clone and remove summary to get inner content
            var clone = node.cloneNode(true);
            var s = clone.querySelector('summary');
            if (s) s.remove();
            var innerHtml = clone.innerHTML.trim();
            var innerMd = self.turndown.turndown(innerHtml).trim();
            return '\n\n<details>\n<summary>' + summaryText + '</summary>\n\n' + innerMd + '\n\n</details>\n\n';
          }
        });

        // 14. Text Alignment on paragraphs, headings and divs -> <div align="center">
        var ALIGN_BLOCKS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
        function blockAlign(node) {
          var a = (node.getAttribute('align') || (node.style && node.style.textAlign) || '').toLowerCase();
          return (a === 'center' || a === 'right' || a === 'justify') ? a : '';
        }
        this.turndown.addRule('alignedBlocks', {
          filter: function (node) {
            return ALIGN_BLOCKS.indexOf(node.nodeName) !== -1 &&
              !node.classList.contains('markdown-alert') &&
              !node.classList.contains('markdown-alert-content') &&
              Boolean(blockAlign(node));
          },
          replacement: function (content, node) {
            var inner = content.trim();
            var hm = node.nodeName.match(/^H([1-6])$/);
            if (hm) inner = new Array(Number(hm[1]) + 1).join('#') + ' ' + inner;
            if (!inner) return '';
            return '\n\n<div align="' + blockAlign(node) + '">\n\n' + inner + '\n\n</div>\n\n';
          }
        });

        // 15. Plain divs (Chrome creates these when typing at the root) behave like paragraphs
        this.turndown.addRule('plainDiv', {
          filter: function (node) {
            return node.nodeName === 'DIV' &&
              !blockAlign(node) &&
              !node.classList.contains('markdown-alert') &&
              !node.classList.contains('markdown-alert-content');
          },
          replacement: function (content) {
            var inner = content.trim();
            return inner ? '\n\n' + inner + '\n\n' : '';
          }
        });

        // Keep inline HTML tags that GFM renders as-is
        this.turndown.keep(['kbd', 'mark', 'sub', 'sup', 'u']);
      }
    } catch (e) {
      console.warn('Turndown init error:', e);
    }
  }

  initEditorContent() {
    if (!this.visualEditor) return;

    this.visualEditor.innerHTML = `
<h1>Welcome to MeowMD Markdown Generator</h1>
<p>Draft your technical documentation visually with real-time conversion to <strong>clean, standard GitHub Flavored Markdown</strong>.</p>

<h2>Tested &amp; Supported Formatting:</h2>
<ul>
  <li><strong>Bold</strong> (Ctrl+B), <em>Italics</em> (Ctrl+I), <u>Underline</u> (Ctrl+U), and <s>Strikethrough</s></li>
  <li>Chemical &amp; Math formatting: Subscripts (H<sub>2</sub>O) and Superscripts (E = mc<sup>2</sup>)</li>
  <li>Inline <mark>highlighting</mark> and key combinations: <kbd>Ctrl</kbd> + <kbd>S</kbd></li>
  <li>Inline <code>code_snippets</code> and syntax-highlighted code blocks:</li>
</ul>

<pre><code class="language-javascript">// Code Block Demonstration
function formatMarkdown(doc) {
  return "100% standard CommonMark & GFM compliant";
}</code></pre>

<h2>Interactive Task Lists:</h2>
<ul class="task-list">
  <li class="task-list-item"><input type="checkbox" checked> Clean standard Markdown output</li>
  <li class="task-list-item"><input type="checkbox" checked> Renders identically on GitHub, VS Code, and Obsidian</li>
  <li class="task-list-item"><input type="checkbox"> Export or copy with a single click</li>
</ul>

<h2>GitHub Markdown Tables:</h2>
<table>
  <thead>
    <tr><th>Feature</th><th>Syntax</th><th>Renderer Compatibility</th></tr>
  </thead>
  <tbody>
    <tr><td>Strikethrough</td><td><code>~~text~~</code></td><td>Universal</td></tr>
    <tr><td>Underline</td><td><code>&lt;u&gt;text&lt;/u&gt;</code></td><td>GitHub, GitLab, HTML-MD</td></tr>
    <tr><td>Sub / Super</td><td><code>&lt;sub&gt;</code> / <code>&lt;sup&gt;</code></td><td>Universal</td></tr>
    <tr><td>GFM Tables</td><td><code>| col | col |</code></td><td>Universal</td></tr>
  </tbody>
</table>

<div class="markdown-alert markdown-alert-note">
  <p class="markdown-alert-title"><i class="fa-solid fa-circle-info"></i> NOTE</p>
  <div class="markdown-alert-content">Generated Markdown uses standard GitHub callouts, clean GFM tables, and compliant details accordions.</div>
</div>

<details>
  <summary>Click to expand additional notes</summary>
  <p>This is a collapsible section formatted with standard GitHub Flavored Markdown <code>&lt;details&gt;</code> syntax.</p>
</details>
`;
  }

  bindToolbar() {
    var self = this;

    var buttonMap = {
      'btnBold': function () { self.execCmd('bold'); },
      'btnItalic': function () { self.execCmd('italic'); },
      'btnUnderline': function () { self.execCmd('underline'); },
      'btnStrike': function () { self.execCmd('strikeThrough'); },
      'btnSubscript': function () { self.execCmd('subscript'); },
      'btnSuperscript': function () { self.execCmd('superscript'); },
      'btnUl': function () { self.execCmd('insertUnorderedList'); },
      'btnOl': function () { self.execCmd('insertOrderedList'); },
      'btnChecklist': function () { self.insertChecklist(); },
      'btnQuote': function () { self.formatBlockquote(); },
      'btnInlineCode': function () { self.formatInlineCode(); },
      'btnCodeBlock': function () { self.openCodeBlockModal(); },
      'btnLink': function () { self.openLinkModal(); },
      'btnImage': function () { self.openImageModal(); },
      'btnTable': function () { self.openTableModal(); },
      'btnAlert': function () { self.openAlertModal(); },
      'btnDetails': function () { self.insertDetails(); },
      'btnKbd': function () { self.insertKbd(); },
      'btnMark': function () { self.insertMark(); },
      'btnHr': function () { self.insertHorizontalRule(); },
      'btnFootnote': function () { self.insertFootnote(); },
      'btnClearFormat': function () { self.clearFormatting(); },
      'btnUndo': function () { self.execCmd('undo'); },
      'btnRedo': function () { self.execCmd('redo'); },
      'btnAlignLeft': function () { self.execCmd('justifyLeft'); },
      'btnAlignCenter': function () { self.execCmd('justifyCenter'); },
      'btnAlignRight': function () { self.execCmd('justifyRight'); }
    };

    Object.keys(buttonMap).forEach(function (btnId) {
      var btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('mousedown', function (e) {
          e.preventDefault();
        });

        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (self.visualEditor) self.visualEditor.focus();
          buttonMap[btnId]();
          self.syncVisualToMarkdown();
          self.updateStats();
          self.updateToolbarState();
        });
      }
    });

    var headingSelect = document.getElementById('headingSelect');
    if (headingSelect) {
      headingSelect.addEventListener('change', function () {
        var val = headingSelect.value;
        if (self.visualEditor) self.visualEditor.focus();
        if (val === 'p') {
          document.execCommand('formatBlock', false, '<p>');
        } else {
          document.execCommand('formatBlock', false, '<' + val + '>');
        }
        self.syncVisualToMarkdown();
        self.updateStats();
      });
    }
  }

  execCmd(command, value = null) {
    if (this.visualEditor) {
      this.visualEditor.focus();
      document.execCommand(command, false, value);
    }
  }

  bindEvents() {
    var self = this;

    if (this.visualEditor) {
      this.visualEditor.addEventListener('input', function () {
        if (self.isSyncing) return;
        self.normalizeEditorDom();
        self.syncVisualToMarkdown();
        self.updateStats();
      });

      this.visualEditor.addEventListener('keydown', function (e) {
        self.handleEditorKeydown(e);
      });

      this.visualEditor.addEventListener('paste', function (e) {
        self.handlePaste(e);
      });

      this.visualEditor.addEventListener('keyup', function () {
        self.updateToolbarState();
      });

      this.visualEditor.addEventListener('mouseup', function () {
        self.updateToolbarState();
      });

      this.visualEditor.addEventListener('change', function (e) {
        if (e.target && e.target.type === 'checkbox') {
          // innerHTML serialises the attribute, not the live property
          e.target.toggleAttribute('checked', e.target.checked);
          self.syncVisualToMarkdown();
          self.updateStats();
        }
      });
    }

    if (this.markdownOutput) {
      this.markdownOutput.addEventListener('input', function () {
        self.updateStats();
      });
    }

    var syncToVisualBtn = document.getElementById('syncToVisualBtn');
    if (syncToVisualBtn) {
      syncToVisualBtn.onclick = function () {
        self.syncMarkdownToVisual();
      };
    }

    var copyBtn = document.getElementById('copyMdBtn');
    if (copyBtn) {
      copyBtn.onclick = function () {
        if (self.markdownOutput) {
          copyToClipboard(self.markdownOutput.value, 'Markdown copied to clipboard!');
        }
      };
    }

    var downloadBtn = document.getElementById('downloadMdBtn');
    if (downloadBtn) {
      downloadBtn.onclick = function () {
        self.downloadMarkdown();
      };
    }

    if (this.fileInput) {
      this.fileInput.onchange = function (e) {
        self.handleFileImport(e.target.files);
      };
    }

    var clearBtn = document.getElementById('clearEditorBtn');
    if (clearBtn) {
      clearBtn.onclick = function () {
        if (confirm('Clear all content from the editor?')) {
          if (self.visualEditor) self.visualEditor.innerHTML = '<p><br></p>';
          if (self.markdownOutput) self.markdownOutput.value = '';
          self.updateStats();
          showToast('Editor cleared', 'info');
        }
      };
    }

    var splitBtn = document.getElementById('viewSplitBtn');
    var visualBtn = document.getElementById('viewVisualBtn');
    var mdBtn = document.getElementById('viewMdBtn');

    if (splitBtn) splitBtn.onclick = function () { self.setViewMode('split'); };
    if (visualBtn) visualBtn.onclick = function () { self.setViewMode('visual'); };
    if (mdBtn) mdBtn.onclick = function () { self.setViewMode('markdown'); };

    document.addEventListener('selectionchange', function () {
      if (self.selectionInEditor()) {
        var sel = window.getSelection();
        if (sel && sel.rangeCount) self.savedRange = sel.getRangeAt(0).cloneRange();
      }
      self.updateToolbarState();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(function (m) {
          m.classList.remove('active');
        });
      }
    });
  }

  handleEditorKeydown(e) {
    // Enter on an empty task item leaves the list, like a normal list item would
    if (e.key === 'Enter' && !e.shiftKey) {
      var taskLi = this.closestInEditor('li.task-list-item');
      if (taskLi && !taskLi.textContent.replace(/\u00a0/g, '').trim() && !taskLi.querySelector('img, pre, table')) {
        e.preventDefault();
        taskLi.classList.remove('task-list-item');
        taskLi.innerHTML = '<br>';
        var list = taskLi.parentNode;
        if (list && !list.querySelector('li.task-list-item')) list.classList.remove('task-list');
        var selEmpty = window.getSelection();
        var rEmpty = document.createRange();
        rEmpty.setStart(taskLi, 0);
        rEmpty.collapse(true);
        selEmpty.removeAllRanges();
        selEmpty.addRange(rEmpty);
        document.execCommand('insertParagraph');
        this.normalizeEditorDom();
        this.syncVisualToMarkdown();
        this.updateStats();
        return;
      }
    }

    // Enter inside a code block inserts a newline; a blank line at the end leaves the block
    if (e.key === 'Enter' && !e.shiftKey) {
      var pre = this.closestInEditor('pre');
      if (pre) {
        e.preventDefault();
        var code = pre.querySelector('code') || pre;
        var sel = window.getSelection();
        var range = sel.getRangeAt(0);
        var tail = range.cloneRange();
        tail.selectNodeContents(code);
        tail.setStart(range.endContainer, range.endOffset);
        var atEnd = tail.toString().length === 0;
        // Chrome stores newlines inside <pre> as <br>; read them as text to detect a blank last line
        var probe = code.cloneNode(true);
        probe.querySelectorAll('br').forEach(function (br) { br.replaceWith('\n'); });
        var codeText = probe.textContent;
        var lastNode = code.lastChild;
        var blankLastLine = /\n\n$/.test(codeText) ||
          (lastNode && lastNode.nodeType === 3 && /\n$/.test(lastNode.data));
        if (atEnd && blankLastLine) {
          // Drop the trailing blank line(s) and continue in a paragraph after the block
          while (code.lastChild && (code.lastChild.nodeName === 'BR' ||
                 (code.lastChild.nodeType === 3 && !code.lastChild.data.replace(/\n+$/, '')))) {
            code.removeChild(code.lastChild);
          }
          if (code.lastChild && code.lastChild.nodeType === 3) {
            code.lastChild.data = code.lastChild.data.replace(/\n+$/, '');
          }
          var p = document.createElement('p');
          p.innerHTML = '<br>';
          pre.parentNode.insertBefore(p, pre.nextSibling);
          var r2 = document.createRange();
          r2.setStart(p, 0);
          r2.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r2);
        } else {
          document.execCommand('insertText', false, '\n');
        }
        this.syncVisualToMarkdown();
        this.updateStats();
        return;
      }
    }

    if (e.key === 'Tab') {
      var cell = this.closestInEditor('td, th');
      if (cell) {
        e.preventDefault();
        var cells = Array.prototype.slice.call(cell.closest('table').querySelectorAll('th, td'));
        var idx = cells.indexOf(cell);
        var next = cells[e.shiftKey ? idx - 1 : idx + 1];
        if (next) {
          var r3 = document.createRange();
          r3.selectNodeContents(next);
          var s3 = window.getSelection();
          s3.removeAllRanges();
          s3.addRange(r3);
        }
        return;
      }
      if (this.closestInEditor('li')) {
        e.preventDefault();
        document.execCommand(e.shiftKey ? 'outdent' : 'indent');
        this.normalizeEditorDom();
        this.syncVisualToMarkdown();
        this.updateStats();
        return;
      }
      if (this.closestInEditor('pre')) {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        return;
      }
    }
  }

  /* Paste: normalise rich HTML through the Markdown pipeline so only supported structures land. */
  handlePaste(e) {
    if (!e.clipboardData) return;
    var html = e.clipboardData.getData('text/html');
    var text = e.clipboardData.getData('text/plain');
    e.preventDefault();

    if (this.closestInEditor('pre')) {
      document.execCommand('insertText', false, text);
      return;
    }

    if (html && this.turndown && this.mdParser) {
      try {
        var md = this.cleanMarkdown(this.turndown.turndown(html));
        var clean = this.upgradeRenderedHtml(this.mdParser.render(md));
        if (clean.trim()) {
          document.execCommand('insertHTML', false, clean);
          this.normalizeEditorDom();
          this.syncVisualToMarkdown();
          this.updateStats();
          return;
        }
      } catch (err) {
        console.warn('Rich paste failed, falling back to plain text', err);
      }
    }
    document.execCommand('insertText', false, text);
  }

  setViewMode(mode) {
    var workspace = document.querySelector('.editor-workspace');
    var splitBtn = document.getElementById('viewSplitBtn');
    var visualBtn = document.getElementById('viewVisualBtn');
    var mdBtn = document.getElementById('viewMdBtn');

    [splitBtn, visualBtn, mdBtn].forEach(function (btn) {
      if (btn) btn.classList.remove('active');
    });

    if (mode === 'visual') {
      if (workspace) workspace.className = 'editor-workspace view-visual-only';
      if (visualBtn) visualBtn.classList.add('active');
    } else if (mode === 'markdown') {
      if (workspace) workspace.className = 'editor-workspace view-markdown-only';
      if (mdBtn) mdBtn.classList.add('active');
    } else {
      if (workspace) workspace.className = 'editor-workspace view-split';
      if (splitBtn) splitBtn.classList.add('active');
    }
    this.activeView = mode;
  }

  updateToolbarState() {
    var checkState = function (cmd, btnId) {
      var btn = document.getElementById(btnId);
      if (btn) {
        try {
          if (document.queryCommandState(cmd)) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        } catch (e) {}
      }
    };

    checkState('bold', 'btnBold');
    checkState('italic', 'btnItalic');
    checkState('underline', 'btnUnderline');
    checkState('strikeThrough', 'btnStrike');
    checkState('subscript', 'btnSubscript');
    checkState('superscript', 'btnSuperscript');
    checkState('insertUnorderedList', 'btnUl');
    checkState('insertOrderedList', 'btnOl');
    checkState('justifyCenter', 'btnAlignCenter');
    checkState('justifyRight', 'btnAlignRight');

    var setActive = function (btnId, on) {
      var btn = document.getElementById(btnId);
      if (btn) btn.classList.toggle('active', Boolean(on));
    };
    var inEditor = this.selectionInEditor();
    setActive('btnQuote', inEditor && this.closestInEditor('blockquote'));
    setActive('btnChecklist', inEditor && this.closestInEditor('li.task-list-item'));
    setActive('btnInlineCode', inEditor && this.closestInEditor('code') && !this.closestInEditor('pre'));
    setActive('btnCodeBlock', inEditor && this.closestInEditor('pre'));

    var headingSelect = document.getElementById('headingSelect');
    if (headingSelect && inEditor) {
      var h = this.closestInEditor('h1, h2, h3, h4');
      var val = h ? h.nodeName.toLowerCase() : 'p';
      if (headingSelect.value !== val) headingSelect.value = val;
    }
  }

  syncVisualToMarkdown() {
    if (!this.visualEditor || !this.markdownOutput) return;
    this.isSyncing = true;
    try {
      var html = this.visualEditor.innerHTML;
      var md = '';

      if (this.turndown) {
        md = this.cleanMarkdown(this.turndown.turndown(html));
      } else {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        md = (tmp.innerText || tmp.textContent).trim();
      }

      this.markdownOutput.value = md;
    } catch (err) {
      console.error('Markdown sync error:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  /* Undo escaping Turndown applies to syntax we deliberately keep (footnotes, task boxes). */
  cleanMarkdown(md) {
    return (md || '')
      .replace(/\\\[\^([^\]\\]+)\\\]/g, '[^$1]')
      .replace(/^(\s*(?:[-*+]|\d+\.)\s+)\\\[( |x|X)\\\]/gm, '$1[$2]')
      .replace(/^[ \t\u00a0]+$/gm, '')
      .replace(/[ \t]+$/gm, function (m) { return m.length >= 2 ? '  ' : ''; })
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /* Rebuild editor-only structures (task boxes, callouts) from rendered Markdown HTML. */
  upgradeRenderedHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;

    tmp.querySelectorAll('li').forEach(function (li) {
      var first = li.firstChild;
      while (first && first.nodeType === 1 && first.nodeName === 'P' && first.firstChild) first = first.firstChild;
      if (!first || first.nodeType !== 3) return;
      var m = first.textContent.match(/^\s*\[( |x|X)\]\s?/);
      if (!m) return;
      first.textContent = first.textContent.slice(m[0].length);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      if (m[1].toLowerCase() === 'x') cb.setAttribute('checked', '');
      var holder = first.parentNode;
      holder.insertBefore(document.createTextNode(' '), first);
      holder.insertBefore(cb, holder.firstChild);
      li.classList.add('task-list-item');
      if (li.parentNode) li.parentNode.classList.add('task-list');
    });

    var ICONS = { NOTE: 'fa-circle-info', TIP: 'fa-lightbulb', IMPORTANT: 'fa-circle-exclamation', WARNING: 'fa-triangle-exclamation', CAUTION: 'fa-fire' };
    tmp.querySelectorAll('blockquote').forEach(function (bq) {
      var p = bq.firstElementChild;
      if (!p || p.nodeName !== 'P' || !p.firstChild || p.firstChild.nodeType !== 3) return;
      var m = p.firstChild.textContent.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i);
      if (!m) return;
      var type = m[1].toUpperCase();
      p.firstChild.textContent = p.firstChild.textContent.slice(m[0].length);
      var alert = document.createElement('div');
      alert.className = 'markdown-alert markdown-alert-' + type.toLowerCase();
      var title = document.createElement('p');
      title.className = 'markdown-alert-title';
      title.innerHTML = '<i class="fa-solid ' + ICONS[type] + '"></i> ' + type;
      var body = document.createElement('div');
      body.className = 'markdown-alert-content';
      while (bq.firstChild) body.appendChild(bq.firstChild);
      if (!body.textContent.trim()) body.textContent = 'Enter your ' + type.toLowerCase() + ' message here';
      alert.appendChild(title);
      alert.appendChild(body);
      bq.replaceWith(alert);
    });

    return tmp.innerHTML;
  }

  syncMarkdownToVisual() {
    if (!this.markdownOutput || !this.visualEditor) return;
    var mdText = this.markdownOutput.value;
    if (!this.mdParser) this.initParsers();

    if (this.mdParser) {
      this.isSyncing = true;
      try {
        var safeMd = mdText.replace(/^(\s*)\[\^([^\]]+)\]:/gm, '$1\\[^$2]:');
        var html = this.upgradeRenderedHtml(this.mdParser.render(safeMd));
        this.visualEditor.innerHTML = html || '<p><br></p>';
        this.updateStats();
        showToast('Visual Editor updated from Markdown', 'success');
      } catch (err) {
        console.error('Markdown parse error:', err);
        showToast('Failed to sync markdown to visual editor', 'danger');
      } finally {
        this.isSyncing = false;
      }
    }
  }

  updateStats() {
    var text = this.markdownOutput ? this.markdownOutput.value : '';
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    var chars = text.length;
    var lines = text ? text.split('\n').length : 0;

    var wordsEl = document.getElementById('statWords');
    var charsEl = document.getElementById('statChars');
    var linesEl = document.getElementById('statLines');

    if (wordsEl) wordsEl.innerHTML = '<i class="fa-regular fa-file-lines"></i> ' + words + ' Words';
    if (charsEl) charsEl.innerText = chars + ' Characters';
    if (linesEl) linesEl.innerText = lines + ' Lines';
  }

  async handleFileImport(fileList) {
    if (!fileList || fileList.length === 0) return;
    var file = fileList[0];
    try {
      var text = await file.text();
      if (this.markdownOutput) {
        this.markdownOutput.value = text;
      }
      this.syncMarkdownToVisual();
      this.updateStats();
      showToast('Imported ' + file.name, 'success');
    } catch (err) {
      console.error('File import error:', err);
      showToast('Failed to import file', 'danger');
    }
  }

  downloadMarkdown() {
    var content = this.markdownOutput ? this.markdownOutput.value : '';
    if (!content.trim()) {
      showToast('Editor is empty', 'warning');
      return;
    }
    var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded document.md', 'success');
  }

  /* ==========================================================================
     Custom Formatting Helpers
     ========================================================================== */

  insertHtmlAtCursor(html, forceManual) {
    if (!this.visualEditor) return;
    this.restoreSelection();

    // Preferred path: insertHTML is undoable and lets the browser split blocks correctly
    var inserted = false;
    if (!forceManual) {
      try {
        inserted = document.execCommand('insertHTML', false, html);
      } catch (e) {
        inserted = false;
      }
    }
    if (inserted) {
      this.normalizeEditorDom();
      this.syncVisualToMarkdown();
      this.updateStats();
      return;
    }

    var sel = window.getSelection();
    if (sel && sel.getRangeAt && sel.rangeCount && this.selectionInEditor()) {
      var range = sel.getRangeAt(0);
      range.deleteContents();

      var el = document.createElement('div');
      el.innerHTML = html;
      var frag = document.createDocumentFragment();
      var node, lastNode;
      while ((node = el.firstChild)) {
        lastNode = frag.appendChild(node);
      }
      range.insertNode(frag);

      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      this.visualEditor.insertAdjacentHTML('beforeend', html);
    }
    this.normalizeEditorDom();
    this.syncVisualToMarkdown();
    this.updateStats();
  }

  /* Inserts block HTML after the block that holds the caret, replacing it if it is empty.
     Used for <pre> and <details>, which Chrome's insertHTML flattens or strips. */
  insertBlockHtml(html) {
    if (!this.visualEditor) return;
    this.restoreSelection();
    var ed = this.visualEditor;
    var block = this.closestInEditor('p, h1, h2, h3, h4, h5, h6, div, pre, blockquote, li, table, details');
    while (block && block.parentNode !== ed) block = block.parentNode;

    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var nodes = Array.prototype.slice.call(tmp.childNodes);
    var caretTarget = tmp.querySelector('p:last-child');

    if (block) {
      var isEmpty = !block.textContent.trim() && !block.querySelector('img, table, pre, input');
      var ref = block.nextSibling;
      nodes.forEach(function (n) { ed.insertBefore(n, ref); });
      if (isEmpty) block.remove();
    } else {
      nodes.forEach(function (n) { ed.appendChild(n); });
    }

    if (caretTarget) {
      var sel = window.getSelection();
      var r = document.createRange();
      r.setStart(caretTarget, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    this.normalizeEditorDom();
    this.syncVisualToMarkdown();
    this.updateStats();
  }

  /* Repairs structures the browser produces while editing:
     task items without a checkbox, nested lists placed beside their parent item. */
  normalizeEditorDom() {
    if (!this.visualEditor) return;
    var ed = this.visualEditor;

    ed.querySelectorAll('li.task-list-item').forEach(function (li) {
      if (!li.querySelector('input[type="checkbox"]')) {
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        var space = document.createTextNode('\u00a0');
        li.insertBefore(cb, li.firstChild);
        li.insertBefore(space, cb.nextSibling);
        // Keep the caret after the new box so typing continues on the right side of it
        var sel = window.getSelection();
        if (sel && sel.rangeCount && li.contains(sel.anchorNode)) {
          var after = document.createRange();
          after.setStart(space, space.length);
          after.collapse(true);
          if (sel.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START, after) < 0) {
            sel.removeAllRanges();
            sel.addRange(after);
          }
        }
      }
      var ul = li.parentNode;
      if (ul && (ul.nodeName === 'UL' || ul.nodeName === 'OL')) ul.classList.add('task-list');
    });

    ed.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol').forEach(function (list) {
      var prev = list.previousElementSibling;
      if (prev && prev.nodeName === 'LI') {
        prev.appendChild(list);
      }
    });
  }

  formatInlineCode() {
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      var text = sel.toString();
      this.insertHtmlAtCursor('<code>' + this.escapeHtml(text) + '</code>');
    } else {
      this.insertHtmlAtCursor('<code>code</code>&nbsp;');
    }
  }

  formatBlockquote() {
    var bq = this.closestInEditor('blockquote');
    if (bq) {
      this.execCmd('outdent');
    } else {
      this.execCmd('formatBlock', '<blockquote>');
    }
  }

  closestInEditor(selector) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this.visualEditor) return null;
    var node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentNode;
    if (!node || !this.visualEditor.contains(node)) return null;
    var el = node.closest(selector);
    return (el && this.visualEditor.contains(el) && el !== this.visualEditor) ? el : null;
  }

  selectionInEditor() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this.visualEditor) return false;
    var node = sel.getRangeAt(0).commonAncestorContainer;
    return this.visualEditor.contains(node);
  }

  restoreSelection() {
    if (!this.visualEditor) return;
    var ed = this.visualEditor;
    ed.focus();
    var saved = this.savedRange;
    if (!saved || !ed.contains(saved.startContainer) || !ed.contains(saved.endContainer)) return;

    // Focusing a contenteditable after a modal input resets the caret to the start; put it back
    var sel = window.getSelection();
    var cur = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    var atStart = false;
    if (cur && cur.collapsed) {
      var head = document.createRange();
      head.selectNodeContents(ed);
      head.setEnd(cur.startContainer, cur.startOffset);
      atStart = head.toString() === '';
    }
    if (!this.selectionInEditor() || atStart) {
      try {
        sel.removeAllRanges();
        sel.addRange(saved);
      } catch (e) {}
    }
  }

  insertChecklist() {
    var li = this.closestInEditor('li');
    if (li) {
      if (li.classList.contains('task-list-item')) {
        // Toggle back to a plain list item
        li.classList.remove('task-list-item');
        var cb = li.querySelector('input[type="checkbox"]');
        if (cb) {
          if (cb.nextSibling && cb.nextSibling.nodeType === 3) {
            cb.nextSibling.textContent = cb.nextSibling.textContent.replace(/^\s+/, '');
          }
          cb.remove();
        }
        var list = li.parentNode;
        if (list && !list.querySelector('li.task-list-item')) list.classList.remove('task-list');
      } else {
        li.classList.add('task-list-item');
      }
      this.normalizeEditorDom();
      this.syncVisualToMarkdown();
      this.updateStats();
      return;
    }
    var sel = window.getSelection();
    var text = (sel && !sel.isCollapsed) ? sel.toString() : 'Task item';
    this.insertHtmlAtCursor('<ul class="task-list"><li class="task-list-item"><input type="checkbox"> ' + this.escapeHtml(text) + '</li></ul><p><br></p>');
  }

  insertDetails() {
    this.insertBlockHtml('<details><summary>Click to expand</summary><p>Put the collapsible content here.</p></details><p><br></p>');
    showToast('Inserted collapsible section', 'success');
  }

  insertKbd() {
    var sel = window.getSelection();
    var text = (sel && !sel.isCollapsed) ? sel.toString() : 'Ctrl';
    this.insertHtmlAtCursor('<kbd>' + this.escapeHtml(text) + '</kbd>');
  }

  insertMark() {
    var sel = window.getSelection();
    var text = (sel && !sel.isCollapsed) ? sel.toString() : 'highlighted text';
    this.insertHtmlAtCursor('<mark>' + this.escapeHtml(text) + '</mark>');
  }

  insertHorizontalRule() {
    this.execCmd('insertHorizontalRule');
  }

  insertFootnote() {
    var text = (this.visualEditor && this.visualEditor.textContent) || '';
    var n = 1;
    var m;
    var re = /\[\^(\d+)\]/g;
    while ((m = re.exec(text))) {
      n = Math.max(n, parseInt(m[1], 10) + 1);
    }
    this.insertHtmlAtCursor('[^' + n + ']');
    var def = document.createElement('p');
    def.textContent = '[^' + n + ']: Footnote text';
    this.visualEditor.appendChild(def);
    this.syncVisualToMarkdown();
    this.updateStats();
    showToast('Inserted footnote ' + n + '. Edit its text at the end of the document.', 'info');
  }

  clearFormatting() {
    this.execCmd('removeFormat');
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this.visualEditor) return;
    var range = sel.getRangeAt(0);
    this.visualEditor.querySelectorAll('code, mark, kbd, u, s, strike, del, sub, sup').forEach(function (el) {
      if (el.closest('pre')) return;
      if (range.intersectsNode(el)) {
        var parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    });
  }

  /* ==========================================================================
     Modals Management
     ========================================================================== */

  setupModals() {
    var self = this;

    // 1. Table Modal Form
    var tableForm = document.getElementById('tableModalForm');
    if (tableForm) {
      tableForm.onsubmit = function (e) {
        e.preventDefault();
        var rows = parseInt(document.getElementById('tableRowsInput').value, 10) || 3;
        var cols = parseInt(document.getElementById('tableColsInput').value, 10) || 3;
        self.insertTable(rows, cols);
        self.closeModal('tableModal');
      };
    }

    // 2. Alert Option Buttons
    document.querySelectorAll('.alert-option-btn').forEach(function (btn) {
      btn.onclick = function () {
        var type = btn.getAttribute('data-type') || 'NOTE';
        self.insertAlert(type);
        self.closeModal('alertModal');
      };
    });

    // 3. Link Modal Form
    var linkForm = document.getElementById('linkModalForm');
    if (linkForm) {
      linkForm.onsubmit = function (e) {
        e.preventDefault();
        var url = (document.getElementById('linkUrlInput').value || '').trim();
        var text = document.getElementById('linkTextInput').value || url;
        if (url) {
          self.insertHtmlAtCursor('<a href="' + self.escapeHtml(encodeURI(url)) + '">' + self.escapeHtml(text) + '</a>');
        }
        linkForm.reset();
        self.closeModal('linkModal');
      };
    }

    // 4. Image Modal Form
    var imageForm = document.getElementById('imageModalForm');
    if (imageForm) {
      imageForm.onsubmit = function (e) {
        e.preventDefault();
        var alt = document.getElementById('imageAltInput').value || 'Image description';
        var url = document.getElementById('imageUrlInput').value || '';
        if (url) {
          self.insertHtmlAtCursor('<img src="' + self.escapeHtml(encodeURI(url)) + '" alt="' + self.escapeHtml(alt) + '">');
        }
        imageForm.reset();
        self.closeModal('imageModal');
      };
    }

    // 5. Code Block Modal Form
    var codeBlockForm = document.getElementById('codeBlockModalForm');
    if (codeBlockForm) {
      codeBlockForm.onsubmit = function (e) {
        e.preventDefault();
        var lang = (document.getElementById('codeLangInput').value || '').trim().toLowerCase();
        var code = document.getElementById('codeSnippetInput').value || '';
        var cls = lang ? ' class="language-' + self.escapeHtml(lang) + '"' : '';
        self.insertBlockHtml('<pre><code' + cls + '>' + self.escapeHtml(code) + '</code></pre><p><br></p>');
        codeBlockForm.reset();
        self.closeModal('codeBlockModal');
      };
    }

    // Modal Close buttons & overlay click
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      overlay.onclick = function (e) {
        if (e.target === overlay) overlay.classList.remove('active');
      };
    });

    document.querySelectorAll('.modal-close-btn').forEach(function (btn) {
      btn.onclick = function () {
        var modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      };
    });
  }

  openTableModal() {
    this.openModal('tableModal');
    var input = document.getElementById('tableRowsInput');
    if (input) input.focus();
  }

  openAlertModal() {
    this.openModal('alertModal');
  }

  openLinkModal() {
    var sel = window.getSelection();
    var textInput = document.getElementById('linkTextInput');
    if (textInput && sel && !sel.isCollapsed) {
      textInput.value = sel.toString();
    }
    this.openModal('linkModal');
    var urlInput = document.getElementById('linkUrlInput');
    if (urlInput) urlInput.focus();
  }

  openImageModal() {
    this.openModal('imageModal');
    var urlInput = document.getElementById('imageUrlInput');
    if (urlInput) urlInput.focus();
  }

  openCodeBlockModal() {
    this.openModal('codeBlockModal');
    var codeInput = document.getElementById('codeSnippetInput');
    if (codeInput) codeInput.focus();
  }

  openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  insertTable(rows, cols) {
    var html = '<table><thead><tr>';
    for (var c = 1; c <= cols; c++) {
      html += '<th>Header ' + c + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (var r = 1; r <= rows; r++) {
      html += '<tr>';
      for (var col = 1; col <= cols; col++) {
        html += '<td>Cell ' + r + ',' + col + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    this.insertHtmlAtCursor(html);
    showToast('Inserted ' + rows + 'x' + cols + ' table', 'success');
  }

  insertAlert(type = 'NOTE') {
    var typeLower = type.toLowerCase();
    var icon = 'fa-circle-info';
    if (type === 'TIP') icon = 'fa-lightbulb';
    if (type === 'IMPORTANT') icon = 'fa-circle-exclamation';
    if (type === 'WARNING') icon = 'fa-triangle-exclamation';
    if (type === 'CAUTION') icon = 'fa-fire';

    var alertHtml = `
      <div class="markdown-alert markdown-alert-${typeLower}">
        <p class="markdown-alert-title"><i class="fa-solid ${icon}"></i> ${type}</p>
        <div class="markdown-alert-content">Enter your ${typeLower} message here</div>
      </div>
      <p><br></p>
    `;
    this.insertHtmlAtCursor(alertHtml);
    showToast('Inserted [!' + type + '] alert', 'success');
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    window.editorApp = new MeowEditor();
  });
} else {
  window.editorApp = new MeowEditor();
}
