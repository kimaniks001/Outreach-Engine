"use client";

import { useEffect, useRef, useState } from "react";
import {
  customerMarketRequestChoices,
  customerRequestMeaning,
  humanRequestType,
  marketRelationshipBoundary,
} from "@/lib/market-network/customer-market-foundation";
import type {
  CustomerMarketRequest,
  CustomerMarketRequestType,
  CustomerMarketSelection,
  CustomerPlugRelationship,
  InterestedMarketCandidate,
} from "@/lib/market-network/securepay-plug-market-client";

type Props =
  | { authorityStatus: "CONNECTED"; initialRequests: CustomerMarketRequest[]; unavailableReason?: never }
  | { authorityStatus: "UNAVAILABLE"; initialRequests: []; unavailableReason: string };

class BrowserMarketError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BrowserMarketError";
  }
}

export function CustomerMarketJourney(props: Props) {
  const [requests, setRequests] = useState<CustomerMarketRequest[]>(props.initialRequests);
  const [candidates, setCandidates] = useState<Record<string, InterestedMarketCandidate[]>>({});
  const [selections, setSelections] = useState<Record<string, CustomerMarketSelection>>({});
  const [relationships, setRelationships] = useState<Record<string, CustomerPlugRelationship>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingCreateKeys = useRef<Partial<Record<CustomerMarketRequestType, string>>>({});

  useEffect(() => {
    if (props.authorityStatus !== "CONNECTED") return;
    for (const request of props.initialRequests) {
      if (request.status === "SELECTED") void hydrateSelected(request.requestId);
    }
    // Initial backend truth is intentionally hydrated once; later mutations refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.authorityStatus]);

  if (props.authorityStatus !== "CONNECTED") {
    return (
      <section className="rounded-xl border border-status-warn/25 bg-status-warn/5 p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-warn">Ask the market</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">SecurePay market authority is not connected</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{props.unavailableReason}</p>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          Outreach will not create a local request, candidate, selection or relationship to make this screen look active.
        </p>
      </section>
    );
  }

  async function refreshRequests() {
    const fresh = await fetchJson<CustomerMarketRequest[]>("/api/market-network/customer-requests/mine");
    setRequests(fresh);
    return fresh;
  }

  async function createRequest(requestType: CustomerMarketRequestType) {
    const operation = `create:${requestType}`;
    setBusy(operation);
    setNotice(null);
    const idempotencyKey =
      pendingCreateKeys.current[requestType] ?? globalThis.crypto.randomUUID();
    pendingCreateKeys.current[requestType] = idempotencyKey;
    try {
      await fetchJson<CustomerMarketRequest>("/api/market-network/customer-requests", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ requestType }),
      });
      delete pendingCreateKeys.current[requestType];
      await refreshRequests();
      setNotice("Your request is now live in the qualified market.");
    } catch (error) {
      setNotice(messageFor(error, "Your request could not be created. Try the same action again."));
    } finally {
      setBusy(null);
    }
  }

  async function loadCandidates(requestId: string) {
    setBusy(`candidates:${requestId}`);
    setNotice(null);
    try {
      const current = await fetchJson<InterestedMarketCandidate[]>(
        `/api/market-network/customer-requests/${encodeURIComponent(requestId)}/candidates`
      );
      setCandidates((previous) => ({ ...previous, [requestId]: current }));
      if (current.length === 0) setNotice("No qualified Plug has expressed interest in this request yet.");
    } catch (error) {
      await maybeRefreshAfterStateChange(error);
      setNotice(messageFor(error, "Interested candidates could not be read right now."));
    } finally {
      setBusy(null);
    }
  }

  async function selectCandidate(requestId: string, candidateRef: string) {
    setBusy(`select:${requestId}:${candidateRef}`);
    setNotice(null);
    try {
      const selection = await fetchJson<CustomerMarketSelection>(
        `/api/market-network/customer-requests/${encodeURIComponent(requestId)}/selection`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateRef }),
        }
      );
      setSelections((previous) => ({ ...previous, [requestId]: selection }));
      setCandidates((previous) => ({ ...previous, [requestId]: [] }));
      await refreshRequests();
      setNotice("SecurePay recorded your selection. This is still not a referral or payment entitlement.");
    } catch (error) {
      await maybeRefreshAfterStateChange(error);
      setNotice(messageFor(error, "That candidate could not be selected right now."));
    } finally {
      setBusy(null);
    }
  }

  async function cancelRequest(requestId: string) {
    setBusy(`cancel:${requestId}`);
    setNotice(null);
    try {
      await fetchJson<CustomerMarketRequest>(
        `/api/market-network/customer-requests/${encodeURIComponent(requestId)}/cancel`,
        { method: "POST" }
      );
      await refreshRequests();
      setNotice("Your market request has been cancelled.");
    } catch (error) {
      await maybeRefreshAfterStateChange(error);
      setNotice(messageFor(error, "This request could not be cancelled right now."));
    } finally {
      setBusy(null);
    }
  }

  async function hydrateSelected(requestId: string) {
    try {
      const selection = await fetchJson<CustomerMarketSelection>(
        `/api/market-network/customer-requests/${encodeURIComponent(requestId)}/selection`
      );
      setSelections((previous) => ({ ...previous, [requestId]: selection }));
    } catch {
      // The request card remains backend-state truthful even if detail hydration is temporarily unavailable.
    }

    try {
      const relationship = await fetchJson<CustomerPlugRelationship>(
        `/api/market-network/customer-requests/${encodeURIComponent(requestId)}/relationship`
      );
      setRelationships((previous) => ({ ...previous, [requestId]: relationship }));
    } catch (error) {
      if (!(error instanceof BrowserMarketError) || error.status !== 404) {
        // A missing relationship is the expected pre-open state. Other read failures are non-authoritative.
      }
    }
  }

  async function openRelationship(requestId: string) {
    setBusy(`relationship:${requestId}`);
    setNotice(null);
    try {
      const relationship = await fetchJson<CustomerPlugRelationship>(
        `/api/market-network/customer-requests/${encodeURIComponent(requestId)}/relationship`,
        { method: "POST" }
      );
      setRelationships((previous) => ({ ...previous, [requestId]: relationship }));
      setNotice("Your market relationship is active. Contact and money remain separately controlled by SecurePay.");
    } catch (error) {
      await maybeRefreshAfterStateChange(error);
      setNotice(messageFor(error, "The selected relationship could not be opened right now."));
    } finally {
      setBusy(null);
    }
  }

  async function maybeRefreshAfterStateChange(error: unknown) {
    if (error instanceof BrowserMarketError && (error.status === 404 || error.status === 409)) {
      try {
        await refreshRequests();
      } catch {
        // Preserve the last known backend projection; never synthesize a replacement state.
      }
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-brand/25 bg-brand/5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Ask the market</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Tell SecurePay what kind of help you need</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Choose the journey. SecurePay publishes only its own safe request description — no free text, phone, email or transaction details are sent into the market.
            </p>
          </div>
          <span className="rounded-full border border-status-good/30 bg-status-good/10 px-3 py-1 text-xs font-semibold text-status-good">
            Backend authority connected
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {customerMarketRequestChoices.map((choice) => (
            <button
              key={choice.type}
              type="button"
              disabled={busy !== null}
              onClick={() => void createRequest(choice.type)}
              className="rounded-xl border border-surface-border bg-surface-raised p-4 text-left transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-ink">{choice.label}</span>
              <span className="mt-1 block text-xs leading-5 text-ink-muted">{choice.description}</span>
              <span className="mt-3 block text-xs font-semibold text-brand">
                {busy === `create:${choice.type}` ? "Publishing…" : "Ask for help →"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-brand/20 bg-surface-raised px-4 py-3 text-sm leading-6 text-ink-muted" role="status">
          {notice}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Your help requests</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">From asking to a real market relationship</h2>
        </div>

        {requests.length === 0 ? (
          <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
            <p className="text-sm font-semibold text-ink">No market help requests yet</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              When you ask for help above, only qualified ACTIVE Plugs can see the linked opportunity through SecurePay.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const meaning = customerRequestMeaning(request.status);
              const relationship = relationships[request.requestId];
              const candidateList = candidates[request.requestId];
              const selection = selections[request.requestId];
              return (
                <article key={request.requestId} className="rounded-xl border border-surface-border bg-surface-raised p-5 md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{humanRequestType(request.requestType)}</p>
                      <h3 className="mt-1 text-lg font-semibold text-ink">{request.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{request.summary}</p>
                    </div>
                    <span className={statusClass(request.status)}>{request.status === "OPEN" ? "Open" : request.status === "SELECTED" ? "Selected" : "Cancelled"}</span>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-lg border border-surface-border bg-surface p-4 md:grid-cols-3">
                    <JourneySentence label="What happened" text={meaning.happened} />
                    <JourneySentence label="What it means" text={meaning.means} />
                    <JourneySentence label="What next" text={relationship ? "The relationship is recorded. Wait for a separately authorised contact handoff." : meaning.next} />
                  </div>

                  {request.status === "OPEN" && (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void loadCandidates(request.requestId)}
                          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy === `candidates:${request.requestId}` ? "Checking…" : `Review interested Plugs (${request.interestedCount})`}
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void cancelRequest(request.requestId)}
                          className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-ink-muted disabled:opacity-50"
                        >
                          {busy === `cancel:${request.requestId}` ? "Cancelling…" : "Cancel request"}
                        </button>
                      </div>

                      {candidateList && (
                        candidateList.length === 0 ? (
                          <p className="text-sm text-ink-muted">No current interested candidates are available.</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {candidateList.map((candidate, index) => (
                              <div key={candidate.candidateRef} className="rounded-lg border border-brand/20 bg-brand/5 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-ink">Interested Plug {index + 1}</p>
                                    <p className="mt-1 text-xs leading-5 text-ink-muted">
                                      Expressed interest {formatDateTime(candidate.interestedAt)}. SecurePay keeps identity and contact private at this stage.
                                    </p>
                                  </div>
                                  <span className="rounded-full border border-brand/20 bg-surface-raised px-2.5 py-1 text-[11px] font-semibold text-brand">Interested</span>
                                </div>
                                <button
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() => void selectCandidate(request.requestId, candidate.candidateRef)}
                                  className="mt-3 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {busy === `select:${request.requestId}:${candidate.candidateRef}` ? "Selecting…" : "Choose this Plug"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {request.status === "SELECTED" && !relationship && (
                    <div className="mt-4 rounded-lg border border-brand/20 bg-brand/5 p-4">
                      <p className="text-sm font-semibold text-ink">Your choice is recorded</p>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        {selection ? `Selected ${formatDateTime(selection.selectedAt)}. ` : ""}
                        The candidate remains private. Opening the relationship does not create referral or financial entitlement.
                      </p>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void openRelationship(request.requestId)}
                        className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busy === `relationship:${request.requestId}` ? "Opening…" : "Open this relationship"}
                      </button>
                    </div>
                  )}

                  {relationship && (
                    <div className="mt-4 rounded-lg border border-status-good/25 bg-status-good/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-status-good">Active market relationship</p>
                          <p className="mt-1 text-sm font-semibold text-ink">Recorded {formatDateTime(relationship.openedAt)}</p>
                        </div>
                        <span className="rounded-full border border-status-good/30 bg-status-good/10 px-3 py-1 text-xs font-semibold text-status-good">Active</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-ink-muted">
                        {relationship.contactExchangeAvailable
                          ? "SecurePay reports contact exchange as available, but this Outreach slice exposes no contact data."
                          : marketRelationshipBoundary.contactClosed}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 border-t border-surface-border pt-3 text-xs leading-5 text-ink-faint">
                    {marketRelationshipBoundary.explanation}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function JourneySentence({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{text}</p>
    </div>
  );
}

function statusClass(status: CustomerMarketRequest["status"]): string {
  const base = "rounded-full border px-3 py-1 text-xs font-semibold";
  if (status === "OPEN") return `${base} border-status-good/30 bg-status-good/10 text-status-good`;
  if (status === "SELECTED") return `${base} border-brand/30 bg-brand/10 text-brand`;
  return `${base} border-surface-border bg-surface text-ink-faint`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "when SecurePay recorded it";
  return date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  });
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new BrowserMarketError(body?.error ?? `Market request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
