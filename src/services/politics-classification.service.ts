import type {
  ClaimModality,
  ClaimStance,
  ClassifiedPoliticsItem,
  GeographicScope,
  PoliticsCategory,
  PoliticsSourceItem,
} from '../types/gold-politics';

type SynonymPair = readonly [phrase: string, canonical: string];

const SYNONYMS: readonly SynonymPair[] = [
  ['pham minh chinh', 'pham-minh-chinh'],
  ['secretary general', 'secretary-general'],
  ['secretary-general', 'secretary-general'],
  ['tong thu ky', 'secretary-general'],
  ['united nations', 'un'],
  ['lien hop quoc', 'un'],
  ['world bank', 'world-bank'],
  ['european union', 'eu'],
  ['federal reserve', 'central-bank'],
  ['ngan hang trung uong', 'central-bank'],
  ['ngan hang nha nuoc', 'central-bank'],
  ['central bank', 'central-bank'],
  ['national assembly', 'vietnam-parliament'],
  ['quoc hoi', 'vietnam-parliament'],
  ['parliament', 'parliament'],
  ['prime minister', 'prime-minister'],
  ['thu tuong', 'prime-minister'],
  ['chu tich nuoc', 'president'],
  ['tong thong', 'president'],
  ['chief justice', 'chief-justice'],
  ['chanh an', 'chief-justice'],
  ['toi cao', 'supreme-court'],
  ['giam doc dieu hanh', 'ceo'],
  ['dalai lama', 'dalai-lama'],
  ['elon musk', 'elon-musk'],
  ['donald trump', 'trump'],
  ['united states', 'united-states'],
  ['bo quoc phong', 'defense'],
  ['quoc phong', 'defense'],
  ['public policy', 'policy'],
  ['chinh sach', 'policy'],
  ['ngoai giao', 'diplomacy'],
  ['diplomatic', 'diplomacy'],
  ['gold prices', 'gold-price'],
  ['gold price', 'gold-price'],
  ['gia vang', 'gold-price'],
  ['interest rates', 'interest-rate'],
  ['interest rate', 'interest-rate'],
  ['lai suat', 'interest-rate'],
  ['dollar drivers', 'usd'],
  ['us dollar', 'usd'],
  ['accepted bribes', 'bribery'],
  ['accepting bribes', 'bribery'],
  ['accepted bribe', 'bribery'],
  ['accept bribes', 'bribery'],
  ['accept bribe', 'bribery'],
  ['taken bribes', 'bribery'],
  ['take bribes', 'bribery'],
  ['nhan hoi lo', 'bribery'],
  ['hoi lo', 'bribery'],
  ['bribes', 'bribery'],
  ['bribe', 'bribery'],
  ['bribery', 'bribery'],
  ['tham nhung', 'corruption'],
  ['corruption', 'corruption'],
  ['abuse of power', 'abuse-of-power'],
  ['lam quyen', 'abuse-of-power'],
  ['be boi', 'scandal'],
  ['tranh cai', 'controversy'],
  ['cao buoc', 'allegation'],
  ['accused of', 'allegation'],
  ['accused', 'allegation'],
  ['allegedly', 'allegation'],
  ['alleged', 'allegation'],
  ['allegation', 'allegation'],
  ['phu nhan', 'denies'],
  ['did not', 'denies'],
  ['thong qua', 'pass'],
  ['passes', 'pass'],
  ['ngan sach', 'budget'],
  ['du luat', 'law'],
  ['luat', 'law'],
  ['chinh phu', 'government'],
  ['bau cu', 'election'],
  ['dieu tra', 'investigation'],
  ['chien tranh', 'war'],
  ['xung dot', 'conflict'],
  ['ngung ban', 'ceasefire'],
  ['trung phat', 'sanction'],
  ['sanctions', 'sanction'],
  ['viet nam', 'vietnam'],
  ['vietnamese', 'vietnam'],
  ['ha noi', 'hanoi'],
  ['gian lan', 'fraud'],
  ['tu chuc', 'resignation'],
  ['official record', 'established'],
  ['may have', 'possible'],
  ['co the', 'possible'],
];

