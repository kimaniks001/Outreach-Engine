import { notFound } from "next/navigation";
import { requireSection } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getSignal } from "@/lib/intelligence/signals";
import { listEvidenceForSignal } from "@/lib/intelligence/evidence";
import { AddEvidenceForm } from "@/components/intelligence/AddEvidenceForm";
import { EvidenceReviewButtons } from "@/components/intelligence/EvidenceReviewButtons";
import { AnalyzeSignalButton } from "@/components/intelligence/AnalyzeSignalButton";

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("INTELLIGENCE");
  const scope = scopeFor(user.role, "intelligence");
  if (scope !== "raw" && scope !== "full") {
    return <ForbiddenState what="Raw market signals are restricted to your role." />;
  }

  const { id } = await params;
  const signal = await getSignal(id);
  if (!signal) notFound();

  const evidence = await listEvidenceForSignal(id);
  const canManage = scope === "full"; // OWNER only — create/approve on intelligence

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{signal.title}</h2>
              {signal.isDemo ? <Badge tone="warn">DEMO / SAMPLE</Badge> : null}
              <Badge tone={signal.status === "ANALYZED" ? "good" : "neutral"}>{signal.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{signal.summary}</p>
            <p className="mt-2 text-xs text-ink-faint">
              {signal.signalType} · captured {signal.capturedAt.toISOString().slice(0, 10)}
            </p>
          </div>
          {canManage ? <AnalyzeSignalButton signalId={signal.id} /> : null}
        </div>
      </Card>

      <Card
        title="Source evidence"
        action={canManage ? <AddEvidenceForm signalId={signal.id} /> : undefined}
      >
        {evidence.length === 0 ? (
          <div>
            <Badge tone="warn">MANUAL / UNVERIFIED</Badge>
            <p className="mt-2 text-sm text-ink-muted">
              No source evidence has been attached to this signal. It will be analyzed and scored
              as manual/unverified until evidence is added.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {evidence.map((e) => (
              <li key={e.id} className="rounded-md border border-surface-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{e.sourceName}</p>
                  <Badge
                    tone={
                      e.verificationStatus === "VERIFIED"
                        ? "good"
                        : e.verificationStatus === "REJECTED"
                          ? "bad"
                          : "neutral"
                    }
                  >
                    {e.verificationStatus}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{e.extractedClaim}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {e.sourceType} · confidence {Number(e.confidence).toFixed(2)}
                  {e.sourceReference ? ` · ${e.sourceReference}` : ""}
                </p>
                {canManage ? (
                  <div className="mt-2">
                    <EvidenceReviewButtons evidenceId={e.id} current={e.verificationStatus} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
