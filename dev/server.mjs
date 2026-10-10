// Local harness: renders the real theme block through liquidjs with a mock
// catalog, and fakes the Shopify Ajax Cart API. The cart applies the real
// discount function so the whole flow (attribution -> discount) is exercised.
//
//   node dev/server.mjs            -> http://localhost:3456
//   ?mode=collections              -> one collection per category instead of auto-sorting
//   ?discount=15&min=3&after=stay  -> override block settings
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';
import { products, svg } from './catalog.mjs';
import { cartLinesDiscountsGenerateRun } from '../extensions/outfit-discount/src/cart_lines_discounts_generate_run.js';

const ext = fileURLToPath(new URL('../extensions/outfit-builder/', import.meta.url));
const PORT = Number(process.env.PORT) || 3456;
const FUNCTION_CONFIG = { percentage: Number(process.env.DISCOUNT ?? 10), minItems: Number(process.env.MIN_ITEMS ?? 2) };

const locale = JSON.parse(readFileSync(`${ext}locales/en.default.json`, 'utf8'));
const blockSource = readFileSync(`${ext}blocks/outfit-builder.liquid`, 'utf8');
const schema = JSON.parse(blockSource.match(/{% schema %}([\s\S]*){% endschema %}/)[1]);

const engine = new Liquid({ partials: `${ext}snippets`, extname: '.liquid', strictFilters: true });
engine.registerTag('schema', {
  parse(_token, remain) {
    for (let t; (t = remain.shift());) if (t.name === 'endschema') return;
  },
  render() {},
});
engine.registerFilter('t', (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), locale) ?? `translation missing: ${key}`);
engine.registerFilter('image_url', (img) => (img && img.src) || img);
engine.registerFilter('asset_url', (name) => `/assets/${name}`);

function settingsFor(query) {
  const settings = Object.fromEntries(schema.settings.filter((s) => s.id).map((s) => [s.id, s.default ?? null]));
  if (query.get('mode') === 'collections') {
    for (const slot of ['top', 'bottom', 'shoes', 'onepiece']) {
      settings[`${slot}_collection`] = { handle: slot, products: products.filter((p) => p.kind === slot) };
    }
  }
  if (query.has('discount')) settings.discount_percent = Number(query.get('discount'));
  else settings.discount_percent = FUNCTION_CONFIG.percentage;
  if (query.has('min')) settings.min_items = Number(query.get('min'));
  if (query.has('after')) settings.after_add = query.get('after');
  if (query.has('heading')) settings.heading = query.get('heading');
  return settings;
}

// ---- fake cart ---------------------------------------------------------------
let cart = [];
const variantIndex = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { product: p, variant: v }])));

function cartJson() {
  const lines = cart.map((l, i) => ({ ...l, key: `line-${i}` }));
  const result = cartLinesDiscountsGenerateRun({
    cart: { lines: lines.map((l) => ({ id: l.key, quantity: l.quantity, outfit: l.properties._outfit ? { value: l.properties._outfit } : null })) },
    discount: { discountClasses: ['PRODUCT'], metafield: { jsonValue: FUNCTION_CONFIG } },
  });
  const discounts = new Map();
  for (const op of result.operations) for (const c of op.productDiscountsAdd.candidates) for (const t of c.targets) {
    discounts.set(t.cartLine.id, { qty: t.cartLine.quantity, pct: c.value.percentage.value, message: c.message });
  }
  let total = 0;
  const items = lines.map((l) => {
    const d = discounts.get(l.key);
    const line_price = l.price * l.quantity;
    const discount = d ? Math.round((l.price * d.qty * d.pct) / 100) : 0;
    total += line_price - discount;
    return { ...l, line_price, discount, discount_message: d?.message ?? null };
  });
  return { item_count: items.reduce((n, i) => n + i.quantity, 0), items, total_price: total };
}

function addItems(items) {
  for (const item of items) {
    const found = variantIndex.get(Number(item.id));
    if (!found) return { status: 404, description: `Cannot find variant ${item.id}` };
    if (!found.variant.available) return { status: 422, description: `${found.product.title} - ${found.variant.title} is already sold out.` };
  }
  for (const item of items) {
    const { product, variant } = variantIndex.get(Number(item.id));
    const properties = item.properties || {};
    const same = cart.find((l) => l.variant_id === variant.id && JSON.stringify(l.properties) === JSON.stringify(properties));
    if (same) same.quantity += item.quantity || 1;
    else cart.push({ variant_id: variant.id, product_title: product.title, variant_title: variant.title, price: variant.price, quantity: item.quantity || 1, properties });
  }
  return null;
}

