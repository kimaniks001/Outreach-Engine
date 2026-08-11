import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ui/ActionButton";
import { whatShouldSecurePayDoNext, listCurrentRecommendations } from "@/lib/growth-director/engine";
import { listLearnings } from "@/lib/learning/learnings";

// Growth Director real operating screen — Phase 5 brief Section 34.
// Growth Director is not a sixth pillar; it supervises the five existing
// ones. Every recommendation traces back to real evidence — see
// docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md.
export default async function GrowthDirectorPage() {
  const user = await requireSection("GROWTH_DIRECTOR");

  const [items, allCurrent, learnings] = await Promise.all([
    whatShouldSecurePayDoNext(7),
    listCurrentRecommendations(),
    listLearnings({ status: "ACTIVE" }),
  ]);

  const canGenerate = can(user.role, "create", "analytics"); // OWNER only, per the literal grant table
  const canApprove = can(user.role, "approve", "campaigns"); // OWNER + GROWTH_DIRECTOR
  const canAction = user.role === "OWNER";

  const highRisk = allCurrent.filter((r) => r.riskLevel === "HIGH");
  const funnelIssues = allCurrent.filter((r) => ["REVISE_POSITIONING", "IMPROVE_ONBOARDING", "SHIFT_CHANNEL_PRIORITY"].includes(r.actionType));

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Growth Director</p>
          <h1 className="mt-1 text-xl font-semibold text-ink">What should SecurePay do next?</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Growth Director supervises Marketing, Positioning, Distribution, Impact, and Action — it
            recommends, humans approve every consequential action. Every claim below traces to real
            evidence.
          </p>
        </div>
        {canGenerate ? (
          <ActionButton
            url="/api/growth-director/recommendations"
            body={{ useAiNarrative: true }}
            label="Regenerate recommendations"
            pendingLabel="Analyzing…"
          />
        ) : null}
      </header>

      <Card title={`Top recommendations (${items.length})`}>
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">No recommendations yet — generate the first batch.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="rounded-md border border-surface-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={item.risk === "HIGH" ? "bad" : item.risk === "MEDIUM" ? "warn" : "good"}>{item.risk} risk</Badge>
                  <Badge tone="neutral">{item.confidence} confidence</Badge>
                  {item.isDemo ? <Badge tone="warn">DEMO</Badge> : null}
                  {item.pillars.map((p) => (
                    <Badge key={p} tone="brand">
                      {p}
                    </Badge>
                  ))}
                  <span className="ml-auto text-xs text-ink-faint">Status: {item.status}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-ink">{item.recommendation}</h3>
                <p className="mt-1 text-sm text-ink-muted">{item.why}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-4">
                  <div>
                    <dt className="text-ink-faint">Expected outcome</dt>
                    <dd className="text-ink">{item.expectedOutcome}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-faint">Cost</dt>
                    <dd className="text-ink">{item.costImplication ?? "None stated"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-faint">Suggested owner</dt>
                    <dd className="text-ink">{item.suggestedOwner}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-faint">Next step</dt>
                    <dd className="text-ink">{item.nextStep}</dd>
                  </div>
                </dl>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-ink-faint">Evidence</summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 text-xs text-ink-muted">
                    {JSON.stringify(item.evidence, null, 2)}
                  </pre>
                </details>
                {item.status === "PROPOSED" || item.status === "NEEDS_REVIEW" ? (
                  <div className="mt-3 flex gap-2">
                    {canApprove ? (
                      <>
                        <ActionButton url={`/api/growth-director/recommendations/${item.id}/approve`} label="Approve" tone="good" />
                        <ActionButton url={`/api/growth-director/recommendations/${item.id}/reject`} label="Reject" tone="bad" />
                      </>
                    ) : (
                      <span className="text-xs text-ink-faint">
                        Approval requires {item.risk === "HIGH" ? "OWNER" : "OWNER or GROWTH_DIRECTOR"}.
                      </span>
                    )}
                  </div>
                ) : null}
                {item.status === "APPROVED" && canAction ? (
                  <div className="mt-3">
                    <ActionButton
                      url={`/api/growth-director/recommendations/${item.id}/action`}
                      label="Prepare downstream action"
                      tone="brand"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title={`Risks / blockers (${highRisk.length})`}>
          {highRisk.length === 0 ? (
            <p className="text-sm text-ink-muted">No HIGH-risk recommendations open right now.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink-muted">
              {highRisk.map((r) => (
                <li key={r.id}>
                  <Badge tone="bad">HIGH</Badge> {r.title}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Funnel issues (${funnelIssues.length})`}>
          {funnelIssues.length === 0 ? (
            <p className="text-sm text-ink-muted">No funnel drop-off recommendations open right now.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink-muted">
              {funnelIssues.map((r) => (
                <li key={r.id}>{r.title}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Recent learnings" action={<Link href="/impact?tab=learnings" className="text-xs text-brand">View all →</Link>}>
        {learnings.length === 0 ? (
          <p className="text-sm text-ink-muted">No active commercial learnings yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {learnings.slice(0, 5).map((l) => (
              <li key={l.id} className="border-b border-surface-border/60 pb-2 last:border-0">
                <p className="text-ink">{l.conclusion}</p>
                <p className="text-xs text-ink-faint">{l.confidence} confidence · {l.learnedAt.toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-ink-faint">
        Model performance, model recommendations, and AI cost controls: see{" "}
        <Link href="/admin/cost-models" className="text-brand">
          Admin → Cost &amp; Models
        </Link>
        .
      </p>
    </div>
  );
}
