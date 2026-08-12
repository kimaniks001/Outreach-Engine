# Initial Launch Runbook

Status: Post-roadmap — **NOT Phase 6**
Companion to `docs/PRODUCTION_READINESS_REVIEW.md`
Last updated: 2026-08-11

## Part 1 — Production Bootstrap (once, before any real use)

1. Provision hosting and a managed PostgreSQL instance with automated
   backups (`docs/PRODUCTION_ENVIRONMENT_REQUIREMENTS.md`).
2. Set `DATABASE_URL` and `SESSION_SECRET` (generate the latter with
   `openssl rand -base64 32`) as protected environment variables on the
   hosting platform.
3. Deploy the application (`npm install && npm run build`).
4. Run `npm run db:migrate:production`. Confirm `Migrations complete.`
5. Set `BOOTSTRAP_OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD` (a strong,
   unique password — generate it with a password manager, not by hand)
   and run `npm run db:bootstrap` **once**. Confirm the output shows:
   - `Owner account created: <email>`
   - `Safe Mode initialized to SAFE_MODE (ON).`
   - `No demo data was seeded.`
6. Remove `BOOTSTRAP_OWNER_EMAIL`/`BOOTSTRAP_OWNER_PASSWORD` from the
   environment (they are only needed for this one run; the script also
   refuses to run again once an Owner exists, so leaving them set is
   low-risk but unnecessary).
7. Log in as the Owner at `/login`. Confirm the dashboard loads and Safe
   Mode shows `SAFE_MODE` (Admin → Safe Mode).
8. Hit `GET /api/health` (no login required) and confirm `status: "OK"`,
   `database: "REACHABLE"`.
9. **Do not run `npm run db:seed` against this database, ever.** It
   refuses to run when `NODE_ENV=production`, but should never be invoked
   here regardless — it is a local-development tool.
10. (Optional, Gate C) Set `ANTHROPIC_API_KEY` and configure at least one
    AI budget policy via the Admin → AI Budget page before expecting real
    AI output — the app remains fully functional without this step.
11. (Optional, Gate B) Coordinate `PRODUCT_EVENT_INGESTION_SECRET` with
    SecurePay's engineering team — see `docs/SECUREPAY_EVENT_ACTIVATION.md`.

At this point the system is in the state certified by
`docs/PRODUCTION_READINESS_REVIEW.md`: one Owner account, zero demo data,
Safe Mode on, ready for real internal use.

## Part 2 — Onboarding Additional Users

There is no in-app account-management feature yet (a documented,
non-blocking limitation — see `docs/PRODUCTION_READINESS_REVIEW.md`
Section 10). To add a Growth Director, Strategist, Content & Engagement,
Distribution/Sales, or Analyst account today, the Owner must insert a row
directly into the `users` table (bcrypt-hash the password first — do not
insert plaintext). This is a manual, low-frequency operation appropriate
for initial launch; an in-app feature for this is tracked in
`docs/POST_ROADMAP_BACKLOG.md` (P1).

## Part 3 — First Real Campaign (no live paid advertising required)

A realistic first activation sequence that proves the whole system works
end to end without spending real advertising money or sending real bulk
outreach:

1. Log in as Owner.
2. Confirm Safe Mode is `SAFE_MODE` — deliberately leave it on for this
   first walkthrough (every step below works with Safe Mode on except the
   simulated-launch step, which needs it off).
3. Add a real market signal manually (Intelligence → Signals → New),
   describing an actual observed SecurePay-relevant problem.
4. Attach real source evidence to that signal (a URL, a document
   reference, a direct observation) — do not leave it evidence-free the
   way the local-dev demo signal deliberately does.
5. Analyze the signal into an opportunity (Intelligence → Analyze).
6. Review and approve the opportunity.
7. Create a campaign from the approved opportunity.
8. Run Brand Guardian on the campaign and confirm a `PASS` (or resolve any
   `REVISE`/`BLOCK` finding first — it is a real, deterministic doctrine
   check, not a formality).
9. Generate or adapt creative for the campaign.
10. Review and approve the campaign (moves it to
    `READY_FOR_DISTRIBUTION`).
11. Create an audience segment for the campaign; review and approve it.
12. Create a distribution plan in `PLAN_ONLY` or `SIMULATED` execution
    mode. If using `SIMULATED`, temporarily switch Safe Mode to `NORMAL`
    to launch it, then switch it back to `SAFE_MODE`.
13. (Optional) Ingest a small number of real SecurePay product events from
    a controlled test account, once Gate B (`docs/SECUREPAY_EVENT_ACTIVATION.md`)
    is open — or continue using the built-in simulator
    (`POST /api/product-events/simulate`) for a fully offline walkthrough.
14. Inspect the resulting attribution and funnel data on the Impact
    dashboard — confirm it reflects only this real activity (demo data is
    excluded by default, per `docs/PRODUCTION_READINESS_REVIEW.md`
    Section 4.1).
15. Ask the Growth Director: **"What should SecurePay do next?"**
    (Growth Director → Recommendations) and review the ranked, evidence-
    backed output.

No step above requires `ANTHROPIC_API_KEY`, live Google/Meta credentials,
or a real SecurePay connection — every one of them works with only what
Gate A provides.
