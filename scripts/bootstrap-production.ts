// Production-safe first-boot script. Run via `npm run db:bootstrap`
// against a freshly migrated database.
//
// Creates exactly ONE Owner account and initializes AI provider/model
// rows and Safe Mode. Never seeds demo data, never creates the 6
// predictable @dev.local accounts that `npm run db:seed` creates — that
// script is local-development-only (see scripts/seed.ts) and now refuses
// to run when NODE_ENV=production.
//
// Usage (run exactly once):
//   BOOTSTRAP_OWNER_EMAIL=you@securepay.example \
//   BOOTSTRAP_OWNER_PASSWORD='<a strong, unique password you generate yourself>' \
//   npm run db:bootstrap
//
// There is no default/fallback password — both env vars must be set
// explicitly, and neither is read from a committed file. Safe to re-run:
// it refuses to do anything once at least one OWNER account already
// exists, so it can never overwrite a production Owner's credentials.
// See docs/PRODUCTION_READINESS_REVIEW.md and docs/INITIAL_LAUNCH_RUNBOOK.md.
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { seedProvidersAndModels } from "./seed-providers";

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL;
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;

  if (!email || !password) {
    console.error(
      "BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_OWNER_PASSWORD must both be set. Refusing to run with a default or predictable Owner account."
    );
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`BOOTSTRAP_OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const existingOwners = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "OWNER"));
  if (existingOwners.length > 0) {
    console.error(
      `Refusing to run: ${existingOwners.length} OWNER account(s) already exist. This script only creates the FIRST Owner account and never modifies an existing one.`
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const [owner] = await db
    .insert(schema.users)
    .values({ email, name: "Owner", role: "OWNER", passwordHash, active: true })
    .returning();

  await seedProvidersAndModels();

  // Production default: Safe Mode ON until external integrations are
  // explicitly commissioned — see docs/PRODUCTION_READINESS_REVIEW.md
  // Section 13. Local dev's `npm run db:seed` intentionally leaves Safe
  // Mode NORMAL so the simulated-distribution demo walkthrough works
  // without an extra manual step; production must not inherit that
  // default.
  await db
    .insert(schema.systemSettings)
    .values({ key: "safe_mode", value: { mode: "SAFE_MODE" } })
    .onConflictDoNothing({ target: schema.systemSettings.key });

  console.log(`Owner account created: ${owner!.email}`);
  console.log("AI providers/models initialized (all disabled/unconfigured except Mock, which needs no credentials — Anthropic requires ANTHROPIC_API_KEY to activate).");
  console.log("Safe Mode initialized to SAFE_MODE (ON). Disable it only after explicitly commissioning external distribution/outreach.");
  console.log("No demo data was seeded.");
  console.log("\nDone. Log in as the Owner and change any operational configuration (AI budget policy, provider credentials) before wider use.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
