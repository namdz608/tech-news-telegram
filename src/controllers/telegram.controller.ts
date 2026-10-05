/**
 * Điều phối use case thu thập tin và gửi ra ngoài (Telegram digest / email jobs).
 */
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { VnJobsCrawler } from '../crawlers/vn-jobs.crawler';
import { parseJobSendParams } from '../crawlers/vn-jobs/params';
import { DigestService } from '../services/digest.service';
import { editDigestMessages } from '../services/digest-message-editorial.service';
import { EmailService } from '../services/email.service';
import {
  createGadgetFlowService,
  isAllGadgetSourcesFailedError,
} from '../services/gadget-flow.service';
import {
  createGoldPoliticsFlowService,
  isAllGoldPoliticsSourcesFailedError,
} from '../services/gold-politics-flow.service';
import {
  releaseDevopsInfraDigestLock,
  tryAcquireDevopsInfraDigestLock,
} from '../services/devops-infra-digest-lock';
import {
  createDevopsInfraFlowService,
  isAllDevopsInfraSourcesFailedError,
} from '../services/devops-infra-flow.service';
import {
  releaseDevopsJobsDigestLock,
  tryAcquireDevopsJobsDigestLock,
} from '../services/devops-jobs-digest-lock';
import {
  createDevopsJobsFlowService,
  isAllDevopsJobsSourcesFailedError,
} from '../services/devops-jobs-flow.service';
import {
  createHealthFlowService,
  isAllHealthSourcesFailedError,
} from '../services/health-flow.service';
import { buildJobDigestMessages } from '../services/job-message.service';
import { buildJobsPdf } from '../services/jobs-pdf.service';
import { SourceService } from '../services/source.service';
import { createTechArticleEditorialService } from '../services/tech-editorial.factory';
import { createTelegramService, TelegramService } from '../services/telegram.service';

const sourceService = new SourceService();
const digestService = new DigestService();
const telegramService = new TelegramService();
const articleEditorialService = createTechArticleEditorialService();
const vnJobsCrawler = new VnJobsCrawler();
const emailService = new EmailService();
let gadgetFlowService: ReturnType<typeof createGadgetFlowService> | undefined;
let gadgetDigestRunning = false;
let healthFlowService: ReturnType<typeof createHealthFlowService> | undefined;
let healthDigestRunning = false;
let goldPoliticsFlowService: ReturnType<typeof createGoldPoliticsFlowService> | undefined;
let goldPoliticsDigestRunning = false;
let devopsInfraFlowService: ReturnType<typeof createDevopsInfraFlowService> | undefined;
let devopsJobsFlowService: ReturnType<typeof createDevopsJobsFlowService> | undefined;

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

/** Thu thập và gửi bản tin đời sống/sức khỏe bằng bot/chat riêng. */
export async function sendHealth(_req: Request, res: Response) {
  if (healthDigestRunning) {
    res.status(409).json({ error: 'Health digest is already running' });
    return;
  }

  healthDigestRunning = true;
  try {
    healthFlowService ??= createHealthFlowService();
    res.json(await healthFlowService.run());
  } catch (error) {
    if (isAllHealthSourcesFailedError(error)) {
      res.status(503).json({ error: 'All health sources failed' });
      return;
    }
    throw error;
  } finally {
    healthDigestRunning = false;
  }
}

/** Thu thập và gửi bản tin vàng/chính trị bằng bot/chat riêng. */
export async function sendGoldPolitics(_req: Request, res: Response) {
  if (goldPoliticsDigestRunning) {
    res.status(409).json({ error: 'Gold-politics digest is already running' });
    return;
  }

  goldPoliticsDigestRunning = true;
  try {
    goldPoliticsFlowService ??= createGoldPoliticsFlowService();
    res.json(await goldPoliticsFlowService.run());
  } catch (error) {
    if (isAllGoldPoliticsSourcesFailedError(error)) {
      res.status(503).json({ error: 'All gold-politics sources failed' });
      return;
    }
    throw error;
  } finally {
    goldPoliticsDigestRunning = false;
  }
}

/** Thu thập và gửi bản tin DevOps/hạ tầng bằng bot/chat riêng. */
export async function sendDevopsInfra(_req: Request, res: Response) {
  if (!tryAcquireDevopsInfraDigestLock()) {
    console.warn('devops-infra digest already running');
    res.status(409).json({ error: 'DevOps infra digest is already running' });
    return;
  }
  try {
    devopsInfraFlowService ??= createDevopsInfraFlowService();
    res.json(await devopsInfraFlowService.run());
  } catch (error) {
    if (isAllDevopsInfraSourcesFailedError(error)) {
      res.status(503).json({ error: 'All devops-infra sources failed' });
      return;
    }
    throw error;
  } finally {
    releaseDevopsInfraDigestLock();
  }
}

