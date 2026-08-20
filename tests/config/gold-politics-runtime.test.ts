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

function exactLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function assignmentLines(lines: string[], key: string): string[] {
  return lines.filter((line) => line.startsWith(`${key}=`));
}

function goldPoliticsReadmeSection(readme: string): string {
  const heading = '### Bản tin giá vàng và chính trị';
  const start = readme.indexOf(heading);
  if (start < 0) {
    throw new Error('gold-politics README section missing');
  }

  const fromHeading = readme.slice(start);
  const endCandidates = [
    fromHeading.indexOf('\nGửi tin tuyển dụng'),
    fromHeading.search(/\n## /),
  ].filter((index) => index >= 0);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : fromHeading.length;
  return fromHeading.slice(0, end);
}

describe('gold-politics runtime configuration', () => {
  it('documents all twelve gold-politics env variables as exact placeholder lines under data/', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const lines = exactLines(envExample);

    for (const exact of GOLD_POLITICS_ENV_LINES) {
      const key = exact.slice(0, exact.indexOf('='));
      expect(assignmentLines(lines, key)).toEqual([exact]);
    }

    expect(lines).toContain('TELEGRAM_BOT_TOKEN=replace_me');
    expect(lines).toContain('GADGET_TELEGRAM_BOT_TOKEN=replace_me');
    expect(lines).toContain('HEALTH_TELEGRAM_BOT_TOKEN=replace_me');
    expect(lines).toContain('TELEGRAM_CHAT_ID=replace_me');
    expect(lines).toContain('GADGET_TELEGRAM_CHAT_ID=replace_me');
    expect(lines).toContain('HEALTH_TELEGRAM_CHAT_ID=replace_me');
    expect(lines).toContain('GOLD_POLITICS_HISTORY_PATH=data/gold-politics-sent-history.json');
    expect(lines).toContain('GOLD_PRICE_HISTORY_PATH=data/gold-price-history.json');
  });

  it('documents the gold-politics endpoint, caps, units, responses, safety, and persistence', () => {
    const readme = readFileSync('README.md', 'utf8');
    const goldSection = goldPoliticsReadmeSection(readme);

    expect(goldSection).toContain('POST /telegram/send-gold-politics');
    expect(goldSection).toContain('curl -X POST http://localhost:3000/telegram/send-gold-politics');
    expect(goldSection).toMatch(/one price snapshot|một snapshot giá|một bản snapshot giá/iu);
    expect(goldSection).toMatch(/at most 15 news|tối đa 15/iu);
    expect(goldSection).toMatch(/maximum three gold-news|tối đa 3 tin vàng|tối đa ba tin vàng/iu);
    expect(goldSection).toMatch(/72-hour|72 giờ/iu);
    expect(goldSection).toMatch(/seven-day|7 ngày/iu);
    expect(goldSection).toMatch(/API-only|chỉ chạy khi được gọi|không có scheduler|không tự chạy lịch/iu);

    expect(goldSection).toContain('SJC');
    expect(goldSection).toContain('DOJI');
    expect(goldSection).toContain('PNJ');
    expect(goldSection).toContain('XAU');
    expect(goldSection).toContain('million VND/tael');
    expect(goldSection).toContain('USD/troy ounce');
    expect(goldSection).toMatch(/stale/i);
    expect(goldSection).toMatch(/unavailable/i);
    expect(goldSection).toContain('partial');
    expect(goldSection).toMatch(/HTTP \*\*409\*\*|HTTP 409/);
    expect(goldSection).toContain('Gold-politics digest is already running');
    expect(goldSection).toMatch(/409 is not rate limiting/iu);
    expect(goldSection).not.toMatch(/luồng sức khỏe đang chạy/iu);
    expect(goldSection).not.toContain('Health digest is already running');
    expect(goldSection).toMatch(/HTTP \*\*503\*\*|HTTP 503/);
    expect(goldSection).toContain('All gold-politics sources failed');
    expect(goldSection).not.toContain('All health sources failed');

    expect(goldSection).toMatch(/suppresses deltas|không hiện delta|không hiển thị delta/iu);
    expect(goldSection).toMatch(/fails closed|fail-closed|fail closed/iu);
    expect(goldSection).toContain('${GOLD_POLITICS_HISTORY_PATH}.blocked');
    expect(goldSection).toMatch(/at-least-once|at least once/iu);

    expect(goldSection).toContain('ĐÃ XÁC NHẬN');
    expect(goldSection).toContain('ĐANG ĐƯỢC ĐƯA TIN');
    expect(goldSection).toContain('CHƯA KIỂM CHỨNG');
    expect(goldSection).toMatch(/source attribution/i);
    expect(goldSection).toMatch(/rumors are not facts|tin đồn không phải sự thật/iu);
    expect(goldSection).toMatch(/V1/);
    expect(goldSection).toMatch(/reported\/unverified|reported\/unverified news/i);
    expect(goldSection).toMatch(/confirmed badge|huy hiệu confirmed/iu);
    expect(goldSection).toMatch(/final-record adapter/i);

    expect(goldSection).toMatch(
      /Facebook\/TikTok\/Telegram[\s\S]{0,120}web-search discoveries/i,
    );
    expect(goldSection).toMatch(/login/i);
    expect(goldSection).toContain('CAPTCHA');
    expect(goldSection).toMatch(/access is not attempted/i);
    expect(goldSection).toMatch(/not investment advice|không phải lời khuyên đầu tư/iu);

    expect(goldSection).toMatch(/no application-level authentication|không có application-level authentication/iu);
    expect(goldSection).toMatch(/rate limiter/i);
    expect(goldSection).toMatch(/private network/i);
    expect(goldSection).toMatch(/reverse proxy/i);
    expect(goldSection).toMatch(/placeholder/i);
    expect(goldSection).toMatch(/fail before crawling/i);
    expect(goldSection).toMatch(/provider\/editorial/i);
    expect(goldSection).toMatch(/history mutation/i);

    expect(goldSection).toMatch(/X and Brave are optional|X và Brave.*optional|optional when their keys are empty/iu);
    expect(goldSection).toMatch(/RSS/);
    expect(goldSection).toMatch(/Reddit/);
    expect(goldSection).toContain('.corrupt-');
    expect(goldSection).toMatch(/sentinel/i);
    expect(goldSection).toMatch(/ownership\/permissions|ownership and permissions/iu);

    expect(readme).not.toMatch(/CronJob/);
    expect(goldSection).not.toMatch(/CronJob/);
  });

  it('keeps writable /app/data in Docker and ignores .env plus data/ locally', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(dockerfile).toContain('mkdir -p /app/data');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^data\/$/m);
  });
});
