// Pure outfit state: no DOM, no network. Everything here is unit-tested.
import { categorize } from './categorize.js';

/** Display order. A one-piece occupies the top and bottom slots together. */
export const ORDER = ['top', 'onepiece', 'bottom', 'shoes'];
const CLEARS = { onepiece: ['top', 'bottom'], top: ['onepiece'], bottom: ['onepiece'], shoes: [] };

/**
 * Builds the catalog from the block config. Either the merchant picked one
 * collection per slot (`lists`), or we auto-categorize one catalog collection.
 */
export function buildCatalog(config) {
  const bySlot = { top: [], bottom: [], shoes: [], onepiece: [] };
  const products = new Map();
  const slotOf = new Map();

  const add = (slot, product) => {
    if (!slot || !bySlot[slot] || products.has(product.id)) return;
    products.set(product.id, product);
    slotOf.set(product.id, slot);
    bySlot[slot].push(product);
  };

  const lists = config.lists || {};
  const hasLists = Object.values(lists).some((l) => l && l.length);
  if (hasLists) {
    for (const slot of ORDER) for (const p of lists[slot] || []) add(slot, p);
  } else {
    for (const p of config.products || []) add(categorize(p), p);
  }

  const variants = new Map();
  for (const p of products.values()) for (const v of p.variants) variants.set(v.id, p);

  return { bySlot, products, slotOf, variants };
}

export function emptyOutfit() {
  return { top: null, bottom: null, shoes: null, onepiece: null };
}

/** The variant to preselect: the only variant, or the only one in stock. Never guess a size. */
export function defaultVariantId(product) {
  if (product.variants.length === 1) return product.variants[0].id;
  const inStock = product.variants.filter((v) => v.available);
  return inStock.length === 1 ? inStock[0].id : null;
}

/** Puts a product in a slot (clearing slots it conflicts with). Swiping is idempotent, so re-selecting keeps it. */
export function selectProduct(outfit, slot, product, variantId) {
  const next = { ...outfit };
  for (const other of CLEARS[slot]) next[other] = null;
  const valid = product.variants.some((v) => v.id === variantId);
  next[slot] = { productId: product.id, variantId: valid ? variantId : defaultVariantId(product) };
  return next;
}

/** In-stock products for a slot, i.e. what the swipe carousel shows. */
export function swipeable(catalog, slot) {
  return catalog.bySlot[slot].filter((p) => p.available);
}

/** Shoppers land on a complete look (first in-stock of each) and swipe from there. */
export function initialOutfit(catalog) {
  let outfit = emptyOutfit();
  const separates = swipeable(catalog, 'top').length || swipeable(catalog, 'bottom').length;
  for (const slot of separates ? ['top', 'bottom', 'shoes'] : ['onepiece', 'shoes']) {
    const [first] = swipeable(catalog, slot);
    if (first) outfit = selectProduct(outfit, slot, first);
  }
  return outfit;
}

export function selectVariant(outfit, slot, variantId) {
  if (!outfit[slot]) return outfit;
  return { ...outfit, [slot]: { ...outfit[slot], variantId } };
}

export function removeSlot(outfit, slot) {
  return { ...outfit, [slot]: null };
}

export function outfitItems(outfit, catalog) {
  const items = [];
  for (const slot of ORDER) {
    const sel = outfit[slot];
    if (!sel) continue;
    const product = catalog.products.get(sel.productId);
    if (!product) continue;
    const variant = product.variants.find((v) => v.id === sel.variantId) || null;
    items.push({ slot, product, variant });
  }
  return items;
}

function cheapestPrice(product) {
  const pool = product.variants.filter((v) => v.available);
  return Math.min(...(pool.length ? pool : product.variants).map((v) => v.price));
}

/**
 * Prices the outfit. Until a variant is picked we use the cheapest in-stock
 * price so the total is never overstated.
 */
export function summarize(items, { discountPercent = 0, minItems = 2 } = {}) {
  const subtotal = items.reduce((sum, i) => sum + (i.variant ? i.variant.price : cheapestPrice(i.product)), 0);
  const eligible = discountPercent > 0 && items.length >= minItems;
  const discount = eligible ? Math.round((subtotal * discountPercent) / 100) : 0;
  return {
    count: items.length,
    subtotal,
    discount,
    total: subtotal - discount,
    eligible,
    needed: discountPercent > 0 ? Math.max(0, minItems - items.length) : 0,
    missingVariant: items.filter((i) => !i.variant).map((i) => i.slot),
    soldOut: items.filter((i) => i.variant && !i.variant.available).map((i) => i.slot),
  };
}

export function canAddToCart(summary) {
  return summary.count > 0 && !summary.missingVariant.length && !summary.soldOut.length;
}

// Compact, URL-safe encoding used for share links and saved outfits:
// "productId-variantId" (or just "productId"), joined with ".".
export function encodeOutfit(outfit) {
  return ORDER.filter((s) => outfit[s])
    .map((s) => (outfit[s].variantId ? `${outfit[s].productId}-${outfit[s].variantId}` : `${outfit[s].productId}`))
    .join('.');
}

export function decodeOutfit(code, catalog) {
  let outfit = emptyOutfit();
  for (const part of String(code || '').split('.')) {
    const [pid, vid] = part.split('-').map(Number);
    const product = catalog.products.get(pid);
    if (!product) continue; // product removed from the catalog since it was shared
    outfit = selectProduct(outfit, catalog.slotOf.get(pid), product, vid || undefined);
  }
  return outfit;
}

export function randomOutfit(catalog, rand = Math.random) {
  const pick = (list) => {
    const pool = list.filter((p) => p.available);
    return pool.length ? pool[Math.floor(rand() * pool.length)] : null;
  };
  let outfit = emptyOutfit();
  const { top, bottom, shoes, onepiece } = catalog.bySlot;
  const separates = top.length && bottom.length;
  const useOnePiece = onepiece.length && (!separates || rand() < 0.3);
  const picks = useOnePiece ? [['onepiece', pick(onepiece)]] : [['top', pick(top)], ['bottom', pick(bottom)]];
  picks.push(['shoes', pick(shoes)]);
  for (const [slot, product] of picks) if (product) outfit = selectProduct(outfit, slot, product);
  return outfit;
}

export function newOutfitId(rand = Math.random) {
  return Date.now().toString(36) + rand().toString(36).slice(2, 7);
}
