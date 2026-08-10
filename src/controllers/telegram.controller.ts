/**
 * Điều phối use case thu thập tin và gửi ra ngoài (Telegram digest / email jobs).
 */
import type { Request, Response } from 'express';
import { VnJobsCrawler } from '../crawlers/vn-jobs.crawler';
import { parseJobSendParams } from '../crawlers/vn-jobs/params';
import { ArticleEditorialService } from '../services/article-editorial.service';
import { DigestService } from '../services/digest.service';
import { editDigestMessages } from '../services/digest-message-editorial.service';
import { EmailService } from '../services/email.service';
import {
  createGadgetFlowService,
  isAllGadgetSourcesFailedError,
} from '../services/gadget-flow.service';
import { buildJobsPdf } from '../services/jobs-pdf.service';
import { SourceService } from '../services/source.service';
import { TelegramService } from '../services/telegram.service';

const sourceService = new SourceService();
const digestService = new DigestService();
const telegramService = new TelegramService();
const articleEditorialService = new ArticleEditorialService();
const vnJobsCrawler = new VnJobsCrawler();
const emailService = new EmailService();
let gadgetFlowService: ReturnType<typeof createGadgetFlowService> | undefined;
let gadgetDigestRunning = false;

/**
 * Thu thập, biên tập và gửi một đợt message Telegram (tech digest).
 */
export async function sendDigest(_req: Request, res: Response) {
  const articles = await sourceService.collectLatest();
  const messages = digestService.buildDigestMessages(articles);
  const editedMessages = await editDigestMessages(messages, articleEditorialService);
  await telegramService.sendMessages(editedMessages);

  res.json({
    sent: true,
    articleCount: articles.length,
    messageCount: editedMessages.length,
    language: 'vi',
  });
}

/** Thu thập và gửi bản tin thiết bị bằng bot/chat riêng. */
export async function sendGadgets(_req: Request, res: Response) {
  if (gadgetDigestRunning) {
    res.status(409).json({ error: 'Gadget digest is already running' });
    return;
  }

  gadgetDigestRunning = true;
  try {
    gadgetFlowService ??= createGadgetFlowService();
    res.json(await gadgetFlowService.run());
  } catch (error) {
    if (isAllGadgetSourcesFailedError(error)) {
      res.status(503).json({ error: 'All gadget sources failed' });
      return;
    }
    throw error;
  } finally {
    gadgetDigestRunning = false;
  }
}

/**
 * Crawl tin tuyển dụng VN → PDF → email SMTP (không gửi Telegram).
 */
export async function sendJobs(req: Request, res: Response) {
  let params;

  try {
    params = parseJobSendParams(req.query as Record<string, unknown>);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid params',
    });
    return;
  }

  const { articles, boardCounts, crawledCounts, matchedCount } = await vnJobsCrawler.crawl({
    role: params.role,
    experienceYears: params.experienceYears,
    maxResults: params.limit,
  });

  if (articles.length === 0) {
    res.json({
      sent: false,
      channel: 'email',
      articleCount: 0,
      role: params.role,
      experienceYears: params.experienceYears ?? null,
      limit: params.limit,
      matchedCount,
      crawledCounts,
      boardCounts,
      language: 'vi',
    });
    return;
  }

  try {
    emailService.assertConfigured();
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : 'Email not configured',
      channel: 'email',
      articleCount: articles.length,
      matchedCount,
      crawledCounts,
      boardCounts,
    });
    return;
  }

  const pdf = await buildJobsPdf(articles, {
    role: params.role,
    experienceYears: params.experienceYears,
    limit: params.limit,
  });

  const mail = await emailService.sendJobsPdfEmail({
    role: params.role,
    experienceYears: params.experienceYears,
    articleCount: articles.length,
    pdfBuffer: pdf.buffer,
    pdfFileName: pdf.fileName,
  });

  res.json({
    sent: true,
    channel: 'email',
    articleCount: articles.length,
    role: params.role,
    experienceYears: params.experienceYears ?? null,
    limit: params.limit,
    matchedCount,
    crawledCounts,
    boardCounts,
    mailTo: mail.mailTo,
    pdfFileName: pdf.fileName,
    language: 'vi',
  });
}
