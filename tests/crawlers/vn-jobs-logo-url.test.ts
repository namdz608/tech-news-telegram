import { describe, expect, it } from 'vitest';
import { normalizeLogoUrl, preferPdfCompatibleLogoUrl } from '../../src/crawlers/vn-jobs/logo-url';

describe('normalizeLogoUrl', () => {
  it('resolves relative and protocol-relative urls', () => {
    expect(normalizeLogoUrl('/img/logo.png', 'https://www.topcv.vn')).toBe('https://www.topcv.vn/img/logo.png');
    expect(normalizeLogoUrl('//cdn.example.com/a.jpg', 'https://itviec.com')).toBe('https://cdn.example.com/a.jpg');
    expect(normalizeLogoUrl('https://cdn.example.com/a.png', 'https://itviec.com')).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('rejects empty and data urls', () => {
    expect(normalizeLogoUrl(undefined, 'https://www.topcv.vn')).toBeUndefined();
    expect(normalizeLogoUrl('data:image/png;base64,abc', 'https://www.topcv.vn')).toBeUndefined();
  });

  it('unwraps TopCV CDN webp proxy to static jpeg/png source', () => {
    const cdn =
      'https://cdn-new.topcv.vn/unsafe/150x/https://static.topcv.vn/company_logos/cmc-5af4f4a61b6e4_rs.jpg';
    expect(normalizeLogoUrl(cdn, 'https://www.topcv.vn')).toBe(
      'https://static.topcv.vn/company_logos/cmc-5af4f4a61b6e4_rs.jpg',
    );
  });
});

describe('preferPdfCompatibleLogoUrl', () => {
  it('keeps non-topcv urls unchanged', () => {
    expect(preferPdfCompatibleLogoUrl('https://images.vietnamworks.com/a.jpg')).toBe(
      'https://images.vietnamworks.com/a.jpg',
    );
  });
});
