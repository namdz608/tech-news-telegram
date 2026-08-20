import { goldPoliticsFallbackImageUrls } from '../config/gold-politics-images';
import type {
  GoldPriceSnapshot,
  GoldProviderKey,
  GoldQuote,
  PoliticsCandidate,
  PoliticsMessage,
} from '../types/gold-politics';
import { compactText, escapeHtml } from '../utils/text';
import { getArticleMessageImageUrl } from './article-message.service';
import {
  PoliticsEditorialService,
  type PoliticsEditorial,
} from './politics-editorial.service';

interface PoliticsEditorialEditor {
  edit(candidate: PoliticsCandidate): Promise<PoliticsEditorial>;
}

const PROVIDER_ORDER: readonly GoldProviderKey[] = ['sjc', 'doji', 'pnj', 'xau-usd'];

const CATEGORY_LABELS = {
  'gold-market': 'Thị trường vàng',
  'vietnam-politics': 'Chính trị Việt Nam',
  'international-politics': 'Chính trị quốc tế',
  'leader-controversy': 'Tranh cãi lãnh đạo',
} as const;

const GEO_LABELS = {
  vietnam: 'Việt Nam',
  international: 'Quốc tế',
  mixed: 'Hỗn hợp',
} as const;

const BADGES = {
  confirmed: '🟢 ĐÃ XÁC NHẬN',
  reported: '🟡 ĐANG ĐƯỢC ĐƯA TIN',
  unverified: '🔴 CHƯA KIỂM CHỨNG',
} as const;

const CHANNEL_LABELS = {
  rss: 'RSS',
  web: 'Web',
  x: 'X',
  reddit: 'Reddit',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  telegram: 'Telegram',
} as const;

const SEARCH_EXCERPT_NOTE =
  'Nội dung dựa trên trích đoạn do công cụ tìm kiếm cung cấp; chưa truy cập đầy đủ trang gốc.';
const MISSING_AUTHOR = 'Nguồn/tác giả chưa xác định';
const INCOMPLETE_NOTE = 'Nội dung nguồn chưa đầy đủ.';
const INVESTMENT_DISCLAIMER = 'Thông tin này không phải khuyến nghị đầu tư.';