const POLARITY_MODALITY_TOKENS = new Set([
  'allegation',
  'denies',
  'deny',
  'denied',
  'denial',
  'refute',
  'refutes',
  'not',
  'never',
  'no',
  'khong',
  'established',
  'confirmed',
  'confirm',
  'possible',
  'possibly',
  'may',
  'might',
  'reported',
  'reportedly',
  'according',
  'official',
  'finding',
  'bi',
]);

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'be',
  'as',
  'by',
  'with',
  'from',
  'after',
  'over',
  'into',
  'about',
  'also',
  'than',
  'this',
  'that',
  'he',
  'she',
  'they',
  'it',
  'his',
  'her',
  'their',
  'va',
  'cua',
  'la',
  'cho',
  'voi',
  'mot',
  'cac',
  'nhung',
  'trong',
  've',
  'tu',
  'nay',
  'do',
  'duoc',
  'co',
  'khi',
  'tai',
  'sau',
  'mo',
  'cuoc',
  'new',
  'presents',
  'present',
  'trinh',
  'bill',
  'the',
]);

const IN_SCOPE_ENTITIES = [
  'pham-minh-chinh',
  'elon-musk',
  'dalai-lama',
  'trump',
  'prime-minister',
  'president',
  'minister',
  'chief-justice',
  'secretary-general',
  'ceo',
  'vietnam-parliament',
  'parliament',
  'government',
  'supreme-court',
  'un',
  'nato',
  'imf',
  'world-bank',
  'eu',
  'tesla',
] as const;

const CLAIM_CONCEPTS = new Set([
  'bribery',
  'corruption',
  'fraud',
  'abuse-of-power',
  'scandal',
  'controversy',
  'pass',
  'budget',
  'law',
  'policy',
  'election',
  'diplomacy',
  'defense',
  'investigation',
  'war',
  'conflict',
  'ceasefire',
  'sanction',
  'gold-price',
  'interest-rate',
  'usd',
  'central-bank',
  'resignation',
]);

const CONTROVERSY_TERMS = [
  'controversy',
  'scandal',
  'allegation',
  'bribery',
  'corruption',
  'fraud',
  'abuse-of-power',
  'leak',
  'resignation',
  'indictment',
  'impeachment',
  'arrest',
];

const IN_SCOPE_TERMS = [
  'pham-minh-chinh',
  'elon-musk',
  'dalai-lama',
  'trump',
  'prime-minister',
  'president',
  'minister',
  'chief-justice',
  'secretary-general',
  'ceo',
  'executive',
  'quan chuc',
  'public official',
  'public figure',
  'politician',
  'chinh tri gia',
  'tesla',
  'vingroup',
];

const VIETNAM_POLITICS_TERMS = [
  'vietnam-parliament',
  'parliament',
  'government',
  'prime-minister',
  'policy',
  'diplomacy',
  'election',
  'defense',
  'investigation',
  'minister',
  'president',
  'dang cong san',
  'cong quyen',
  'pham-minh-chinh',
  'supreme-court',
  'chief-justice',
];

const INTERNATIONAL_POLITICS_TERMS = [
  'uk',
  'britain',
  'british',
  'nato',
  'un',
  'imf',
  'world-bank',
  'eu',
  'ukraine',
  'war',
  'conflict',
  'ceasefire',
  'sanction',
  'united-states',
  'trump',
  'china',
  'russia',
  'election',
  'diplomacy',
  'parliament',
  'government',
];

const GOLD_TERMS = [
  'gold-price',
  'sjc',
  'doji',
  'pnj',
  'xau',
  'bullion',
  'usd',
  'central-bank',
  'interest-rate',
  'rates',
];

const VIETNAM_GEO = [
  'vietnam',
  'hanoi',
  'ho chi minh',
  'sjc',
  'doji',
  'pnj',
  'vietnam-parliament',
  'pham-minh-chinh',
  'chief-justice',
  'supreme-court',
];

const INTERNATIONAL_GEO = [
  'uk',
  'britain',
  'british',
  'united-states',
  'us',
  'usa',
  'trump',
  'china',
  'russia',
  'ukraine',
  'nato',
  'un',
  'imf',
  'world-bank',
  'eu',
  'central-bank',
  'usd',
  'tesla',
  'elon-musk',
  'dalai-lama',
  'london',
  'fed',
];

