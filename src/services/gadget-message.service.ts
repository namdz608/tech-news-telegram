import { gadgetTopics } from '../config/gadget-topics';
import type { Article } from '../types/article';
import type { GadgetDigestEntry, GadgetMessage, GadgetTopicKey } from '../types/gadget';
import { ArticleEditorialService, hasVietnameseEditorialText } from './article-editorial.service';
import type { ArticleEditorial, EditorialTopicContext } from './article-editorial.types';
import { getArticleMessageImageUrl, renderArticleMessageWithPresentation } from './article-message.service';

interface GadgetArticleEditor {
  editArticle(article: Article, topic: EditorialTopicContext): Promise<ArticleEditorial>;
}

export class GadgetMessageService {
  constructor(private readonly editor: GadgetArticleEditor = new ArticleEditorialService()) {}

  async buildMessages(entries: GadgetDigestEntry[]): Promise<GadgetMessage[]> {
    const messages = await Promise.all(
      entries.map(async (entry): Promise<GadgetMessage | undefined> => {
        const topic = getTopic(entry.topic);
        const editorial = await this.editor.editArticle(entry.article, {
          key: topic.key,
          fallbackWhyImportant: topic.fallbackWhyImportant,
        });
        if (!hasVietnameseEditorialText(editorial)) {
          return undefined;
        }
        const imageUrl = getArticleMessageImageUrl(entry.article, topic.fallbackImageUrl);
        const message: GadgetMessage = {
          text: renderArticleMessageWithPresentation(entry.article, topic, editorial),
          url: entry.article.url,
          article: entry.article,
          topic: entry.topic,
        };
        if (imageUrl) message.imageUrl = imageUrl;
        return message;
      }),
    );
    return messages.filter((message): message is GadgetMessage => message !== undefined);
  }
}

function getTopic(key: GadgetTopicKey) {
  const topic = gadgetTopics.find((candidate) => candidate.key === key);
  if (!topic) throw new Error(`Unknown gadget topic: ${key}`);
  return topic;
}
