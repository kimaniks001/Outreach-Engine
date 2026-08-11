import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getProfile, sanitizeProfileForRole } from "@/lib/commercial-memory/profiles";
import { getOrganization } from "@/lib/commercial-memory/organizations";
import { getConsentHistory, getSuppressionHistory, isSuppressed } from "@/lib/commercial-memory/consent";
import { listTouchpoints } from "@/lib/commercial-memory/touchpoints";
import { listJourneys } from "@/lib/journeys/journeys";
import { listConversions, getAttributionForConversion } from "@/lib/attribution/conversions";
import { getCurrentNextBestAction } from "@/lib/next-best-action/engine";
import { getCurrentRetargetingEligibility } from "@/lib/next-best-action/retargeting";

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("AUDIENCES");
  if (scopeFor(user.role, "audience") === "none") {
    return <ForbiddenState what="Profiles are restricted to your role." />;
  }

  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) notFound();

  const sanitized = sanitizeProfileForRole(user.role, profile);
  const [organization, suppressed, consentHistory, suppressionHistory, touchpoints, journeys, conversions, nextBestAction, retargeting] =
    await Promise.all([
      profile.organizationId ? getOrganization(profile.organizationId) : Promise.resolve(null),
      isSuppressed(id),
      getConsentHistory(id),
      getSuppressionHistory(id),
      listTouchpoints({ profileId: id }),
      listJourneys({ profileId: id }),
      listConversions({ profileId: id }),
      getCurrentNextBestAction(id),
      getCurrentRetargetingEligibility(id),
    ]);

  const conversionsWithAttribution = await Promise.all(
    conversions.slice(0, 10).map(async (c) => ({ conversion: c, attribution: await getAttributionForConversion(c.id) }))
  );

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">
            <Link href="/audiences?tab=profiles" className="hover:text-brand">Audiences</Link> / Profile
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">{sanitized.displayName ?? sanitized.id}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge tone="neutral">{sanitized.profileType}</Badge>
            <Badge tone={suppressed ? "bad" : sanitized.lifecycleState === "ACTIVE" || sanitized.lifecycleState === "HIGH_VALUE" ? "good" : "neutral"}>
              {sanitized.lifecycleState}
            </Badge>
            {sanitized.isDemo ? <Badge tone="warn">DEMO</Badge> : null}
          </p>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Profile">
          <dl className="space-y-2 text-sm">
            <Row label="First seen" value={sanitized.firstSeenAt.toLocaleString()} />
            <Row label="Last seen" value={sanitized.lastSeenAt.toLocaleString()} />
            <Row label="Organization" value={organization ? organization.displayName : "—"} />
            <Row label="Source" value={sanitized.source} />
            <Row label="Classification" value={sanitized.classification} />
            <Row label="Eligible channels" value={sanitized.eligibleChannels.length ? sanitized.eligibleChannels.join(", ") : "None recorded"} />
            {user.role === "OWNER" ? (
              <>
                <Row label="KSNumber reference" value={profile.ksNumberRef ?? "—"} />
                <Row label="Email reference (hashed)" value={profile.emailRef ? `${profile.emailRef.slice(0, 12)}…` : "—"} />
                <Row label="Phone reference (hashed)" value={profile.phoneRef ? `${profile.phoneRef.slice(0, 12)}…` : "—"} />
              </>
            ) : null}
          </dl>
        </Card>

        <Card title="Next-best-action">
          {nextBestAction ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone={nextBestAction.actionType === "SUPPRESS" ? "bad" : nextBestAction.actionType === "NO_ACTION" ? "neutral" : "brand"}>
                  {nextBestAction.actionType}
                </Badge>
                <Badge tone="neutral">{nextBestAction.priority}</Badge>
              </div>
              <p className="text-ink-muted">{nextBestAction.reason}</p>
              {nextBestAction.cta ? <p className="text-ink">CTA: {nextBestAction.cta}</p> : null}
              {nextBestAction.relatedProduct ? <p className="text-ink-muted">Related product: {nextBestAction.relatedProduct}</p> : null}
              {nextBestAction.blockedActions.length > 0 ? (
                <div>
                  <p className="mt-2 text-xs font-medium uppercase tracking-widest text-ink-faint">Blocked / considered</p>
                  <ul className="mt-1 space-y-1 text-ink-muted">
                    {nextBestAction.blockedActions.map((b, i) => (
                      <li key={i}>– {b}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="mt-2 text-xs text-ink-faint">
                Engine {nextBestAction.ruleEngineVersion} · generated {nextBestAction.createdAt.toLocaleString()}
                {nextBestAction.aiNarrativeUsed ? " · AI narrative appended" : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No recommendation computed yet.</p>
          )}
          {retargeting ? (
            <div className="mt-4 border-t border-surface-border pt-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Retargeting eligibility</p>
              <p className="mt-1">
                <Badge tone={retargeting.eligibility === "ELIGIBLE" ? "good" : retargeting.eligibility === "NOT_ELIGIBLE" ? "bad" : "warn"}>
                  {retargeting.eligibility}
                </Badge>
              </p>
              <p className="mt-1 text-ink-muted">{retargeting.reason}</p>
            </div>
          ) : null}
        </Card>

        <Card title="Consent & suppression">
          <p className="mb-2 text-sm">
            Suppressed: <Badge tone={suppressed ? "bad" : "good"}>{suppressed ? "Yes" : "No"}</Badge>
          </p>
          {consentHistory.length > 0 ? (
            <ul className="space-y-1 text-sm text-ink-muted">
              {consentHistory.slice(0, 5).map((c) => (
                <li key={c.id}>
                  {c.channel ?? "general"}: <Badge tone={c.status === "GRANTED" ? "good" : c.status === "DENIED" || c.status === "WITHDRAWN" ? "bad" : "neutral"}>{c.status}</Badge>{" "}
                  ({c.recordedAt.toLocaleDateString()})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No consent decisions on file.</p>
          )}
          {suppressionHistory.length > 0 ? (
            <div className="mt-3 border-t border-surface-border pt-3">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Suppression history</p>
              <ul className="mt-1 space-y-1 text-sm text-ink-muted">
                {suppressionHistory.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    {s.action} {s.reason ? `(${s.reason})` : ""} — {s.createdAt.toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card title="Product journeys">
          {journeys.length === 0 ? (
            <p className="text-sm text-ink-muted">No journeys recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {journeys.map((j) => (
                <li key={j.id} className="border-b border-surface-border/60 pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-ink">{j.journeyType}</span>
                    <Badge tone={j.status === "COMPLETED" ? "good" : j.status === "ABANDONED" ? "bad" : "neutral"}>{j.status}</Badge>
                  </div>
                  <p className="text-ink-muted">Step: {j.currentStep}</p>
                  {j.abandonmentReason ? <p className="text-ink-muted">{j.abandonmentReason}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Campaign touch history">
        {touchpoints.length === 0 ? (
          <p className="text-sm text-ink-muted">No touchpoints recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Channel</th>
                  <th className="py-2 pr-4 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {touchpoints.slice(0, 25).map((t) => (
                  <tr key={t.id} className="border-b border-surface-border/60">
                    <td className="py-2 pr-4 text-ink">{t.type}</td>
                    <td className="py-2 pr-4 text-ink-muted">{t.channel ?? "—"}</td>
                    <td className="py-2 pr-4 text-ink-muted">{t.occurredAt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Conversions & attribution">
        {conversionsWithAttribution.length === 0 ? (
          <p className="text-sm text-ink-muted">No conversions recorded.</p>
        ) : (
          <div className="space-y-4">
            {conversionsWithAttribution.map(({ conversion, attribution }) => (
              <div key={conversion.id} className="border-b border-surface-border/60 pb-3 last:border-0">
                <div className="flex items-center gap-2 text-sm">
                  <Badge tone="brand">{conversion.conversionType}</Badge>
                  <span className="text-ink-muted">{conversion.occurredAt.toLocaleString()}</span>
                </div>
                {attribution.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
                    {attribution
                      .filter((a) => a.attributionModel === "LINEAR")
                      .map((a) => (
                        <li key={a.id}>
                          {a.channel ?? "unknown channel"} — weight {Number(a.weight).toFixed(2)} ({a.rationale})
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-ink-faint">No attributable touch history (organic/direct).</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
