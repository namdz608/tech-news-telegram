/**
 * Gửi email SMTP kèm PDF tin tuyển dụng.
 */
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { env } from '../config/env';
import type { ExperienceYears, JobRole } from '../crawlers/vn-jobs/types';

export interface SendJobsPdfEmailInput {
  role: JobRole;
  experienceYears?: ExperienceYears;
  articleCount: number;
  pdfBuffer: Buffer;
  pdfFileName: string;
}

export interface SendJobsPdfEmailResult {
  messageId: string;
  mailTo: string;
}

type MailTransport = {
  sendMail(options: nodemailer.SendMailOptions): Promise<{ messageId?: string }>;
};

export class EmailService {
  constructor(private readonly createTransport: () => MailTransport = defaultTransport) {}

  assertConfigured(): void {
    const missing: string[] = [];

    if (!env.SMTP_HOST.trim()) missing.push('SMTP_HOST');
    if (!env.MAIL_TO.trim()) missing.push('MAIL_TO');

    if (missing.length > 0) {
      throw new Error(`Email not configured: missing ${missing.join(', ')}`);
    }
  }

  async sendJobsPdfEmail(input: SendJobsPdfEmailInput): Promise<SendJobsPdfEmailResult> {
    this.assertConfigured();

    const mailTo = env.MAIL_TO.trim();
    const mailFrom = (env.MAIL_FROM.trim() || env.SMTP_USER.trim() || mailTo).trim();
    const experience = input.experienceYears ?? 'không lọc';
    const subject = `[VN Jobs] ${input.role} — ${input.articleCount} tin — ${new Date().toISOString().slice(0, 10)}`;
    const text = [
      `Tin tuyển dụng Việt Nam`,
      `Role: ${input.role}`,
      `Kinh nghiệm: ${experience}`,
      `Số tin: ${input.articleCount}`,
      ``,
      `File đính kèm: ${input.pdfFileName}`,
    ].join('\n');

    const transport = this.createTransport();
    const info = await transport.sendMail({
      from: mailFrom,
      to: mailTo,
      subject,
      text,
      attachments: [
        {
          filename: input.pdfFileName,
          content: input.pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    return {
      messageId: info.messageId ?? '',
      mailTo,
    };
  }
}

function defaultTransport(): MailTransport {
  const options: SMTPTransport.Options = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
  };

  if (env.SMTP_USER.trim() || env.SMTP_PASS.trim()) {
    options.auth = {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    };
  }

  return nodemailer.createTransport(options);
}
