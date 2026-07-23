import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CodexRunner {
  run(prompt: string, input: string, timeoutMs: number): Promise<string>;
}

export class CodexExecRunner implements CodexRunner {
  run(prompt: string, input: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputDir = mkdtempSync(join(tmpdir(), 'tech-news-codex-'));
      const outputFile = join(outputDir, 'translation.txt');
      const cleanup = () => rmSync(outputDir, { recursive: true, force: true });
      const child = spawn(
        'codex',
        [
          'exec',
          '--ephemeral',
          '--sandbox',
          'read-only',
          '--skip-git-repo-check',
          '--output-last-message',
          outputFile,
          prompt,
        ],
        {
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        cleanup();
        reject(new Error(`Codex translation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        cleanup();
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          const finalMessage = existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : stdout;
          cleanup();
          resolve(finalMessage);
          return;
        }

        cleanup();
        reject(new Error(`Codex translation failed with exit code ${code}: ${stderr.trim()}`));
      });

      child.stdin.end(input);
    });
  }
}
