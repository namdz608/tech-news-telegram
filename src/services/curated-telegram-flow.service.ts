import type {
  CuratedEntry,
  CuratedFlowDependencies,
  CuratedFlowOptions,
  CuratedMessage,
} from '../types/curated';

export class CuratedTelegramFlow<
  TEntry extends CuratedEntry,
  TMessage extends CuratedMessage,
  TChannel extends string,
> {
  constructor(
    private readonly dependencies: CuratedFlowDependencies<TEntry, TMessage>,
    private readonly options: CuratedFlowOptions<TChannel>,
  ) {}

  async run() {
    const collected = await this.dependencies.collector.collectLatest();
    if (collected.successfulSourceCount === 0) {
      throw this.options.createAllSourcesFailedError();
    }

    const history = await this.dependencies.history.seenUrls();
    const result = this.dependencies.selector.select(collected.articles, history);
    const common = {
      collectedCount: collected.articles.length,
      eligibleCount: result.eligibleCount,
      skippedSeenCount: result.skippedSeenCount,
      language: 'vi' as const,
      channel: this.options.channel,
    };

    if (result.selected.length === 0) {
      return {
        sent: false as const,
        reason: 'no_new_articles' as const,
        messageCount: 0,
        ...common,
      };
    }

    const messages = await this.dependencies.messageBuilder.buildMessages(result.selected);
    await this.dependencies.delivery.send(messages);
    return { sent: true as const, messageCount: messages.length, ...common };
  }
}
