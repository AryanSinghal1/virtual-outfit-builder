// Discounts complete outfits. The storefront tags every line of an outfit with
// the same `_outfit` line property; an outfit qualifies when at least
// `minItems` distinct lines still share that id (so removing items in the cart
// removes the discount). Quantity is capped at the number of complete outfits,
// so bumping one item to qty 5 doesn't discount 5 of it.

const DEFAULTS = { percentage: 10, minItems: 2 };

export function readConfig(discount) {
  const raw = (discount && discount.metafield && discount.metafield.jsonValue) || {};
  const percentage = Number(raw.percentage);
  const minItems = Number(raw.minItems);
  return {
    percentage: Number.isFinite(percentage) && percentage > 0 && percentage <= 100 ? percentage : DEFAULTS.percentage,
    minItems: Number.isInteger(minItems) && minItems >= 2 ? minItems : DEFAULTS.minItems,
  };
}

export function cartLinesDiscountsGenerateRun(input) {
  const empty = { operations: [] };
  if (!input.discount.discountClasses.includes('PRODUCT')) return empty;

  const { percentage, minItems } = readConfig(input.discount);
  const outfits = new Map();
  for (const line of input.cart.lines) {
    const id = line.outfit && line.outfit.value;
    if (!id) continue;
    if (!outfits.has(id)) outfits.set(id, []);
    outfits.get(id).push(line);
  }

  const candidates = [];
  for (const lines of outfits.values()) {
    if (lines.length < minItems) continue;
    const sets = Math.min(...lines.map((l) => l.quantity));
    candidates.push({
      message: `Outfit bundle ${percentage}% off`,
      targets: lines.map((l) => ({ cartLine: { id: l.id, quantity: sets } })),
      value: { percentage: { value: percentage } },
    });
  }
  if (!candidates.length) return empty;

  return { operations: [{ productDiscountsAdd: { candidates, selectionStrategy: 'ALL' } }] };
}
