# Phase 3: Distribution Provider Adapters

Status: Phase 3 — implemented
Last updated: 2026-08-11

## 1. Architecture

Per ADR-001 (third-party services are replaceable providers), no business
logic ever calls Meta/Google/etc. directly:

```
DISTRIBUTION SERVICE (src/lib/distribution/plans.ts)
   → DISTRIBUTION GATEWAY (src/lib/distribution/gateway.ts)
      → DISTRIBUTION ROUTER (src/lib/distribution/router.ts)
         → CHANNEL ADAPTER (src/lib/distribution/adapters/*)
            → EXTERNAL PROVIDER (none configured in Phase 3)
```

Verified by grep: only `router.ts` and `gateway.ts` import
`./adapters`/`./adapters/*` — no API route or service module imports an
adapter directly.

## 2. The `DistributionAdapter` Interface

`src/lib/distribution/adapters/types.ts`, mirroring
`src/lib/ai/adapters/types.ts::ProviderAdapter`'s shape exactly:

```ts
interface DistributionAdapter {
  adapterKey: string;
  channelsSupported: readonly ChannelType[];
  validateConfiguration(): ConfigurationCheck;
  launch(input: DistributionLaunchInput): Promise<DistributionLaunchResult>;
  pause(externalExecutionId: string): Promise<DistributionPauseResult>;
  status(externalExecutionId: string, context: AdapterExecutionContext): Promise<DistributionStatusResult>;
  spendSnapshot(externalExecutionId: string, context: AdapterExecutionContext): Promise<DistributionSpendSnapshot>;
  normalizeError(err: unknown): NormalizedError;
}
```

`status()`/`spendSnapshot()` take an explicit `context: { approvedBudget }`
argument rather than looking anything up from adapter-local memory — see
Section 4 for why this matters.

## 3. Registered Adapters

`src/lib/distribution/adapters/index.ts`:

| Key | File | Channels | Status |
|---|---|---|---|
| `simulated` | `simulated.ts` | all 13 channel types | `AVAILABLE` — no credentials needed |
| `google_ads` | `google-ads.ts` | `GOOGLE_SEARCH`, `GOOGLE_DISPLAY`, `YOUTUBE` | `NOT_CONFIGURED` — boundary-only stub |
| `meta_ads` | `meta-ads.ts` | `META_FACEBOOK`, `META_INSTAGRAM` | `NOT_CONFIGURED` — boundary-only stub |

`src/lib/distribution/providers.ts::listDistributionProviders()` computes
readiness by reusing `src/lib/ai/status.ts::deriveProviderStatus()` — the
exact same pure function the AI Gateway uses (`enabled && adapterImplemented
&& credentialsConfigured → AVAILABLE`, else `NOT_CONFIGURED`/`DISABLED`).
No `GOOGLE_ADS_*`/`META_ADS_*` environment variable is read anywhere in
this codebase (grep-verified) — `credentialsConfiguredFor()` hard-codes
`false` for both, so they can never falsely report `AVAILABLE`.

## 4. The Simulated Adapter: Design, a Bug, and the Fix

`src/lib/distribution/adapters/simulated.ts` is the one real implementation
this phase ships — it proves the entire execution architecture (routing,
budget guard, Safe Mode, execution records) without spending money.

**A bug was found and fixed during manual HTTP validation, not just unit
tests.** The first implementation kept an in-memory `Map` of launched
executions inside the adapter module, populated by `launch()` and read by
`pause()`/`status()`. This worked in unit tests (same process, same
module instance) but failed over real HTTP: after `POST .../launch`
succeeded, `POST .../pause` against the *same running dev server* returned
`500 — Unknown simulated execution id`. Next.js dev mode compiles API
routes on demand into separately instantiated modules the first time each
route is hit, so `launch`'s and `pause`'s copies of the `simulated.ts`
module — and therefore their `Map`s — were not the same object. The same
class of bug would be worse in a real serverless production deployment,
where consecutive requests often don't share a process at all.

**Fix**: the adapter was redesigned to be fully stateless. `launch()`
returns a synthetic `sim_<uuid>` id and no longer stores anything.
`pause()` always succeeds deterministically (the caller already validated
the execution's DB state before calling it). `status()`/`spendSnapshot()`
derive a deterministic 5–34%-of-budget spend figure purely from
`(externalExecutionId, context.approvedBudget)` — a stable hash of the id,
not remembered state — so repeated calls for the same id+budget always
agree, with no dependency on call order or process identity.
`status()` always reports `RUNNING`: the **distribution_executions DB
row**, updated only by explicit `launch()`/`pause()` calls in
`src/lib/distribution/gateway.ts`, is the sole authoritative lifecycle
state; `refreshExecutionStatus()` deliberately only updates
`reportedSpend`/`spendHistory` from the adapter, never `status`.

Re-verified after the fix, live over HTTP against a running dev server,
hitting unrelated routes in between to force separate route compilation:
launch → pause now succeeds and both the plan and execution rows correctly
show `PAUSED` (see `docs/PHASE_3_TEST_AND_VALIDATION_REPORT.md` Section 6).

**Test hook**: passing the exported constant `SIMULATE_FAILURE_MARKER` as
a plan's `cta` deterministically fails `launch()` — used by
`tests/phase3-adapter.test.ts` and `tests/phase3-db.test.ts` to exercise
the failure path without timing or randomness. It is not a value a real
user would ever submit as a CTA.

Every simulated output is tagged `isSimulated: true` on the
`distribution_executions` row and rendered with a `SIMULATED / NOT LIVE`
badge everywhere it appears in the UI — never presented as a real ad
result.

## 5. Google Ads / Meta Ads: Boundary Stubs

`google-ads.ts`/`meta-ads.ts` implement the full `DistributionAdapter`
interface so the architecture is provably extensible, but every method
beyond `validateConfiguration()` throws — there is no live execution path.
`validateConfiguration()` always returns `{ ok: false, reason:
"... not configured. No live adapter is implemented in Phase 3 —
planning only." }`. No ad-account credentials are required, requested, or
read anywhere in this codebase. If a future phase adds real credentials,
only these two files (plus an env var and `credentialsConfiguredFor()` in
`providers.ts`) need to change — no other module.

## 6. Router

`src/lib/distribution/router.ts::routeDistribution(channel, executionMode)`:
`PLAN_ONLY` never routes to any adapter; `SIMULATED` always routes to
`simulated` regardless of channel; `SANDBOX`/`LIVE` route to the
channel-mapped real adapter (`google_ads`/`meta_ads`) if one exists, which
always reports not-configured in this phase — **never silently falls back
to the simulated adapter for SANDBOX/LIVE**, which would misrepresent a
real execution mode as controlled. Channels with no live adapter mapping
(e.g. `LINKEDIN`, `TIKTOK`, `EMAIL`) simply have no `SANDBOX`/`LIVE` path
in Phase 3 — planning/`SIMULATED` only.

## 7. Gateway

`src/lib/distribution/gateway.ts` — single entry point
(`DistributionGateway.launch/pause/refreshExecutionStatus`), mirroring
`src/lib/ai/gateway.ts::execute()`'s unconditional-recording discipline:
Safe Mode is checked first, then the budget guard, then routing; every
path — success or failure — writes a `distribution_executions` row and an
audit event.
