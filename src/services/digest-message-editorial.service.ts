import type { ArticleEditorial } from './article-editorial.types';
import type { DigestMessage } from './digest.service';
import { renderArticleMessage } from './digest.service';

interface ArticleEditor {
  editArticle(
    article: DigestMessage['article'],
    topic: DigestMessage['topic'],
  ): Promise<ArticleEditorial>;
}

export async function editDigestMessages(
  messages: DigestMessage[],
  editorialService: ArticleEditor,
): Promise<DigestMessage[]> {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      text: renderArticleMessage(
        message.article,
        message.topic,
        await editorialService.editArticle(message.article, message.topic),
      ),
    })),
  );
}
