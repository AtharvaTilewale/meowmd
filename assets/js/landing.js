/**
 * MeowMD Landing Page Logic (landing.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  initPlayground();
  initFAQ();
});

// Sample Presets for Live Playground (Professional, no emojis)
const PLAYGROUND_PRESETS = {
  general: `# Welcome to MeowMD

MeowMD is a modern, privacy-focused Markdown toolkit built for speed and technical precision.

### Key Capabilities:
- **Fast Rendering**: Real-time GitHub Flavored Markdown preview
- **Private and Secure**: All file processing occurs locally in your browser
- **Rich Extensions**: Mermaid diagrams, KaTeX math, charts, and 3D molecular structures

> "Simplicity is the prerequisite for reliability." - Edsger W. Dijkstra

| Feature | Supported | Offline Ready |
| :--- | :---: | :---: |
| Mermaid Diagrams | Yes | Yes |
| LaTeX Math | Yes | Yes |
| 3D Molecular Viewer | Yes | Yes |
| PDF Export | Yes | Yes |
`,
  mermaid: `# Diagramming in Markdown

Create flowcharts, sequence diagrams, and architecture maps with pure text:

\`\`\`mermaid
graph TD
    A[Start Writing Markdown] --> B{Select Workflow}
    B -->|Reading and Proofing| C[MeowMD Viewer]
    B -->|Visual WYSIWYG| D[MeowMD Generator]
    C --> E[Export to Standard PDF]
    D --> E
\`\`\`
`,
  math: `# Mathematical Equations

Render inline math expressions like $E = mc^2$ and complex display equations:

$$\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)$$

Maxwell's equations:
$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$
`
};

let playgroundMd = null;

function initPlayground() {
  const textarea = document.getElementById('playgroundTextarea');
  const preview = document.getElementById('playgroundPreview');
  const tabButtons = document.querySelectorAll('.playground-tabs .tab-btn');
  if (!textarea || !preview) return;

  function ensureParser() {
    if (!playgroundMd && window.markdownit) {
      playgroundMd = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
        highlight: function (str, lang) {
          if (lang && window.hljs && window.hljs.getLanguage(lang)) {
            try {
              return `<pre><code class="hljs language-${lang}">${window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
            } catch (__) {}
          }
          return `<pre><code>${str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
        }
      });
    }
  }

  async function render() {
    ensureParser();
    const raw = textarea.value;
    if (playgroundMd) {
      preview.innerHTML = playgroundMd.render(raw);
    } else {
      preview.innerText = raw;
    }

    // Lazy load Mermaid if present
    if (raw.includes('```mermaid') && window.LazyEngines) {
      try {
        const mermaid = await window.LazyEngines.ensureMermaid();
        const mermaidNodes = preview.querySelectorAll('pre code.language-mermaid, pre code');
        mermaidNodes.forEach((node) => {
          const code = node.textContent.trim();
          if (code.startsWith('graph') || code.startsWith('sequenceDiagram') || code.startsWith('flowchart') || code.startsWith('classDiagram')) {
            const div = document.createElement('div');
            div.className = 'mermaid-wrapper';
            div.innerHTML = `<div class="mermaid">${code}</div>`;
            node.closest('pre').replaceWith(div);
          }
        });
        mermaid.run({ querySelector: '.mermaid' });
      } catch (err) {
        console.error('Mermaid render error:', err);
      }
    }

    // Lazy load Math if present
    if (raw.includes('$') && window.LazyEngines) {
      try {
        await window.LazyEngines.ensureKaTeX();
        if (window.renderMathInElement) {
          window.renderMathInElement(preview, {
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

  // Initial render with retry if markdown-it script is loading asynchronously
  textarea.value = PLAYGROUND_PRESETS.general;
  render();
  setTimeout(render, 150);
}

function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}
