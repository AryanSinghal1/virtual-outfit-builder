// Formats cents using the shop's Liquid `shop.money_format` (e.g. "${{amount}}").

function withDelimiters(cents, decimals, thousands, decimal) {
  const fixed = (cents / 100).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  return frac ? grouped + decimal + frac : grouped;
}

export function formatMoney(cents, format = '${{amount}}') {
  const value = Math.round(Number(cents) || 0);
  return String(format).replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
    switch (key) {
      case 'amount_no_decimals':
        return withDelimiters(value, 0, ',', '.');
      case 'amount_with_comma_separator':
        return withDelimiters(value, 2, '.', ',');
      case 'amount_no_decimals_with_comma_separator':
        return withDelimiters(value, 0, '.', ',');
      case 'amount_with_apostrophe_separator':
        return withDelimiters(value, 2, "'", '.');
      default:
        return withDelimiters(value, 2, ',', '.');
    }
  });
}
