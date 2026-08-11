# Phase 2: AI Provider Integration

Status: Phase 2 — implemented
Last updated: 2026-08-11

## 1. Scope

Per the brief's Section 5, Phase 2 introduces exactly **one** real, live AI
provider (Anthropic/Claude) as proof of the Phase 1 AI Gateway abstraction,
plus a deterministic mock/test provider so the application never requires
live credentials to function. OpenAI and Google remain the non-live Phase 1
stubs — neither gained a live adapter this phase.

## 2. Setup (Environment Variable NAME Only)

```
# .env.local — never commit real values
ANTHROPIC_API_KEY=
```

That is the only setup step. With it unset, the Anthropic provider shows
`NOT_CONFIGURED` in Admin → AI Providers and the router simply never selects
it — every AI-driven feature in Phase 2 (signal analysis, Brand Guardian
enrichment, creative generation) continues to work via the mock provider
instead. No code path requires the key to exist. No real key is documented,
referenced, or committed anywhere in this repository.

Get a key from Anthropic's own console if you want to exercise the live
path locally; that step is entirely outside this codebase.

## 3. Why Plain `fetch`, Not `@anthropic-ai/sdk`

The Anthropic Messages API is a single POST endpoint with a simple JSON
contract. Adding the official SDK for one endpoint would be a dependency
for a handful of lines of code it would otherwise save — the brief's
"no over-engineering" / "no unnecessary infrastructure" principles apply
here. `src/lib/ai/adapters/anthropic.ts` calls
`https://api.anthropic.com/v1/messages` directly with `fetch`, sending the
API key only in the `x-api-key` request header (never logged, never
included in any thrown error message, never returned to the browser — this
module only ever executes server-side).

## 4. Credential Handling (docs/PHASE_2 brief Section 6, verified)

- **Server-side only.** `process.env.ANTHROPIC_API_KEY` is read in exactly
  two places: `src/lib/ai/adapters/anthropic.ts` (`hasCredentials()` and
  `execute()`) and nowhere else.
- **Never exposed to the browser.** No client component, no API response
  body, no page prop ever carries the key. `AIProvider.credentialsConfigured`
  is a boolean the registry computes by calling `hasCredentials()` — the
  key itself never leaves the adapter module.
- **Never logged.** The adapter's error path includes only the provider's
  own error message (`body.error.message`), never request headers or body.
- **Never committed.** `.env.example` lists the variable name with an empty
  value; `.gitignore` excludes `.env*` except `.env.example`.
- **Never written to a normal database table.** `ai_providers.credentials_configured`
  is a boolean column; no credential value column exists anywhere in the
  schema. See `docs/DATA_CLASSIFICATION.md` — credentials are RESTRICTED
  and this schema has nowhere to put one even by mistake.
- **UI never shows the key.** Admin → AI Providers shows
  `CONFIGURED`/`NOT_CONFIGURED` (via the `AVAILABLE`/`NOT_CONFIGURED`/
  `DISABLED`/`DEGRADED` status badge already built in Phase 1) — see
  `src/app/(dashboard)/admin/providers/page.tsx`, unchanged from Phase 1's
  design specifically because it already satisfied this requirement.

Verified in `tests/phase2-db.test.ts` ("never returns a raw credential
value, only booleans/status" — inherited from Phase 1 — and this phase's
equivalent checks) and by a manual secret scan of the full staged changeset
before commit (see `docs/PHASE_2_TEST_AND_VALIDATION_REPORT.md` Section 7).

## 5. The Mock / Test Provider

Seeded alongside Anthropic/OpenAI/Google in `scripts/seed.ts` as a fourth,
first-class provider row: `key: "mock"`, `isMock: true`,
`credentialsConfigured` always `true` (it needs none), `enabled: true` by
default. Its model (`mock-structured-v1`) is approved for every Phase 2 task
type but given a deliberately **low** quality score (0.3) so a real,
properly configured Anthropic model always outranks it in
`src/lib/ai/router.ts`'s deterministic ordering — the mock is a fallback,
never a preference, with zero special-casing required in the router itself.

`src/lib/ai/adapters/mock.ts` makes no network call and is fully
deterministic per task type: for `OPPORTUNITY_CLASSIFICATION` it echoes the
signal's own title/summary back into a clearly `[MOCK]`-labeled analysis
(and always proposes `NEEDS_DOCTRINE_REVIEW` for product mapping — it never
pretends to reason about SecurePay's product doctrine); for
`CREATIVE_IDEATION` it returns three clearly `[MOCK]`-labeled variants; for
`BRAND_REVIEW` it returns a one-line "no AI enrichment" note (irrelevant
anyway, since Brand Guardian's verdict never depends on AI — see
`docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md` Section 9).

**It is never presented as a real connection.** The `isMock` flag flows
from the database row through `src/lib/ai/types.ts`'s `AIProvider` type into
every UI surface that shows provider status, and every mock-generated
domain object is prefixed `[MOCK]` in its own text — a reviewer can never
mistake mock output for a live model's output.

## 6. Provider Status Truthfulness

Confirmed live in this environment (no `ANTHROPIC_API_KEY` set) and in
`tests/ai-gateway-phase2.test.ts`:

```
Anthropic  →  NOT_CONFIGURED   (adapter exists, no credentials, enabled=true — still correctly not AVAILABLE)
OpenAI     →  DISABLED         (unchanged from Phase 1 — stub only, never enabled by default)
Google     →  DISABLED         (unchanged from Phase 1 — stub only, never enabled by default)
Mock       →  AVAILABLE        (needs no credentials, always ready)
```

If `ANTHROPIC_API_KEY` is set and the provider is enabled (it is, by
default, in the seed data), it becomes `AVAILABLE` only after
`deriveProviderStatus()` confirms adapter + credentials + enabled all hold
— the same honest three-gate rule from Phase 1, unchanged.

## 7. Model Routing

No change to Phase 1's deterministic router. Highest `quality_score` wins,
tie-broken by lowest cost, then model key. With Anthropic unconfigured (this
environment), every Phase 2 AI task routes to the mock provider — verified
live for signal analysis, Brand Guardian enrichment, and creative
generation (`docs/PHASE_2_TEST_AND_VALIDATION_REPORT.md` Section 6). With a
real key configured, `claude-3-5-haiku-latest` (seeded quality score 0.82)
automatically outranks the mock (0.3) with zero code change required.
