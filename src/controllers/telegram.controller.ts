import type { Request, Response } from 'express';
import { ArticleEditorialService } from '../services/article-editorial.service';
import { DigestService } from '../services/digest.service';
import { editDigestMessages } from '../services/digest-message-editorial.service';
import { SourceService } from '../services/source.service';
import { TelegramService } from '../services/telegram.service';

const sourceService = new SourceService();
const digestService = new DigestService();
const telegramService = new TelegramService();
const articleEditorialService = new ArticleEditorialService();

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
