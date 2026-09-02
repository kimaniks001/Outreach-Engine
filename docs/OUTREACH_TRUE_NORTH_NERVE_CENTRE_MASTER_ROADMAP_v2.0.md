# Outreach True North — Nerve Centre Master Roadmap v2.0

**Status:** LOCKED FOR EXECUTION  
**Owner:** SecurePay by Keyman  
**Product:** Outreach  
**Implementation truth:** `kimaniks001/Outreach-Engine` `main`  
**SecurePay authority truth:** `kimaniks001/SecurePayAPI`

This document supersedes `OUTREACH_ENGINE_MASTER_COMPLETION_ROADMAP_v1.0.md` as the programme-level execution roadmap. The v1 Growth/Market Network work remains valid and must be reused; v2 broadens Outreach into the operating system behind SecurePay rather than discarding what has already been built.

## True North

> **Outreach is the SecurePay Nerve Centre — the human + AI operating system that enables a fully remote team to support traders, operate SecurePay, collaborate, communicate, grow the market and continuously improve the service from anywhere in the world.**

The finished product must make four experiences true:

- **Trader:** “I ask SecurePay. I do not need to know which department handles my issue.”
- **Employee:** “I open Outreach and immediately know what needs me, who I am working with and what happens next.”
- **Manager:** “I can see whether the operation is healthy without chasing people through email, WhatsApp or calls.”
- **Team:** “We talk, decide, work, schedule, resolve and learn in one place.”

## Final seven-surface shell

1. **Today** — everything requiring me now.
2. **Conversations** — DMs, Circles, Community, case rooms and incident rooms.
3. **Work** — tasks, queues, assignments, schedules, projects and approvals.
4. **Traders** — support conversations, cases, trader context, friction and proactive assistance.
5. **Growth** — Intelligence, Campaigns, Studio, Approval, Audiences, Distribution, Engagement, Impact and Growth Director.
6. **Operations** — service health, incidents, operational queues and resolution.
7. **People** — staff, Plugs, Masters, Directors, teams, access, presence, rotations and culture.

Outreach Intelligence is horizontal across all seven surfaces; it is not an eighth silo.

## Product guardrails

### Conversation and work are connected
A conversation may create a task, case, incident, decision, approval, schedule, follow-up, project or knowledge item without forcing users to re-enter context.

### Internal operations do not depend on email
Email may remain an external/legal integration where necessary, but normal SecurePay staff coordination belongs inside Outreach.

### One trader conversation
The trader interacts with SecurePay. Internal routing is invisible to them. Do not expose department hand-offs as fragmented support experiences.

### One accountable owner
Every actionable object must converge on: **owner · queue · priority · state · due/SLA · context · conversation · history · next action**.

### AI assists; authority remains governed
AI may summarise, classify, suggest, route, schedule, cluster, draft and retrieve. It may not acquire publication, spending, legal, agreement, payment, release, settlement, financial or other authority merely because it generated a result.

### SecurePay remains authoritative
Outreach must not manufacture SecurePay identity, agreement, condition, payment-readiness, settlement, fee, Plug-attribution or financial-entitlement truth.

### Fun without becoming frivolous
Use warmth, personality, presence, reactions, recognition, celebrations, Community and gentle interaction. Serious money, disputes, incidents and compliance states remain calm and truthful.

### Complex operation, simple screen
Progressive disclosure is mandatory. A feature that works technically but feels confusing, generic, crowded or visually inconsistent is not complete.

## Visual DNA

Outreach belongs to the SecurePay product family. Use SecurePayUI as the visual DNA reference while keeping Outreach’s own information architecture.

Locked traits:

- warm paper/off-white working surfaces
- forest green as trust/action anchor
- restrained clay/orange for attention and warmth
- Fraunces-style display typography for human headlines
- clear sans-serif working typography
- generous whitespace
- soft borders and rounded working cards
- meaningful hierarchy rather than dashboard density
- quiet motion with reduced-motion support
- SecurePay living-mark/orbit language used consistently and sparingly
- premium, human, Kenyan-market-realistic, Quiet Trust tone

No generic dark admin-dashboard regression.

## Reuse rule

Do **not** rebuild working capabilities merely to fit the new navigation. Reuse and integrate:

- authentication
- RBAC
- audit
- AI provider/model architecture
- Intelligence
- Campaigns
- Studio
- approval/provenance
- Asset Library
- Audiences
- Distribution
- Engagement
- Impact
- Growth Director
- Community LIVE foundations
- Market Network foundations
- SecurePay authority integrations

The Nerve Centre wraps these capabilities in a coherent operating system.

---

# Execution phases

## Phase 1 — Nerve Centre Shell + Today

**Goal:** Turn Outreach into the place a staff member starts and ends the working day.

Build:
- seven-surface responsive shell
- SecurePay visual DNA adoption
- Today personal attention view
- real authorised work counts only
- system readiness demoted to a quiet pulse
- existing Growth rooms preserved and reachable
- launchpads for later surfaces without fake functionality

**Acceptance gate:** A staff member signs in and within 10 seconds understands what needs attention and where the major operating surfaces live.

## Phase 2 — Conversations + Circles + Community

**Goal:** Remove dependence on internal email/WhatsApp for normal team communication.

Build:
- one-to-one DMs
- small groups
- staff/department Circles
- company Community
- mentions, replies, reactions, attachments, pinned context, search and unread state
- message-to-task/case/incident/schedule/approval actions
- privacy separation between staff/private, trader and market/community conversations

**Acceptance gate:** A distributed SecurePay team can run an ordinary working day without internal email or WhatsApp.

