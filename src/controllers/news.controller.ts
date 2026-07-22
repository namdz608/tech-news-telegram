import type { Request, Response } from 'express';
import { sources } from '../config/sources';
import { ArticleEditorialService } from '../services/article-editorial.service';
import { DigestService } from '../services/digest.service';
import { editDigestMessages } from '../services/digest-message-editorial.service';
import { SourceService } from '../services/source.service';
import { TranslationService } from '../services/translation.service';

const sourceService = new SourceService();
const digestService = new DigestService();
const translationService = new TranslationService();
const articleEditorialService = new ArticleEditorialService();

export function listSources(_req: Request, res: Response) {
  res.json({ sources });
}

export async function getLatestNews(_req: Request, res: Response) {
  const articles = await sourceService.collectLatest();
  res.json({ articles });
}

export async function createDigest(_req: Request, res: Response) {
  const articles = await sourceService.collectLatest();
  const digest = digestService.buildDigest(articles);
  const messages = digestService.buildDigestMessages(articles);
  const translatedDigest = await translationService.translateDigest(digest);
  const editedMessages = await editDigestMessages(messages, articleEditorialService);

  res.json({
    digest: translatedDigest,
    rawDigest: digest,
    messages: editedMessages,
    rawMessages: messages,
    articleCount: articles.length,
    messageCount: editedMessages.length,
    language: 'vi',
  });
}
