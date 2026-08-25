import { describe, expect, it } from 'vitest';
import { codexProcessEnv } from '../../src/services/codex-exec.runner';

describe('codexProcessEnv', () => {
  it('drops placeholder and empty API keys so ChatGPT login in auth.json is used', () => {
    const env = codexProcessEnv({
      HOME: '/root',
      OPENAI_API_KEY: 'sk-replace-me',
      CODEX_API_KEY: '',
      PATH: '/usr/bin',
    });

    expect(env.HOME).toBe('/root');
    expect(env.PATH).toBe('/usr/bin');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.CODEX_API_KEY).toBeUndefined();
  });

  it('keeps a real API key when one is configured', () => {
    const env = codexProcessEnv({
      OPENAI_API_KEY: 'sk-live-key',
      CODEX_API_KEY: 'sk-live-key',
    });

    expect(env.OPENAI_API_KEY).toBe('sk-live-key');
    expect(env.CODEX_API_KEY).toBe('sk-live-key');
  });
});
