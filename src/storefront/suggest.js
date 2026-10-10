// Rule-based look suggestions from data merchants already have (tags, titles).
//   - `look:<name>` tags are merchant-curated looks: pieces sharing one are strongly paired.
//   - Other shared tags (style/occasion/season, e.g. "casual", "summer") count as affinity.
//   - Neutral colours go with anything, so they get a small bonus.
// A little randomness breaks ties so suggestions don't feel static.
import { emptyOutfit, selectProduct, swipeable } from './outfit.js';

const NEUTRALS = ['black', 'white', 'cream', 'ivory', 'beige', 'tan', 'camel', 'grey', 'gray', 'navy', 'denim', 'khaki', 'stone', 'ecru', 'charcoal'];

const styleTags = (p) => (p.tags || []).map((x) => String(x).toLowerCase().trim()).filter((x) => x && !x.startsWith('outfit:'));
const isNeutral = (p) => {
  const words = `${p.title} ${(p.tags || []).join(' ')}`.toLowerCase().split(/[^a-z]+/);
  return words.some((w) => NEUTRALS.includes(w));
};

/** How well product b goes with product a. */
export function affinity(a, b) {
  const ta = new Set(styleTags(a));
  let score = 0;
  for (const tag of styleTags(b)) {
    if (!ta.has(tag)) continue;
    score += tag.startsWith('look:') ? 6 : 2;
  }
  if (isNeutral(a) || isNeutral(b)) score += 1;
  return score;
}

/**
 * Builds `count` distinct looks around an anchor piece (the one the shopper
 * last chose). Without an anchor, it picks a random in-stock piece to start.
 */
export function suggestLooks(catalog, outfit, anchorSlot, { count = 4, rand = Math.random, avoidCurrent = true } = {}) {
  const sel = anchorSlot && outfit[anchorSlot];
  let slot = sel ? anchorSlot : null;
  let anchor = sel ? catalog.products.get(sel.productId) : null;
  if (!anchor) {
    const pool = ['top', 'bottom', 'onepiece', 'shoes'].flatMap((s) => swipeable(catalog, s).map((p) => [s, p]));
    if (!pool.length) return [];
    [slot, anchor] = pool[Math.floor(rand() * pool.length)];
  }

  const hasSeparates = swipeable(catalog, 'top').length && swipeable(catalog, 'bottom').length;
  const hasDresses = swipeable(catalog, 'onepiece').length;
  let shape;
  if (slot === 'onepiece') shape = ['onepiece', 'shoes'];
  else if (slot === 'top' || slot === 'bottom') shape = ['top', 'bottom', 'shoes'];
  else shape = (outfit.onepiece && hasDresses) || !hasSeparates ? ['onepiece', 'shoes'] : ['top', 'bottom', 'shoes'];

  // Rank candidates for every other slot once; look i takes the i-th best, so looks differ.
  const ranked = {};
  for (const s of shape) {
    if (s === slot) continue;
    const current = outfit[s] && outfit[s].productId;
    let pool = swipeable(catalog, s);
    if (avoidCurrent && pool.length > 1) pool = pool.filter((p) => p.id !== current);
    ranked[s] = pool
      .map((p) => ({ p, score: affinity(anchor, p) + rand() * 1.5 }))
      .sort((x, y) => y.score - x.score)
      .map((x) => x.p);
  }

  const looks = [];
  const seen = new Set();
  for (let i = 0; looks.length < count && i < count * 3; i++) {
    let look = selectProduct(emptyOutfit(), slot, anchor, sel ? sel.variantId : undefined);
    for (const s of shape) {
      if (s === slot || !ranked[s].length) continue;
      look = selectProduct(look, s, ranked[s][i % ranked[s].length]);
    }
    const key = shape.map((s) => look[s] && look[s].productId).join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    looks.push(look);
  }
  return looks;
}

const keyOf = (look) => ['top', 'onepiece', 'bottom', 'shoes'].map((s) => look[s] && look[s].productId).join('.');

/** Fresh inspiration: each look is built around a different random piece, so the set varies. */
export function discoverLooks(catalog, { count = 4, rand = Math.random } = {}) {
  const looks = [];
  const seen = new Set();
  for (let i = 0; looks.length < count && i < count * 6; i++) {
    // Take this anchor's best look not already shown (its 2nd/3rd best if needed).
    const options = suggestLooks(catalog, emptyOutfit(), null, { count: 3, rand, avoidCurrent: false });
    if (!options.length) break;
    const look = options.find((l) => !seen.has(keyOf(l)));
    if (!look) continue;
    seen.add(keyOf(look));
    looks.push(look);
  }
  return looks;
}
