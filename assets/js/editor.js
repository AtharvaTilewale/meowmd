/**
 * MeowMD Markdown Generator & WYSIWYG Editor (editor.js)
 */

class MeowEditor {
  constructor() {
    this.quill = null;
    this.turndown = null;
    this.isSyncing = false;

    this.initTurndown();
    this.initQuill();
    this.bindDOM();
    this.updateStats();
  }

  initTurndown() {
    if (window.TurndownService) {
      this.turndown = new window.TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        hr: '---',
        bulletListMarker: '-'
      });
    }
  }

  initQuill() {
    const editorContainer = document.getElementById('quillEditor');
    if (!editorContainer || !window.Quill) return;

    this.quill = new window.Quill(editorContainer, {
      theme: 'snow',
      placeholder: 'Type or paste rich text here... It will automatically convert to clean Markdown.',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          ['blockquote', 'code-block'],
          [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
          ['link', 'image'],
          ['clean']
        ]
      }
    });

    this.quill.on('text-change', () => {
      if (this.isSyncing) return;
      this.syncQuillToMarkdown();
      this.updateStats();
    });

    // Clean starter text without emojis
    this.quill.root.innerHTML = `
      <h1>Welcome to MeowMD Markdown Generator</h1>
      <p>Draft your documentation visually with this rich-text editor. Your formatting is instantly converted to <strong>clean GitHub Flavored Markdown</strong> on the right.</p>
      <ul>
        <li>Fast client-side conversion</li>
        <li>Instant real-time copy and download</li>
        <li>Clean, standard syntax</li>
      </ul>
      <blockquote>"Markdown allows you to write using an easy-to-read, easy-to-write plain text format."</blockquote>
    `;
    this.syncQuillToMarkdown();
  }

  bindDOM() {
    this.markdownOutput = document.getElementById('markdownOutput');
    this.fileInput = document.getElementById('editorFileInput');

    // Markdown Output Manual Editing (Bidirectional sync)
    if (this.markdownOutput) {
      this.markdownOutput.addEventListener('input', () => {
        this.updateStats();
      });
    }

    // Copy Markdown Button
    const copyBtn = document.getElementById('copyMdBtn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        if (this.markdownOutput) {
          copyToClipboard(this.markdownOutput.value, 'Markdown copied');
        }
      };
    }

    // Download Markdown Button
    const downloadBtn = document.getElementById('downloadMdBtn');
    if (downloadBtn) {
      downloadBtn.onclick = () => this.downloadMarkdown();
    }

    // Import File Button
    if (this.fileInput) {
      this.fileInput.onchange = (e) => this.handleFileImport(e.target.files);
    }

    // Clear Button
    const clearBtn = document.getElementById('clearEditorBtn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (confirm('Clear editor content?')) {
          if (this.quill) this.quill.setText('');
          if (this.markdownOutput) this.markdownOutput.value = '';
          this.updateStats();
          showToast('Editor cleared', 'info');
        }
      };
    }
  }

  syncQuillToMarkdown() {
    if (!this.quill || !this.turndown || !this.markdownOutput) return;
    const html = this.quill.root.innerHTML;
    const md = this.turndown.turndown(html);
    this.markdownOutput.value = md;
  }

  updateStats() {
    const text = this.markdownOutput ? this.markdownOutput.value : '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const lines = text ? text.split('\n').length : 0;

    const wordsEl = document.getElementById('statWords');
    const charsEl = document.getElementById('statChars');
    const linesEl = document.getElementById('statLines');

    if (wordsEl) wordsEl.innerText = `${words} Words`;
    if (charsEl) charsEl.innerText = `${chars} Characters`;
    if (linesEl) linesEl.innerText = `${lines} Lines`;
  }

  async handleFileImport(fileList) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    try {
      const text = await file.text();
      if (this.markdownOutput) {
        this.markdownOutput.value = text;
      }
      this.updateStats();
      showToast(`Imported ${file.name}`, 'success');
    } catch (err) {
      console.error('File import error:', err);
      showToast('Failed to import file', 'danger');
    }
  }

  downloadMarkdown() {
    const content = this.markdownOutput ? this.markdownOutput.value : '';
    if (!content.trim()) {
      showToast('Editor is empty', 'warning');
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded document.md', 'success');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.editorApp = new MeowEditor();
});
