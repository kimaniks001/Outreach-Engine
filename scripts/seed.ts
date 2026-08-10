// Run via `npm run db:seed`, which passes --env-file=.env.local to Node so
// DATABASE_URL is set before any module (like src/lib/db) reads it at
// import time.
import { randomBytes } from "node:crypto";
import { db, schema } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { ROLES, type Role } from "../src/lib/rbac/roles";
import { sql } from "drizzle-orm";

// Local development seed only. Never run against a shared or production
// database — see the Phase 1 brief Section 9 and docs/DATA_CLASSIFICATION.md
// (credentials are RESTRICTED and must never be committed or reused).
//
// Every non-Owner account gets a random password printed once to the
// console. The Owner account uses SEED_OWNER_PASSWORD if set, otherwise a
// random one too. Nothing is written to a file.

function randomPassword(): string {
  return randomBytes(12).toString("base64url");
}

const DEV_USERS: Array<{ role: Role; name: string; email: string }> = [
  { role: "OWNER", name: "Dev Owner", email: "owner@dev.local" },
  { role: "GROWTH_DIRECTOR", name: "Dev Growth Director", email: "growth-director@dev.local" },
  { role: "STRATEGIST", name: "Dev Strategist", email: "strategist@dev.local" },
  { role: "CONTENT_ENGAGEMENT", name: "Dev Content & Engagement", email: "content-engagement@dev.local" },
  { role: "DISTRIBUTION_SALES", name: "Dev Distribution / Sales", email: "distribution-sales@dev.local" },
  { role: "ANALYST", name: "Dev Analyst", email: "analyst@dev.local" },
];

async function seedUsers() {
  const credentials: Array<{ email: string; role: Role; password: string }> = [];

  for (const spec of DEV_USERS) {
    const password =
      spec.role === "OWNER" && process.env.SEED_OWNER_PASSWORD
        ? process.env.SEED_OWNER_PASSWORD
        : randomPassword();
    const passwordHash = await hashPassword(password);

    await db
      .insert(schema.users)
      .values({
        email: spec.email,
        name: spec.name,
        role: spec.role,
        passwordHash,
        active: true,
      })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: { passwordHash, name: spec.name, role: spec.role, active: true },
      });

    credentials.push({ email: spec.email, role: spec.role, password });
  }

  return credentials;
}

interface ModelSeed {
  modelKey: string;
  displayName: string;
  capabilities: string[];
  approvedTaskTypes: string[];
  structuredOutputSupport: boolean;
}

const PROVIDERS: Array<{ key: string; displayName: string; models: ModelSeed[] }> = [
  {
    key: "anthropic",
    displayName: "Anthropic",
    models: [
      {
        modelKey: "anthropic-default",
        displayName: "Anthropic — default model (placeholder)",
        capabilities: ["text-generation", "structured-output"],
        approvedTaskTypes: [],
        structuredOutputSupport: true,
      },
    ],
  },
  {
    key: "openai",
    displayName: "OpenAI",
    models: [
      {
        modelKey: "openai-default",
        displayName: "OpenAI — default model (placeholder)",
        capabilities: ["text-generation", "structured-output"],
        approvedTaskTypes: [],
        structuredOutputSupport: true,
      },
    ],
  },
  {
    key: "google",
    displayName: "Google",
    models: [
      {
        modelKey: "google-default",
        displayName: "Google — default model (placeholder)",
        capabilities: ["text-generation"],
        approvedTaskTypes: [],
        structuredOutputSupport: false,
      },
    ],
  },
];

async function seedProvidersAndModels() {
  for (const provider of PROVIDERS) {
    const [row] = await db
      .insert(schema.aiProviders)
      .values({
        key: provider.key,
        displayName: provider.displayName,
        adapterImplemented: true, // stub adapter exists — see src/lib/ai/adapters
        credentialsConfigured: false, // computed live from env at read time; this is just the seed default
        enabled: false, // Owner must explicitly enable in Admin, per docs/MODEL_CONTROL_PLANE.md
        status: "NOT_CONFIGURED",
        classification: "INTERNAL",
      })
      .onConflictDoUpdate({
        target: schema.aiProviders.key,
        set: { displayName: provider.displayName, adapterImplemented: true },
      })
      .returning();

    if (!row) continue;

    for (const model of provider.models) {
      await db
        .insert(schema.aiModels)
        .values({
          providerId: row.id,
          modelKey: model.modelKey,
          displayName: model.displayName,
          enabled: false,
          approved: false,
          status: "PENDING_REVIEW",
          capabilities: model.capabilities,
          approvedTaskTypes: model.approvedTaskTypes,
          structuredOutputSupport: model.structuredOutputSupport,
          classification: "INTERNAL",
        })
        .onConflictDoUpdate({
          target: [schema.aiModels.providerId, schema.aiModels.modelKey],
          set: { displayName: model.displayName },
        });
    }
  }
}

async function seedSafeMode() {
  await db
    .insert(schema.systemSettings)
    .values({ key: "safe_mode", value: { mode: "NORMAL" } })
    .onConflictDoNothing({ target: schema.systemSettings.key });
}

async function main() {
  console.log("Seeding Outreach Engine development data...\n");

  await db.execute(sql`select 1`); // fail fast with a clear error if DB is unreachable

  const credentials = await seedUsers();
  await seedProvidersAndModels();
  await seedSafeMode();

  console.log("Development accounts created (passwords shown once, not stored anywhere):\n");
  for (const cred of credentials) {
    console.log(`  ${cred.role.padEnd(20)} ${cred.email.padEnd(32)} ${cred.password}`);
  }
  console.log(
    "\nAI providers seeded as NOT_CONFIGURED (no credentials, disabled by default) — see Admin → AI Providers."
  );
  console.log("Safe Mode initialized to NORMAL.");
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
