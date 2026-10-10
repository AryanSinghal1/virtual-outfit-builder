import { describe, it, expect, vi } from 'vitest';
import { formatMoney } from '../src/storefront/money.js';
import { addToCart, cartItems } from '../src/storefront/cart.js';
import { createStore } from '../src/storefront/storage.js';

describe('formatMoney', () => {
  it.each([
    [123456, '${{amount}}', '$1,234.56'],
    [123456, '€{{amount_with_comma_separator}}', '€1.234,56'],
    [123456, '₹{{ amount_no_decimals }}', '₹1,235'],
    [5, '{{amount}} USD', '0.05 USD'],
  ])('%i with %s', (cents, fmt, out) => expect(formatMoney(cents, fmt)).toBe(out));
});

describe('cart', () => {
  const items = [{ variant: { id: 11 } }, { variant: { id: 22 } }];

  it('tags every line with the outfit id', () => {
    expect(cartItems(items, 'abc')).toEqual([
      { id: 11, quantity: 1, properties: { _outfit: 'abc' } },
      { id: 22, quantity: 1, properties: { _outfit: 'abc' } },
    ]);
  });

  it('sends one request and surfaces Shopify error descriptions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ description: 'The product is already sold out.' }) });
    await expect(addToCart('/cart/add.js', items, 'abc', fetchImpl)).rejects.toThrow('already sold out');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).items).toHaveLength(2);
  });
});

describe('saved outfits store', () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };

  it('saves newest first without duplicates', () => {
    const s = createStore('k', memory());
    s.save('a'); s.save('b'); s.save('a');
    expect(s.list().map((o) => o.code)).toEqual(['a', 'b']);
    s.remove('a');
    expect(s.list().map((o) => o.code)).toEqual(['b']);
  });

  it('reports unavailable storage instead of throwing', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
    const s = createStore('k', broken);
    expect(s.available).toBe(false);
    expect(s.list()).toEqual([]);
    expect(s.save('a')).toBe(false);
  });
});
