import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listOrganizations, createOrganization } from "@/lib/commercial-memory/organizations";

export async function GET() {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  return NextResponse.json({ organizations: await listOrganizations() });
}

const createSchema = z.object({
  legalName: z.string().min(1),
  displayName: z.string().min(1),
  sector: z.string().optional(),
  geography: z.string().optional(),
  website: z.string().optional(),
  businessReferences: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
  isDemo: z.boolean().optional(),
});

// create on `audience` = OWNER only, per the literal grant table.
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "audience");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const organization = await createOrganization(parsed.data, user!.id);
    return NextResponse.json({ organization }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
