# ADR-003: Server-Side Authorization Is Mandatory

Status: Accepted
Date: 2026-08-10

## Context

RBAC and risk-tier gating (see
[ACCESS_CONTROL_MODEL.md](../ACCESS_CONTROL_MODEL.md) and
[AI_GOVERNANCE.md](../AI_GOVERNANCE.md)) only protect the system if they
cannot be bypassed by calling the API directly. A UI-only permission check is
not a security boundary.

## Decision

Every backend API endpoint that reads or mutates a resource category must
independently check the caller's role grants and, for HIGH-risk actions,
approval status, before acting. The UI may additionally hide controls a role
cannot use, but that is a convenience layer, not the enforcement point.

## Consequences

- Slightly more implementation work per endpoint (an explicit authorization
  check rather than relying on the UI not rendering a button).
- Closes the most common class of access-control bypass (direct API calls,
  scripted access, modified clients).
