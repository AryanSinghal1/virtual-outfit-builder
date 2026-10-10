import { addToCart } from './cart.js';
import { createStore } from './storage.js';
import {
  buildCatalog, selectProduct, selectVariant, removeSlot, outfitItems, swipeable, initialOutfit,
  summarize, canAddToCart, encodeOutfit, decodeOutfit, randomOutfit, newOutfitId,
} from './outfit.js';
import { suggestLooks, discoverLooks } from './suggest.js';

// The builder is a full-screen styling surface: no prices or totals here, so
// shoppers think in looks rather than line items. Sizes and add-to-cart live
// in a sheet that only opens when they ask for the look.
const DEFAULT_STRINGS = {
  top: 'Tops', bottom: 'Bottoms', shoes: 'Shoes', onepiece: 'Dresses & one-pieces',
  separates: 'Top & bottom', dress: 'Dress', prev: 'Previous', next: 'Next', add_back: 'Tap to add back',
  get_look: 'Get this look', your_look: 'Your look', add: 'Add look to bag', adding: 'Adding…', close: 'Close',
  added: 'Look added to your bag', choose_size: 'Choose a size for each piece', sold_out: 'Sold out',
  unavailable: 'A piece in your look is sold out in that size', empty: 'Swipe a row to add it to your look',
  unlock: 'Add {n} more piece to unlock {pct}% off the look', unlocked: 'Complete look: {pct}% off at checkout',
  save: 'Save', saved: 'Saved', share: 'Share', shuffle: 'Shuffle', style_me: 'Style me', looks_for_you: 'Looks for you', more_looks: 'More ideas', remove: 'Remove', saved_looks: 'Saved looks',
  no_saved: 'Looks you save show up here', load: 'Wear this', link_copied: 'Link copied',
  share_text: 'Check out this look', no_products: 'No products found for the outfit builder yet.',
};

/** Tiny element helper; children that are strings become text nodes (never HTML). */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
const imageFor = (item) => (item.variant && item.variant.image) || item.product.image;
const hasRealVariants = (p) => p.variants.length > 1 || p.variants[0].title !== 'Default Title';
const STACK = ['top', 'onepiece', 'bottom', 'shoes'];

