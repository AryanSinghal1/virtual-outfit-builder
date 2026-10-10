import { describe, it, expect } from 'vitest';
import { cartLinesDiscountsGenerateRun as run } from '../extensions/outfit-discount/src/cart_lines_discounts_generate_run.js';

const line = (id, outfit, quantity = 1) => ({ id: `gid://shopify/CartLine/${id}`, quantity, outfit: outfit ? { value: outfit } : null });
const input = (lines, config, classes = ['PRODUCT']) => ({
  cart: { lines },
  discount: { discountClasses: classes, metafield: config ? { jsonValue: config } : null },
});

describe('outfit discount function', () => {
  it('discounts every line of a complete outfit', () => {
    const out = run(input([line(1, 'o1'), line(2, 'o1'), line(3, null)], { percentage: 15, minItems: 2 }));
    const [candidate] = out.operations[0].productDiscountsAdd.candidates;
    expect(candidate.value).toEqual({ percentage: { value: 15 } });
    expect(candidate.targets.map((t) => t.cartLine.id)).toEqual(['gid://shopify/CartLine/1', 'gid://shopify/CartLine/2']);
  });

  it('drops the discount when an item is removed in the cart', () => {
    expect(run(input([line(1, 'o1'), line(3, null)])).operations).toEqual([]);
  });

  it('caps the discounted quantity at the number of complete outfits', () => {
    const out = run(input([line(1, 'o1', 5), line(2, 'o1', 1)]));
    expect(out.operations[0].productDiscountsAdd.candidates[0].targets.map((t) => t.cartLine.quantity)).toEqual([1, 1]);
  });

  it('handles multiple outfits independently', () => {
    const out = run(input([line(1, 'a'), line(2, 'a'), line(3, 'b'), line(4, 'c'), line(5, 'c'), line(6, 'c')], { minItems: 3 }));
    expect(out.operations[0].productDiscountsAdd.candidates).toHaveLength(1);
  });

  it('falls back to safe defaults for missing or invalid config', () => {
    const out = run(input([line(1, 'o'), line(2, 'o')], { percentage: 500, minItems: 1 }));
    expect(out.operations[0].productDiscountsAdd.candidates[0].value.percentage.value).toBe(10);
  });

  it('does nothing when the discount is not a product discount', () => {
    expect(run(input([line(1, 'o'), line(2, 'o')], null, ['ORDER'])).operations).toEqual([]);
  });
});