const numberFormat = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export class GoldPoliticsMessageService {
  constructor(
    private readonly editorial: PoliticsEditorialEditor = new PoliticsEditorialService(),
    private readonly timeZone = 'Asia/Ho_Chi_Minh',
    private readonly maxLength = 3900,
  ) {}

  buildPriceMessage(snapshot: GoldPriceSnapshot): string {
    const quotes = [...snapshot.quotes].sort(
      (left, right) => PROVIDER_ORDER.indexOf(left.providerKey) - PROVIDER_ORDER.indexOf(right.providerKey),
    );
    const lines = [
      '🥇 <b>GIÁ VÀNG</b>',
      `⏱ ${this.formatDateTime(snapshot.collectedAt)}`,
      '',
    ];
    for (const quote of quotes) {
      lines.push(this.renderQuote(quote), '');
    }
    lines.push(`<i>${INVESTMENT_DISCLAIMER}</i>`);
    return this.fit(lines.join('\n').trim());
  }

  async buildNewsMessages(candidates: readonly PoliticsCandidate[]): Promise<PoliticsMessage[]> {
    return Promise.all(candidates.map(async (item) => {
      const editorial = await this.editorial.edit(item);
      const text = this.renderNews(item, editorial);
      return {
        text,
        url: item.claimOriginUrl,
        imageUrl: getArticleMessageImageUrl(
          item,
          goldPoliticsFallbackImageUrls[item.primaryCategory],
        ),
        candidate: item,
      };
    }));
  }

  private renderQuote(quote: GoldQuote): string {
    const name = escapeHtml(compactText(quote.instrumentName));
    const provider = escapeHtml(compactText(quote.providerName));
    const heading = `<b>${name}</b> — ${provider}`;
    const link = `🔗 ${escapeHtml(quote.sourceUrl)}`;
    if (quote.status === 'unavailable') {
      return [heading, 'KHÔNG CÓ DỮ LIỆU', 'không có thời gian nguồn', link].join('\n');
    }

    const unit = quote.displayUnit === 'usd-per-troy-ounce'
      ? 'USD/troy ounce'
      : 'triệu đồng/lượng';
    const stale = quote.status === 'stale' ? 'DỮ LIỆU CŨ' : undefined;
    const timestamp = `⏱ Nguồn: ${this.formatDateTime(quote.sourceTimestamp)}`;
    const prices = quote.quoteKind === 'spot'
      ? `Spot: ${formatNumber(quote.spot)}`
      : `Mua: ${formatNumber(quote.buy)} · Bán: ${formatNumber(quote.sell)} · Chênh lệch: ${formatNumber(quote.sell - quote.buy)}`;
    const movement = formatMovement(quote);
    return [heading, unit, stale, prices, timestamp, movement, link].filter(Boolean).join('\n');
  }

  private renderNews(candidate: PoliticsCandidate, editorial: PoliticsEditorial): string {
    const badge = BADGES[candidate.verificationState];
    const category = CATEGORY_LABELS[candidate.primaryCategory];
    const geography = GEO_LABELS[candidate.geographicScope];
    const author = sourceAuthor(candidate);
    const originLabel = candidate.claimOriginResolution === 'collected-original'
      ? 'Nguồn gốc đã thu thập'
      : 'Nguồn đại diện';
    const notes = [
      candidate.sourceTextStatus === 'search-excerpt' ? SEARCH_EXCERPT_NOTE : '',
      candidate.sourceTextStatus === 'incomplete' ? INCOMPLETE_NOTE : '',
    ].filter(Boolean);

    let titleBudget = 220;
    let summaryBudget = 820;
    let whyBudget = 420;
    let extraBudget = 360;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const title = truncateEscaped(compactText(editorial.title), titleBudget);
      const summary = truncateEscaped(compactText(editorial.summary), summaryBudget);
      const why = truncateEscaped(compactText(editorial.whyImportant), whyBudget);
      const corroboration = truncateEscaped(compactText(candidate.corroborationNote), extraBudget);
      const conflict = candidate.conflictNote
        ? truncateEscaped(compactText(candidate.conflictNote), extraBudget)
        : '';
      const sourceName = truncateEscaped(compactText(candidate.sourceName), 160);
      const authorText = truncateEscaped(author, 160);
      const text = [
        `🏛 <b>${escapeHtml(category)}</b> · ${escapeHtml(geography)}`,
        '━━━━━━━━━━━━━━━━',
        '',
        badge,
        `📰  <b>${title}</b>`,
        '',
        `📅 Công bố: ${this.formatDateTime(candidate.publishedAt || candidate.discoveredAt)}`,
        `📅 Phát hiện: ${this.formatDateTime(candidate.discoveredAt)}`,
        '',
        '📝 Tóm tắt',
        summary,
        '',
        '🎯 Vì sao đáng chú ý?',
        why,
        '',
        corroboration ? `🔗 Nguồn độc lập\n${corroboration}` : '',
        conflict ? `⚠️ Thông tin xung đột\n${conflict}` : '',
        '',
        `🏢 Nguồn: ${sourceName}`,
        `👤 Nguồn/tác giả: ${authorText}`,
        `📢 Kênh: ${CHANNEL_LABELS[candidate.discoveryChannel]}`,
        `🔗 ${originLabel}`,
        ...notes.map((note) => escapeHtml(note)),
      ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n').trim();

      if (text.length <= this.maxLength) return text;
      if (summaryBudget > 160) summaryBudget -= 120;
      else if (whyBudget > 120) whyBudget -= 80;
      else if (extraBudget > 80) extraBudget -= 80;
      else if (titleBudget > 80) titleBudget -= 40;
      else extraBudget = 0;
    }
    return this.fit([
      badge,
      `📰  <b>${truncateEscaped(compactText(editorial.title), 80)}</b>`,
      truncateEscaped(compactText(editorial.summary), Math.max(80, this.maxLength - 200)),
    ].join('\n'));
  }

  private formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Không rõ';
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: this.timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  private fit(text: string): string {
    if (text.length <= this.maxLength) return text;
    const lines = text.split('\n');
    while (lines.length > 0) {
      const next = lines.join('\n').trim();
      if (next.length <= this.maxLength) return next;
      lines.pop();
    }
    return '';
  }
}

function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function formatDelta(value: number): string {
  if (value === 0) return 'không đổi';
  const abs = formatNumber(Math.abs(value));
  return value > 0 ? `+${abs}` : `-${abs}`;
}

function formatMovement(quote: Extract<GoldQuote, { status: 'fresh' | 'stale' }>): string {
  if (quote.movement.status === 'not-available') {
    return quote.movement.reason === 'no-previous-quote'
      ? 'Quan sát đầu tiên'
      : 'Chưa có dữ liệu so sánh';
  }
  if (quote.quoteKind === 'spot') {
    return `Biến động: ${formatDelta(quote.movement.spotDelta)}`;
  }
  return `Biến động: ${formatDelta(quote.movement.buyDelta)} / ${formatDelta(quote.movement.sellDelta)}`;
}

function sourceAuthor(candidate: PoliticsCandidate): string {
  const name = compactText(
    candidate.originAttribution.account
      || candidate.originalAccount
      || candidate.originalAuthor
      || candidate.author
      || '',
  );
  return name || MISSING_AUTHOR;
}

function truncateEscaped(plain: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  let result = '';
  for (const char of plain) {
    const escaped = escapeHtml(char);
    if (result.length + escaped.length > maxLength) break;
    result += escaped;
  }
  return result;
}
