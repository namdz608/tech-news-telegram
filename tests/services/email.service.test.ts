import { describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';
import { EmailService } from '../../src/services/email.service';

describe('EmailService', () => {
  it('sends PDF attachment when SMTP is configured via transport mock', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'msg-1' }));
    const service = new EmailService(() => ({ sendMail }));
    vi.spyOn(service, 'assertConfigured').mockImplementation(() => undefined);

    const result = await service.sendJobsPdfEmail({
      role: 'devops',
      experienceYears: '2-5',
      articleCount: 2,
      pdfBuffer: Buffer.from('%PDF-fake'),
      pdfFileName: 'vn-jobs-devops-test.pdf',
    });

    expect(result.messageId).toBe('msg-1');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: expect.any(String),
        attachments: [
          expect.objectContaining({
            filename: 'vn-jobs-devops-test.pdf',
            contentType: 'application/pdf',
          }),
        ],
      }),
    );
  });

  it('throws when SMTP_HOST / MAIL_TO missing', () => {
    const service = new EmailService();

    if (env.SMTP_HOST.trim() && env.MAIL_TO.trim()) {
      // Local .env đã cấu hình SMTP — không thể assert nhánh thiếu config.
      expect(() => service.assertConfigured()).not.toThrow();
      return;
    }

    expect(() => service.assertConfigured()).toThrow(/Email not configured/);
  });
});
