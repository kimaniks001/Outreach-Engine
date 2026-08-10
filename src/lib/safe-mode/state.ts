import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// Matches docs/AUDIT_AND_CONTROL.md Section 4. Centralized here so future
// external-action code paths (outreach sends, publishing, paid-media spend
// — none of which exist yet, see docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md
// Non-Goals) have exactly one place to check, per that document's
// instruction not to scatter Safe Mode checks.
export const SAFE_MODE_SETTING_KEY = "safe_mode";

export type SafeModeState = "NORMAL" | "SAFE_MODE";

interface SafeModeValue {
  mode: SafeModeState;
}

export async function getSafeMode(): Promise<SafeModeState> {
  const rows = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, SAFE_MODE_SETTING_KEY))
    .limit(1);

  const row = rows[0];
  if (!row) return "NORMAL";
  const value = row.value as unknown as SafeModeValue;
  return value.mode === "SAFE_MODE" ? "SAFE_MODE" : "NORMAL";
}

// Owner-only mutation is enforced by the caller (src/lib/rbac/guard.ts
// requireOwner / src/lib/rbac/sections.ts canChangeSafeMode) — this function
// assumes authorization already happened, consistent with every other
// mutation in the data layer.
export async function setSafeMode(mode: SafeModeState, actorUserId: string): Promise<void> {
  await db
    .insert(schema.systemSettings)
    .values({
      key: SAFE_MODE_SETTING_KEY,
      value: { mode },
      updatedByUserId: actorUserId,
    })
    .onConflictDoUpdate({
      target: schema.systemSettings.key,
      set: { value: { mode }, updatedAt: new Date(), updatedByUserId: actorUserId },
    });

  await recordAuditEvent({
    eventType: "SAFE_MODE_CHANGED",
    actorUserId,
    targetType: "system_settings",
    targetId: SAFE_MODE_SETTING_KEY,
    metadata: { mode },
  });
}

// Future external-action code (outreach, publishing, paid-media spend) must
// call this before executing. Throws so callers fail closed by default.
export async function assertNotSafeMode(action: string): Promise<void> {
  const mode = await getSafeMode();
  if (mode === "SAFE_MODE") {
    throw new Error(`Action "${action}" is blocked: system is in SAFE_MODE.`);
  }
}
