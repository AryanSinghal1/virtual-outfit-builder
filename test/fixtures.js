// Small catalog used by unit tests (prices in cents, like Liquid).
let nextId = 1;
export function product(title, { type = '', tags = [], sizes = ['S', 'M', 'L'], soldOut = [], price = 2000 } = {}) {
  const id = nextId++;
  const variants = sizes.map((size, i) => ({
    id: id * 100 + i,
    title: size,
    price,
    available: !soldOut.includes(size),
    image: null,
  }));
  return { id, title, type, tags, url: `/products/${id}`, image: `/img/${id}.png`, available: variants.some((v) => v.available), variants };
}
