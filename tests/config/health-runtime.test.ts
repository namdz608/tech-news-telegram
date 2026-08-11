import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('documents health env, endpoint, no scheduler, and persistent history', () => {
  const envExample = readFileSync('.env.example', 'utf8');
  const readme = readFileSync('README.md', 'utf8');
  const dockerfile = readFileSync('Dockerfile', 'utf8');

  expect(envExample).toContain('HEALTH_TELEGRAM_BOT_TOKEN=replace_me');
  expect(envExample).toContain('HEALTH_TELEGRAM_CHAT_ID=replace_me');
  expect(envExample).toContain('HEALTH_MAX_ARTICLES=12');
  expect(envExample).toContain('HEALTH_HISTORY_RETENTION_DAYS=7');
  expect(envExample).toContain('HEALTH_HISTORY_PATH=data/health-sent-history.json');
  expect(readme).toContain('POST /telegram/send-health');
  expect(readme).toContain('curl -X POST http://localhost:3000/telegram/send-health');
  expect(readme).toMatch(/không có scheduler|không tự chạy lịch/iu);
  expect(readme).toContain('không thay thế chẩn đoán hoặc điều trị y khoa');
  expect(dockerfile).toContain('mkdir -p /app/data');
});
