# Virtual Outfit Builder (Shopify app)

Shoppers mix a top, bottom and shoes (or a dress + shoes) from your catalog, pick sizes, and add the
whole outfit to cart in one click. Complete outfits get an automatic bundle discount at checkout.

This is an **extension-only Shopify app** with two extensions:

| Extension | What it does |
| --- | --- |
| `extensions/outfit-builder` (theme app extension) | The storefront block. Merchants add it to any Online Store 2.0 page from the theme editor. |
| `extensions/outfit-discount` (Shopify Function) | Automatic product discount for complete outfits. |

## How it works

- **Products.** Pick one collection per category in the block settings, or leave them empty and the
  block sorts a catalog collection (defaults to all products) by product type, then tags, then title.
  Tags `outfit:top|bottom|shoes|onepiece|exclude` override the automatic sorting. Products are
  rendered into the page by Liquid, so there are no extra API calls (max 50 per collection).
- **Full-screen, no prices.** The builder fills the screen below the store header and shows only the
  clothes: no prices, totals or cart summary, so shoppers think in looks, not line items. Prices
  appear in the normal Shopify cart.
- **Swipe to style.** Shoppers land on a complete look and swipe each row (tops, bottoms, shoes) like
  product photos: one item per swipe, whatever is centred is in the look. Arrows, keyboard and
  tapping the peeking item work too. A "Top & bottom / Dress" switch swaps in a dress row.
- **Style me ✨ / Looks for you.** Suggests 4 looks around the piece the shopper last chose
  (`src/storefront/suggest.js`). Pieces sharing a `look:<name>` tag are merchant-curated looks and
  win; shared style tags (`casual`, `evening`, `summer`, …) count next; neutral colours get a small
  bonus. "More ideas" builds looks around different pieces.
- **Get this look.** Opens a bottom sheet to pick sizes and add the whole look to the bag.
- **Sizes.** Never guessed. A variant is preselected only if it's the only one, or the only one in
  stock. Sold-out sizes are disabled.
- **Dresses / jumpsuits** fill the top and bottom slots together.
- **Add to cart.** One `/cart/add.js` request. Every line gets a hidden `_outfit` property with a
  shared id. That id drives the discount and gives order-level attribution for analytics later.
- **Discount.** The function discounts lines that share an `_outfit` id once at least `minItems` of
  them are still in the cart, and caps the discounted quantity at the number of complete outfits.
- **Save & share.** Saved outfits live in the browser (localStorage). Share links
  (`?outfit=…`) restore the exact outfit and sizes, using the native share sheet when available.
- **Events.** Fires `outfit-builder:added` on the block (themes can refresh their cart drawer) and
  publishes `outfit_builder:add_to_cart` to Shopify customer events for web pixels.

## Develop

```bash
npm install
npm run dev     # builds, then serves the real Liquid block with a mock catalog: http://localhost:3456
npm test        # unit tests (categorization, outfit logic, cart, storage, discount function)
npm run e2e     # drives the harness in Chrome: desktop + mobile flows, screenshots in test/screenshots/
```

Harness URL options: `?mode=collections`, `?discount=15&min=3`, `?after=stay|checkout`, `?heading=…`.
Its `/cart` page applies the real discount function to the cart.

Storefront source lives in `src/storefront/`. `npm run build` bundles it into
`extensions/outfit-builder/assets/outfit-builder.js`. Commit the built file: Shopify serves it as is.

## Deploy to a store

1. Install the Shopify CLI and run `shopify app config link` to create/attach an app (replaces `client_id`).
2. `npm run build && shopify app dev`, then install the app on your dev store.
3. In the GraphiQL explorer the CLI opens, run `scripts/create-discount.graphql` once to create the
   automatic "Outfit bundle" discount.
4. Theme editor → add the **Outfit builder** block to a page. Set the discount % to match step 3.
5. `npm run deploy` when ready.

## Not built yet (from the PRD)

- Embedded admin app: setup wizard, discount settings UI, billing plans, analytics dashboard.
- Cross-device saved outfits for logged-in customers (needs an app proxy + customer metafields).
- Smarter recommendations (purchase history, colour detection from images, AI styling).
- GDPR compliance webhooks and other App Store submission items.
