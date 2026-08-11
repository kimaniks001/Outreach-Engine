import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getOrganization, listOrganizationProfiles } from "@/lib/commercial-memory/organizations";
import { sanitizeProfileForRole } from "@/lib/commercial-memory/profiles";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { id } = await params;
  const organization = await getOrganization(id);
  if (!organization) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const profiles = await listOrganizationProfiles(id);
  return NextResponse.json({
    organization,
    profiles: profiles.map((p) => sanitizeProfileForRole(user!.role, p)),
  });
}
