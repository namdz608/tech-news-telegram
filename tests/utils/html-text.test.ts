import { describe, expect, it } from 'vitest';
import { htmlFirstContentImageUrl, htmlToCompactText } from '../../src/utils/html-text';

describe('html-text', () => {
  it('strips tags to compact text', () => {
    expect(htmlToCompactText('<p>The pod enters CrashLoopBackOff.</p>')).toBe(
      'The pod enters CrashLoopBackOff.',
    );
  });

  it('returns the first public content image and skips gravatar', () => {
    const html = [
      '<img src="https://www.gravatar.com/avatar/abc">',
      '<p>diagram</p>',
      '<img src="https://i.sstatic.net/pod.png" alt="pod">',
    ].join('');

    expect(htmlFirstContentImageUrl(html, 'https://serverfault.com/q/1')).toBe(
      'https://i.sstatic.net/pod.png',
    );
  });
});
