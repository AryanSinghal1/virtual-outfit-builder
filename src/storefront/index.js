// Entry point for the theme app extension asset. Mounts every builder block on the page.
import { mount } from './builder.js';

function init() {
  for (const root of document.querySelectorAll('[data-outfit-builder]:not([data-ob-ready])')) {
    root.setAttribute('data-ob-ready', '');
    try {
      const config = JSON.parse(root.querySelector('script[data-ob-config]').textContent);
      config.anchor = root.id;
      mount(root.querySelector('.ob-mount') || root, config);
    } catch (err) {
      console.error('[outfit-builder]', err);
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
// Re-mount when the block is added or edited in the theme editor.
document.addEventListener('shopify:section:load', init);
