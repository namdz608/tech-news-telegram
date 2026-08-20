import { describe, expect, it } from 'vitest';
import { registrablePublisherKey } from '../../src/utils/publisher-key';

describe('registrablePublisherKey', () => {
  it('parses the URL first and returns the Public Suffix List registrable domain', () => {
    expect(registrablePublisherKey('https://www.evil.com/path?q=1#hash')).toBe('evil.com');
    expect(registrablePublisherKey('https://WWW.Evil.COM/path')).toBe('evil.com');
  });

  it('collapses sibling subdomains onto one publisher identity', () => {
    expect(registrablePublisherKey('https://www.evil.com/a')).toBe('evil.com');
    expect(registrablePublisherKey('https://news.evil.com/b')).toBe('evil.com');
    expect(registrablePublisherKey('https://m.evil.com/c')).toBe('evil.com');
    expect(
      new Set([
        registrablePublisherKey('https://www.publisher.example/one'),
        registrablePublisherKey('https://news.publisher.example/two'),
        registrablePublisherKey('https://m.publisher.example/three'),
      ]),
    ).toEqual(new Set(['publisher.example']));
  });

  it('preserves bbc.co.uk instead of taking the last two labels', () => {
    expect(registrablePublisherKey('https://www.bbc.co.uk/news/world-123')).toBe('bbc.co.uk');
    expect(registrablePublisherKey('https://www.bbc.co.uk/news/world-123')).not.toBe('co.uk');
  });

  it('falls back to the normalized hostname for public IP literals', () => {
    expect(registrablePublisherKey('http://8.8.8.8/path')).toBe('8.8.8.8');
    expect(registrablePublisherKey('https://1.1.1.1')).toBe('1.1.1.1');
  });

  it('falls back to the exact normalized hostname when no registrable domain exists', () => {
    expect(registrablePublisherKey('https://localhost/status')).toBe('localhost');
  });

  it('rejects malformed URLs', () => {
    expect(registrablePublisherKey('')).toBeUndefined();
    expect(registrablePublisherKey('not a url')).toBeUndefined();
    expect(registrablePublisherKey('http://')).toBeUndefined();
    expect(registrablePublisherKey('javascript:alert(1)')).toBeUndefined();
  });

  it('rejects credentialed URLs instead of parsing the host out of them', () => {
    expect(registrablePublisherKey('https://user:pass@example.com/secret')).toBeUndefined();
    expect(registrablePublisherKey('http://token@evil.com/')).toBeUndefined();
  });
});
