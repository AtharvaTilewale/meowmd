/**
 * MeowMD Landing Page Logic (landing.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  initPlayground();
  initFAQ();
});

// Sample Presets for Live Playground
const PLAYGROUND_PRESETS = {
  general: `# Welcome to MeowMD 🐾

MeowMD is a modern, privacy-first **Markdown toolkit** built for speed and precision.

### Key Highlights:
- 🚀 **Zero-Lag Rendering**: Real-time GFM preview
- 🔒 **100% Private**: All processing stays inside your browser
- 📊 **Rich Extensions**: Mermaid, KaTeX, Charts, and 3D molecules

> "Simplicity is the soul of efficiency." — Austin Freeman

| Feature | Supported | Offline Ready |
| :--- | :---: | :---: |
| Mermaid Diagrams | ✅ | ✅ |
| LaTeX Math | ✅ | ✅ |
| 3D Molecules | ✅ | ✅ |
`,
  mermaid: `# Diagramming in Markdown

Create professional flowcharts, sequence diagrams, and architecture maps with pure text:

\`\`\`mermaid
graph TD
    A[Start Writing .md] --> B{Choose Tool}
    B -->|Reading & Proofing| C[MeowMD Viewer]
    B -->|Visual WYSIWYG| D[MeowMD Generator]
    C --> E[Export to Clean PDF]
    D --> E
\`\`\`
`,
  math: `# Mathematical Expressions

Render inline $E = mc^2$ and complex LaTeX display equations:

$$\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)$$

Euler's identity:
$$e^{i\\pi} + 1 = 0$$
`
};

let playgroundMd = null;

function initPlayground() {
  const textarea = document.getElementById('playgroundTextarea');
  const preview = document.getElementById('playgroundPreview');
  const tabButtons = document.querySelectorAll('.playground-tabs .tab-btn');
  if (!textarea || !preview) return;

  // Initialize markdown-it with highlight.js if available
  if (window.markdownit) {
    playgroundMd = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
      highlight: function (str, lang) {
        if (lang && window.hljs && window.hljs.getLanguage(lang)) {
          try {
            return window.hljs.highlight(str, { language: lang }).value;
          } catch (__) {}
        }
        return '';
      }
    });
  }

  function render() {
    const raw = textarea.value;
    if (playgroundMd) {
      preview.innerHTML = playgroundMd.render(raw);
    } else {
      // Fallback simple preview
      preview.innerText = raw;
    }

    // Lazy load Mermaid if present in playground
    if (raw.includes('```mermaid') && window.LazyEngines) {
      window.LazyEngines.ensureMermaid().then(mermaid => {
        const mermaidNodes = preview.querySelectorAll('pre code.language-mermaid, pre code:not([class])');
        mermaidNodes.forEach((node, idx) => {
          const code = node.textContent.trim();
          if (code.startsWith('graph') || code.startsWith('sequenceDiagram') || code.startsWith('flowchart')) {
            const div = document.createElement('div');
            div.className = 'mermaid-wrapper';
            div.innerHTML = `<div class="mermaid">${code}</div>`;
            node.closest('pre').replaceWith(div);
          }
        });
        try { mermaid.run(); } catch(e) {}
      });
    }
  }

  textarea.addEventListener('input', render);

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.getAttribute('data-preset');
      if (PLAYGROUND_PRESETS[preset]) {
        textarea.value = PLAYGROUND_PRESETS[preset];
        render();
      }
    });
  });

  // Initial render
  textarea.value = PLAYGROUND_PRESETS.general;
  render();
}

function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}