const REJECT_CELEBRITY = ['taylor swift', 'hollywood', 'celebrity', 'gossip', 'dating rumor', 'singer', 'actor', 'dien vien', 'ca si'];
const REJECT_SPORT = ['manchester united', 'football', 'championship', 'league', 'bong da', 'world cup', 'match report'];
const REJECT_ENTERTAINMENT = ['concert', 'film premiere', 'movie', 'music show', 'entertainment'];
const REJECT_ADS = ['giam gia', 'khuyen mai', 'affiliate', 'sponsored', 'iphone'];

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function foldText(value: string): string {
  return compactWhitespace(
    value
      .normalize('NFKC')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/đ/g, 'd'),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasTerm(text: string, term: string): boolean {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(term)}(?![\\p{L}\\p{N}-])`, 'u');
  return pattern.test(text);
}

function hasAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => hasTerm(text, term));
}

function applySynonyms(folded: string): string {
  let result = ` ${folded} `;
  const ordered = [...SYNONYMS].sort((left, right) => right[0].length - left[0].length);
  for (const [phrase, canonical] of ordered) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}-])`, 'gu');
    result = result.replace(pattern, ` ${canonical} `);
  }
  return compactWhitespace(result);
}

function tokenize(synonymized: string): string[] {
  return synonymized.split(/[^\p{L}\p{N}-]+/u).filter((token) => token.length > 0);
}

export function politicsCopySignature(text: string): string {
  return applySynonyms(foldText(text));
}

export function politicsSignificantTokens(text: string): Set<string> {
  return new Set(
    tokenize(politicsCopySignature(text)).filter(
      (token) => token.length >= 3 && !STOPWORDS.has(token) && !POLARITY_MODALITY_TOKENS.has(token),
    ),
  );
}

function detectStance(synonymized: string): ClaimStance {
  if (hasAny(synonymized, ['denies', 'deny', 'denied', 'denial', 'refute', 'refutes', 'khong'])) {
    return 'denies';
  }
  return 'supports';
}

function detectModality(synonymized: string, foldedOriginal: string): ClaimModality {
  if (hasAny(synonymized, ['established']) || hasAny(foldedOriginal, ['confirmed', 'official record established'])) {
    return 'established';
  }
  if (hasAny(synonymized, ['allegation']) || hasAny(foldedOriginal, ['allegedly', 'alleged', 'accused'])) {
    return 'alleged';
  }
  if (hasAny(synonymized, ['possible']) || hasAny(foldedOriginal, ['possibly', 'may', 'might'])) {
    return 'possible';
  }
  return 'reported';
}

function extractEntities(synonymized: string): string[] {
  return IN_SCOPE_ENTITIES.filter((entity) => hasTerm(synonymized, entity)).slice().sort();
}

function claimTokensFrom(synonymized: string, entities: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const entity of entities) {
    if (entity.includes('-') && !['prime-minister', 'chief-justice', 'secretary-general'].includes(entity)) {
      tokens.add(entity);
    } else if (
      entity === 'vietnam-parliament' ||
      entity === 'parliament' ||
      entity === 'government' ||
      entity === 'un' ||
      entity === 'nato' ||
      entity === 'tesla'
    ) {
      tokens.add(entity);
    }
  }
  for (const token of tokenize(synonymized)) {
    if (POLARITY_MODALITY_TOKENS.has(token) || STOPWORDS.has(token)) {
      continue;
    }
    if (CLAIM_CONCEPTS.has(token)) {
      tokens.add(token);
    }
    if (token === 'pham-minh-chinh' || token === 'elon-musk' || token === 'dalai-lama' || token === 'trump') {
      tokens.add(token);
    }
  }
  return [...tokens].sort();
}

function buildSemanticClaimKey(titleSyn: string, summarySyn: string, entities: readonly string[]): string {
  const fromTitle = claimTokensFrom(titleSyn, entities);
  const conceptsFromTitle = fromTitle.filter((token) => CLAIM_CONCEPTS.has(token));
  const namedFromAnywhere = claimTokensFrom(`${titleSyn} ${summarySyn}`, entities).filter(
    (token) => !CLAIM_CONCEPTS.has(token),
  );
  const tokens = conceptsFromTitle.length > 0
    ? [...new Set([...namedFromAnywhere, ...conceptsFromTitle])]
    : claimTokensFrom(`${titleSyn} ${summarySyn}`, entities);
  return [...tokens].sort().join('|');
}