/** Thu thập job remote DevOps và gửi bằng bot/chat riêng. */
export async function sendDevopsJobs(_req: Request, res: Response) {
  if (!tryAcquireDevopsJobsDigestLock()) {
    res.status(409).json({ error: 'DevOps jobs digest is already running' });
    return;
  }
  try {
    devopsJobsFlowService ??= createDevopsJobsFlowService();
    res.json(await devopsJobsFlowService.run());
  } catch (error) {
    if (isAllDevopsJobsSourcesFailedError(error)) {
      res.status(503).json({ error: 'All devops-jobs sources failed' });
      return;
    }
    throw error;
  } finally {
    releaseDevopsJobsDigestLock();
  }
}

/**
 * Crawl tin tuyển dụng VN. `channel=email` gửi PDF qua SMTP, `telegram` gửi
 * từng tin kèm logo công ty, `both` gửi cả hai.
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

  const channel = params.channel;
  const wantsEmail = channel === 'email' || channel === 'both';
  const wantsTelegram = channel === 'telegram' || channel === 'both';
  const { articles, boardCounts, crawledCounts, matchedCount } = await vnJobsCrawler.crawl({
    role: params.role,
    experienceYears: params.experienceYears,
    maxResults: params.limit,
  });
  const counts = {
    role: params.role,
    experienceYears: params.experienceYears ?? null,
    limit: params.limit,
    matchedCount,
    crawledCounts,
    boardCounts,
    language: 'vi' as const,
  };

  if (articles.length === 0) {
    res.json({
      sent: false,
      channel,
      articleCount: 0,
      ...counts,
    });
    return;
  }

  if (wantsEmail && !wantsTelegram) {
    try {
      emailService.assertConfigured();
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Email not configured',
        channel,
        articleCount: articles.length,
        matchedCount,
        crawledCounts,
        boardCounts,
      });
      return;
    }
  }

  let pdfFileName: string | undefined;
  let mailTo: string | undefined;
  let emailSent = false;
  let emailError: string | undefined;
  if (wantsEmail) {
    const pdf = await buildJobsPdf(articles, {
      role: params.role,
      experienceYears: params.experienceYears,
      limit: params.limit,
    });
    pdfFileName = pdf.fileName;
    try {
      emailService.assertConfigured();
      const mail = await emailService.sendJobsPdfEmail({
        role: params.role,
        experienceYears: params.experienceYears,
        articleCount: articles.length,
        pdfBuffer: pdf.buffer,
        pdfFileName: pdf.fileName,
      });
      mailTo = mail.mailTo;
      emailSent = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : 'Email send failed';
      if (!wantsTelegram) {
        const status = emailError.startsWith('Email not configured') ? 503 : 502;
        res.status(status).json({
          error: emailError,
          channel,
          articleCount: articles.length,
          matchedCount,
          crawledCounts,
          boardCounts,
        });
        return;
      }
    }
  }

  let telegramSent = false;
  let telegramError: string | undefined;
  if (wantsTelegram) {
    try {
      const jobsTelegram = createTelegramService(
        env.DEVOPS_JOBS_TELEGRAM_BOT_TOKEN,
        env.DEVOPS_JOBS_TELEGRAM_CHAT_ID,
      );
      await jobsTelegram.sendMessages(buildJobDigestMessages(articles));
      telegramSent = true;
    } catch (error) {
      telegramError = error instanceof Error ? error.message : 'Telegram send failed';
      if (!emailSent) {
        res.status(502).json({
          error: telegramError,
          channel,
          articleCount: articles.length,
          ...(emailError ? { emailError } : {}),
          matchedCount,
          crawledCounts,
          boardCounts,
        });
        return;
      }
    }
  }

  res.json({
    sent: emailSent || telegramSent,
    channel,
    articleCount: articles.length,
    ...counts,
    ...(mailTo ? { mailTo } : {}),
    ...(wantsEmail && wantsTelegram ? { emailSent } : {}),
    ...(emailError ? { emailError } : {}),
    ...(wantsTelegram ? { telegramSent, messageCount: articles.length } : {}),
    ...(telegramError ? { telegramError } : {}),
    ...(pdfFileName ? { pdfFileName } : {}),
  });
}