export function mount(root, config) {
  const t = { ...DEFAULT_STRINGS, ...(config.strings || {}) };
  const catalog = buildCatalog(config);
  const store = createStore(`outfit-builder:${config.shop || location.host}`);
  const pricing = { discountPercent: Number(config.discountPercent) || 0, minItems: Number(config.minItems) || 2 };
  const lists = Object.fromEntries(STACK.map((s) => [s, swipeable(catalog, s)]));
  const slots = STACK.filter((s) => lists[s].length);
  const hasSeparates = lists.top.length || lists.bottom.length;

  if (!slots.length) {
    root.replaceChildren(h('p', { class: 'ob-empty' }, t.no_products));
    return;
  }

  const shared = new URLSearchParams(location.search).get('outfit');
  let outfit = shared ? decodeOutfit(shared, catalog) : initialOutfit(catalog);
  // Remember the last product per slot and size per product, so switching
  // between "Top & bottom" and "Dress" or swiping back never loses a choice.
  const lastProduct = {};
  const lastSize = {};
  const remember = () => {
    for (const s of STACK) if (outfit[s]) {
      lastProduct[s] = outfit[s].productId;
      if (outfit[s].variantId) lastSize[outfit[s].productId] = outfit[s].variantId;
    }
  };
  remember();
  let anchorSlot = null; // the slot the shopper last chose; suggestions are built around it

  // ---- carousels: one per slot, native scroll-snap so swipe works everywhere ----
  const carousels = {};
  for (const slot of slots) {
    const track = h('div', { class: 'ob-track', tabindex: '0', 'aria-label': t[slot] },
      lists[slot].map((p, i) => h('div', {
        class: 'ob-slide', 'data-id': p.id, role: 'group', 'aria-roledescription': 'slide',
        'aria-label': `${i + 1} / ${lists[slot].length}: ${p.title}`,
      },
      h('div', { class: 'ob-slide-img' }, p.image ? h('img', { src: p.image, alt: p.title, loading: i < 2 ? 'eager' : 'lazy', draggable: 'false' }) : null),
      h('span', { class: 'ob-slide-title' }, p.title))));
    const prev = h('button', { type: 'button', class: 'ob-nav ob-nav--prev', 'data-action': 'prev', 'data-slot': slot, 'aria-label': `${t.prev}: ${t[slot]}` }, '‹');
    const next = h('button', { type: 'button', class: 'ob-nav ob-nav--next', 'data-action': 'next', 'data-slot': slot, 'aria-label': `${t.next}: ${t[slot]}` }, '›');
    const el = h('section', { class: `ob-carousel ob-carousel--${slot}`, 'data-slot': slot, 'aria-roledescription': 'carousel', 'aria-label': t[slot] },
      prev, track, next,
      h('button', { type: 'button', class: 'ob-add-back', 'data-action': 'add-back', 'data-slot': slot }, t.add_back));
    carousels[slot] = { el, track, prev, next, slides: [...track.children] };

    let timer;
    const settle = () => { clearTimeout(timer); onSettle(slot); };
    track.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(settle, 120); }, { passive: true });
    track.addEventListener('scrollend', settle);
  }

  const modeBar = hasSeparates && lists.onepiece.length
    ? h('div', { class: 'ob-mode', role: 'group' },
      h('button', { type: 'button', 'data-action': 'mode', 'data-mode': 'separates' }, t.separates),
      h('button', { type: 'button', 'data-action': 'mode', 'data-mode': 'dress' }, t.dress))
    : null;

  const saveBtn = store.available
    ? h('button', { type: 'button', class: 'ob-icon-btn', 'data-action': 'save', 'aria-pressed': 'false', 'aria-label': t.save }, '♡')
    : null;
  const savedBtn = store.available
    ? h('button', { type: 'button', class: 'ob-pill', 'data-action': 'open-saved' }, t.saved_looks)
    : null;
  const status = h('p', { class: 'ob-status', role: 'status' });

  const stage = h('div', { class: 'ob-stage' },
    h('div', { class: 'ob-topbar' }, modeBar, savedBtn),
    h('div', { class: 'ob-rows' }, slots.map((s) => carousels[s].el)),
    status,
    h('div', { class: 'ob-actionbar' },
      h('button', { type: 'button', class: 'ob-icon-btn', 'data-action': 'shuffle', 'aria-label': t.shuffle, title: t.shuffle }, '⤨'),
      h('button', { type: 'button', class: 'ob-icon-btn ob-style-me', 'data-action': 'open-suggest', 'aria-label': t.style_me, title: t.style_me }, '✨'),
      saveBtn,
      h('button', { type: 'button', class: 'ob-icon-btn', 'data-action': 'share', 'aria-label': t.share, title: t.share }, '↗'),
      h('button', { type: 'button', class: 'ob-cta', 'data-action': 'open-look' }, t.get_look)));

  // ---- bottom sheet (sizes + add to bag, or saved looks) ---------------------
  const sheetTitle = h('h3', { class: 'ob-sheet-title', id: `${config.anchor || 'ob'}-sheet-title` });
  const sheetBody = h('div', { class: 'ob-sheet-body' });
  const sheet = h('div', { class: 'ob-sheet', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': sheetTitle.id },
    h('div', { class: 'ob-sheet-backdrop', 'data-action': 'close' }),
    h('div', { class: 'ob-sheet-panel' },
      h('div', { class: 'ob-sheet-head' }, sheetTitle, h('button', { type: 'button', class: 'ob-icon-btn', 'data-action': 'close', 'aria-label': t.close }, '×')),
      sheetBody));
  let sheetView = null; // 'look' | 'saved' | 'suggest' | null
  let suggestions = [];
  let opener = null;

  root.replaceChildren(stage, sheet);

  // ---- carousel <-> state --------------------------------------------------
  const isDressMode = () => !!outfit.onepiece || (!hasSeparates && !!lists.onepiece.length);
  const visible = (slot) => (slot === 'onepiece' ? isDressMode() : slot === 'top' || slot === 'bottom' ? !isDressMode() : true);

  function centeredIndex(slot) {
    const { track, slides } = carousels[slot];
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    slides.forEach((s, i) => {
      const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }

  function scrollToIndex(slot, i, smooth) {
    const { track, slides } = carousels[slot];
    const s = slides[Math.max(0, Math.min(i, slides.length - 1))];
    if (!s || !track.clientWidth) return;
    track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'instant' });
  }

  const indexOf = (slot, productId) => lists[slot].findIndex((p) => p.id === productId);

  /** Scroll every visible carousel to the product the outfit has (or last had) in it. */
  function syncScroll(smooth) {
    for (const slot of slots) {
      if (!visible(slot)) continue;
      const id = outfit[slot] ? outfit[slot].productId : lastProduct[slot];
      const i = indexOf(slot, id);
      if (i >= 0 && i !== centeredIndex(slot)) scrollToIndex(slot, i, smooth);
    }
  }

  function choose(slot, product) {
    if (outfit[slot] && outfit[slot].productId === product.id) return;
    outfit = selectProduct(outfit, slot, product, lastSize[product.id]);
    anchorSlot = slot;
    remember();
    render();
  }

  /** A swipe came to rest: whatever is in the middle is now in the outfit. */
  function onSettle(slot) {
    if (!visible(slot) || !carousels[slot].track.clientWidth) return;
    const product = lists[slot][centeredIndex(slot)];
    // A slot the shopper removed stays out until they actually move the carousel.
    if (!outfit[slot] && lastProduct[slot] === product.id) return updateCarousels();
    choose(slot, product);
  }

  function updateCarousels() {
    if (modeBar) for (const b of modeBar.children) b.setAttribute('aria-pressed', String((b.dataset.mode === 'dress') === isDressMode()));
    for (const slot of slots) {
      const c = carousels[slot];
      c.el.hidden = !visible(slot);
      c.el.classList.toggle('is-off', !outfit[slot]);
      const i = outfit[slot] ? indexOf(slot, outfit[slot].productId) : centeredIndex(slot);
      c.slides.forEach((s, j) => s.classList.toggle('is-current', j === i));
      c.prev.hidden = i <= 0;
      c.next.hidden = i >= c.slides.length - 1;
    }
    const isSaved = store.available && store.list().some((o) => o.code === encodeOutfit(outfit));
    if (saveBtn) {
      saveBtn.setAttribute('aria-pressed', String(isSaved));
      saveBtn.setAttribute('aria-label', isSaved ? t.saved : t.save);
      saveBtn.textContent = isSaved ? '♥' : '♡';
    }
    stage.querySelector('.ob-cta').disabled = !outfitItems(outfit, catalog).length;
  }

  // ---- sheet content ---------------------------------------------------------
  function renderLook() {
    const items = outfitItems(outfit, catalog);
    const sum = summarize(items, pricing);
    sheetTitle.textContent = t.your_look;
    if (!items.length) {
      sheetBody.replaceChildren(h('p', { class: 'ob-muted' }, t.empty));
      return;
    }
    const lines = h('ul', { class: 'ob-lines' }, items.map((item) => {
      const { product, variant, slot } = item;
      return h('li', { class: 'ob-line' },
        h('img', { class: 'ob-line-img', src: imageFor(item), alt: '', width: 64, height: 64 }),
        h('div', { class: 'ob-line-body' },
          h('a', { href: product.url, class: 'ob-line-title' }, product.title),
          hasRealVariants(product)
            ? h('div', { class: 'ob-variants', role: 'radiogroup', 'aria-label': product.title },
              product.variants.map((v) => h('button', {
                type: 'button', role: 'radio', class: 'ob-chip', 'data-action': 'variant', 'data-slot': slot, 'data-id': v.id,
                'aria-checked': String(v.id === (variant && variant.id)), disabled: !v.available,
                title: v.available ? null : t.sold_out,
              }, v.title)))
            : null),
        h('button', { type: 'button', class: 'ob-remove', 'data-action': 'remove', 'data-slot': slot, 'aria-label': `${t.remove} ${product.title}` }, '×'));
    }));

    let hint = '';
    if (sum.missingVariant.length) hint = t.choose_size;
    else if (sum.soldOut.length) hint = t.unavailable;
    const offer = sum.needed ? fill(t.unlock, { n: sum.needed, pct: pricing.discountPercent })
      : sum.eligible ? fill(t.unlocked, { pct: pricing.discountPercent }) : '';
    const ready = canAddToCart(sum);

    sheetBody.replaceChildren(
      lines,
      offer ? h('p', { class: `ob-offer${sum.eligible ? ' is-good' : ''}` }, offer) : null,
      hint ? h('p', { class: 'ob-hint' }, hint) : null,
      h('button', { type: 'button', class: 'ob-add', 'data-action': 'add', disabled: !ready, 'aria-disabled': String(!ready) }, t.add));
  }

  function renderSavedList() {
    sheetTitle.textContent = t.saved_looks;
    const cards = store.list().map((o) => {
      const items = outfitItems(decodeOutfit(o.code, catalog), catalog);
      if (!items.length) return null;
      return lookCard(o.code, items,
        h('button', { type: 'button', class: 'ob-remove', 'data-action': 'unsave', 'data-code': o.code, 'aria-label': t.remove }, '×'));
    }).filter(Boolean);
    sheetBody.replaceChildren(cards.length ? h('ul', { class: 'ob-look-grid' }, cards) : h('p', { class: 'ob-muted' }, t.no_saved));
  }

  /** Mini look cards (pieces stacked like the builder), used for suggestions and saved looks. */
  const lookCard = (code, items, extra) => h('li', { class: 'ob-look-card' },
    h('button', { type: 'button', class: 'ob-look-load', 'data-action': 'load', 'data-code': code, 'aria-label': `${t.load}: ${items.map((i) => i.product.title).join(', ')}` },
      items.map((i) => h('img', { class: `ob-look-${i.slot}`, src: imageFor(i), alt: '' }))),
    extra);

  function renderSuggestions() {
    sheetTitle.textContent = t.looks_for_you;
    const cards = suggestions.map((look) => lookCard(encodeOutfit(look), outfitItems(look, catalog)));
    sheetBody.replaceChildren(
      h('ul', { class: 'ob-look-grid' }, cards),
      h('button', { type: 'button', class: 'ob-secondary', 'data-action': 'more-looks' }, t.more_looks));
  }

  function renderSheet() {
    if (sheetView === 'look') renderLook();
    else if (sheetView === 'saved') renderSavedList();
    else if (sheetView === 'suggest') renderSuggestions();
  }

  function openSheet(view, trigger) {
    sheetView = view;
    opener = trigger;
    renderSheet();
    sheet.hidden = false;
    document.documentElement.classList.add('ob-lock');
    (sheet.querySelector('.ob-chip[aria-checked="false"]:not([disabled])') || sheet.querySelector('[data-action="close"].ob-icon-btn')).focus();
  }

  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    sheetView = null;
    document.documentElement.classList.remove('ob-lock');
    opener?.focus();
  }

  function render() {
    updateCarousels();
    renderSheet();
  }

  const say = (msg) => {
    status.textContent = msg;
    clearTimeout(say.timer);
    if (msg) say.timer = setTimeout(() => { status.textContent = ''; }, 3000);
  };

  // ---- actions ---------------------------------------------------------------
  async function add() {
    const items = outfitItems(outfit, catalog);
    if (!canAddToCart(summarize(items, pricing))) return;
    const btn = sheet.querySelector('.ob-add');
    btn.disabled = true;
    btn.textContent = t.adding;
    const outfitId = newOutfitId();
    try {
      await addToCart(config.cartAddUrl, items, outfitId);
      window.Shopify?.analytics?.publish?.('outfit_builder:add_to_cart', { outfitId, variantIds: items.map((i) => i.variant.id) });
      root.dispatchEvent(new CustomEvent('outfit-builder:added', { bubbles: true, detail: { outfitId, items } }));
      if (config.afterAdd === 'checkout') return location.assign(config.checkoutUrl || '/checkout');
      if (config.afterAdd !== 'stay') return location.assign(config.cartUrl);
      closeSheet();
      say(t.added);
    } catch (err) {
      renderSheet();
      sheetBody.append(h('p', { class: 'ob-hint', role: 'alert' }, err.message));
    }
  }

  async function share() {
    const url = new URL(location.href);
    url.searchParams.set('outfit', encodeOutfit(outfit));
    url.hash = config.anchor || '';
    const link = url.toString();
    if (navigator.share) {
      try {
        return await navigator.share({ title: t.share_text, url: link });
      } catch (err) {
        if (err && err.name === 'AbortError') return; // user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      say(t.link_copied);
    } catch {
      window.prompt(t.share_text, link); // webviews without share or clipboard access
    }
  }

  /** Switch between top+bottom and dress, restoring whatever was picked there before. */
  function setMode(dress) {
    for (const slot of dress ? ['onepiece'] : ['top', 'bottom']) {
      if (!lists[slot].length) continue;
      const product = lists[slot][Math.max(0, indexOf(slot, lastProduct[slot]))];
      outfit = selectProduct(outfit, slot, product, lastSize[product.id]);
    }
    remember();
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || !root.contains(el)) return;
    const { action, slot } = el.dataset;
    const id = Number(el.dataset.id);
    let resync = false;
    switch (action) {
      case 'prev':
      case 'next':
        // Just scroll; the carousel's settle handler updates the outfit.
        return scrollToIndex(slot, centeredIndex(slot) + (action === 'next' ? 1 : -1), true);
      case 'add-back': return choose(slot, lists[slot][centeredIndex(slot)]);
      case 'open-look': return openSheet('look', el);
      case 'open-saved': return openSheet('saved', el);
      case 'open-suggest':
        // Before any swipe, style around the main piece on screen.
        suggestions = suggestLooks(catalog, outfit, anchorSlot || (outfit.onepiece ? 'onepiece' : 'top'));
        return openSheet('suggest', el);
      case 'more-looks':
        suggestions = discoverLooks(catalog);
        return renderSheet();
      case 'close': return closeSheet();
      case 'add': return void add();
      case 'share': return void share();
      case 'mode': setMode(el.dataset.mode === 'dress'); resync = true; break;
      case 'shuffle': outfit = randomOutfit(catalog); anchorSlot = null; remember(); resync = true; break;
      case 'variant': outfit = selectVariant(outfit, slot, id); anchorSlot = slot; remember(); break;
      case 'remove': outfit = removeSlot(outfit, slot); break;
      case 'load': outfit = decodeOutfit(el.dataset.code, catalog); remember(); resync = true; closeSheet(); break;
      case 'save': {
        const code = encodeOutfit(outfit);
        const wasSaved = store.list().some((o) => o.code === code);
        if (wasSaved) store.remove(code); else store.save(code);
        say(wasSaved ? '' : t.saved);
        break;
      }
      case 'unsave': store.remove(el.dataset.code); break;
      default: return;
    }
    render();
    if (resync) syncScroll(action !== 'mode');
    if (action === 'variant') sheet.querySelector(`[data-action="variant"][data-id="${id}"]`)?.focus();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });

  // Tapping a neighbouring (peeking) slide brings it to the centre.
  stage.addEventListener('click', (e) => {
    const slide = e.target.closest('.ob-slide');
    if (!slide || slide.classList.contains('is-current')) return;
    const slot = slide.closest('.ob-carousel').dataset.slot;
    scrollToIndex(slot, carousels[slot].slides.indexOf(slide), true);
  });

  // Fill the screen below the theme header, so the action bar is always visible.
  const fit = () => {
    const top = root.getBoundingClientRect().top + window.scrollY;
    stage.style.setProperty('--ob-top', `${Math.min(Math.max(top, 0), 240)}px`);
  };

  fit();
  render();
  syncScroll(false);
  // Layout can shift after fonts/images load or on rotation; keep the selection centred.
  window.addEventListener('resize', () => { fit(); syncScroll(false); });
}
