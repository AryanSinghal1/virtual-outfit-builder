import { describe, it, expect } from 'vitest';
import { product } from './fixtures.js';
import { buildCatalog, emptyOutfit, selectProduct } from '../src/storefront/outfit.js';
import { affinity, suggestLooks, discoverLooks } from '../src/storefront/suggest.js';

const linen = product('Linen Shirt', { tags: ['summer', 'casual', 'look:beach'] });
const silk = product('Silk Blouse', { tags: ['evening'] });
const shorts = product('Linen Shorts', { tags: ['summer', 'look:beach'] });
const chinos = product('Chinos', { tags: ['casual'] });
const trousers = product('Satin Trousers', { tags: ['evening'] });
const sandals = product('Sandals', { tags: ['summer', 'look:beach'] });
const heels = product('Heels', { tags: ['evening'] });
const dress = product('Slip Dress', { tags: ['evening'] });
const catalog = buildCatalog({ products: [linen, silk, shorts, chinos, trousers, sandals, heels, dress] });
const noRand = () => 0;

describe('affinity', () => {
  it('ranks merchant look tags above shared style tags above nothing', () => {
    expect(affinity(linen, shorts)).toBeGreaterThan(affinity(linen, chinos));
    expect(affinity(linen, chinos)).toBeGreaterThan(affinity(linen, trousers));
  });
  it('gives neutral colours a bonus', () => {
    expect(affinity(silk, product('Black Jeans'))).toBe(1);
  });
});

describe('suggestLooks', () => {
  it('keeps the anchor piece and picks matching pieces around it', () => {
    const outfit = selectProduct(emptyOutfit(), 'top', linen);
    const [best] = suggestLooks(catalog, outfit, 'top', { rand: noRand, avoidCurrent: false });
    expect(best.top.productId).toBe(linen.id);
    expect(best.bottom.productId).toBe(shorts.id);
    expect(best.shoes.productId).toBe(sandals.id);
  });

  it('suggests an evening look around an evening dress', () => {
    const outfit = selectProduct(emptyOutfit(), 'onepiece', dress);
    const [best] = suggestLooks(catalog, outfit, 'onepiece', { rand: noRand });
    expect(best.onepiece.productId).toBe(dress.id);
    expect(best.shoes.productId).toBe(heels.id);
    expect(best.top).toBe(null);
  });

  it('returns distinct looks', () => {
    const outfit = selectProduct(emptyOutfit(), 'top', linen);
    const looks = suggestLooks(catalog, outfit, 'top', { count: 3, rand: noRand });
    const keys = looks.map((l) => `${l.bottom.productId}.${l.shoes.productId}`);
    expect(new Set(keys).size).toBe(looks.length);
    expect(looks.length).toBe(3);
  });

  it('changes the other pieces rather than re-suggesting the current ones', () => {
    let outfit = selectProduct(emptyOutfit(), 'top', linen);
    outfit = selectProduct(outfit, 'bottom', shorts);
    outfit = selectProduct(outfit, 'shoes', sandals);
    const [best] = suggestLooks(catalog, outfit, 'top', { rand: noRand });
    expect(best.bottom.productId).not.toBe(shorts.id);
    expect(best.shoes.productId).not.toBe(sandals.id);
  });

  it('keeps the chosen size of the anchor', () => {
    const outfit = selectProduct(emptyOutfit(), 'top', linen, linen.variants[2].id);
    expect(suggestLooks(catalog, outfit, 'top', { rand: noRand })[0].top.variantId).toBe(linen.variants[2].id);
  });

  it('works with no anchor', () => {
    expect(suggestLooks(catalog, emptyOutfit(), null).length).toBeGreaterThan(0);
  });
});

describe('discoverLooks', () => {
  it('always fills the set when the catalog allows, mixing dresses and separates', () => {
    for (let seed = 1; seed < 30; seed++) {
      let x = seed;
      const rand = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      const looks = discoverLooks(catalog, { count: 4, rand });
      expect(looks).toHaveLength(4);
    }
  });
});
