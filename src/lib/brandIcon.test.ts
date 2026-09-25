import { describe, expect, it } from 'vitest';
import { BRAND_LEAF_LEFT, BRAND_LEAF_RIGHT, BRAND_STEM, brandIconDataUrl, brandIconSvg } from './brandIcon';

describe('Think-Class leaf mark', () => {
  it('uses the same geometry in the favicon and app', () => {
    const svg = brandIconSvg();
    expect(svg).toContain(BRAND_LEAF_LEFT);
    expect(svg).toContain(BRAND_LEAF_RIGHT);
    expect(svg).toContain(BRAND_STEM);
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(decodeURIComponent(brandIconDataUrl().slice('data:image/svg+xml,'.length))).toBe(svg);
  });
});