## Phase 3 — Work Engine

**Goal:** Make Outreach understand responsibility.

Build:
- universal work item
- tasks
- queues
- assignees/collaborators
- priorities
- statuses
- due dates and SLAs
- dependencies
- schedules and recurring work
- routing by capability/role/workload/availability/timezone/language/urgency
- audit/history

**Acceptance gate:** No operational responsibility needs to live only in someone’s memory.

## Phase 4 — Trader Support + Cases

**Goal:** Build Ask SecurePay and remove the conventional call-centre model.

Build:
- one trader-facing support conversation
- safe SecurePay-context retrieval
- AI answer when authoritative truth is enough
- guided allowed action
- human escalation without conversation loss
- case lifecycle
- internal case room
- ownership, queue, SLA and history
- trader-friction aggregation

**Acceptance gate:** A trader can receive complete support without knowing SecurePay’s internal organisation or needing a call centre.

## Phase 5 — Operations + Incident Command

**Goal:** Make Outreach the operational nervous system of SecurePay.

Build:
- operator-friendly service health
- incident detection proposals
- incident lifecycle
- severity, commander, responders and chronology
- affected service/traders/cases
- internal incident room
- external communication state
- resolution propagation
- root cause and prevention actions

**Acceptance gate:** A significant disruption can be detected, coordinated and communicated without assembling staff by phone or WhatsApp.

## Phase 6 — Remote Team Operating System

**Goal:** Make SecurePay genuinely operable 100% remotely.

Build:
- presence and availability
- timezone/working hours
- shifts and coverage
- handover
- follow-the-sun routing
- rotations and on-duty responsibilities
- department operating spaces

**Acceptance gate:** Work crosses timezones without losing ownership or context.

## Phase 7 — People, Culture + Organisational Life

**Goal:** Make remote work feel like belonging rather than isolation.

Build:
- useful work profiles
- skills and responsibilities
- team/department views
- recognition
- milestones and celebrations
- community rituals
- role-specific Staff, Plug, Master, Director and Investor experiences

**Acceptance gate:** People can understand the organisation, who can help and where they belong without creating vanity-social mechanics.

## Phase 8 — Outreach Intelligence

**Goal:** Make AI the organisational copilot.

Build:
- universal command box
- personal “what needs me?” assistance
- conversation/case/incident/project summarisation
- classification and routing suggestions
- similar-case detection
- emerging-pattern detection
- action extraction
- organisational memory
- evidence-grounded recommendations

**Acceptance gate:** Routine coordination is substantially faster without AI acquiring unauthorised authority.

## Phase 9 — Growth + Market Network Integration

**Goal:** Connect the already-built commercial brain to the Nerve Centre.

Build:
- Today/Conversation/Work links from Growth objects
- trader-friction → insight → campaign/product loop
- full Market Network relationship journey as SecurePay backend authority permits
- preserve separation between opportunity/relationship/referral/financial entitlement
- complete agreement-level Plug attribution integration only from backend truth

**Acceptance gate:** Growth participates in the same organisational nervous system rather than functioning as a separate application.

## Phase 10 — Production Closure + World-Class Experience

**Goal:** Prove the complete product is launch-ready, coherent, delightful and trustworthy.

Build/test:
- complete journeys for trader, support, payments ops, Plug, Master, Marketing, Compliance, Director, admin and investor
- remote-work full-day simulation
- responsive/mobile closure
- accessibility
- empty/loading/error/offline/degraded states
- performance budgets
- privacy/security/retention review
- visual consistency review
- deployment/runbook/launch closure

**Acceptance gate:** Function + authority + security + visual quality + usability + remote-team simulation all pass.

---

# Definition of Done for every phase

A phase is not complete merely because code exists. It must satisfy all applicable items:

1. scoped implementation is complete
2. existing working functionality is preserved unless deliberately replaced
3. authority boundaries are explicit and fail closed
4. privacy boundaries are tested
5. automated tests are added/updated
6. lint/typecheck/build/tests are green, or an external infrastructure failure is clearly distinguished from an application failure
7. responsive/mobile experience is reviewed
8. visual quality matches SecurePay DNA
9. empty/loading/error/permission states are intentional
10. audit/history is present for consequential work
11. completion report is committed
12. PR is reviewed and merged according to that repository’s governance
13. next phase starts from updated `main`

## Autonomous execution contract

Once this roadmap is authorised, engineering should proceed phase-by-phase without asking for routine implementation choices.

### Do not stop for
- ordinary component/layout choices within this roadmap
- naming of internal implementation helpers
- routine bug fixes
- test repairs
- refactors required to complete an authorised phase
- ordinary PR/merge work when repository policy permits autonomous merge
- visual polish consistent with SecurePay DNA

### Stop only for
- a genuine new product/doctrine decision not answered here or by existing authority documents
- a financial/agreement/referral/identity authority ambiguity that must not be invented
- a material privacy/legal/compliance choice requiring human judgement
- destructive or irreversible production action outside established authority
- missing external credentials/access that blocks the authorised implementation
- repository policy requiring a human merge/review gate
- programme completion

## Final True North test

Outreach is complete when a remote SecurePay team can operate for a week from different homes/countries with internal email, WhatsApp and a physical office removed from the operating model, while still being able to:

- communicate
- collaborate
- know who is available
- assign and schedule work
- support traders
- handle operational/payment issues
- manage incidents
- make and record decisions
- approve governed work
- run Growth
- support Plugs/Masters
- hand over shifts
- see organisational health
- learn from trader problems
- improve the service
- celebrate wins

and the trader simply experiences:

> **SecurePay is there when I need it.**
