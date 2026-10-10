// Assigns a product to an outfit slot using the data merchants already have.
// Priority: explicit `outfit:<slot>` tag > product type > tags > title.
// Within each source, slots are checked in this order so that e.g.
// "Shirt Dress" is a one-piece and "Boot-cut Jeans" is a bottom.

export const SLOTS = ['onepiece', 'bottom', 'shoes', 'top'];

const KEYWORDS = {
  onepiece: ['dress', 'dresses', 'jumpsuit', 'jumpsuits', 'romper', 'rompers', 'playsuit', 'playsuits', 'overalls', 'dungarees', 'co-ord', 'coord'],
  bottom: ['bottoms', 'pant', 'pants', 'trouser', 'trousers', 'jean', 'jeans', 'shorts', 'skirt', 'skirts', 'skort', 'legging', 'leggings', 'jogger', 'joggers', 'chino', 'chinos', 'sweatpants', 'culottes', 'cargos'],
  shoes: ['shoe', 'shoes', 'footwear', 'sneaker', 'sneakers', 'trainer', 'trainers', 'boot', 'boots', 'sandal', 'sandals', 'heel', 'heels', 'loafer', 'loafers', 'flats', 'slipper', 'slippers', 'mule', 'mules', 'pumps', 'oxfords', 'espadrilles', 'clogs', 'slides'],
  top: ['top', 'tops', 'tee', 'tees', 't-shirt', 't-shirts', 'tshirt', 'shirt', 'shirts', 'blouse', 'blouses', 'sweater', 'sweaters', 'hoodie', 'hoodies', 'sweatshirt', 'sweatshirts', 'cardigan', 'cardigans', 'tank', 'cami', 'polo', 'polos', 'jumper', 'pullover', 'knitwear', 'bodysuit', 'jacket', 'jackets', 'blazer', 'blazers', 'coat', 'coats', 'outerwear', 'vest'],
};

const LOOKUP = new Map();
for (const slot of SLOTS) for (const word of KEYWORDS[slot]) LOOKUP.set(word, slot);

function tokens(text) {
  // Keep hyphenated words whole ("t-shirt") and also split them ("boot-cut" -> boot, cut).
  const out = [];
  for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9-]+/)) {
    if (!raw) continue;
    out.push(raw);
    if (raw.includes('-')) out.push(...raw.split('-').filter(Boolean));
  }
  return out;
}

function match(text) {
  const found = new Set();
  for (const t of tokens(text)) if (LOOKUP.has(t)) found.add(LOOKUP.get(t));
  return SLOTS.find((slot) => found.has(slot)) || null;
}

/** @returns {'top'|'bottom'|'shoes'|'onepiece'|null} null = not part of outfits */
export function categorize(product) {
  const tags = (product.tags || []).map((t) => String(t).toLowerCase().trim());

  if (tags.includes('outfit:exclude')) return null;
  for (const slot of SLOTS) if (tags.includes(`outfit:${slot}`)) return slot;

  return match(product.type) || match(tags.join(' ')) || match(product.title);
}
