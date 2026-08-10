import { gadgetTopics } from '../config/gadget-topics';
import type { Article } from '../types/article';
import type { GadgetDigestEntry, GadgetMessage, GadgetTopicKey } from '../types/gadget';
import { ArticleEditorialService } from './article-editorial.service';
import type { ArticleEditorial, EditorialTopicContext } from './article-editorial.types';
import { getArticleMessageImageUrl, renderArticleMessageWithPresentation } from './article-message.service';

interface GadgetArticleEditor {
  editArticle(article: Article, topic: EditorialTopicContext): Promise<ArticleEditorial>;
}

export class GadgetMessageService {
  constructor(private readonly editor: GadgetArticleEditor = new ArticleEditorialService()) {}

  async buildMessages(entries: GadgetDigestEntry[]): Promise<GadgetMessage[]> {
    return Promise.all(
      entries.map(async (entry) => {
        const topic = getTopic(entry.topic);
        const editorial = await this.editor.editArticle(entry.article, {
          key: topic.key,
          fallbackWhyImportant: topic.fallbackWhyImportant,
        });
        return {
          text: renderArticleMessageWithPresentation(entry.article, topic, editorial),
          url: entry.article.url,
          imageUrl: getArticleMessageImageUrl(entry.article, topic.fallbackImageUrl),
          article: entry.article,
          topic: entry.topic,
        };
      }),
    );
  }
}

function getTopic(key: GadgetTopicKey) {
  const topic = gadgetTopics.find((candidate) => candidate.key === key);
  if (!topic) throw new Error(`Unknown gadget topic: ${key}`);
  return topic;
}
