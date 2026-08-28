import Link from "next/link";
import { ReadinessJourney } from "@/components/readiness/ReadinessJourney";
import { ReadinessAssessment } from "@/components/readiness/ReadinessAssessment";
import { Card } from "@/components/ui/Card";
import { requireCommunityActor } from "@/lib/community/current-community-actor";
import { getReadinessAuthority, hasCurrentCredential } from "@/lib/readiness/authority";
import { resolveReadinessAuthorityConnection } from "@/lib/readiness/readiness-connection";
import {
  credentialDefinitions,
  readinessPrinciples,
} from "@/lib/readiness/foundation";
import type {
  ReadinessCredentialState,
  ReadinessProgramCode,
} from "@/lib/readiness/securepay-readiness-client";

export default async function LearnPage() {
  const actor = await requireCommunityActor();
  const authority = await getReadinessAuthority();
  const connection = await resolveReadinessAuthorityConnection();

  let livePrograms = null;
  let liveProfile = null;
  if (authority.status === "CONNECTED" && connection.status === "CONNECTED") {
    try {
      [livePrograms, liveProfile] = await Promise.all([
        connection.client.listPrograms(),
        connection.client.getProfile(),
      ]);
    } catch {
      livePrograms = null;
      liveProfile = null;
    }
  }

  const live = Boolean(livePrograms && liveProfile);
  const marketReadyCurrent = hasCurrentCredential(authority.projection, "Market Ready");

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Learn · market readiness</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">Earn the right to enter the market</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
          SecurePay market learning is meant to feel like practice, not school. You meet realistic situations, choose what you would do, see why it matters and build toward demonstrated capability.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="The gate">
          <p className="text-sm leading-6 text-ink-muted">{readinessPrinciples.gate}</p>
        </Card>
        <Card title="How learning feels">
          <p className="text-sm leading-6 text-ink-muted">{readinessPrinciples.learning}</p>
        </Card>
        <Card title="Authority right now">
          <p className="text-sm leading-6 text-ink-muted">{authority.reason}</p>
          <p className={`mt-2 text-xs font-medium uppercase tracking-wider ${live ? "text-status-good" : "text-status-warn"}`}>
            {live ? "LIVE BACKEND EVIDENCE" : "PRACTICE ONLY"}
          </p>
        </Card>
      </div>

      {live && livePrograms && liveProfile ? (
        <section className="space-y-5">
          <div className="rounded-xl border border-status-good/25 bg-status-good/5 p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-good">SecurePay authority connected</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              {liveProfile.marketReady ? "You are currently Market Ready" : "Your Market Ready gate is still open"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
              These states come from immutable SecurePay assessment and credential evidence for this signed-in identity. Outreach does not award them itself.
            </p>
            {liveProfile.marketReady && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/market-entry"
                  className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Enter the market →
                </Link>
                <p className="text-xs leading-5 text-ink-faint">
                  Market Ready makes you eligible. Plug market participation is still a separate, explicit choice.
                </p>
              </div>
            )}
          </div>

          {livePrograms.map((program) => {
            const state = credentialState(liveProfile.credentials, program.code);
            const lockedReason =
              program.code === "PROPERTY_SPECIALIST" && !marketReadyCurrent
                ? "A current Market Ready credential is required before the Property Specialist check can issue a credential."
                : undefined;
            return (
              <ReadinessAssessment
                key={`${program.code}-${program.version}`}
                program={program}
                credentialState={state}
                live
                lockedReason={lockedReason}
              />
            );
          })}
        </section>
      ) : (
        <ReadinessJourney memberName={actor.name} />
      )}

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">Credential map</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Capability is evidence, not a badge you choose for yourself</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {credentialDefinitions.map((credential) => {
            const authoritative = authority.projection?.credentials.find((item) => item.name === credential.name);
            return (
              <div key={credential.id} className="rounded-lg border border-surface-border bg-surface-raised p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{credential.name}</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {credential.kind === "READINESS" ? "Readiness credential" : `${credential.industry} specialist credential`}
                    </p>
                  </div>
                  <span className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] font-medium text-ink-faint">
                    {authoritative ? authoritative.status.replace("_", " ") : "not evidenced"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{credential.description}</p>
                <ul className="mt-3 space-y-1 text-xs leading-5 text-ink-muted">
                  {credential.evidenceRequired.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-5 text-ink-faint">{credential.currentnessNote}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="rounded-lg border border-surface-border bg-surface p-4 text-xs leading-5 text-ink-faint">
        Market readiness proves demonstrated capability only. It does not create Plug identity, staff authority, Master status, Community moderation, referral entitlement, Lifetime Share, payment authority, Payment Ready, release, settlement or financial trust.
      </div>
    </div>
  );
}

function credentialState(
  credentials: Array<{ code: ReadinessProgramCode; state: ReadinessCredentialState }>,
  code: ReadinessProgramCode
): ReadinessCredentialState {
  return credentials.find((credential) => credential.code === code)?.state ?? "NOT_EARNED";
}
