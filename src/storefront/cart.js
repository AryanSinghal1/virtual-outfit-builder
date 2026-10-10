// Adds a whole outfit to the Shopify cart in one request (Ajax Cart API).
// Every line carries a hidden `_outfit` property: the discount function uses it
// to find complete outfits, and it gives merchants order-level attribution.

export const OUTFIT_PROPERTY = '_outfit';

export function cartItems(items, outfitId) {
  return items.map((i) => ({ id: i.variant.id, quantity: 1, properties: { [OUTFIT_PROPERTY]: outfitId } }));
}

export async function addToCart(url, items, outfitId, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ items: cartItems(items, outfitId) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Shopify returns 422 with a human-readable description (e.g. sold out).
    throw new Error(body.description || body.message || `Cart error (${res.status})`);
  }
  return body;
}
