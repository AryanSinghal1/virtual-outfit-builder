import { describe, it, expect } from 'vitest';
import { categorize } from '../src/storefront/categorize.js';

const c = (title, type = '', tags = []) => categorize({ title, type, tags });

describe('categorize', () => {
  it.each([
    ['Linen Shirt', 'top'],
    ['Classic T-Shirt', 'top'],
    ['Ribbed Tank Top', 'top'],
    ['Wool Blazer', 'top'],
    ['Slim Jeans', 'bottom'],
    ['Boot-cut Jeans', 'bottom'],
    ['Pleated Midi Skirt', 'bottom'],
    ['Running Shorts', 'bottom'],
    ['Chunky Sneakers', 'shoes'],
    ['Chelsea Boots', 'shoes'],
    ['Shirt Dress', 'onepiece'],
    ['Utility Jumpsuit', 'onepiece'],
    ['Leather Belt', null],
  ])('%s -> %s', (title, slot) => expect(c(title)).toBe(slot));

  it('does not treat "short sleeve" as shorts', () => expect(c('Short Sleeve Shirt')).toBe('top'));
  it('prefers product type over title', () => expect(c('The Weekend', 'Sneakers')).toBe('shoes'));
  it('uses tags when type and title say nothing', () => expect(c('The Weekend', '', ['summer', 'trousers'])).toBe('bottom'));
  it('honours explicit outfit tags over everything', () => {
    expect(c('Shirt Dress', 'Dresses', ['outfit:top'])).toBe('top');
    expect(c('Linen Shirt', '', ['Outfit:Exclude'])).toBe(null);
  });
});
