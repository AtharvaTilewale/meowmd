/**
 * MeowMD Lazy Loader (lazy-loader.js)
 * Dynamically loads heavy external libraries on demand.
 */

const loadedScripts = new Map();
const loadedStyles = new Map();

function loadScript(src) {
  if (loadedScripts.has(src)) return loadedScripts.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      loadedScripts.delete(src);
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });

  loadedScripts.set(src, promise);
  return promise;
}

function loadCSS(href) {
  if (loadedStyles.has(href)) return loadedStyles.get(href);

  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve(true);
    link.onerror = () => {
      loadedStyles.delete(href);
      reject(new Error(`Failed to load CSS: ${href}`));
    };
    document.head.appendChild(link);
  });

  loadedStyles.set(href, promise);
  return promise;
}

// Lazy Load Engines
const LazyEngines = {
  // Mermaid Diagrams (~2.5MB deferred)
  async ensureMermaid() {
    if (window.mermaid) return window.mermaid;
    await loadScript('https://cdn.jsdelivr.net/npm/mermaid@10.4.0/dist/mermaid.min.js');
    if (window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose'
      });
    }
    return window.mermaid;
  },

  // Math Rendering (KaTeX + Auto-render extension)
  async ensureKaTeX() {
    if (window.katex && window.renderMathInElement) {
      return { katex: window.katex, renderMathInElement: window.renderMathInElement };
    }
    await Promise.all([
      loadCSS('https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css'),
      loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js')
    ]);
    await loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js');
    return { katex: window.katex, renderMathInElement: window.renderMathInElement };
  },

  // 3D Molecular Viewer (~2MB WebGL deferred)
  async ensure3Dmol() {
    if (window.$3Dmol) return window.$3Dmol;
    await loadScript('https://3Dmol.csb.pitt.edu/build/3Dmol-min.js');
    return window.$3Dmol;
  },

  // Charts
  async ensureChartJS() {
    if (window.Chart) return window.Chart;
    await loadScript('https://cdn.jsdelivr.net/npm/chart.js');
    return window.Chart;
  },

  // Search Engine (Fuse.js)
  async ensureFuse() {
    if (window.Fuse) return window.Fuse;
    await loadScript('https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.min.js');
    return window.Fuse;
  },

  // PDF Export
  async ensurePDF() {
    if (window.html2pdf) return window.html2pdf;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
    return window.html2pdf;
  }
};

window.LazyEngines = LazyEngines;
