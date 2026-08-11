import Link from "next/link";
import { requireSection } from "@/lib/rbac/guard";
import { can, scopeFor } from "@/lib/rbac/permissions";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { listAudienceSegments } from "@/lib/audience/segments";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { NewAudienceForm } from "@/components/audience/NewAudienceForm";
import { listProfiles, sanitizeProfileForRole } from "@/lib/commercial-memory/profiles";
import { listOrganizations } from "@/lib/commercial-memory/organizations";
import { listJourneys } from "@/lib/journeys/journeys";
import { listRetentionReviewCandidates } from "@/lib/commercial-memory/retention";
import { ActionButton } from "@/components/ui/ActionButton";
import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";

const TABS = ["segments", "profiles", "organizations", "journeys", "suppression", "attribution", "retention"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  segments: "Segments",
  profiles: "Profiles",
  organizations: "Organizations",
  journeys: "Journeys",
  suppression: "Suppression",
  attribution: "Attribution",
  retention: "Retention",
};

export default async function AudiencesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireSection("AUDIENCES");
  const scope = scopeFor(user.role, "audience");
  if (scope === "none") {
    return <ForbiddenState what="Audience segments are restricted to your role." />;
  }

  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "segments";

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Audiences</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">Audience &amp; Commercial Memory</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Targeting segments (Phase 3) plus unified audience profiles, organizations, journeys,
          suppression, and attribution (Phase 4). Raw identifiers are never shown outside Owner.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.filter((t) => t !== "retention" || user.role === "OWNER").map((t) => (
          <Link
            key={t}
            href={`/audiences?tab=${t}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              tab === t ? "border-brand/40 bg-brand/15 text-brand" : "border-surface-border text-ink-muted"
            }`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      {tab === "segments" ? <SegmentsTab role={user.role} scope={scope} /> : null}
      {tab === "profiles" ? <ProfilesTab role={user.role} /> : null}
      {tab === "organizations" ? <OrganizationsTab /> : null}
      {tab === "journeys" ? <JourneysTab /> : null}
      {tab === "suppression" ? <SuppressionTab /> : null}
      {tab === "attribution" ? <AttributionTab /> : null}
      {tab === "retention" && user.role === "OWNER" ? <RetentionTab /> : null}
    </div>
  );
}

async function RetentionTab() {
  const candidates = await listRetentionReviewCandidates();

  return (
    <Card title="Retention review">
      <p className="mb-4 text-sm text-ink-muted">
        Only profiles with an explicit retentionUntil in the past are eligible — nothing is
        auto-eligible just by being old. legalHold always blocks anonymization. Anonymizing clears
        RESTRICTED identifiers but preserves lifecycle/touchpoint/conversion aggregates. Every action
        is audited; nothing is silently deleted.
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-ink-muted">No profiles are currently due for retention review.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Profile</th>
                <th className="py-2 pr-4 font-medium">Lifecycle</th>
                <th className="py-2 pr-4 font-medium">Retention until</th>
                <th className="py-2 pr-4 font-medium">Legal hold</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.profileId} className="border-b border-surface-border/60">
                  <td className="py-2 pr-4 text-ink">
                    <Link href={`/audiences/profiles/${c.profileId}`} className="hover:text-brand">{c.profileId.slice(0, 8)}</Link>
                  </td>
                  <td className="py-2 pr-4 text-ink-muted">{c.lifecycleState}</td>
                  <td className="py-2 pr-4 text-ink-muted">{c.retentionUntil.toLocaleDateString()}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={c.legalHold ? "warn" : "neutral"}>{c.legalHold ? "Held" : "None"}</Badge>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <ActionButton
                        url={`/api/retention/${c.profileId}/review`}
                        body={{ reason: "Reviewed via Audiences → Retention" }}
                        label="Mark reviewed"
                        tone="neutral"
                      />
                      {!c.legalHold ? (
                        <ActionButton
                          url={`/api/retention/${c.profileId}/anonymize`}
                          body={{ reason: "Anonymized via Audiences → Retention" }}
                          label="Anonymize"
                          tone="bad"
                          confirmMessage="This clears RESTRICTED identifiers for this profile. Aggregates are preserved. Continue?"
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function SegmentsTab({ role, scope }: { role: Parameters<typeof can>[0]; scope: string }) {
  const canCreate = can(role, "create", "audience");
  const [segments, campaigns] = await Promise.all([
    listAudienceSegments(scope === "approved" ? { status: ["APPROVED"] } : {}),
    canCreate ? listCampaigns() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex justify-end">
          <NewAudienceForm campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
      ) : null}
      <Card>
        {segments.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {scope === "approved"
              ? "No approved audience segments yet — check back once one has been reviewed."
              : "No audience segments yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Sector</th>
                  <th className="py-2 pr-4 font-medium">Geography</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr key={s.id} className="border-b border-surface-border/60">
                    <td className="py-3 pr-4 text-ink">
                      <Link href={`/audiences/${s.id}`} className="hover:text-brand">
                        {s.name}
                      </Link>
                      {s.isDemo ? (
                        <span className="ml-2">
                          <Badge tone="warn">DEMO</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">{s.sector ?? "—"}</td>
                    <td className="py-3 pr-4 text-ink-muted">{s.geography ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={s.status === "APPROVED" ? "good" : s.status === "REJECTED" ? "bad" : "neutral"}>
                        {s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

async function ProfilesTab({ role }: { role: Parameters<typeof can>[0] }) {
  const profiles = (await listProfiles()).map((p) => sanitizeProfileForRole(role, p));

  return (
    <Card title="Unified audience profiles">
      {profiles.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No profiles yet — profiles are created automatically from campaign touches and SecurePay
          product events, or manually by an Owner.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Profile</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Lifecycle</th>
                <th className="py-2 pr-4 font-medium">First seen</th>
                <th className="py-2 pr-4 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">
                    <Link href={`/audiences/profiles/${p.id}`} className="hover:text-brand">
                      {p.displayName ?? p.id.slice(0, 8)}
                    </Link>
                    {p.isDemo ? (
                      <span className="ml-2">
                        <Badge tone="warn">DEMO</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{p.profileType}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={p.lifecycleState === "SUPPRESSED" ? "bad" : p.lifecycleState === "ACTIVE" || p.lifecycleState === "HIGH_VALUE" ? "good" : "neutral"}>
                      {p.lifecycleState}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{p.firstSeenAt.toLocaleDateString()}</td>
                  <td className="py-3 pr-4 text-ink-muted">{p.lastSeenAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function OrganizationsTab() {
  const organizations = await listOrganizations();

  return (
    <Card title="Organizations">
      {organizations.length === 0 ? (
        <p className="text-sm text-ink-muted">No organizations recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Organization</th>
                <th className="py-2 pr-4 font-medium">Sector</th>
                <th className="py-2 pr-4 font-medium">Geography</th>
                <th className="py-2 pr-4 font-medium">Relationship</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((o) => (
                <tr key={o.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">
                    {o.displayName}
                    {o.isDemo ? (
                      <span className="ml-2">
                        <Badge tone="warn">DEMO</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{o.sector ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink-muted">{o.geography ?? "—"}</td>
                  <td className="py-3 pr-4">
                    <Badge tone="neutral">{o.relationshipStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function JourneysTab() {
  const journeys = await listJourneys();

  return (
    <Card title="Product journeys">
      {journeys.length === 0 ? (
        <p className="text-sm text-ink-muted">No journeys recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Journey</th>
                <th className="py-2 pr-4 font-medium">Step</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {journeys.slice(0, 100).map((j) => (
                <tr key={j.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">
                    <Link href={`/audiences/profiles/${j.profileId}`} className="hover:text-brand">
                      {j.journeyType}
                    </Link>
                    {j.isDemo ? (
                      <span className="ml-2">
                        <Badge tone="warn">DEMO</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{j.currentStep}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={j.status === "COMPLETED" ? "good" : j.status === "ABANDONED" ? "bad" : "neutral"}>
                      {j.status}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{j.lastActivityAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function SuppressionTab() {
  const rows = await db
    .select()
    .from(schema.suppressionRecords)
    .orderBy(desc(schema.suppressionRecords.createdAt))
    .limit(100);

  return (
    <Card title="Suppression history">
      <p className="mb-4 text-sm text-ink-muted">
        Suppression overrides next-best-action, retargeting, and outreach planning everywhere.
        Membership or product use is never itself marketing consent.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No suppression events recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Profile</th>
                <th className="py-2 pr-4 font-medium">Action</th>
                <th className="py-2 pr-4 font-medium">Reason</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">
                    <Link href={`/audiences/profiles/${r.profileId}`} className="hover:text-brand">
                      {r.profileId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={r.action === "APPLIED" ? "bad" : "good"}>{r.action}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{r.reason ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink-muted">{r.source}</td>
                  <td className="py-3 pr-4 text-ink-muted">{r.createdAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function AttributionTab() {
  const rows = await db
    .select()
    .from(schema.conversionEvents)
    .orderBy(desc(schema.conversionEvents.occurredAt))
    .limit(50);

  return (
    <Card title="Recent conversions">
      <p className="mb-4 text-sm text-ink-muted">
        Every conversion preserves full touch history and attribution across four models
        (first-touch, last-touch, linear, multi-touch). See a profile for its full breakdown.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No conversions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Profile</th>
                <th className="py-2 pr-4 font-medium">Conversion</th>
                <th className="py-2 pr-4 font-medium">Occurred</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">
                    <Link href={`/audiences/profiles/${c.profileId}`} className="hover:text-brand">
                      {c.profileId.slice(0, 8)}
                    </Link>
                    {c.isDemo ? (
                      <span className="ml-2">
                        <Badge tone="warn">DEMO</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone="brand">{c.conversionType}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{c.occurredAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
