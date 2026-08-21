/**
 * MeowMD Service Worker Registration (sw-register.js)
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('MeowMD ServiceWorker registered with scope:', registration.scope);
      })
      .catch((error) => {
        console.warn('ServiceWorker registration failed:', error);
      });
  });
}