function decideGeography(synonymized: string): GeographicScope {
  const vietnam = hasAny(synonymized, VIETNAM_GEO);
  const international = hasAny(synonymized, INTERNATIONAL_GEO);
  if (vietnam && international) {
    return 'mixed';
  }
  if (vietnam) {
    return 'vietnam';
  }
  if (international) {
    return 'international';
  }
  return 'international';
}

function decideCategory(synonymized: string): PoliticsCategory | undefined {
  const inScope = hasAny(synonymized, IN_SCOPE_TERMS);
  const controversy = hasAny(synonymized, CONTROVERSY_TERMS);
  if (inScope && controversy) {
    return 'leader-controversy';
  }
  const vn = hasAny(synonymized, VIETNAM_POLITICS_TERMS) && hasAny(synonymized, VIETNAM_GEO);
  const intlPolitics = hasAny(synonymized, INTERNATIONAL_POLITICS_TERMS) && hasAny(synonymized, INTERNATIONAL_GEO);
  const gold = hasAny(synonymized, GOLD_TERMS);
  if (vn) {
    return 'vietnam-politics';
  }
  if (intlPolitics && !gold) {
    return 'international-politics';
  }
  if (intlPolitics && gold) {
    const goldWithoutCentralBankUsd = hasAny(synonymized, ['gold-price', 'sjc', 'doji', 'pnj', 'xau', 'bullion']);
    const politicalIntl = hasAny(synonymized, ['nato', 'un', 'war', 'conflict', 'election', 'ukraine', 'sanction', 'britain', 'british', 'uk']);
    if (politicalIntl) {
      return 'international-politics';
    }
    if (goldWithoutCentralBankUsd || gold) {
      return 'gold-market';
    }
    return 'international-politics';
  }
  if (gold) {
    return 'gold-market';
  }
  if (intlPolitics) {
    return 'international-politics';
  }
  return undefined;
}

function isOutOfScope(folded: string, synonymized: string, category: PoliticsCategory | undefined): boolean {
  if (category) {
    return false;
  }
  const allegation = hasAny(synonymized, ['allegation', 'scandal', 'controversy']);
  const inScope = hasAny(synonymized, IN_SCOPE_TERMS);
  if (allegation && !inScope) {
    return true;
  }
  return (
    hasAny(folded, REJECT_CELEBRITY) ||
    hasAny(folded, REJECT_SPORT) ||
    hasAny(folded, REJECT_ENTERTAINMENT) ||
    hasAny(folded, REJECT_ADS)
  );
}

export class PoliticsClassificationService {
  classify(item: PoliticsSourceItem): ClassifiedPoliticsItem | undefined {
    const title = compactWhitespace(item.title.normalize('NFKC'));
    const summary = item.summary === undefined ? undefined : compactWhitespace(item.summary.normalize('NFKC'));
    const foldedTitle = foldText(title);
    const foldedSummary = foldText(summary ?? '');
    const foldedCombined = compactWhitespace(`${foldedTitle} ${foldedSummary}`);
    const titleSyn = applySynonyms(foldedTitle);
    const summarySyn = applySynonyms(foldedSummary);
    const combinedSyn = compactWhitespace(`${titleSyn} ${summarySyn}`);

    const category = decideCategory(combinedSyn);
    if (isOutOfScope(foldedCombined, combinedSyn, category) || !category) {
      return undefined;
    }

    const geographicScope = decideGeography(combinedSyn);
    const claimEntities = extractEntities(combinedSyn);
    const semanticClaimKey = buildSemanticClaimKey(titleSyn, summarySyn, claimEntities);
    const claimStance = detectStance(combinedSyn);
    const claimModality = detectModality(combinedSyn, foldedCombined);
    const claimText = title;

    return {
      ...item,
      title,
      summary,
      primaryCategory: category,
      geographicScope,
      semanticClaimKey,
      claimEntities,
      claimStance,
      claimModality,
      evidenceAssertions: [
        {
          semanticClaimKey,
          claimText,
          stance: claimStance,
          modality: claimModality,
          effect: item.evidentiaryEffect,
          kind: item.evidenceKind,
          sourceId: item.id,
          sourceUrl: item.url,
          evidenceOriginKey: item.evidenceOriginKey,
        },
      ],
    };
  }
}
