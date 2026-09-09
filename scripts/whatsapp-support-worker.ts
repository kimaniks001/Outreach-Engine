import { processWhatsAppTriageBatch } from "../src/lib/whatsapp/triage-worker";
import { processWhatsAppOutboxBatch } from "../src/lib/whatsapp/outbox-worker";
import { recoverStaleSupportWork } from "../src/lib/whatsapp/runtime-health";

const TRIAGE_BATCH = 100;
const OUTBOX_BATCH = 200;
const MIN_IDLE_MS = 250;
const MAX_IDLE_MS = 5_000;
const RECOVERY_INTERVAL_MS = 60_000;

let stopping = false;

process.once("SIGTERM", () => { stopping = true; });
process.once("SIGINT", () => { stopping = true; });

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  requireEnv("WHATSAPP_ACCESS_TOKEN");
  requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  requireEnv("WHATSAPP_GRAPH_API_VERSION");

  let idleMs = MIN_IDLE_MS;
  let lastRecoveryAt = 0;
  console.log("WhatsApp support worker started");

  while (!stopping) {
    const now = Date.now();
    if (now - lastRecoveryAt >= RECOVERY_INTERVAL_MS) {
      const recovery = await recoverStaleSupportWork();
      lastRecoveryAt = now;
      if (recovery.reclaimedTriage > 0 || recovery.quarantinedOutbound > 0) {
        console.warn("WhatsApp support recovery", recovery);
      }
    }

    const triage = await processWhatsAppTriageBatch(TRIAGE_BATCH);
    const outbound = await processWhatsAppOutboxBatch(OUTBOX_BATCH);
    const claimed = triage.claimed + outbound.claimed;

    if (triage.failed > 0 || outbound.failed > 0) {
      console.warn("WhatsApp support worker cycle completed with failures", { triage, outbound });
    }

    if (claimed === 0) {
      await sleep(idleMs);
      idleMs = Math.min(MAX_IDLE_MS, idleMs * 2);
    } else {
      idleMs = MIN_IDLE_MS;
    }
  }

  console.log("WhatsApp support worker stopped after current cycle");
  process.exit(0);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the WhatsApp support worker`);
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("WhatsApp support worker failed", error);
  process.exit(1);
});
