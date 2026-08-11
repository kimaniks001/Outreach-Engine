import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function listExecutionsForPlan(distributionPlanId: string) {
  return db
    .select()
    .from(schema.distributionExecutions)
    .where(eq(schema.distributionExecutions.distributionPlanId, distributionPlanId))
    .orderBy(desc(schema.distributionExecutions.createdAt));
}

export async function listAllExecutions() {
  return db.select().from(schema.distributionExecutions).orderBy(desc(schema.distributionExecutions.createdAt));
}

export async function getExecution(id: string) {
  const rows = await db.select().from(schema.distributionExecutions).where(eq(schema.distributionExecutions.id, id)).limit(1);
  return rows[0] ?? null;
}
