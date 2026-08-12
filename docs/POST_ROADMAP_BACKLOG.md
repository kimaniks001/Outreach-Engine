# Post-Roadmap Backlog

Status: Post-roadmap — **NOT Phase 6**. This is a backlog, not a plan for
a new phase. Items here get absorbed into whatever future work picks them
up, individually, on their own merit — this list does not imply a Phase 6.
Companion to `docs/PRODUCTION_READINESS_REVIEW.md`
Last updated: 2026-08-11

Every item below is backed by a specific finding from the production
readiness review — nothing here is speculative.

## P0 — Blocks Initial Production Activation

**Empty.** All P0-class gaps found during this review were fixed directly
(see `docs/PRODUCTION_READINESS_REVIEW.md` Section 4): demo-data
contamination in Impact/Analytics/Growth Director, unsafe seed behavior
and missing production bootstrap, non-timing-safe product-event secret
comparison, missing health-check endpoint, unpinned Node version.

## P1 — Required Before Real External Distribution (Gates D/E)

- **In-app user account management.** No feature exists to create/disable/
  change the role of a user account other than a direct database write —
  a real gap for onboarding beyond the single bootstrapped Owner.
  Directly causes 1 of the 4 unreachable audit event types
  (`ROLE_CHANGED`).
- **Login rate limiting / brute-force protection.** None exists today.
  Deliberately not patched in-app during this review (an in-memory limiter
  would give false confidence in a multi-instance deployment) —
  recommended at the hosting/CDN/reverse-proxy layer first; an app-level
  shared-store limiter (e.g. backed by a real cache) is a legitimate
  future addition once a specific hosting target is chosen.
- **Google Ads live adapter.** Currently a boundary-only stub that never
  falsely reports `AVAILABLE`. Building the real adapter is genuine,
  non-trivial engineering work — see `docs/ACTIVATION_PLAN.md` Gate D for
  the full precondition list.
- **Meta Ads live adapter.** Same as above.
- **Messaging/direct-outreach adapters** (email, WhatsApp, partner
  platform, direct business outreach). No adapter code exists for any of
  these beyond the generic SIMULATED-mode passthrough every channel
  already gets. See `docs/ACTIVATION_PLAN.md` Gate E.
- **External Analytics API authentication** (API keys/OAuth). The
  internal, session-authenticated Analytics API is production-ready;
  external-client auth was deliberately deferred per ADR-007 and is real
  work when a first external consumer actually exists.

## P2 — Important Hardening

- **Dependency upgrade path.** `npm audit --production` reports 3 high
  findings, all transitive through Next.js's bundled `postcss`/`sharp`
  toolchain; the only fix path is a Next 16 major upgrade. Not performed
  in this review per the brief's instruction not to blindly upgrade major
  dependencies absent a runtime-exploitable finding — these are internal
  build/image-optimization tooling, not something this app's own routes
  expose to attacker-controlled input. Revisit when a Next 16 upgrade is
  planned for other reasons, or sooner if a runtime-exploitable path is
  found.
- **Security headers / CSP.** None set at the application level. Requires
  either a `next.config.mjs` `headers()` block or hosting/CDN-layer
  configuration, informed by the real production asset origins (not
  guessed in this review, per the brief's instruction against speculative
  CSP changes).
- **Mock AI provider UI badge.** Mock output already self-labels via a
  literal `"[MOCK]"` prefix baked into the returned text content, but
  there is no independent UI-chrome badge tied to the underlying `isMock`
  flag on `ai_usage_records`/`aiProviders`. A future change should surface
  this as an explicit visual badge wherever AI-derived narrative fields
  render, independent of the text content (so a future template edit can
  never silently drop the "[MOCK]" marker without also dropping a visual
  cue).
- **Audit metadata redaction is convention-enforced, not runtime-
  enforced.** No systematic secret-scrubber exists on the `metadata` field
  passed to `recordAuditEvent` — every current call site was inspected and
  found clean, but nothing prevents a future call site from passing a
  secret in accidentally. A lightweight allowlist/scrubber would close
  this permanently.
- **Automated retention sweep.** Retention review/anonymization exist as
  correct, audited, on-demand functions, but nothing runs them
  automatically — matches the deliberate "no scheduler infrastructure"
  architectural decision from Phase 0/5, but will need a real trigger
  (cron, queue, or hosting-platform scheduled job) once data volume makes
  manual review impractical.
- **Product-event ingestion request-body size limit.** Bounded at the
  field level (`metadata` ≤20 keys, ≤500 chars each) but has no app-level
  total request-body byte-size limit — relies on the platform/Next.js
  default. Worth an explicit limit if this endpoint becomes internet-
  facing beyond a single trusted SecurePay integration.

## P3 — Optional Enhancement

- **Stronger product-event signed-message authentication** (e.g. HMAC
  request signing instead of a static shared secret). The current
  constant-time shared-secret comparison (fixed in this review) is
  adequate for an initial controlled deployment; a signed-message scheme
  is a legitimate future hardening step, not a current requirement — the
  brief explicitly classifies this as a hardening enhancement rather than
  something to silently redesign now.
- **Additional AI providers going live** (OpenAI, Google Gemini). Adapter
  stubs already exist; making either live is real work (a real HTTP call,
  response-schema validation, error handling) mirroring what the
  Anthropic adapter already does.
- **CRM / HubSpot / Clay / n8n connectors.** Explicitly out of scope for
  the entire six-phase roadmap; no code or architecture exists for these.
- **Scheduled/cron-driven automation** for any of the on-demand sweep
  functions (recommendation generation, model-performance refresh,
  retention review, journey/profile sweeps) — currently all manually
  triggerable by design, with a documented interface a future automation
  layer could call.
- **Secure Vault / secret-manager integration** beyond hosting-platform
  protected environment variables. Not built in this review because no
  clean existing interface for one exists in the codebase — the brief
  explicitly scoped this as out of bounds absent that.
