import { describe, it, expect } from 'vitest';
import { product } from './fixtures.js';
import {
  buildCatalog, emptyOutfit, selectProduct, selectVariant, outfitItems, summarize, canAddToCart,
  encodeOutfit, decodeOutfit, randomOutfit, defaultVariantId, initialOutfit, swipeable,
} from '../src/storefront/outfit.js';

const tee = product('Tee', { price: 2000 });
const jeans = product('Jeans', { price: 5000 });
const sneakers = product('Sneakers', { sizes: ['42'], price: 8000 });
const dress = product('Midi Dress', { price: 9000 });
const soldOutTee = product('Rare Tee', { soldOut: ['S', 'M', 'L'] });
const oneLeft = product('Last One Skirt', { soldOut: ['S', 'L'] });
const catalog = buildCatalog({ products: [tee, jeans, sneakers, dress, soldOutTee, oneLeft] });

describe('buildCatalog', () => {
  it('auto-categorizes when no lists are given', () => {
    expect(catalog.bySlot.top.map((p) => p.title)).toEqual(['Tee', 'Rare Tee']);
    expect(catalog.bySlot.bottom.map((p) => p.title)).toEqual(['Jeans', 'Last One Skirt']);
    expect(catalog.bySlot.onepiece.map((p) => p.title)).toEqual(['Midi Dress']);
  });
  it('uses merchant lists verbatim when present, ignoring keywords', () => {
    const cat = buildCatalog({ lists: { top: [dress], bottom: [], shoes: [sneakers] }, products: [tee] });
    expect(cat.bySlot.top).toEqual([dress]);
    expect(cat.products.has(tee.id)).toBe(false);
  });
  it('places a product in only one slot', () => {
    const cat = buildCatalog({ lists: { top: [tee], bottom: [tee] } });
    expect(cat.bySlot.bottom).toEqual([]);
  });
});

describe('selection', () => {
  it('never guesses a size, but preselects single or only-in-stock variants', () => {
    expect(defaultVariantId(tee)).toBe(null);
    expect(defaultVariantId(sneakers)).toBe(sneakers.variants[0].id);
    expect(defaultVariantId(oneLeft)).toBe(oneLeft.variants[1].id);
  });
  it('selecting the same product again keeps it (swipes are idempotent)', () => {
    let o = selectProduct(emptyOutfit(), 'top', tee, tee.variants[1].id);
    o = selectProduct(o, 'top', tee, tee.variants[1].id);
    expect(o.top).toEqual({ productId: tee.id, variantId: tee.variants[1].id });
  });
  it('a one-piece replaces top and bottom, and vice versa', () => {
    let o = selectProduct(emptyOutfit(), 'top', tee);
    o = selectProduct(o, 'bottom', jeans);
    o = selectProduct(o, 'onepiece', dress);
    expect([o.top, o.bottom]).toEqual([null, null]);
    o = selectProduct(o, 'bottom', jeans);
    expect(o.onepiece).toBe(null);
  });
});

describe('summarize', () => {
  const full = () => {
    let o = selectProduct(emptyOutfit(), 'top', tee);
    o = selectProduct(o, 'bottom', jeans);
    return selectProduct(o, 'shoes', sneakers);
  };

  it('blocks checkout until every size is picked', () => {
    const o = full();
    const s = summarize(outfitItems(o, catalog));
    expect(s.missingVariant).toEqual(['top', 'bottom']);
    expect(canAddToCart(s)).toBe(false);
    const ready = selectVariant(selectVariant(o, 'top', tee.variants[1].id), 'bottom', jeans.variants[0].id);
    expect(canAddToCart(summarize(outfitItems(ready, catalog)))).toBe(true);
  });

  it('applies the discount only at the minimum item count', () => {
    const one = outfitItems(selectProduct(emptyOutfit(), 'shoes', sneakers), catalog);
    expect(summarize(one, { discountPercent: 10, minItems: 2 })).toMatchObject({ discount: 0, needed: 1, eligible: false });
    const s = summarize(outfitItems(full(), catalog), { discountPercent: 10, minItems: 2 });
    expect(s).toMatchObject({ subtotal: 15000, discount: 1500, total: 13500, eligible: true, needed: 0 });
  });

  it('flags sold-out variants (e.g. restored from an old share link)', () => {
    const o = selectProduct(emptyOutfit(), 'bottom', oneLeft, oneLeft.variants[0].id);
    expect(summarize(outfitItems(o, catalog)).soldOut).toEqual(['bottom']);
  });
});

describe('encode / decode', () => {
  it('round-trips products and chosen variants', () => {
    let o = selectProduct(emptyOutfit(), 'onepiece', dress, dress.variants[2].id);
    o = selectProduct(o, 'shoes', sneakers);
    const code = encodeOutfit(o);
    expect(code).toBe(`${dress.id}-${dress.variants[2].id}.${sneakers.id}-${sneakers.variants[0].id}`);
    expect(decodeOutfit(code, catalog)).toEqual(o);
  });
  it('ignores products that no longer exist and junk input', () => {
    expect(decodeOutfit(`99999.${tee.id}`, catalog).top).toEqual({ productId: tee.id, variantId: null });
    expect(decodeOutfit('garbage', catalog)).toEqual(emptyOutfit());
  });
});

describe('randomOutfit', () => {
  it('only picks in-stock products and always fills shoes', () => {
    for (let i = 0; i < 50; i++) {
      const o = randomOutfit(catalog);
      expect(o.top?.productId).not.toBe(soldOutTee.id);
      expect(o.shoes?.productId).toBe(sneakers.id);
      expect(!!o.onepiece).toBe(!o.top && !o.bottom);
    }
  });
});

describe('initialOutfit', () => {
  it('starts on a complete look of in-stock items', () => {
    const o = initialOutfit(catalog);
    expect([o.top.productId, o.bottom.productId, o.shoes.productId]).toEqual([tee.id, jeans.id, sneakers.id]);
    expect(o.onepiece).toBe(null);
    expect(swipeable(catalog, 'top')).not.toContain(soldOutTee);
  });
  it('starts on a dress when the store has no separates', () => {
    const o = initialOutfit(buildCatalog({ products: [dress, sneakers] }));
    expect(o.onepiece.productId).toBe(dress.id);
  });
});
