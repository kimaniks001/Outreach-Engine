# True North Phase 10 — Production Closure

Status: **CODE + CI LAUNCH READY; production activation requires operator setup**

This closes the ten-phase Nerve Centre roadmap without claiming that a passing repository has already been deployed. Production activation remains an explicit operator event.

## Journey closure

| Experience | Proven route / authority | Launch classification |
|---|---|---|
| Trader support | Traders → case room → privacy-limited SecurePay support context → Work | Ready when SecurePay URL/token and `SUPPORT_CONTEXT_READ` are assigned |
| Payments operations | Operations → signal → incident → responder/chronology/communication evidence | Ready; never changes payment or release truth |
| Plug | Community/Market Entry/Opportunities/My Market | Ready when caller-scoped SecurePay Market APIs are reachable; fails closed otherwise |
| Master | People experience context + governed Community capability | Controlled limitation: no Master status is inferred locally |
| Marketing | Growth → intelligence → campaign → Studio → approvals → distribution → impact | Ready for planning/simulation; live distribution remains separately authorised |
| Compliance | Approval Desk, doctrine/brand gates, audit evidence | Ready within existing RBAC; no automated compliance authority |
| Director/admin | Today, Copilot, Growth Director, Operations, People and Admin controls | Ready with production bootstrap and individual accounts |
| Investor | People experience context and measured Impact | Controlled limitation: context only; no equity/financial entitlement model |

## Full-day remote operating proof

The automated suites exercise: personal attention → conversation action extraction → owned/routed work → trader case → privacy-limited SecurePay projection → incident coordination → timezone coverage/handover → organisational profile/recognition → grounded copilot brief → friction-to-Growth loop. Phase-specific invariants prevent responsibility loss and authority collapse.

## Experience and resilience

- Responsive layouts use mobile-first breakpoints across the seven core surfaces.
- A keyboard-visible skip link and labelled main landmark are present.
- Reduced-motion preference disables ambient motion.
- Dashboard loading, safe error recovery and offline/degraded notices are explicit.
- Mock AI is labelled in its content and stored briefs; unavailable backend authority fails closed.
- CI enforces a 3 MiB shared-client-JavaScript ceiling after the production build.

## Privacy, security and retention

- RBAC and participant visibility constrain internal objects.
- SecurePay tokens remain server-side; support and Market Network projections are caller-scoped.
- AI briefs persist source references and usage evidence; suggestions have no execution authority.
- Audience retention supports review, legal hold and audited anonymisation; no indiscriminate purge is introduced.
- Security headers deny framing, MIME sniffing, camera/microphone/geolocation and cross-origin opener sharing.
- CSP remains a deployment-specific gate because allowed external origins must be known before safely locking policy.

## Activation gates that code cannot satisfy

1. Provision managed PostgreSQL, backups and a deployment target.
2. Set protected `DATABASE_URL` and a strong `SESSION_SECRET`.
3. Run production migrations and one-time Owner bootstrap; verify Safe Mode starts ON.
4. Assign individual staff accounts and least-privilege roles.
5. Configure SecurePay API base URL/server token and narrowly assign backend permissions where those integrations are intended.
6. Configure real AI credentials and budgets only if real synthesis is desired; the app remains usable with the clearly labelled mock path.
7. Configure hosting rate limits, TLS, monitoring/alerts and a CSP matching the final deployed origins.
8. Run the launch smoke journey on the deployed environment and record rollback ownership.

Until these operator gates are completed, classification is **launch-ready repository, not activated production**.