// ---- pages ---------------------------------------------------------------------
const money = (c) => `$${(c / 100).toFixed(2)}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1c1c1c;background:#fff}
  header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #eee;margin-bottom:24px}
  header a{color:inherit;text-decoration:none;font-weight:600}
  main{padding-bottom:48px}
  table{border-collapse:collapse;width:100%;max-width:760px;margin:0 auto}td,th{padding:8px;border-bottom:1px solid #eee;text-align:left;font-size:14px}
</style>
<link rel="stylesheet" href="/assets/outfit-builder.css"></head>
<body><header><a href="/">Demo Store</a><a href="/cart" id="cart-link">Cart (<span id="cart-count">${cartJson().item_count}</span>)</a></header><main>${body}</main>
<script src="/assets/outfit-builder.js" defer></script>
<script>document.addEventListener('outfit-builder:added',()=>fetch('/cart.js').then(r=>r.json()).then(c=>{document.getElementById('cart-count').textContent=c.item_count}))</script>
</body></html>`;

async function renderBuilder(query) {
  const html = await engine.parseAndRender(blockSource, {
    block: { id: 'dev', settings: settingsFor(query), shopify_attributes: '' },
    shop: { permanent_domain: 'demo-store.myshopify.com', money_format: '${{amount}}' },
    routes: { root_url: '/', cart_add_url: '/cart/add', cart_url: '/cart' },
    collections: { all: { handle: 'all', products } },
  });
  return page('Outfit builder - dev', `<section>${html}</section>`);
}

function renderCart() {
  const c = cartJson();
  const rows = c.items.map((i) => `<tr><td>${i.product_title}</td><td>${i.variant_title}</td><td>${i.quantity}</td>
    <td>${i.properties._outfit ? `outfit <code>${i.properties._outfit}</code>` : ''}</td><td>${money(i.line_price)}</td>
    <td class="discount">${i.discount ? `−${money(i.discount)} <small>${i.discount_message}</small>` : ''}</td></tr>`).join('');
  return page('Cart - dev', `<table><thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Attribution</th><th>Price</th><th>Discount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">Cart is empty</td></tr>'}</tbody>
    <tfoot><tr><th colspan="5">Total</th><th id="cart-total">${money(c.total_price)}</th></tr></tfoot></table>
    <p style="text-align:center"><a href="/">Back to builder</a> · <a href="/cart/clear">Clear cart</a></p>`);
}

const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => resolve(b)); });
const send = (res, status, type, body) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/') return send(res, 200, 'text/html', await renderBuilder(url.searchParams));
    if (url.pathname.startsWith('/assets/')) {
      const name = url.pathname.slice(8).replace(/[^\w.-]/g, '');
      const type = name.endsWith('.css') ? 'text/css' : 'text/javascript';
      return send(res, 200, type, readFileSync(`${ext}assets/${name}`));
    }
    const img = url.pathname.match(/^\/img\/(\w+)\/(\w{6})\.svg$/);
    if (img) return send(res, 200, 'image/svg+xml', svg(img[1], img[2]));
    if (url.pathname === '/cart/add.js' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const err = addItems(body.items || [body]);
      if (err) return send(res, err.status, 'application/json', JSON.stringify({ status: err.status, message: 'Cart Error', description: err.description }));
      return send(res, 200, 'application/json', JSON.stringify(cartJson()));
    }
    if (url.pathname === '/cart.js') return send(res, 200, 'application/json', JSON.stringify(cartJson()));
    if (url.pathname === '/cart') return send(res, 200, 'text/html', renderCart());
    if (url.pathname === '/cart/clear') { cart = []; res.writeHead(302, { Location: '/cart' }); return res.end(); }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/checkout') return send(res, 200, 'text/html', page('Checkout', '<p style="text-align:center">Checkout (stub)</p>'));
    send(res, 404, 'text/plain', 'Not found');
  } catch (err) {
    console.error(err);
    send(res, 500, 'text/plain', String(err.stack || err));
  }
});

server.listen(PORT, () => console.log(`Outfit builder dev harness: http://localhost:${PORT}`));
