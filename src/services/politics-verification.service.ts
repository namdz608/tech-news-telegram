import type { PoliticsEvent, VerificationState } from '../types/gold-politics';
import type { ClassifiedPoliticsItem, EvidenceAssertion } from '../types/gold-politics';

export interface VerificationAssessment {
  state: VerificationState;
  independentSourceIds: string[];
  corroborationNote: string;
  conflictNote?: string;
}

const STATE_RANK: Record<VerificationState, number> = {
  unverified: 0,
  reported: 1,
  confirmed: 2,
};

function matchingAssertions(event: PoliticsEvent): EvidenceAssertion[] {
  const key = event.representative.semanticClaimKey;
  return event.members.flatMap((member) =>
    member.evidenceAssertions.filter((assertion) => assertion.semanticClaimKey === key),
  );
}

function memberForAssertion(
  assertion: EvidenceAssertion,
  members: readonly ClassifiedPoliticsItem[],
): ClassifiedPoliticsItem | undefined {
  return members.find(
    (member) =>
      member.id === assertion.sourceId ||
      member.url === assertion.sourceUrl ||
      member.evidenceOriginKey === assertion.evidenceOriginKey,
  );
}

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

function identifiableOutlet(item: ClassifiedPoliticsItem): boolean {
  return (
    hasText(item.sourceName) ||
    hasText(item.author) ||
    hasText(item.originalAuthor) ||
    hasText(item.originalAccount) ||
    hasText(item.originAttribution.account)
  );
}

function identifiableAccount(item: ClassifiedPoliticsItem): boolean {
  return hasText(item.originalAccount) || hasText(item.originAttribution.account) || hasText(item.author);
}

function missingOrigin(item: ClassifiedPoliticsItem): boolean {
  return !hasText(item.originAttribution.url);
}

function isSocialClaim(kind: EvidenceAssertion['kind'], item: ClassifiedPoliticsItem | undefined): boolean {
  if (kind === 'social-claim' || kind === 'anonymous-rumor') {
    return true;
  }
  return Boolean(
    item &&
      (item.discoveryChannel === 'x' ||
        item.discoveryChannel === 'reddit' ||
        item.discoveryChannel === 'facebook' ||
        item.discoveryChannel === 'tiktok' ||
        item.discoveryChannel === 'telegram'),
  );
}

function betterState(left: VerificationState, right: VerificationState): VerificationState {
  return STATE_RANK[left] >= STATE_RANK[right] ? left : right;
}

function hasIndependentIdentifiedReport(event: PoliticsEvent, socialOriginKey: string): boolean {
  const key = event.representative.semanticClaimKey;
  return event.members.some((member) => {
    if (member.evidenceOriginKey === socialOriginKey) {
      return false;
    }
    return member.evidenceAssertions.some(
      (assertion) => assertion.semanticClaimKey === key && assertion.kind === 'identified-report',
    );
  });
}

function stateFromAssertion(
  assertion: EvidenceAssertion,
  item: ClassifiedPoliticsItem | undefined,
  event: PoliticsEvent,
): VerificationState {
  if (!item || missingOrigin(item) || assertion.kind === 'anonymous-rumor') {
    return 'unverified';
  }

  const social = isSocialClaim(assertion.kind, item);
  if (social && item.sourceTextStatus === 'incomplete') {
    return 'unverified';
  }

  if (assertion.kind === 'official-final' || assertion.kind === 'primary-document') {
    if (
      assertion.effect === 'establishes' &&
      assertion.stance === 'supports' &&
      assertion.modality === 'established'
    ) {
      return 'confirmed';
    }
    if (assertion.effect === 'denies' || assertion.stance === 'denies') {
      return 'reported';
    }
    if (assertion.effect === 'records-claim' || assertion.effect === 'mentions') {
      return assertion.effect === 'mentions' ? 'unverified' : 'reported';
    }
    return 'reported';
  }

  if (assertion.kind === 'identified-report') {
    if (
      (item.sourceTextStatus === 'full' || item.sourceTextStatus === 'search-excerpt') &&
      identifiableOutlet(item)
    ) {
      return 'reported';
    }
    return 'unverified';
  }

  if (assertion.kind === 'social-claim') {
    if (
      identifiableAccount(item) &&
      item.sourceTextStatus === 'full' &&
      hasIndependentIdentifiedReport(event, item.evidenceOriginKey)
    ) {
      return 'reported';
    }
    return 'unverified';
  }

  return 'unverified';
}

function hasConflict(assertions: readonly EvidenceAssertion[]): boolean {
  const denied = assertions.some((assertion) => assertion.stance === 'denies' || assertion.effect === 'denies');
  const supported = assertions.some((assertion) => assertion.stance === 'supports');
  return denied && supported;
}

export class PoliticsVerificationService {
  assess(event: PoliticsEvent): VerificationAssessment {
    const independentSourceIds = [...event.independentSourceIds].sort();
    const assertions = matchingAssertions(event);
    const corroborationNote =
      independentSourceIds.length >= 2 ? `Independent corroboration from ${independentSourceIds.length} sources.` : '';

    if (assertions.length === 0) {
      return {
        state: 'unverified',
        independentSourceIds,
        corroborationNote,
      };
    }

    let state: VerificationState = 'unverified';
    for (const assertion of assertions) {
      const member = memberForAssertion(assertion, event.members);
      state = betterState(state, stateFromAssertion(assertion, member, event));
    }

    const conflict = hasConflict(assertions);
    if (conflict && state === 'confirmed') {
      state = 'reported';
    }

    const assessment: VerificationAssessment = {
      state,
      independentSourceIds,
      corroborationNote,
    };
    if (conflict) {
      assessment.conflictNote = 'Conflicting accounts exist for this claim.';
    }
    return assessment;
  }
}
