import { requireSection } from "@/lib/rbac/guard";
import { canViewAdminAudit } from "@/lib/rbac/sections";
import { ForbiddenState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { listRecentAuditEvents } from "@/lib/audit/log";

export default async function AdminAuditPage() {
  const user = await requireSection("ADMIN");
  if (!canViewAdminAudit(user.role)) {
    return <ForbiddenState what="The audit log is not visible to your role." />;
  }

  const events = await listRecentAuditEvents(100);

  return (
    <Card title="Audit log">
      <p className="mb-4 text-sm text-ink-muted">
        Append-only. Nothing here is ever edited or deleted through normal use.
      </p>
      {events.length === 0 ? (
        <p className="text-sm text-ink-muted">No audit events recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-ink-faint">
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 pr-4 font-medium">Actor</th>
                <th className="py-2 pr-4 font-medium">Target</th>
                <th className="py-2 pr-4 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-surface-border/60">
                  <td className="py-3 pr-4 text-ink">{event.eventType}</td>
                  <td className="py-3 pr-4 text-ink-muted">
                    {event.actorEmail ?? event.actorLabel ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">
                    {event.targetType ? `${event.targetType}${event.targetId ? `:${event.targetId}` : ""}` : "—"}
                  </td>
                  <td className="py-3 pr-4 text-ink-faint">
                    {event.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
