import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GOLD_POLITICS_ENV_LINES = [
  'GOLD_POLITICS_TELEGRAM_BOT_TOKEN=replace_me',
  'GOLD_POLITICS_TELEGRAM_CHAT_ID=replace_me',
  'GOLD_POLITICS_MAX_ARTICLES=15',
  'GOLD_POLITICS_MAX_GOLD_NEWS=3',
  'GOLD_POLITICS_MAX_AGE_HOURS=72',
  'GOLD_POLITICS_MAX_PRICE_AGE_MINUTES=60',
  'GOLD_POLITICS_HISTORY_RETENTION_DAYS=7',
  'GOLD_POLITICS_HISTORY_PATH=data/gold-politics-sent-history.json',
  'GOLD_PRICE_HISTORY_PATH=data/gold-price-history.json',
  'GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES=8',
  'BRAVE_SEARCH_API_KEY=',
  'GOLD_SPOT_API_URL=https://api.gold-api.com/price/XAU',
] as const;

describe('gold-politics runtime configuration', () => {
  it('documents all twelve gold-politics env variables with placeholders and data/ history paths', () => {
    const envExample = readFileSync('.env.example', 'utf8');

    for (const line of GOLD_POLITICS_ENV_LINES) {
      expect(envExample).toContain(line);
    }

    expect(envExample).toMatch(/^BRAVE_SEARCH_API_KEY=$/m);
    expect(envExample).toContain('TELEGRAM_BOT_TOKEN=replace_me');
    expect(envExample).toContain('GADGET_TELEGRAM_BOT_TOKEN=replace_me');
    expect(envExample).toContain('HEALTH_TELEGRAM_BOT_TOKEN=replace_me');
    expect(envExample).toContain('GOLD_POLITICS_TELEGRAM_BOT_TOKEN=replace_me');
    expect(envExample).toContain('TELEGRAM_CHAT_ID=replace_me');
    expect(envExample).toContain('GADGET_TELEGRAM_CHAT_ID=replace_me');
    expect(envExample).toContain('HEALTH_TELEGRAM_CHAT_ID=replace_me');
    expect(envExample).toContain('GOLD_POLITICS_TELEGRAM_CHAT_ID=replace_me');
    expect(envExample).toMatch(/^GOLD_POLITICS_HISTORY_PATH=data\//m);
    expect(envExample).toMatch(/^GOLD_PRICE_HISTORY_PATH=data\//m);
  });

  it('documents the gold-politics endpoint, caps, units, responses, safety, and persistence', () => {
    const readme = readFileSync('README.md', 'utf8');

    expect(readme).toContain('POST /telegram/send-gold-politics');
    expect(readme).toContain('curl -X POST http://localhost:3000/telegram/send-gold-politics');
    expect(readme).toMatch(/one price snapshot|một snapshot giá|một bản snapshot giá/iu);
    expect(readme).toMatch(/at most 15 news|tối đa 15/iu);
    expect(readme).toMatch(/maximum three gold-news|tối đa 3 tin vàng|tối đa ba tin vàng/iu);
    expect(readme).toMatch(/72-hour|72 giờ/iu);
    expect(readme).toMatch(/seven-day|7 ngày/iu);
    expect(readme).toMatch(/API-only|chỉ chạy khi được gọi|không có scheduler|không tự chạy lịch/iu);

    expect(readme).toContain('SJC');
    expect(readme).toContain('DOJI');
    expect(readme).toContain('PNJ');
    expect(readme).toContain('XAU');
    expect(readme).toContain('million VND/tael');
    expect(readme).toContain('USD/troy ounce');
    expect(readme).toMatch(/stale/i);
    expect(readme).toMatch(/unavailable/i);
    expect(readme).toContain('partial');
    expect(readme).toContain('409');
    expect(readme).toContain('503');
    expect(readme).toMatch(/409 is not rate limiting|409 không phải rate limiting/iu);

    expect(readme).toMatch(/suppresses deltas|không hiện delta|không hiển thị delta/iu);
    expect(readme).toMatch(/fails closed|fail-closed|fail closed/iu);
    expect(readme).toContain('${GOLD_POLITICS_HISTORY_PATH}.blocked');
    expect(readme).toMatch(/at-least-once|at least once/iu);

    expect(readme).toContain('ĐÃ XÁC NHẬN');
    expect(readme).toContain('ĐANG ĐƯỢC ĐƯA TIN');
    expect(readme).toContain('CHƯA KIỂM CHỨNG');
    expect(readme).toMatch(/rumors are not facts|tin đồn không phải sự thật/iu);
    expect(readme).toMatch(/V1/);
    expect(readme).toMatch(/reported\/unverified|reported\/unverified news/i);
    expect(readme).toMatch(/confirmed badge|huy hiệu confirmed/iu);
    expect(readme).toMatch(/final-record adapter/i);

    expect(readme).toContain('Facebook');
    expect(readme).toContain('TikTok');
    expect(readme).toMatch(/web-search discoveries|web-search discovery/i);
    expect(readme).toMatch(/login/i);
    expect(readme).toContain('CAPTCHA');
    expect(readme).toMatch(/not investment advice|không phải lời khuyên đầu tư/iu);

    expect(readme).toMatch(/no application-level authentication|không có application-level authentication/iu);
    expect(readme).toMatch(/rate limiter/i);
    expect(readme).toMatch(/private network/i);
    expect(readme).toMatch(/reverse proxy/i);
    expect(readme).toMatch(/placeholder/i);
    expect(readme).toMatch(/before crawling/i);

    expect(readme).toMatch(/X and Brave are optional|X và Brave.*optional|optional when their keys are empty/iu);
    expect(readme).toMatch(/RSS/);
    expect(readme).toMatch(/Reddit/);
    expect(readme).toContain('.corrupt-');
    expect(readme).toMatch(/sentinel/i);
    expect(readme).toMatch(/ownership\/permissions|ownership and permissions/iu);

    expect(readme).not.toMatch(/CronJob/);
  });

  it('keeps writable /app/data in Docker and ignores .env plus data/ locally', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(dockerfile).toContain('mkdir -p /app/data');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^data\/$/m);
  });
});
