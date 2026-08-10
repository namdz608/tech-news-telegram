import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('gadget runtime configuration', () => {
  it('documents gadget env, writable data storage, and the endpoint without a scheduler', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const readme = readFileSync('README.md', 'utf8');
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(envExample).toContain('GADGET_TELEGRAM_BOT_TOKEN=replace_me');
    expect(envExample).toContain('GADGET_TELEGRAM_CHAT_ID=replace_me');
    expect(envExample).toContain('GADGET_MAX_ARTICLES=12');
    expect(envExample).toContain('GADGET_HISTORY_RETENTION_DAYS=30');
    expect(envExample).toContain('GADGET_HISTORY_PATH=data/gadget-sent-history.json');
    expect(dockerfile).toContain('mkdir -p /app/data');
    expect(readme).toContain('POST /telegram/send-gadgets');
    expect(readme).toContain('curl -X POST http://localhost:3000/telegram/send-gadgets');
    expect(gitignore).toContain('data/');
  });
});
