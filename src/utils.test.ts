import { describe, expect, it } from 'vitest';

import { formatPreviewIdToTitleCase, getConstructedUrl } from './utils';

describe('utils', () => {
  it('constructs URLs without undefined or null parameters', () => {
    const url = getConstructedUrl('/api/plugins', {
      pageNum: 2,
      searchQuery: undefined,
      sortBy: null,
      sortDirection: 'DESC',
    });

    expect(url).toBe('/api/plugins?pageNum=2&sortDirection=DESC');
  });

  it('formats preview ids into title case labels', () => {
    expect(formatPreviewIdToTitleCase('dark_theme_variant')).toBe('Dark Theme Variant');
    expect(formatPreviewIdToTitleCase('single')).toBe('Single');
  });
});
