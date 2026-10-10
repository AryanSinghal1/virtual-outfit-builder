// Mock store catalog shaped like Liquid product objects (prices in cents).
// Images are generated SVG silhouettes so the harness works offline.

const SHAPES = {
  top: 'M70 40 L100 28 Q120 44 140 28 L170 40 L200 80 L172 96 L164 84 L164 200 L76 200 L76 84 L68 96 L40 80 Z',
  bottom: 'M72 30 L168 30 L176 210 L134 210 L120 92 L106 210 L64 210 Z',
  shoes: 'M30 150 Q34 110 70 112 L104 120 Q130 146 190 150 Q214 154 212 176 L212 186 L30 186 Z',
  onepiece: 'M92 22 L106 22 Q120 36 134 22 L148 22 L150 70 Q140 90 168 210 L72 210 Q100 90 90 70 Z',
};

export function svg(kind, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><path d="${SHAPES[kind]}" fill="#${color}" stroke="rgba(0,0,0,.25)" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

const APPAREL = ['XS', 'S', 'M', 'L', 'XL'];
const SHOE = ['38', '39', '40', '41', '42', '43'];

// [title, product_type, tags, kind for image, color, price $, sold-out sizes]
const ROWS = [
  ['Relaxed Linen Shirt', 'Shirts', ['summer', 'casual', 'look:weekend'], 'top', 'e9e2d0', 58, []],
  ['Heavyweight Tee', 'T-Shirts', ['basics', 'casual'], 'top', 'ffffff', 32, ['XS']],
  ['Striped Breton Top', '', ['nautical', 'casual'], 'top', '24365e', 48, []],
  ['Cropped Cardigan', 'Knitwear', ['smart'], 'top', 'b7c4a3', 74, ['S', 'M']],
  ['Oversized Hoodie', 'Sweatshirts', ['casual', 'street'], 'top', '7d8792', 69, []],
  ['Silk Cami', '', ['evening', 'tops'], 'top', 'c98f7a', 85, ['XS', 'S', 'M', 'L', 'XL']],
  ['Straight Leg Jeans', 'Jeans', ['casual', 'street'], 'bottom', '3a5a85', 89, ['XL']],
  ['Pleated Wide Trousers', 'Trousers', ['smart', 'evening'], 'bottom', '2b2b2b', 95, []],
  ['Linen Drawstring Shorts', '', ['summer', 'casual', 'look:weekend'], 'bottom', 'd8ccb4', 45, []],
  ['Satin Midi Skirt', 'Skirts', ['evening', 'look:night-out'], 'bottom', '8a6f9e', 78, ['XS']],
  ['Tailored Chinos', 'Pants', ['smart'], 'bottom', 'a8916b', 72, []],
  ['Leather Chelsea Boots', 'Boots', ['smart', 'street'], 'shoes', '4a3427', 160, ['38']],
  ['Canvas Low Sneakers', 'Sneakers', ['casual', 'street'], 'shoes', 'f2f2ee', 65, []],
  ['Strappy Sandals', 'Sandals', ['summer', 'look:weekend', 'look:night-out'], 'shoes', 'c7a17a', 55, []],
  ['Penny Loafers', '', ['shoes', 'smart'], 'shoes', '6b2e2e', 120, []],
  ['Wrap Midi Dress', 'Dresses', ['evening'], 'onepiece', '9e3b3b', 128, []],
  ['Utility Jumpsuit', 'Jumpsuits', ['casual'], 'onepiece', '5c6b4a', 115, ['XS']],
  ['Slip Dress', 'Dresses', ['evening', 'look:night-out'], 'onepiece', '1f1f1f', 98, []],
  ['Woven Leather Belt', 'Accessories', [], 'top', '000000', 40, []], // not part of outfits
];

export const products = ROWS.map(([title, type, tags, kind, color, dollars, soldOut], i) => {
  const id = 7000 + i;
  const sizes = kind === 'shoes' ? SHOE : type === 'Accessories' ? ['Default Title'] : APPAREL;
  const image = { src: `/img/${kind}/${color}.svg` };
  const variants = sizes.map((size, j) => ({
    id: id * 100 + j,
    title: size,
    price: dollars * 100,
    available: !soldOut.includes(size),
    featured_image: null,
  }));
  return {
    id,
    title,
    handle: title.toLowerCase().replace(/\W+/g, '-'),
    url: `/products/${title.toLowerCase().replace(/\W+/g, '-')}`,
    type,
    tags,
    kind: type === 'Accessories' ? 'accessory' : kind, // harness-only: used to build per-category collections
    featured_image: image,
    available: variants.some((v) => v.available),
    variants,
  };
});
