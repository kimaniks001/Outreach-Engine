import type {
  CustomerMarketRequest,
  InterestedMarketCandidate,
} from "./securepay-plug-market-client";

export const CANDIDATE_PAGE_SIZE = 50;

export interface CandidatePageState {
  items: InterestedMarketCandidate[];
  nextOffset: number;
  hasMore: boolean;
}

export function upsertCustomerRequest(
  requests: CustomerMarketRequest[],
  request: CustomerMarketRequest
): CustomerMarketRequest[] {
  const existingIndex = requests.findIndex((item) => item.requestId === request.requestId);
  if (existingIndex === -1) return [request, ...requests];

  return requests.map((item, index) => (index === existingIndex ? request : item));
}

export function mergeCandidatePage(
  previous: CandidatePageState | undefined,
  incoming: InterestedMarketCandidate[],
  offset: number,
  totalInterested: number
): CandidatePageState {
  const base = offset === 0 ? [] : previous?.items ?? [];
  const byReference = new Map(base.map((candidate) => [candidate.candidateRef, candidate]));
  for (const candidate of incoming) byReference.set(candidate.candidateRef, candidate);

  const items = [...byReference.values()];
  const nextOffset = offset + incoming.length;

  return {
    items,
    nextOffset,
    hasMore:
      incoming.length === CANDIDATE_PAGE_SIZE &&
      nextOffset < Math.max(totalInterested, nextOffset),
  };
}
